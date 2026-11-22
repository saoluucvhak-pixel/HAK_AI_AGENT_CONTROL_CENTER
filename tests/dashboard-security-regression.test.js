import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';

const root=fileURLToPath(new URL('../',import.meta.url));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('local dashboard security headers, write restrictions and sensitive route boundaries', {timeout:30000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hak-security-'));
 const port=45000+Math.floor(Math.random()*10000);
 const token='local-test-token-12345678901234567890';
 const child=spawn(process.execPath,['src/server.js'],{cwd:root,env:{...process.env,PORT:String(port),HAK_OBSERVER_TOKEN:token,HAK_EVENT_STORE_PATH:join(dir,'events.jsonl')},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;
 try{
  let ready=false;
  for(let i=0;i<80;i++){
   if(child.exitCode!==null)throw new Error('Dashboard exited before readiness');
   try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(300)});if(r.ok){ready=true;break}}catch{}
   await delay(100);
  }
  assert.equal(ready,true);
  for(const path of ['/','/api/health','/api/evidence','/api/agent-status']){
   const r=await fetch(base+path);
   assert.equal(r.headers.get('cache-control'),'no-store');
   assert.equal(r.headers.get('x-content-type-options'),'nosniff');
   assert.match(r.headers.get('content-security-policy')||'',/default-src 'none'/);
  }
  const noAuth=await fetch(base+'/api/agent-events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({taskId:'x',agentId:'x',status:'queued'})});
  assert.equal(noAuth.status,401);
  const wrongAuth=await fetch(base+'/api/agent-events',{method:'POST',headers:{authorization:'Bearer wrong'},body:'{}'});
  assert.equal(wrongAuth.status,401);
  const forbidden=await fetch(base+'/api/evidence',{method:'POST'});
  assert.equal(forbidden.status,405);
  const evidence=await (await fetch(base+'/api/evidence')).json();
  assert.equal(evidence.readyForProduction,false);
  assert.ok(!JSON.stringify(evidence).includes(token));
  const traversal=await fetch(base+'/..%2f..%2fpackage.json');
  assert.equal(traversal.status,404);
 }finally{
  if(child.exitCode===null){const done=once(child,'exit');child.kill();await Promise.race([done,delay(3000)]);}
  await rm(dir,{recursive:true,force:true});
 }
});
