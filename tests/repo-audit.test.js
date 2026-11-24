import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRepository, renderAuditMarkdown } from '../src/repo-audit.js';

test('auditRepository: healthy repo produces clean audit report with zero P0/P1 findings', async () => {
  const mockFetch = async (url) => {
    if (url.includes('/git/ref/heads/main')) {
      return {
        ok: true,
        json: async () => ({ object: { sha: 'a'.repeat(40) } })
      };
    }
    if (url.includes('/actions/runs?head_sha=')) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            { id: 101, name: 'Release (Windows)', head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success' },
            { id: 102, name: 'CI', head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success' }
          ]
        })
      };
    }
    if (url.includes('/commits/') && url.includes('/check-runs')) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [
            { name: 'test', status: 'completed', conclusion: 'success' }
          ]
        })
      };
    }
    if (url.includes('/contents/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          encoding: 'base64',
          size: 20,
          sha: 'b'.repeat(40),
          content: Buffer.from('# Clean readme').toString('base64')
        })
      };
    }
    if (url.includes('/pulls?state=open')) {
      return { ok: true, json: async () => [] };
    }
    if (url.endsWith('/HAK_VC_NB')) {
      return { ok: true, json: async () => ({ default_branch: 'main', private: false }) };
    }
    if (url.includes('/actions/runs?per_page=10')) {
      return { ok: true, json: async () => ({ workflow_runs: [] }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  const report = await auditRepository('saoluucvhak-pixel/HAK_VC_NB', {
    fetchImpl: mockFetch,
    allowlistedRepos: ['HAK_VC_NB'],
    paths: ['README.md']
  });

  assert.equal(report.repository, 'HAK_VC_NB');
  assert.equal(report.headSha, 'a'.repeat(40));
  assert.equal(report.ciRun?.runId, 102); // Must pick 'CI', not 'Release (Windows)'
  assert.equal(report.readyForProduction, true);
  assert.equal(report.findings.filter(f => f.severity === 'P0' || f.severity === 'P1').length, 0);

  // Files must not contain full content in output report object
  assert.equal(report.files[0].content, undefined);
  assert.equal(report.files[0].blobSha, 'b'.repeat(40));

  const md = renderAuditMarkdown(report);
  assert.match(md, /ĐẠT TIÊU CHUẨN/);
});

test('auditRepository: flags P1 finding when only Release runs exist and no test CI run', async () => {
  const mockFetch = async (url) => {
    if (url.includes('/git/ref/heads/main')) {
      return { ok: true, json: async () => ({ object: { sha: 'c'.repeat(40) } }) };
    }
    if (url.includes('/actions/runs?head_sha=')) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            { id: 201, name: 'Release (Windows)', head_sha: 'c'.repeat(40), status: 'completed', conclusion: 'success' }
          ]
        })
      };
    }
    if (url.includes('/contents/')) {
      return { ok: true, json: async () => ({ type: 'file', encoding: 'base64', size: 10, sha: 'd'.repeat(40), content: Buffer.from('hello').toString('base64') }) };
    }
    if (url.includes('/pulls?state=open')) return { ok: true, json: async () => [] };
    if (url.includes('/check-runs')) return { ok: true, json: async () => ({ check_runs: [] }) };
    if (url.includes('/actions/runs?per_page=10')) return { ok: true, json: async () => ({ workflow_runs: [] }) };
    return { ok: true, json: async () => ({ default_branch: 'main', private: false }) };
  };

  const report = await auditRepository('saoluucvhak-pixel/HAK_VC_NB', {
    fetchImpl: mockFetch,
    allowlistedRepos: ['HAK_VC_NB'],
    paths: ['README.md']
  });

  const p1 = report.findings.find(f => f.code === 'ci-missing');
  assert.ok(p1, 'Expected ci-missing P1 finding');
  assert.equal(p1.severity, 'P1');
  assert.equal(report.readyForProduction, false);
});

test('auditRepository: flags P0 finding when remote source file contains secret leak', async () => {
  const mockFetch = async (url) => {
    if (url.includes('/git/ref/heads/main')) {
      return { ok: true, json: async () => ({ object: { sha: 'e'.repeat(40) } }) };
    }
    if (url.includes('/actions/runs?head_sha=')) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            { id: 301, name: 'CI', head_sha: 'e'.repeat(40), status: 'completed', conclusion: 'success' }
          ]
        })
      };
    }
    if (url.includes('/contents/')) {
      const leakedToken = 'ghp_' + 'x'.repeat(36);
      return {
        ok: true,
        json: async () => ({
          type: 'file',
          encoding: 'base64',
          size: leakedToken.length,
          sha: 'f'.repeat(40),
          content: Buffer.from(`const token = "${leakedToken}";`).toString('base64')
        })
      };
    }
    if (url.includes('/pulls?state=open')) return { ok: true, json: async () => [] };
    if (url.includes('/check-runs')) return { ok: true, json: async () => ({ check_runs: [] }) };
    if (url.includes('/actions/runs?per_page=10')) return { ok: true, json: async () => ({ workflow_runs: [] }) };
    return { ok: true, json: async () => ({ default_branch: 'main', private: false }) };
  };

  const report = await auditRepository('saoluucvhak-pixel/HAK_VC_NB', {
    fetchImpl: mockFetch,
    allowlistedRepos: ['HAK_VC_NB'],
    paths: ['app/main/electron/main.js']
  });

  const p0 = report.findings.find(f => f.code === 'secret-leak-detected');
  assert.ok(p0, 'Expected secret-leak-detected P0 finding');
  assert.equal(p0.severity, 'P0');
  assert.equal(report.readyForProduction, false);
});
