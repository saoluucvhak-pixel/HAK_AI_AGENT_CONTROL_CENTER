import {localAcceptance} from '../src/local-acceptance.js';
const result=await localAcceptance();
process.stdout.write(JSON.stringify(result,null,2)+'\n');
if(!result.localChecksPassed)process.exitCode=1;
