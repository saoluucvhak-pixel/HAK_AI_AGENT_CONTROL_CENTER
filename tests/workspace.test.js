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
