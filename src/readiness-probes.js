const COMPONENTS=['ruflo','claude-mem','archify','ocr'];
export function localEndpoint(value){
 const url=new URL(value);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Only local HTTP root URLs allowed');
 return url.origin;
}
export async function probeTools({env=process.env,fetchImpl=fetch}={}){
 const checks=[];
 for(const id of COMPONENTS){
  const prefix='HAK_'+id.toUpperCase().replaceAll('-','_');
  const raw=env[prefix+'_URL'];
  if(!raw){checks.push({id,status:'not-configured',verified:false});continue;}
  try{
   const origin=localEndpoint(raw);
   const healthPath='/health';
   const headers={};
   const response=await fetchImpl(origin+healthPath,{headers,redirect:'manual',signal:AbortSignal.timeout(3000)});
   checks.push({id,status:response.ok?'endpoint-reachable':'http-error',httpStatus:response.status,verified:false});
  }catch(e){checks.push({id,status:'unreachable-or-invalid',verified:false,reason:e instanceof TypeError?'invalid-url-or-connection':'probe-failed'});}
 }
 return {schemaVersion:1,kind:'local-connectivity-only',checkedAt:new Date().toISOString(),checks,readyForProduction:false,notice:'HTTP connectivity does not certify agent execution, model output, licensing, privacy, security or OCR accuracy'};
}
