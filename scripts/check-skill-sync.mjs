import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const normalize = text => (typeof text === 'string' ? text.replace(/\r\n/g, '\n').trim() : '');
const sha256 = text => createHash('sha256').update(normalize(text), 'utf8').digest('hex');

const args = process.argv.slice(2);
const localDirIdx = args.indexOf('--local');
const localDir = localDirIdx >= 0 ? args[localDirIdx + 1] : null;
const refIdx = args.indexOf('--ref');
const ref = refIdx >= 0 ? args[refIdx + 1] : 'main';
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
const embeddedSkillsDir = resolve(fileURLToPath(new URL('../skills', import.meta.url)));

const dirs = readdirSync(embeddedSkillsDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(embeddedSkillsDir, d.name, 'SKILL.md')))
  .map(d => d.name)
  .sort();

console.log(`Đang kiểm tra đồng bộ ${dirs.length} skills nhúng...`);
console.log(`Nguồn đối chiếu: ${localDir ? `Thư mục cục bộ (${localDir})` : `GitHub API (HAK_AI_SKILLS @ ${ref})`}\n`);

let drifts = 0;
let matches = 0;
let missing = 0;

for (const name of dirs) {
  const localFile = join(embeddedSkillsDir, name, 'SKILL.md');
  const localContent = readFileSync(localFile, 'utf8');
  const localHash = sha256(localContent);

  let targetContent = null;
  if (localDir) {
    let p = join(resolve(localDir), 'skills', name, 'SKILL.md');
    if (!existsSync(p)) p = join(resolve(localDir), name, 'SKILL.md');
    if (existsSync(p)) {
      targetContent = readFileSync(p, 'utf8');
    }
  } else {
    try {
      const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'HAK-Inspector' };
      if (token) headers.Authorization = 'Bearer ' + token;
      const url = `https://api.github.com/repos/saoluucvhak-pixel/HAK_AI_SKILLS/contents/skills/${name}/SKILL.md?ref=${ref}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const json = await res.json();
        targetContent = Buffer.from(json.content.replace(/\s/g, ''), 'base64').toString('utf8');
      } else {
        console.error(`Fetch failed for ${name}: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`Fetch error for ${name}: ${err.message}`);
    }
  }

  if (targetContent === null) {
    console.log(`- ❓ [${name}]: Không tìm thấy ở upstream (MISSING)`);
    missing++;
  } else {
    const targetHash = sha256(targetContent);
    if (localHash === targetHash) {
      console.log(`- ✅ [${name}]: Khớp 100% (SHA-256: ${localHash.slice(0, 10)}...)`);
      matches++;
    } else {
      console.log(`- ⚠️ [${name}]: Có sự khác biệt (DRIFT)`);
      console.log(`     Local SHA:    ${localHash}`);
      console.log(`     Upstream SHA: ${targetHash}`);
      drifts++;
    }
  }
}

console.log(`\nKết quả kiểm tra: Khớp: ${matches} | Lệch (Drift): ${drifts} | Chưa có trên upstream: ${missing}`);
if (drifts > 0 || missing > 0) {
  process.exitCode = 1;
}
