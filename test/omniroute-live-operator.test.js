import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
test('live verification launcher defaults to no provider request and no approval',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hak-omniroute-disabled-'));
 try{
  const env={...process.env,HAK_OMNIROUTE_LIVE_TEST:'false'};
  const r=spawnSync(process.execPath,[resolve('scripts/omniroute-live-windows.mjs')],{cwd:dir,env,encoding:'utf8',timeout:10000});
  assert.equal(r.status,1);
  const report=readFileSync(join(dir,'HAK_OMNIROUTE_LIVE_RESULT.txt'),'utf8');
  for(const marker of ['Status: not-enabled','Challenge verified: NO','Provider identity independently verified: NO','Production approved: NO','Paid model requests: NONE'])assert.ok(report.includes(marker),marker);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
