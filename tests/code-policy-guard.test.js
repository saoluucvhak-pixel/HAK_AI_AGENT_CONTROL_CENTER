import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCodePolicy,assertCodePolicy} from '../src/code-policy-guard.js';

test('code-policy-guard: accepts safe, well-structured patch within limits', () => {
 const changes=[
  {path:'app/main/services/SafeService.js',createNew:false,newContent:'export function test(){ return 42; }'},
  {path:'docs/PHAT_HANH_1.9.4.md',createNew:true,newContent:'# DGVC Release 1.9.4 Notes\nClean documentation.'}
 ];
 const res=inspectCodePolicy(changes);
 assert.equal(res.valid,true);
 assert.equal(res.violations.length,0);
 assert.equal(res.stats.filesCount,2);
 assert.doesNotThrow(()=>assertCodePolicy(changes));
});

test('code-policy-guard: rejects secret tokens, private keys and passwords in content', () => {
 const secrets=[
  'const token = "ghp_123456789012345678901234567890123456";',
  '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----',
  'const config = { api_key: "super_secret_password_12345" };',
  'Authorization: Bearer secret_access_token_abcdef1234567890'
 ];

 for(const secret of secrets){
  const changes=[{path:'app/main/auth.js',newContent:secret}];
  const res=inspectCodePolicy(changes);
  assert.equal(res.valid,false);
  assert.ok(res.violations.some(v=>v.rule==='secret-leak'));
  assert.throws(()=>assertCodePolicy(changes),/secret-leak/);
 }
});

test('code-policy-guard: rejects path traversal, dotfiles and unallowlisted paths', () => {
 const badPaths=[
  '../outside.js',
  '/etc/passwd',
  'app/../../root.js',
  '.env',
  '.git/config',
  'random_folder/file.js'
 ];

 for(const path of badPaths){
  const changes=[{path,newContent:'console.log("unsafe");'}];
  const res=inspectCodePolicy(changes);
  assert.equal(res.valid,false);
  assert.ok(res.violations.some(v=>v.rule==='path-safety'));
 }
});

test('code-policy-guard: rejects oversized patches and null bytes', () => {
 const nullByte=[{path:'app/main/test.js',newContent:'clean\0dirty'}];
 assert.equal(inspectCodePolicy(nullByte).valid,false);

 const bigFile=[{path:'app/main/big.js',newContent:'a'.repeat(65000)}];
 assert.equal(inspectCodePolicy(bigFile).valid,false);
 assert.ok(inspectCodePolicy(bigFile).violations.some(v=>v.rule==='file-size'));

 const tooManyFiles=Array.from({length:11},(_,i)=>({path:`app/main/f${i}.js`,newContent:'ok'}));
 assert.throws(()=>inspectCodePolicy(tooManyFiles),/exceed limit of 10 files/);
});
