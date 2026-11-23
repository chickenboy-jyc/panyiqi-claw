import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { judgeRatchet, judgeRatchetMap } from '../src/gates/ratchet.mjs';
import { parseChain } from '../src/gates/runner.mjs';
import { scanOrphans } from '../src/gates/scan-orphans.mjs';

test('ratchet allows a decrease but blocks an increase', () => {
  assert.equal(judgeRatchet({ current: 7, baseline: 7 }).ok, true);
  assert.equal(judgeRatchet({ current: 6, baseline: 7 }).ok, true);
  const bad = judgeRatchet({ current: 8, baseline: 7 });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /只许降不许升/);
});

test('ratchet map reports every failing key', () => {
  const r = judgeRatchetMap({ buttons: 8, colors: 3 }, { buttons: 7, colors: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /buttons/);
});

test('parseChain ignores blank lines and comments', () => {
  const rows = parseChain('# comment\n\nnode a.mjs\n  node b.mjs  \n');
  assert.deepEqual(rows.map((r) => r.command), ['node a.mjs', 'node b.mjs']);
});

test('scanOrphans finds a gate that is not in the chain', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'examples'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'examples', 'chain.txt'), 'node src/a-gate.mjs\n', 'utf8');
  fs.writeFileSync(path.join(tmp, 'src', 'a-gate.mjs'), '// LIFETIME: assert\nconsole.log("a")\n', 'utf8');
  fs.writeFileSync(path.join(tmp, 'src', 'b-gate.mjs'), '// LIFETIME: assert\nconsole.log("b")\n', 'utf8');
  const r = scanOrphans({ chainFile: 'examples/chain.txt', roots: ['src'], cwd: tmp });
  assert.deepEqual(r.declared.sort(), ['src/a-gate.mjs', 'src/b-gate.mjs']);
  assert.deepEqual(r.orphans, ['src/b-gate.mjs']);
});

test('watchdog turns "no summary line" into exit 99', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-test-'));
  const wd = pathToFileURL(path.resolve('src/gates/watchdog.mjs')).href;
  const bad = path.join(tmp, 'bad.mjs');
  fs.writeFileSync(bad, `import { installWatchdog } from '${wd}';\ninstallWatchdog('BAD SUMMARY');\n`, 'utf8');
  const r = spawnSync(process.execPath, [bad], { encoding: 'utf8' });
  assert.equal(r.status, 99, r.stderr);
});

test('watchdog leaves a completed gate at its own exit code', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-test-'));
  const wd = pathToFileURL(path.resolve('src/gates/watchdog.mjs')).href;
  const good = path.join(tmp, 'good.mjs');
  fs.writeFileSync(good, [
    `import { installWatchdog } from '${wd}';`,
    "const wd = installWatchdog('GOOD SUMMARY');",
    "console.log('GOOD SUMMARY 通过 1 / 失败 0');",
    'wd.markDone();',
    'process.exit(0);',
  ].join('\n'), 'utf8');
  const r = spawnSync(process.execPath, [good], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
