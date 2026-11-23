/**
 * Offline demo: no model, no network, no filesystem writes.
 * Run: node src/tiger/demo.js
 */
import os from 'node:os';
import path from 'node:path';
import { runTigerTurn } from './engine.js';

const stateDir = path.join(os.tmpdir(), 'panyiqi-claw-agent-demo');

/** A tiny stand-in for a real model. The JSON is what Pro/Check must return. */
async function fakeModel({ role, user }) {
  if (role === 'pro') {
    if (user.includes('写')) {
      return JSON.stringify({
        action: 'propose',
        summary: '写一个 CLI 小工具：读取 JSON，输出统计结果；不改动其他文件。',
        hard: {
          params: ['输入：JSON 文件路径'],
          fields: ['输出：count / keys'],
          interfaces: ['CLI: node stats.js <file>'],
          scope: ['只新增 src/stats.js'],
          forbidden: ['不引第三方依赖'],
        },
        soft: ['输出用中文', '错误信息要能看懂'],
        answer: '',
      });
    }
    return JSON.stringify({ action: 'answer', summary: '', hard: {}, soft: [], answer: '好的，我在。' });
  }
  if (role === 'check') {
    if (user.includes('INCOMPLETE')) {
      return JSON.stringify({ complete: false, completeIssues: ['只写了草稿，没有可运行入口'], severe: [], minor: [], notes: '' });
    }
    if (user.includes('BAD')) {
      return JSON.stringify({ complete: true, completeIssues: [], severe: ['新增了 forbidden 里的第三方依赖'], minor: [], notes: '阻断' });
    }
    return JSON.stringify({ complete: true, completeIssues: [], severe: [], minor: ['变量名和基准里的建议不完全一致'], notes: '可交付' });
  }
  throw new Error('unknown role: ' + role);
}

async function makeDo(kind) {
  return async () => {
    if (kind === 'incomplete') return 'INCOMPLETE: 只写了一半';
    if (kind === 'bad') return 'BAD: 偷偷装了 axios';
    return '已生成 src/stats.js，运行 node stats.js sample.json 输出 count=3。';
  };
}

async function turn(label, messages, runDo, sessionId) {
  const r = await runTigerTurn({
    messages,
    sessionId,
    stateDir,
    userId: 'demo-user',
    assistantName: '潘一琪',
    model: fakeModel,
    runDo,
    machineGate: async () => ({ ok: true, summary: 'no forbidden dependency; files exist' }),
  });
  console.log('\n--- ' + label + ' ---');
  console.log(JSON.stringify({
    kind: r.kind,
    status: r.status,
    reason: r.reason,
    summary: r.summary,
    issues: r.issues,
    minor: r.minor,
    baseline: r.baseline && r.baseline.versionId,
  }, null, 2));
  return r;
}

async function main() {
  const ok = await makeDo('ok');
  const incomplete = await makeDo('incomplete');
  const bad = await makeDo('bad');

  // 1. A real task becomes a pending proposal, not an execution.
  await turn('turn 1 / propose', [{ role: 'user', content: '写一个统计 JSON 的 CLI 工具' }], ok, 'demo-ok');
  // 2. "可以" freezes the baseline and runs all three wheels.
  await turn('turn 2 / confirm', [
    { role: 'user', content: '写一个统计 JSON 的 CLI 工具' },
    { role: 'assistant', content: '需求摘要…（省略）' },
    { role: 'user', content: '可以' },
  ], ok, 'demo-ok');

  // 3. Incomplete Do output is blocked before drift diffing.
  await turn('blocked / incomplete', [{ role: 'user', content: '写一个统计 JSON 的 CLI 工具' }], incomplete, 'demo-incomplete');
  await turn('blocked / incomplete confirm', [{ role: 'user', content: '可以' }], incomplete, 'demo-incomplete');

  // 4. Severe drift is blocked even when the output is usable.
  await turn('blocked / severe drift', [{ role: 'user', content: '写一个统计 JSON 的 CLI 工具' }], bad, 'demo-bad');
  await turn('blocked / severe drift confirm', [{ role: 'user', content: '可以' }], bad, 'demo-bad');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
