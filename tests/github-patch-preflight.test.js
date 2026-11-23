import test from 'node:test';
import assert from 'node:assert/strict';
import {githubPatchPreflight} from '../src/github-patch-preflight.js';
const sha='a'.repeat(40),blob='b'.repeat(40);
const proposal={repository:'HAK_AI_SKILLS',runId:1,baseSha:sha,rationale:'Fix CI assertion with a minimal change',changes:[{path:'tests/example.test.js',expectedBlobSha:blob,newContent:'assert.ok(true);'}]};
function mock({runSha=sha,blobSha=blob}={}){return async url=>({ok:true,json:async()=>url.includes('/actions/runs/')?{id:1,head_sha:runSha}:{type:'file',encoding:'base64',size:4,sha:blobSha,content:Buffer.from('test').toString('base64')}})}
test('matches run SHA and blob but never authorizes write',async()=>{const r=await githubPatchPreflight(proposal,{fetchImpl:mock()});assert.equal(r.allPreconditionsMatch,true);assert.equal(r.writeAuthorized,false)});
test('mismatched blob fails precondition',async()=>{const r=await githubPatchPreflight(proposal,{fetchImpl:mock({blobSha:'c'.repeat(40)})});assert.equal(r.allPreconditionsMatch,false)});
test('mismatched CI SHA blocks source inspection',async()=>{let calls=0;await assert.rejects(()=>githubPatchPreflight(proposal,{fetchImpl:async url=>{calls++;return mock({runSha:'c'.repeat(40)})(url)}}),/SHA mismatch/);assert.equal(calls,1)});
