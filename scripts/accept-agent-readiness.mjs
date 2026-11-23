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
 const invalidEnv={...env,HAK_RUFLO_URL:'https://example.com'};
 const invalid=spawnSync(process.execPath,[resolve('scripts/agent-readiness-windows.mjs')],{cwd:dir,env:invalidEnv,encoding:'utf8',timeout:15000});
 if(invalid.error||invalid.status===0)throw Error('Invalid non-loopback endpoint must fail closed');
 const invalidReport=readFileSync(join(dir,'HAK_AGENT_READINESS_RESULT.txt'),'utf8');
 if(!invalidReport.includes('Ruflo multi-agent: unreachable-or-invalid')||!invalidReport.includes('External execution verified: NO')||!invalidReport.includes('Production approved: NO'))throw Error('Invalid endpoint report missing safeguards');
 console.log('PASS: Isolated readiness report, fail-closed invalid endpoint, and non-production disclaimers');
}finally{rmSync(dir,{recursive:true,force:true})}
