import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptancePacket} from '../src/acceptance-packet.js';
import {verifyAcceptancePacket} from '../src/acceptance-packet-verifier.js';
const baseline={kind:'hak-local-acceptance-diagnostics',platform:'win32',nodeMajor:22,localChecksPassed:true,checks:[{id:'node-version',status:'passed'}],connectivity:[{id:'ruflo',status:'not-configured'}],readyForProduction:false};
test('valid packet integrity never proves execution',()=>{
 const p=createAcceptancePacket({baseline});
 const r=verifyAcceptancePacket(p);
 assert.equal(r.digestMatches,true);
 assert.equal(r.externalExecutionVerified,false);
 assert.equal(r.readyForProduction,false);
 assert.equal(r.missingOrPending.length,6);
});
test('tampered packet fails digest',()=>{
 const p=createAcceptancePacket({baseline});
 p.checks[0].status='failed';
 assert.equal(verifyAcceptancePacket(p).digestMatches,false);
});
test('forged gate pass fails closed',()=>{
 const p=createAcceptancePacket({baseline});
 p.required[0].status='passed';
 assert.throws(()=>verifyAcceptancePacket(p),/Invalid acceptance gates/);
});
test('invalid hash is rejected',()=>{
 const p=createAcceptancePacket({baseline});
 p.sha256='not-a-digest';
 assert.throws(()=>verifyAcceptancePacket(p),/Invalid digest/);
});
