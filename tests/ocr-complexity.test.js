import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOcr} from '../src/ocr-evaluation.js';
const item=(expected,actual)=>({approved:true,sensitive:false,expected,actual});
test('large comparison fails before quadratic work',()=>{
 assert.throws(()=>evaluateOcr([item('a'.repeat(20000),'b'.repeat(20000))]),/work budget/);
});
test('aggregate comparison budget is enforced across cases',()=>{
 assert.throws(()=>evaluateOcr([item('a'.repeat(1100),'a'.repeat(1100)),item('b'.repeat(1100),'b'.repeat(1100))]),/work budget/);
});
test('custom limits cannot disable safety cap',()=>{
 assert.throws(()=>evaluateOcr([item('a','a')],{maxDistanceCells:Infinity}),/Invalid maxDistanceCells/);
 assert.throws(()=>evaluateOcr([item('a','a')],{maxDistanceCells:999999999}),/Invalid maxDistanceCells/);
});
test('normal Vietnamese comparisons remain supported',()=>{
 const r=evaluateOcr([item('Phiếu cân','Phiếu cân')]);
 assert.equal(r.exactMatches,1);
});
