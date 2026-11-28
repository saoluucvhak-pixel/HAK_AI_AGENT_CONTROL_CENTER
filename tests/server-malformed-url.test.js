import test from 'node:test';
import assert from 'node:assert/strict';
// Import only after disabling the production listener; otherwise node --test may hang.
process.env.NODE_ENV='test';
const {server}=await import('../src/server.js');

test('malformed request URL is handled without unhandled rejection',async()=>{
  let status;let body;
  const headers={};
  const req={url:'http://[',method:'GET',headers:{host:'127.0.0.1:'+Number(process.env.PORT||4317)}};
  const res={setHeader(k,v){headers[k]=v;},writeHead(code){status=code;},end(text){body=text;}};
  for(const listener of server.listeners('request'))await listener(req,res);
  assert.equal(status,500);
  assert.deepEqual(JSON.parse(body),{error:'Dashboard unavailable'});
  assert.equal(headers['Cache-Control'],'no-store');
  assert.equal(headers['X-Content-Type-Options'],'nosniff');
  assert.match(headers['Content-Security-Policy'],/default-src 'none'/);
  assert.equal(typeof body,'string');
});

test('unexpected Host cannot obtain an operator session',async()=>{
  for(const host of [undefined,'evil.example','localhost:4317']){
    let status,body;
    const req={url:'/api/operator/session',method:'GET',headers:{host}};
    const res={setHeader(){},writeHead(code){status=code;},end(text){body=text;}};
    for(const listener of server.listeners('request'))await listener(req,res);
    assert.equal(status,403);
    assert.deepEqual(JSON.parse(body),{error:'Invalid local Host'});
  }
});
test('malformed multibyte operator token is rejected without exception',async()=>{
  let status,body;
  const req={url:'/api/operator/results/'+'a'.repeat(24),method:'GET',headers:{host:'127.0.0.1:'+Number(process.env.PORT||4317),'x-hak-operator-token':'é'.repeat(64)}};
  const res={setHeader(){},writeHead(code){status=code;},end(text){body=text;}};
  for(const listener of server.listeners('request'))await listener(req,res);
  assert.equal(status,403);
  assert.deepEqual(JSON.parse(body),{error:'Local operator session required'});
});
