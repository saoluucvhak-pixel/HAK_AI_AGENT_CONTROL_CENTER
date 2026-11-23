import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {snapshots,safeRepo} from './github.js';
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
let cache=null,cacheTime=0,cacheRefresh=null;
const REPO_CACHE_MS=5*60*1000;
async function cachedSnapshots(){
 if(cache&&Date.now()-cacheTime<REPO_CACHE_MS)return cache;
 if(cacheRefresh)return cacheRefresh;
 cacheRefresh=snapshots().then(next=>{
  const previous=new Map((cache||[]).filter(item=>!item.error).map(item=>[item.name,item]));
  cache=next.map(item=>item.error&&previous.has(item.name)?{...previous.get(item.name),stale:true,refreshError:item.error}:item);
  cacheTime=Date.now();
  return cache;
 }).finally(()=>{cacheRefresh=null});
 return cacheRefresh;
}
export const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'");
 try{
  const path=new URL(req.url||'/', 'http://localhost').pathname;
  if(path==='/api/agent-events'||path==='/api/agent-status'){
   await observer(req,res,path);return;
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
