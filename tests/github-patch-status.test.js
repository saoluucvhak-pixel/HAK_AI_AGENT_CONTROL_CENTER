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

test('production patch PRs are visible without acceptance run ID',()=>{
 const pr=classifyPatchPr({number:80,title:'patch',draft:true,state:'open',head:{ref:'hak-fix/production-fix',sha:'a'.repeat(40)}});
 assert.equal(pr.kind,'patch');assert.equal(pr.runId,null);assert.equal(pr.stage,'review-required');
});
test('cancelled and unknown workflow conclusions are not classified as success',()=>{
 assert.equal(classifyPatchRun({id:1,status:'completed',conclusion:'cancelled'}).status,'needs-attention');
 assert.equal(classifyPatchRun({id:2,status:'mystery'}).status,'unknown');
});
test('status exposes completeness when PR list fits first page',async()=>{
 const fetchImpl=async url=>({ok:true,json:async()=>url.includes('/runs?')?{workflow_runs:[]}:[]});
 const result=await githubPatchStatus({fetchImpl,token:''});
 assert.equal(result.complete,true);assert.equal(result.readOnly,true);
});

test('paginates 100 PRs and includes patch on next page',async()=>{
 const first=Array.from({length:100},(_,i)=>({number:i+1,state:'closed',draft:false,head:{ref:'feature/unrelated'}}));
 const second=[{number:101,title:'patch',state:'open',draft:true,head:{ref:'hak-fix/production-fix',sha:'a'.repeat(40)}}];
 const urls=[];
 const fetchImpl=async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('/runs?')?{workflow_runs:[]}:url.includes('page=2')?second:first}};
 const result=await githubPatchStatus({fetchImpl,token:''});
 assert.equal(result.complete,true);assert.equal(result.prs.length,1);assert.equal(result.prs[0].number,101);
 assert.equal(urls.length,3);
});
test('fails closed on invalid GitHub response',async()=>{
 const fetchImpl=async url=>({ok:true,json:async()=>url.includes('/runs?')?{}:[]});
 await assert.rejects(()=>githubPatchStatus({fetchImpl,token:''}),/Invalid GitHub/);
});
