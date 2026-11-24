import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runOrchestratedMission} from '../src/orchestrator.js';
import {executeApprovedWorkOrder} from '../src/agent-engine.js';

function makeLocalSkills() {
 const dir = mkdtempSync(join(tmpdir(), 'hak-orch-skills-'));
 const defs = [
  ['hak-code-auditor', 'Audit HAK repositories with P0/P1/P2 severity classification and executable regression verification.'],
  ['hak-data-integrity', 'Verify backup, restore, schema constraints and store durability across HAK applications.'],
  ['hak-accounting-report', 'Enforce Vietnamese accounting number/date formatting and accurate Excel/PDF column headers.']
 ];
 for (const [name, desc] of defs) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n\nMandatory rules for ${name}.\n`, 'utf8');
 }
 return dir;
}

const baseSha = '1'.repeat(40);
const existingBlobSha = '2'.repeat(40);
const treeSha = '3'.repeat(40);
const newCommitSha = '4'.repeat(40);

function createMockGithub({ existingPath = 'app/main/services/BackupService.js', newFileAlreadyExists = false } = {}) {
 const calls = [];
 const fetchImpl = async (url, opts = {}) => {
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url, method, body });

  if (url.includes('/actions/runs?head_sha=')) {
   return { ok: true, status: 200, json: async () => ({ workflow_runs: [{ id: 99, name: 'CI', head_sha: baseSha, status: 'completed', conclusion: 'success', html_url: 'https://github.com/example/runs/99' }] }) };
  }
  if (url.includes('/actions/runs/99')) {
   return { ok: true, status: 200, json: async () => ({ id: 99, head_sha: baseSha, status: 'completed', conclusion: 'success' }) };
  }
  if (url.endsWith('/repos/saoluucvhak-pixel/HAK_VC_NB')) {
   return { ok: true, status: 200, json: async () => ({ full_name: 'saoluucvhak-pixel/HAK_VC_NB', default_branch: 'main', archived: false, disabled: false }) };
  }
  if (url.includes('/git/ref/heads/main')) {
   return { ok: true, status: 200, json: async () => ({ object: { sha: baseSha } }) };
  }
  if (url.includes('/git/ref/heads/hak-fix/')) {
   return { ok: true, status: 200, json: async () => ({ object: { sha: newCommitSha } }) };
  }
  if (url.includes('/contents/')) {
   if (url.includes(existingPath)) {
    return { ok: true, status: 200, json: async () => ({ type: 'file', encoding: 'base64', size: 12, sha: existingBlobSha, content: Buffer.from('old content\n').toString('base64') }) };
   }
   if (newFileAlreadyExists) {
    return { ok: true, status: 200, json: async () => ({ type: 'file', encoding: 'base64', size: 4, sha: existingBlobSha, content: Buffer.from('boom').toString('base64') }) };
   }
   return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
  }
  if (url.includes('/git/commits/') && method === 'GET') {
   return { ok: true, status: 200, json: async () => ({ tree: { sha: treeSha } }) };
  }
  if (url.includes('/git/trees/') && method === 'GET') {
   return { ok: true, status: 200, json: async () => ({ truncated: false, tree: [{ path: existingPath, type: 'blob', mode: '100644', sha: existingBlobSha }] }) };
  }
  if (url.endsWith('/git/trees') && method === 'POST') {
   return { ok: true, status: 201, json: async () => ({ sha: treeSha }) };
  }
  if (url.endsWith('/git/commits') && method === 'POST') {
   return { ok: true, status: 201, json: async () => ({ sha: newCommitSha }) };
  }
  if (url.endsWith('/git/refs') && method === 'POST') {
   return { ok: true, status: 201, json: async () => ({ ref: body.ref }) };
  }
  if (url.endsWith('/pulls') && method === 'POST') {
   return { ok: true, status: 201, json: async () => ({ number: 61, html_url: 'https://github.com/saoluucvhak-pixel/HAK_VC_NB/pull/61' }) };
  }
  throw new Error('Unhandled mock URL: ' + method + ' ' + url);
 };
 return { calls, fetchImpl };
}

test('orchestrates skill loading, test verification, existing + new file patch, and opens Draft PR on target repo', async () => {
 const skillsDir = makeLocalSkills();
 try {
  const gh = createMockGithub();
  const events = [];
  const report = await runOrchestratedMission(
   {
    id: 'VCNB_FIX_194',
    targetRepo: 'saoluucvhak-pixel/HAK_VC_NB',
    branch: 'hak-fix/vcnb-backup-and-uom',
    title: 'Fix subcontract backup and Excel BKVC UOM header',
    description: 'Include subcontract directory in BackupService zip and dynamic m3 header in xlsxExport',
    rationale: 'Ensure subcontract batches survive backup/restore and BKVC Excel header matches m3 UOM',
    skills: ['hak-code-auditor', 'hak-data-integrity', 'hak-accounting-report'],
    acceptanceCriteria: ['Backup & restore preserves subcontract batches', 'All unit tests pass'],
    changes: [
     { path: 'app/main/services/BackupService.js', newContent: '// updated BackupService\n' },
     { path: 'app/tests/backup.subcontract.test.js', createNew: true, newContent: '// new regression test\n' }
    ]
   },
   {
    localSkillsDir: skillsDir,
    fetchImpl: gh.fetchImpl,
    token: 'ghs_test_token',
    publishDraftPr: true,
    authorized: true,
    onEvent: async (ev) => events.push(ev),
    verifyChanges: async ({ skills, changes }) => {
     assert.ok(skills.some((s) => s.name === 'hak-data-integrity'));
     assert.equal(changes.length, 2);
     return { passed: true, summary: '390/390 unit tests passed; verify-seed 100% matched' };
    }
   }
  );

  assert.equal(report.draftPrPublished, true);
  assert.equal(report.publication.prNumber, 61);
  assert.equal(report.publication.draft, true);
  assert.equal(report.readyToMerge, false);
  assert.equal(report.loadedSkills.length, 3);
  assert.equal(report.skillObservations.length, 3);

  const prPost = gh.calls.find((c) => c.url.endsWith('/pulls') && c.method === 'POST');
  assert.equal(prPost.body.draft, true);
  assert.match(prPost.body.body, /hak-data-integrity/);
  assert.match(prPost.body.body, /390\/390 unit tests passed/);

  const treePost = gh.calls.find((c) => c.url.endsWith('/git/trees') && c.method === 'POST');
  assert.equal(treePost.body.tree.length, 2);
 } finally {
  rmSync(skillsDir, { recursive: true, force: true });
 }
});

test('fails closed with zero GitHub writes when local verification test suite fails', async () => {
 const skillsDir = makeLocalSkills();
 try {
  const gh = createMockGithub();
  await assert.rejects(
   () =>
    runOrchestratedMission(
     {
      id: 'VCNB_FAIL_VERIFY',
      targetRepo: 'HAK_VC_NB',
      branch: 'hak-fix/should-not-publish',
      title: 'Broken patch',
      description: 'Test verification gate blocks broken code',
      rationale: 'Must never open PR when unit tests fail',
      skills: ['hak-code-auditor'],
      acceptanceCriteria: ['Tests pass'],
      changes: [{ path: 'app/main/services/BackupService.js', newContent: 'broken()' }]
     },
     {
      localSkillsDir: skillsDir,
      fetchImpl: gh.fetchImpl,
      token: 'ghs_test_token',
      publishDraftPr: true,
      authorized: true,
      verifyChanges: async () => ({ passed: false, summary: '1 unit test failed' })
     }
    ),
   /Verification suite did not pass/
  );
  assert.equal(gh.calls.some((c) => c.method !== 'GET'), false);
 } finally {
  rmSync(skillsDir, { recursive: true, force: true });
 }
});

test('agent-engine injects loaded HAK skill definitions into step prompt and records skill sha256', async () => {
 const prompts = [];
 const res = await executeApprovedWorkOrder({
  workOrder: {
   id: 'WO_SKILL_1',
   projectId: 'HAK_VC_NB',
   title: 'Audit backup durability',
   description: 'Inspect subcontract backup behavior',
   acceptanceCriteria: ['Report P1 gap']
  },
  roles: ['security'],
  loadedSkills: [{ name: 'hak-data-integrity', description: 'Storage integrity rules', body: 'Check zip entries', sha256: 'f'.repeat(64) }],
  approval: { approved: true, workOrderId: 'WO_SKILL_1', approvedBy: 'operator1', reason: 'Approved audit' },
  env: { HAK_AGENT_EXECUTION_ENABLED: 'true', HAK_OMNIROUTE_ENABLED: 'true' },
  verifyApproval: async () => true,
  saveOutput: async () => true,
  modelRunner: async (task) => {
   prompts.push(task.prompt);
   return { answer: 'Audit draft ok', model: 'mock' };
  }
 });
 assert.equal(res.completed, true);
 assert.match(prompts[0], /Mandatory HAK Skills:/);
 assert.match(prompts[0], /hak-data-integrity/);
 assert.equal(res.appliedSkills[0].name, 'hak-data-integrity');
});
