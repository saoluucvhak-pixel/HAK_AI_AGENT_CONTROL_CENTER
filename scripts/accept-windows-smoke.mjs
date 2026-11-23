import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const dir=await mkdtemp(join(tmpdir(),'hak-operator-smoke-'));
const token=randomBytes(32).toString('hex');
const listener=createServer();
await new Promise((resolve,reject)=>listener.once('error',reject).listen(0,'127.0.0.1',resolve));
const selectedPort=listener.address().port;
await new Promise(resolve=>listener.close(resolve));
const env={...process.env,NODE_ENV:'production',PORT:String(selectedPort),HAK_EVENT_STORE_PATH:join(dir,'events.jsonl'),HAK_OBSERVER_TOKEN:token};
const child=spawn(process.execPath,['src/server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
let output='',error='';
child.stdout.on('data',x=>{output+=x.toString();output=output.slice(-8192)});
child.stderr.on('data',x=>{error+=x.toString();error=error.slice(-8192)});
try{
 let port;
 for(let i=0;i<60;i++){
  if(child.exitCode!==null)throw new Error('Dashboard exited before becoming healthy');
  const m=output.match(/(?:127\.0\.0\.1|localhost):(\d{2,5})/);
  if(m){port=Number(m[1]);break}
  await sleep(150);
 }
 if(!port)throw new Error('Dashboard did not report its listening port');
 const base='http://127.0.0.1:'+port;
 const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(2500)});
 const data=await health.json();
 if(health.status!==200||data.app!=='hak-agent-control-center'||data.host!=='127.0.0.1')throw new Error('Invalid dashboard health');
 const status=await fetch(base+'/api/agent-status',{signal:AbortSignal.timeout(2500)});
 if(status.status!==200)throw new Error('Local read-only observer status failed');
 const denied=await fetch(base+'/api/agent-events',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(2500)});
 if(denied.status!==401)throw new Error('Unauthenticated observer write was not rejected');
 process.stdout.write(JSON.stringify({kind:'hak-windows-operator-smoke',result:'pass',node:process.version,platform:process.platform,health:health.status,observerStatus:status.status,unauthorizedWrite:denied.status,productionApproved:false})+'\n');
}catch{
 process.stderr.write('Operator smoke failed. Check local dashboard configuration; no credentials printed.\n');
 process.exitCode=1;
}finally{
 child.kill();
 await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(r,2500)}).catch(()=>{});
 await rm(dir,{recursive:true,force:true});
}
