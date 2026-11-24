import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRepoWorkflow,extractPatchProposalFromText} from '../src/orchestrator.js';
import {executeApprovedWorkOrder} from '../src/agent-engine.js';

test('prepareRepoWorkflow + executeApprovedWorkOrder injects skill context and audits appliedSkills',async()=>{
 const sha='a'.repeat(40);
 const mockFetch=async(url)=>{
  if(url.includes('/repos/vercel-labs/skills/contents/skills/find-skills/SKILL.md')){
   const b64=Buffer.from('---\nname: find-skills\ndescription: Discover skills\n---\nCheck leaderboard first.','utf8').toString('base64');
   return {ok:true,status:200,json:async()=>({type:'file',encoding:'base64',size:80,content:b64})};
  }
  if(url.includes('/repos/vercel-labs/skills/contents/skills')){
   return {ok:true,status:200,json:async()=>[{type:'dir',name:'find-skills',path:'skills/find-skills'}]};
  }
  if(url.includes('/repos/saoluucvhak-pixel/HAK_KHO_OFFLINE/contents/package.json')){
   const b64=Buffer.from('{"name":"hak-kho-offline"}','utf8').toString('base64');
   return {ok:true,status:200,json:async()=>({type:'file',encoding:'base64',size:26,sha:'b'.repeat(40),content:b64})};
  }
  return {ok:false,status:404};
 };

 const wf=await prepareRepoWorkflow({
  targetRepo:'HAK_KHO_OFFLINE',
  commitSha:sha,
  paths:['package.json'],
  requestedSkills:['find-skills'],
  fetchImpl:mockFetch
 });
 assert.equal(wf.targetRepo,'saoluucvhak-pixel/HAK_KHO_OFFLINE');
 assert.equal(wf.skills[0].name,'find-skills');
 assert.equal(wf.inspection.files[0].status,'available');

 let seenPrompt='';
 const report=await executeApprovedWorkOrder({
  workOrder:{id:'wo-1',projectId:'HAK',title:'Upgrade repo',description:'Inspect and upgrade',acceptanceCriteria:['Proposal returned']},
  roles:['testing'],
  skills:wf.skills,
  targetRepo:wf.targetRepo,
  approval:{approved:true,workOrderId:'wo-1',approvedBy:'operator',reason:'Approved test'},
  verifyApproval:async()=>true,
  saveOutput:async()=>true,
  env:{HAK_AGENT_EXECUTION_ENABLED:'true',HAK_OMNIROUTE_ENABLED:'true'},
  modelRunner:async({prompt})=>{seenPrompt=prompt;return {answer:'Proposal OK',model:'mock-model'};}
 });

 assert.equal(report.completed,true);
 assert.equal(report.targetRepo,'saoluucvhak-pixel/HAK_KHO_OFFLINE');
 assert.equal(report.steps[0].appliedSkills[0].name,'find-skills');
 assert.match(seenPrompt,/Check leaderboard first/);
 assert.match(seenPrompt,/Target repository: saoluucvhak-pixel\/HAK_KHO_OFFLINE/);
});

test('prepareRepoWorkflow auto-triages failed CI runId and inspects hinted files',async()=>{
 const sha='c'.repeat(40);
 const mockFetch=async(url)=>{
  if(url.endsWith('/actions/runs/99/jobs?per_page=100')){
   return {ok:true,status:200,json:async()=>({jobs:[{id:501,name:'unit-tests',conclusion:'failure'}]})};
  }
  if(url.endsWith('/actions/jobs/501/logs')){
   return {ok:true,status:200,text:async()=>'AssertionError at src/app.js expected 1 got 2'};
  }
  if(url.includes('/repos/saoluucvhak-pixel/HAK_KHO_OFFLINE/contents/src/app.js')){
   const b64=Buffer.from('export const x = 2;','utf8').toString('base64');
   return {ok:true,status:200,json:async()=>({type:'file',encoding:'base64',size:19,sha:'d'.repeat(40),content:b64})};
  }
  if(url.endsWith('/contents/skills')){
   return {ok:true,status:200,json:async()=>[{type:'dir',name:'hak-code-auditor',path:'skills/hak-code-auditor'}]};
  }
  if(url.includes('/contents/skills/hak-code-auditor/SKILL.md')){
   const b64=Buffer.from('---\nname: hak-code-auditor\ndescription: Audit code quality and tests\n---\n# Audit','utf8').toString('base64');
   return {ok:true,status:200,json:async()=>({type:'file',encoding:'base64',size:72,content:b64})};
  }
  return {ok:false,status:404};
 };

 const wf=await prepareRepoWorkflow({
  targetRepo:'HAK_KHO_OFFLINE',
  commitSha:sha,
  runId:99,
  role:'testing',
  fetchImpl:mockFetch
 });
 assert.equal(wf.ciTriage.failedJobCount,1);
 assert.equal(wf.ciTriage.reports[0].classification,'test-assertion');
 assert.equal(wf.inspection.files[0].path,'src/app.js');
 assert.equal(wf.inspection.files[0].status,'available');
 assert.equal(wf.skills[0].name,'hak-code-auditor');
});

