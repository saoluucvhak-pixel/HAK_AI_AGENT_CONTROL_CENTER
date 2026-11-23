import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPatchPr,classifyPatchRun,githubPatchStatus} from '../src/github-patch-status.js';
test('acceptance draft requires human review and never auto-merges',()=>{
 const pr=classifyPatchPr({number:67,title:'fixture',draft:true,state:'open',head:{ref:'hak-fix/acceptance-45109874656',sha:'a'.repeat(40)},html_url:'https://github.com/example',merged_at:null});
 assert.equal(pr.stage,'review-required');assert.match(pr.nextAction,/do not merge/);assert.equal(classifyPatchPr({head:{ref:'feature/unrelated'}}),null);
});
test('failed runs suggest log inspection and recovery',()=>{
 const r=classifyPatchRun({id:3,status:'completed',conclusion:'failure'});
 assert.equal(r.status,'failed');assert.match(r.nextAction,/recovery/);
});
test('fetches only read-only GitHub status and filters workflow runs',async()=>{
 const urls=[];
 const fetchImpl=async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('/runs?')?{workflow_runs:[{id:1,name:'GitHub Patch Live Acceptance (manual only)',event:'workflow_dispatch',status:'completed',conclusion:'success'},{id:2,name:'Other',event:'push'}]}:[{number:67,title:'test',state:'open',draft:true,head:{ref:'hak-fix/acceptance-123',sha:'a'.repeat(40)}}]}};
 const result=await githubPatchStatus({fetchImpl,token:''});
 assert.equal(result.runs.length,1);assert.equal(result.prs.length,1);assert.equal(result.readOnly,true);assert.equal(urls.length,2);
});
