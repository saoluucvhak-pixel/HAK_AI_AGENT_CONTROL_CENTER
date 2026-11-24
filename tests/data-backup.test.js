import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tempDir} from './helpers.js';
import {createBackup,verifyBackup,restoreBackup,listBackups} from '../src/data-backup.js';

test('backup → verify → restore into an independent directory reproduces every file',async()=>{
 const t=await tempDir();
 try{
  const data=join(t.dir,'live');
  await mkdir(join(data,'work-orders'),{recursive:true});await mkdir(join(data,'logs'),{recursive:true});
  await writeFile(join(data,'providers.json'),'{"connections":[1]}');
  await writeFile(join(data,'work-orders','a.json'),'{"id":"a"}');
  await writeFile(join(data,'logs','server.log'),'noise');
  const b=await createBackup(data);
  assert.equal(b.fileCount,2,'logs and previous backups are excluded');
  assert.equal((await verifyBackup(b.path)).ok,true);
  assert.equal((await listBackups(data)).length,1);
  const target=join(t.dir,'restored');
  const r=await restoreBackup(b.path,target);
  assert.equal(r.restoredFiles,2);
  assert.equal(await readFile(join(target,'work-orders','a.json'),'utf8'),'{"id":"a"}');
  assert.deepEqual((await readdir(target)).sort(),['providers.json','work-orders']);
  await assert.rejects(()=>restoreBackup(b.path,target),/không trống/,'never overwrites existing data');
 }finally{await t.cleanup();}
});
test('tampered or incomplete backups are rejected and nothing is restored',async()=>{
 const t=await tempDir();
 try{
  const data=join(t.dir,'live');await mkdir(data,{recursive:true});
  await writeFile(join(data,'x.json'),'{"v":1}');
  const b=await createBackup(data);
  await writeFile(join(b.path,'data','x.json'),'{"v":2}');
  const v=await verifyBackup(b.path);assert.equal(v.ok,false);assert.match(v.problems[0],/checksum mismatch/);
  await assert.rejects(()=>restoreBackup(b.path,join(t.dir,'out')),/không toàn vẹn/);
  await assert.rejects(()=>readdir(join(t.dir,'out')),/ENOENT/);
 }finally{await t.cleanup();}
});
