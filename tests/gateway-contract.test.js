import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {once} from 'node:events';import {routeModel} from '../src/integrations.js';
async function withGateway(handler,run){const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');try{return await run(server.address().port)}finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))}}
test('real local HTTP mock validates gateway auth, body, model response',async()=>{
 await withGateway(async(req,res)=>{
  assert.equal(req.url,'/v1/chat/completions');assert.equal(req.method,'POST');assert.equal(req.headers.authorization,'Bearer test-secret-123456789');
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
  assert.equal(body.model,'auto');assert.deepEqual(body.messages,[{role:'user',content:'review safe code'}]);
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({model:'test-model',choices:[{message:{content:'mock-ok'}}]}));
 },async port=>{
  const result=await routeModel({role:'reviewer',prompt:'review safe code',sensitive:false},{env:{HAK_OMNIROUTE_ENABLED:'true',HAK_OMNIROUTE_URL:'http://127.0.0.1:'+port,HAK_OMNIROUTE_API_KEY:'test-secret-123456789'}});
  assert.equal(result.answer,'mock-ok');assert.equal(result.model,'test-model');
 });
});
test('redirect responses are rejected without forwarding credentials',async()=>{
 await withGateway((req,res)=>{res.writeHead(302,{location:'http://127.0.0.1:9/steal'});res.end()},async port=>{
  await assert.rejects(routeModel({role:'coder',prompt:'safe',sensitive:false},{env:{HAK_OMNIROUTE_ENABLED:'true',HAK_OMNIROUTE_URL:'http://127.0.0.1:'+port,HAK_OMNIROUTE_API_KEY:'test-secret-123456789'}}),/HTTP 302/);
 });
});
