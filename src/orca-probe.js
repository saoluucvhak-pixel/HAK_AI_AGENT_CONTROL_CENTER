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
