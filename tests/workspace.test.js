import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,access,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {makeRepo} from './git-helpers.js';
import {Workspace,verifyCommand} from '../src/workspace.js';
import {runProcess,scrubbedEnv} from '../src/safe-process.js';
import {validateEditPath} from '../src/code-paths.js';

const SCOPE=['src/**','test/**'];
test('edit path validation: traversal, absolute, ADS, reserved names, .git, sensitive files, scope',()=>{
 for(const bad of ['../x.js','/etc/passwd','C:/x.js','src\\a.js','src/a.js:stream','src/CON.js','src/nul','src/a.js.','src/a .','.GIT/config','src/./a.js','src//a.js','','src/a<b.js']){
  assert.throws(()=>validateEditPath(bad,SCOPE),/./,JSON.stringify(bad));
 }
 assert.throws(()=>validateEditPath('README.md',SCOPE),/Ngoài phạm vi/);
 assert.throws(()=>validateEditPath('src/run.cmd',SCOPE),/nhạy cảm/);
 assert.throws(()=>validateEditPath('src/.env',SCOPE),/nhạy cảm/);
 assert.throws(()=>validateEditPath('src/a.js',[]),/phạm vi/);
 assert.equal(validateEditPath('src/deep/new.js',SCOPE),'src/deep/new.js');
 assert.equal(validateEditPath('package.json',['package.json']),'package.json','a sensitive file is allowed only when named exactly');
 assert.throws(()=>validateEditPath('package.json',['*.json']),/nhạy cảm/);
});
test('worktree isolation: the user checkout (HEAD, index, tree) is untouched; edits commit on a hak/* branch',async()=>{
 const r=await makeRepo();
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const before=(await r.g('status','--porcelain')).stdout;
  const wt=await ws.create({id:'c1',repoPath:r.repo,baseSha:r.sha,branch:'hak/test-one'});
  const applied=await ws.applyEdits(wt,[{path:'src/new.js',content:'export const n=2;\n'},{path:'src/a.js',content:'export const a=9;\n'}],SCOPE);
  assert.equal(applied.length,2);
  const commit=await ws.commit(wt,'feat: edits',applied.map(a=>a.path));
  assert.match(commit,/^[a-f0-9]{40}$/);
  assert.equal((await r.g('rev-parse','HEAD')).stdout.trim(),r.sha,'user HEAD unchanged');
  assert.equal((await r.g('status','--porcelain')).stdout,before);
  assert.equal(await readFile(join(r.repo,'src/a.js'),'utf8'),'export const a=1;\n','user file unchanged');
  assert.equal((await r.g('rev-parse','refs/heads/hak/test-one')).stdout.trim(),commit);
  assert.equal(await ws.readAtBase(r.repo,r.sha,'src/a.js'),'export const a=1;\n');
  assert.deepEqual(await ws.listFiles(r.repo,r.sha,SCOPE),['src/a.js','test/ok.test.js']);
  await ws.remove({id:'c1',repoPath:r.repo});
  await assert.rejects(()=>access(wt));
 }finally{await r.cleanup();}
});
test('edits outside scope / oversized / duplicate are rejected before anything is written',async()=>{
 const r=await makeRepo();
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const wt=await ws.create({id:'c2',repoPath:r.repo,baseSha:r.sha,branch:'hak/test-two'});
  for(const edits of [[{path:'README.md',content:'x'}],[{path:'src/a.js',content:'x'},{path:'SRC/A.js',content:'y'}],[{path:'src/big.js',content:'x'.repeat(200*1024)}],[{path:'src/n.js',content:'a\0b'}],[]])
   await assert.rejects(()=>ws.applyEdits(wt,edits,SCOPE));
  assert.equal((await r.g('-C',wt,'status','--porcelain')).stdout,'');
 }finally{await r.cleanup();}
});
test('symlinks inside the worktree are never written through',{skip:process.platform==='win32'},async()=>{
 const r=await makeRepo();
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const wt=await ws.create({id:'c3',repoPath:r.repo,baseSha:r.sha,branch:'hak/test-three'});
  const outside=join(r.dir,'outside');await mkdir(outside);
  await symlink(outside,join(wt,'src','link'));
  await assert.rejects(()=>ws.applyEdits(wt,[{path:'src/link/pwn.js',content:'x'}],SCOPE),/liên kết|thoát/);
  await assert.rejects(()=>access(join(outside,'pwn.js')));
 }finally{await r.cleanup();}
});
test('repository hooks never run (pre-commit writes a marker if executed)',async()=>{
 const r=await makeRepo();
 try{
  const marker=join(r.dir,'hook-ran.txt');
  const hook=join(r.repo,'.git','hooks','pre-commit');
  await mkdir(join(r.repo,'.git','hooks'),{recursive:true});
  await writeFile(hook,'#!/bin/sh\necho ran > "'+marker.replace(/\\/g,'/')+'"\n',{mode:0o755});
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const wt=await ws.create({id:'c4',repoPath:r.repo,baseSha:r.sha,branch:'hak/test-four'});
  const applied=await ws.applyEdits(wt,[{path:'src/h.js',content:'1\n'}],SCOPE);
  assert.ok(await ws.commit(wt,'x',applied.map(a=>a.path)));
  await assert.rejects(()=>access(marker),'hook must not have executed');
 }finally{await r.cleanup();}
});
test('verification: fixed command ids only; passing and failing runs; env scrubbed of HAK_*/tokens',async()=>{
 assert.throws(()=>verifyCommand('rm -rf /'),/danh sách cho phép/);
 assert.throws(()=>verifyCommand('node-test; echo x'),/danh sách cho phép/);
 process.env.HAK_SECRET_PROBE='probe-value-123456';process.env.GITHUB_TOKEN='ghp_probe_token_123456';
 const r=await makeRepo({'test/env.test.js':"import test from 'node:test';import assert from 'node:assert/strict';test('env',()=>{assert.equal(process.env.HAK_SECRET_PROBE,undefined);assert.equal(process.env.GITHUB_TOKEN,undefined);});\n"},{pkgTest:false});
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const wt=await ws.create({id:'c5',repoPath:r.repo,baseSha:r.sha,branch:'hak/test-five'});
  const pass=await ws.verify(wt,'node-test',{timeoutMs:60000});
  assert.equal(pass.passed,true,pass.output);
  const applied=await ws.applyEdits(wt,[{path:'test/bad.test.js',content:"import test from 'node:test';import assert from 'node:assert/strict';test('bad',()=>assert.equal(1,2));\n"}],['test/**']);
  assert.ok(applied.length);
  const fail=await ws.verify(wt,'node-test',{timeoutMs:60000});
  assert.equal(fail.passed,false);assert.match(fail.output,/bad/);
 }finally{delete process.env.HAK_SECRET_PROBE;delete process.env.GITHUB_TOKEN;await r.cleanup();}
});
test('timeout kills the whole process tree, not just the direct child',async()=>{
 const script="const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000);";
 const res=await runProcess(process.execPath,['-e',script],{timeoutMs:1500,env:scrubbedEnv()});
 assert.equal(res.timedOut,true);
 const pid=Number(res.stdout.trim().split(/\s+/)[0]);
 assert.ok(pid>0);
 let alive=true;
 for(let i=0;i<60&&alive;i++){try{process.kill(pid,0);await new Promise(r=>setTimeout(r,100));}catch{alive=false;}}
 assert.equal(alive,false,'grandchild must be dead');
});
test('push goes only to hak/* branches (local bare remote)',async()=>{
 const r=await makeRepo();
 try{
  const {runGit}=await import('../src/safe-process.js');
  const bare=join(r.dir,'origin.git');
  await runGit(['init','-q','--bare',bare],{cwd:r.dir});
  await r.g('remote','add','origin',bare);
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const wt=await ws.create({id:'c6',repoPath:r.repo,baseSha:r.sha,branch:'hak/test-six'});
  const applied=await ws.applyEdits(wt,[{path:'src/p.js',content:'p\n'}],SCOPE);
  const commit=await ws.commit(wt,'p',applied.map(a=>a.path));
  await assert.rejects(()=>ws.push(wt,{branch:'main'}),/hak\//);
  await ws.push(wt,{branch:'hak/test-six'});
  const remote=await runGit(['rev-parse','refs/heads/hak/test-six'],{cwd:bare});
  assert.equal(remote.stdout.trim(),commit);
 }finally{await r.cleanup();}
});

import {gitNetworkEnv} from '../src/safe-process.js';
test('push environment keeps the user transport/credential setup but never leaks HAK_* or provider keys; token header is appended, not replacing',()=>{
 const base={PATH:'/bin',HTTPS_PROXY:'http://p:1',GIT_SSL_CAINFO:'/ca.pem',GIT_ASKPASS:'/ask',GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'url.x.insteadOf',GIT_CONFIG_VALUE_0:'y',GIT_CONFIG_KEY_1:'credential.helper',GIT_CONFIG_VALUE_1:'h',HAK_OMNIROUTE_API_KEY:'secret-secret-secret',ANTHROPIC_API_KEY:'sk-ant-xxxxxxxxxxxxxxxx'};
 const env=gitNetworkEnv(base,[['http.extraheader','AUTHORIZATION: basic abc']]);
 assert.equal(env.HTTPS_PROXY,'http://p:1');assert.equal(env.GIT_SSL_CAINFO,'/ca.pem');assert.equal(env.GIT_ASKPASS,'/ask');
 assert.equal(env.GIT_CONFIG_COUNT,'3');
 assert.equal(env.GIT_CONFIG_KEY_0,'url.x.insteadOf');assert.equal(env.GIT_CONFIG_KEY_1,'credential.helper');assert.equal(env.GIT_CONFIG_KEY_2,'http.extraheader');
 assert.equal(env.GIT_TERMINAL_PROMPT,'0');
 assert.equal(env.HAK_OMNIROUTE_API_KEY,undefined);assert.equal(env.ANTHROPIC_API_KEY,undefined);
 assert.equal(env.GIT_CONFIG_GLOBAL,undefined,'global config (credential manager) stays usable for push');
 const strict=scrubbedEnv({},base);
 assert.equal(strict.HTTPS_PROXY,undefined);assert.equal(strict.GIT_CONFIG_COUNT,undefined);
});

import {verifySteps} from '../src/workspace.js';
import {npmInstallEnv} from '../src/safe-process.js';
test('npm-ci-test: install step uses --ignore-scripts and proxy env; the test step gets no proxy/credentials',()=>{
 const steps=verifySteps('npm-ci-test');
 assert.equal(steps.length,2);
 assert.ok(steps[0].install&&steps[0].args.includes('ci')&&steps[0].args.includes('--ignore-scripts'));
 assert.equal(steps[1].install,undefined);assert.deepEqual(steps[1].args.slice(-1),['test']);
 const base={PATH:'/bin',HTTPS_PROXY:'http://p:1',npm_config_https_proxy:'http://p:1',GITHUB_TOKEN:'ghp_x',HAK_X:'s',ANTHROPIC_API_KEY:'k'};
 const env=npmInstallEnv(base);
 assert.equal(env.HTTPS_PROXY,'http://p:1');assert.equal(env.GITHUB_TOKEN,undefined);assert.equal(env.HAK_X,undefined);assert.equal(env.ANTHROPIC_API_KEY,undefined);
 assert.equal(scrubbedEnv({},base).HTTPS_PROXY,undefined);
 assert.throws(()=>verifySteps('npm ci; curl x'),/danh sách cho phép/);
});

test('replace blocks: exact unique anchors; missing/ambiguous anchors are refused and nothing is written (two-phase)',async()=>{
 const r=await makeRepo({'src/a.js':'const a=1;\nconst b=1;\nconst b=1;\n','src/c.js':'export const c=1;\n'});
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const wt=await ws.create({id:'r1',repoPath:r.repo,baseSha:r.sha,branch:'hak/test-replace'});
  await assert.rejects(()=>ws.applyEdits(wt,[{path:'src/c.js',replace:[{find:'export const c=1;',with:'export const c=2;'}]},{path:'src/a.js',replace:[{find:'const b=1;',with:'const b=2;'}]}],SCOPE),e=>e.code==='ANCHOR'&&/2 chỗ/.test(e.message));
  assert.equal(await readFile(join(wt,'src/c.js'),'utf8'),'export const c=1;\n','an earlier valid edit must not be half-applied');
  await assert.rejects(()=>ws.applyEdits(wt,[{path:'src/a.js',replace:[{find:'const zzz=9;',with:'x'}]}],SCOPE),e=>e.code==='ANCHOR'&&/Không tìm thấy/.test(e.message));
  await assert.rejects(()=>ws.applyEdits(wt,[{path:'src/missing.js',replace:[{find:'a',with:'b'}]}],SCOPE),/chưa tồn tại/);
  const ok=await ws.applyEdits(wt,[{path:'src/a.js',replace:[{find:'const a=1;',with:'const a=5;'},{find:'const b=1;\nconst b=1;',with:'const b=2;'}]}],SCOPE);
  assert.equal(ok[0].mode,'replace');assert.equal(ok[0].changes,2);
  assert.equal(await readFile(join(wt,'src/a.js'),'utf8'),'const a=5;\nconst b=2;\n');
  assert.throws(()=>ws.validateEdits([{path:'src/a.js',replace:[]}],SCOPE),/content|replace/);
  assert.throws(()=>ws.validateEdits([{path:'src/a.js'}],SCOPE),/content/);
 }finally{await r.cleanup();}
});
test('replace keeps CRLF files consistent when the model sends LF anchors; full rewrite of a big existing file is refused',async()=>{
 const r=await makeRepo({'src/w.js':'one\r\ntwo\r\nthree\r\n','src/big.js':'x'.repeat(40*1024)+'\n'});
 try{
  const ws=new Workspace({dir:join(r.dir,'ws')});
  const wt=await ws.create({id:'r2',repoPath:r.repo,baseSha:r.sha,branch:'hak/test-crlf'});
  await ws.applyEdits(wt,[{path:'src/w.js',replace:[{find:'one\ntwo',with:'uno\ndos'}]}],SCOPE);
  assert.equal(await readFile(join(wt,'src/w.js'),'utf8'),'uno\r\ndos\r\nthree\r\n');
  await assert.rejects(()=>ws.applyEdits(wt,[{path:'src/big.js',content:'y'}],SCOPE),/dùng "replace"/);
  const created=await ws.applyEdits(wt,[{path:'src/new.js',content:'ok\n'}],SCOPE);
  assert.equal(created[0].mode,'content');
 }finally{await r.cleanup();}
});

