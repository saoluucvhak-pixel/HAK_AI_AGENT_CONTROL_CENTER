import test from 'node:test';
import assert from 'node:assert/strict';
import {validPort,inspectDashboard} from '../scripts/launch.mjs';

test('launcher rejects invalid ports',()=>{
 assert.equal(validPort('4317'),4317);
 for(const x of ['0','65536','hello','12.5'])assert.throws(()=>validPort(x));
});
test('launcher recognizes only HAK health signatures',async()=>{
 const good=async()=>({ok:true,json:async()=>({app:'hak-agent-control-center',host:'127.0.0.1'})});
 const wrong=async()=>({ok:true,json:async()=>({app:'other',host:'127.0.0.1'})});
 assert.equal(await inspectDashboard('http://127.0.0.1:4317',good),'running');
 assert.equal(await inspectDashboard('http://127.0.0.1:4317',wrong),'occupied');
 assert.equal(await inspectDashboard('http://127.0.0.1:4317',async()=>{throw new Error('ECONNREFUSED')}),'free');
});
