import test from 'node:test';
import assert from 'node:assert/strict';
import {assessGithubPrEvidence} from '../src/github-pr-assessment.js';
const base={kind:'hak-github-pr-ci-evidence',repository:'HAK_AI_SKILLS',prNumber:2,headSha:'a'.repeat(40),prState:'open',draft:false,commitListTruncated:false};
const check=(conclusion,status='completed')=>({name:'CI',status,conclusion});
test('green CI still needs review',()=>{const x=assessGithubPrEvidence({...base,checks:[check('success')]});assert.equal(x.status,'ci-passed');assert.equal(x.readyToMerge,false)});
test('failed CI gives actionable steps',()=>{const x=assessGithubPrEvidence({...base,checks:[check('failure')]});assert.equal(x.status,'ci-failed');assert.equal(x.failures[0],'CI')});
test('missing and pending are not success',()=>{assert.equal(assessGithubPrEvidence({...base,checks:[]}).status,'ci-missing');assert.equal(assessGithubPrEvidence({...base,checks:[check(null,'in_progress')]}).status,'ci-pending')});
test('neutral is inconclusive and draft is warned',()=>{const x=assessGithubPrEvidence({...base,draft:true,checks:[check('neutral')]});assert.equal(x.status,'ci-inconclusive');assert.ok(x.warnings.some(w=>w.includes('draft')))});
