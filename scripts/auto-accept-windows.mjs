import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {EventStore} from '../src/event-store.js';
import {backupObserver,verifyObserverBackup} from '../src/observer-backup.js';
import {drillObserverRestore} from '../src/observer-restore-drill.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const report={kind:'hak-one-click-acceptance',platform:process.platform,checks:[],isolated:true,liveStoreModified:false,externalAgentsVerified:false,readyForProduction:false};
const add=(name,passed)=>{report.checks.push({name,status:passed?'PASS':'FAIL'});if(!passed)throw Error(name+' failed')};
let dir,child;
async function stop(){
 if(!child)return;
 const running=child;
 child=null;
 if(running.exitCode===null)running.kill();
 await Promise.race([new Promise(r=>running.once('exit',r)),sleep(3000)]);
}
async function start(port,token,storePath){
 let logs='';
 child=spawn(process.execPath,['src/server.js'],{cwd:root,env:{...process.env,NODE_ENV:'production',PORT:String(port),HAK_OBSERVER_TOKEN:token,HAK_EVENT_STORE_PATH:storePath},stdio:['ignore','pipe','pipe'],windowsHide:true});
 child.stdout.on('data',b=>{logs=(logs+b.toString()).slice(-2000)});
 child.stderr.on('data',()=>{});
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw Error('isolated server exited');
  if(logs.includes('HAK dashboard on http://127.0.0.1:'+port))return;
  await sleep(100);
 }
 throw Error('isolated server start timeout');
}
async function portNumber(){
 const listener=createServer();
 await new Promise((ok,no)=>listener.once('error',no).listen(0,'127.0.0.1',ok));
 const port=listener.address().port;
 await new Promise(ok=>listener.close(ok));
 return port;
}
try{
 const major=Number(process.versions.node.split('.')[0]);
 add('Node.js 22+',major>=22);
 dir=await mkdtemp(join(tmpdir(),'hak-one-click-'));
 const storePath=join(dir,'observer-events.jsonl'),backupPath=join(dir,'observer-backup.jsonl');
 const token=randomBytes(32).toString('hex');
 const port=await portNumber(),base='http://127.0.0.1:'+port;
 await start(port,token,storePath);
 const health=await fetch(base+'/api/health').then(r=>r.json());
 add('Isolated Dashboard health',health.ok===true&&health.app==='hak-agent-control-center');
 const denied=await fetch(base+'/api/agent-events',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 add('Unauthorized writes rejected',denied.status===401);
 const taskId='HAK-ACCEPT-'+randomBytes(6).toString('hex');
 const sent=await fetch(base+'/api/agent-events',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({taskId,agentId:'local-acceptance',status:'passed'})});
 add('Authenticated event write',sent.status===201);
 const status=await fetch(base+'/api/agent-status').then(r=>r.json());
 add('Observer JSONL active',status.persistent===true&&status.tasks.some(t=>t.taskId===taskId));
 await stop();
 const stored=new EventStore(storePath);await stored.load();
 add('Event persisted to disk',stored.summary().some(t=>t.taskId===taskId));
 await start(port,token,storePath);
 const replay=await fetch(base+'/api/agent-status').then(r=>r.json());
 add('Observer survives server restart',replay.tasks.some(t=>t.taskId===taskId));
 await stop();
 const backup=await backupObserver({source:storePath,destination:backupPath});
 const verified=await verifyObserverBackup({path:backupPath,expectedSha256:backup.sha256});
 add('Backup SHA256 verified',verified.valid===true&&verified.eventCount===1);
 const drill=await drillObserverRestore({backupPath,sha256:backup.sha256});
 add('Restore drill',drill.passed===true&&drill.taskCount===1&&drill.liveStoreModified===false);
 report.passed=true;
}catch(e){
 report.passed=false;
 report.failure=e.message;
}finally{
 await stop();
 if(dir)await rm(dir,{recursive:true,force:true}).catch(()=>{report.cleanupFailed=true;report.passed=false});
 report.completedAt=new Date().toISOString();
 console.log(JSON.stringify(report,null,2));
 if(!report.passed)process.exitCode=1;
}
