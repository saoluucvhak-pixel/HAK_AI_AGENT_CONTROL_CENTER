import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {verifyOmniRoute} from '../src/live-verification.js';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const path=join(root,'.env');
if(!existsSync(path)){
 console.error('NOT CONFIGURED: run HAK_CONFIG_AI_WINDOWS.cmd first.');
 process.exitCode=2;
}else{
 process.loadEnvFile(path);
 const env={...process.env,HAK_OMNIROUTE_LIVE_TEST:'true'};
 console.log('Checking configured local AI gateway. This sends one harmless test prompt to the configured provider.');
 const report=await verifyOmniRoute({env});
 console.log('Status: '+report.status);
 if(report.verified){
  console.log('PASS: model returned the expected challenge. Model reported: '+String(report.model||'unknown'));
  console.log('This does not prove provider identity, account billing, or production readiness.');
 }else{
  console.error('FAIL: live model challenge did not pass. Check that OmniRoute is running, its model mapping, and the private API key.');
  process.exitCode=1;
 }
}
