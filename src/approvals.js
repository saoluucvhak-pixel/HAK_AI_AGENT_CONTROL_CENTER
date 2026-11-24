import {createHash,randomBytes} from 'node:crypto';
import {JsonFile} from './json-store.js';

/** Stable JSON: sorted keys so the same scope always hashes the same. */
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export const scopeHash=scope=>createHash('sha256').update(canonical(scope)).digest('hex');

/**
 * Server-issued approval records. The approver identity and timestamps are set by the server,
 * the scope hash is computed from the stored work order at approval time, and verification
 * recomputes the hash from the order as it is *now*. A request can never vouch for itself.
 */
export class ApprovalStore{
 #file;#records=new Map();#now;#ttlMs;
 constructor({path=null,now=()=>Date.now(),defaultTtlMs=24*3600*1000}={}){this.#file=path?new JsonFile(path):null;this.#now=now;this.#ttlMs=defaultTtlMs;}
 async load(){
  if(!this.#file)return;
  const list=await this.#file.read([]);
  this.#records=new Map((Array.isArray(list)?list:[]).filter(r=>r&&typeof r.id==='string').map(r=>[r.id,r]));
 }
 async #persist(){if(this.#file)await this.#file.write([...this.#records.values()].slice(-2000));}
 async grant({workOrderId,projectId,scope,approver,reason,ttlMs}){
  if(typeof approver!=='string'||!approver.trim())throw new Error('Approver required');
  const ttl=Math.min(Math.max(ttlMs??this.#ttlMs,60*1000),7*24*3600*1000);
  for(const r of this.#records.values())if(r.workOrderId===workOrderId&&r.status==='APPROVED'){r.status='SUPERSEDED';}
  const at=this.#now();
  const record={id:randomBytes(10).toString('hex'),workOrderId,projectId,scopeHash:scopeHash(scope),approver,reason:String(reason||'').slice(0,500),status:'APPROVED',approvedAt:new Date(at).toISOString(),expiresAt:new Date(at+ttl).toISOString(),usedAt:null};
  this.#records.set(record.id,record);await this.#persist();return {...record};
 }
 get(id){const r=this.#records.get(id);return r?{...r}:null;}
 latestFor(workOrderId){let found=null;for(const r of this.#records.values())if(r.workOrderId===workOrderId)found=r;return found?{...found}:null;}
 /** Returns {valid:true,record} or {valid:false,reason}. */
 verify({approvalId,workOrderId,projectId,scope}){
  const r=this.#records.get(approvalId);
  if(!r)return {valid:false,reason:'NOT_FOUND'};
  if(r.workOrderId!==workOrderId||r.projectId!==projectId)return {valid:false,reason:'WRONG_WORK_ORDER'};
  if(r.status!=='APPROVED')return {valid:false,reason:r.status};
  if(Date.parse(r.expiresAt)<=this.#now())return {valid:false,reason:'EXPIRED'};
  if(r.scopeHash!==scopeHash(scope))return {valid:false,reason:'SCOPE_CHANGED'};
  return {valid:true,record:{...r}};
 }
 async markUsed(id){const r=this.#records.get(id);if(r&&!r.usedAt){r.usedAt=new Date(this.#now()).toISOString();await this.#persist();}}
 async revoke(id,reason){const r=this.#records.get(id);if(r&&r.status==='APPROVED'){r.status='REVOKED';r.revokedReason=String(reason||'').slice(0,200);await this.#persist();}}
}
