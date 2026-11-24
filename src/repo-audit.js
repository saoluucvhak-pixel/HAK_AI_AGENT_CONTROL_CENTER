import { DEFAULT_OWNER, parseRepoTarget, githubSnapshot } from './github.js';
import { githubSourceInspection } from './github-source-inspection.js';
import { findLatestSuccessfulCiRun } from './github-ci-run-verification.js';
import { githubPrEvidence } from './github-pr-evidence.js';
import { assessGithubPrEvidence } from './github-pr-assessment.js';
import { assertCodePolicy } from './code-policy-guard.js';
import { recommendSkillsForMission, loadSkills } from './skill-resolver.js';

export const DEFAULT_PATHS = Object.freeze([
  'README.md',
  'package.json',
  'app/package.json',
  'app/main/electron/main.js',
  'app/main/electron/preload.js'
]);

export async function auditRepository(repo, {
  ref = 'main',
  paths = DEFAULT_PATHS,
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN,
  owner = DEFAULT_OWNER,
  allowlistedRepos = [],
  maxBytes = 100000
} = {}) {
  const extraRepos = [repo, ...(Array.isArray(allowlistedRepos) ? allowlistedRepos : [])];
  const target = parseRepoTarget(repo, { owner, allowlistedRepos: extraRepos });

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'HAK-Operations-Dashboard'
  };
  if (token) headers.Authorization = 'Bearer ' + token;

  const findings = [];

  // 1. Snapshot
  const snapshot = await githubSnapshot(target.fullName, {
    fetchImpl,
    token,
    owner: target.owner,
    allowlistedRepos: extraRepos
  });

  // 2. Head commit resolution
  const refRes = await fetchImpl(
    `https://api.github.com/repos/${target.owner}/${target.repo}/git/ref/heads/${ref}`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  if (!refRes.ok) throw new Error(`Could not resolve ref ${ref}: HTTP ${refRes.status}`);
  const refJson = await refRes.json();
  const headSha = refJson?.object?.sha;
  if (!headSha || !/^[a-f0-9]{40}$/.test(headSha)) {
    throw new Error('Could not resolve 40-character commit SHA for ' + ref);
  }

  // 3. Check runs at head commit
  let checks = [];
  try {
    const checksRes = await fetchImpl(
      `https://api.github.com/repos/${target.owner}/${target.repo}/commits/${headSha}/check-runs?per_page=100`,
      { headers, signal: AbortSignal.timeout(10000) }
    );
    if (checksRes.ok) {
      const checksJson = await checksRes.json();
      checks = (checksJson.check_runs || []).map(c => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion
      }));
    }
  } catch (e) {
    findings.push({ severity: 'P2', code: 'checks-query-failed', message: 'Could not fetch check runs: ' + e.message });
  }

  // 4. Verified CI run (testing workflow, excluding release)
  let ciRun = null;
  try {
    ciRun = await findLatestSuccessfulCiRun(target.fullName, headSha, {
      fetchImpl,
      token,
      owner: target.owner,
      allowlistedRepos: extraRepos
    });
  } catch (err) {
    findings.push({
      severity: 'P1',
      code: 'ci-missing',
      message: `Chưa có CI test hoàn tất thành công cho commit ${headSha.slice(0, 7)}: ${err.message}`
    });
  }

  // 5. Open PRs assessment
  const pullRequests = [];
  for (const pr of (snapshot.prs || [])) {
    try {
      const evidence = await githubPrEvidence(target.fullName, pr.number, {
        fetchImpl,
        token,
        owner: target.owner,
        allowlistedRepos: extraRepos
      });
      const assessment = assessGithubPrEvidence(evidence);
      pullRequests.push({
        number: pr.number,
        title: pr.title,
        draft: pr.draft,
        assessment
      });
      if (assessment.status === 'ci-failed') {
        findings.push({
          severity: 'P2',
          code: 'pr-ci-failed',
          message: `PR #${pr.number} ("${pr.title}") có bài kiểm tra CI thất bại`
        });
      }
    } catch (e) {
      findings.push({
        severity: 'P3',
        code: 'pr-assessment-failed',
        message: `Không thể đánh giá PR #${pr.number}: ${e.message}`
      });
    }
  }

  // 6. Remote source inspection
  const inspectionPaths = Array.isArray(paths) && paths.length > 0 ? paths : DEFAULT_PATHS;
  const inspection = await githubSourceInspection(target.fullName, headSha, inspectionPaths, {
    fetchImpl,
    token,
    owner: target.owner,
    allowlistedRepos: extraRepos,
    maxBytes
  });

  const files = [];
  for (const file of inspection.files) {
    files.push({
      path: file.path,
      status: file.status,
      bytes: file.bytes,
      blobSha: file.blobSha
    });

    if (file.status === 'unsupported-or-too-large') {
      findings.push({
        severity: 'P3',
        code: 'file-too-large',
        path: file.path,
        message: `Tệp ${file.path} vượt quá dung lượng cho phép kiểm tra từ xa (${maxBytes} bytes)`
      });
    } else if (file.status === 'available') {
      try {
        assertCodePolicy([{ path: file.path, newContent: file.content, createNew: false }], {
          maxFiles: 1,
          maxTotalBytes: 120000
        });
      } catch (policyErr) {
        const isSecret = /secret|token|private key|password/i.test(policyErr.message);
        findings.push({
          severity: isSecret ? 'P0' : 'P2',
          code: isSecret ? 'secret-leak-detected' : 'code-policy-violation',
          path: file.path,
          message: policyErr.message
        });
      }
    }
  }

  // 7. Domain skill recommendation & loading
  const recommendedSkillNames = recommendSkillsForMission({
    type: 'audit',
    description: `Audit repository ${target.fullName}`,
    filePaths: inspectionPaths
  });
  const loadedSkills = await loadSkills(recommendedSkillNames, {
    localSkillsDir: '',
    token,
    owner: target.owner
  });
  const skills = loadedSkills.map(s => ({
    name: s.name,
    sha256: s.sha256,
    source: s.source
  }));

  return {
    schemaVersion: 1,
    kind: 'hak-repo-audit',
    repository: target.repo,
    owner: target.owner,
    ref,
    headSha,
    snapshot: {
      defaultBranch: snapshot.defaultBranch,
      openPullRequests: snapshot.openPullRequests,
      visibility: snapshot.visibility
    },
    checks,
    ciRun,
    pullRequests,
    files,
    findings,
    skills,
    readOnly: true,
    readyForProduction: findings.filter(f => f.severity === 'P0' || f.severity === 'P1').length === 0,
    generatedAt: new Date().toISOString()
  };
}

