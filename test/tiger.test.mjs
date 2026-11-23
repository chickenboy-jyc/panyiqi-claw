import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTigerTurn } from '../src/tiger/engine.js';
import { freezePending } from '../src/tiger/baseline.js';

function stateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tiger-test-'));
}

function proJson(action = 'propose') {
  return JSON.stringify({
    action,
    summary: '新增 src/stats.js，只读 JSON 并输出 count。',
    hard: { scope: ['只新增 src/stats.js'], forbidden: ['第三方依赖'] },
    soft: ['错误信息用中文'],
    answer: '好的，我在。',
  });
}

function checkJson(kind = 'ok') {
  if (kind === 'incomplete') {
    return JSON.stringify({ complete: false, completeIssues: ['没有可运行入口'], severe: [], minor: [], notes: '' });
  }
  if (kind === 'severe') {
    return JSON.stringify({ complete: true, completeIssues: [], severe: ['新增了禁止的依赖'], minor: [], notes: '' });
  }
  return JSON.stringify({ complete: true, completeIssues: [], severe: [], minor: ['变量名不同'], notes: '可交付' });
}

test('a new task becomes a pending proposal, not an execution', async () => {
  const dir = stateDir();
  const r = await runTigerTurn({
    messages: [{ role: 'user', content: '写一个统计 JSON 的工具' }],
    sessionId: 's1',
    stateDir: dir,
    model: async () => proJson('propose'),
    runDo: async () => { throw new Error('Do must not run before confirmation'); },
  });
  assert.equal(r.kind, 'proposal');
  assert.ok(r.pending.summary.includes('src/stats.js'));
  assert.equal(r.state.baseline, null);
});

test('confirmation freezes the baseline and runs Do + Check', async () => {
  const dir = stateDir();
  const model = async ({ role }) => (role === 'pro' ? proJson('propose') : checkJson('ok'));
  await runTigerTurn({
    messages: [{ role: 'user', content: '写一个统计 JSON 的工具' }],
    sessionId: 's2',
    stateDir: dir,
    model,
    runDo: async () => 'not yet',
  });
  const r = await runTigerTurn({
    messages: [{ role: 'user', content: '可以' }],
    sessionId: 's2',
    stateDir: dir,
    userId: '018',
    model,
    runDo: async ({ baseline }) => {
      assert.ok(baseline.versionId.startsWith('TIGER-'));
      return '已生成 src/stats.js';
    },
  });
  assert.equal(r.kind, 'delivered');
  assert.equal(r.status, 'delivered');
  assert.ok(r.baseline.versionId);
  assert.equal(r.baseline.confirmedBy, '018');
  assert.deepEqual(r.minor, ['变量名不同']);
});

test('incomplete Do output is blocked before drift diffing', async () => {
  const dir = stateDir();
  const model = async ({ role }) => (role === 'pro' ? proJson('propose') : checkJson('incomplete'));
  await runTigerTurn({
    messages: [{ role: 'user', content: '写一个统计 JSON 的工具' }],
    sessionId: 's3',
    stateDir: dir,
    model,
    runDo: async () => 'draft',
  });
  const r = await runTigerTurn({
    messages: [{ role: 'user', content: '可以' }],
    sessionId: 's3',
    stateDir: dir,
    userId: '018',
    model,
    runDo: async () => '只写了一半',
  });
  assert.equal(r.kind, 'blocked');
  assert.equal(r.reason, 'incomplete');
  assert.deepEqual(r.issues, ['没有可运行入口']);
});

test('severe drift is blocked even when output is usable', async () => {
  const dir = stateDir();
  const model = async ({ role }) => (role === 'pro' ? proJson('propose') : checkJson('severe'));
  await runTigerTurn({
    messages: [{ role: 'user', content: '写一个统计 JSON 的工具' }],
    sessionId: 's4',
    stateDir: dir,
    model,
    runDo: async () => 'draft',
  });
  const r = await runTigerTurn({
    messages: [{ role: 'user', content: '确认' }],
    sessionId: 's4',
    stateDir: dir,
    userId: '018',
    model,
    runDo: async () => '偷偷装了 axios',
  });
  assert.equal(r.kind, 'blocked');
  assert.equal(r.reason, 'severe_drift');
});

test('Check shape drift is blocked, not delivered', async () => {
  for (const raw of ['{}', JSON.stringify({ complete: true }), JSON.stringify({ complete: true, severe: '偷偷加了依赖' })]) {
    const dir = stateDir();
    const model = async ({ role }) => (role === 'pro' ? proJson('propose') : raw);
    await runTigerTurn({
      messages: [{ role: 'user', content: '写一个工具' }],
      sessionId: 'shape',
      stateDir: dir,
      model,
      runDo: async () => 'draft',
    });
    const r = await runTigerTurn({
      messages: [{ role: 'user', content: '可以' }],
      sessionId: 'shape',
      stateDir: dir,
      userId: '018',
      model,
      runDo: async () => 'done',
    });
    assert.equal(r.kind, 'blocked', raw);
    assert.equal(r.reason, 'check_invalid_shape', raw);
    assert.ok(Array.isArray(r.issues) && r.issues.length > 0, raw);
  }
});

