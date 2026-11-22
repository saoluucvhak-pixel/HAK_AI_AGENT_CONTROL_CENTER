import {drillObserverRestore} from '../src/observer-restore-drill.js';
const [backupPath,sha256,...extra]=process.argv.slice(2);
if(!backupPath||!sha256||extra.length){console.error('Usage: npm run drill:observer -- <backup-path> <sha256>');process.exitCode=1;}
else try{const report=await drillObserverRestore({backupPath,sha256});console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;}
catch{console.error('Restore drill failed: verify backup integrity and permissions');process.exitCode=1;}
