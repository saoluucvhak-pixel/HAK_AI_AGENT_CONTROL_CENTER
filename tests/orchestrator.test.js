import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRepoWorkflow} from '../src/orchestrator.js';
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
