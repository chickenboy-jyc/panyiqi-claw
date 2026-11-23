/**
 * LIFETIME: assert
 *
 * Run: node examples/ai-cs-paraphrase/gate.mjs
 *
 * This gate is the case study: the model is deliberately NOT in the loop.
 * Both retrievers use the same documents; the only difference is whether the
 * query is canonicalized before matching.
 */
import { createSuite } from '../../src/gates/assert.mjs';
import { installWatchdog } from '../../src/gates/watchdog.mjs';
import { QUERIES } from './queries.mjs';
import { retrieveNaive, retrieveRobust, canonicalize } from './retriever.mjs';

const WD = installWatchdog('AI-CS-PARAPHRASE SUMMARY');
const S = createSuite('AI-CS-PARAPHRASE');

const naiveHits = [];
const robustHits = [];
for (const row of QUERIES) {
  const n = retrieveNaive(row.q);
  const r = retrieveRobust(row.q);
  const nOk = !!n && n.id === row.expect;
  const rOk = !!r && r.id === row.expect;
  if (nOk) naiveHits.push(row.q);
  if (rOk) robustHits.push(row.q);
  console.log(
    (rOk ? '  ✔' : '  ✘') + ' robust  ' + row.q + '  → ' + (r ? r.id : '(miss)') +
    '   |   ' + (nOk ? '✔' : '✘') + ' naive  → ' + (n ? n.id : '(miss)') +
    (row.note ? '   [' + row.note + ']' : ''),
  );
}

const total = QUERIES.length;
S.check(
  'robust retriever hits at least 11/12 paraphrases',
  () => robustHits.length >= 11,
  `${robustHits.length}/${total}`,
);
S.check(
  'naive retriever misses at least one paraphrase (the bug is real)',
  () => naiveHits.length < total,
  `naive ${naiveHits.length}/${total}`,
);
S.check(
  'robust strictly beats naive on the same documents',
  () => robustHits.length > naiveHits.length,
  `robust ${robustHits.length} vs naive ${naiveHits.length}`,
);
S.check(
  'negative control: "昨天种的牙，今天能刷牙吗" misses naive, hits robust',
  () => {
    const q = '昨天种的牙，今天能刷牙吗';
    const n = retrieveNaive(q);
    const r = retrieveRobust(q);
    return n === null && r && r.id === 'implant-brush';
  },
  'canonical=' + canonicalize('昨天种的牙，今天能刷牙吗'),
);

console.log('');
console.log(`命中率：naive ${naiveHits.length}/${total} · robust ${robustHits.length}/${total}`);
const result = S.summary();
WD.markDone();
process.exit(result.failed ? 1 : 0);
