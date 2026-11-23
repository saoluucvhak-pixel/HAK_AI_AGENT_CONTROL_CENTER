import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../src/server.js';

test('malformed request URL is handled without unhandled rejection',async()=>{
  let status;let body;
  const headers={};
  const req={url:'http://[',method:'GET',headers:{}};
  const res={setHeader(k,v){headers[k]=v;},writeHead(code){status=code;},end(text){body=text;}};
  for(const listener of server.listeners('request'))await listener(req,res);
  assert.equal(status,500);
  assert.deepEqual(JSON.parse(body),{error:'Dashboard unavailable'});
  assert.equal(headers['Cache-Control'],'no-store');
  assert.equal(headers['X-Content-Type-Options'],'nosniff');
  assert.match(headers['Content-Security-Policy'],/default-src 'none'/);
});
