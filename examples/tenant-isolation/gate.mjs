/**
 * LIFETIME: assert
 *
 * Run: node examples/tenant-isolation/gate.mjs
 *
 * One real cross-tenant request is enough to prove the bug. The same request
 * becomes the regression gate: remove the tenant filter and it goes red.
 */
import { createSuite } from '../../src/gates/assert.mjs';
import { installWatchdog } from '../../src/gates/watchdog.mjs';
import { DOCS, naiveGetDoc, fixedGetDoc } from './handlers.mjs';

const WD = installWatchdog('TENANT-ISOLATION SUMMARY');
const S = createSuite('TENANT-ISOLATION');

const A = { tenant: 'tenant-a', kbId: 'kb-a' };
const B = { tenant: 'tenant-b', kbId: 'kb-b' };
const CROSS = { tenant: 'tenant-a', kbId: 'kb-b' };

S.check('A can read A (positive control)', () => {
  const d = fixedGetDoc(A);
  return !!d && d.id === 'kb-a';
});

S.check('A cannot read B (the fix)', () => {
  const d = fixedGetDoc(CROSS);
  return d === null;
});

S.check('naive handler leaks B to A (the bug is real)', () => {
  const d = naiveGetDoc(CROSS);
  return !!d && d.id === 'kb-b';
});

S.check('naive handler still lets B read B (not a blanket deny)', () => {
  const d = naiveGetDoc(B);
  return !!d && d.id === 'kb-b';
});

S.check('negative control: fixed handler without tenant check would leak', () => {
  // Simulate a regression: keep the lookup, drop the tenant comparison.
  const broken = ({ kbId }) => DOCS.find((d) => d.id === kbId) || null;
  return !!broken(CROSS);
});

const result = S.summary();
WD.markDone();
process.exit(result.failed ? 1 : 0);
