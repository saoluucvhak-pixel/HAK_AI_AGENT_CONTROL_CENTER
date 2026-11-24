import {readFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
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
/** Container/CI deployments inject keys through environment variables (connection.apiKeyEnv, HAK_GITHUB_TOKEN); this file store is only the fallback. */
export function createSecretStore(dir){return new FileSecretBackend(join(dir,'secrets.json'));}
/** Read legacy .env values once so they can be migrated into the secret store; never logs values. */
export async function readEnvFileKeys(path,keys){
 let text;try{text=await readFile(path,'utf8')}catch{return {}}
 const out={};
 for(const line of text.split(/\r?\n/)){const m=/^([A-Z0-9_]+)=(.*)$/.exec(line);if(m&&keys.includes(m[1]))out[m[1]]=m[2];}
 return out;
}
