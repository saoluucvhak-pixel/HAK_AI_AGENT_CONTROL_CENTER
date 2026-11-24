import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {readFile,access} from 'node:fs/promises';
import {makeRepo} from './git-helpers.js';
import {tempDir,jsonResponse} from './helpers.js';
import {main,parseArgs,EXIT} from '../src/cli.js';
import {runGit} from '../src/safe-process.js';

const GOOD=JSON.stringify({summary:'thêm f',edits:[{path:'src/f.js',content:'export const f=1;\n'}]});
async function gateway(){
 const calls=[];
 const srv=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
  calls.push(body);
  const sys=body.messages?.[0]?.content||'';
  const text=/Agent chỉnh sửa mã/.test(sys)?GOOD:'Đề xuất backend';
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({model:body.model,choices:[{message:{content:text}}],usage:{prompt_tokens:10,completion_tokens:5}}));
 });
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 return {calls,url:'http://127.0.0.1:'+srv.address().port,close:()=>new Promise(r=>srv.close(r))};
}
const run=async(argv,env,extra={})=>{const out=[],err=[];const code=await main(argv,{env:{PATH:process.env.PATH,HAK_SANDBOX:'off',...env},out:m=>out.push(m),err:m=>err.push(m),...extra});return {code,out:out.join('\n'),err:err.join('\n')};};
const state=async r=>({head:(await r.g('rev-parse','HEAD')).stdout,status:(await r.g('status','--porcelain')).stdout,branches:(await r.g('branch','--list')).stdout});

