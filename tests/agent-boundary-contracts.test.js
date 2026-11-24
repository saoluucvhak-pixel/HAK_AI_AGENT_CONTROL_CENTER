import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeMemBridge} from '../src/integrations.js';

test('Claude-Mem never exports unapproved, sensitive or invalid-scope records',()=>{
 const base={approved:true,sensitive:false,projectId:'hak_project',summary:'Approved non-sensitive observation'};
 for(const record of [{...base,approved:false},{...base,sensitive:true},{...base,sensitive:undefined}]){
  const result=claudeMemBridge(record,{env:{HAK_CLAUDE_MEM_ENABLED:'true'}});
  assert.equal(result.enabled,false);
 }
 assert.throws(()=>claudeMemBridge({...base,projectId:'../other'},{env:{HAK_CLAUDE_MEM_ENABLED:'true'}}),/scope/);
 assert.equal(claudeMemBridge(base,{env:{}}).enabled,false);
});
