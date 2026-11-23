import {probeTools} from '../src/readiness-probes.js';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const report=await probeTools();
const names={'omniroute':'OmniRoute model gateway','ruflo':'Ruflo multi-agent','claude-mem':'Claude-Mem','archify':'Archify','ocr':'OCR'};
const lines=['HAK EXTERNAL AGENT READINESS','Checked: '+report.checkedAt,'',...report.checks.map(c=>names[c.id]+': '+c.status+(c.httpStatus?' (HTTP '+c.httpStatus+')':'')),'','This is CONNECTIVITY ONLY. No agent or paid model request was made.','External execution verified: NO','Production approved: NO'];
const result=lines.join('\n')+'\n';
console.log(result);
try{await writeFile(resolve('HAK_AGENT_READINESS_RESULT.txt'),result);console.log('Saved: HAK_AGENT_READINESS_RESULT.txt')}catch{console.error('Could not save readiness report')}
if(report.checks.some(c=>c.status==='unreachable-or-invalid'||c.status==='http-error'))process.exitCode=1;
