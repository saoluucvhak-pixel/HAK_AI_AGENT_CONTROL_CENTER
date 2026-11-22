import {backupObserver,verifyObserverBackup} from '../src/observer-backup.js';
const [mode,...args]=process.argv.slice(2);
try{
 let result;
 if(mode==='create'&&args.length===2)result=await backupObserver({source:args[0],destination:args[1]});
 else if(mode==='verify'&&args.length===2)result=await verifyObserverBackup({path:args[0],expectedSha256:args[1]});
 else throw new Error('Usage: npm run backup:observer -- create <source> <new-backup-path> OR verify <backup-path> <sha256>');
 console.log(JSON.stringify(result,null,2));
 if(result.valid===false)process.exitCode=1;
}catch(e){console.error('Observer backup operation failed: '+(e.code==='EEXIST'?'destination already exists':e.message));process.exitCode=1}
