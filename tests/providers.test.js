import test from 'node:test';
import assert from 'node:assert/strict';
import {jsonResponse,buildStack} from './helpers.js';
import {createAdapter,parseEndpoint,ProviderError} from '../src/providers.js';

const base={name:'x',timeoutMs:5000,maxTokens:1000,retries:1,maxConcurrency:2,model:'m'};
test('endpoint policy: https anywhere public, http only loopback, no credentials, no metadata hosts',()=>{
 assert.equal(parseEndpoint('https://api.anthropic.com/').base,'https://api.anthropic.com');
 assert.equal(parseEndpoint('http://127.0.0.1:20128').loopback,true);
 for(const bad of ['http://example.com','https://u:p@example.com','https://example.com/?a=1','ftp://x','https://169.254.169.254','nope'])
  assert.throws(()=>parseEndpoint(bad),ProviderError,bad);
});
test('Anthropic adapter request shape, usage and error normalization',async()=>{
 const calls=[];
 const fetchImpl=async(url,init)=>{calls.push({url,init});
  if(init.method==='GET')return jsonResponse({data:[{id:'claude-x'}]});
  return jsonResponse({model:'claude-x',content:[{type:'text',text:'xin chào'}],usage:{input_tokens:7,output_tokens:3}});};
 const a=createAdapter({...base,type:'anthropic',endpoint:'https://api.anthropic.com'},{secret:'sk-ant-testkey-123456',fetchImpl});
 assert.equal(a.validateConfig().ok,true);
 const r=await a.executeTask({prompt:'hi',system:'sys'});
 assert.equal(r.text,'xin chào');assert.deepEqual(r.usage,{inputTokens:7,outputTokens:3});assert.equal(r.identityVerified,false);
 assert.equal(calls[0].url,'https://api.anthropic.com/v1/messages');
 assert.equal(calls[0].init.headers['x-api-key'],'sk-ant-testkey-123456');
 assert.equal(calls[0].init.headers['anthropic-version'],'2023-06-01');
 assert.equal(JSON.parse(calls[0].init.body).system,'sys');
 assert.deepEqual(await a.listModels(),['claude-x']);
 assert.equal(a.getUsage().requests,1);
});
test('Gemini adapter uses header key (not URL) and parses candidates',async()=>{
 const calls=[];
 const fetchImpl=async(url,init)=>{calls.push({url,init});
  if(init.method==='GET')return jsonResponse({models:[{name:'models/gemini-x'}]});
  return jsonResponse({candidates:[{content:{parts:[{text:'a'},{text:'b'}]}}],usageMetadata:{promptTokenCount:4,candidatesTokenCount:2}});};
 const a=createAdapter({...base,type:'gemini',endpoint:'https://generativelanguage.googleapis.com',model:'gemini-x'},{secret:'AIzaSyTESTKEY1234567890',fetchImpl});
 const r=await a.executeTask({prompt:'hi'});
 assert.equal(r.text,'ab');
 assert.doesNotMatch(calls[0].url,/AIza|key=/);
 assert.equal(calls[0].init.headers['x-goog-api-key'],'AIzaSyTESTKEY1234567890');
 assert.match(calls[0].url,/models\/gemini-x:generateContent$/);
 assert.deepEqual(await a.listModels(),['gemini-x']);
});
test('HTTP failures map to retryability and never leak the key',async()=>{
 const key='sk-leaky-key-1234567890';
 for(const [status,code,retryable] of [[401,'AUTH',false],[429,'RATE_LIMIT',true],[503,'UPSTREAM',true],[404,'NOT_FOUND',false]]){
  const a=createAdapter({...base,type:'openai-compatible',endpoint:'https://gw.example.com'},{secret:key,fetchImpl:async()=>new Response('bad '+key,{status})});
  await assert.rejects(()=>a.executeTask({prompt:'x'}),e=>{const n=a.normalizeError(e);return n.code===code&&n.retryable===retryable&&!JSON.stringify(n).includes(key);});
 }
 const net=createAdapter({...base,type:'openai-compatible',endpoint:'https://gw.example.com'},{secret:key,fetchImpl:async()=>{throw new Error('ECONNREFUSED '+key)}});
 await assert.rejects(()=>net.executeTask({prompt:'x'}),e=>net.normalizeError(e).code==='NETWORK'&&!net.normalizeError(e).message.includes(key));
});
test('redirects, oversize and malformed responses are rejected',async()=>{
 const mk=f=>createAdapter({...base,type:'openai-compatible',endpoint:'https://gw.example.com'},{secret:'k'.repeat(20),fetchImpl:f});
 await assert.rejects(()=>mk(async()=>new Response('{}',{status:302})).executeTask({prompt:'x'}),e=>e.code==='REJECTED');
 await assert.rejects(()=>mk(async()=>new Response('not json',{status:200})).executeTask({prompt:'x'}),e=>e.code==='RESPONSE');
 await assert.rejects(()=>mk(async()=>new Response('{}',{status:200,headers:{'content-length':String(10*1024*1024)}})).executeTask({prompt:'x'}),e=>e.code==='RESPONSE');
 await assert.rejects(()=>mk(async()=>jsonResponse({choices:[{message:{content:''}}]})).executeTask({prompt:'x'}),e=>e.code==='RESPONSE');
});
test('cancellation signal aborts an in-flight call',async()=>{
 const fetchImpl=(url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));
 const a=createAdapter({...base,type:'openai-compatible',endpoint:'https://gw.example.com'},{secret:'k'.repeat(20),fetchImpl});
 const ctl=new AbortController();const p=a.executeTask({prompt:'x',signal:ctl.signal});
 assert.equal(a.cancelTask(ctl),true);
 await assert.rejects(p,e=>e.code==='CANCELLED');
});
test('validateConfig demands a key for remote endpoints and sane limits',()=>{
 const a=createAdapter({...base,type:'anthropic',endpoint:'https://api.anthropic.com'},{secret:null});
 assert.match(a.validateConfig().errors.join(),/API key/);
 const loop=createAdapter({...base,type:'openai-compatible',endpoint:'http://127.0.0.1:11434'},{secret:null});
 assert.equal(loop.validateConfig().ok,true);
 const bad=createAdapter({...base,type:'openai-compatible',endpoint:'http://127.0.0.1:1',timeoutMs:5,retries:9,maxConcurrency:99},{secret:null});
 assert.equal(bad.validateConfig().errors.length,3);
});
test('health check reports live connectivity without claiming provider identity',async()=>{
 const s=await buildStack();
 try{
  const h=await s.providers.test(s.conn.id);
  assert.equal(h.ok,true);assert.equal(h.stage,'live-connectivity');assert.equal(h.identityVerified,false);assert.equal(h.modelCount,2);
 }finally{await s.cleanup();}
});

test('an already-aborted signal is refused before any request is sent',async()=>{
 let sent=0;
 const a=createAdapter({...base,type:'openai-compatible',endpoint:'https://gw.example.com'},{secret:'k'.repeat(20),fetchImpl:async()=>{sent++;return jsonResponse({});}});
 const ctl=new AbortController();ctl.abort();
 await assert.rejects(()=>a.executeTask({prompt:'x',signal:ctl.signal}),e=>e.code==='CANCELLED');
 assert.equal(sent,0);
});
