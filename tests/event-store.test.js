import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {EventStore} from '../src/event-store.js';
test('events persist and replay after restart',async()=>{const dir=await mkdtemp(join(tmpdir(),'hak-evt-'));try{const path=join(dir,'events.jsonl');const a=new EventStore(path);await a.load();await Promise.all([a.add({taskId:'t',agentId:'a',status:'running'}),a.add({taskId:'t',agentId:'a',status:'passed'})]);const b=new EventStore(path);await b.load();assert.equal(b.list().length,2);assert.equal(b.summary()[0].status,'passed');assert.equal((await readFile(path,'utf8')).trim().split('\n').length,2)}finally{await rm(dir,{recursive:true,force:true})}});
test('corrupt file fails closed rather than wiping history',async()=>{const dir=await mkdtemp(join(tmpdir(),'hak-evt-'));try{const path=join(dir,'events.jsonl');await writeFile(path,'bad json\n');await assert.rejects(new EventStore(path).load(),/Corrupt/)}finally{await rm(dir,{recursive:true,force:true})}});

test('restart recovery preserves independent task states and append history',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hak-replay-'));
 try{
  const path=join(dir,'events.jsonl');
  const first=new EventStore(path);await first.load();
  await first.add({taskId:'job-a',agentId:'agent-1',status:'queued'});
  await first.add({taskId:'job-b',agentId:'agent-2',status:'running'});
  await first.add({taskId:'job-a',agentId:'agent-1',status:'passed'});
  const restarted=new EventStore(path);await restarted.load();
  assert.equal(restarted.list().length,3);
  assert.deepEqual(Object.fromEntries(restarted.summary().map(x=>[x.taskId,x.status])),{'job-a':'passed','job-b':'running'});
  await restarted.add({taskId:'job-b',agentId:'agent-2',status:'failed'});
  const third=new EventStore(path);await third.load();
  assert.equal(third.list().length,4);
  assert.deepEqual(Object.fromEntries(third.summary().map(x=>[x.taskId,x.status])),{'job-a':'passed','job-b':'failed'});
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('malformed historical event cannot silently reset persistent observer',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hak-replay-'));
 try{
  const path=join(dir,'events.jsonl');
  const store=new EventStore(path);await store.load();
  await store.add({taskId:'job',agentId:'agent',status:'passed'});
  await writeFile(path,(await readFile(path,'utf8'))+'{"taskId":"job","status":"passed"}\n');
  await assert.rejects(new EventStore(path).load(),/Invalid event store/);
  assert.match(await readFile(path,'utf8'),/"taskId":"job"/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
