import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EventStore} from '../src/event-store.js';
import {backupObserver,verifyObserverBackup} from '../src/observer-backup.js';
test('backup verifies integrity, never overwrites, and rejects corrupted data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hak-backup-'));
 try{
  const src=join(dir,'events.jsonl'),dest=join(dir,'backup.jsonl');
  const store=new EventStore(src);
  await store.add({taskId:'t1',agentId:'a1',status:'running'});
  const result=await backupObserver({source:src,destination:dest});
  assert.equal(result.eventCount,1);
  const verified=await verifyObserverBackup({path:dest,expectedSha256:result.sha256});
  assert.equal(verified.valid,true);assert.equal(verified.restored,false);
  await assert.rejects(()=>backupObserver({source:src,destination:dest}),{code:'EEXIST'});
  await writeFile(dest,(await readFile(dest,'utf8'))+'tampered');
  assert.equal((await verifyObserverBackup({path:dest,expectedSha256:result.sha256})).valid,false);
  await assert.rejects(()=>backupObserver({source:src,destination:src}));
  await assert.rejects(()=>backupObserver({source:join(dir,'missing.jsonl'),destination:join(dir,'missing-backup.jsonl')}),{code:'ENOENT'});
  const empty=join(dir,'empty.jsonl');await writeFile(empty,'');
  await assert.rejects(()=>backupObserver({source:empty,destination:join(dir,'empty-backup.jsonl')}),/no events/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
