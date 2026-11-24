import test from 'node:test';
import assert from 'node:assert/strict';
import {
  probeBeacon,
  queryBeaconMemory,
  executeWithExternalFallback,
} from '../src/tool-runner.js';

test('probeBeacon returns disabled when enabled=false', () => {
  const res = probeBeacon({ enabled: false });
  assert.equal(res.status, 'disabled');
  assert.equal(res.connected, false);
});

test('probeBeacon returns reachable when beacon CLI responds with ready=true', () => {
  const res = probeBeacon({
    enabled: true,
    run: () => ({ status: 0, stdout: '{"ready":true}', stderr: '' }),
  });
  assert.equal(res.status, 'reachable');
  assert.equal(res.connected, true);
});

test('probeBeacon returns unavailable when beacon CLI fails', () => {
  const res = probeBeacon({
    enabled: true,
    run: () => ({ status: 1, error: new Error('ENOENT') }),
  });
  assert.equal(res.status, 'unavailable');
  assert.equal(res.connected, false);
});

test('queryBeaconMemory handles disabled, enabled, and unavailable states cleanly', () => {
  const disabled = queryBeaconMemory({ query: 'auth fix', enabled: false });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.status, 'disabled');
  assert.deepEqual(disabled.memories, []);

  const enabled = queryBeaconMemory({
    query: 'auth fix',
    repo: 'owner/repo',
    enabled: true,
    run: () => ({
      status: 0,
      stdout: JSON.stringify([{ id: 'm1', summary: 'Fixed token refresh' }]),
      stderr: '',
    }),
  });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.status, 'available');
  assert.equal(enabled.memories.length, 1);

  const unavailable = queryBeaconMemory({
    query: 'auth fix',
    enabled: true,
    run: () => ({ status: 1, stdout: '', stderr: 'not found' }),
  });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.status, 'unavailable');
  assert.deepEqual(unavailable.memories, []);
});

test('executeWithExternalFallback uses Orca when reachable and falls back to internal-fallback when disabled or failing', () => {
  const reachable = executeWithExternalFallback({
    prompt: 'Implement login fix',
    role: 'backend',
    targetRepo: 'owner/repo',
    skills: [{ name: 'systematic-debugging' }],
    orcaEnabled: true,
    confirm: true,
    run: () => ({ status: 0, stdout: JSON.stringify({ sessionId: 'orca-sess-1' }), stderr: '' }),
  });
  assert.equal(reachable.fallbackUsed, false);
  assert.equal(reachable.runner, 'orca');
  assert.match(reachable.answer, /orca-sess-1/);

  const disabled = executeWithExternalFallback({
    prompt: 'Implement login fix',
    role: 'backend',
    targetRepo: 'owner/repo',
    skills: ['systematic-debugging'],
    orcaEnabled: false,
    confirm: true,
  });
  assert.equal(disabled.fallbackUsed, true);
  assert.equal(disabled.runner, 'internal-fallback');
  assert.ok(disabled.answer.length > 0);

  const failed = executeWithExternalFallback({
    prompt: 'Implement login fix',
    role: 'backend',
    targetRepo: 'owner/repo',
    skills: ['systematic-debugging'],
    orcaEnabled: true,
    confirm: true,
    run: () => ({ status: 1, stdout: '', stderr: 'orca crashed', error: new Error('spawn ENOENT') }),
  });
  assert.equal(failed.fallbackUsed, true);
  assert.equal(failed.runner, 'internal-fallback');
  assert.ok(failed.answer.length > 0);
});
