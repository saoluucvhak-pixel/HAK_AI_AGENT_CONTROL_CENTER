import test from 'node:test';import assert from 'node:assert/strict';
import {gatewayConfig,routeModel,claudeMemBridge} from '../src/integrations.js';
test('default gateway local and disabled',()=>assert.deepEqual(gatewayConfig({}),{baseUrl:'http://127.0.0.1:20128',enabled:false}));
test('remote gateway forbidden',()=>assert.throws(()=>gatewayConfig({HAK_OMNIROUTE_URL:'https://example.com'})));
test('credentials in gateway URL forbidden',()=>assert.throws(()=>gatewayConfig({HAK_OMNIROUTE_URL:'http://user:pass@localhost:20128'})));
test('gateway requires opt in',async()=>await assert.rejects(routeModel({role:'coder',prompt:'test',sensitive:false},{env:{}}),/disabled/));
test('gateway routes approved nonsensitive task',async()=>{let seen;const result=await routeModel({role:'coder',prompt:'test',sensitive:false},{env:{HAK_OMNIROUTE_ENABLED:'true',HAK_OMNIROUTE_API_KEY:'1234567890123456'},fetchImpl:async(url,options)=>{seen={url,options};return {ok:true,headers:{get:()=>null},body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(JSON.stringify({model:'sample',choices:[{message:{content:'ok'}}]})));controller.close();}})}}});assert.equal(result.answer,'ok');assert.equal(seen.url,'http://127.0.0.1:20128/v1/chat/completions');assert.equal(seen.options.redirect,'manual');});
test('sensitive task rejected before network call',async()=>await assert.rejects(routeModel({role:'coder',prompt:'private',sensitive:true},{env:{HAK_OMNIROUTE_ENABLED:'true',HAK_OMNIROUTE_API_KEY:'1234567890123456'}}),/classification/));
test('memory is off without approval',()=>assert.equal(claudeMemBridge({approved:false,sensitive:false}).enabled,false));
test('memory opt in scoped to project',()=>assert.deepEqual(claudeMemBridge({approved:true,sensitive:false,projectId:'hak',summary:'Use PR review'},{env:{HAK_CLAUDE_MEM_ENABLED:'true'}}),{enabled:true,projectId:'hak',summary:'Use PR review',mode:'reviewed-export-only'}));

test('gateway rejects a response without a bounded readable stream',async()=>{
 const env={HAK_OMNIROUTE_ENABLED:'true',HAK_OMNIROUTE_API_KEY:'1234567890123456'};
 await assert.rejects(routeModel({role:'coder',prompt:'test',sensitive:false},{env,fetchImpl:async()=>({ok:true,headers:{get:()=>null},json:async()=>({choices:[{message:{content:'ok'}}]})})}),/stream unavailable/);
});
test('gateway cancels an oversized streamed response',async()=>{
 const env={HAK_OMNIROUTE_ENABLED:'true',HAK_OMNIROUTE_API_KEY:'1234567890123456'};
 let cancelled=false;
 const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1024*1024+1));},cancel(){cancelled=true;}});
 await assert.rejects(routeModel({role:'coder',prompt:'test',sensitive:false},{env,fetchImpl:async()=>({ok:true,headers:{get:()=>null},body})}),/size limit/);
 assert.equal(cancelled,true);
});
