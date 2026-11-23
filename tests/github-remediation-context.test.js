import test from 'node:test';
import assert from 'node:assert/strict';
import {githubRemediationContext} from '../src/github-remediation-context.js';
const sha='a'.repeat(40);
const report={kind:'hak-github-ci-failure-report',repository:'HAK_AI_SKILLS',runId:12,reports:[{jobId:8,classification:'test-assertion',fileHints:['tests/example.test.js','tests/example.test.js']}]};
test('collects unique source paths pinned to commit',async()=>{
 const urls=[];const fetchImpl=async url=>{urls.push(url);return {ok:true,json:async()=>({type:'file',encoding:'base64',size:4,sha:'blob',content:Buffer.from('test').toString('base64')})}};
 const x=await githubRemediationContext(report,sha,{fetchImpl,token:''});
 assert.equal(urls.length,1);assert.match(urls[0],/ref=aaaaaaaa/);assert.equal(x.sourceFiles[0].content,'test');assert.equal(x.patchGenerated,false);
});
test('empty file hints avoid unnecessary network access',async()=>{const x=await githubRemediationContext({...report,reports:[{jobId:8,classification:'unclassified'}]},sha,{fetchImpl:()=>{throw Error('unexpected')}});assert.equal(x.sourceFiles.length,0);assert.ok(x.sourceInspectionSkipped)});
test('rejects mutable refs',async()=>{await assert.rejects(()=>githubRemediationContext(report,'main'),/SHA/)});
