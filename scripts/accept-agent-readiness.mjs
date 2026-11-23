import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'hak-readiness-ci-'));
try{
 const env={...process.env};
 for(const key of Object.keys(env))if(/^HAK_(OMNIROUTE|RUFLO|CLAUDE_MEM|ARCHIFY|OCR)_/.test(key))delete env[key];
 const run=spawnSync(process.execPath,[resolve('scripts/agent-readiness-windows.mjs')],{cwd:dir,env,encoding:'utf8',timeout:15000});
 if(run.error||run.status!==0)throw Error('Readiness script failed in unconfigured isolated environment');
 const report=readFileSync(join(dir,'HAK_AGENT_READINESS_RESULT.txt'),'utf8');
 for(const marker of ['OmniRoute model gateway: not-configured','Ruflo multi-agent: not-configured','Claude-Mem: not-configured','Archify: not-configured','OCR: not-configured','External execution verified: NO','Production approved: NO']){
  if(!report.includes(marker))throw Error('Missing readiness marker: '+marker);
 }
 if(!run.stdout.includes('HAK EXTERNAL AGENT READINESS'))throw Error('No operator-readable summary');
 console.log('PASS: Isolated readiness report, all five unconfigured states and non-production disclaimers');
}finally{rmSync(dir,{recursive:true,force:true})}
