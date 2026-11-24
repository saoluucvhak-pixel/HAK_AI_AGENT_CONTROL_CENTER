import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tempDir} from './helpers.js';
import {redact,FileSecretBackend,DpapiSecretBackend,createSecretStore} from '../src/secrets.js';
import {JsonFile} from '../src/json-store.js';

test('redact removes known secrets and credential shapes',()=>{
 const text=redact('boom sk-abcdefghijklmnopqrstuv key=AIzaSyA1234567890abcdefghij Bearer abcdefghijklmnop1234 mine=topsecret-value',['topsecret-value']);
 assert.doesNotMatch(text,/sk-abcdef|AIzaSy|abcdefghijklmnop1234|topsecret-value/);
 assert.match(text,/\[REDACTED\]/);
});
test('JsonFile writes atomically, keeps backup and falls back from a corrupt file',async()=>{
 const t=await tempDir();
 try{
  const f=new JsonFile(join(t.dir,'a','x.json'));
  await f.write({v:1});await f.write({v:2});
  assert.deepEqual(await f.read(),{v:2});
  await writeFile(f.path,'{truncated');
  assert.deepEqual(await f.read(),{v:1},'corrupt primary must fall back to previous good copy');
  assert.deepEqual(await new JsonFile(join(t.dir,'none.json')).read('d'),'d');
  await Promise.all(Array.from({length:30},(_,i)=>f.write({v:i})));
  assert.deepEqual(await f.read(),{v:29},'concurrent writes serialize in order');
 }finally{await t.cleanup();}
});
test('file secret backend stores values owner-only and rejects bad names',async()=>{
 const t=await tempDir();
 try{
  const s=new FileSecretBackend(join(t.dir,'s.json'));
  await s.set('provider:abc','value-123456');
  assert.equal(await s.get('provider:abc'),'value-123456');
  assert.deepEqual(await s.names(),['provider:abc']);
  if(process.platform!=='win32')assert.equal((await stat(join(t.dir,'s.json'))).mode&0o077,0);
  await assert.rejects(()=>s.get('../etc/passwd'),/Invalid secret name/);
  await s.delete('provider:abc');assert.equal(await s.get('provider:abc'),null);
 }finally{await t.cleanup();}
});
test('DPAPI backend never writes plaintext (injected protector)',async()=>{
 const t=await tempDir();
 try{
  const run=async(script,input)=>script.includes('Unprotect')?Buffer.from(input.trim(),'base64').toString().split('').reverse().join(''):Buffer.from(input.split('').reverse().join('')).toString('base64');
  const s=new DpapiSecretBackend(join(t.dir,'d.json'),{run});
  await s.set('k','plain-secret-value');
  assert.doesNotMatch(await readFile(join(t.dir,'d.json'),'utf8'),/plain-secret-value/);
  assert.equal(await s.get('k'),'plain-secret-value');
 }finally{await t.cleanup();}
});
test('createSecretStore chooses DPAPI on Windows only',()=>{
 assert.equal(createSecretStore('x',{platform:'win32'}).kind,'windows-dpapi-current-user');
 assert.equal(createSecretStore('x',{platform:'linux'}).kind,'file-0600');
});
test('real DPAPI round trip on Windows',{skip:process.platform!=='win32'},async()=>{
 const t=await tempDir();
 try{
  const s=new DpapiSecretBackend(join(t.dir,'d.json'));
  await s.set('k','real-secret-value-€');
  assert.doesNotMatch(await readFile(join(t.dir,'d.json'),'utf8'),/real-secret/);
  assert.equal(await s.get('k'),'real-secret-value-€');
 }finally{await t.cleanup();}
});
