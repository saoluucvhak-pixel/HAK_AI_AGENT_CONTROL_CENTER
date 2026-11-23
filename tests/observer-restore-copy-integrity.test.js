import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {EventStore} from '../src/event-store.js';
import {backupObserver} from '../src/observer-backup.js';
import {drillObserverRestore} from '../src/observer-restore-drill.js';

test('Observer recovery checks copied bytes and leaves live event store untouched',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hak-restore-integrity-'));
 try{
  const source=join(dir,'live.jsonl'),destination=join(dir,'backup.jsonl');
  const store=new EventStore(source);await store.load();
  await store.add({taskId:'synthetic-task',agentId:'synthetic-agent',status:'queued'});
  await store.add({taskId:'synthetic-task',agentId:'synthetic-agent',status:'passed'});
  const original=await readFile(source);
  const backup=await backupObserver({source,destination});
  const result=await drillObserverRestore({backupPath:destination,sha256:backup.sha256});
  assert.equal(result.passed,true);
  assert.equal(result.eventCount,2);
  assert.equal(result.taskCount,1);
  assert.equal(result.liveStoreModified,false);
  assert.deepEqual(await readFile(source),original);
  await writeFile(destination,Buffer.concat([await readFile(destination),Buffer.from('tamper')]));
  const rejected=await drillObserverRestore({backupPath:destination,sha256:backup.sha256});
  assert.equal(rejected.passed,false);
  assert.equal(rejected.reason,'checksum-mismatch');
  assert.deepEqual(await readFile(source),original);
 }finally{await rm(dir,{recursive:true,force:true})}
});
