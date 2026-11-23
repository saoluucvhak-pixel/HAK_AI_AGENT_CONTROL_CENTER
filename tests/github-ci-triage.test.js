import test from 'node:test';
import assert from 'node:assert/strict';
import {triageGithubJobLog,githubFailedJobTriage} from '../src/github-ci-triage.js';
test('classifies Windows port permission error',()=>{const x=triageGithubJobLog('Error: listen EACCES: permission denied 127.0.0.1:49370');assert.equal(x.classification,'network-port-permission');assert.equal(x.automatedFixApplied,false)});
test('classifies test assertion and no execution',()=>{const x=triageGithubJobLog('not ok 4 - tests/example.test.js');assert.equal(x.classification,'test-assertion');assert.ok(x.fileHints.length>0)});
test('unknown logs do not invent cause',()=>{const x=triageGithubJobLog('Unrecognized failure');assert.equal(x.classification,'unclassified')});
test('only failed jobs are fetched',async()=>{
 const urls=[];
 const fetchImpl=async url=>{urls.push(url);return {ok:true,json:async()=>({jobs:[{id:10,name:'failed',conclusion:'failure'},{id:11,name:'green',conclusion:'success'}]}),text:async()=> 'SyntaxError: Unexpected token'}};
 const r=await githubFailedJobTriage('HAK_AI_SKILLS',123,{fetchImpl,token:''});
 assert.equal(urls.length,2);assert.equal(r.reports[0].classification,'syntax-error');assert.equal(r.readyToMerge,false);
});
test('unknown repository blocked',async()=>{await assert.rejects(()=>githubFailedJobTriage('wrong',1),/allowlisted/)});
