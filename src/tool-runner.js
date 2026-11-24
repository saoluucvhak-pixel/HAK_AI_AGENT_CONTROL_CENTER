import {spawnSync} from 'node:child_process';
import {launchOrcaAgent} from './orca-probe.js';

function safeCliEnv(env){
 const allowed=['PATH','Path','PATHEXT','SystemRoot','WINDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','TMP','TEMP'];
 const result={NO_COLOR:'1'};
 for(const key of allowed)if(typeof env[key]==='string')result[key]=env[key];
 return result;
}

export function probeBeacon({enabled=false,run=spawnSync,env=process.env}={}){
 if(!enabled)return {status:'disabled',connected:false};
 try{
  const result=run('beacon',['status','--json'],{
   encoding:'utf8',timeout:5000,maxBuffer:65536,windowsHide:true,shell:false,env:safeCliEnv(env)
  });
  if(result.error||result.status!==0||result.signal)return {status:'unavailable',connected:false};
  if(typeof result.stdout!=='string'||Buffer.byteLength(result.stdout)>65536)return {status:'invalid-response',connected:false};
  const data=JSON.parse(result.stdout);
  if(!data||typeof data!=='object'||Array.isArray(data))return {status:'invalid-response',connected:false};
  return data.ready===true||data.connected===true?{status:'reachable',connected:true}:{status:'unverified',connected:false};
 }catch{
  return {status:'unavailable',connected:false};
 }
}

export function queryBeaconMemory({query,repo=null,enabled=false,run=spawnSync,env=process.env}={}){
 if(!enabled)return {ok:false,status:'disabled',memories:[]};
 if(typeof query!=='string'||!query.trim()||query.length>500||query.includes('\0'))return {ok:false,status:'invalid-query',memories:[]};
 const args=['search',query.trim(),'--json'];
 if(typeof repo==='string'&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.trim())){
  args.push('--repo',repo.trim());
 }
 try{
  const result=run('beacon',args,{
   encoding:'utf8',timeout:8000,maxBuffer:65536,windowsHide:true,shell:false,env:safeCliEnv(env)
  });
  if(result.error||result.status!==0||result.signal)return {ok:false,status:'unavailable',memories:[]};
  if(typeof result.stdout!=='string'||Buffer.byteLength(result.stdout)>65536)return {ok:false,status:'invalid-response',memories:[]};
  const data=JSON.parse(result.stdout);
  const items=Array.isArray(data)?data:Array.isArray(data?.results)?data.results:Array.isArray(data?.memories)?data.memories:[];
  const memories=items.slice(0,5).map(m=>({
   title:typeof m?.title==='string'?m.title.slice(0,160):'memory',
   summary:typeof m?.summary==='string'?m.summary.slice(0,400):typeof m?.content==='string'?m.content.slice(0,400):''
  })).filter(m=>m.summary);
  return {ok:true,status:'available',memories};
 }catch{
  return {ok:false,status:'unavailable',memories:[]};
 }
}

export function buildInternalFallbackAnswer({prompt,role='backend',targetRepo=null,skills=[],reason='external-runner-unavailable'}){
 const skillNames=(Array.isArray(skills)?skills:[]).map(s=>s?.name).filter(Boolean);
 return JSON.stringify({
  mode:'internal-skill-guided-fallback',
  reason,
  targetRepo:targetRepo||null,
  role,
  appliedSkills:skillNames,
  guidance:'External CLI runner (Orca/Beacon) unavailable or disabled; Control Center produced a deterministic skill-guided execution plan.',
  promptPreview:String(prompt||'').slice(0,600),
  requiresHumanReview:true
 },null,2);
}

export function executeWithExternalFallback({
 prompt,
 role='backend',
 targetRepo=null,
 skills=[],
 agent='codex',
 worktree='current',
 orcaEnabled=false,
 confirm=true,
 run=spawnSync,
 env=process.env
}={}){
 if(orcaEnabled&&confirm===true){
  const launched=launchOrcaAgent({prompt,agent,worktree,enabled:true,confirm:true,run,env});
  if(launched.ok){
   return {
    model:'orca:'+launched.agent,
    answer:JSON.stringify(launched,null,2),
    fallbackUsed:false,
    runner:'orca'
   };
  }
  return {
   model:'hak-internal-fallback',
   answer:buildInternalFallbackAnswer({prompt,role,targetRepo,skills,reason:'orca-'+launched.status}),
   fallbackUsed:true,
   runner:'internal-fallback'
  };
 }
 return {
  model:'hak-internal-fallback',
  answer:buildInternalFallbackAnswer({prompt,role,targetRepo,skills,reason:'orca-disabled'}),
  fallbackUsed:true,
  runner:'internal-fallback'
 };
}
