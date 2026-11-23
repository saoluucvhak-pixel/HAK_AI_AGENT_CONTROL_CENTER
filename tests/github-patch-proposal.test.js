import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGithubPatchProposal} from '../src/github-patch-proposal.js';
const sha='a'.repeat(40),blob='b'.repeat(40);
const base={repository:'HAK_AI_SKILLS',runId:1,baseSha:sha,rationale:'Fix deterministic assertion failure in CI',changes:[{path:'tests/example.test.js',expectedBlobSha:blob,newContent:'assert.ok(true);'}]};
test('valid proposal is explicitly not authorized for writes',()=>{const r=validateGithubPatchProposal(base);assert.equal(r.writeAuthorized,false);assert.equal(r.prCreated,false);assert.equal(r.requiresCi,true)});
test('rejects path traversal and missing blob precondition',()=>{assert.throws(()=>validateGithubPatchProposal({...base,changes:[{...base.changes[0],path:'src/../secret.js'}]}));assert.throws(()=>validateGithubPatchProposal({...base,changes:[{...base.changes[0],expectedBlobSha:'main'}]}))});
test('rejects duplicate and oversized changes',()=>{assert.throws(()=>validateGithubPatchProposal({...base,changes:[base.changes[0],base.changes[0]]}),/Duplicate/);assert.throws(()=>validateGithubPatchProposal({...base,changes:[{...base.changes[0],newContent:'x'.repeat(20001)}]}),/oversized/)});
test('rejects missing justification and mutable base',()=>{assert.throws(()=>validateGithubPatchProposal({...base,rationale:'short'}));assert.throws(()=>validateGithubPatchProposal({...base,baseSha:'main'}))});