test('parseArgs and usage errors',async()=>{
 assert.deepEqual(parseArgs(['write','--scope','a','--scope','b','--consent-execute-code']).flags,{scope:['a','b'],'consent-execute-code':true});
 assert.throws(()=>parseArgs(['review','--repo']),/Thiếu giá trị/);
 assert.equal((await run([],{})).code,EXIT.USAGE);
 assert.equal((await run(['help'],{})).code,EXIT.OK);
 assert.equal((await run(['bogus'],{})).code,EXIT.USAGE);
 assert.equal((await run(['review'],{})).code,EXIT.USAGE);
});
test('review (static): exit codes follow --fail-on, report files are written, the repository is untouched',async()=>{
 const r=await makeRepo({'src/main.js':"new BrowserWindow({webPreferences:{ nodeIntegration: true }});\n",'.github/workflows/ci.yml':'name: ci\non: push\npermissions:\n  contents: read\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm install\n'},{pkgTest:false});
 const t=await tempDir();
 try{
  const before=await state(r);
  const a=await run(['review','--repo',r.repo,'--out',join(t.dir,'r.md'),'--json',join(t.dir,'r.json')],{});
  assert.equal(a.code,EXIT.FINDINGS);assert.match(a.out,/electron-insecure-prefs/);
  assert.match(await readFile(join(t.dir,'r.md'),'utf8'),/Bằng chứng công cụ/);
  const j=JSON.parse(await readFile(join(t.dir,'r.json'),'utf8'));
  assert.equal(j.status,'COMPLETED');assert.ok(j.findings.some(f=>f.rule==='npm-install-in-ci'));assert.equal(j.source,'local');
  assert.equal((await run(['review','--repo',r.repo,'--fail-on','never'],{})).code,EXIT.OK);
  assert.equal((await run(['review','--repo',r.repo,'--execute'],{})).code,EXIT.USAGE,'execution tier needs explicit consent');
  assert.deepEqual(await state(r),before);
  const clean=await makeRepo({'src/a.js':'export const a=1;\n'},{pkgTest:false});
  try{assert.equal((await run(['review','--repo',clean.repo],{})).code,EXIT.OK);}finally{await clean.cleanup();}
 }finally{await r.cleanup();await t.cleanup();}
});
test('review --ai without a provider: tier is BLOCKED, never faked; static result still gates',async()=>{
 const r=await makeRepo({'src/a.js':'export const a=1;\n'},{pkgTest:false});
 try{
  const x=await run(['review','--repo',r.repo,'--ai'],{});
  assert.equal(x.code,EXIT.OK);assert.match(x.out,/tầng AI: BLOCKED/);
 }finally{await r.cleanup();}
});
test('write: no provider → exit 2 and nothing is simulated',async()=>{
 const r=await makeRepo();
 try{
  const x=await run(['write','--repo',r.repo,'--goal','thêm f','--scope','src/**','--consent-execute-code'],{});
  assert.equal(x.code,EXIT.USAGE);assert.match(x.err,/không giả lập/);
 }finally{await r.cleanup();}
});
test('write approval gate for CI: plan first (no model call), deterministic hash, mismatch refused, then run; the checkout stays clean',async()=>{
 const gw=await gateway();const r=await makeRepo();const t=await tempDir();
 const env={HAK_PROVIDER:'openai-compatible',HAK_MODEL:'m-1',HAK_ENDPOINT:gw.url,HAK_API_KEY:'cli-test-key-1234567890',GITHUB_ACTOR:'octocat'};
 const base=['write','--repo',r.repo,'--goal','thêm f','--scope','src/**','--scope','test/**','--consent-execute-code','--repairs','1','--out-dir',t.dir];
 try{
  const before=await state(r);
  const plan1=await run(base,env);
  assert.equal(plan1.code,EXIT.AWAITING_APPROVAL);
  const hash=JSON.parse(plan1.out).planHash;assert.match(hash,/^[a-f0-9]{64}$/);
  assert.equal(JSON.parse((await run(base,env)).out).planHash,hash,'the plan hash is deterministic');
  const other=await run(base.map(x=>x==='src/**'?'lib/**':x),env);
  assert.notEqual(JSON.parse(other.out).planHash,hash,'changing the scope changes the hash: an old approval cannot be reused');
  assert.equal(gw.calls.length,0,'planning never calls the model');
  const bad=await run([...base,'--approve','0'.repeat(64)],env);
  assert.equal(bad.code,EXIT.APPROVAL_MISMATCH);assert.equal(gw.calls.length,0);
  const ok=await run([...base,'--approve',hash],env);
  assert.equal(ok.code,EXIT.OK,ok.err);
  const res=JSON.parse(ok.out);
  assert.equal(res.status,'VERIFIED');assert.equal(res.sandbox,'off');assert.equal(res.planHash,hash);assert.match(res.headSha,/^[a-f0-9]{40}$/);
  await access(join(t.dir,'hak-change.bundle'));await access(join(t.dir,'hak-change.json'));
  assert.ok(gw.calls.length>=2,'a proposal call and a code call');
  assert.deepEqual(await state(r),before,'no leftover branch or change in the checkout');
  assert.match(res.diffStat,/src\/f\.js/);
 }finally{await gw.close();await r.cleanup();await t.cleanup();}
});
test('publish: gate 2 is bound to the exact commit; remote must match; PR is a draft; nothing is pushed on mismatch',async()=>{
 const gw=await gateway();const r=await makeRepo();const t=await tempDir();
 const env={HAK_PROVIDER:'openai-compatible',HAK_MODEL:'m-1',HAK_ENDPOINT:gw.url,HAK_API_KEY:'cli-test-key-1234567890'};
 try{
  const bare=join(r.dir,'origin.git');await runGit(['init','-q','--bare',bare],{cwd:r.dir});
  await r.g('remote','add','origin','https://github.com/acme/widgets.git');await r.g('config','url.'+bare+'.insteadOf','https://github.com/acme/widgets.git');
  const base=['write','--repo',r.repo,'--goal','thêm f','--scope','src/**','--scope','test/**','--consent-execute-code','--out-dir',t.dir];
  const hash=JSON.parse((await run(base,env)).out).planHash;
  const w=await run([...base,'--approve',hash],env);assert.equal(w.code,EXIT.OK,w.err);
  const {headSha}=JSON.parse(w.out);const bundle=join(t.dir,'hak-change.bundle');
  const pub=['publish','--repo',r.repo,'--bundle',bundle,'--github-repo','acme/widgets'];
  const await1=await run(pub,{});
  assert.equal(await1.code,EXIT.AWAITING_APPROVAL);assert.match(await1.out,new RegExp(headSha));
  assert.equal((await runGit(['branch','--list'],{cwd:bare})).stdout.trim(),'');
  assert.equal((await run([...pub,'--approve-publish','a'.repeat(40)],{})).code,EXIT.APPROVAL_MISMATCH);
  assert.equal((await run(['publish','--repo',r.repo,'--bundle',bundle,'--github-repo','evil/other','--approve-publish',headSha],{})).code,EXIT.REMOTE_MISMATCH);
  assert.equal((await runGit(['branch','--list'],{cwd:bare})).stdout.trim(),'','refused publishes pushed nothing');
  const prCalls=[];
  const fetchImpl=async(url,init)=>{prCalls.push({url,body:JSON.parse(init.body),auth:init.headers.Authorization});return jsonResponse({number:9,html_url:'https://github.com/acme/widgets/pull/9'},201);};
  const done=await run([...pub,'--approve-publish',headSha],{HAK_GITHUB_TOKEN:'ghp_'+'t'.repeat(36)},{fetchImpl});
  assert.equal(done.code,EXIT.OK,done.err);
  const out=JSON.parse(done.out);assert.equal(out.status,'PUBLISHED');assert.equal(out.pr.draft,true);
  assert.equal((await runGit(['rev-parse','refs/heads/'+out.branch],{cwd:bare})).stdout.trim(),headSha,'the remote has exactly the approved commit');
  assert.equal(prCalls[0].url,'https://api.github.com/repos/acme/widgets/pulls');assert.equal(prCalls[0].body.draft,true);assert.match(prCalls[0].auth,/^Bearer ghp_/);
  assert.ok(!done.out.includes('ghp_'),'the token is never printed');
 }finally{await gw.close();await r.cleanup();await t.cleanup();}
});
