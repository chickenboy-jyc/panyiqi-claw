#!/usr/bin/env node
/**
 * A tiny gate chain runner.
 *
 * `chain.txt` is an ordered list of commands, one per line. Blank lines and
 * lines starting with `#` are ignored. Each command is executed with the
 * platform shell; its exit code is interpreted as:
 *
 *   0  → pass
 *   1  → real failure
 *   99 → incomplete reading (the gate crashed before printing its summary)
 *   *  → real failure (unknown exit code)
 *
 * The runner never stops at the first failure: one full run should produce one
 * report, not a partial one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function parseChain(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line, index) => ({ index: index + 1, command: line }));
}

export function runChain(chainFile, opts = {}) {
  const root = opts.cwd || process.cwd();
  const file = path.resolve(root, chainFile);
  const entries = parseChain(fs.readFileSync(file, 'utf8'));
  const results = [];

  for (const entry of entries) {
    const startedAt = Date.now();
    process.stdout.write(`\n[gate] ${entry.command}\n`);
    const res = spawnSync(entry.command, {
      cwd: root,
      shell: true,
      stdio: 'inherit',
      env: process.env,
    });
    const code = res.status == null ? 1 : res.status;
    const result = {
      command: entry.command,
      exitCode: code,
      verdict: code === 0 ? 'pass' : code === 99 ? 'incomplete' : 'fail',
      ms: Date.now() - startedAt,
      error: res.error ? String(res.error.message || res.error) : '',
    };
    results.push(result);
    process.stdout.write(`[gate] ${result.verdict} (exit=${code}, ${result.ms}ms)\n`);
  }

  const failed = results.filter((r) => r.verdict === 'fail');
  const incomplete = results.filter((r) => r.verdict === 'incomplete');
  const report = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.verdict === 'pass').length,
    failed: failed.length,
    incomplete: incomplete.length,
    results,
  };

  console.log('\n' + '─'.repeat(64));
  console.log(`GATE CHAIN SUMMARY total=${report.total} passed=${report.passed} failed=${report.failed} incomplete=${report.incomplete}`);
  if (failed.length) for (const f of failed) console.log(`  ✘ ${f.command} (exit=${f.exitCode})`);
  if (incomplete.length) for (const f of incomplete) console.log(`  ? ${f.command} (exit=99, 读数不完整)`);

  if (opts.json) {
    fs.mkdirSync(path.dirname(path.resolve(root, opts.json)), { recursive: true });
    fs.writeFileSync(path.resolve(root, opts.json), JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const chain = args.find((a) => !a.startsWith('--')) || 'examples/chain.txt';
  const jsonArg = args.find((a) => a.startsWith('--json='));
  const report = runChain(chain, { json: jsonArg ? jsonArg.slice('--json='.length) : '' });
  process.exit(report.failed > 0 || report.incomplete > 0 ? 1 : 0);
}
