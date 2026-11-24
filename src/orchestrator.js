import {parseTargetRepo} from './github.js';
import {githubSourceInspection} from './github-source-inspection.js';
import {githubFailedJobTriage} from './github-ci-triage.js';
import {validateGithubPatchProposal} from './github-patch-proposal.js';
import {discoverAllSkills,fetchGithubSkill,findSkills,auditSkillSafety} from './skills-registry.js';

export function extractPatchProposalFromText(text,{repository,runId,baseSha,rationale,allowAnyTarget=true}={}){
 if(typeof text!=='string'||!text.trim())throw new Error('Empty AI output');
 const fenced=text.match(/```json\s*([\s\S]*?)\s*```/i);
 const rawJson=fenced?fenced[1]:text.trim();
 let parsed;
 try{parsed=JSON.parse(rawJson);}catch{throw new Error('AI output does not contain valid JSON patch proposal');}
 const changes=Array.isArray(parsed?.changes)?parsed.changes:Array.isArray(parsed)?parsed:null;
 if(!changes)throw new Error('Missing changes array in AI patch proposal');
 return validateGithubPatchProposal({
  repository:parsed?.repository||repository,
  runId:Number.isSafeInteger(parsed?.runId)?parsed.runId:runId,
  baseSha:parsed?.baseSha||baseSha,
  rationale:parsed?.rationale||rationale||'AI-proposed patch from HAK Control Center',
  changes
 },{allowAnyTarget});
}

export async function prepareRepoWorkflow({
 targetRepo,
 commitSha=null,
 runId=null,
 paths=[],
 query='',
 role='backend',
 workflowMode='single',
 requestedSkills=[],
 localSkillsDir='./skills',
 includeRemoteSkills=true,
 fetchImpl=fetch,
 token=process.env.GITHUB_TOKEN,
 env=process.env,
 extraRepos=[]
}={}){
 const ref=parseTargetRepo(targetRepo);
 let ciTriage=null;
 let effectivePaths=Array.isArray(paths)?[...paths]:[];
 let effectiveQuery=String(query||'');
 if(Number.isSafeInteger(runId)&&runId>0){
  ciTriage=await githubFailedJobTriage(ref.fullName,runId,{fetchImpl,token,env,extraRepos,allowAnyTarget:true});
  const hints=ciTriage.reports.flatMap(r=>r.fileHints||[]);
  if(effectivePaths.length===0&&hints.length>0)effectivePaths=[...new Set(hints)].slice(0,10);
  if(!effectiveQuery.trim()){
   effectiveQuery=ciTriage.reports.map(r=>r.classification+' '+r.nextAction).join(' ');
  }
 }
 const catalog=await discoverAllSkills({localDir:localSkillsDir,fetchImpl,token,includeRemote:includeRemoteSkills});
 let selected=[];
 if(Array.isArray(requestedSkills)&&requestedSkills.length>0){
  const wanted=new Set(requestedSkills);
  selected=catalog.filter(s=>wanted.has(s.name));
 }else if(workflowMode==='security-audit'){
  const auditNames=new Set(['security-audit','triage-finding','fix-finding','verify-fix','hak-code-auditor']);
  selected=catalog.filter(s=>auditNames.has(s.name));
  if(selected.length===0)selected=findSkills(effectiveQuery,{role:'security',skills:catalog,limit:4});
 }else if(workflowMode==='fix-and-verify'){
  const pipelineNames=new Set(['triage-finding','fix-finding','verify-fix','hak-code-auditor']);
  selected=catalog.filter(s=>pipelineNames.has(s.name));
  if(selected.length===0)selected=findSkills(effectiveQuery,{role,skills:catalog,limit:3});
 }else{
  selected=findSkills(effectiveQuery,{role,skills:catalog,limit:3});
 }

 const resolvedSkills=[];
 const blockedSkills=[];
 for(const skill of selected.slice(0,5)){
  let candidate=skill;
  if(!candidate.body&&typeof candidate.source==='string'&&candidate.source.startsWith('github:')){
   const skillRepo=candidate.source.slice('github:'.length);
   try{
    candidate=await fetchGithubSkill(skillRepo,candidate.name,{fetchImpl,token,env,extraRepos,basePath:candidate.basePath});
   }catch{/* Keep metadata-only entry */}
  }
  const safety=auditSkillSafety(candidate);
  if(safety.verdict==='BLOCK'){
   blockedSkills.push({name:candidate.name,source:candidate.source,findings:safety.findings});
   continue;
  }
  resolvedSkills.push({...candidate,safetyVerdict:safety.verdict});
 }

 let inspection=null;
 if(typeof commitSha==='string'&&/^[a-f0-9]{40}$/.test(commitSha)&&effectivePaths.length>0){
  inspection=await githubSourceInspection(ref.fullName,commitSha,effectivePaths,{fetchImpl,token,env,extraRepos,allowAnyTarget:true});
 }

 const recommendedRoles=workflowMode==='security-audit'?['security','testing','backend','quality']:workflowMode==='fix-and-verify'?['testing','backend','quality']:[role];

 return {
  schemaVersion:1,
  kind:'hak-repo-workflow-context',
  targetRepo:ref.fullName,
  role,
  workflowMode,
  recommendedRoles,
  skills:resolvedSkills,
  blockedSkills,
  ciTriage,
  inspection,
  readyForExecution:true,
  requiresHumanApproval:true
 };
}
