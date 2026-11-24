// node scripts/restore-data.mjs verify <backupDir>   |   restore <backupDir> <emptyTargetDir>
import {verifyBackup,restoreBackup} from '../src/data-backup.js';
const [cmd,a,b]=process.argv.slice(2);
try{
 if(cmd==='verify'&&a){const r=await verifyBackup(a);console.log(JSON.stringify(r));process.exitCode=r.ok?0:1;}
 else if(cmd==='restore'&&a&&b){console.log(JSON.stringify(await restoreBackup(a,b)));}
 else{console.error('Cách dùng: restore-data.mjs verify <backup> | restore <backup> <thư-mục-đích-trống>');process.exitCode=2;}
}catch(e){console.error('Lỗi: '+e.message);process.exitCode=1;}
