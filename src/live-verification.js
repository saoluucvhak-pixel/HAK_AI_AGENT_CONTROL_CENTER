import {routeModel,gatewayConfig} from './integrations.js';

const CHALLENGE='HAK-PROBE-7F2C';
export async function verifyOmniRoute({env=process.env,fetchImpl=fetch,now=()=>Date.now()}={}){
 const checkedAt=new Date().toISOString();
 const report={schemaVersion:1,kind:'hak-omniroute-live-verification',checkedAt,verified:false,readyForProduction:false};
 if(env.HAK_OMNIROUTE_LIVE_TEST!=='true')return {...report,status:'not-enabled',reason:'Explicit HAK_OMNIROUTE_LIVE_TEST=true required'};
 try{
  gatewayConfig(env);
  const started=now();
  const output=await routeModel({role:'developer',prompt:'Reply with exactly '+CHALLENGE+' and nothing else.'},{env,fetchImpl});
  const latencyMs=Math.max(0,now()-started);
  const verified=output.answer.trim()===CHALLENGE;
  return {...report,status:verified?'challenge-passed':'challenge-failed',verified,latencyMs,model:output.model,reason:verified?'Live response matched challenge; billing, model identity and production security remain unverified':'Provider response did not match challenge'};
 }catch(e){
  return {...report,status:'error',reason:'Live request failed; check local gateway configuration and logs privately'};
 }
}
