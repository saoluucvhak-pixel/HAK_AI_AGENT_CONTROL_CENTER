import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,writeFile,rename,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {executeApprovedWorkOrder} from './agent-engine.js';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {snapshots,safeRepo} from './github.js';
import {createSnapshotCache} from './github-snapshot-cache.js';
import {githubPrEvidence} from './github-pr-evidence.js';
import {assessGithubPrEvidence} from './github-pr-assessment.js';
import {githubFailedJobTriage} from './github-ci-triage.js';
import {createGithubRemediationPlan} from './github-remediation-plan.js';
import {githubCiInvestigation} from './github-ci-investigation.js';
import {createObserverApi} from './observer-api.js';
import {EventStore} from './event-store.js';
import {topology,toMermaid} from './topology.js';
import {acceptanceReport} from './acceptance.js';
import {probeTools} from './readiness-probes.js';
import {evidenceSnapshot} from './evidence.js';
const htmlPath=fileURLToPath(new URL('../web/index.html',import.meta.url));
const port=Number(process.env.PORT||4317);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const host='127.0.0.1';
const observerToken=process.env.HAK_OBSERVER_TOKEN||randomBytes(32).toString('hex');
const observerStore=new EventStore(process.env.HAK_EVENT_STORE_PATH||'./data/agent-events.jsonl');
await observerStore.load();
const observer=createObserverApi({token:observerToken,registry:observerStore,localReadOnly:true});
const operatorToken=randomBytes(32).toString('hex');
const jobs=new Map();
let activeJob=false;
const jobDir=resolve(process.env.HAK_AGENT_OUTPUT_DIR||'./data/agent-results');
async function persistJob(job){
 await mkdir(jobDir,{recursive:true,mode:0o700});
 const path=join(jobDir,job.id+'.json'),tmp=path+'.'+randomBytes(6).toString('hex')+'.tmp';
 await writeFile(tmp,JSON.stringify(job),{flag:'wx',mode:0o600});
 await rename(tmp,path);
}
try{
 await mkdir(jobDir,{recursive:true,mode:0o700});
 for(const name of (await readdir(jobDir)).filter(n=>/^[a-f0-9]{24}\.json$/.test(n)).slice(0,500)){
  try{
   const job=JSON.parse(await readFile(join(jobDir,name),'utf8'));
   if(job.id+'.json'!==name||typeof job.title!=='string'||!['running','completed','failed','blocked'].includes(job.status))continue;
   if(job.status==='running'){job.status='blocked';job.error='Interrupted by application restart';await persistJob(job);}
   jobs.set(job.id,job);
  }catch{/* Skip invalid history files */}
 }
}catch{/* Storage errors surface on job submission */}
function sendJson(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
function authorized(req){
 const candidate=req.headers['x-hak-operator-token'];
 if(typeof candidate!=='string'||candidate.length!==operatorToken.length)return false;
 return timingSafeEqual(Buffer.from(candidate),Buffer.from(operatorToken));
}
async function readBody(req){
 let bytes=0;const parts=[];
 for await(const part of req){bytes+=part.length;if(bytes>16000)throw Error('Request too large');parts.push(part);}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
let cache=null,cacheTime=0;
const getSnapshots=createSnapshotCache({load:snapshots});
async function cachedSnapshots(){cache=await getSnapshots();cacheTime=Date.now();return cache;}
export const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'");
 try{
  const path=new URL(req.url||'/', 'http://localhost').pathname;
  if(path==='/api/agent-events'||path==='/api/agent-status'){
   await observer(req,res,path);return;
  }
  if(path==='/api/operator/session'&&req.method==='GET'){
   sendJson(res,200,{token:operatorToken,enabled:process.env.HAK_AGENT_EXECUTION_ENABLED==='true'&&process.env.HAK_OMNIROUTE_ENABLED==='true',notice:'Local-only session; never share this token'});return;
  }
  if(path==='/api/operator/jobs'&&req.method==='GET'){
   sendJson(res,200,{jobs:[...jobs.values()].map(({id,title,status,steps,error})=>({id,title,status,steps,error}))});return;
  }
  if(path.startsWith('/api/operator/results/')&&req.method==='GET'){
   if(!authorized(req)){sendJson(res,403,{error:'Local operator session required'});return;}
   const id=path.slice('/api/operator/results/'.length);
   const job=jobs.get(id);
   if(!/^[a-f0-9]{24}$/.test(id)||!job||job.status!=='completed'){sendJson(res,404,{error:'Result unavailable'});return;}
   try{
    const content=await readFile(join(jobDir,id+'.txt'),'utf8');
    if(content.length>128000)throw Error('Result exceeds limit');
    sendJson(res,200,{id,title:job.title,content,notice:'AI-generated draft; human review required'});
   }catch{sendJson(res,404,{error:'Result unavailable'});}
   return;
  }
  if(path==='/api/operator/jobs'&&req.method==='POST'){
   const origin=req.headers.origin;
   const expected='http://127.0.0.1:'+port;
   if(origin!==expected||!authorized(req)){sendJson(res,403,{error:'Local operator session required'});return;}
   if(activeJob){sendJson(res,409,{error:'Another agent job is running'});return;}
   if(process.env.HAK_AGENT_EXECUTION_ENABLED!=='true'||process.env.HAK_OMNIROUTE_ENABLED!=='true'){
    sendJson(res,503,{error:'AI is not configured. Enable local OmniRoute and explicit execution first.'});return;
   }
   let body;
   try{body=await readBody(req);if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid body');
    if(typeof body.title!=='string'||!body.title.trim()||body.title.length>160||
       typeof body.description!=='string'||!body.description.trim()||body.description.length>4000||
       !['architecture','ui','backend','data','security','testing','quality','ocr'].includes(body.role)||
       body.confirm!==true)throw Error('Invalid or unconfirmed task');
   }catch{sendJson(res,400,{error:'Invalid task or missing confirmation'});return;}
   const id=randomBytes(12).toString('hex');
   const job={id,title:body.title.trim(),status:'running',steps:[],error:null};
   try{await persistJob(job)}catch{sendJson(res,503,{error:'Local job storage unavailable'});return;}
   jobs.set(id,job);activeJob=true;
   sendJson(res,202,{id,status:'running'});
   void (async()=>{
    try{
     const result=await executeApprovedWorkOrder({
      workOrder:{id,projectId:'HAK',title:job.title,description:body.description,acceptanceCriteria:['Return a reviewable proposal']},
      roles:[body.role],
      approval:{approved:true,workOrderId:id,approvedBy:'local-operator',reason:'Explicit confirmed local UI action'},
      verifyApproval:async({approval})=>approval.workOrderId===id&&approval.approved===true,
      saveOutput:async({taskId,content})=>{
       await mkdir(jobDir,{recursive:true,mode:0o700});
       await writeFile(join(jobDir,id+'.txt'),content,{flag:'wx',mode:0o600});
       return true;
      },
      onEvent:async(event)=>{job.status=event.status;},
     });
     job.steps=result.steps;job.status=result.completed?'completed':'failed';
    }catch{job.status='failed';job.error='Execution failed; check local configuration privately';}
    finally{try{await persistJob(job)}catch{job.error='Failed to save job history';job.status='failed';}activeJob=false;}
   })();
   return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end('Method Not Allowed');return;}
  if(path==='/api/github/pr-evidence'){
   const url=new URL(req.url||'/', 'http://localhost');
   const repo=url.searchParams.get('repo');
   const numberText=url.searchParams.get('number');
   if(!repo||!numberText||!/^[1-9][0-9]{0,8}$/.test(numberText)){
    res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Invalid repository or PR number'}));return;
   }
   try{safeRepo(repo);}catch{
    res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Repository not allowed'}));return;
   }
   const report=await githubPrEvidence(repo,Number(numberText));
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({...report,assessment:assessGithubPrEvidence(report)}));return;
  }
  if(path==='/api/github/ci-triage'){
   const url=new URL(req.url||'/', 'http://localhost');
   const repo=url.searchParams.get('repo');
   const runText=url.searchParams.get('run');
   if(!repo||!runText||!/^[1-9][0-9]{0,14}$/.test(runText)||!Number.isSafeInteger(Number(runText))){
    res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Invalid repository or run ID'}));return;
   }
   try{safeRepo(repo);}catch{
    res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Repository not allowed'}));return;
   }
   const report=await githubFailedJobTriage(repo,Number(runText));
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({...report,remediationPlan:createGithubRemediationPlan(report)}));return;
  }
  if(path==='/api/github/ci-investigation'){
   const url=new URL(req.url||'/', 'http://localhost');
   const repo=url.searchParams.get('repo');
   const runText=url.searchParams.get('run');
   if(!repo||!runText||!/^[1-9][0-9]{0,14}$/.test(runText)||!Number.isSafeInteger(Number(runText))){
    res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Invalid repository or run ID'}));return;
   }
   try{safeRepo(repo);}catch{
    res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Repository not allowed'}));return;
   }
   const report=await githubCiInvestigation(repo,Number(runText));
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(report));return;
  }
  if(path==='/api/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,app:'hak-agent-control-center',mode:'read-only',host}));return;}
  if(path==='/api/evidence'){
   const diagnostics=await probeTools();
   const report=evidenceSnapshot({diagnostics,observer:{persistent:observerStore.persistent,tasks:observerStore.summary()}});
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="hak-acceptance-evidence.json"'});
   res.end(JSON.stringify(report,null,2));return;
  }
  if(path==='/api/diagnostics'){
   const report=await probeTools();
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
   res.end(JSON.stringify(report));return;
  }
  if(path==='/api/acceptance'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(acceptanceReport()));return;}
  if(path==='/api/topology'||path==='/api/topology.mmd'){
   const graph=topology(cache||[]);
   res.writeHead(200,{'Content-Type':path.endsWith('.mmd')?'text/plain; charset=utf-8':'application/json; charset=utf-8'});
   res.end(path.endsWith('.mmd')?toMermaid(graph):JSON.stringify(graph));return;
  }
  if(path==='/api/repos'){
   await cachedSnapshots();
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({repos:cache,updatedAt:new Date(cacheTime).toISOString()}));return;
  }
  if(path==='/'||path==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(htmlPath));return;}
  if(path==='/app.js'||path==='/style.css'){const file=fileURLToPath(new URL('../web/'+path.slice(1),import.meta.url));res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'});res.end(await readFile(file));return;}
  res.writeHead(404);res.end('Not Found');
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Dashboard unavailable'}));}
});
if(process.env.NODE_ENV!=='test')server.listen(port,host,()=>console.log('HAK dashboard on http://'+host+':'+port));
