import test from 'node:test';
import assert from 'node:assert/strict';
import {routeModel} from '../src/integrations.js';
const task={role:'tester',sensitive:false,prompt:'hello'};
const env={HAK_OMNIROUTE_ENABLED:'true',HAK_OMNIROUTE_API_KEY:'test-secret-123456789012345'};
test('OmniRoute refuses declared oversized response',async()=>{
 await assert.rejects(routeModel(task,{env,fetchImpl:async()=>({ok:true,headers:{get:()=>String(2*1024*1024)},json:async()=>({choices:[{message:{content:'ok'}}]})})}),/size limit/);
});
test('OmniRoute rejects oversized streamed body',async()=>{
 const payload=new Uint8Array(1024*1024+1);
 await assert.rejects(routeModel(task,{env,fetchImpl:async()=>({ok:true,headers:{get:()=>null},body:new ReadableStream({start(controller){controller.enqueue(payload);controller.close()}})})}),/size limit/);
});
test('OmniRoute accepts small streamed JSON body',async()=>{
 const bytes=new TextEncoder().encode(JSON.stringify({model:'local',choices:[{message:{content:'ok'}}]}));
 const r=await routeModel(task,{env,fetchImpl:async()=>({ok:true,headers:{get:()=>null},body:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close()}})})});
 assert.equal(r.answer,'ok');
});
test('OmniRoute rejects excessive answer size in mock fallback',async()=>{
 await assert.rejects(routeModel(task,{env,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'x'.repeat(128001)}}]})})}),/Malformed gateway response/);
});
