import test from 'node:test';
import assert from 'node:assert/strict';
import {localAcceptance,runNpmScript} from '../src/local-acceptance.js';
const fakeProbe=async()=>({checks:[{id:'ruflo',status:'endpoint-reachable'}]});
test('successful local checks still never certify external agents',async()=>{
 const spawnImpl=(cmd,args,opts)=>({status:0,stdout:'secret-output',stderr:'secret-error'});
 const r=await localAcceptance({platform:'win32',nodeVersion:'22.1.0',spawnImpl,probeImpl:fakeProbe,env:{}});
 assert.equal(r.localChecksPassed,true);assert.equal(r.readyForProduction,false);assert.equal(r.externalAgentsVerified,false);
 assert.equal(JSON.stringify(r).includes('secret-'),false);
 assert.deepEqual(r.checks.map(x=>x.status),['passed','passed','passed']);
});
test('failed npm check prevents local pass',async()=>{
 const r=await localAcceptance({platform:'linux',nodeVersion:'20.0.0',spawnImpl:()=>({status:1}),probeImpl:fakeProbe,env:{}});
 assert.equal(r.localChecksPassed,false);assert.equal(r.checks[0].status,'failed');
});
test('npm invocation is shell-free and allowlisted',()=>{
 let observed;
 runNpmScript('test',{platform:'win32',spawnImpl:(cmd,args,opts)=>{observed={cmd,args,opts};return {status:0}}});
 assert.equal(observed.cmd,'cmd.exe');assert.deepEqual(observed.args,['/d','/s','/c','npm run test']);assert.equal(observed.opts.shell,false);
 assert.throws(()=>runNpmScript('install'),/Unsupported/);
});
