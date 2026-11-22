import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOmniRoute} from '../src/live-verification.js';
const env={HAK_OMNIROUTE_LIVE_TEST:'true',HAK_OMNIROUTE_ENABLED:'true',HAK_OMNIROUTE_URL:'http://127.0.0.1:20128/',HAK_OMNIROUTE_API_KEY:'test-key-1234567890'};
test('live verification opt-in is required and no provider call occurs by default',async()=>{
 const r=await verifyOmniRoute({env:{},fetchImpl:()=>{throw new Error('must not call')}});
 assert.equal(r.status,'not-enabled');assert.equal(r.verified,false);
});
test('mock challenge verifies only a matching model response and omits prompt and credentials',async()=>{
 let requests=0;
 const fetchImpl=async(url,options)=>{requests++;assert.equal(url,'http://127.0.0.1:20128/v1/chat/completions');assert.equal(options.redirect,'manual');return{ok:true,json:async()=>({model:'mock-model',choices:[{message:{content:'HAK-PROBE-7F2C'}}]})}};
 const r=await verifyOmniRoute({env,fetchImpl,now:()=>100});
 assert.equal(requests,1);assert.equal(r.status,'challenge-passed');assert.equal(r.verified,true);assert.equal(r.readyForProduction,false);
 assert.ok(!JSON.stringify(r).includes(env.HAK_OMNIROUTE_API_KEY));
});
test('wrong response is not accepted',async()=>{
 const r=await verifyOmniRoute({env,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'wrong'}}]})})});
 assert.equal(r.status,'challenge-failed');assert.equal(r.verified,false);
});
test('error reports do not leak secrets',async()=>{
 const r=await verifyOmniRoute({env,fetchImpl:async()=>{throw new Error('secret '+env.HAK_OMNIROUTE_API_KEY)}});
 assert.equal(r.status,'error');assert.ok(!JSON.stringify(r).includes(env.HAK_OMNIROUTE_API_KEY));
});
