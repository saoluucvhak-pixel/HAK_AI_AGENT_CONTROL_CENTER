import {runOcrAcceptance} from '../src/ocr-acceptance.js';
try{
 const [filePath,threshold]=process.argv.slice(2);
 const result=await runOcrAcceptance({filePath,threshold});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(!result.passed)process.exitCode=1;
}catch{
 process.stderr.write('OCR acceptance failed: invalid, unavailable or unapproved local dataset or configuration. No dataset content was logged.\n');
 process.exitCode=1;
}
