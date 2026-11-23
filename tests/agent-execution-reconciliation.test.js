import test from 'node:test';
import assert from 'node:assert/strict';
import {delegationEvidence} from '../src/delegation-evidence.js';
import {reconcileAgentExecution} from '../src/agent-execution-reconciliation.js';
const workOrder={id:'wo_3',projectId:'HAK',title:'Review',description:'Review source',acceptanceCriteria:['Tests pass']};
const proposal=delegationEvidence({workOrder,roles:['backend','testing']});
const event=(step,status)=>({taskId:'wo_3:'+step,agentId:step===1?'backend':'testing',status});
test('empty observer log cannot prove execution',()=>{
 const r=reconcileAgentExecution({proposal,events:[]});
 assert.equal(r.allPassed,false);assert.equal(r.executionVerified,false);assert.equal(r.readyForProduction,false);
});
test('self-reported passed steps still cannot certify real execution',()=>{
 const r=reconcileAgentExecution({proposal,events:[event(1,'queued'),event(1,'running'),event(1,'passed'),event(2,'running'),event(2,'passed')]});
 assert.equal(r.allPassed,true);assert.equal(r.executionVerified,false);assert.equal(r.providerVerified,false);
});
test('reject unknown agents and invalid state regressions',()=>{
 assert.throws(()=>reconcileAgentExecution({proposal,events:[{...event(1,'passed'),agentId:'unknown'}]}),/Unexpected/);
 assert.throws(()=>reconcileAgentExecution({proposal,events:[event(1,'passed'),event(1,'running')]}),/transition/);
 assert.throws(()=>reconcileAgentExecution({proposal:{...proposal,planSha256:'0'.repeat(64)},events:[]}),/Invalid delegation/);
});
