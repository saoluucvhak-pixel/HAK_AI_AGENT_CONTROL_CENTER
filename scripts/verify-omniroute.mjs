import {verifyOmniRoute} from '../src/live-verification.js';
const result=await verifyOmniRoute();
process.stdout.write(JSON.stringify(result,null,2)+'\n');
if(!result.verified)process.exitCode=1;
