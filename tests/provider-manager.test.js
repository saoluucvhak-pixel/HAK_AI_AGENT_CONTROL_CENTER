import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildStack,jsonResponse} from './helpers.js';

test('connections persist; API key is stored only in the secret store and never returned or written to config',async()=>{
 const s=await buildStack();
 try{
  const list=await s.providers.list();
  assert.equal(list.length,1);assert.equal(list[0].hasSecret,true);
  assert.doesNotMatch(JSON.stringify(list),/test-key-1234567890/);
  assert.doesNotMatch(await readFile(join(s.dir,'providers.json'),'utf8'),/test-key-1234567890/);
  assert.match(await readFile(join(s.dir,'secrets.json'),'utf8'),/test-key-1234567890/,'secret lives in the secret backend');
 }finally{await s.cleanup();}
});
test('invalid configuration is rejected with a readable reason',async()=>{
 const s=await buildStack();
 try{
  await assert.rejects(()=>s.providers.upsert({type:'anthropic',name:'A',endpoint:'https://api.anthropic.com',model:'x'},'short'),/API key/);
  await assert.rejects(()=>s.providers.upsert({type:'openai-compatible',name:'B',endpoint:'http://evil.example.com',model:'x'},'k'.repeat(20)),/http chỉ được dùng/);
  await assert.rejects(()=>s.providers.upsert({type:'nope',name:'C'},'k'.repeat(20)),/không được hỗ trợ/);
  await assert.rejects(()=>s.providers.upsert({type:'anthropic',name:'A',endpoint:'https://api.anthropic.com',model:'x'},'k'.repeat(20)+'\nX=1'),/một dòng/);
 }finally{await s.cleanup();}
});
test('edit keeps the stored key; enable/disable; per-agent model mapping; removal deletes the secret',async()=>{
 const s=await buildStack();
 try{
  const edited=await s.providers.upsert({id:s.conn.id,name:'Renamed',timeoutMs:9000});
  assert.equal(edited.name,'Renamed');assert.equal(edited.hasSecret,true);assert.equal(edited.timeoutMs,9000);
  await s.providers.setAgentModel('security',s.conn.id,'m-2');
  assert.equal(s.providers.resolve('security').model,'m-2');
  assert.equal(s.providers.resolve('backend').model,'m-1');
  await s.providers.setEnabled(s.conn.id,false);
  assert.throws(()=>s.providers.resolve('backend'),/Chưa có kết nối AI nào được bật/);
  await s.providers.setEnabled(s.conn.id,true);
  await s.providers.remove(s.conn.id);
  assert.equal((await s.providers.list()).length,0);
  assert.equal(await (await import('../src/secrets.js')).FileSecretBackend.prototype.get.call(new (await import('../src/secrets.js')).FileSecretBackend(join(s.dir,'secrets.json')),'provider:'+s.conn.id),null);
 }finally{await s.cleanup();}
});
test('usage and cost are only reported when prices are configured; cost cap blocks further calls',async()=>{
 const s=await buildStack({connection:{costLimitUsd:0.0005}});
 try{
  const r=await s.providers.execute(s.conn.id,{prompt:'a',model:'m-1'});
  assert.equal(r.usage.inputTokens,100);
  assert.ok(Math.abs(r.costUsd-(100*1+50*2)/1e6)<1e-12);
  await s.providers.execute(s.conn.id,{prompt:'b',model:'m-1'});
  await s.providers.execute(s.conn.id,{prompt:'c',model:'m-1'});
  await assert.rejects(()=>s.providers.execute(s.conn.id,{prompt:'e',model:'m-1'}),e=>e.code==='BUDGET');
  assert.equal(s.providers.usageTotals().requests,3);
  const unpriced=await s.providers.upsert({type:'openai-compatible',name:'U',endpoint:'http://127.0.0.1:20129',model:'m-1'},'k'.repeat(20));
  await s.providers.execute(unpriced.id,{prompt:'x',model:'m-1'});
  assert.equal(s.providers.usageTotals().costUsd,null,'unknown cost must not be presented as a number');
 }finally{await s.cleanup();}
});
test('per-connection concurrency gate is enforced',async()=>{
 let active=0,peak=0;
 const s=await buildStack({connection:{maxConcurrency:2},handler:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,30));active--;return 'ok';}});
 try{
  await Promise.all(Array.from({length:6},(_,i)=>s.providers.execute(s.conn.id,{prompt:'p'+i,model:'m-1'})));
  assert.equal(peak,2);
 }finally{await s.cleanup();}
});
test('provider errors surface normalized, retryable flag preserved',async()=>{
 const s=await buildStack({handler:async()=>jsonResponse({},429)});
 try{
  await assert.rejects(()=>s.providers.execute(s.conn.id,{prompt:'x',model:'m-1'}),e=>e.code==='RATE_LIMIT'&&e.retryable===true);
 }finally{await s.cleanup();}
});
