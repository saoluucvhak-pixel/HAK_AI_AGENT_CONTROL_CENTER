import {mkdir,readFile,open} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {validateEvent} from './core.js';
export class EventStore {
 #path; #events=[]; #tail=Promise.resolve();
 constructor(path){if(typeof path!=='string'||!path.trim())throw new Error('Event store path required');this.#path=resolve(path);}
 async load(){
  await this.#tail;
  let content;
  try{content=await readFile(this.#path,'utf8')}catch(e){if(e.code==='ENOENT'){this.#events=[];return;}throw e}
  const parsed=[];
  for(const [i,line] of content.split('\n').entries()){
   if(!line.trim())continue;
   let item;try{item=JSON.parse(line)}catch{throw new Error('Corrupt event store at line '+(i+1))}
   if(!item||typeof item!=='object'||!['queued','running','passed','failed','blocked'].includes(item.status)||!['taskId','agentId','status','at'].every(k=>typeof item[k]==='string')||!Number.isFinite(Date.parse(item.at)))throw new Error('Invalid event store at line '+(i+1));
   for(const k of ['taskId','agentId'])if(!item[k].trim()||item[k].length>128)throw new Error('Invalid event identifier at line '+(i+1));
   parsed.push({taskId:item.taskId,agentId:item.agentId,status:item.status,at:item.at});
  }
  this.#events=parsed;
 }
 async add(event){
  const normalized=validateEvent(event);
  const write=async()=>{
   await mkdir(dirname(this.#path),{recursive:true,mode:0o700});
   const file=await open(this.#path,'a',0o600);
   try{await file.writeFile(JSON.stringify(normalized)+'\n');await file.sync()}finally{await file.close()}
   this.#events.push(normalized);
   return normalized;
  };
  const pending=this.#tail.then(write);this.#tail=pending.then(()=>undefined,()=>undefined);
  return pending;
 }
 get persistent(){return true;}
 summary(){const latest=new Map();for(const e of this.#events)latest.set(e.taskId,e);return [...latest.values()].map(e=>({...e}));}
 list(){return this.#events.map(e=>({...e}));}
}
