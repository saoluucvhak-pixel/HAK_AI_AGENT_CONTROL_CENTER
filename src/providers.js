import {redact} from './secrets.js';

export const PROVIDER_TYPES=Object.freeze(['openai-compatible','anthropic','gemini']);
const MAX_RESPONSE_BYTES=2*1024*1024;
const MODEL_ID=/^[a-zA-Z0-9_./:@-]{1,128}$/;
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]']);
const BLOCKED_HOSTS=/^(169\.254\.|metadata\.google\.internal$|\[?fd00:ec2::254\]?$|0\.0\.0\.0$)/i;

export class ProviderError extends Error{
 constructor(code,message,{retryable=false,status}={}){super(message);this.name='ProviderError';this.code=code;this.retryable=retryable;this.status=status;}
}
/** Endpoint rule: https to any non link-local host, or plain http only to this machine. No credentials, query or fragment. */
export function parseEndpoint(raw){
 let url;try{url=new URL(raw)}catch{throw new ProviderError('CONFIG','Endpoint không hợp lệ')}
 if(url.username||url.password||url.search||url.hash)throw new ProviderError('CONFIG','Endpoint không được chứa thông tin đăng nhập, query hoặc fragment');
 if(url.protocol==='http:'){if(!LOOPBACK.has(url.hostname))throw new ProviderError('CONFIG','Endpoint http chỉ được dùng cho máy này (127.0.0.1/localhost); dùng https cho dịch vụ từ xa');}
 else if(url.protocol==='https:'){if(BLOCKED_HOSTS.test(url.hostname))throw new ProviderError('CONFIG','Endpoint trỏ tới địa chỉ nội bộ bị chặn');}
 else throw new ProviderError('CONFIG','Endpoint phải dùng http (máy này) hoặc https');
 return {base:url.origin+url.pathname.replace(/\/+$/,''),loopback:LOOPBACK.has(url.hostname)};
}
async function readLimitedJson(response){
 const declared=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES)throw new ProviderError('RESPONSE','Phản hồi vượt giới hạn kích thước');
 if(!response.body||typeof response.body.getReader!=='function'){
  if(typeof response.json!=='function')throw new ProviderError('RESPONSE','Không đọc được phản hồi');
  return await response.json();
 }
 const reader=response.body.getReader();const chunks=[];let size=0,complete=false;
 try{
  for(;;){const {done,value}=await reader.read();if(done){complete=true;break;}size+=value.byteLength;if(size>MAX_RESPONSE_BYTES)throw new ProviderError('RESPONSE','Phản hồi vượt giới hạn kích thước');chunks.push(value);}
 }finally{if(!complete){try{await reader.cancel()}catch{}}reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks.map(c=>Buffer.from(c))).toString('utf8'))}catch{throw new ProviderError('RESPONSE','Phản hồi không phải JSON hợp lệ')}
}
class BaseAdapter{
 constructor(conn,{secret=null,fetchImpl=fetch}={}){this.conn=conn;this.secret=secret;this.fetchImpl=fetchImpl;this.usage={requests:0,errors:0,inputTokens:0,outputTokens:0};}
 get type(){return this.conn.type;}
 validateConfig(){
  const errors=[];
  const c=this.conn;
  if(typeof c.name!=='string'||!c.name.trim()||c.name.length>80)errors.push('Tên kết nối không hợp lệ');
  let endpoint=null;
  try{endpoint=parseEndpoint(c.endpoint)}catch(e){errors.push(e.message)}
  if(c.model!==undefined&&c.model!==''&&!MODEL_ID.test(c.model))errors.push('Mã model không hợp lệ');
  if(!Number.isInteger(c.timeoutMs)||c.timeoutMs<1000||c.timeoutMs>600000)errors.push('Timeout phải từ 1.000 đến 600.000 ms');
  if(!Number.isInteger(c.maxTokens)||c.maxTokens<16||c.maxTokens>200000)errors.push('Giới hạn token mỗi lần gọi phải từ 16 đến 200.000');
  if(!Number.isInteger(c.retries)||c.retries<0||c.retries>5)errors.push('Số lần retry phải từ 0 đến 5');
  if(!Number.isInteger(c.maxConcurrency)||c.maxConcurrency<1||c.maxConcurrency>8)errors.push('Số Agent đồng thời phải từ 1 đến 8');
  if(c.costLimitUsd!=null&&!(typeof c.costLimitUsd==='number'&&c.costLimitUsd>=0))errors.push('Giới hạn chi phí không hợp lệ');
  for(const key of ['priceInputPerMTok','priceOutputPerMTok'])if(c[key]!=null&&!(typeof c[key]==='number'&&c[key]>=0))errors.push('Đơn giá token không hợp lệ');
  const needsKey=!(endpoint&&endpoint.loopback&&this.type==='openai-compatible');
  if(needsKey&&(typeof this.secret!=='string'||this.secret.length<8))errors.push('Chưa có API key hợp lệ');
  return {ok:errors.length===0,errors};
 }
 async _http(method,path,{body,headers={},signal}={}){
  const {base}=parseEndpoint(this.conn.endpoint);
  const timeout=AbortSignal.timeout(this.conn.timeoutMs);
  const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  let response;
  try{response=await this.fetchImpl(base+path,{method,headers:{...this._authHeaders(),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:combined});}
  catch(e){
   if(signal?.aborted)throw new ProviderError('CANCELLED','Đã hủy yêu cầu');
   if(timeout.aborted||e?.name==='TimeoutError')throw new ProviderError('TIMEOUT','Hết thời gian chờ nhà cung cấp AI',{retryable:true});
   throw new ProviderError('NETWORK','Không kết nối được tới nhà cung cấp AI',{retryable:true});
  }
  if(!response.ok){
   try{await response.body?.cancel?.()}catch{}
   const s=response.status;
   if(s===401||s===403)throw new ProviderError('AUTH','Nhà cung cấp từ chối API key (HTTP '+s+')',{status:s});
   if(s===404)throw new ProviderError('NOT_FOUND','Không tìm thấy endpoint hoặc model (HTTP 404)',{status:s});
   if(s===429)throw new ProviderError('RATE_LIMIT','Vượt giới hạn tốc độ của nhà cung cấp (HTTP 429)',{retryable:true,status:s});
   if(s===408||s>=500)throw new ProviderError('UPSTREAM','Nhà cung cấp tạm thời lỗi (HTTP '+s+')',{retryable:true,status:s});
   throw new ProviderError('REJECTED','Nhà cung cấp từ chối yêu cầu (HTTP '+s+')',{status:s});
  }
  if(response.status>=300)throw new ProviderError('REJECTED','Phản hồi chuyển hướng không được chấp nhận');
  return readLimitedJson(response);
 }
 _record(usage,failed){this.usage.requests++;if(failed)this.usage.errors++;if(usage){this.usage.inputTokens+=usage.inputTokens||0;this.usage.outputTokens+=usage.outputTokens||0;}}
 getUsage(){return {...this.usage};}
 cancelTask(handle){if(handle&&typeof handle.abort==='function'){handle.abort();return true;}return false;}
 normalizeError(error){
  if(error instanceof ProviderError)return {code:error.code,message:redact(error.message,[this.secret]),retryable:error.retryable,status:error.status};
  return {code:'INTERNAL',message:'Lỗi nội bộ khi gọi nhà cung cấp AI',retryable:false};
 }
 async healthCheck(){
  const started=Date.now();
  const config=this.validateConfig();
  if(!config.ok)return {ok:false,stage:'config',errors:config.errors,latencyMs:0,identityVerified:false};
  try{const models=await this.listModels();return {ok:true,stage:'live-connectivity',modelCount:models.length,latencyMs:Date.now()-started,identityVerified:false,note:'Kết nối và xác thực HTTP thành công. Danh tính model do nhà cung cấp tự khai báo, chưa được xác minh độc lập.'};}
  catch(e){return {ok:false,stage:'live-connectivity',error:this.normalizeError(e),latencyMs:Date.now()-started,identityVerified:false};}
 }
 _model(model){const m=model||this.conn.model;if(!m||!MODEL_ID.test(m))throw new ProviderError('CONFIG','Chưa chọn model hợp lệ');return m;}
}
export class OpenAICompatibleAdapter extends BaseAdapter{
 _authHeaders(){return this.secret?{Authorization:'Bearer '+this.secret}:{};}
 _path(suffix){const {base}=parseEndpoint(this.conn.endpoint);return /\/v1$/.test(base)?suffix:'/v1'+suffix;}
 async listModels(){const r=await this._http('GET',this._path('/models'));return (r?.data||[]).map(m=>m?.id).filter(id=>typeof id==='string'&&MODEL_ID.test(id));}
 async executeTask({prompt,system,model,maxTokens,signal}){
  const m=this._model(model);
  const messages=[...(system?[{role:'system',content:system}]:[]),{role:'user',content:prompt}];
  try{
   const r=await this._http('POST',this._path('/chat/completions'),{body:{model:m,messages,max_tokens:Math.min(maxTokens||this.conn.maxTokens,this.conn.maxTokens),stream:false},signal});
   const text=r?.choices?.[0]?.message?.content;
   if(typeof text!=='string'||!text.trim())throw new ProviderError('RESPONSE','Phản hồi AI không có nội dung');
   const usage=r.usage?{inputTokens:Number(r.usage.prompt_tokens)||0,outputTokens:Number(r.usage.completion_tokens)||0}:null;
   this._record(usage,false);
   return {text,usage,modelReported:typeof r.model==='string'?r.model.slice(0,128):m,identityVerified:false};
  }catch(e){this._record(null,true);throw e;}
 }
}
export class AnthropicAdapter extends BaseAdapter{
 _authHeaders(){return {'x-api-key':this.secret||'','anthropic-version':'2023-06-01'};}
 async listModels(){const r=await this._http('GET','/v1/models');return (r?.data||[]).map(m=>m?.id).filter(id=>typeof id==='string'&&MODEL_ID.test(id));}
 async executeTask({prompt,system,model,maxTokens,signal}){
  const m=this._model(model);
  try{
   const r=await this._http('POST','/v1/messages',{body:{model:m,max_tokens:Math.min(maxTokens||this.conn.maxTokens,this.conn.maxTokens),...(system?{system}:{}),messages:[{role:'user',content:prompt}]},signal});
   const text=(r?.content||[]).filter(b=>b?.type==='text'&&typeof b.text==='string').map(b=>b.text).join('\n');
   if(!text.trim())throw new ProviderError('RESPONSE','Phản hồi AI không có nội dung');
   const usage=r.usage?{inputTokens:Number(r.usage.input_tokens)||0,outputTokens:Number(r.usage.output_tokens)||0}:null;
   this._record(usage,false);
   return {text,usage,modelReported:typeof r.model==='string'?r.model.slice(0,128):m,identityVerified:false};
  }catch(e){this._record(null,true);throw e;}
 }
}
export class GeminiAdapter extends BaseAdapter{
 _authHeaders(){return {'x-goog-api-key':this.secret||''};}
 async listModels(){const r=await this._http('GET','/v1beta/models');return (r?.models||[]).map(m=>typeof m?.name==='string'?m.name.replace(/^models\//,''):null).filter(id=>id&&MODEL_ID.test(id));}
 async executeTask({prompt,system,model,maxTokens,signal}){
  const m=this._model(model);
  try{
   const r=await this._http('POST','/v1beta/models/'+encodeURIComponent(m)+':generateContent',{body:{contents:[{role:'user',parts:[{text:prompt}]}],...(system?{systemInstruction:{parts:[{text:system}]}}:{}),generationConfig:{maxOutputTokens:Math.min(maxTokens||this.conn.maxTokens,this.conn.maxTokens)}},signal});
   const text=(r?.candidates?.[0]?.content?.parts||[]).map(p=>typeof p?.text==='string'?p.text:'').join('');
   if(!text.trim())throw new ProviderError('RESPONSE','Phản hồi AI không có nội dung');
   const u=r.usageMetadata;
   const usage=u?{inputTokens:Number(u.promptTokenCount)||0,outputTokens:Number(u.candidatesTokenCount)||0}:null;
   this._record(usage,false);
   return {text,usage,modelReported:typeof r.modelVersion==='string'?r.modelVersion.slice(0,128):m,identityVerified:false};
  }catch(e){this._record(null,true);throw e;}
 }
}
const DEFAULT_ENDPOINTS={'openai-compatible':'http://127.0.0.1:20128','anthropic':'https://api.anthropic.com','gemini':'https://generativelanguage.googleapis.com'};
export function defaultEndpoint(type){return DEFAULT_ENDPOINTS[type];}
export function createAdapter(conn,opts){
 switch(conn?.type){
  case 'openai-compatible':return new OpenAICompatibleAdapter(conn,opts);
  case 'anthropic':return new AnthropicAdapter(conn,opts);
  case 'gemini':return new GeminiAdapter(conn,opts);
  default:throw new ProviderError('CONFIG','Loại nhà cung cấp chưa được hỗ trợ');
 }
}
