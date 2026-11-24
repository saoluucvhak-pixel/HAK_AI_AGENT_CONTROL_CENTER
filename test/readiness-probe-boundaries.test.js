import test from 'node:test';
import assert from 'node:assert/strict';
import {localEndpoint,probeTools} from '../src/readiness-probes.js';

test('only loopback HTTP root endpoints accepted',()=>{
 for(const url of ['https://127.0.0.1/','http://example.com/','http://user:pass@localhost/','http://localhost/health','http://localhost/?key=secret','http://localhost/#fragment']){
  assert.throws(()=>localEndpoint(url));
 }
 assert.equal(localEndpoint('http://127.0.0.1:8111/'),'http://127.0.0.1:8111');
});
test('reachable endpoints remain connectivity-only, never provider verified',async()=>{
 const requests=[];
 const report=await probeTools({env:{HAK_RUFLO_URL:'http://localhost:8112/',HAK_CLAUDE_MEM_URL:'http://127.0.0.1:8111/'},fetchImpl:async(url,opts)=>{requests.push({url,opts});return {ok:true,status:200}}});
 assert.deepEqual(requests.map(x=>x.url),['http://localhost:8112/health','http://127.0.0.1:8111/health']);
 assert.ok(requests.every(x=>x.opts.redirect==='manual'));
 assert.equal(report.readyForProduction,false);
 assert.equal(report.kind,'local-connectivity-only');
 assert.ok(report.checks.every(x=>x.verified===false));
 assert.equal(report.checks.filter(x=>x.status==='endpoint-reachable').length,2);
});
test('remote and failed endpoints do not report reachable',async()=>{
 let calls=0;
 const report=await probeTools({env:{HAK_RUFLO_URL:'https://example.com/',HAK_ARCHIFY_URL:'http://127.0.0.1:8113/'},fetchImpl:async()=>{calls++;return {ok:false,status:401}}});
 assert.equal(calls,1);
 assert.equal(report.checks.find(x=>x.id==='ruflo').status,'unreachable-or-invalid');
 assert.equal(report.checks.find(x=>x.id==='archify').status,'http-error');
 assert.equal(report.readyForProduction,false);
});
