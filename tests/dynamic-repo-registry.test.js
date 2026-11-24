import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRepoRef,safeRepo,getAllowedRepositories} from '../src/github.js';
import {safeSourcePath} from '../src/github-source-inspection.js';

test('parseRepoRef resolves short names and allowlisted owner/repo refs',()=>{
 const a=parseRepoRef('HAK_OCR_ENGINE');
 assert.equal(a.fullName,'saoluucvhak-pixel/HAK_OCR_ENGINE');
 const b=parseRepoRef('vercel-labs/skills');
 assert.equal(b.owner,'vercel-labs');
 assert.equal(b.repo,'skills');
 assert.equal(safeRepo('saoluucvhak-pixel/HAK_AI_SKILLS'),'HAK_AI_SKILLS');
});

test('parseRepoRef supports HAK_ALLOWED_REPOS env and rejects unknown repos',()=>{
 const ref=parseRepoRef('custom-org/custom-repo',{env:{HAK_ALLOWED_REPOS:'custom-org/custom-repo'}});
 assert.equal(ref.fullName,'custom-org/custom-repo');
 assert.throws(()=>parseRepoRef('evil-org/unknown-repo'),/Repository not allowlisted/);
 assert.ok(getAllowedRepositories().some(r=>r.fullName==='vercel-labs/skills'));
});

test('safeSourcePath allows SKILL.md, package.json, README.md, web/config files and rejects traversal or workflows',()=>{
 assert.equal(safeSourcePath('skills/find-skills/SKILL.md'),'skills/find-skills/SKILL.md');
 assert.equal(safeSourcePath('package.json'),'package.json');
 assert.equal(safeSourcePath('README.md'),'README.md');
 assert.equal(safeSourcePath('web/app.js'),'web/app.js');
 assert.equal(safeSourcePath('config/repos.json'),'config/repos.json');
 assert.throws(()=>safeSourcePath('.github/workflows/operations-dashboard-ci.yml'),/Invalid source path/);
 assert.throws(()=>safeSourcePath('skills/../secrets/SKILL.md'),/Invalid source path/);
 assert.throws(()=>safeSourcePath('.env'),/Invalid source path/);
});
