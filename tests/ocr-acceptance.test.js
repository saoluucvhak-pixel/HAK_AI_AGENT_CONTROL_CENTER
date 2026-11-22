import test from 'node:test';
import assert from 'node:assert/strict';
import {runOcrAcceptance} from '../src/ocr-acceptance.js';
const dataset=[{approved:true,sensitive:false,expected:'HAK TEST',actual:'HAK TEST'}];
const read=async()=>JSON.stringify(dataset);
test('offline OCR acceptance passes approved exact text but never claims production readiness',async()=>{
 const result=await runOcrAcceptance({filePath:'private.json',read});
 assert.equal(result.passed,true);assert.equal(result.readyForProduction,false);
 assert.ok(!JSON.stringify(result).includes('HAK TEST'));assert.ok(!JSON.stringify(result).includes('private.json'));
});
test('OCR acceptance fails threshold for mismatched text',async()=>{
 const result=await runOcrAcceptance({filePath:'private.json',read:async()=>JSON.stringify([{approved:true,sensitive:false,expected:'ABCD',actual:'AXCD'}])});
 assert.equal(result.passed,false);assert.equal(result.characterErrorRate,0.25);
});
test('OCR acceptance rejects unapproved cases and invalid thresholds',async()=>{
 await assert.rejects(runOcrAcceptance({filePath:'private.json',read:async()=>JSON.stringify([{approved:false,sensitive:false,expected:'A',actual:'A'}])}));
 for(const threshold of ['NaN','-1','1.1','0.2junk'])await assert.rejects(runOcrAcceptance({filePath:'private.json',threshold,read}));
});
test('OCR acceptance rejects oversized dataset before parsing',async()=>{
 await assert.rejects(runOcrAcceptance({filePath:'private.json',read:async()=>('x'.repeat(300001))}),/exceeds/);
});
