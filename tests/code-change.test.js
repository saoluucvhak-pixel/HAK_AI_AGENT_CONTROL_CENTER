import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {buildStack,jsonResponse} from './helpers.js';
import {makeRepo} from './git-helpers.js';
import {Workspace} from '../src/workspace.js';
import {CodeChangeService,parseEdits} from '../src/code-change.js';
import {FileSecretBackend} from '../src/secrets.js';
import {runGit} from '../src/safe-process.js';

const SCOPE=['src/**','test/**'];
const CODE=/Agent chỉnh sửa mã/;
const good=(p='src/feature.js')=>JSON.stringify({summary:'thêm tính năng',edits:[{path:p,content:'export const feature=1;\n'}]});
const badTest=JSON.stringify({summary:'sai',edits:[{path:'test/broken.test.js',content:"import test from 'node:test';import assert from 'node:assert/strict';test('broken',()=>assert.equal(1,2));\n"}]});
const fixTest=JSON.stringify({summary:'sửa',edits:[{path:'test/broken.test.js',content:"import test from 'node:test';import assert from 'node:assert/strict';test('broken',()=>assert.equal(1,1));\n"}]});

async function setup({codeHandler,order={}}={}){
 const prompts=[];let calls=0;
 const s=await buildStack({order,handler:async body=>{
  const sys=body.messages[0]?.role==='system'?body.messages[0].content:'';
  if(CODE.test(sys)){prompts.push(body.messages.at(-1).content);return codeHandler(calls++,body);}
  return 'Đề xuất ổn';
 }});
 const r=await makeRepo();
 const ws=new Workspace({dir:join(s.dir,'workspaces')});
 const secrets=new FileSecretBackend(join(s.dir,'secrets.json'));
 const fetchCalls=[];
 const fetchImpl=async(url,init)=>{fetchCalls.push({url,init});return jsonResponse({number:7,html_url:'https://github.com/x/y/pull/7'},201);};
 const make=()=>new CodeChangeService({dir:s.dir,workspace:ws,providers:s.providers,approvals:s.approvals,orchestrator:s.orchestrator,secrets,fetchImpl});
 const svc=make();await svc.load();
 const repo=await svc.registerRepo({name:'demo',path:r.repo});
 const wo=await s.orchestrator.create({title:'Thêm tính năng',description:'Thêm feature.js',agents:['backend'],budget:{maxTokens:order.maxTokens??200000}});
 await s.orchestrator.approve(wo.id);await s.orchestrator.start(wo.id);await s.orchestrator.whenIdle(wo.id);
 const cleanup=async()=>{await r.cleanup();await s.cleanup();};
 return {s,r,svc,repo,wo,prompts,fetchCalls,secrets,make,cleanup,mk:(over={})=>svc.create({orderId:wo.id,repoId:repo.id,scope:SCOPE,consentExecuteCode:true,...over})};
}
async function run(x,cc){await x.svc.approve(cc.id);await x.svc.start(cc.id);await x.svc.whenIdle(cc.id);return x.svc.get(cc.id);}

