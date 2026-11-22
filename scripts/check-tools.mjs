import {probeTools} from '../src/readiness-probes.js';
const report=await probeTools();
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(report.checks.some(c=>c.status==='unreachable-or-invalid'||c.status==='http-error'))process.exitCode=1;
