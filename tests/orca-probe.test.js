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

test('Orca CLI subprocess receives only required OS variables, not HAK credentials',()=>{
  let received;
  const result=probeOrca({enabled:true,env:{
    PATH:'/usr/bin',HOME:'/home/operator',SystemRoot:'C:\\Windows',
    GITHUB_TOKEN:'secret-github',HAK_OBSERVER_TOKEN:'secret-observer',
    HAK_OMNIROUTE_API_KEY:'secret-provider',ANTHROPIC_API_KEY:'secret-model'
  },run:(_cmd,_args,opts)=>{received=opts.env;return {status:0,stdout:'{"ok":true}'};}});
  assert.equal(result.connected,true);
  assert.equal(received.PATH,'/usr/bin');
  assert.equal(received.HOME,'/home/operator');
  assert.equal(received.SystemRoot,'C:\\Windows');
  assert.equal(received.NO_COLOR,'1');
  for(const key of ['GITHUB_TOKEN','HAK_OBSERVER_TOKEN','HAK_OMNIROUTE_API_KEY','ANTHROPIC_API_KEY'])
    assert.equal(Object.hasOwn(received,key),false);
});
