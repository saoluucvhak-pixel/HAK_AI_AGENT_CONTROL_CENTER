import test from 'node:test';
import assert from 'node:assert/strict';
import {routeModel} from '../src/integrations.js';
const env={HAK_OMNIROUTE_ENABLED:'true',HAK_OMNIROUTE_API_KEY:'test-secret-123456789012345'};
const task={role:'tester',sensitive:false,prompt:'hello'};
test('oversized gateway stream is canceled to free upstream resources',async()=>{
 let canceled=false;
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1024*1024+1))},cancel(){canceled=true}});
 await assert.rejects(routeModel(task,{env,fetchImpl:async()=>({ok:true,headers:{get:()=>null},body:stream})}),/size limit/);
 assert.equal(canceled,true);
});
test('invalid streamed JSON rejects without exposing body',async()=>{
 const bytes=new TextEncoder().encode('not-json-sensitive-placeholder');
 await assert.rejects(routeModel(task,{env,fetchImpl:async()=>({ok:true,headers:{get:()=>null},body:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close()}})})}),e=>{
  assert.equal(e.message,'Malformed gateway response');assert.ok(!e.message.includes('placeholder'));return true;
 });
});
