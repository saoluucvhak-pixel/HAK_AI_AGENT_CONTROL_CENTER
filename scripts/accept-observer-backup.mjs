import {mkdtemp,rm} from 'node:fs/promises';
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
 const passed=verified.valid===true&&verified.eventCount===2&&restored.passed===true&&restored.eventCount===2&&restored.taskCount===1&&restored.liveStoreModified===false;
 console.log(JSON.stringify({kind:'hak-observer-windows-backup-acceptance',passed,platform:process.platform,syntheticDataOnly:true,backupVerified:verified.valid,restoredEvents:restored.eventCount,restoredTasks:restored.taskCount,liveStoreModified:false,readyForProduction:false}));
 if(!passed)process.exitCode=1;
}catch{
 console.error('Synthetic Observer backup and restore drill failed; live data was not used.');
 process.exitCode=1;
}finally{
 await rm(dir,{recursive:true,force:true});
}
