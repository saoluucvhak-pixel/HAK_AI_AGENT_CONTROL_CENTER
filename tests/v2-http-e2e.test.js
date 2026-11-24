import test from 'node:test';
import assert from 'node:assert/strict';
import http,{createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';

const root=fileURLToPath(new URL('../',import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function raw(port,{method='GET',path='/',headers={}}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port,method,path,headers},res=>{const c=[];res.on('data',d=>c.push(d));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(c).toString()}));});
  req.on('error',reject);req.end();
 });
}
async function ready(base,child){
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('HAK exited: '+child.hakStderr);
  try{if((await fetch(base+'/api/health')).ok)return;}catch{}
  await sleep(100);
 }
 throw Error('not ready');
}
async function stop(child){if(child.exitCode!==null)return;const e=once(child,'exit');child.kill();await Promise.race([e,sleep(3000)]);}

test('security + multi-agent HTTP flow on a real server, with restart persistence',{timeout:90000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hak-v2-e2e-'));
 const cleanups=[];
 const seen=[];
 const gateway=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  if(req.url==='/v1/models'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:'gw-model'}]}));return;}
  const body=JSON.parse(Buffer.concat(chunks).toString());seen.push({auth:req.headers.authorization,body});
  res.writeHead(200,{'content-type':'application/json'});
  const sys=body.messages[0]?.role==='system'?body.messages[0].content:'';
  const content=/Agent chỉnh sửa mã/.test(sys)?JSON.stringify({summary:'thêm tính năng',edits:[{path:'src/feature.js',content:'export const feature=1;\n'}]}):'Đề xuất #'+seen.length;
  res.end(JSON.stringify({model:body.model,choices:[{message:{content}}],usage:{prompt_tokens:10,completion_tokens:5}}));
 });
 let child;
 try{
  await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
  const gwPort=gateway.address().port;
  const port=41000+Math.floor(Math.random()*20000);
  const base='http://127.0.0.1:'+port;
  const env={...process.env,PORT:String(port),HAK_DATA_DIR:dir,NODE_ENV:'production',HAK_SANDBOX:process.env.HAK_SANDBOX||'off'};
  delete env.HAK_OMNIROUTE_ENABLED;delete env.HAK_AGENT_EXECUTION_ENABLED;
  const launch=()=>{const c=spawn(process.execPath,['src/server.js'],{cwd:root,env,stdio:['ignore','ignore','pipe']});c.hakStderr='';c.stderr.on('data',d=>{c.hakStderr=(c.hakStderr+d).slice(-2000)});return c;};
  child=launch();await ready(base,child);

  // --- security: DNS rebinding, cross-origin session theft, unauthenticated reads
  assert.equal((await raw(port,{path:'/api/health',headers:{host:'evil.example.com'}})).status,421);
  assert.equal((await raw(port,{path:'/api/operator/session',headers:{host:'attacker.test:'+port}})).status,421);
  assert.equal((await raw(port,{path:'/api/operator/session',headers:{origin:'http://evil.example.com'}})).status,403);
  assert.equal((await raw(port,{path:'/api/operator/session',headers:{'sec-fetch-site':'cross-site'}})).status,403);
  assert.equal((await raw(port,{path:'/api/operator/jobs'})).status,403);
  assert.equal((await raw(port,{path:'/api/v2/providers'})).status,403);
  const session=await (await fetch(base+'/api/operator/session')).json();
  const H={'x-hak-operator-token':session.token,origin:base,'content-type':'application/json'};
  const v2=(path,method='GET',body)=>fetch(base+'/api/v2'+path,{method,headers:H,body:body?JSON.stringify(body):undefined});
  assert.equal((await fetch(base+'/api/v2/providers',{method:'POST',headers:{'x-hak-operator-token':session.token,'content-type':'application/json'},body:'{}'})).status,403,'mutations need a same-origin Origin');
  assert.equal((await fetch(base+'/api/v2/providers',{method:'POST',headers:{...H,origin:'http://evil.example.com'},body:'{}'})).status,403);

  // --- provider manager: key never echoed
  const key='gw-secret-key-0123456789';
  const created=await v2('/providers','POST',{type:'openai-compatible',name:'Gateway thử',endpoint:'http://127.0.0.1:'+gwPort,model:'gw-model',apiKey:key,retries:0});
  assert.equal(created.status,201);
  const conn=await created.json();
  assert.equal(conn.hasSecret,true);assert.ok(!JSON.stringify(conn).includes(key));
  const bad=await v2('/providers','POST',{type:'openai-compatible',name:'X',endpoint:'http://evil.example.com',apiKey:key});
  assert.equal(bad.status,400);const badBody=await bad.json();
  assert.equal(badBody.code,'CONFIG');assert.ok(badBody.error&&badBody.action&&badBody.step,'actionable error format');
  const health=await (await v2('/providers/'+conn.id+'/test','POST')).json();
  assert.equal(health.ok,true);assert.equal(health.identityVerified,false);
  assert.deepEqual((await (await v2('/providers/'+conn.id+'/models')).json()).models,['gw-model']);

  // --- multi-agent work order over HTTP
  const woRes=await v2('/work-orders','POST',{title:'Báo cáo doanh thu',description:'Thiết kế báo cáo doanh thu theo tháng',agents:['architecture','backend','frontend','security','testing']});
  assert.equal(woRes.status,201);
  const wo=await woRes.json();
  assert.equal(wo.status,'AWAITING_APPROVAL');
  const early=await v2('/work-orders/'+wo.id+'/start','POST',{});
  assert.equal(early.status,409);assert.equal((await early.json()).code,'NOT_APPROVED');
  assert.equal(seen.length,0,'no model call before approval');
  assert.equal((await v2('/work-orders/'+wo.id+'/approve','POST',{reason:'ok',ttlMinutes:30})).status,200);
  assert.equal((await v2('/work-orders/'+wo.id+'/start','POST',{})).status,202);
  let order;
  for(let i=0;i<150;i++){order=await (await v2('/work-orders/'+wo.id)).json();if(['COMPLETED','FAILED','BLOCKED'].includes(order.status))break;await sleep(100);}
  assert.equal(order.status,'COMPLETED');
  assert.equal(seen.length,5);const planCalls=5;void planCalls;
  assert.ok(seen.every(s=>s.auth==='Bearer '+key));
  const agg=await (await v2('/work-orders/'+wo.id+'/aggregate')).json();
  assert.match(agg.content,/Báo cáo doanh thu/);assert.match(agg.content,/Đề xuất #5/);
  const overview=await (await v2('/overview')).json();
  assert.equal(overview.orchestration.completed,1);assert.equal(overview.usage.inputTokens,50);

  // --- code change over HTTP: register repo, gates, isolated edit, tests, publish to a local bare origin
  const {makeRepo}=await import('./git-helpers.js');const {runGit}=await import('../src/safe-process.js');
  const repoFx=await makeRepo();cleanups.push(repoFx.cleanup);
  const bare=join(repoFx.dir,'origin.git');await runGit(['init','-q','--bare',bare],{cwd:repoFx.dir});await repoFx.g('remote','add','origin',bare);
  const repoRes=await v2('/code/repos','POST',{name:'demo',path:repoFx.repo});assert.equal(repoRes.status,201);
  const repoInfo=await repoRes.json();
  assert.equal((await v2('/code/repos','POST',{name:'x',path:dir})).status,400,'a non-repository path is refused');
  const noConsent=await v2('/code/changes','POST',{orderId:wo.id,repoId:repoInfo.id,scope:['src/**','test/**']});
  assert.equal(noConsent.status,400);assert.equal((await noConsent.json()).code,'CONSENT');
  const ccRes=await v2('/code/changes','POST',{orderId:wo.id,repoId:repoInfo.id,scope:['src/**','test/**'],consentExecuteCode:true});
  assert.equal(ccRes.status,201);const cc=await ccRes.json();
  const before=seen.length;
  const early2=await v2('/code/changes/'+cc.id+'/start','POST',{});assert.equal(early2.status,409);
  assert.equal(seen.length,before,'no model call before approval');
  assert.equal((await v2('/code/changes/'+cc.id+'/approve','POST',{reason:'ok'})).status,200);
  assert.equal((await v2('/code/changes/'+cc.id+'/start','POST',{})).status,202);
  let change;
  for(let i=0;i<200;i++){change=await (await v2('/code/changes/'+cc.id)).json();if(['VERIFIED','BLOCKED','FAILED'].includes(change.status))break;await sleep(150);}
  assert.equal(change.status,'VERIFIED',JSON.stringify(change.error));
  assert.equal((await repoFx.g('rev-parse','HEAD')).stdout.trim(),repoFx.sha,'user checkout untouched');
  assert.equal((await v2('/code/changes/'+cc.id+'/publish','POST',{})).status,409,'publish needs gate 2');
  assert.equal((await v2('/code/changes/'+cc.id+'/approve-publish','POST',{})).status,200);
  const pub=await (await v2('/code/changes/'+cc.id+'/publish','POST',{})).json();
  assert.equal(pub.status,'PUBLISHED');
  assert.equal((await runGit(['rev-parse','refs/heads/'+change.branch],{cwd:bare})).stdout.trim(),change.headSha);

  // --- backup through the API
  const bk=await v2('/backups','POST',{});assert.equal(bk.status,201);
  const bkBody=await bk.json();assert.ok(bkBody.fileCount>=3);
  assert.equal((await (await v2('/backups')).json()).backups.length,1);

  // --- observer sees agent progress
  const status=await (await fetch(base+'/api/agent-status')).json();
  assert.ok(status.tasks.some(t=>t.taskId.startsWith(wo.id+':')&&t.status==='passed'));

  // --- persistence: nothing secret on disk outside the secret store, state survives restart
  await stop(child);
  const providerConfig=await readFile(join(dir,'providers.json'),'utf8');
  assert.ok(!providerConfig.includes(key));
  for(const name of await readdir(join(dir,'work-orders')))assert.ok(!(await readFile(join(dir,'work-orders',name),'utf8')).includes(key));
  child=launch();await ready(base,child);
  const s2=await (await fetch(base+'/api/operator/session')).json();
  const H2={'x-hak-operator-token':s2.token,origin:base};
  const list=await (await fetch(base+'/api/v2/work-orders',{headers:H2})).json();
  assert.equal(list.workOrders.find(w=>w.id===wo.id)?.status,'COMPLETED');
  const providers=await (await fetch(base+'/api/v2/providers',{headers:H2})).json();
  assert.equal(providers.connections[0].hasSecret,true);
  const again=await fetch(base+'/api/v2/work-orders/'+wo.id+'/aggregate',{headers:H2});
  assert.equal(again.status,200);
 }finally{
  if(child)await stop(child);
  await new Promise(r=>gateway.close(r));
  await rm(dir,{recursive:true,force:true});
  for(const c of cleanups)await c();
 }
});
