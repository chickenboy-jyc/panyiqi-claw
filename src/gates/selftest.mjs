/**
 * LIFETIME: assert
 *
 * A tiny gate that demonstrates the contract: install the watchdog first,
 * print machine-readable checks, print one summary line, then exit 0/1.
 *
 * Run: node src/gates/selftest.mjs
 */
import { createSuite } from './assert.mjs';
import { installWatchdog } from './watchdog.mjs';
import { judgeRatchet } from './ratchet.mjs';

const WD = installWatchdog('GATE-SELFTEST SUMMARY');
const S = createSuite('GATE-SELFTEST');

console.log('gate selftest');

S.check('arithmetic', () => 2 + 2 === 4);
S.check('ratchet allows a decrease', () => judgeRatchet({ current: 3, baseline: 5 }).ok);
S.check('ratchet blocks an increase (negative control)', () => {
  const r = judgeRatchet({ current: 6, baseline: 5 });
  return r.ok === false && /只许降不许升/.test(r.reason);
}, 'current=6 baseline=5');

const result = S.summary();
WD.markDone();
process.exit(result.failed ? 1 : 0);
