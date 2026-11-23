import test from 'node:test';
import assert from 'node:assert/strict';
import {githubVerifiedCiRun} from '../src/github-ci-run-verification.js';
const sha='a'.repeat(40);
const mock=(id,head_sha)=>async()=>({ok:true,json:async()=>({id,head_sha,status:'completed',conclusion:'failure',name:'Operations Dashboard CI',event:'push',head_branch:'main',repository:{full_name:'saoluucvhak-pixel/HAK_AI_SKILLS'},head_repository:{full_name:'saoluucvhak-pixel/HAK_AI_SKILLS'}})});
test('accepts exact run and source SHA',async()=>{const r=await githubVerifiedCiRun('HAK_AI_SKILLS',10,sha,{fetchImpl:mock(10,sha)});assert.equal(r.verified,true);assert.equal(r.readyForSourceInspection,true)});
test('rejects different commit or run identity',async()=>{assert.equal((await githubVerifiedCiRun('HAK_AI_SKILLS',10,sha,{fetchImpl:mock(10,'b'.repeat(40))})).verified,false);assert.equal((await githubVerifiedCiRun('HAK_AI_SKILLS',10,sha,{fetchImpl:mock(11,sha)})).verified,false)});
test('rejects mutable refs and unknown repositories',async()=>{await assert.rejects(()=>githubVerifiedCiRun('HAK_AI_SKILLS',10,'main'),/SHA/);await assert.rejects(()=>githubVerifiedCiRun('other',10,sha),/allowlisted/)});
