import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotCache} from '../src/github-snapshot-cache.js';
import {githubSnapshot} from '../src/github.js';

test('concurrent refreshes share a single request and cache respects TTL',async()=>{
 let calls=0,time=1000;
 const cache=createSnapshotCache({now:()=>time,ttlMs:300000,load:async()=>{calls++;return[{name:'HAK_AI_SKILLS',openPullRequests:calls}]}});
 const [a,b]=await Promise.all([cache(),cache()]);
 assert.equal(calls,1);assert.deepEqual(a,b);
 time+=299999;await cache();assert.equal(calls,1);
 time+=2;await cache();assert.equal(calls,2);
});
test('failed refresh keeps previous data visibly stale',async()=>{
 let time=1,failed=false;
 const cache=createSnapshotCache({now:()=>time,ttlMs:10,load:async()=>failed?[{name:'HAK_AI_SKILLS',error:'GitHub HTTP 403'}]:[{name:'HAK_AI_SKILLS',openPullRequests:3}]});
 await cache();failed=true;time=12;
 const [row]=await cache();
 assert.equal(row.openPullRequests,3);
 assert.equal(row.stale,true);
 assert.match(row.refreshError,/403/);
});
test('rate-limit response explicitly identifies exhausted quota',async()=>{
 const fake=async()=>({ok:false,status:403,headers:{get:(key)=>key==='x-ratelimit-remaining'?'0':null}});
 await assert.rejects(()=>githubSnapshot('HAK_AI_SKILLS',{fetchImpl:fake,token:''}),/rate limit exhausted/);
});
test('403 without exhausted quota remains a permission/HTTP failure',async()=>{
 const fake=async()=>({ok:false,status:403,headers:{get:()=> '42'}});
 await assert.rejects(()=>githubSnapshot('HAK_AI_SKILLS',{fetchImpl:fake,token:''}),/GitHub HTTP 403/);
});
