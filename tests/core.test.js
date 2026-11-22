import test from 'node:test';import assert from 'node:assert/strict';
import {TaskRegistry,skillObservation,validateEvent} from '../src/core.js';
test('task events and latest status',()=>{const r=new TaskRegistry();r.add({taskId:'t1',agentId:'a1',status:'running'});r.add({taskId:'t1',agentId:'a1',status:'passed'});assert.equal(r.summary()[0].status,'passed');assert.equal(r.list().length,2);});
test('reject invalid events',()=>{assert.throws(()=>validateEvent({taskId:'x',agentId:'a',status:'unknown'}));});
test('observations require approval',()=>{assert.equal(skillObservation({skill:'filter',problem:'slow',proposal:'cache'}).approval,'pending');});
