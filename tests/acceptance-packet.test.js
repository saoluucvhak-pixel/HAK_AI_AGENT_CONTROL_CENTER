import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptancePacket,buildLocalAcceptancePacket} from '../src/acceptance-packet.js';
const baseline={kind:'hak-local-acceptance-diagnostics',platform:'win32',nodeMajor:22,localChecksPassed:true,readyForProduction:false,checks:[{id:'npm-test',status:'passed'}],connectivity:[{id:'ruflo',status:'endpoint-reachable'}]};
test('packet is deterministic, redacted and fail-closed',()=>{
 const a=createAcceptancePacket({baseline}),b=createAcceptancePacket({baseline});
 assert.deepEqual(a,b);assert.match(a.sha256,/^[0-9a-f]{64}$/);
 assert.equal(a.required.length,7);assert.equal(a.readyForProduction,false);
 assert.ok(a.required.every(x=>x.status==='missing'));
});
test('refuses unverified claims of successful external gates',()=>{
 assert.throws(()=>createAcceptancePacket({baseline,reviewedEvidence:[{id:'ruflo-live',status:'passed'}]}),/independent/);
 assert.throws(()=>createAcceptancePacket({baseline,reviewedEvidence:[{id:'ruflo-live',status:'pending'},{id:'ruflo-live',status:'pending'}]}),/duplicate/);
});
test('local runner cannot imply production acceptance',async()=>{
 const packet=await buildLocalAcceptancePacket({platform:'win32',nodeVersion:'22.0.0',spawnImpl:()=>({status:0,stdout:'private',stderr:'secret'}),probeImpl:async()=>({checks:[{id:'ruflo',status:'endpoint-reachable'}]}),env:{}});
 assert.equal(packet.localChecksPassed,true);assert.equal(packet.readyForProduction,false);
 assert.equal(JSON.stringify(packet).includes('private'),false);
});
