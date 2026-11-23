import {exportLocalAcceptance} from '../src/acceptance-export.js';
try{
 const report=await exportLocalAcceptance();
 process.stdout.write('Acceptance packet saved locally: '+report.path+'\n');
 process.stdout.write('Local checks passed: '+report.localChecksPassed+'; production ready: false\n');
 if(!report.localChecksPassed)process.exitCode=1;
}catch(error){
 process.stderr.write('Acceptance packet export failed: '+(error?.code||'unexpected-error')+'\n');
 process.exitCode=1;
}
