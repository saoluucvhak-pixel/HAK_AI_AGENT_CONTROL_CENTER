import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backupObserver} from '../src/observer-backup.js';

test('backupObserver refuses to back up sensitive credential files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hak-backup-sec-'));
  try {
    const secretsFile = join(dir, 'secrets.json');
    const envFile = join(dir, '.env');
    await writeFile(secretsFile, '{"token":"secret"}', 'utf8');
    await writeFile(envFile, 'SECRET=123', 'utf8');

    await assert.rejects(
      () => backupObserver({ source: secretsFile, destination: join(dir, 'out1.jsonl') }),
      /sensitive credential file/,
    );
    await assert.rejects(
      () => backupObserver({ source: envFile, destination: join(dir, 'out2.jsonl') }),
      /sensitive credential file/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('server serves UI, operator session with fallbackReady, and runs jobs via internal-fallback when external runners are disabled', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevExec = process.env.HAK_AGENT_EXECUTION_ENABLED;
  const prevOrca = process.env.HAK_ORCA_EXECUTION_ENABLED;
  const prevRuflo = process.env.HAK_RUFLO_EXECUTION_ENABLED;
  const dir = await mkdtemp(join(tmpdir(), 'hak-srv-int-'));
  const prevOut = process.env.HAK_AGENT_OUTPUT_DIR;
  const prevEvents = process.env.HAK_EVENT_STORE_PATH;

  process.env.NODE_ENV = 'test';
  process.env.HAK_AGENT_EXECUTION_ENABLED = 'true';
  process.env.HAK_ORCA_EXECUTION_ENABLED = 'false';
  process.env.HAK_RUFLO_EXECUTION_ENABLED = 'false';
  process.env.HAK_AGENT_OUTPUT_DIR = join(dir, 'results');
  process.env.HAK_EVENT_STORE_PATH = join(dir, 'events.jsonl');

  const { server } = await import('../src/server.js?int=' + Date.now());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const htmlRes = await fetch(`${base}/`);
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.headers.get('content-security-policy') || '', /default-src 'none'/);
    const html = await htmlRes.text();
    assert.match(html, /HAK/);

    const appJsRes = await fetch(`${base}/app.js`);
    assert.equal(appJsRes.status, 200);
    assert.match(appJsRes.headers.get('content-type') || '', /text\/javascript/);

    const sessionRes = await fetch(`${base}/api/operator/session`);
    assert.equal(sessionRes.status, 200);
    const session = await sessionRes.json();
    assert.equal(session.enabled, true);
    assert.equal(session.orcaEnabled, false);
    assert.equal(session.rufloEnabled, false);
    assert.equal(session.fallbackReady, true);
    assert.ok(typeof session.token === 'string' && session.token.length >= 32);

    const jobRes = await fetch(`${base}/api/operator/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': base,
        'x-hak-operator-token': session.token,
      },
      body: JSON.stringify({
        title: 'Audit API fallback',
        description: 'Verify internal fallback when Orca and Ruflo are disabled',
        role: 'backend',
        confirm: true,
      }),
    });
    assert.equal(jobRes.status, 202);
    const created = await jobRes.json();
    assert.ok(created.id);

    let finished = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const listRes = await fetch(`${base}/api/operator/jobs`);
      const listJson = await listRes.json();
      const found = listJson.jobs.find((j) => j.id === created.id);
      if (found && found.status === 'completed') {
        finished = found;
        break;
      }
    }
    assert.ok(finished, 'Expected job to complete via internal-fallback');

    const resultRes = await fetch(`${base}/api/operator/results/${created.id}`, {
      headers: { 'x-hak-operator-token': session.token },
    });
    assert.equal(resultRes.status, 200);
    const resultJson = await resultRes.json();
    assert.match(resultJson.content, /internal-skill-guided-fallback/);

    const prepRes = await fetch(`${base}/api/workflow/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': base,
        'x-hak-operator-token': session.token,
      },
      body: JSON.stringify({
        targetRepo: 'saoluucvhak-pixel/HAK_LUONG_OFFLINE',
        workflowMode: 'accounting-audit',
        includeRemoteSkills: false,
      }),
    });
    assert.equal(prepRes.status, 200);
    const prepJson = await prepRes.json();
    assert.equal(prepJson.workflowMode, 'accounting-audit');
    assert.deepEqual(prepJson.recommendedRoles, ['data', 'testing', 'quality']);
    assert.match(prepJson.missionPrompt, /HAK_LUONG_OFFLINE/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevExec === undefined) delete process.env.HAK_AGENT_EXECUTION_ENABLED;
    else process.env.HAK_AGENT_EXECUTION_ENABLED = prevExec;
    if (prevOrca === undefined) delete process.env.HAK_ORCA_EXECUTION_ENABLED;
    else process.env.HAK_ORCA_EXECUTION_ENABLED = prevOrca;
    if (prevRuflo === undefined) delete process.env.HAK_RUFLO_EXECUTION_ENABLED;
    else process.env.HAK_RUFLO_EXECUTION_ENABLED = prevRuflo;
    if (prevOut === undefined) delete process.env.HAK_AGENT_OUTPUT_DIR;
    else process.env.HAK_AGENT_OUTPUT_DIR = prevOut;
    if (prevEvents === undefined) delete process.env.HAK_EVENT_STORE_PATH;
    else process.env.HAK_EVENT_STORE_PATH = prevEvents;
    await rm(dir, { recursive: true, force: true });
  }
});
