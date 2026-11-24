import {spawnSync} from 'node:child_process';
function safeCliEnv(env) {
  const allowed=['PATH','Path','PATHEXT','SystemRoot','WINDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','TMP','TEMP'];
  const result={NO_COLOR:'1'};
  for(const key of allowed) if(typeof env[key]==='string') result[key]=env[key];
  return result;
}
/** Read-only Orca desktop connectivity probe; never launches agents or approves PRs. */
export function probeOrca({enabled=false,run=spawnSync,env=process.env}={}) {
  if (!enabled) return {status:'disabled',connected:false};
  let result;
  try {
    result=run('orca',['status','--json'],{
      encoding:'utf8',timeout:5000,maxBuffer:65536,
      windowsHide:true,shell:false,env:safeCliEnv(env)
    });
  } catch {
    return {status:'unavailable',connected:false};
  }
  if (result.error || result.status!==0 || result.signal) return {status:'unavailable',connected:false};
  if (typeof result.stdout!=='string' || Buffer.byteLength(result.stdout)>65536)
    return {status:'invalid-response',connected:false};
  try {
    const data=JSON.parse(result.stdout);
    if (!data || typeof data!=='object' || Array.isArray(data)) throw Error('invalid');
    const connected=data.connected===true || data.ready===true;
    if(data.connected===false || data.ready===false) return {status:'disconnected',connected:false};
    return connected?{status:'reachable',connected:true}:{status:'unverified',connected:false};
  } catch {
    return {status:'invalid-response',connected:false};
  }
}

const ORCA_AGENTS=new Set(['claude','codex','grok','kiro','cursor','gemini']);
const ORCA_CLIS=new Set(['orca','orca-ide','orca-dev']);

export function resolveOrcaCli(env=process.env){
 const custom=typeof env?.ORCA_CLI_COMMAND==='string'?env.ORCA_CLI_COMMAND.trim():'';
 return ORCA_CLIS.has(custom)?custom:'orca';
}

export function launchOrcaAgent({prompt,agent='codex',worktree='current',enabled=false,confirm=false,run=spawnSync,env=process.env}={}){
 if(!enabled)return {ok:false,status:'disabled',error:'Orca execution disabled; set HAK_ORCA_EXECUTION_ENABLED=true'};
 if(confirm!==true)throw new Error('Explicit confirmation required to launch Orca agent');
 if(!ORCA_AGENTS.has(agent))throw new Error('Unsupported Orca agent');
 if(typeof worktree!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(worktree)||worktree.includes('..'))throw new Error('Invalid Orca worktree selector');
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>8000||prompt.includes('\0'))throw new Error('Invalid Orca prompt');
 const cli=resolveOrcaCli(env);
 let result;
 try{
  result=run(cli,['agent','launch',agent,'--worktree',worktree,'--prompt',prompt.trim(),'--json'],{
   encoding:'utf8',timeout:15000,maxBuffer:65536,windowsHide:true,shell:false,env:safeCliEnv(env)
  });
 }catch{
  return {ok:false,status:'unavailable',error:'Orca CLI unavailable'};
 }
 if(result.error||result.status!==0||result.signal)return {ok:false,status:'failed',error:'Orca agent launch failed'};
 if(typeof result.stdout!=='string'||Buffer.byteLength(result.stdout)>65536)return {ok:false,status:'invalid-response',error:'Invalid Orca response'};
 try{
  const data=JSON.parse(result.stdout);
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid');
  return {
   ok:true,
   status:'launched',
   agent,
   worktree,
   sessionId:typeof data.sessionId==='string'?data.sessionId.slice(0,128):typeof data.id==='string'?data.id.slice(0,128):null
  };
 }catch{
  return {ok:false,status:'invalid-response',error:'Invalid Orca JSON response'};
 }
}
