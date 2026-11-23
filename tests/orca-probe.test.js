import test from 'node:test';
import assert from 'node:assert/strict';
import {probeOrca} from '../src/orca-probe.js';
test('disabled Orca probe never executes',()=>{
  assert.deepEqual(probeOrca({run:()=>{throw Error('unexpected')}}),{status:'disabled',connected:false});
});
test('Orca probe uses fixed read-only CLI command without a shell',()=>{
  let call;
  const result=probeOrca({enabled:true,run:(cmd,args,opts)=>{
    call={cmd,args,opts};return {status:0,stdout:'{"ready":true}'};
  }});
  assert.deepEqual(result,{status:'reachable',connected:true});
  assert.equal(call.cmd,'orca');
  assert.deepEqual(call.args,['status','--json']);
  assert.equal(call.opts.shell,false);
  assert.equal(call.opts.timeout,5000);
});
test('Orca probe fails closed and never exposes raw CLI output',()=>{
  for(const output of [{status:1,stderr:'SECRET'},{status:0,stdout:'not-json SECRET'},
    {status:0,stdout:'x'.repeat(65537)},{error:new Error('SECRET')}]) {
    const result=probeOrca({enabled:true,run:()=>output});
    assert.equal(result.connected,false);
    assert.doesNotMatch(JSON.stringify(result),/SECRET/);
  }
});
