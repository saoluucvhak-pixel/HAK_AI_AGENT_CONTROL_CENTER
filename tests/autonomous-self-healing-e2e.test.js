import test from 'node:test';
import assert from 'node:assert/strict';
import {runOrchestratedMission} from '../src/orchestrator.js';

test('autonomous-self-healing-e2e: end-to-end mission generates code, self-heals test failure, and creates Draft PR', async () => {
 const baseSha='1'.repeat(40);
 const existingBlobSha='2'.repeat(40);
 const treeSha='3'.repeat(40);
 const newCommitSha='4'.repeat(40);
 const existingPath='app/main/calculator.js';

 const gitHubStore={
  branches:new Map(),
  commits:[],
  pullRequests:[]
 };

 const mockFetch=async(url,opts={})=>{
  const u=String(url);
  const method=opts.method||'GET';

  // 1. Repo identity
  if(u.endsWith('/repos/saoluucvhak-pixel/HAK_VC_NB')){
   return {ok:true,status:200,json:async()=>({full_name:'saoluucvhak-pixel/HAK_VC_NB',default_branch:'main',archived:false,disabled:false})};
  }

  // 2. Ref heads main
  if(u.includes('/git/ref/heads/main')){
   return {ok:true,status:200,json:async()=>({object:{sha:baseSha}})};
  }
  if(u.includes('/git/ref/heads/hak-fix/')){
   return {ok:true,status:200,json:async()=>({object:{sha:newCommitSha}})};
  }

  // 3. CI runs
  if(u.includes('/actions/runs/99')){
   return {ok:true,status:200,json:async()=>({id:99,head_sha:baseSha,status:'completed',conclusion:'success'})};
  }
  if(u.includes('/actions/runs')){
   return {
    ok:true,status:200,
    json:async()=>({
     workflow_runs:[{id:99,name:'CI',head_sha:baseSha,conclusion:'success',status:'completed',html_url:'https://github.com/example/runs/99'}]
    })
   };
  }

  // 4. Skills
  if(u.includes('/HAK_AI_SKILLS/contents/')){
   const m=u.match(/\/HAK_AI_SKILLS\/contents\/([^/]+)\/SKILL\.md/);
   const skillName=m?m[1]:'hak-code-auditor';
   const raw=`---\nname: ${skillName}\ndescription: "Audit and verify code according to HAK standards"\n---\nReview code strictly.`;
   return {
    ok:true,status:200,
    json:async()=>({
     type:'file',
     name:'SKILL.md',
     path:`${skillName}/SKILL.md`,
     sha:'skill_sha_'+skillName,
     size:Buffer.byteLength(raw,'utf8'),
     encoding:'base64',
     content:Buffer.from(raw,'utf8').toString('base64')
    })
   };
  }

  // 5. Source file content
  if(u.includes('/contents/app/main/calculator.js')){
   const raw='export function multiply(a, b){ return a + b; }'; // initial buggy code
   return {
    ok:true,status:200,
    json:async()=>({
     type:'file',
     path:'app/main/calculator.js',
     sha:existingBlobSha,
     size:Buffer.byteLength(raw,'utf8'),
     encoding:'base64',
     content:Buffer.from(raw,'utf8').toString('base64')
    })
   };
  }

  // 6. Commits and Trees
  if(u.includes('/git/commits/')&&method==='GET'){
   return {ok:true,status:200,json:async()=>({tree:{sha:treeSha}})};
  }
  if(u.includes('/git/trees/')&&method==='GET'){
   return {ok:true,status:200,json:async()=>({truncated:false,tree:[{path:existingPath,type:'blob',mode:'100644',sha:existingBlobSha}]})};
  }
  if(u.includes('/git/blobs')&&method==='POST'){
   const body=JSON.parse(opts.body);
   return {ok:true,status:201,json:async()=>({sha:'blob_'+Date.now(),size:body.content.length})};
  }
  if(u.endsWith('/git/trees')&&method==='POST'){
   return {ok:true,status:201,json:async()=>({sha:treeSha})};
  }
  if(u.endsWith('/git/commits')&&method==='POST'){
   gitHubStore.commits.push(newCommitSha);
   return {ok:true,status:201,json:async()=>({sha:newCommitSha})};
  }
  if(u.includes('/git/refs')&&method==='POST'){
   const body=JSON.parse(opts.body);
   gitHubStore.branches.set(body.ref,body.sha);
   return {ok:true,status:201,json:async()=>({ref:body.ref,object:{sha:body.sha}})};
  }

  // 7. Pull Requests
  if(u.includes('/pulls')&&method==='POST'){
   const body=JSON.parse(opts.body);
   assert.equal(body.draft,true,'Must strictly open Draft PR');
   const prNumber=64;
   const prUrl='https://github.com/saoluucvhak-pixel/HAK_VC_NB/pull/64';
   gitHubStore.pullRequests.push({prNumber,draft:true,head:body.head});
   return {ok:true,status:201,json:async()=>({number:prNumber,html_url:prUrl,draft:true})};
  }

  return {ok:false,status:404,text:async()=>'Not found'};
 };

 // Mock model runner simulating a bug on Attempt 1, then fixing it on Attempt 2
 let attemptCount=0;
 const mockModelRunner=async({prompt})=>{
  attemptCount++;
  if(attemptCount===1){
   return {
    answer:'```json\n{\n  "rationale": "Attempt 1 logic",\n  "changes": [\n    { "path": "app/main/calculator.js", "newContent": "export function multiply(a,b){ return a - b; }" }\n  ]\n}\n```'
   };
  }
  assert.match(prompt,/PREVIOUS ATTEMPT FAILED VERIFICATION/);
  assert.match(prompt,/Expected 2 \* 3 === 6/);
  return {
   answer:'```json\n{\n  "rationale": "Attempt 2 fixed multiplication",\n  "changes": [\n    { "path": "app/main/calculator.js", "newContent": "export function multiply(a,b){ return a * b; }" }\n  ]\n}\n```'
  };
 };

 // Mock verifier that asserts calculator behavior
 const mockVerifier=async({changes})=>{
  const calc=changes.find(c=>c.path==='app/main/calculator.js');
  if(calc?.newContent?.includes('a * b')){
   return {passed:true,summary:'All multiplication tests passed (100%)'};
  }
  return {passed:false,summary:'AssertionError: Expected 2 * 3 === 6; received -1'};
 };

 const mission={
  id:'MISSION_AUTO_CALC_01',
  targetRepo:'saoluucvhak-pixel/HAK_VC_NB',
  title:'Fix multiplication logic in calculator',
  type:'bug',
  description:'Function multiply should compute product of numbers',
  acceptanceCriteria:['multiply(2, 3) returns 6'],
  targetFiles:['app/main/calculator.js'],
  autonomous:true,
  maxAttempts:3,
  modelRunner:mockModelRunner,
  branch:'hak-fix/auto-calc-self-heal'
 };

 const events=[];
 const report=await runOrchestratedMission(mission,{
  fetchImpl:mockFetch,
  token:'mock-token-12345',
  verifyChanges:mockVerifier,
  publishDraftPr:true,
  authorized:true,
  onEvent:async(ev)=>events.push(ev)
 });

 assert.equal(report.kind,'hak-orchestrated-mission-report');
 assert.equal(report.draftPrPublished,true);
 assert.equal(report.publication.prNumber,64);
 assert.equal(report.publication.draft,true);
 assert.equal(report.publication.readyToMerge,false);
 assert.equal(report.selfHealing.autonomous,true);
 assert.equal(report.selfHealing.attempts,2);
 assert.equal(report.selfHealing.history.length,2);
 assert.equal(report.selfHealing.history[0].passed,false);
 assert.equal(report.selfHealing.history[1].passed,true);
 assert.equal(report.codePolicy.passed,true);
 assert.ok(events.some(e=>e.taskId.includes('self-heal-1')));
 assert.ok(events.some(e=>e.taskId.includes('self-heal-2')));
 assert.ok(events.some(e=>e.taskId.includes('publish')));
});
