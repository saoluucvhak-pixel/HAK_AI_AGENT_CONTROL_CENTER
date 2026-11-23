import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createObserverApi} from '../src/observer-api.js';

test('Observer preserves multibyte UTF-8 JSON when split across request chunks',async()=>{
  let received;
  const registry={add:async event=>{received=event;return event;}};
  const handle=createObserverApi({token:'a'.repeat(32),registry});
  const event={taskId:'test-🌳',agentId:'agent',status:'queued',at:'2026-11-23T00:00:00Z'};
  const encoded=Buffer.from(JSON.stringify(event));
  const marker=Buffer.from('🌳');
  const index=encoded.indexOf(marker);
  assert.ok(index>0);
  const req=Readable.from([encoded.subarray(0,index+1),encoded.subarray(index+1)]);
  req.method='POST';req.headers={authorization:'Bearer '+'a'.repeat(32)};
  let status;let body='';
  const res={setHeader(){},writeHead(s){status=s;},end(s){body=s;}};
  await handle(req,res,'/api/agent-events');
  assert.equal(status,201);
  assert.deepEqual(received,event);
  assert.deepEqual(JSON.parse(body),event);
});
