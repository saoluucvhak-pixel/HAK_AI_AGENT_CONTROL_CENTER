import test from 'node:test';
import assert from 'node:assert/strict';
import {githubPatchPreflight} from '../src/github-patch-preflight.js';
const sha='a'.repeat(40),blob='b'.repeat(40);
const proposal={repository:'HAK_AI_SKILLS',runId:1,baseSha:sha,rationale:'Fix CI assertion with a minimal change',changes:[{path:'tests/example.test.js',expectedBlobSha:blob,newContent:'assert.ok(true);'}]};
function mock({runSha=sha,blobSha=blob,runStatus='completed',runConclusion='success'}={}){return async url=>({ok:true,json:async()=>url.includes('/actions/runs/')?{id:1,head_sha:runSha,status:runStatus,conclusion:runConclusion,name:'Operations Dashboard CI',event:'push',head_branch:'main',repository:{full_name:'saoluucvhak-pixel/HAK_AI_SKILLS'},head_repository:{full_name:'saoluucvhak-pixel/HAK_AI_SKILLS'}}:{type:'file',encoding:'base64',size:4,sha:blobSha,content:Buffer.from('test').toString('base64')}})}
test('matches run SHA and blob but never authorizes write',async()=>{const r=await githubPatchPreflight(proposal,{fetchImpl:mock()});assert.equal(r.allPreconditionsMatch,true);assert.equal(r.writeAuthorized,false)});
test('mismatched blob fails precondition',async()=>{const r=await githubPatchPreflight(proposal,{fetchImpl:mock({blobSha:'c'.repeat(40)})});assert.equal(r.allPreconditionsMatch,false)});
test('mismatched CI SHA blocks source inspection',async()=>{let calls=0;await assert.rejects(()=>githubPatchPreflight(proposal,{fetchImpl:async url=>{calls++;return mock({runSha:'c'.repeat(40)})(url)}}),/SHA mismatch/);assert.equal(calls,1)});

test('blocks failed, cancelled or unfinished CI even when SHA matches',async()=>{
 for(const cfg of [{runStatus:'completed',runConclusion:'failure'},{runStatus:'completed',runConclusion:'cancelled'},{runStatus:'in_progress',runConclusion:null}]){
  let calls=0;
  await assert.rejects(()=>githubPatchPreflight(proposal,{fetchImpl:async url=>{calls++;return mock(cfg)(url)}}),/not completed successfully/);
  assert.equal(calls,1);
 }
});

test('rejects successful CI from wrong workflow, event, branch or repository',async()=>{
 const valid={id:1,head_sha:sha,status:'completed',conclusion:'success',name:'Operations Dashboard CI',event:'push',head_branch:'main',repository:{full_name:'saoluucvhak-pixel/HAK_AI_SKILLS'},head_repository:{full_name:'saoluucvhak-pixel/HAK_AI_SKILLS'}};
 const invalid=[
  {name:'Unrelated CI'}, {event:'pull_request'}, {head_branch:'feature/unsafe'},
  {repository:{full_name:'other/HAK_AI_SKILLS'}},
  {head_repository:{full_name:'other/HAK_AI_SKILLS'}},
  {head_repository:null}
 ];
 for(const fields of invalid){
  let calls=0;
  const fetchImpl=async url=>{calls++;return {ok:true,json:async()=>({...valid,...fields})}};
  await assert.rejects(()=>githubPatchPreflight(proposal,{fetchImpl}),/CI run identity/);
  assert.equal(calls,1,'untrusted CI must stop before source inspection');
 }
});
