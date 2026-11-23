import {buildLocalAcceptancePacket} from '../src/acceptance-packet.js';
const packet=await buildLocalAcceptancePacket();
process.stdout.write(JSON.stringify(packet,null,2)+'\n');
if(!packet.localChecksPassed)process.exitCode=1;
