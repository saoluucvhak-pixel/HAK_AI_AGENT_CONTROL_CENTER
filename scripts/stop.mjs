// Gracefully stops a running HAK backend through its authenticated shutdown API.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function stopHak({port=Number(process.env.PORT||4317),span=10,fetchImpl=fetch}={}){
 let stopped=0;
 for(let p=port;p<port+span;p++){
  const base='http://127.0.0.1:'+p;
  try{
   const health=await (await fetchImpl(base+'/api/health',{signal:AbortSignal.timeout(800)})).json();
   if(health.app!=='hak-agent-control-center')continue;
   const session=await (await fetchImpl(base+'/api/operator/session',{signal:AbortSignal.timeout(2000)})).json();
   const r=await fetchImpl(base+'/api/v2/shutdown',{method:'POST',headers:{'X-HAK-Operator-Token':session.token,Origin:base,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(3000)});
   if(r.ok)stopped++;
  }catch{/* nothing listening on this port */}
 }
 return stopped;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const n=await stopHak();
 console.log(n?'Đã yêu cầu dừng '+n+' tiến trình HAK.':'Không có HAK nào đang chạy.');
}
