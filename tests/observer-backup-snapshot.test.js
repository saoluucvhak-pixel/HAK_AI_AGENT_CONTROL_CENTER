import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backupObserver,verifyObserverBackup} from '../src/observer-backup.js';

test('Observer backup retains source bytes and validates integrity',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hak-backup-snapshot-'));
 try{
  const source=join(dir,'source.jsonl'),destination=join(dir,'backup.jsonl');
  const original=JSON.stringify({taskId:'t1',agentId:'a1',status:'passed',at:'2026-11-23T00:00:00.000Z'})+'\n';
  await writeFile(source,original);
  const result=await backupObserver({source,destination});
  assert.equal(result.eventCount,1);
  assert.equal(await readFile(destination,'utf8'),original);
  assert.deepEqual(await verifyObserverBackup({path:destination,expectedSha256:result.sha256}),{valid:true,eventCount:1,sha256:result.sha256,restored:false});
  await writeFile(destination,original.replace('passed','failed'));
  const invalid=await verifyObserverBackup({path:destination,expectedSha256:result.sha256});
  assert.equal(invalid.valid,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
