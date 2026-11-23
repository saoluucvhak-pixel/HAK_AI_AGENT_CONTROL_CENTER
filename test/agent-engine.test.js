import test from 'node:test';
import assert from 'node:assert/strict';
import {executeApprovedWorkOrder} from '../src/agent-engine.js';
const workOrder={id:'HAKENG1',projectId:'HAK',title:'Review module',description:'Inspect non-sensitive module architecture',acceptanceCriteria:['Produce a reviewable report']};
const approval={approved:true,workOrderId:'HAKENG1',approvedBy:'operator1',reason:'Approved low-risk local review'};
const env={HAK_AGENT_EXECUTION_ENABLED:'true',HAK_OMNIROUTE_ENABLED:'true'};
test('no model calls without explicit approval and opt-in',async()=>{
 let called=0;const modelRunner=async()=>{called++;return {answer:'ok'}};
 await assert.rejects(executeApprovedWorkOrder({workOrder,roles:['testing'],env,modelRunner}),/approval/);
 await assert.rejects(executeApprovedWorkOrder({workOrder,roles:['testing'],approval:{...approval,workOrderId:'OTHER'},env,modelRunner}),/approval/);
 await assert.rejects(executeApprovedWorkOrder({workOrder,roles:['testing'],approval,env:{},modelRunner}),/disabled/);
 assert.equal(called,0);
});
test('two sequential agent outputs are hashed, not exposed, and require review',async()=>{
 const events=[];const prompts=[];
 const result=await executeApprovedWorkOrder({workOrder,roles:['architecture','testing'],approval,env,
  modelRunner:async(task)=>{prompts.push(task);return {answer:'private generated text',model:'mock-model'}},
  onEvent:async(e)=>events.push(e)});
 assert.equal(result.completed,true);assert.equal(result.steps.length,2);
 assert.deepEqual(events.map(e=>e.status),['queued','running','passed','queued','running','passed']);
 assert.deepEqual(prompts.map(p=>p.role),['orchestrator','tester']);
 assert.ok(result.steps.every(s=>s.outputSha256.length===64&&s.humanReviewRequired));
 assert.ok(!JSON.stringify(result).includes('private generated text'));
 assert.equal(result.providerIdentityVerified,false);assert.equal(result.readyForProduction,false);
});
test('failure stops later agents and cannot certify completion',async()=>{
 let calls=0;const events=[];
 const result=await executeApprovedWorkOrder({workOrder,roles:['architecture','testing'],approval,env,
  modelRunner:async()=>{calls++;throw Error('provider secret failure')},onEvent:async(e)=>events.push(e)});
 assert.equal(calls,1);assert.equal(result.completed,false);assert.equal(result.steps[0].status,'failed');
 assert.deepEqual(events.map(e=>e.status),['queued','running','failed']);
 assert.ok(!JSON.stringify(result).includes('provider secret failure'));
});
test('reject duplicate and unknown roles before execution',async()=>{
 await assert.rejects(executeApprovedWorkOrder({workOrder,roles:['testing','testing'],approval,env}),/Duplicate/);
 await assert.rejects(executeApprovedWorkOrder({workOrder,roles:['unknown'],approval,env}),/Unknown/);
});
