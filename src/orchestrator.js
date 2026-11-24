import {parseRepoRef} from './github.js';
import {githubSourceInspection} from './github-source-inspection.js';
import {githubFailedJobTriage} from './github-ci-triage.js';
import {validateGithubPatchProposal} from './github-patch-proposal.js';
import {discoverAllSkills,fetchGithubSkill,findSkills} from './skills-registry.js';

export function extractPatchProposalFromText(text,{repository,runId,baseSha,rationale}={}){
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
 });
}

export async function prepareRepoWorkflow({
 targetRepo,
 commitSha=null,
 runId=null,
 paths=[],
 query='',
 role='backend',
 requestedSkills=[],
 localSkillsDir='./skills',
 includeRemoteSkills=true,
 fetchImpl=fetch,
 token=process.env.GITHUB_TOKEN,
 env=process.env,
 extraRepos=[]
}={}){
 const ref=parseRepoRef(targetRepo,{env,extraRepos});
 let ciTriage=null;
 let effectivePaths=Array.isArray(paths)?[...paths]:[];
 let effectiveQuery=String(query||'');
 if(Number.isSafeInteger(runId)&&runId>0){
  ciTriage=await githubFailedJobTriage(ref.fullName,runId,{fetchImpl,token,env,extraRepos});
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
 }else{
  selected=findSkills(effectiveQuery,{role,skills:catalog,limit:3});
 }

 const resolvedSkills=[];
 for(const skill of selected.slice(0,5)){
  if(skill.body){
   resolvedSkills.push(skill);
  }else if(typeof skill.source==='string'&&skill.source.startsWith('github:')){
   const skillRepo=skill.source.slice('github:'.length);
   try{
    const full=await fetchGithubSkill(skillRepo,skill.name,{fetchImpl,token,env,extraRepos});
    resolvedSkills.push(full);
   }catch{
    resolvedSkills.push(skill);
   }
  }
 }

 let inspection=null;
 if(typeof commitSha==='string'&&/^[a-f0-9]{40}$/.test(commitSha)&&effectivePaths.length>0){
  inspection=await githubSourceInspection(ref.fullName,commitSha,effectivePaths,{fetchImpl,token,env,extraRepos});
 }

 return {
  schemaVersion:1,
  kind:'hak-repo-workflow-context',
  targetRepo:ref.fullName,
  role,
  skills:resolvedSkills,
  ciTriage,
  inspection,
  readyForExecution:true,
  requiresHumanApproval:true
 };
}
