import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
test('synthetic Observer backup and restore acceptance passes on CI host',async()=>{
 const {stdout}=await run(process.execPath,['scripts/accept-observer-backup.mjs'],{timeout:30000});
 const report=JSON.parse(stdout.trim());
 assert.equal(report.kind,'hak-observer-windows-backup-acceptance');
 assert.equal(report.passed,true);
 assert.equal(report.syntheticDataOnly,true);
 assert.equal(report.backupVerified,true);
 assert.equal(report.restoredEvents,2);
 assert.equal(report.restoredTasks,1);
 assert.equal(report.liveStoreModified,false);
 assert.equal(report.readyForProduction,false);
});
