import test from 'node:test';
import assert from 'node:assert/strict';
import {routeModel,claudeMemBridge} from '../src/integrations.js';

const env={HAK_OMNIROUTE_ENABLED:'true',HAK_OMNIROUTE_API_KEY:'test-only-secret-1234567890'};
const task={role:'tester',prompt:'Return OK',sensitive:false};

test('OmniRoute rejects redirects without following them',async()=>{
 let options;
 await assert.rejects(routeModel(task,{env,fetchImpl:async(_url,o)=>{options=o;return {ok:false,status:302}}}),/HTTP 302/);
 assert.equal(options.redirect,'manual');
});
test('OmniRoute rejects malformed and non-text responses',async()=>{
 for(const payload of [{choices:[]},{choices:[{message:{content:null}}]},{choices:[{message:{content:{secret:'bad'}}}]}]){
  await assert.rejects(routeModel(task,{env,fetchImpl:async()=>({ok:true,json:async()=>payload})}),/Malformed gateway response/);
 }
});
test('OmniRoute refuses sensitive or unclassified tasks without contacting gateway',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw new Error('should not run')};
 for(const sensitive of [true,undefined,null]){
  await assert.rejects(routeModel({...task,sensitive},{env,fetchImpl}),/classification/);
 }
 assert.equal(calls,0);
});
test('Claude-Mem never exports unapproved, sensitive or invalid-scope records',()=>{
 const base={approved:true,sensitive:false,projectId:'hak_project',summary:'Approved non-sensitive observation'};
 for(const record of [{...base,approved:false},{...base,sensitive:true},{...base,sensitive:undefined}]){
  const result=claudeMemBridge(record,{env:{HAK_CLAUDE_MEM_ENABLED:'true'}});
  assert.equal(result.enabled,false);
 }
 assert.throws(()=>claudeMemBridge({...base,projectId:'../other'},{env:{HAK_CLAUDE_MEM_ENABLED:'true'}}),/scope/);
 assert.equal(claudeMemBridge(base,{env:{}}).enabled,false);
});