test('machine gate shape drift is blocked', async () => {
  const dir = stateDir();
  const model = async ({ role }) => (role === 'pro' ? proJson('propose') : checkJson('ok'));
  await runTigerTurn({
    messages: [{ role: 'user', content: '写一个工具' }],
    sessionId: 'mg',
    stateDir: dir,
    model,
    runDo: async () => 'draft',
  });
  const r = await runTigerTurn({
    messages: [{ role: 'user', content: '可以' }],
    sessionId: 'mg',
    stateDir: dir,
    userId: '018',
    model,
    runDo: async () => 'done',
    machineGate: async () => ({}),
  });
  assert.equal(r.kind, 'blocked');
  assert.equal(r.reason, 'machine_gate_invalid');
});

test('complete=false wins over a failing machine gate', async () => {
  const dir = stateDir();
  const model = async ({ role }) => (role === 'pro' ? proJson('propose') : checkJson('incomplete'));
  await runTigerTurn({
    messages: [{ role: 'user', content: '写一个工具' }],
    sessionId: 'order',
    stateDir: dir,
    model,
    runDo: async () => 'draft',
  });
  const r = await runTigerTurn({
    messages: [{ role: 'user', content: '可以' }],
    sessionId: 'order',
    stateDir: dir,
    userId: '018',
    model,
    runDo: async () => '只写了一半',
    machineGate: async () => ({ ok: false, failures: ['also bad'] }),
  });
  assert.equal(r.reason, 'incomplete');
});

test('artifacts reach machineGate, Check, and the result', async () => {
  const dir = stateDir();
  let checkPrompt = '';
  let seen = null;
  const artifacts = [{ path: 'out.txt', bytes: 12 }];
  const model = async ({ role, user }) => {
    if (role === 'pro') return proJson('propose');
    checkPrompt = user;
    return checkJson('ok');
  };
  await runTigerTurn({
    messages: [{ role: 'user', content: '写一个工具' }],
    sessionId: 'art',
    stateDir: dir,
    model,
    runDo: async () => 'draft',
  });
  const r = await runTigerTurn({
    messages: [{ role: 'user', content: '可以' }],
    sessionId: 'art',
    stateDir: dir,
    userId: '018',
    model,
    runDo: async () => ({ text: 'done', artifacts }),
    machineGate: async ({ artifacts: got }) => {
      seen = got;
      return { ok: true, summary: 'artifacts present' };
    },
  });
  assert.deepEqual(seen, artifacts);
  assert.deepEqual(r.artifacts, artifacts);
  assert.match(checkPrompt, /out\.txt/);
});

test('the previous baseline is retained in history', async () => {
  const dir = stateDir();
  const model = async ({ role }) => (role === 'pro' ? proJson('propose') : checkJson('ok'));
  await runTigerTurn({
    messages: [{ role: 'user', content: '写一个工具' }],
    sessionId: 'hist',
    stateDir: dir,
    model,
    runDo: async () => 'draft',
  });
  const first = await runTigerTurn({
    messages: [{ role: 'user', content: '可以' }],
    sessionId: 'hist',
    stateDir: dir,
    userId: '018',
    model,
    runDo: async () => 'v1 done',
  });
  await runTigerTurn({
    messages: [{ role: 'user', content: '再写一个工具' }],
    sessionId: 'hist',
    stateDir: dir,
    model,
    runDo: async () => 'draft',
  });
  const second = await runTigerTurn({
    messages: [{ role: 'user', content: '可以' }],
    sessionId: 'hist',
    stateDir: dir,
    userId: '018',
    model,
    runDo: async () => 'v2 done',
  });
  assert.equal(second.state.history.length, 1);
  assert.equal(second.state.history[0].versionId, first.baseline.versionId);
});

test('confirmation without a human userId is rejected and keeps pending', async () => {
  const dir = stateDir();
  const model = async ({ role }) => (role === 'pro' ? proJson('propose') : checkJson('ok'));
  await runTigerTurn({
    messages: [{ role: 'user', content: '写一个工具' }],
    sessionId: 'no-user',
    stateDir: dir,
    model,
    runDo: async () => 'draft',
  });
  const r = await runTigerTurn({
    messages: [{ role: 'user', content: '可以' }],
    sessionId: 'no-user',
    stateDir: dir,
    model,
    runDo: async () => { throw new Error('Must not run without human confirmation'); },
  });
  assert.equal(r.kind, 'error');
  assert.match(r.error, /human userId/);
  assert.ok(r.state.pending);
});

test('a baseline cannot be frozen without a human approver', () => {
  const state = { pending: { summary: 'x', hard: {}, soft: [], request: 'x' }, version: 0, baseline: null };
  assert.throws(() => freezePending(state, { sessionId: 's' }, null, ''), /human approver/);
  const baseline = freezePending(state, { sessionId: 's' }, null, '018');
  assert.equal(baseline.confirmedBy, '018');
});

test('a question is answered directly and does not create a pending task', async () => {
  const dir = stateDir();
  const r = await runTigerTurn({
    messages: [{ role: 'user', content: '你是谁' }],
    sessionId: 's5',
    stateDir: dir,
    model: async () => proJson('answer'),
    runDo: async () => { throw new Error('should not run'); },
  });
  assert.equal(r.kind, 'answer');
  assert.equal(r.text, '好的，我在。');
  assert.equal(r.state.pending, null);
});
