import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EventStore} from '../src/event-store.js';
import {createObserverApi} from '../src/observer-api.js';

test('Observer HTTP authorization, persistence and rejection of invalid events',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hak-observer-security-'));
 const path=join(dir,'observer.jsonl');
 const token='observer-local-test-token-123456';
 const store=new EventStore(path);
 await store.load();
 const handler=createObserverApi({token,registry:store,localReadOnly:true});
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost').pathname));
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const send=(body,auth)=>fetch(url+'/api/agent-events',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:auth}:{})},body:JSON.stringify(body)});
  const event={taskId:'t-1',agentId:'a-1',status:'queued'};
  assert.equal((await send(event)).status,401);
  assert.equal((await send(event,'Bearer invalid')).status,401);
  assert.equal((await send(event,'Bearer '+token)).status,201);
  assert.equal((await send({...event,status:'unknown'},'Bearer '+token)).status,400);
  const tooLarge={...event,padding:'x'.repeat(9000)};
  assert.equal((await send(tooLarge,'Bearer '+token)).status,413);
  const status=await fetch(url+'/api/agent-status');
  assert.equal(status.status,200);
  const data=await status.json();
  assert.equal(data.persistent,true);
  assert.equal(data.tasks.length,1);
  assert.equal(data.tasks[0].status,'queued');
  const restored=new EventStore(path);
  await restored.load();
  assert.deepEqual(restored.summary(),store.summary());
  assert.equal((await fetch(url+'/api/agent-events')).status,401);
  assert.equal((await fetch(url+'/api/agent-events',{headers:{authorization:'Bearer '+token}})).status,405);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  await rm(dir,{recursive:true,force:true});
 }
});
