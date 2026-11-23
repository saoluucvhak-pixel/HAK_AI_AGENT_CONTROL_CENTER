import test from 'node:test';
import assert from 'node:assert/strict';
import {delegationEvidence} from '../src/delegation-evidence.js';
import {agentAcceptanceGaps} from '../src/agent-acceptance-gaps.js';
const proposal=delegationEvidence({workOrder:{id:'wo_4',projectId:'HAK',title:'Review',description:'Review code',acceptanceCriteria:['Tests pass']},roles:['backend']});
test('empty evidence produces all six missing gates',()=>{
 const r=agentAcceptanceGaps({proposal,events:[]});
 assert.equal(r.missing.length,6);assert.equal(r.readyForProduction,false);
});
test('unverified references cannot certify provider execution',()=>{
 const r=agentAcceptanceGaps({proposal,events:[{taskId:'wo_4:1',agentId:'backend',status:'running'},{taskId:'wo_4:1',agentId:'backend',status:'passed'}],artifacts:[{kind:'provider-trace',reference:'local-trace-123'},{kind:'ci-run',reference:'github-actions-123'}]});
 assert.equal(r.observerAllPassed,true);assert.equal(r.executionVerified,false);
 assert.ok(r.required.every(x=>x.independentlyVerified===false));
 assert.equal(r.missing.length,4);
});
test('rejects duplicate and unsafe artifact references',()=>{
 assert.throws(()=>agentAcceptanceGaps({proposal,events:[],artifacts:[{kind:'ci-run',reference:'run-1'},{kind:'ci-run',reference:'run-2'}]}),/duplicate/);
 assert.throws(()=>agentAcceptanceGaps({proposal,events:[],artifacts:[{kind:'provider-trace',reference:'secret token here'}]}),/reference/);
});
