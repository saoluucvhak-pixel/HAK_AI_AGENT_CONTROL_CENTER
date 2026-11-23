import test from 'node:test';
import assert from 'node:assert/strict';
import {githubCiInvestigation} from '../src/github-ci-investigation.js';
const sha='a'.repeat(40);
test('integrates run, failed jobs, SHA check and source inspection',async()=>{
 const urls=[];
 const fetchImpl=async url=>{urls.push(url);const json=()=>url.includes('/actions/runs/1/jobs')?{jobs:[{id:4,name:'CI',conclusion:'failure'}]}:url.includes('/actions/runs/1')?{id:1,head_sha:sha,status:'completed',conclusion:'failure'}:{type:'file',encoding:'base64',size:4,sha:'blob',content:Buffer.from('test').toString('base64')};return {ok:true,json:async()=>json(),text:async()=>'not ok 1 - tests/example.test.js'}};
 const r=await githubCiInvestigation('HAK_AI_SKILLS',1,{fetchImpl,token:''});
 assert.equal(r.shaVerified,true);assert.equal(r.findings[0].classification,'test-assertion');assert.equal(r.sourceFiles[0].path,'tests/example.test.js');assert.equal(r.sourceFiles[0].content,undefined);assert.equal(r.patchGenerated,false);
});
test('rejects invalid CI run identity before reading jobs',async()=>{let calls=0;await assert.rejects(()=>githubCiInvestigation('HAK_AI_SKILLS',1,{fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({id:2,head_sha:sha})}}}),/identity/);assert.equal(calls,1)});
test('rejects non-allowlisted repositories',async()=>{await assert.rejects(()=>githubCiInvestigation('unknown',1),/allowlisted/)});
