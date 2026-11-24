import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';

process.env.NODE_ENV='test';
const {server}=await import('../src/server.js');

test('real HTTP /api/skills endpoint lists skills and supports recommendation queries',async()=>{
  server.listen(0,'127.0.0.1');
  try{
    await once(server,'listening');
    const address=server.address();
    assert.ok(address && typeof address!=='string');
    const base='http://127.0.0.1:'+address.port;

    const res1=await fetch(base+'/api/skills?type=security&description=electron+preload+ipc',{signal:AbortSignal.timeout(5000)});
    assert.equal(res1.status,200);
    const body1=await res1.json();
    assert.ok(Array.isArray(body1.skills));
    assert.ok(Array.isArray(body1.recommended));
    assert.ok(body1.recommended.includes('hak-code-auditor'));
    assert.ok(body1.recommended.includes('hak-electron-security'));

    const res2=await fetch(base+'/api/skills?type=feature&description=export+bkvc+m3+report+to+excel',{signal:AbortSignal.timeout(5000)});
    assert.equal(res2.status,200);
    const body2=await res2.json();
    assert.ok(body2.recommended.includes('hak-accounting-report'));
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('real HTTP operator skill recommendation requires local operator session',async()=>{
  server.listen(0,'127.0.0.1');
  try{
    await once(server,'listening');
    const address=server.address();
    assert.ok(address && typeof address!=='string');
    const base='http://127.0.0.1:'+address.port;

    // Denied without operator token
    const denied=await fetch(base+'/api/operator/recommend-skills',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({type:'bug',description:'subcontract backup restore sqlite'}),
      signal:AbortSignal.timeout(5000)
    });
    assert.equal(denied.status,403);

    // Get session token
    const sessionRes=await fetch(base+'/api/operator/session',{signal:AbortSignal.timeout(5000)});
    const session=await sessionRes.json();
    assert.ok(session.token);

    // Authorized
    const allowed=await fetch(base+'/api/operator/recommend-skills',{
      method:'POST',
      headers:{
        'origin':base,
        'x-hak-operator-token':session.token,
        'content-type':'application/json'
      },
      body:JSON.stringify({type:'bug',description:'subcontract backup restore sqlite',filePaths:['app/main/services/BackupService.js']}),
      signal:AbortSignal.timeout(5000)
    });
    assert.equal(allowed.status,200);
    const result=await allowed.json();
    assert.ok(Array.isArray(result.recommended));
    assert.ok(result.recommended.includes('hak-data-integrity'));
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('real HTTP operator mission dispatch rejects unconfirmed or unauthorized requests fail-closed',async()=>{
  server.listen(0,'127.0.0.1');
  try{
    await once(server,'listening');
    const address=server.address();
    assert.ok(address && typeof address!=='string');
    const base='http://127.0.0.1:'+address.port;

    // Unauthorized call rejected
    const unauth=await fetch(base+'/api/operator/dispatch-mission',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({mission:{}}),
      signal:AbortSignal.timeout(5000)
    });
    assert.equal(unauth.status,403);

    const sessionRes=await fetch(base+'/api/operator/session',{signal:AbortSignal.timeout(5000)});
    const session=await sessionRes.json();

    // Missing confirm flag rejected with 400
    const unconfirmed=await fetch(base+'/api/operator/dispatch-mission',{
      method:'POST',
      headers:{
        'origin':base,
        'x-hak-operator-token':session.token,
        'content-type':'application/json'
      },
      body:JSON.stringify({mission:{title:'Missing confirm'}}),
      signal:AbortSignal.timeout(5000)
    });
    assert.equal(unconfirmed.status,400);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
