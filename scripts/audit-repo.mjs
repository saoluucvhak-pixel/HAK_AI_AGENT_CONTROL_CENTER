import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { auditRepository, renderAuditMarkdown } from '../src/repo-audit.js';

const targetRepo = process.argv[2];
if (!targetRepo || targetRepo.startsWith('--')) {
  console.error('Usage: node scripts/audit-repo.mjs <repo|owner/repo> [--ref <branch>] [--paths <p1,p2>] [--out <report.json>] [--md <report.md>] [--use-git-credential]');
  process.exit(2);
}

const args = process.argv.slice(3);
function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

const ref = getArg('--ref') || 'main';
const pathsRaw = getArg('--paths');
const paths = pathsRaw ? pathsRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
const outJson = getArg('--out');
const outMd = getArg('--md');
const useGitCred = args.includes('--use-git-credential');

function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const out = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 10000
    });
    const line = out.split(/\r?\n/).find(l => l.startsWith('password='));
    return line ? line.slice('password='.length).trim() : '';
  } catch {
    return '';
  }
}

const token = resolveToken();

try {
  const report = await auditRepository(targetRepo, {
    ref,
    paths,
    token,
    allowlistedRepos: [targetRepo]
  });

  const md = renderAuditMarkdown(report);
  if (outJson) writeFileSync(resolve(outJson), JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (outMd) writeFileSync(resolve(outMd), md, 'utf8');

  process.stdout.write(md + '\n');

  const hasCritical = report.findings.some(f => f.severity === 'P0' || f.severity === 'P1');
  if (hasCritical) {
    process.exitCode = 1;
  }
} catch (err) {
  console.error('Lỗi khi thực hiện audit repository:', err.message);
  process.exitCode = 1;
}
