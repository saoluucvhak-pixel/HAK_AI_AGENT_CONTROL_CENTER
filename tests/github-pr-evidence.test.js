import test from 'node:test';
import assert from 'node:assert/strict';
import {githubPrEvidence} from '../src/github-pr-evidence.js';
const sha='a'.repeat(40);
function mock(checkRuns){return async url=>({ok:true,json:async()=>url.includes('/pulls/4/commits?')?[{sha}]:url.includes('/check-runs?')?{check_runs:checkRuns}: {head:{sha},state:'open',draft:false}});}
test('green CI does not certify review or merge',async()=>{
 const r=await githubPrEvidence('HAK_CODE_QUALITY_TEST',4,{fetchImpl:mock([{name:'node windows',status:'completed',conclusion:'success'},{name:'node ubuntu',status:'completed',conclusion:'success'}]),token:''});
 assert.equal(r.allChecksPassed,true);assert.equal(r.readyToMerge,false);assert.equal(r.codeReviewed,false);assert.equal(r.headSha,sha);
});
test('missing and failing checks fail closed',async()=>{
 for(const rows of [[],[{name:'CI',status:'completed',conclusion:'failure'}]]){
 const r=await githubPrEvidence('HAK_AI_SKILLS',4,{fetchImpl:mock(rows),token:''});assert.equal(r.allChecksPassed,false);
 }
});
test('repository and PR number are restricted',async()=>{
 await assert.rejects(()=>githubPrEvidence('../x',1),/allowlisted/);
 await assert.rejects(()=>githubPrEvidence('HAK_AI_SKILLS',0),/Invalid PR/);
});
test('GitHub 403 propagates as error',async()=>{
 await assert.rejects(()=>githubPrEvidence('HAK_AI_SKILLS',4,{fetchImpl:async()=>({ok:false,status:403})}),/403/);
});
