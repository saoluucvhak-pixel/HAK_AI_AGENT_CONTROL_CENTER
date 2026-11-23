import test from 'node:test';
import assert from 'node:assert/strict';
import {delegationEvidence,verifyDelegationEvidence} from '../src/delegation-evidence.js';
const workOrder={id:'wo_1',projectId:'HAK',title:'Review',description:'Review code',acceptanceCriteria:['CI passes']};
test('valid proposal verifies integrity but never proves execution',()=>{
 const e=delegationEvidence({workOrder,roles:['backend','testing']});
 assert.deepEqual(verifyDelegationEvidence(e),{valid:true,reason:'proposal-integrity-only',executionVerified:false,readyForProduction:false});
});
test('tampering with order, project, roles or hash fails closed',()=>{
 const e=delegationEvidence({workOrder,roles:['backend','testing']});
 for(const mutation of [
  {...e,workOrderId:'wo_2'},
  {...e,projectId:'OTHER'},
  {...e,steps:[{...e.steps[0],agentRole:'quality'},e.steps[1]]},
  {...e,planSha256:'0'.repeat(64)},
  {...e,executionVerified:true},
  {...e,approval:'APPROVED'},
  {...e,readyForProduction:true}
 ])assert.equal(verifyDelegationEvidence(mutation).valid,false);
});
test('invalid duplicate or reordered steps fail closed',()=>{
 const e=delegationEvidence({workOrder,roles:['backend','testing']});
 assert.equal(verifyDelegationEvidence({...e,steps:[e.steps[1],e.steps[0]]}).valid,false);
 assert.equal(verifyDelegationEvidence({...e,steps:[e.steps[0],{...e.steps[1],agentRole:'backend',modelRole:'coder'}]}).valid,false);
 assert.equal(verifyDelegationEvidence(null).valid,false);
});
