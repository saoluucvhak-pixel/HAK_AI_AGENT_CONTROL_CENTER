import test from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import {createObserverApi} from '../src/observer-api.js';
function response(){return{status:null,payload:null,headers:{},setHeader(k,v){this.headers[k]=v},writeHead(s){this.status=s},end(s){this.payload=JSON.parse(s)}}}
const token='123456789012345678901234';
test('requires long token',()=>assert.throws(()=>createObserverApi({token:'short'})));
test('observer rejects missing bearer token',async()=>{const api=createObserverApi({token});const r=response();await api({headers:{},method:'GET'},r,'/api/agent-status');assert.equal(r.status,401)});
test('observer accepts events and reads status with bearer',async()=>{const api=createObserverApi({token});const body=Readable.from([JSON.stringify({taskId:'t1',agentId:'a1',status:'running'})]);body.headers={authorization:'Bearer '+token};body.method='POST';const r=response();await api(body,r,'/api/agent-events');assert.equal(r.status,201);const s=response();await api({headers:{authorization:'Bearer '+token},method:'GET'},s,'/api/agent-status');assert.equal(s.payload.tasks[0].status,'running');assert.equal(s.payload.persistent,false)});
test('invalid status rejected',async()=>{const api=createObserverApi({token});const req=Readable.from([JSON.stringify({taskId:'t',agentId:'a',status:'root'})]);req.headers={authorization:'Bearer '+token};req.method='POST';const r=response();await api(req,r,'/api/agent-events');assert.equal(r.status,400)});

test('local read-only status requires no token but event POST still requires bearer',async()=>{
 const api=createObserverApi({token,localReadOnly:true});
 const status=response();await api({headers:{},method:'GET'},status,'/api/agent-status');assert.equal(status.status,200);
 const event=Readable.from([JSON.stringify({taskId:'t2',agentId:'a2',status:'running'})]);event.headers={};event.method='POST';
 const result=response();await api(event,result,'/api/agent-events');assert.equal(result.status,401);
});

test('Observer bearer token must match exactly, including length and scheme',async()=>{
 const api=createObserverApi({token});
 for(const authorization of ['bearer '+token,'Bearer '+token+'x','Bearer '+token.slice(0,-1)+'x','Basic '+token,'Bearer ']){
  const r=response();await api({headers:{authorization},method:'GET'},r,'/api/agent-status');assert.equal(r.status,401);
 }
 const r=response();await api({headers:{authorization:'Bearer '+token},method:'GET'},r,'/api/agent-status');assert.equal(r.status,200);
});
