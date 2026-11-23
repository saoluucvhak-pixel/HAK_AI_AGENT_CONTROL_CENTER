import test from 'node:test';
import assert from 'node:assert/strict';
import {githubRemediationContext} from '../src/github-remediation-context.js';
const sha='a'.repeat(40);
const report={kind:'hak-github-ci-failure-report',repository:'HAK_AI_SKILLS',runId:12,reports:[{jobId:8,classification:'test-assertion',fileHints:['tests/example.test.js','tests/example.test.js']}]};
test('collects unique source paths pinned to commit',async()=>{
 const urls=[];const fetchImpl=async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('/actions/runs/')?{id:12,head_sha:sha,status:'completed',conclusion:'failure'}:{type:'file',encoding:'base64',size:4,sha:'blob',content:Buffer.from('test').toString('base64')}}};
 const x=await githubRemediationContext(report,sha,{fetchImpl,token:''});
 assert.equal(urls.length,2);assert.match(urls[1],/ref=aaaaaaaa/);assert.equal(x.sourceFiles[0].content,'test');assert.equal(x.patchGenerated,false);
});
test('empty file hints avoid unnecessary network access',async()=>{const x=await githubRemediationContext({...report,reports:[{jobId:8,classification:'unclassified'}]},sha,{fetchImpl:async()=>({ok:true,json:async()=>({id:12,head_sha:sha})})});assert.equal(x.sourceFiles.length,0);assert.ok(x.sourceInspectionSkipped)});
test('rejects mutable refs',async()=>{await assert.rejects(()=>githubRemediationContext(report,'main'),/SHA/)});

test('SHA mismatch prevents any source read',async()=>{const urls=[];const fetchImpl=async url=>{urls.push(url);return {ok:true,json:async()=>({id:12,head_sha:'b'.repeat(40)})}};await assert.rejects(()=>githubRemediationContext(report,sha,{fetchImpl}),/SHA mismatch/);assert.equal(urls.length,1)});
