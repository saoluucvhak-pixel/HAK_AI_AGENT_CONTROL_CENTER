import test from 'node:test';
import assert from 'node:assert/strict';
import {createGithubRemediationPlan} from '../src/github-remediation-plan.js';
const base={kind:'hak-github-ci-failure-report',repository:'HAK_AI_SKILLS',runId:12};
test('generates scoped action from a failed job',()=>{
 const r=createGithubRemediationPlan({...base,reports:[{jobId:7,classification:'network-port-permission',fileHints:['tests/runtime.test.js','../../secret.env']}]});
 assert.equal(r.items[0].category,'test-infrastructure');assert.deepEqual(r.items[0].fileHints,['tests/runtime.test.js']);assert.equal(r.patchGenerated,false);assert.equal(r.prCreated,false);
});
test('unknown classification fails closed',()=>assert.throws(()=>createGithubRemediationPlan({...base,reports:[{jobId:7,classification:'run-this-command'}]}),/Invalid job triage/));
test('unclassified log requires investigation',()=>{const r=createGithubRemediationPlan({...base,reports:[{jobId:2,classification:'unclassified'}]});assert.equal(r.items[0].category,'manual-investigation')});
test('empty failures do not invent changes',()=>{const r=createGithubRemediationPlan({...base,reports:[]});assert.equal(r.items.length,0);assert.equal(r.readyToMerge,false)});
