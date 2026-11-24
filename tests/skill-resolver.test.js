import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
 safeSkillName,
 parseSkillMarkdown,
 recommendSkillsForMission,
 loadSkillDefinition,
 loadSkills,
 listLocalSkillCatalog,
 buildSkillObservations,
 formatSkillsForPrompt
} from '../src/skill-resolver.js';

const sampleSkill = `---
name: hak-data-integrity
description: Enforce HAK storage durability, backup completeness and restore verification across JSON and SQLite stores.
---

# HAK Data Integrity
- Verify backup archives include all auxiliary directories.
- Re-verify restored state before marking pass.
`;

test('validates HAK skill identifiers and rejects path traversal', () => {
 assert.equal(safeSkillName('hak-data-integrity'), 'hak-data-integrity');
 assert.equal(safeSkillName('archify'), 'archify');
 for (const invalid of ['../secret', 'hak_bad', 'OTHER', 'hak-a', '']) {
  assert.throws(() => safeSkillName(invalid), /Invalid HAK skill/);
 }
});

test('parses valid SKILL.md frontmatter and computes sha256', () => {
 const parsed = parseSkillMarkdown('hak-data-integrity', sampleSkill);
 assert.equal(parsed.name, 'hak-data-integrity');
 assert.equal(parsed.sha256.length, 64);
 assert.match(parsed.body, /Verify backup archives/);
 assert.throws(() => parseSkillMarkdown('hak-code-auditor', sampleSkill), /name mismatch/);
 assert.throws(() => parseSkillMarkdown('hak-data-integrity', '# Missing frontmatter'), /frontmatter/);
});

test('recommends domain-appropriate HAK skills for mission', () => {
 const skills = recommendSkillsForMission({
  type: 'bug',
  description: 'Fix BackupService subcontract zip backup and xlsxExport BKVC UOM column',
  filePaths: ['app/main/services/BackupService.js', 'app/main/reports/xlsxExport.js', 'README.md']
 });
 assert.ok(skills.includes('hak-code-auditor'));
 assert.ok(skills.includes('hak-data-integrity'));
 assert.ok(skills.includes('hak-accounting-report'));
 assert.ok(skills.includes('hak-release-builder'));
 assert.ok(skills.includes('hak-vercel-writing'));
});

test('loads skills from local catalog and GitHub API catalog and builds pending observations', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'hak-skills-test-'));
 try {
  mkdirSync(join(dir, 'hak-data-integrity'), { recursive: true });
  writeFileSync(join(dir, 'hak-data-integrity', 'SKILL.md'), sampleSkill, 'utf8');
  const catalog = listLocalSkillCatalog(dir);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].name, 'hak-data-integrity');

  const localLoaded = await loadSkills(['hak-data-integrity'], { localSkillsDir: dir });
  assert.equal(localLoaded[0].source, 'local-skill-catalog');

  const ghLoaded = await loadSkillDefinition('hak-data-integrity', {
   token: '',
   fetchImpl: async () => ({
    ok: true,
    status: 200,
    json: async () => ({
     type: 'file',
     encoding: 'base64',
     sha: 'a'.repeat(40),
     content: Buffer.from(sampleSkill, 'utf8').toString('base64')
    })
   })
  });
  assert.equal(ghLoaded.source, 'github-skill-catalog');
  assert.equal(ghLoaded.sha256, localLoaded[0].sha256);

  const obs = buildSkillObservations(localLoaded, 'Missing subcontract backup', 'Include subcontract directory in zip');
  assert.equal(obs.length, 1);
  assert.equal(obs[0].approval, 'pending');
  assert.match(formatSkillsForPrompt(localLoaded), /### Skill: hak-data-integrity/);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});
