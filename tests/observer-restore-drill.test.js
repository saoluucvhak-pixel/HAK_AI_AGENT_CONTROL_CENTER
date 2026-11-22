import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EventStore} from '../src/event-store.js';
import {backupObserver} from '../src/observer-backup.js';
import {drillObserverRestore} from '../src/observer-restore-drill.js';
test('restore drill replays copy and does not touch source or backup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hak-restore-'));
 try{
  const src=join(dir,'events.jsonl'),dest=join(dir,'backup.jsonl');
  const store=new EventStore(src);
  await store.add({taskId:'task1',agentId:'agent1',status:'running'});
  await store.add({taskId:'task1',agentId:'agent1',status:'passed'});
  const backup=await backupObserver({source:src,destination:dest});
  const original=await readFile(src),snapshot=await readFile(dest);
  const drill=await drillObserverRestore({backupPath:dest,sha256:backup.sha256});
  assert.equal(drill.passed,true);assert.equal(drill.eventCount,2);assert.equal(drill.taskCount,1);
  assert.equal(drill.liveStoreModified,false);
  assert.deepEqual(await readFile(src),original);assert.deepEqual(await readFile(dest),snapshot);
  const bad=await drillObserverRestore({backupPath:dest,sha256:'0'.repeat(64)});
  assert.equal(bad.passed,false);
 }finally{await rm(dir,{recursive:true,force:true})}
});