test('parseEdits accepts fenced or bare JSON and rejects everything else',()=>{
 assert.equal(parseEdits('```json\n'+good()+'\n```').edits.length,1);
 assert.equal(parseEdits('Đây: '+good()+' xong').edits[0].path,'src/feature.js');
 for(const bad of ['không phải json','{"edits":"x"}','{"summary":"a"}'])assert.throws(()=>parseEdits(bad),/./);
});
test('creation requires consent, scope, an allowlisted command and a completed order',async()=>{
 const x=await setup({codeHandler:()=>good()});
 try{
  await assert.rejects(()=>x.mk({consentExecuteCode:false}),e=>e.code==='CONSENT');
  await assert.rejects(()=>x.mk({scope:[]}),e=>e.code==='INVALID');
  await assert.rejects(()=>x.mk({scope:['../etc/*']}),e=>e.code==='INVALID');
  await assert.rejects(()=>x.mk({verifyCommand:'rm -rf /'}),e=>e.code==='INVALID');
  await assert.rejects(()=>x.mk({maxRepairs:9}),e=>e.code==='INVALID');
  const draft=await x.s.orchestrator.create({title:'chưa chạy',description:'d',agents:['backend']});
  await assert.rejects(()=>x.svc.create({orderId:draft.id,repoId:x.repo.id,scope:SCOPE,consentExecuteCode:true}),e=>e.code==='BAD_STATE');
  await assert.rejects(()=>x.svc.registerRepo({name:'x',path:x.s.dir}),/./,'a non-repository directory is refused');
 }finally{await x.cleanup();}
});
test('happy path: approval gate, isolated edit, tests pass, VERIFIED; user checkout untouched; no push',async()=>{
 const x=await setup({codeHandler:()=>good()});
 try{
  const cc=await x.mk();
  await assert.rejects(()=>x.svc.start(cc.id),e=>e.code==='NOT_APPROVED');
  assert.equal(x.prompts.length,0,'no model call before approval');
  const done=await run(x,cc);
  assert.equal(done.status,'VERIFIED',JSON.stringify(done.error));
  assert.equal(done.attempts.length,1);assert.equal(done.attempts[0].verify.passed,true);
  assert.match(done.headSha,/^[a-f0-9]{40}$/);
  assert.equal((await x.r.g('rev-parse','HEAD')).stdout.trim(),x.r.sha);
  assert.equal((await x.r.g('status','--porcelain')).stdout,'');
  assert.equal((await x.r.g('branch','--list','hak/*')).stdout.trim().replace(/^[+* ]+/,''),done.branch);
  assert.ok(x.s.orchestrator.get(x.wo.id).usage.inputTokens>150,'code step spends from the work-order budget');
  assert.equal(x.fetchCalls.length,0);
  assert.ok(done.transitions.every(t=>t.at&&t.actor&&t.reason));
 }finally{await x.cleanup();}
});
test('failing tests trigger a bounded repair loop fed with the test output',async()=>{
 const x=await setup({codeHandler:n=>n===0?badTest:fixTest});
 try{
  const done=await run(x,await x.mk());
  assert.equal(done.status,'VERIFIED');assert.equal(done.attempts.length,2);
  assert.equal(done.attempts[0].verify.passed,false);assert.equal(done.attempts[1].verify.passed,true);
  assert.match(x.prompts[1],/<test_output>[\s\S]*broken/);
 }finally{await x.cleanup();}
});
test('repairs exhausted → BLOCKED, branch kept, never publishable',async()=>{
 const x=await setup({codeHandler:()=>badTest});
 try{
  const cc=await x.mk({maxRepairs:1});
  const done=await run(x,cc);
  assert.equal(done.status,'BLOCKED');assert.equal(done.attempts.length,2);assert.equal(done.error.code,'VERIFY_FAILED');
  await assert.rejects(()=>x.svc.approvePublish(cc.id),e=>e.code==='BAD_STATE');
  await assert.rejects(()=>x.svc.publish(cc.id),e=>e.code==='BAD_STATE');
 }finally{await x.cleanup();}
});
test('out-of-scope and malformed model output are rejected and fed back, never written',async()=>{
 const outside=JSON.stringify({edits:[{path:'README.md',content:'pwn'},{path:'../x.js',content:'x'}]});
 const x=await setup({codeHandler:n=>n===0?outside:n===1?'xin lỗi tôi không thể':good()});
 try{
  const done=await run(x,await x.mk());
  assert.equal(done.status,'VERIFIED');
  assert.match(done.attempts[0].error,/phạm vi|Ngoài|hợp lệ/);assert.match(done.attempts[1].error,/JSON/);
  assert.equal((await x.r.g('show',done.headSha+':README.md')).stdout,'hi\n');
 }finally{await x.cleanup();}
});
test('the default branch moving after approval blocks the run before any model call',async()=>{
 const x=await setup({codeHandler:()=>good()});
 try{
  const cc=await x.mk();await x.svc.approve(cc.id);
  await writeFile(join(x.r.repo,'src','moved.js'),'1\n');await x.r.g('add','-A');await x.r.g('commit','-q','-m','moved');
  await assert.rejects(()=>x.svc.start(cc.id),e=>e.code==='BASE_MOVED');
  assert.equal(x.prompts.length,0);assert.equal(x.svc.get(cc.id).status,'BLOCKED');
 }finally{await x.cleanup();}
});
test('work-order token budget exhausted → BLOCKED(BUDGET) without calling the model',async()=>{
 const x=await setup({codeHandler:()=>good(),order:{maxTokens:1000}});
 try{
  const done=await run(x,await x.mk());
  assert.equal(done.status,'BLOCKED');assert.equal(done.error.code,'BUDGET');assert.equal(x.prompts.length,0);
 }finally{await x.cleanup();}
});
test('gate 2: publishing needs approval of the exact commit; tampering or a missing approval blocks the push',async()=>{
 const x=await setup({codeHandler:()=>good()});
 try{
  const bare=join(x.r.dir,'origin.git');
  await runGit(['init','-q','--bare',bare],{cwd:x.r.dir});await x.r.g('remote','add','origin',bare);
  const cc=await x.mk();const v=await run(x,cc);
  await assert.rejects(()=>x.svc.publish(cc.id),e=>e.code==='NOT_APPROVED');
  await x.svc.approvePublish(cc.id);
  // someone adds a commit to the worktree after the approval → the approval no longer matches
  const wt=join(x.s.dir,'workspaces',cc.id);
  await writeFile(join(wt,'src','sneaky.js'),'1\n');await runGit(['add','-A'],{cwd:wt});await runGit(['commit','-q','--no-verify','-m','sneaky'],{cwd:wt});
  await assert.rejects(()=>x.svc.publish(cc.id),e=>e.code==='NOT_APPROVED');
  assert.equal((await runGit(['branch','--list'],{cwd:bare})).stdout.trim(),'','nothing was pushed');
  await runGit(['reset','-q','--hard',v.headSha],{cwd:wt});
  const published=await x.svc.publish(cc.id);
  assert.equal(published.status,'PUBLISHED');assert.equal(published.pr,null,'local repo: push only');
  assert.equal((await runGit(['rev-parse','refs/heads/'+v.branch],{cwd:bare})).stdout.trim(),v.headSha);
  assert.equal((await runGit(['rev-parse','--verify','-q','refs/heads/main'],{cwd:bare})).code,1,'main is never pushed');
 }finally{await x.cleanup();}
});
test('GitHub-linked repo: draft PR is opened with the stored token, never merged, token never persisted in the record',async()=>{
 const x=await setup({codeHandler:()=>good()});
 try{
  const bare=join(x.r.dir,'origin.git');
  await runGit(['init','-q','--bare',bare],{cwd:x.r.dir});await x.r.g('remote','add','origin',bare);
  const linked=await x.svc.registerRepo({name:'linked',path:x.r.repo,githubRepo:'HAK_AI_SKILLS'});
  await x.secrets.set('github:token','ghp_secret_token_value_123456');
  const cc=await x.svc.create({orderId:x.wo.id,repoId:linked.id,scope:SCOPE,consentExecuteCode:true});
  await run(x,cc);await x.svc.approvePublish(cc.id);
  const done=await x.svc.publish(cc.id);
  assert.equal(done.pr.number,7);assert.equal(done.pr.draft,true);
  const call=x.fetchCalls[0];
  assert.equal(call.url,'https://api.github.com/repos/saoluucvhak-pixel/HAK_AI_SKILLS/pulls');
  const body=JSON.parse(call.init.body);assert.equal(body.draft,true);assert.equal(body.base,'main');assert.match(body.head,/^hak\//);
  assert.ok(!JSON.stringify(done).includes('ghp_secret_token_value_123456'));
  await assert.rejects(()=>x.svc.registerRepo({name:'bad',path:x.r.repo,githubRepo:'NOT_ALLOWED'}),/danh sách cho phép/);
 }finally{await x.cleanup();}
});
test('restart mid-run → INTERRUPTED; rerun needs explicit confirmation and re-verifies approval',async()=>{
 let release;const gate=new Promise(r=>{release=r;});
 const x=await setup({codeHandler:async()=>{await gate;return good();}});
 try{
  const cc=await x.mk();await x.svc.approve(cc.id);await x.svc.start(cc.id);
  for(let i=0;i<100&&x.prompts.length<1;i++)await new Promise(r=>setTimeout(r,10));
  const reborn=x.make();await reborn.load();
  assert.equal(reborn.get(cc.id).status,'INTERRUPTED');
  await assert.rejects(()=>reborn.start(cc.id),e=>e.code==='CONFIRM_RERUN');
  release();await x.svc.whenIdle(cc.id);
 }finally{release?.();await x.cleanup();}
});
test('cancel aborts the run and marks CANCELLED',async()=>{
 const x=await setup({codeHandler:()=>new Promise(r=>setTimeout(()=>r(good()),8000))});
 try{
  const cc=await x.mk();await x.svc.approve(cc.id);await x.svc.start(cc.id);
  for(let i=0;i<100&&x.prompts.length<1;i++)await new Promise(r=>setTimeout(r,10));
  const done=await x.svc.cancel(cc.id);
  assert.equal(done.status,'CANCELLED');
 }finally{await x.cleanup();}
});
