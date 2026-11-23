import test from 'node:test';
import assert from 'node:assert/strict';
import {githubPrEvidence} from '../src/github-pr-evidence.js';
const sha='a'.repeat(40);
function mock(checkRuns){return async url=>({ok:true,json:async()=>url.includes('/pulls/4/commits?')?[{sha}]:url.includes('/check-runs?')?{check_runs:checkRuns.map((c,i)=>({id:i+1,...c})),total_count:checkRuns.length}: {head:{sha},state:'open',draft:false}});}
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


test('paginates check runs and accepts complete evidence',async()=>{
 const fetchImpl=async url=>({ok:true,json:async()=>url.includes('/commits?')?[{sha}]:url.includes('/check-runs?')?{total_count:2,check_runs:url.includes('page=2')?[{id:2,name:'Windows',status:'completed',conclusion:'success'}]:[{id:1,name:'Ubuntu',status:'completed',conclusion:'success'}]}:{head:{sha},state:'open',draft:false}});
 const result=await githubPrEvidence('HAK_AI_SKILLS',4,{fetchImpl,token:''});
 assert.equal(result.evidenceComplete,true);assert.equal(result.checks.length,2);assert.equal(result.allChecksPassed,true);
});
test('fails closed on duplicate or incomplete check pages',async()=>{
 const fetchImpl=async url=>({ok:true,json:async()=>url.includes('/commits?')?[{sha}]:url.includes('/check-runs?')?{total_count:101,check_runs:[{id:1,name:'CI',status:'completed',conclusion:'success'}]}:{head:{sha},state:'open',draft:false}});
 const result=await githubPrEvidence('HAK_AI_SKILLS',4,{fetchImpl,token:''});
 assert.equal(result.evidenceComplete,false);assert.equal(result.checkListTruncated,true);assert.equal(result.allChecksPassed,false);
});
test('paginates 100 commits and detects duplicate evidence',async()=>{
 const fetchImpl=async url=>({ok:true,json:async()=>url.includes('/commits?')?(url.includes('page=2')?[{sha}]:Array.from({length:100},(_,i)=>({sha:String(i)}))):url.includes('/check-runs?')?{total_count:1,check_runs:[{id:1,name:'CI',status:'completed',conclusion:'success'}]}:{head:{sha},state:'open',draft:false}});
 const result=await githubPrEvidence('HAK_AI_SKILLS',4,{fetchImpl,token:''});
 assert.equal(result.commitCountObserved,101);assert.equal(result.commitListTruncated,false);assert.equal(result.evidenceComplete,true);
});
test('fails closed if commit pagination repeats rows',async()=>{
 const fetchImpl=async url=>({ok:true,json:async()=>url.includes('/commits?')?Array.from({length:100},(_,i)=>({sha:String(i)})):url.includes('/check-runs?')?{total_count:1,check_runs:[{id:1,name:'CI',status:'completed',conclusion:'success'}]}:{head:{sha},state:'open',draft:false}});
 const result=await githubPrEvidence('HAK_AI_SKILLS',4,{fetchImpl,token:''});
 assert.equal(result.commitListTruncated,true);assert.equal(result.allChecksPassed,false);
});
