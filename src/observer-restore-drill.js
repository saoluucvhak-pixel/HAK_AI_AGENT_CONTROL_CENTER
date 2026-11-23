import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyObserverBackup} from './observer-backup.js';
import {EventStore} from './event-store.js';

export async function drillObserverRestore({backupPath,sha256}={}){
 const integrity=await verifyObserverBackup({path:backupPath,expectedSha256:sha256});
 if(!integrity.valid)return {kind:'hak-observer-restore-drill',passed:false,reason:integrity.reason,readyForProduction:false,liveStoreModified:false};
 const temp=await mkdtemp(join(tmpdir(),'hak-observer-drill-'));
 try{
  const restored=join(temp,'restored-events.jsonl');
  await copyFile(backupPath,restored);
  const restoredIntegrity=await verifyObserverBackup({path:restored,expectedSha256:sha256});
  if(!restoredIntegrity.valid)throw new Error('Restored copy checksum mismatch');
  const store=new EventStore(restored);
  await store.load();
  const events=store.list();
  if(events.length!==integrity.eventCount)throw new Error('Restored event count mismatch');
  const latest=store.summary();
  return {kind:'hak-observer-restore-drill',passed:true,eventCount:events.length,taskCount:latest.length,readyForProduction:false,liveStoreModified:false,limitations:['Temporary recovery rehearsal only','No production database or active Observer file is modified','Operator must separately validate recovery while dashboard is stopped']};
 }finally{await rm(temp,{recursive:true,force:true})}
}
