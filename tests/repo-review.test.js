import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';

import {makeRepo} from './git-helpers.js';
import {tempDir} from './helpers.js';
import {Workspace} from '../src/workspace.js';
import {ReviewService,runStaticChecks,verifyCitation,parseAiFindings} from '../src/repo-review.js';

const FAKE_TOKEN='ghp_'+'a1B2'.repeat(9);
// Golden fixture modelled on the patterns found by hand in HAK_XUATHANG_APP / HAK_KHO_OFFLINE.
const GOLDEN={
 'app/index.html':'<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body></body></html>\n',
 'app/libs/lib.min.js':'/*! lib v1.0.0 */var a=1;\n',
 'app/native/Helper.exe':'MZ-not-really-an-exe',
 'package.json':'{"name":"x","scripts":{"test":"node --test"}}\n',
 '.github/workflows/build.yml':'name: build\non: push\npermissions:\n  contents: write\njobs:\n  b:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm install\n      - uses: actions/upload-artifact@'+'a'.repeat(40)+'\n',
 'src/main.js':"const {shell}=require('electron');\nfunction open(f){ return shell.openPath(f); }\nnew BrowserWindow({webPreferences:{nodeIntegration: true}});\nel.innerHTML = x;\n",
 'src/cfg.js':'const token = "'+FAKE_TOKEN+'";\n',
 'test/ok.test.js':"import test from 'node:test';test('ok',()=>{});\n"
};
const stub=(r,extra={})=>({getRepo:()=>({id:'r1',name:'demo',path:r.repo,defaultBranch:'main',defaultVerify:'node-test',githubRepo:null,...extra})});
async function snapshotState(r){
 return {head:(await r.g('rev-parse','HEAD')).stdout,status:(await r.g('status','--porcelain')).stdout,branches:(await r.g('branch','-a')).stdout,worktrees:(await r.g('worktree','list','--porcelain')).stdout};
}
const ids=fs=>new Set(fs.map(f=>f.rule));

