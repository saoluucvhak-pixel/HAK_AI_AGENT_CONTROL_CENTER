import {readFile} from 'node:fs/promises';
import {verifyAcceptancePacket} from '../src/acceptance-packet-verifier.js';
const path=process.argv[2];
if(!path||process.argv.length!==3)throw new Error('Usage: npm run accept:verify -- <local-packet.json>');
try{
 const bytes=await readFile(path);
 if(bytes.length>65536)throw new Error('Packet too large');
 const result=verifyAcceptancePacket(JSON.parse(bytes.toString('utf8')));
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(!result.digestMatches)process.exitCode=1;
}catch{
 process.stderr.write('Packet invalid, unreadable or exceeds size limit. No content printed.\n');
 process.exitCode=1;
}
