import {verifyOmniRoute} from '../src/live-verification.js';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const enabled=process.env.HAK_OMNIROUTE_LIVE_TEST==='true';
const report=await verifyOmniRoute();
const lines=[
 'HAK OMNIROUTE LIVE VERIFICATION',
 'Checked: '+report.checkedAt,
 'Status: '+report.status,
 'Challenge verified: '+(report.verified?'YES':'NO'),
 'Provider identity independently verified: NO',
 'Production approved: NO',
 'Reason: '+report.reason,
 'Paid model requests: '+(enabled?'May have occurred if configured and reachable':'NONE (opt-in disabled)'),
 'Never share API keys or full provider responses in support reports.'
];
if(report.verified&&report.model)lines.push('Reported model: '+report.model);
const summary=lines.join('\n')+'\n';
process.stdout.write(summary);
try{await writeFile(resolve('HAK_OMNIROUTE_LIVE_RESULT.txt'),summary)}catch{console.error('Could not save local verification report')}
if(!report.verified)process.exitCode=1;
