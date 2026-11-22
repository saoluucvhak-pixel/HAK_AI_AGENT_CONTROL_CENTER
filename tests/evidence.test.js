import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceSnapshot} from '../src/evidence.js';
test('evidence is conservative and excludes event IDs, credentials and URLs',()=>{
 const report=evidenceSnapshot({diagnostics:{kind:'local-connectivity-only',checkedAt:'2026-01-01T00:00:00Z',checks:[{id:'omniroute',status:'endpoint-reachable',verified:false,secret:'NEVER_EXPORT',url:'http://localhost:1234'}]},observer:{persistent:true,tasks:[{taskId:'private-id',agentId:'private-agent',status:'passed'}]}});
 assert.equal(report.readyForProduction,false);
 assert.equal(report.observer.taskCount,1);
 assert.equal(report.observer.statusCounts.passed,1);
 assert.ok(report.pending.includes('windows-desktop'));
 assert.ok(!JSON.stringify(report).includes('NEVER_EXPORT'));
 assert.ok(!JSON.stringify(report).includes('private-id'));
 assert.ok(!JSON.stringify(report).includes('localhost:1234'));
 assert.equal(report.diagnostics.checks[0].verified,false);
});
