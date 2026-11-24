import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeMemBridge} from '../src/integrations.js';

test('memory is off without approval',()=>assert.equal(claudeMemBridge({approved:false,sensitive:false}).enabled,false));
test('memory opt in scoped to project',()=>assert.deepEqual(claudeMemBridge({approved:true,sensitive:false,projectId:'hak',summary:'Use PR review'},{env:{HAK_CLAUDE_MEM_ENABLED:'true'}}),{enabled:true,projectId:'hak',summary:'Use PR review',mode:'reviewed-export-only'}));
