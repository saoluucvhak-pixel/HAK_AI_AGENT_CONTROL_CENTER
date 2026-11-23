import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('local Orca acceptance command fails closed without installed CLI',()=>{
  const path=fileURLToPath(new URL('../scripts/accept-orca.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[path],{
    encoding:'utf8',timeout:8000,
    env:{PATH:'',Path:'',SystemRoot:process.env.SystemRoot||'',HOME:process.env.HOME||''}
  });
  assert.equal(result.status,1);
  const parsed=JSON.parse(result.stdout);
  assert.deepEqual(parsed,{status:'unavailable',connected:false});
  assert.equal(result.stderr,'');
});
