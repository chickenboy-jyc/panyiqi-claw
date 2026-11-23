import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTigerTurn } from '../src/tiger/engine.js';

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
    model,
    runDo: async ({ baseline }) => {
      assert.ok(baseline.versionId.startsWith('TIGER-'));
      return '已生成 src/stats.js';
    },
  });
  assert.equal(r.kind, 'delivered');
  assert.equal(r.status, 'delivered');
  assert.ok(r.baseline.versionId);
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
    model,
    runDo: async () => '偷偷装了 axios',
  });
  assert.equal(r.kind, 'blocked');
  assert.equal(r.reason, 'severe_drift');
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
