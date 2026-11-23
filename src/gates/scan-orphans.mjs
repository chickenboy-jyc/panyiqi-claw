#!/usr/bin/env node
/**
 * Orphan-assert scanner.
 *
 * A gate script that no chain ever runs is worse than no gate: it looks like
 * coverage in the repository, but nothing executes it. This scanner reads
 * `chain.txt`, walks the source roots, and fails when a file declares
 * `LIFETIME: assert` but is not referenced by the chain.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChain } from './runner.mjs';

const MARKER = 'LIFETIME: assert';

export function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function scanOrphans({ chainFile, roots, cwd = process.cwd() }) {
  const chainText = fs.readFileSync(path.resolve(cwd, chainFile), 'utf8');
  const commands = parseChain(chainText).map((e) => e.command).join('\n');
  const files = roots.flatMap((root) => walk(path.resolve(cwd, root)));
  const declared = [];
  for (const file of files) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!text.includes(MARKER)) continue;
    declared.push(path.relative(cwd, file).replace(/\\/g, '/'));
  }
  const orphans = declared.filter((rel) => !commands.includes(rel));
  return { declared, orphans };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const chain = args.find((a) => !a.startsWith('--')) || 'examples/chain.txt';
  const rootsArg = args.find((a) => a.startsWith('--roots='));
  // Default to src only: tests often contain the marker inside fixture strings,
  // which would be a false positive. Pass --roots=src,test to scan tests too.
  const roots = (rootsArg ? rootsArg.slice('--roots='.length) : 'src').split(',').map((s) => s.trim()).filter(Boolean);
  const r = scanOrphans({ chainFile: chain, roots });
  console.log(`[orphans] declared=${r.declared.length} orphan=${r.orphans.length}`);
  for (const o of r.orphans) console.log('  ✘ not in chain: ' + o);
  process.exit(r.orphans.length ? 1 : 0);
}
