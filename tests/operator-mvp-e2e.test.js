import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';

const root=fileURLToPath(new URL('../',import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(base,child){
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw Error('HAK exited unexpectedly: '+(child.hakStderr||''));
  try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(300)});if(r.ok)return;}catch{}
  await sleep(100);
 }
 throw Error('HAK not ready');
}
async function stop(child){
 if(child.exitCode!==null)return;
 const exit=once(child,'exit');child.kill();await Promise.race([exit,sleep(3000)]);
}
test('operator task: real HTTP model gateway contract, result viewing, restart persistence', {timeout:45000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hak-operator-e2e-'));
 const modelRequests=[];
 const gateway=createServer(async(req,res)=>{
  if(req.method!=='POST'||req.url!=='/v1/chat/completions'){res.writeHead(404);res.end();return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  modelRequests.push({authorization:req.headers.authorization,body:JSON.parse(Buffer.concat(chunks).toString())});
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({model:'test-model',choices:[{message:{content:'Reviewable AI response for local acceptance'}}]}));
 });
 let child;
 try{
  await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  const gatewayPort=gateway.address().port;
  const port=41000+Math.floor(Math.random()*20000);
  const base='http://127.0.0.1:'+port;
  const env={...process.env,PORT:String(port),HAK_AGENT_OUTPUT_DIR:join(dir,'results'),
   HAK_EVENT_STORE_PATH:join(dir,'events.jsonl'),HAK_AGENT_EXECUTION_ENABLED:'true',
   HAK_OMNIROUTE_ENABLED:'true',HAK_OMNIROUTE_URL:'http://127.0.0.1:'+gatewayPort,
   HAK_OMNIROUTE_API_KEY:'local-test-key-1234567890',HAK_OMNIROUTE_MODEL:'test-model',NODE_ENV:'production'};
  const launch=()=>{
   const processHandle=spawn(process.execPath,['src/server.js'],{cwd:root,env,stdio:['ignore','ignore','pipe']});
   processHandle.hakStderr='';
   processHandle.stderr.setEncoding('utf8');
   processHandle.stderr.on('data',chunk=>{processHandle.hakStderr=(processHandle.hakStderr+chunk).slice(-2000)});
   return processHandle;
  };
  child=launch();await ready(base,child);
  const session=await (await fetch(base+'/api/operator/session')).json();
  assert.equal(session.enabled,true);
  const denied=await fetch(base+'/api/operator/jobs',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(denied.status,403);
  const submit=await fetch(base+'/api/operator/jobs',{method:'POST',
   headers:{'origin':base,'x-hak-operator-token':session.token,'content-type':'application/json'},
   body:JSON.stringify({title:'Test operator work order',description:'Draft a reviewable proposal',role:'testing',confirm:true})});
  assert.equal(submit.status,202);
  const {id}=await submit.json();
  let job;
  for(let i=0;i<80;i++){
   const list=await (await fetch(base+'/api/operator/jobs')).json();
   job=list.jobs.find(x=>x.id===id);
   if(job?.status==='completed'||job?.status==='failed')break;
   await sleep(100);
  }
  assert.equal(job?.status,'completed');
  assert.equal(modelRequests.length,1);
  assert.equal(modelRequests[0].authorization,'Bearer local-test-key-1234567890');
  assert.match(modelRequests[0].body.messages[0].content,/Test operator work order/);
  const forbidden=await fetch(base+'/api/operator/results/'+id);
  assert.equal(forbidden.status,403);
  const result=await fetch(base+'/api/operator/results/'+id,{headers:{'x-hak-operator-token':session.token}});
  assert.equal(result.status,200);
  assert.match((await result.json()).content,/Reviewable AI response/);
  assert.match(await readFile(join(dir,'results',id+'.txt'),'utf8'),/Reviewable AI response/);
  await stop(child);child=launch();await ready(base,child);
  const history=await (await fetch(base+'/api/operator/jobs')).json();
  assert.equal(history.jobs.find(x=>x.id===id)?.status,'completed');
  const newSession=await (await fetch(base+'/api/operator/session')).json();
  const restored=await fetch(base+'/api/operator/results/'+id,{headers:{'x-hak-operator-token':newSession.token}});
  assert.equal(restored.status,200);
 }finally{
  if(child)await stop(child);
  await new Promise(resolve=>gateway.close(resolve));
  await rm(dir,{recursive:true,force:true});
 }
});
