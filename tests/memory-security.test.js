import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryPolicy} from '../src/policy.js';
import {claudeMemBridge} from '../src/integrations.js';
const base={approved:true,projectId:'hak',summary:'Safe summary'};
test('Claude-Mem denies missing sensitivity classification even when approved',()=>{
 assert.deepEqual(memoryPolicy(base),{allowed:false,reason:'Memory requires approval and non-sensitive classification'});
 assert.equal(claudeMemBridge(base,{env:{HAK_CLAUDE_MEM_ENABLED:'true'}}).enabled,false);
});
test('Claude-Mem denies explicit sensitive records and missing approval',()=>{
 assert.equal(memoryPolicy({...base,sensitive:true}).allowed,false);
 assert.equal(memoryPolicy({...base,approved:false,sensitive:false}).allowed,false);
});
test('Claude-Mem accepts explicitly reviewed non-sensitive records only',()=>{
 assert.equal(memoryPolicy({...base,sensitive:false}).allowed,true);
 assert.equal(claudeMemBridge({...base,sensitive:false},{env:{HAK_CLAUDE_MEM_ENABLED:'true'}}).mode,'reviewed-export-only');
});
