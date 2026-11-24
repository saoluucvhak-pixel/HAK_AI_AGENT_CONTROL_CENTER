import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
process.env.HAK_SANDBOX=process.env.HAK_SANDBOX||'off'; // unit tests run test steps directly; sandbox tests opt in explicitly
import {join} from 'node:path';
import {FileSecretBackend} from '../src/secrets.js';
import {ProviderManager} from '../src/provider-manager.js';
import {ApprovalStore} from '../src/approvals.js';
import {Orchestrator} from '../src/orchestrator.js';

export async function tempDir(){const dir=await mkdtemp(join(tmpdir(),'hak-test-'));return {dir,cleanup:()=>rm(dir,{recursive:true,force:true})};}
export function jsonResponse(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}
/** fetch stub that answers OpenAI-style chat completions; `handler(body,callIndex)` returns text or throws/returns Response. */
export function fakeGateway(handler){
 const calls=[];
 const fetchImpl=async(url,init)=>{
  const body=init.body?JSON.parse(init.body):null;
  calls.push({url:String(url),body,headers:init.headers,signal:init.signal});
  if(String(url).endsWith('/models'))return jsonResponse({data:[{id:'m-1'},{id:'m-2'}]});
  const r=await handler(body,calls.length-1,init);
  if(r instanceof Response)return r;
  return jsonResponse({model:body.model,choices:[{message:{content:r}}],usage:{prompt_tokens:100,completion_tokens:50}});
 };
 return {fetchImpl,calls};
}
export async function buildStack({handler=async()=>'ok',connection={},order={}}={}){
 const t=await tempDir();
 const gw=fakeGateway(handler);
 const secrets=new FileSecretBackend(join(t.dir,'secrets.json'));
 const providers=new ProviderManager({dir:t.dir,secrets,fetchImpl:gw.fetchImpl});
 await providers.load();
 const conn=await providers.upsert({type:'openai-compatible',name:'Test',endpoint:'http://127.0.0.1:20128',model:'m-1',retries:1,maxConcurrency:4,priceInputPerMTok:1,priceOutputPerMTok:2,...connection},'test-key-1234567890');
 let now=Date.now();
 const approvals=new ApprovalStore({path:join(t.dir,'approvals.json'),now:()=>now});
 const events=[];
 const make=()=>new Orchestrator({dir:t.dir,providers,approvals,onEvent:async e=>events.push(e),sleep:async()=>{},now:()=>now,...order});
 const orchestrator=make();await orchestrator.load();
 return {...t,gw,providers,approvals,orchestrator,conn,events,make,advance:ms=>{now+=ms;}};
}
