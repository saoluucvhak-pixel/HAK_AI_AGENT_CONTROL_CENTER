import test from 'node:test';
import assert from 'node:assert/strict';
import {githubPatchRecovery} from '../src/github-patch-recovery.js';
const sha='a'.repeat(40),branch='hak-fix/test';
function fake({observed=sha,pr=null,missing=false}={}){const calls=[];const fetchImpl=async url=>{calls.push(url);if(url.includes('/git/ref/heads/'))return missing?{ok:false,status:404}:{ok:true,json:async()=>({object:{sha:observed}})};return {ok:true,json:async()=>pr?[pr]:[]}};return {calls,fetchImpl}}
test('finds existing draft PR and avoids duplicate',async()=>{const x=fake({pr:{number:3,html_url:'https://github.com/example/pull/3',state:'open',head:{sha,ref:branch}}});const r=await githubPatchRecovery('HAK_AI_SKILLS',branch,sha,{fetchImpl:x.fetchImpl});assert.equal(r.prFound,true);assert.equal(r.writeAuthorized,false)});
test('branch drift stops before listing PRs',async()=>{const x=fake({observed:'b'.repeat(40)});const r=await githubPatchRecovery('HAK_AI_SKILLS',branch,sha,{fetchImpl:x.fetchImpl});assert.equal(r.matchingCommit,false);assert.equal(x.calls.length,1)});
test('missing branch reports safe recovery',async()=>{const x=fake({missing:true});const r=await githubPatchRecovery('HAK_AI_SKILLS',branch,sha,{fetchImpl:x.fetchImpl});assert.equal(r.branchExists,false)});
test('branch without PR is not automatically published',async()=>{const x=fake();const r=await githubPatchRecovery('HAK_AI_SKILLS',branch,sha,{fetchImpl:x.fetchImpl});assert.equal(r.prFound,false);assert.equal(r.writeAuthorized,false)});
test('rejects invalid branch and SHA',async()=>{await assert.rejects(()=>githubPatchRecovery('HAK_AI_SKILLS','main',sha),/branch/);await assert.rejects(()=>githubPatchRecovery('HAK_AI_SKILLS',branch,'main'),/SHA/)});
