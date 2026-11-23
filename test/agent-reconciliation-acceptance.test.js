import test from 'node:test';
import assert from 'node:assert/strict';
import {delegationEvidence} from '../src/delegation-evidence.js';
import {reconcileAgentExecution} from '../src/agent-execution-reconciliation.js';
import {agentAcceptanceGaps} from '../src/agent-acceptance-gaps.js';
const proposal=delegationEvidence({workOrder:{id:'HAKTEST1',projectId:'HAKTEST',title:'Verify isolated agent reporting',description:'Test safe reconciliation only',acceptanceCriteria:['State changes are validated']},roles:['testing']});
const id=proposal.workOrderId+':1';
const event=status=>({taskId:id,agentId:'testing',status});
test('observer PASS is not proof of provider execution or production acceptance',()=>{
 const events=[event('queued'),event('running'),event('passed')];
 const result=reconcileAgentExecution({proposal,events});
 assert.equal(result.allPassed,true);
 assert.equal(result.executionVerified,false);
 assert.equal(result.providerVerified,false);
 assert.equal(result.readyForProduction,false);
 const gaps=agentAcceptanceGaps({proposal,events,artifacts:[]});
 assert.equal(gaps.observerAllPassed,true);
 assert.equal(gaps.readyForProduction,false);
 assert.ok(gaps.missing.includes('provider-trace'));
});
test('reject terminal state changes and forged agent identity',()=>{
 assert.throws(()=>reconcileAgentExecution({proposal,events:[event('queued'),event('passed'),event('running')]}),/Invalid agent status transition/);
 assert.throws(()=>reconcileAgentExecution({proposal,events:[{...event('queued'),agentId:'imposter'}]}),/Unexpected task or agent/);
});
test('artifact references cannot certify production',()=>{
 const artifacts=['human-approval','provider-trace','output-review','ci-run','security-review','desktop-acceptance'].map((kind,i)=>({kind,reference:'evidence-'+i}));
 const gaps=agentAcceptanceGaps({proposal,events:[event('queued'),event('running'),event('passed')],artifacts});
 assert.deepEqual(gaps.missing,[]);
 assert.equal(gaps.executionVerified,false);
 assert.equal(gaps.readyForProduction,false);
 assert.ok(gaps.required.every(x=>x.independentlyVerified===false));
});
