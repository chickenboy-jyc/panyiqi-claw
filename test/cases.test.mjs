import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieveNaive, retrieveRobust } from '../examples/ai-cs-paraphrase/retriever.mjs';
import { QUERIES } from '../examples/ai-cs-paraphrase/queries.mjs';

test('the naive retriever loses paraphrases', () => {
  const missed = QUERIES.filter((row) => !retrieveNaive(row.q));
  assert.ok(missed.length > 0, 'the bug must be reproducible');
});

test('the canonical retriever hits every paraphrase', () => {
  for (const row of QUERIES) {
    const doc = retrieveRobust(row.q);
    assert.ok(doc, 'missed: ' + row.q);
    assert.equal(doc.id, row.expect, 'wrong doc for: ' + row.q);
  }
});
