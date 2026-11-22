import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
const root=fileURLToPath(new URL('../',import.meta.url));
const secret='test-only-token-12345678901234567890';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function launch(port,path){
 const child=spawn(process.execPath,['src/server.js'],{cwd:root,env:{...process.env,PORT:String(port),HAK_OBSERVER_TOKEN:secret,HAK_EVENT_STORE_PATH:path},stdio:['ignore','pipe','pipe']});
 let output='';child.stderr.on('data',b=>output+=b.toString());
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw new Error('Server exited: '+output);
  try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(400)});if(r.ok)return{child,base}}catch{}
  await delay(100);
 }
 child.kill();throw new Error('Server startup timeout: '+output);
}
async function stop(child){
 if(child.exitCode!==null)return;
 const exited=once(child,'exit');child.kill();await Promise.race([exited,delay(4000).then(()=>{if(child.exitCode===null)child.kill('SIGKILL')})]);
}
test('real server: health, UI, auth, event persistence across restart, topology', {timeout:30000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hak-smoke-'));
 const path=join(dir,'events.jsonl');
 const port=45000+Math.floor(Math.random()*10000);
 let process1,process2;
 try{
  const first=await launch(port,path);process1=first.child;
  const {base}=first;
  let r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/HAK AI Operations/);
  r=await fetch(base+'/api/agent-status');assert.equal(r.status,401);
  r=await fetch(base+'/api/topology');assert.equal(r.status,200);const graph=await r.json();assert.equal(graph.kind,'hak-topology-proposal');assert.ok(graph.edges.every(e=>e.verified===false));
  r=await fetch(base+'/api/topology.mmd');assert.equal(r.status,200);assert.match(await r.text(),/flowchart TD/);
  r=await fetch(base+'/api/agent-events',{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify({taskId:'smoke-1',agentId:'test-agent',status:'running'})});
  assert.equal(r.status,201);
  r=await fetch(base+'/api/agent-status',{headers:{authorization:'Bearer '+secret}});assert.equal(r.status,200);
  let status=await r.json();assert.equal(status.persistent,true);assert.equal(status.tasks[0].status,'running');
  await stop(process1);process1=null;
  const second=await launch(port,path);process2=second.child;
  r=await fetch(base+'/api/agent-status',{headers:{authorization:'Bearer '+secret}});assert.equal(r.status,200);
  status=await r.json();assert.equal(status.tasks[0].taskId,'smoke-1');assert.equal(status.tasks[0].status,'running');
 }finally{if(process1)await stop(process1);if(process2)await stop(process2);await rm(dir,{recursive:true,force:true})}
});
