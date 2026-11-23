import {readFile} from 'node:fs/promises';
import {verifyAcceptancePacket} from '../src/acceptance-packet-verifier.js';
import {exportLocalAcceptance} from '../src/acceptance-export.js';
try{
 const report=await exportLocalAcceptance();
 const bytes=await readFile(report.path);
 if(bytes.length>65536)throw new Error('Packet too large');
 const verification=verifyAcceptancePacket(JSON.parse(bytes.toString('utf8')));
 if(!verification.digestMatches)throw new Error('Packet integrity mismatch');
 process.stdout.write('Saved packet integrity: verified (SHA256); external services: unverified\n');
 process.stdout.write('Acceptance packet saved locally: '+report.path+'\n');
 process.stdout.write('Local checks passed: '+report.localChecksPassed+'; production ready: false\n');
 process.stdout.write('Next: '+report.summary.nextStep+'\n');
 for(const gate of report.summary.pendingGates)process.stdout.write('PENDING '+gate.id+': '+gate.action+'\n');
 if(!report.localChecksPassed)process.exitCode=1;
}catch(error){
 process.stderr.write('Acceptance packet export failed: '+(error?.code||'unexpected-error')+'\n');
 process.exitCode=1;
}
