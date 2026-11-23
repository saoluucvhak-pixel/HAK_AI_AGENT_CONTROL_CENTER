import {probeOrca} from '../src/orca-probe.js';

// This is an opt-in local CLI probe, not an acceptance of desktop/mobile agents.
// Output is intentionally restricted to two sanitized fields.
const result=probeOrca({enabled:true});
process.stdout.write(JSON.stringify(result)+'\n');
if(!result.connected) process.exitCode=1;
