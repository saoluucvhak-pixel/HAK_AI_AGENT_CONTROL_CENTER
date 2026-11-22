import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOcr} from '../src/ocr-evaluation.js';
const item=(expected,actual)=>({approved:true,sensitive:false,expected,actual});
test('OCR exact and edit distance metrics',()=>{
 const r=evaluateOcr([item('ABC','ABC'),item('abc','axc')]);
 assert.equal(r.caseCount,2);assert.equal(r.exactMatches,1);assert.equal(r.characterErrorRate,1/6);
 assert.equal(r.readyForProduction,false);
});
test('reject missing consent or sensitive cases',()=>{
 assert.throws(()=>evaluateOcr([{expected:'A',actual:'A',approved:true}]));
 assert.throws(()=>evaluateOcr([{...item('A','A'),sensitive:true}]));
 assert.throws(()=>evaluateOcr([]));
});
test('report excludes transcription text',()=>{
 const r=evaluateOcr([item('private-test-value','private-test-valux')]);
 assert.ok(!JSON.stringify(r).includes('private-test'));
});
test('Unicode Vietnamese text NFC and CRLF are normalized',()=>{
 const r=evaluateOcr([item('Tiếng Việt\r\nA','Tiếng Việt\nA')]);
 assert.equal(r.exactMatches,1);
});
