import {createHash} from 'node:crypto';
import {TaskRegistry} from './core.js';
import {createWorkOrder,proposeDelegation} from './chief-of-staff.js';
import {DEFAULT_OWNER,parseRepoTarget} from './github.js';
import {githubSourceInspection} from './github-source-inspection.js';
import {findLatestSuccessfulCiRun} from './github-ci-run-verification.js';
import {validateGithubPatchProposal} from './github-patch-proposal.js';
import {githubPatchPreflight} from './github-patch-preflight.js';
import {executeGithubPatchProposal} from './github-patch-executor.js';
import {recommendSkillsForMission,loadSkills,buildSkillObservations} from './skill-resolver.js';

const sha256=text=>createHash('sha256').update(text,'utf8').digest('hex');

export async function runOrchestratedMission(mission,{
 fetchImpl=fetch,
 token=process.env.GITHUB_TOKEN,
 owner=DEFAULT_OWNER,
 localSkillsDir='',
 skillRef='main',
 verifyChanges=null,
 publishDraftPr=false,
 authorized=false,
 onEvent=async()=>{},
 maxFiles=10,
 maxPatchBytes=80000,
 maxSourceBytes=100000
}={}){
 if(!mission||typeof mission!=='object'||Array.isArray(mission))throw new Error('Invalid mission specification');
 if(!Array.isArray(mission.changes)||mission.changes.length<1||mission.changes.length>maxFiles)
  throw new Error('Mission requires 1 to '+maxFiles+' file changes');
 if(typeof verifyChanges!=='function')throw new Error('Executable verification callback required before patching');

 const allowlistedRepos=[mission.targetRepo,...(Array.isArray(mission.allowlistedRepos)?mission.allowlistedRepos:[])];
 const target=parseRepoTarget(mission.targetRepo,{owner,allowlistedRepos});
 const filePaths=mission.changes.map(c=>c?.path).filter(Boolean);
 const recommended=recommendSkillsForMission({type:mission.type||'bug',description:mission.description||'',filePaths});
 const requestedSkills=Array.isArray(mission.skills)&&mission.skills.length>0
  ?[...new Set([...mission.skills,...recommended])].slice(0,12)
  :recommended.slice(0,12);

 const order=createWorkOrder({
  id:mission.id||'MISSION_'+Date.now(),
  projectId:mission.projectId||target.repo,
  title:mission.title,
  description:mission.description,
  priority:mission.priority||'high',
  type:mission.type||'bug',
  acceptanceCriteria:mission.acceptanceCriteria,
  targetRepo:target.fullName,
  skills:requestedSkills
 });
 const roles=Array.isArray(mission.roles)&&mission.roles.length>0?mission.roles:['architecture','backend','testing','security','quality'];
 const delegation=proposeDelegation(order,roles,{skills:requestedSkills});
 const registry=new TaskRegistry();

 async function emit(phase,agentId,status){
  const ev=registry.add({taskId:order.id+':'+phase,agentId,status});
  await onEvent(ev);
 }

 // Phase 1: Active HAK Skill loading & observation recording
 await emit('skills','orchestrator','queued');
 await emit('skills','orchestrator','running');
 let loadedSkills;
 try{
  loadedSkills=await loadSkills(requestedSkills,{localSkillsDir,fetchImpl,token,owner:target.owner,ref:skillRef});
  await emit('skills','orchestrator','passed');
 }catch(err){
  await emit('skills','orchestrator','failed');
  throw err;
 }
 const observations=buildSkillObservations(loadedSkills,order.title,mission.rationale||order.description.slice(0,500));

 // Phase 2: Target repository HEAD, green CI run, and source blob SHA lock
 await emit('inspect','architecture','queued');
 await emit('inspect','architecture','running');
 let baseSha=mission.baseSha||null;
 let runId=mission.runId||null;
 let inspection;
 try{
  const headers={Accept:'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
  if(token)headers.Authorization='Bearer '+token;
  if(!baseSha){
   const refRes=await fetchImpl('https://api.github.com/repos/'+target.owner+'/'+target.repo+'/git/ref/heads/main',{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!refRes.ok)throw new Error('GitHub HTTP '+refRes.status+' reading main ref');
   const refJson=await refRes.json();
   baseSha=refJson?.object?.sha||null;
  }
  if(typeof baseSha!=='string'||!/^[a-f0-9]{40}$/.test(baseSha))throw new Error('Could not resolve immutable 40-char main SHA');
  if(!runId){
   const latestCi=await findLatestSuccessfulCiRun(target.fullName,baseSha,{fetchImpl,token,owner:target.owner,allowlistedRepos});
   runId=latestCi.runId;
  }
  inspection=await githubSourceInspection(target.fullName,baseSha,filePaths,{fetchImpl,token,owner:target.owner,allowlistedRepos,maxBytes:maxSourceBytes});
  await emit('inspect','architecture','passed');
 }catch(err){
  await emit('inspect','architecture','failed');
  throw err;
 }

 const resolvedChanges=mission.changes.map(change=>{
  const inspected=inspection.files.find(f=>f.path===change.path);
  if(change.createNew===true){
   if(inspected?.status!=='not-found')throw new Error('Cannot create new file over existing path: '+change.path);
   return {path:change.path,expectedBlobSha:null,createNew:true,newContent:change.newContent};
  }
  if(!inspected||inspected.status!=='available'||!inspected.blobSha)
   throw new Error('Existing target file unavailable for inspection: '+change.path+' ('+(inspected?.status||'missing')+')');
  if(change.expectedBlobSha&&change.expectedBlobSha!==inspected.blobSha)
   throw new Error('Expected blob SHA mismatch for '+change.path);
  return {path:change.path,expectedBlobSha:inspected.blobSha,newContent:change.newContent};
 });

 // Phase 3: Mandatory executable test/quality verification BEFORE preflight or GitHub write
 await emit('verify','testing','queued');
 await emit('verify','testing','running');
 let verificationResult;
 try{
  verificationResult=await verifyChanges({
   workOrder:order,
   target,
   baseSha,
   skills:loadedSkills,
   changes:resolvedChanges
  });
  if(!verificationResult||verificationResult.passed!==true)
   throw new Error('Verification suite did not pass: '+(verificationResult?.summary||'rejected'));
  await emit('verify','testing','passed');
 }catch(err){
  await emit('verify','testing','failed');
  throw err;
 }

 // Phase 4: Proposal validation & GitHub preflight
 await emit('preflight','security','queued');
 await emit('preflight','security','running');
 const proposalInput={
  repository:target.fullName,
  runId,
  baseSha,
  rationale:mission.rationale,
  changes:resolvedChanges
 };
 let validatedProposal;
 let preflight;
 try{
  validatedProposal=validateGithubPatchProposal(proposalInput,{owner:target.owner,allowlistedRepos,maxFiles,maxPatchBytes});
  preflight=await githubPatchPreflight(proposalInput,{fetchImpl,token,owner:target.owner,allowlistedRepos,maxFiles,maxPatchBytes,maxSourceBytes});
  if(!preflight.allPreconditionsMatch)throw new Error('GitHub preflight preconditions failed');
  await emit('preflight','security','passed');
 }catch(err){
  await emit('preflight','security','failed');
  throw err;
 }

 // Phase 5: Optional authorized atomic branch & Draft PR publication (never auto-merged)
 let publication=null;
 if(publishDraftPr===true){
  await emit('publish','release','queued');
  await emit('publish','release','running');
  try{
   const skillTable=loadedSkills.map(s=>`- \`${s.name}\` (sha256: \`${s.sha256.slice(0,12)}\`)`).join('\n');
   const verifySummary=typeof verificationResult.summary==='string'?verificationResult.summary.slice(0,1500):'Passed local verification suite';
   const prBodyExtra=[
    '### HAK AI Agent Control Center — Orchestrated Mission Evidence',
    `- **Work Order:** \`${order.id}\` (${order.type}, priority: ${order.priority})`,
    `- **Roles Delegated:** ${delegation.roles.join(', ')}`,
    '- **Active HAK Skills Applied:**\n'+skillTable,
    `- **Pre-PR Verification:** ${verifySummary}`,
    '- **Merge Policy:** Draft PR only (`readyToMerge: false`); human review + GitHub Actions CI required.'
   ].join('\n');
   publication=await executeGithubPatchProposal(proposalInput,{
    branch:mission.branch,
    authorized,
    fetchImpl,
    token,
    owner:target.owner,
    allowlistedRepos,
    maxFiles,
    maxPatchBytes,
    maxSourceBytes,
    prBodyExtra
   });
   await emit('publish','release','passed');
  }catch(err){
   await emit('publish','release','failed');
   throw err;
  }
 }

 const changeDigests=resolvedChanges.map(c=>({
  path:c.path,
  createNew:c.createNew===true,
  expectedBlobSha:c.expectedBlobSha,
  newContentSha256:sha256(c.newContent),
  bytes:Buffer.byteLength(c.newContent,'utf8')
 }));

 const coreReport={
  schemaVersion:1,
  kind:'hak-orchestrated-mission-report',
  workOrderId:order.id,
  targetRepository:target.fullName,
  baseSha,
  verifiedCiRunId:runId,
  delegation:{roles:delegation.roles,skills:delegation.skills},
  loadedSkills:loadedSkills.map(s=>({name:s.name,sha256:s.sha256,source:s.source})),
  skillObservations:observations,
  verification:{passed:true,summary:String(verificationResult.summary||'passed').slice(0,500)},
  preflight:{allPreconditionsMatch:preflight.allPreconditionsMatch,fileCount:preflight.files.length},
  changes:changeDigests,
  observerEvents:registry.list(),
  draftPrPublished:Boolean(publication),
  publication:publication?{
   branch:publication.branch,
   commitSha:publication.commitSha,
   prNumber:publication.prNumber,
   prUrl:publication.prUrl,
   draft:true,
   requiresHumanReview:true,
   readyToMerge:false
  }:null,
  readyToMerge:false,
  readyForProduction:false
 };
 return {...coreReport,reportSha256:sha256(JSON.stringify(coreReport))};
}
