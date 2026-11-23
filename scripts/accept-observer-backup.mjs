import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventStore} from '../src/event-store.js';
import {backupObserver,verifyObserverBackup} from '../src/observer-backup.js';
import {drillObserverRestore} from '../src/observer-restore-drill.js';

const dir=await mkdtemp(join(tmpdir(),'hak-observer-accept-'));
try{
 const source=join(dir,'synthetic-events.jsonl');
 const destination=join(dir,'synthetic-backup.jsonl');
 const store=new EventStore(source);
 await store.load();
 await store.add({taskId:'acceptance-synthetic-task',agentId:'acceptance-synthetic-agent',status:'queued'});
 await store.add({taskId:'acceptance-synthetic-task',agentId:'acceptance-synthetic-agent',status:'passed'});
 const backup=await backupObserver({source,destination});
 const verified=await verifyObserverBackup({path:destination,expectedSha256:backup.sha256});
 const restored=await drillObserverRestore({backupPath:destination,sha256:backup.sha256});
 const originalBackup=await readFile(destination);
 await writeFile(destination,Buffer.concat([originalBackup,Buffer.from('tampered\\n')]));
 const tampered=await verifyObserverBackup({path:destination,expectedSha256:backup.sha256});
 const originalSource=await readFile(source);
 const replayed=new EventStore(source);await replayed.load();
 const sourceUnchanged=(await readFile(source)).equals(originalSource)&&replayed.list().length===2;
 const passed=verified.valid===true&&verified.eventCount===2&&restored.passed===true&&restored.eventCount===2&&restored.taskCount===1&&restored.liveStoreModified===false&&tampered.valid===false&&tampered.reason==='checksum-mismatch'&&sourceUnchanged;
 console.log(JSON.stringify({kind:'hak-observer-windows-backup-acceptance',passed,platform:process.platform,syntheticDataOnly:true,backupVerified:verified.valid,tamperingRejected:tampered.valid===false,sourceUnchanged,restoredEvents:restored.eventCount,restoredTasks:restored.taskCount,liveStoreModified:false,readyForProduction:false}));
 if(!passed)process.exitCode=1;
}catch{
 console.error('Synthetic Observer backup and restore drill failed; live data was not used.');
 process.exitCode=1;
}finally{
 await rm(dir,{recursive:true,force:true});
}
