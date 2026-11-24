import {readFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {JsonFile} from './json-store.js';

const KEY_PATTERNS=[/sk-[A-Za-z0-9_-]{16,}/g,/AIza[0-9A-Za-z_-]{20,}/g,/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,/(x-api-key|x-goog-api-key|authorization)\s*[:=]\s*\S+/gi];
/** Remove known secret values and common credential shapes from any text before it is logged, stored or returned. */
export function redact(text,secrets=[]){
 let out=String(text??'');
 for(const secret of secrets){if(typeof secret==='string'&&secret.length>=8)out=out.split(secret).join('[REDACTED]');}
 for(const pattern of KEY_PATTERNS)out=out.replace(pattern,'[REDACTED]');
 return out;
}
const NAME=/^[a-zA-Z0-9_.:-]{1,100}$/;
function checkName(name){if(typeof name!=='string'||!NAME.test(name))throw new Error('Invalid secret name');}

/** Development / non-Windows backend: file readable only by the owner (0600). Not encrypted — documented limitation. */
export class FileSecretBackend{
 kind='file-0600';
 #file;
 constructor(path){this.#file=new JsonFile(path);}
 async #all(){return (await this.#file.read({}))||{};}
 async get(name){checkName(name);const v=(await this.#all())[name];return typeof v==='string'?v:null;}
 async set(name,value){checkName(name);const all=await this.#all();all[name]=value;await this.#file.write(all);try{await chmod(this.#file.path,0o600)}catch{}}
 async delete(name){checkName(name);const all=await this.#all();delete all[name];await this.#file.write(all);}
 async names(){return Object.keys(await this.#all());}
}
const PS_PREFIX='Add-Type -AssemblyName System.Security;$ErrorActionPreference="Stop";$in=[Console]::In.ReadToEnd();';
const PS_PROTECT=PS_PREFIX+'[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($in),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))';
const PS_UNPROTECT=PS_PREFIX+'[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($in.Trim()),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))';
function powershell(script,input){
 return new Promise((resolve,reject)=>{
  const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],{windowsHide:true,timeout:20000,maxBuffer:1024*1024},(error,stdout)=>{
   if(error)reject(new Error('DPAPI operation failed'));else resolve(stdout);
  });
  child.stdin.end(input);
 });
}
/** Windows backend: values are encrypted with DPAPI (CurrentUser scope); only the same Windows user can decrypt them. */
export class DpapiSecretBackend{
 kind='windows-dpapi-current-user';
 #file;#run;
 constructor(path,{run=powershell}={}){this.#file=new JsonFile(path);this.#run=run;}
 async #all(){return (await this.#file.read({}))||{};}
 async get(name){checkName(name);const blob=(await this.#all())[name];if(typeof blob!=='string')return null;return (await this.#run(PS_UNPROTECT,blob)).replace(/\r?\n$/,'');}
 async set(name,value){checkName(name);const blob=(await this.#run(PS_PROTECT,value)).trim();const all=await this.#all();all[name]=blob;await this.#file.write(all);}
 async delete(name){checkName(name);const all=await this.#all();delete all[name];await this.#file.write(all);}
 async names(){return Object.keys(await this.#all());}
}
export function createSecretStore(dir,{platform=process.platform}={}){
 return platform==='win32'?new DpapiSecretBackend(join(dir,'secrets.dpapi.json')):new FileSecretBackend(join(dir,'secrets.json'));
}
/** Read legacy .env values once so they can be migrated into the secret store; never logs values. */
export async function readEnvFileKeys(path,keys){
 let text;try{text=await readFile(path,'utf8')}catch{return {}}
 const out={};
 for(const line of text.split(/\r?\n/)){const m=/^([A-Z0-9_]+)=(.*)$/.exec(line);if(m&&keys.includes(m[1]))out[m[1]]=m[2];}
 return out;
}
