import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventStore} from '../src/event-store.js';

test('summary retains latest event per task across append and reload',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'hak-event-summary-'));
  try {
    const path=join(dir,'events.jsonl');
    const store=new EventStore(path);
    await store.load();
    const at='2026-11-23T00:00:00.000Z';
    await store.add({taskId:'one',agentId:'agent',status:'queued',at});
    await store.add({taskId:'two',agentId:'agent',status:'running',at});
    await store.add({taskId:'one',agentId:'agent',status:'passed',at});
    assert.deepEqual(store.summary().map(e=>[e.taskId,e.status]),[['one','passed'],['two','running']]);
    assert.equal(store.list().length,3);
    const snapshot=store.summary();snapshot[0].status='failed';
    assert.equal(store.summary()[0].status,'passed');
    const reopened=new EventStore(path);await reopened.load();
    assert.deepEqual(reopened.summary(),store.summary());
  } finally {await rm(dir,{recursive:true,force:true});}
});
