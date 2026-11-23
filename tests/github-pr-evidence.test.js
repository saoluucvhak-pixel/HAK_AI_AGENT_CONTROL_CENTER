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

test('100 check runs are treated as potentially truncated, never all green',async()=>{
 const checks=Array.from({length:100},(_,i)=>({name:'check-'+i,status:'completed',conclusion:'success'}));
 const r=await githubPrEvidence('HAK_AI_SKILLS',4,{fetchImpl:mock(checks),token:''});
 assert.equal(r.checkListTruncated,true);
 assert.equal(r.evidenceComplete,false);
 assert.equal(r.allChecksPassed,false);
});
test('100 commits are treated as potentially truncated, never all green',async()=>{
 const fetchImpl=async url=>({ok:true,json:async()=>
  url.includes('/pulls/4/commits?')?Array.from({length:100},()=>({sha})):
  url.includes('/check-runs?')?{check_runs:[{name:'CI',status:'completed',conclusion:'success'}]}:
  {head:{sha},state:'open',draft:false}
 });
 const r=await githubPrEvidence('HAK_AI_SKILLS',4,{fetchImpl,token:''});
 assert.equal(r.commitListTruncated,true);
 assert.equal(r.evidenceComplete,false);
 assert.equal(r.allChecksPassed,false);
});