import {sandboxMode,netnsAvailable} from '../src/workspace.js';
test('sandbox policy: default is fail-closed netns; invalid values are refused; the mode is recorded in the evidence',async()=>{
 const keep=process.env.HAK_SANDBOX;
 try{
  delete process.env.HAK_SANDBOX;assert.equal(sandboxMode(),'netns');
  process.env.HAK_SANDBOX='nonsense';assert.throws(()=>sandboxMode(),/netns, container hoặc off/);
  process.env.HAK_SANDBOX='off';
  const r=await makeRepo();
  try{
   const ws=new Workspace({dir:join(r.dir,'ws')});
   const wt=await ws.create({id:'s0',repoPath:r.repo,baseSha:r.sha,branch:'hak/test-s0'});
   const v=await ws.verify(wt,'node-test',{timeoutMs:60000});
   assert.equal(v.sandbox,'off');assert.equal(v.passed,true);
  }finally{await r.cleanup();}
 }finally{process.env.HAK_SANDBOX=keep;}
});
test('sandbox netns: AI-written test code has no network; fails closed when isolation is unavailable',async()=>{
 const keep=process.env.HAK_SANDBOX;
 try{
  process.env.HAK_SANDBOX='netns';
  const probe="import test from 'node:test';import assert from 'node:assert/strict';import net from 'node:net';test('no network',async()=>{const r=await new Promise(res=>{const s=net.connect({host:'1.1.1.1',port:443,timeout:2000});s.on('connect',()=>{s.destroy();res('connected');});s.on('error',e=>res('blocked:'+e.code));s.on('timeout',()=>{s.destroy();res('blocked:timeout');});});assert.match(r,/^blocked/);});\n";
  const r=await makeRepo({'test/net.test.js':probe},{pkgTest:false});
  try{
   const ws=new Workspace({dir:join(r.dir,'ws')});
   const wt=await ws.create({id:'s1',repoPath:r.repo,baseSha:r.sha,branch:'hak/test-s1'});
   if(!(await netnsAvailable())){
    await assert.rejects(()=>ws.verify(wt,'node-test'),e=>e.code==='SANDBOX_UNAVAILABLE');
    return;
   }
   const v=await ws.verify(wt,'node-test',{timeoutMs:60000});
   assert.equal(v.sandbox,'netns');assert.equal(v.passed,true,v.output);
  }finally{await r.cleanup();}
 }finally{process.env.HAK_SANDBOX=keep;}
});

import {trustRepo} from '../src/safe-process.js';
test('trustRepo: a repository path chosen by the operator is passed as safe.directory (works for bind-mounted repos owned by another uid)',async()=>{
 const r=await makeRepo();
 try{
  trustRepo(r.repo);
  const out=await runProcess('git',['--version'],{timeoutMs:10000});assert.equal(out.code,0);
  const {runGit}=await import('../src/safe-process.js');
  const cfg=await runGit(['config','--get-all','safe.directory'],{cwd:r.repo});
  assert.ok(cfg.stdout.split('\n').includes(r.repo),'the operator-chosen path is in the effective safe.directory list');
  assert.ok(!cfg.stdout.split('\n').includes('*'),'never a wildcard');
 }finally{await r.cleanup();}
});
