import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptanceOperatorSummary} from '../src/acceptance-operator-summary.js';
const packet={kind:'hak-acceptance-evidence-packet',localChecksPassed:true,checks:[{id:'npm-test',status:'passed'}],connectivity:[{id:'ruflo',status:'not-configured'}],required:[{id:'ruflo-live',status:'missing'},{id:'security-review',status:'missing'}]};
test('local success is not external readiness',()=>{
 const result=acceptanceOperatorSummary(packet);
 assert.equal(result.localBaseline,'passed');assert.equal(result.readyForProduction,false);
 assert.equal(result.pendingGates.length,2);assert.match(result.pendingGates[0].action,/two-agent/);
});
test('failed local check yields actionable priority',()=>{
 const result=acceptanceOperatorSummary({...packet,localChecksPassed:false,checks:[{id:'npm-test',status:'failed'}]});
 assert.equal(result.localBaseline,'needs-attention');assert.deepEqual(result.failedChecks,[{id:'npm-test',status:'failed'}]);
});
test('reject unknown gates and malformed packets',()=>{
 assert.throws(()=>acceptanceOperatorSummary({...packet,required:[{id:'unknown',status:'missing'}]}),/Unknown/);
 assert.throws(()=>acceptanceOperatorSummary(null),/Invalid/);
});
