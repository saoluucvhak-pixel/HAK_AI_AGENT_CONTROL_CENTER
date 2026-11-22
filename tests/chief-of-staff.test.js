import test from 'node:test';import assert from 'node:assert/strict';
import {createWorkOrder,proposeDelegation,canMerge,reportSummary} from '../src/chief-of-staff.js';
const request={id:'task_1',projectId:'LUONG_HAK',title:'Review payroll',description:'Validate KPI and overtime calculations',acceptanceCriteria:['Unit tests pass','CI green']};
test('creates proposed work order requiring approval',()=>{const o=createWorkOrder(request);assert.equal(o.status,'PROPOSED');assert.equal(o.requiresApproval,true);});
test('rejects missing acceptance criteria',()=>assert.throws(()=>createWorkOrder({...request,acceptanceCriteria:[]})));
test('delegation is a proposal, not execution',()=>{const p=proposeDelegation(createWorkOrder(request),['backend','testing']);assert.equal(p.canExecute,false);assert.equal(p.approval,'PENDING');});
test('rejects duplicate or unknown agents',()=>{const o=createWorkOrder(request);assert.throws(()=>proposeDelegation(o,['backend','backend']));assert.throws(()=>proposeDelegation(o,['root']));});
test('merge requires all five gates',()=>{const ok={ci:'passed',review:'approved',approval:'approved',conflicts:false,security:'passed'};assert.equal(canMerge(ok),true);assert.equal(canMerge({...ok,ci:'queued'}),false);assert.equal(canMerge({...ok,approval:'pending'}),false);});
test('status summary',()=>assert.deepEqual(reportSummary([{status:'PROPOSED'},{status:'BLOCKED'}]),{total:2,counts:{PROPOSED:1,APPROVED:0,RUNNING:0,BLOCKED:1,COMPLETED:0}}));
