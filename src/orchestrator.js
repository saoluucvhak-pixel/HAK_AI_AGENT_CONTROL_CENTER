import {parseRepoRef} from './github.js';
import {githubSourceInspection} from './github-source-inspection.js';
import {discoverAllSkills,fetchGithubSkill,findSkills} from './skills-registry.js';

export async function prepareRepoWorkflow({
 targetRepo,
 commitSha=null,
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
 const catalog=await discoverAllSkills({localDir:localSkillsDir,fetchImpl,token,includeRemote:includeRemoteSkills});
 let selected=[];
 if(Array.isArray(requestedSkills)&&requestedSkills.length>0){
  const wanted=new Set(requestedSkills);
  selected=catalog.filter(s=>wanted.has(s.name));
 }else{
  selected=findSkills(query,{role,skills:catalog,limit:3});
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
 if(typeof commitSha==='string'&&/^[a-f0-9]{40}$/.test(commitSha)&&Array.isArray(paths)&&paths.length>0){
  inspection=await githubSourceInspection(ref.fullName,commitSha,paths,{fetchImpl,token,env,extraRepos});
 }

 return {
  schemaVersion:1,
  kind:'hak-repo-workflow-context',
  targetRepo:ref.fullName,
  role,
  skills:resolvedSkills,
  inspection,
  readyForExecution:true,
  requiresHumanApproval:true
 };
}
