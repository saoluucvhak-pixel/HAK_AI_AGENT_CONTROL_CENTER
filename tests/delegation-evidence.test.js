import test from 'node:test';
import assert from 'node:assert/strict';
import {delegationEvidence} from '../src/delegation-evidence.js';
const order={id:'work_2',projectId:'HAK',title:'Review',description:'private-description-marker',acceptanceCriteria:['Tests pass']};
test('stable proposal hash and no execution claim',()=>{
 const a=delegationEvidence({workOrder:order,roles:['backend','testing'],at:'2026-11-23T00:00:00.000Z'});
 const b=delegationEvidence({workOrder:order,roles:['backend','testing'],at:'2026-11-24T00:00:00.000Z'});
 assert.equal(a.planSha256,b.planSha256);
 assert.match(a.planSha256,/^[0-9a-f]{64}$/);
 assert.equal(a.executionVerified,false);assert.equal(a.readyForProduction,false);
 assert.ok(a.steps.every(s=>s.executionAllowed===false));
 assert.equal(JSON.stringify(a).includes('private-description-marker'),false);
});
test('role order changes hash',()=>{
 const a=delegationEvidence({workOrder:order,roles:['backend','testing']});
 const b=delegationEvidence({workOrder:order,roles:['testing','backend']});
 assert.notEqual(a.planSha256,b.planSha256);
});
test('reject invalid timestamp and duplicate roles',()=>{
 assert.throws(()=>delegationEvidence({workOrder:order,roles:['backend'],at:'invalid'}),/timestamp/);
 assert.throws(()=>delegationEvidence({workOrder:order,roles:['backend','backend']}),/Duplicate/);
});
