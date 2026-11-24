import {randomBytes} from 'node:crypto';
import {JsonFile} from './json-store.js';
import {createAdapter,defaultEndpoint,PROVIDER_TYPES,ProviderError} from './providers.js';

const ID=/^[a-f0-9]{16}$/;
// A connection may reference an environment variable (container/CI secret) instead of storing a key. Only names that look like credentials are allowed.
export const KEY_ENV=/^[A-Z][A-Z0-9_]{1,56}_(KEY|TOKEN|SECRET)$/;
export const AGENT_ROLES=Object.freeze(['project-manager','architecture','backend','frontend','database','security','testing','quality','ocr','documentation','release']);

function normalize(input,existing={}){
 const num=(v,d)=>v===undefined||v===''||v===null?d:Number(v);
 const opt=v=>v===undefined||v===''||v===null?null:Number(v);
 const type=input.type??existing.type;
 return {
  id:existing.id,type,
  name:String(input.name??existing.name??'').trim(),
  endpoint:String(input.endpoint??existing.endpoint??defaultEndpoint(type)??'').trim(),
  model:String(input.model??existing.model??'').trim(),
  apiKeyEnv:input.apiKeyEnv===undefined?(existing.apiKeyEnv??null):(input.apiKeyEnv||null),
  enabled:input.enabled===undefined?(existing.enabled??true):input.enabled===true,
  timeoutMs:num(input.timeoutMs,existing.timeoutMs??60000),
  maxTokens:num(input.maxTokens,existing.maxTokens??4096),
  retries:num(input.retries,existing.retries??2),
  maxConcurrency:num(input.maxConcurrency,existing.maxConcurrency??2),
  costLimitUsd:input.costLimitUsd===undefined?(existing.costLimitUsd??null):opt(input.costLimitUsd),
  priceInputPerMTok:input.priceInputPerMTok===undefined?(existing.priceInputPerMTok??null):opt(input.priceInputPerMTok),
  priceOutputPerMTok:input.priceOutputPerMTok===undefined?(existing.priceOutputPerMTok??null):opt(input.priceOutputPerMTok),
  createdAt:existing.createdAt,updatedAt:new Date().toISOString()
 };
}
class Semaphore{
 #max;#active=0;#queue=[];
 constructor(max){this.#max=max;}
 setMax(max){this.#max=max;this.#drain();}
 async acquire(signal){
  if(this.#active<this.#max){this.#active++;return;}
  await new Promise((resolve,reject)=>{
   const entry={resolve};this.#queue.push(entry);
   signal?.addEventListener('abort',()=>{const i=this.#queue.indexOf(entry);if(i>=0){this.#queue.splice(i,1);reject(new ProviderError('CANCELLED','Đã hủy khi đang chờ lượt chạy'));}},{once:true});
  });
 }
 release(){this.#active--;this.#drain();}
 #drain(){while(this.#active<this.#max&&this.#queue.length){this.#active++;this.#queue.shift().resolve();}}
}
export class ProviderManager{
 #file;#usageFile;#secrets;#fetch;#state={version:1,connections:[],agentModels:{}};#usage={};#gates=new Map();#loaded=false;
 constructor({dir,secrets,fetchImpl=fetch}){
  this.#file=new JsonFile(dir+'/providers.json');this.#usageFile=new JsonFile(dir+'/provider-usage.json');
  this.#secrets=secrets;this.#fetch=fetchImpl;
 }
 async load(){
  const state=await this.#file.read(null);
  if(state&&Array.isArray(state.connections))this.#state={version:1,connections:state.connections,agentModels:state.agentModels&&typeof state.agentModels==='object'?state.agentModels:{}};
  this.#usage=(await this.#usageFile.read({}))||{};
  this.#loaded=true;
 }
 #secretName(id){return 'provider:'+id;}
 #view(c){
  const u=this.#usage[c.id]||{requests:0,errors:0,inputTokens:0,outputTokens:0,costUsd:0};
  const {_hasSecret,...rest}=c;
  return {...rest,hasSecret:Boolean(_hasSecret),usage:{...u,costUsd:this.#priced(c)?u.costUsd:null}};
 }
 #priced(c){return c.priceInputPerMTok!=null&&c.priceOutputPerMTok!=null;}
 async list(){
  const out=[];
  for(const c of this.#state.connections){
   const hasSecret=c.apiKeyEnv?Boolean(process.env[c.apiKeyEnv]):(await this.#secrets.names()).includes(this.#secretName(c.id));
   out.push(this.#view({...c,_hasSecret:hasSecret}));
  }
  return out;
 }
 #find(id){const c=this.#state.connections.find(x=>x.id===id);if(!c)throw new ProviderError('NOT_FOUND','Không tìm thấy kết nối AI');return c;}
 async upsert(input,secret){
  if(!this.#loaded)throw new Error('ProviderManager not loaded');
  if(!input||typeof input!=='object')throw new ProviderError('CONFIG','Dữ liệu không hợp lệ');
  let existing={};
  if(input.id){if(!ID.test(input.id))throw new ProviderError('CONFIG','Mã kết nối không hợp lệ');existing=this.#find(input.id);}
  if(!existing.id&&!PROVIDER_TYPES.includes(input.type))throw new ProviderError('CONFIG','Loại nhà cung cấp không được hỗ trợ');
  if(existing.id&&input.type&&input.type!==existing.type)throw new ProviderError('CONFIG','Không đổi loại nhà cung cấp; hãy tạo kết nối mới');
  const conn=normalize(input,existing);
  conn.id=existing.id||randomBytes(8).toString('hex');conn.createdAt=existing.createdAt||conn.updatedAt;
  if(conn.apiKeyEnv!==null&&!KEY_ENV.test(conn.apiKeyEnv))throw new ProviderError('CONFIG','Tên biến môi trường phải dạng HOA_VA_GACH_DUOI và kết thúc bằng _KEY, _TOKEN hoặc _SECRET');
  if(conn.apiKeyEnv!==null&&typeof secret==='string'&&secret.length>0)throw new ProviderError('CONFIG','Chọn một: nhập API key hoặc dùng biến môi trường, không dùng cả hai');
  const key=conn.apiKeyEnv!==null?(process.env[conn.apiKeyEnv]||null):typeof secret==='string'&&secret.length>0?secret:await this.#secrets.get(this.#secretName(conn.id));
  const check=createAdapter(conn,{secret:key}).validateConfig();
  if(!check.ok)throw new ProviderError('CONFIG',check.errors.map(e=>conn.apiKeyEnv!==null&&/API key/.test(e)?'Biến môi trường '+conn.apiKeyEnv+' chưa được đặt hoặc quá ngắn':e).join('; '));
  if(typeof secret==='string'&&secret.length>0){if(/[\r\n]/.test(secret)||secret.length>512)throw new ProviderError('CONFIG','API key phải nằm trên một dòng và ngắn hơn 512 ký tự');await this.#secrets.set(this.#secretName(conn.id),secret);}
  const i=this.#state.connections.findIndex(x=>x.id===conn.id);
  if(i>=0)this.#state.connections[i]=conn;else this.#state.connections.push(conn);
  this.#gates.get(conn.id)?.setMax(conn.maxConcurrency);
  await this.#file.write(this.#state);
  return (await this.list()).find(x=>x.id===conn.id);
 }
 async setEnabled(id,enabled){const c=this.#find(id);c.enabled=enabled===true;await this.#file.write(this.#state);return (await this.list()).find(x=>x.id===id);}
 async remove(id){
  this.#find(id);
  this.#state.connections=this.#state.connections.filter(c=>c.id!==id);
  for(const [agent,m] of Object.entries(this.#state.agentModels))if(m.connectionId===id)delete this.#state.agentModels[agent];
  await this.#secrets.delete(this.#secretName(id));
  await this.#file.write(this.#state);
 }
 agentModels(){return structuredClone(this.#state.agentModels);}
 async setAgentModel(agent,connectionId,model){
  if(!AGENT_ROLES.includes(agent))throw new ProviderError('CONFIG','Agent không hợp lệ');
  if(connectionId===null||connectionId===''){delete this.#state.agentModels[agent];}
  else{this.#find(connectionId);if(model&&!/^[a-zA-Z0-9_./:@-]{1,128}$/.test(model))throw new ProviderError('CONFIG','Mã model không hợp lệ');this.#state.agentModels[agent]={connectionId,model:model||''};}
  await this.#file.write(this.#state);
 }
 async #adapter(id){const c=this.#find(id);const secret=c.apiKeyEnv?(process.env[c.apiKeyEnv]||null):await this.#secrets.get(this.#secretName(id));return {conn:c,adapter:createAdapter(c,{secret,fetchImpl:this.#fetch})};}
 async test(id){const {adapter}=await this.#adapter(id);return adapter.healthCheck();}
 async listModels(id){const {adapter}=await this.#adapter(id);try{return await adapter.listModels();}catch(e){throw new ProviderError(adapter.normalizeError(e).code,adapter.normalizeError(e).message);}}
 /** Pick connection + model for an agent: explicit per-agent mapping, otherwise the first enabled connection. */
 resolve(agent){
  const mapped=this.#state.agentModels[agent];
  let conn=mapped?this.#state.connections.find(c=>c.id===mapped.connectionId):null;
  if(!conn||!conn.enabled)conn=this.#state.connections.find(c=>c.enabled);
  if(!conn)throw new ProviderError('CONFIG','Chưa có kết nối AI nào được bật. Mở AI Provider Manager để cấu hình.');
  return {connectionId:conn.id,model:(mapped&&mapped.connectionId===conn.id&&mapped.model)||conn.model,connection:conn};
 }
 costOf(conn,usage){
  if(!usage||conn.priceInputPerMTok==null||conn.priceOutputPerMTok==null)return null;
  return (usage.inputTokens*conn.priceInputPerMTok+usage.outputTokens*conn.priceOutputPerMTok)/1e6;
 }
 /** One governed model call: enabled check, per-connection cost cap, concurrency gate, usage accounting. */
 async execute(connectionId,request){
  const {conn,adapter}=await this.#adapter(connectionId);
  if(!conn.enabled)throw new ProviderError('CONFIG','Kết nối AI đang bị tắt');
  const cfg=adapter.validateConfig();if(!cfg.ok)throw new ProviderError('CONFIG',cfg.errors.join('; '));
  const u=this.#usage[conn.id]||(this.#usage[conn.id]={requests:0,errors:0,inputTokens:0,outputTokens:0,costUsd:0});
  if(conn.costLimitUsd!=null&&this.#priced(conn)&&u.costUsd>=conn.costLimitUsd)throw new ProviderError('BUDGET','Đã chạm giới hạn chi phí của kết nối AI này');
  let gate=this.#gates.get(conn.id);if(!gate){gate=new Semaphore(conn.maxConcurrency);this.#gates.set(conn.id,gate);}
  await gate.acquire(request.signal);
  try{
   const result=await adapter.executeTask(request);
   u.requests++;u.inputTokens+=result.usage?.inputTokens||0;u.outputTokens+=result.usage?.outputTokens||0;
   u.costUsd+=this.costOf(conn,result.usage)||0;
   await this.#usageFile.write(this.#usage);
   return {...result,connectionId:conn.id,costUsd:this.costOf(conn,result.usage)};
  }catch(e){
   u.requests++;u.errors++;await this.#usageFile.write(this.#usage).catch(()=>{});
   const n=adapter.normalizeError(e);throw new ProviderError(n.code,n.message,{retryable:n.retryable,status:n.status});
  }finally{gate.release();}
 }
 usageTotals(){
  let inputTokens=0,outputTokens=0,costUsd=0,requests=0,errors=0,costKnown=true;
  for(const c of this.#state.connections){
   const u=this.#usage[c.id];if(!u)continue;
   inputTokens+=u.inputTokens;outputTokens+=u.outputTokens;requests+=u.requests;errors+=u.errors;
   if(this.#priced(c))costUsd+=u.costUsd;else if(u.inputTokens+u.outputTokens>0)costKnown=false;
  }
  return {inputTokens,outputTokens,requests,errors,costUsd:costKnown?costUsd:null};
 }
 connectionCounts(){const c=this.#state.connections;return {total:c.length,enabled:c.filter(x=>x.enabled).length};}
}