test('extractPatchProposalFromText parses fenced JSON and validates proposal shape',()=>{
 const sha='a'.repeat(40),blob='b'.repeat(40);
 const proposal=extractPatchProposalFromText('Proposal:\n```json\n{"changes":[{"path":"src/app.js","expectedBlobSha":"'+blob+'","newContent":"export const x = 1;"}]}\n```',{
  repository:'HAK_KHO_OFFLINE',
  runId:42,
  baseSha:sha,
  rationale:'Fix failing assertion in src/app.js'
 });
 assert.equal(proposal.kind,'hak-github-patch-proposal');
 assert.equal(proposal.repository,'HAK_KHO_OFFLINE');
 assert.equal(proposal.changes[0].path,'src/app.js');
});

test('prepareRepoWorkflow accepts arbitrary valid owner/repo project without pre-listing in Control Center',async()=>{
 const sha='e'.repeat(40);
 const mockFetch=async(url)=>{
  if(url.includes('/repos/any-client/new-project/contents/package.json')){
   const b64=Buffer.from('{"name":"new-project"}','utf8').toString('base64');
   return {ok:true,status:200,json:async()=>({type:'file',encoding:'base64',size:22,sha:'f'.repeat(40),content:b64})};
  }
  return {ok:false,status:404};
 };
 const wf=await prepareRepoWorkflow({
  targetRepo:'any-client/new-project',
  commitSha:sha,
  paths:['package.json'],
  includeRemoteSkills:false,
  fetchImpl:mockFetch
 });
 assert.equal(wf.targetRepo,'any-client/new-project');
 assert.equal(wf.inspection.files[0].status,'available');
});

test('prepareRepoWorkflow supports fix-and-verify workflowMode with codex-security skills',async()=>{
 const mockFetch=async(url)=>{
  if(url.endsWith('/repos/openai/codex-security/contents/plugins/codex-security/skills')){
   return {ok:true,status:200,json:async()=>[
    {type:'dir',name:'triage-finding',path:'plugins/codex-security/skills/triage-finding'},
    {type:'dir',name:'fix-finding',path:'plugins/codex-security/skills/fix-finding'},
    {type:'dir',name:'verify-fix',path:'plugins/codex-security/skills/verify-fix'}
   ]};
  }
  if(url.includes('/plugins/codex-security/skills/')){
   const name=url.split('/').slice(-2)[0];
   const b64=Buffer.from(`---\nname: ${name}\ndescription: ${name}\n---\n# ${name}`,'utf8').toString('base64');
   return {ok:true,status:200,json:async()=>({type:'file',encoding:'base64',size:64,content:b64})};
  }
  return {ok:false,status:404};
 };
 const wf=await prepareRepoWorkflow({
  targetRepo:'any-client/new-project',
  workflowMode:'fix-and-verify',
  fetchImpl:mockFetch
 });
 assert.deepEqual(wf.recommendedRoles,['testing','backend','quality']);
 assert.deepEqual(wf.skills.map(s=>s.name),['triage-finding','fix-finding','verify-fix']);
 assert.equal(wf.blockedSkills.length,0);
});
