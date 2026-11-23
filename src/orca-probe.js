import {spawnSync} from 'node:child_process';
/** Read-only Orca desktop connectivity probe; never launches agents or approves PRs. */
export function probeOrca({enabled=false,run=spawnSync}={}) {
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
    return {status:'reachable',connected:true};
  } catch {
    return {status:'invalid-response',connected:false};
  }
}
