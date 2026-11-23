import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';

// Do not bind the production port when importing the dashboard.
process.env.NODE_ENV='test';
const {server}=await import('../src/server.js');

test('real HTTP dashboard health endpoint and response headers',async()=>{
  server.listen(0,'127.0.0.1');
  try{
    await once(server,'listening');
    const address=server.address();
    assert.ok(address && typeof address!=='string');
    const response=await fetch('http://127.0.0.1:'+address.port+'/api/health',{signal:AbortSignal.timeout(5000)});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.match(response.headers.get('content-security-policy')||'',/default-src 'none'/);
    const health=await response.json();
    assert.equal(health.ok,true);
    assert.equal(health.app,'hak-agent-control-center');
    assert.equal(health.mode,'read-only');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
