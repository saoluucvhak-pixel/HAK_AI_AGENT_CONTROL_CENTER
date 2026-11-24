import {mkdir,readFile,writeFile,rename,open,copyFile,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function renameRetry(from,to){
 // Windows can return EPERM/EBUSY when another handle (antivirus, indexer) briefly holds the target.
 for(let i=0;;i++){
  try{await rename(from,to);return;}
  catch(e){if(i>=6||!['EPERM','EBUSY','EACCES'].includes(e.code))throw e;await sleep(25*(i+1));}
 }
}
/**
 * Atomic JSON document: write temp + fsync + rename, previous good copy kept as .bak,
 * writes serialized per file. A corrupt primary file falls back to the .bak copy.
 */
export class JsonFile{
 #path;#tail=Promise.resolve();
 constructor(path){this.#path=resolve(path);}
 get path(){return this.#path;}
 async read(fallback=null){
  for(const candidate of [this.#path,this.#path+'.bak']){
   try{return JSON.parse(await readFile(candidate,'utf8'));}
   catch(e){if(e.code==='ENOENT')continue;if(e instanceof SyntaxError)continue;throw e;}
  }
  return fallback;
 }
 write(value){
  const job=this.#tail.then(async()=>{
   await mkdir(dirname(this.#path),{recursive:true,mode:0o700});
   const tmp=this.#path+'.'+randomBytes(6).toString('hex')+'.tmp';
   const handle=await open(tmp,'wx',0o600);
   try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}
   try{await copyFile(this.#path,this.#path+'.bak');}catch(e){if(e.code!=='ENOENT')throw e;}
   try{await renameRetry(tmp,this.#path);}catch(e){try{await unlink(tmp)}catch{}throw e;}
  });
  this.#tail=job.then(()=>undefined,()=>undefined);
  return job;
 }
 async writeText(text){
  const job=this.#tail.then(async()=>{
   await mkdir(dirname(this.#path),{recursive:true,mode:0o700});
   const tmp=this.#path+'.'+randomBytes(6).toString('hex')+'.tmp';
   await writeFile(tmp,text,{flag:'wx',mode:0o600});
   await renameRetry(tmp,this.#path);
  });
  this.#tail=job.then(()=>undefined,()=>undefined);
  return job;
 }
}
