import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';

const ALLOWED_BINARIES=new Set(['node','python','python3','py','npm']);
const DEFAULT_TIMEOUT_MS=60000;
const MAX_OUTPUT_BYTES=128000;

function sanitizeEnv(env=process.env){
 const safe={};
 const ALLOWLISTED_VARS=[
  'PATH','Path','PATHEXT','SystemRoot','TEMP','TMP','HOME','USERPROFILE',
  'NODE_ENV','DGVC_STORAGE','PYTHONPATH','LANG','LC_ALL'
 ];
 for(const key of ALLOWLISTED_VARS){
  if(env[key]!==undefined)safe[key]=env[key];
 }
 safe.CI='true';
 return safe;
}

export function extractTestFailureSummary(output){
 if(typeof output!=='string')return 'No output recorded';
 const lines=output.split(/\r?\n/);
 const failureLines=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/✖|AssertionError|ERR_ASSERTION|FAIL|failed|Error:|SyntaxError|not ok/i.test(line)){
   failureLines.push(line.trim());
   for(let j=1;j<=4&&i+j<lines.length;j++){
    const follow=lines[i+j].trim();
    if(follow&&!failureLines.includes(follow))failureLines.push(follow);
   }
  }
 }
 if(failureLines.length===0){
  return output.slice(-2000).trim();
 }
 return failureLines.slice(0,25).join('\n').slice(0,3000);
}

export async function executeTestHarness({
 binary='node',
 args=['--test'],
 cwd=process.cwd(),
 env=process.env,
 timeoutMs=DEFAULT_TIMEOUT_MS,
 maxOutputBytes=MAX_OUTPUT_BYTES
}={}){
 if(!ALLOWED_BINARIES.has(binary))throw new Error(`Binary '${binary}' is not permitted in test harness`);
 if(!Array.isArray(args))throw new Error('Arguments must be an array of strings');
 if(typeof cwd!=='string'||!existsSync(cwd))throw new Error(`Working directory '${cwd}' does not exist`);

 const sanitized=sanitizeEnv(env);

 return new Promise((resolve)=>{
  let stdout='';
  let stderr='';
  let timedOut=false;

  const child=spawn(binary,args,{
   cwd,
   env:sanitized,
   shell:false,
   stdio:['ignore','pipe','pipe'],
   windowsHide:true
  });

  const timer=setTimeout(()=>{
   timedOut=true;
   child.kill('SIGTERM');
   setTimeout(()=>{
    try{child.kill('SIGKILL');}catch{}
   },3000);
  },timeoutMs);

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data',chunk=>{
   if(stdout.length<maxOutputBytes)stdout+=chunk;
  });

  child.stderr.on('data',chunk=>{
   if(stderr.length<maxOutputBytes)stderr+=chunk;
  });

  child.on('error',err=>{
   clearTimeout(timer);
   resolve({
    passed:false,
    exitCode:1,
    timedOut:false,
    summary:`Process execution error: ${err.message}`,
    output:err.message
   });
  });

  child.on('close',code=>{
   clearTimeout(timer);
   const combined=(stdout+'\n'+stderr).trim();
   const passed=code===0&&!timedOut;
   const summary=passed
    ?'Test suite completed with 0 errors'
    :(timedOut
      ?`Test execution timed out after ${timeoutMs}ms`
      :extractTestFailureSummary(combined));

   resolve({
    passed,
    exitCode:code??(timedOut?124:1),
    timedOut,
    summary,
    output:combined.slice(0,maxOutputBytes)
   });
  });
 });
}
