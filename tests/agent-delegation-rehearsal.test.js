import test from 'node:test';
import assert from 'node:assert/strict';
import {rehearseDelegation} from '../src/agent-delegation-rehearsal.js';
const order={id:'work_1',projectId:'HAK',title:'Review code',description:'Review existing code without changes',acceptanceCriteria:['Review approved','CI passed']};
test('proposes ordered roles but cannot execute or merge',()=>{
 const result=rehearseDelegation({workOrder:order,roles:['architecture','backend','testing','security']});
 assert.equal(result.canExecute,false);assert.equal(result.canMerge,false);assert.equal(result.readyForProduction,false);
 assert.deepEqual(result.tasks.map(x=>x.modelRole),['orchestrator','coder','tester','reviewer']);
 assert.ok(result.tasks.every(x=>x.executionAllowed===false&&x.requiresHumanApproval===true));
});
test('invalid roles and work orders are rejected',()=>{
 assert.throws(()=>rehearseDelegation({workOrder:order,roles:['backend','backend']}),/Duplicate/);
 assert.throws(()=>rehearseDelegation({workOrder:order,roles:['unknown']}),/Unknown/);
 assert.throws(()=>rehearseDelegation({workOrder:{...order,acceptanceCriteria:[]},roles:['testing']}),/criteria/);
});
test('never includes private work order description in delegated task metadata',()=>{
 const result=rehearseDelegation({workOrder:{...order,description:'private-test-marker'},roles:['backend']});
 assert.equal(JSON.stringify(result).includes('private-test-marker'),false);
});