export function renderAuditMarkdown(report) {
  const p0p1 = report.findings.filter(f => f.severity === 'P0' || f.severity === 'P1');
  const statusBadge = p0p1.length === 0 ? '✅ ĐẠT TIÊU CHUẨN' : '⚠️ CẦN XỬ LÝ';

  let md = `# BÁO CÁO KIỂM TOÁN REPOSITORY: ${report.owner}/${report.repository}\n\n`;
  md += `- **Trạng thái:** **${statusBadge}**\n`;
  md += `- **Nhánh kiểm tra:** \`${report.ref}\` (Commit SHA: \`${report.headSha.slice(0, 7)}\`)\n`;
  md += `- **Thời điểm tạo:** ${report.generatedAt}\n`;
  md += `- **Số PR đang mở:** ${report.snapshot.openPullRequests}\n\n`;

  md += `## 1. Kết quả CI & Kiểm tra Tự động\n`;
  if (report.ciRun) {
    md += `- **Verified CI Run:** ${report.ciRun.name} (Run ID: \`${report.ciRun.runId}\`)\n`;
  } else {
    md += `- **Verified CI Run:** ❌ Không có bản chạy CI nào đạt chuẩn\n`;
  }
  if (report.checks.length > 0) {
    md += `\n| Check Name | Status | Conclusion |\n|---|---|---|\n`;
    for (const c of report.checks) {
      md += `| ${c.name} | ${c.status} | ${c.conclusion || '-'} |\n`;
    }
  } else {
    md += `\n*Không có check run nào được ghi nhận.*\n`;
  }

  md += `\n## 2. Thẩm định Tệp Mã Nguồn & An Toàn\n`;
  md += `| Đường dẫn tệp | Trạng thái | Kích thước (bytes) | Blob SHA |\n|---|---|---|---|\n`;
  for (const f of report.files) {
    md += `| \`${f.path}\` | ${f.status} | ${f.bytes ?? '-'} | ${f.blobSha ? f.blobSha.slice(0, 7) : '-'} |\n`;
  }

  md += `\n## 3. Vấn đề Phát hiện (Findings)\n`;
  if (report.findings.length === 0) {
    md += `*Không phát hiện vấn đề nào (0 vi phạm).*\n`;
  } else {
    md += `| Mức độ | Mã lỗi | Tệp liên quan | Chi tiết |\n|---|---|---|---|\n`;
    for (const item of report.findings) {
      md += `| **${item.severity}** | \`${item.code}\` | ${item.path ? `\`${item.path}\`` : '-'} | ${item.message} |\n`;
    }
  }

  md += `\n## 4. HAK Skills Tham chiếu Đối soát\n`;
  md += `| Tên Skill | Nguồn nạp | Mã băm SHA-256 |\n|---|---|---|\n`;
  for (const s of report.skills) {
    md += `| \`${s.name}\` | ${s.source} | \`${s.sha256.slice(0, 16)}...\` |\n`;
  }

  return md;
}
