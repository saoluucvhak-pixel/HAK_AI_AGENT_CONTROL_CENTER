import test from 'node:test';
import assert from 'node:assert/strict';
import {ApprovalStore,scopeHash,canonical} from '../src/approvals.js';

test('scope hash is order independent and content sensitive',()=>{
 assert.equal(scopeHash({a:1,b:[1,2]}),scopeHash({b:[1,2],a:1}));
 assert.notEqual(scopeHash({a:1}),scopeHash({a:2}));
 assert.equal(canonical({z:1,a:{y:2,b:3}}),'{"a":{"b":3,"y":2},"z":1}');
});
test('approval verifies only for the same work order, scope and time window',async()=>{
 let now=1_000_000;
 const store=new ApprovalStore({now:()=>now});
 const scope={tasks:['a']};
 const rec=await store.grant({workOrderId:'w1',projectId:'P',scope,approver:'local-operator',reason:'ok',ttlMs:3600_000});
 assert.equal(store.verify({approvalId:rec.id,workOrderId:'w1',projectId:'P',scope}).valid,true);
 assert.equal(store.verify({approvalId:rec.id,workOrderId:'w2',projectId:'P',scope}).reason,'WRONG_WORK_ORDER');
 assert.equal(store.verify({approvalId:rec.id,workOrderId:'w1',projectId:'Q',scope}).reason,'WRONG_WORK_ORDER');
 assert.equal(store.verify({approvalId:rec.id,workOrderId:'w1',projectId:'P',scope:{tasks:['a','b']}}).reason,'SCOPE_CHANGED');
 assert.equal(store.verify({approvalId:'missing',workOrderId:'w1',projectId:'P',scope}).reason,'NOT_FOUND');
 now+=3600_001;
 assert.equal(store.verify({approvalId:rec.id,workOrderId:'w1',projectId:'P',scope}).reason,'EXPIRED');
});
test('a newer grant supersedes the old one and revoke is final',async()=>{
 const store=new ApprovalStore();
 const a=await store.grant({workOrderId:'w',projectId:'P',scope:{x:1},approver:'op'});
 const b=await store.grant({workOrderId:'w',projectId:'P',scope:{x:1},approver:'op'});
 assert.equal(store.verify({approvalId:a.id,workOrderId:'w',projectId:'P',scope:{x:1}}).reason,'SUPERSEDED');
 await store.revoke(b.id,'test');
 assert.equal(store.verify({approvalId:b.id,workOrderId:'w',projectId:'P',scope:{x:1}}).reason,'REVOKED');
 await assert.rejects(()=>store.grant({workOrderId:'w',projectId:'P',scope:{},approver:''}),/Approver/);
});
