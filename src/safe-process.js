import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
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
 try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{/* gone */}}
}
/** shell:false, timeout with process-tree kill, bounded and redacted output, optional abort signal. */
export function runProcess(cmd,args,{cwd,env=scrubbedEnv(),timeoutMs=60000,maxBytes=64*1024,signal,secrets=[]}={}){
 return new Promise(resolve=>{
  let child;
  try{child=spawn(cmd,args,{cwd,env,shell:false,detached:true,stdio:['ignore','pipe','pipe']});}
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
const NULL_DEVICE='/dev/null';
const HOOKS_DIR=join(tmpdir(),'hak-empty-hooks');
const NPM_NET=['HTTPS_PROXY','HTTP_PROXY','NO_PROXY','https_proxy','http_proxy','no_proxy','npm_config_https_proxy','npm_config_proxy','npm_config_noproxy','npm_config_cafile','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'];
/** Dependency download step only: proxy / CA settings so the registry is reachable. The test step never gets these. */
export function npmInstallEnv(base=process.env){
 const env=scrubbedEnv({CI:'1'},base);
 for(const k of NPM_NET)if(base[k]!==undefined)env[k]=base[k];
 return env;
}
const NET_PASSTHROUGH=['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NO_PROXY','https_proxy','http_proxy','all_proxy','no_proxy','GIT_SSL_CAINFO','GIT_SSL_NO_VERIFY','SSL_CERT_FILE','SSL_CERT_DIR','SSH_AUTH_SOCK','GIT_ASKPASS','SSH_ASKPASS','GCM_INTERACTIVE','GIT_SSH_COMMAND'];
/**
 * Environment for git operations that talk to a remote (push). The user's own transport/credential setup
 * (proxy, CA bundle, ASKPASS, GIT_CONFIG_* pairs, global/system gitconfig e.g. Git Credential Manager) must keep working,
 * so it is passed through; the AI-code verification process never gets any of it. Extra config pairs (the token header)
 * are appended after the user's own pairs instead of replacing them.
 */
export function gitNetworkEnv(base=process.env,extraConfig=[]){
 const env=scrubbedEnv({},base);
 for(const k of NET_PASSTHROUGH)if(base[k]!==undefined)env[k]=base[k];
 const pairs=[];
 const n=Number(base.GIT_CONFIG_COUNT);
 if(Number.isInteger(n)&&n>0&&n<=50)for(let i=0;i<n;i++)if(base['GIT_CONFIG_KEY_'+i]!==undefined)pairs.push([base['GIT_CONFIG_KEY_'+i],base['GIT_CONFIG_VALUE_'+i]??'']);
 for(const p of extraConfig)pairs.push(p);
 if(pairs.length){env.GIT_CONFIG_COUNT=String(pairs.length);pairs.forEach(([k,v],i)=>{env['GIT_CONFIG_KEY_'+i]=k;env['GIT_CONFIG_VALUE_'+i]=v;});}
 env.GIT_TERMINAL_PROMPT='0';
 return env;
}
/**
 * Git with the repository's own configuration neutralised: no hooks, no fsmonitor, no signing, no prompts.
 * Local operations also ignore the user's global/system config; `network:true` (push) uses the user's transport setup.
 */
export function runGit(args,{cwd,timeoutMs=60000,signal,extraEnv={},extraConfig=[],network=false,maxBytes=256*1024,secrets=[]}={}){
 mkdirSync(HOOKS_DIR,{recursive:true});
 const hardened=['-c','core.hooksPath='+HOOKS_DIR,'-c','core.fsmonitor=false','-c','commit.gpgsign=false','-c','core.autocrlf=false','-c','protocol.ext.allow=never','-c','user.name=HAK Agent','-c','user.email=hak-agent@localhost'];
 const env=network?{...gitNetworkEnv(process.env,extraConfig),...extraEnv}
  :scrubbedEnv({GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:NULL_DEVICE,GIT_ASKPASS:'echo',...extraEnv});
 return runProcess('git',[...hardened,...args],{cwd,env,timeoutMs,signal,maxBytes,secrets});
}
export async function gitAvailable(){
 const r=await runProcess('git',['--version'],{timeoutMs:10000});
 return r.code===0?r.stdout.trim():null;
}