test('golden set (static tier): the deterministic findings found by hand are caught, with correct file:line and severity',async()=>{
 const r=await makeRepo(GOLDEN,{pkgTest:false});
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const {findings}=await runStaticChecks(ws,r.repo,r.sha);
  for(const rule of ['secret-scan','workflow-permissions','npm-install-in-ci','unpinned-actions','lockfile-missing','csp-missing','committed-binary','electron-insecure-prefs','shell-open','innerhtml-usage','vendored-libs'])
   assert.ok(ids(findings).has(rule),'missing '+rule);
  const by=rule=>findings.find(f=>f.rule===rule);
  assert.equal(by('npm-install-in-ci').line,10);assert.equal(by('npm-install-in-ci').path,'.github/workflows/build.yml');
  assert.equal(by('workflow-permissions').line,3);
  assert.equal(by('unpinned-actions').count,1,'the SHA-pinned action is not counted');
  assert.equal(by('secret-scan').severity,'error');assert.equal(by('secret-scan').path,'src/cfg.js');assert.equal(by('secret-scan').line,1);
  assert.ok(!JSON.stringify(findings).includes(FAKE_TOKEN),'secret value must be masked in findings');
  assert.equal(by('electron-insecure-prefs').severity,'error');assert.equal(by('electron-insecure-prefs').line,3);
  assert.equal(by('shell-open').line,2);
  assert.ok(findings.every(f=>f.verified===true&&f.path&&f.line>=1),'tool findings always carry file:line');
  assert.ok(!findings.some(f=>f.path.includes('lib.min.js')&&f.rule!=='vendored-libs'),'vendored files are not scanned as app code');
 }finally{await r.cleanup();}
});
test('a clean, hardened repo yields no warnings or errors (no false positives on the safe pattern)',async()=>{
 const r=await makeRepo({
  'package.json':'{"name":"x"}\n','package-lock.json':'{}\n',
  '.github/workflows/ci.yml':'name: ci\non: push\npermissions:\n  contents: read\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@'+'b'.repeat(40)+'\n      - run: npm ci\n',
  'index.html':'<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'"></head></html>\n',
  'src/a.js':'export const a=1;\n'},{pkgTest:false});
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const {findings}=await runStaticChecks(ws,r.repo,r.sha);
  assert.deepEqual(findings.filter(f=>f.severity!=='info'),[]);
 }finally{await r.cleanup();}
});
test('CSP with script-src unsafe-inline is flagged at the right line',async()=>{
 const r=await makeRepo({'index.html':'<html>\n<head>\n<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'">\n</head></html>\n'},{pkgTest:false});
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const f=(await runStaticChecks(ws,r.repo,r.sha)).findings.find(x=>x.rule==='csp-unsafe-inline');
  assert.ok(f);assert.equal(f.line,3);
 }finally{await r.cleanup();}
});
test('citation verifier: verified only when the path exists and the quote is near the cited line',async()=>{
 const r=await makeRepo(GOLDEN,{pkgTest:false});
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const ok=await verifyCitation(ws,r.repo,r.sha,{path:'src/main.js',line:2,quote:'return shell.openPath(f);'});
  assert.equal(ok.verified,true);
  assert.equal((await verifyCitation(ws,r.repo,r.sha,{path:'src/main.js',line:2,quote:'  function   open(f){ return shell.openPath(f); }'})).verified,true,'whitespace-insensitive');
  assert.equal((await verifyCitation(ws,r.repo,r.sha,{path:'src/main.js',line:30,quote:'return shell.openPath(f);'})).verified,false);
  assert.equal((await verifyCitation(ws,r.repo,r.sha,{path:'src/nope.js',line:1,quote:'whatever it says'})).verified,false);
  assert.equal((await verifyCitation(ws,r.repo,r.sha,{path:'src/main.js',line:2,quote:'this text is not in the file'})).verified,false);
  assert.equal((await verifyCitation(ws,r.repo,r.sha,{path:'src/main.js',line:2,quote:'short'})).verified,false,'too-short quotes prove nothing');
  assert.equal((await verifyCitation(ws,r.repo,r.sha,{path:'../../etc/passwd',line:1,quote:'root:x:0:0:root'})).verified,false);
 }finally{await r.cleanup();}
});
test('read-only by construction: user checkout, branches, worktrees and remote are identical after a review (static and execution tiers)',async()=>{
 const r=await makeRepo(GOLDEN,{pkgTest:true});
 try{
  const {runGit}=await import('../src/safe-process.js');
  const bare=join(r.dir,'origin.git');await runGit(['init','-q','--bare',bare],{cwd:r.dir});await r.g('remote','add','origin',bare);await r.g('push','-q','origin','main');
  const before=await snapshotState(r);const remoteBefore=(await runGit(['for-each-ref'],{cwd:bare})).stdout;
  const t=await tempDir();
  const svc=new ReviewService({dir:t.dir,workspace:new Workspace({dir:join(t.dir,'ws')}),repos:stub(r,{defaultVerify:'node-test'})});await svc.load();
  const a=await svc.start({repoId:'r1'});await svc.whenIdle(a.id);
  const b=await svc.start({repoId:'r1',execute:true,consentExecuteCode:true});await svc.whenIdle(b.id);
  assert.equal(svc.get(a.id).status,'COMPLETED');assert.equal(svc.get(b.id).status,'COMPLETED');
  assert.deepEqual(await snapshotState(r),before);
  assert.equal((await runGit(['for-each-ref'],{cwd:bare})).stdout,remoteBefore,'nothing was pushed');
  const ev=svc.get(b.id).evidence;
  const v=ev.find(e=>e.check.startsWith('verify:'));assert.ok(v&&v.outputSha256&&typeof v.exitCode==='number');
  assert.ok(ev.some(e=>e.check==='npm-audit'),'audit attempted (and reported, even when it cannot run)');
  await t.cleanup();
 }finally{await r.cleanup();}
});
test('execution tier needs explicit consent',async()=>{
 const r=await makeRepo(GOLDEN,{pkgTest:false});
 try{
  const t=await tempDir();
  const svc=new ReviewService({dir:t.dir,workspace:new Workspace({dir:join(t.dir,'ws')}),repos:stub(r)});
  await assert.rejects(()=>svc.start({repoId:'r1',execute:true}),e=>e.code==='CONSENT');
  await assert.rejects(()=>svc.start({repoId:'r1',maxTokens:5}),e=>e.code==='INVALID');
  await t.cleanup();
 }finally{await r.cleanup();}
});
test('AI tier: citations are verified; fabricated ones are kept but labelled "chưa xác minh" and not counted as verified; context starts with tool-flagged files',async()=>{
 const r=await makeRepo(GOLDEN,{pkgTest:false});
 try{
  const prompts=[];
  const providers={resolve:()=>({connectionId:'c',model:'m',connection:{maxTokens:4096}}),execute:async(_id,req)=>{
   prompts.push(req.prompt);
   return {text:'```json\n'+JSON.stringify({findings:[
    {severity:'warning',title:'openPath nhận tệp không tin cậy',path:'src/main.js',line:2,quote:'return shell.openPath(f);',explanation:'f có thể đến từ gói sao lưu'},
    {severity:'error',title:'Lỗi bịa đặt',path:'src/main.js',line:2,quote:'dangerouslyRunEverything(user)',explanation:'không có trong mã'},
    {severity:'info',title:'Tệp không có thật',path:'src/ghost.js',line:1,quote:'const ghost = true;',explanation:'x'}]})+'\n```',modelReported:'fake-model',usage:{inputTokens:1,outputTokens:1}};
  }};
  const t=await tempDir();
  const svc=new ReviewService({dir:t.dir,workspace:new Workspace({dir:join(t.dir,'ws')}),repos:stub(r),providers});await svc.load();
  const a=await svc.start({repoId:'r1',ai:true});await svc.whenIdle(a.id);
  const rep=svc.get(a.id);
  assert.equal(rep.ai.status,'DONE');assert.equal(rep.ai.identityVerified,false);assert.equal(rep.ai.findings,3);assert.equal(rep.ai.verified,1);
  const aiF=rep.findings.filter(f=>f.tier==='ai');
  assert.deepEqual(aiF.map(f=>f.verified),[true,false,false]);
  assert.equal(rep.counts.unverified,2);
  const md=svc.report(a.id);
  assert.match(md,/Bằng chứng công cụ/);assert.match(md,/Nhận định của AI/);assert.match(md,/\[chưa xác minh: /);assert.match(md,/\[đã xác minh trích dẫn\]/);
  assert.match(md,/npm audit.*không bao phủ|ngoài phạm vi/i);
  assert.ok(!md.includes(FAKE_TOKEN));
  assert.ok(prompts[0].indexOf('path="src/cfg.js"')>=0&&prompts[0].indexOf('path="src/cfg.js"')<prompts[0].indexOf('path="README.md"')||!prompts[0].includes('README.md'),'flagged files lead the context');
  assert.ok(!prompts[0].includes(FAKE_TOKEN),'the secret value is never sent to the model');
  await t.cleanup();
 }finally{await r.cleanup();}
});
test('without a configured provider the AI tier is BLOCKED (never faked) and the static report is still complete',async()=>{
 const r=await makeRepo(GOLDEN,{pkgTest:false});
 try{
  const t=await tempDir();
  const svc=new ReviewService({dir:t.dir,workspace:new Workspace({dir:join(t.dir,'ws')}),repos:stub(r),providers:{resolve:()=>{throw new Error('Chưa có kết nối AI nào được bật');}}});
  const a=await svc.start({repoId:'r1',ai:true});await svc.whenIdle(a.id);
  const rep=svc.get(a.id);
  assert.equal(rep.status,'COMPLETED');assert.equal(rep.ai.status,'BLOCKED');assert.ok(rep.findings.length>5);assert.ok(!rep.findings.some(f=>f.tier==='ai'));
  assert.match(svc.report(a.id),/Tầng AI không chạy được/);
  await t.cleanup();
 }finally{await r.cleanup();}
});
test('parseAiFindings tolerates fences and rejects non-JSON',()=>{
 assert.equal(parseAiFindings('```json\n{"findings":[{"title":"a","path":"p","line":1,"quote":"abcdefgh"}]}\n```').length,1);
 assert.throws(()=>parseAiFindings('không có json'),/JSON/);
 assert.throws(()=>parseAiFindings('{"x":1}'),/findings/);
});

test('no false positives: RegExp/db .exec(), "npm i --no-save <pkg>" and "npm ci" are not flagged; bare "npm install" and child_process are',async()=>{
 const r=await makeRepo({
  '.github/workflows/ci.yml':'name: ci\non: push\npermissions:\n  contents: read\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n      - run: npm i --no-save playwright@1.63.0\n      - run: npm install --no-audit\n',
  'src/a.js':'const m=/a(b)/.exec(s);\ndb.exec("select 1");\nconst cp=require("child_process");\n'},{pkgTest:false});
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const f=(await runStaticChecks(ws,r.repo,r.sha)).findings;
  assert.deepEqual(f.filter(x=>x.rule==='npm-install-in-ci').map(x=>x.line),[11],'only the bare "npm install --no-audit" counts');
  assert.deepEqual(f.filter(x=>x.rule==='dynamic-exec').map(x=>x.line),[3],'only child_process, not .exec()');
 }finally{await r.cleanup();}
});

test('large files: the CSP at the top of a >600 KB html is found (head is read, never the tail); too-big files are skipped, not misread',async()=>{
 const big='<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'"></head><body>'+'<p>x</p>'.repeat(120000)+'</body></html>\n';
 const r=await makeRepo({'index.html':big,'src/a.js':'export const a=1;\n'},{pkgTest:false});
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  assert.ok(big.length>600*1024);
  const f=(await runStaticChecks(ws,r.repo,r.sha)).findings;
  assert.ok(!f.some(x=>x.rule==='csp-missing'),'must not report a CSP as missing when it is at the top of a large file');
  const head=await ws.readAtBase(r.repo,r.sha,'index.html',1000,{head:true});
  assert.ok(head.startsWith('<!DOCTYPE html>')&&head.length===1000);
  assert.equal(await ws.readAtBase(r.repo,r.sha,'index.html',1000),null,'strict mode refuses instead of returning a partial file');
 }finally{await r.cleanup();}
});
