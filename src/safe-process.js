import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {tmpdir,devNull} from 'node:os';
import {join} from 'node:path';
import {redact} from './secrets.js';

const ENV_ALLOW=['PATH','Path','PATHEXT','SystemRoot','SYSTEMROOT','windir','TEMP','TMP','TMPDIR','USERPROFILE','APPDATA','LOCALAPPDATA','HOME','LANG','LC_ALL','COMSPEC','ComSpec','ProgramData','ProgramFiles','ProgramFiles(x86)','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'];
/** Child processes never inherit HAK_* settings, provider keys or tokens: only an explicit allowlist of OS variables. */
export function scrubbedEnv(extra={},base=process.env){
 const env={};
 for(const k of ENV_ALLOW)if(base[k]!==undefined)env[k]=base[k];
 return {...env,...extra};
}
function killTree(child){
 if(child.pid===undefined)return;
 if(process.platform==='win32'){try{spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});}catch{/* already gone */}return;}
 try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{/* gone */}}
}
/** shell:false, timeout with process-tree kill, bounded and redacted output, optional abort signal. */
export function runProcess(cmd,args,{cwd,env=scrubbedEnv(),timeoutMs=60000,maxBytes=64*1024,signal,secrets=[]}={}){
 return new Promise(resolve=>{
  let child;
  try{child=spawn(cmd,args,{cwd,env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});}
  catch(e){resolve({code:null,error:'spawn-failed',stdout:'',stderr:redact(e.message,secrets),timedOut:false,truncated:false});return;}
  let out='',err='',truncated=false,timedOut=false,aborted=false,settled=false;
  const take=(cur,d)=>{const s=cur+d.toString('utf8');if(s.length>maxBytes){truncated=true;return s.slice(-maxBytes);}return s;};
  child.stdout.on('data',d=>{out=take(out,d);});
  child.stderr.on('data',d=>{err=take(err,d);});
  const timer=setTimeout(()=>{timedOut=true;killTree(child);},timeoutMs);
  const onAbort=()=>{aborted=true;killTree(child);};
  signal?.addEventListener('abort',onAbort,{once:true});
  const done=(code,error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);resolve({code,error,stdout:redact(out,secrets),stderr:redact(err,secrets),timedOut,aborted,truncated});};
  child.on('error',e=>done(null,e.code||'error'));
  child.on('close',code=>done(code));
 });
}
const HOOKS_DIR=join(tmpdir(),'hak-empty-hooks');
/**
 * Git with the repository's own configuration neutralised: no hooks, no fsmonitor, no signing,
 * no user/system config, no prompts. A cloned repo can therefore not run code through git.
 */
export function runGit(args,{cwd,timeoutMs=60000,signal,extraEnv={},maxBytes=256*1024,secrets=[]}={}){
 mkdirSync(HOOKS_DIR,{recursive:true});
 const hardened=['-c','core.hooksPath='+HOOKS_DIR,'-c','core.fsmonitor=false','-c','commit.gpgsign=false','-c','core.autocrlf=false','-c','protocol.ext.allow=never','-c','user.name=HAK Agent','-c','user.email=hak-agent@localhost'];
 const env=scrubbedEnv({GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:devNull,GIT_ASKPASS:'echo',...extraEnv});
 return runProcess('git',[...hardened,...args],{cwd,env,timeoutMs,signal,maxBytes,secrets});
}
export async function gitAvailable(){
 const r=await runProcess('git',['--version'],{timeoutMs:10000});
 return r.code===0?r.stdout.trim():null;
}
