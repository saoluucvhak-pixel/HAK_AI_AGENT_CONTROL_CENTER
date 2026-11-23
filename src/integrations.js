import {validateTask,memoryPolicy} from './policy.js';
const DEFAULT_GATEWAY = 'http://127.0.0.1:20128';
export function gatewayConfig(env = process.env) {
  const url = new URL(env.HAK_OMNIROUTE_URL || DEFAULT_GATEWAY);
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Only a local HTTP OmniRoute endpoint is permitted in this adapter');
  }
  return {baseUrl:url.origin,enabled:env.HAK_OMNIROUTE_ENABLED === 'true'};
}
export async function routeModel(task, {env=process.env,fetchImpl=fetch}={}) {
  const validated=validateTask(task);
  const cfg=gatewayConfig(env);
  if (!cfg.enabled) throw new Error('OmniRoute integration is disabled');
  const token=env.HAK_OMNIROUTE_API_KEY;
  if (!token || token.length < 16) throw new Error('Missing OmniRoute API key');
  const model=env.HAK_OMNIROUTE_MODEL || 'auto';
  if (!/^[a-zA-Z0-9_./:-]{1,128}$/.test(model)) throw new Error('Invalid model identifier');
  const response=await fetchImpl(cfg.baseUrl+'/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:validated.prompt}],stream:false}),redirect:'manual',signal:AbortSignal.timeout(60000)});
  if (!response.ok) throw new Error('Model gateway failed with HTTP '+response.status);
  const maxBytes=1024*1024;
  const declaredLength=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(declaredLength)&&declaredLength>maxBytes)throw new Error('Gateway response exceeds size limit');
  let result;
  if(response.body&&typeof response.body.getReader==='function'){
    const reader=response.body.getReader();
    const chunks=[];let size=0;let complete=false;
    try{
      while(true){
        const {done,value}=await reader.read();if(done){complete=true;break;}
        size+=value.byteLength;
        if(size>maxBytes)throw new Error('Gateway response exceeds size limit');
        chunks.push(value);
      }
    }finally{
      if(!complete){try{await reader.cancel()}catch{/* Preserve original gateway error */}}
      reader.releaseLock();
    }
    const data=Buffer.concat(chunks.map(x=>Buffer.from(x)));
    try{result=JSON.parse(data.toString('utf8'))}catch{throw new Error('Malformed gateway response')}
  }else{
    // A response without a readable byte stream cannot be size-verified safely.
    throw new Error('Gateway response stream unavailable');
  }
  const answer=result?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string'||answer.length>128000) throw new Error('Malformed gateway response');
  return {role:validated.role,model:result.model||model,answer};
}
export function claudeMemBridge(record, {env=process.env}={}) {
  const checked=memoryPolicy(record);
  if (!checked.allowed) return {enabled:false,reason:checked.reason};
  if (env.HAK_CLAUDE_MEM_ENABLED !== 'true') return {enabled:false,reason:'Claude-Mem disabled'};
  return {enabled:true,projectId:checked.projectId,summary:checked.summary,mode:'reviewed-export-only'};
}
