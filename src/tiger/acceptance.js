/**
 * Acceptance checklist normalization.
 *
 * Ported from the upstream `acceptanceChecklist.js` rule:
 *   "声明通过但没给证据 ⇒ 不算通过".
 *
 * This is intentionally not a model call. It is a deterministic downgrade:
 * a Check that says `pass: true` without evidence becomes `unknown`, and
 * `unknown` is never allowed to be delivered.
 */

export const ITEM_RESULTS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  SKIP: 'skip',
  UNKNOWN: 'unknown',
});

function asRecord(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function text(v) {
  return String(v == null ? '' : v).trim();
}

/**
 * @param {{id?:string, needsEvidence?:boolean}} item
 * @param {boolean|string|{pass?:boolean,result?:string,evidence?:string,basis?:string,reason?:string,note?:string,applies?:boolean,why?:string}} raw
 * @returns {{result:string, evidence:string, reason:string, note:string}}
 */
export function normalizeItemResult(item, raw) {
  const it = asRecord(item) || {};
  const empty = { result: ITEM_RESULTS.UNKNOWN, evidence: '', reason: '', note: '' };
  if (raw === undefined || raw === null) {
    return Object.assign({}, empty, { note: '未核验（清单要求逐条给结论）' });
  }

  let pass;
  let evidence = '';
  let reason = '';
  let note = '';

  if (typeof raw === 'boolean') {
    pass = raw;
  } else if (asRecord(raw)) {
    if (typeof raw.pass === 'boolean') pass = raw.pass;
    else if (typeof raw.result === 'string') {
      const r = raw.result.toLowerCase();
      if (r === ITEM_RESULTS.SKIP) {
        return { result: ITEM_RESULTS.SKIP, evidence: '', reason: '', note: text(raw.note) };
      }
      if (r === ITEM_RESULTS.UNKNOWN) {
        return Object.assign({}, empty, { note: text(raw.note) || '未核验' });
      }
      pass = r === ITEM_RESULTS.PASS;
    }
    evidence = text(raw.evidence || raw.basis);
    reason = text(raw.reason);
    note = text(raw.note);
    if (raw.applies === false) {
      return {
        result: ITEM_RESULTS.SKIP,
        evidence,
        reason: '',
        note: note || text(raw.why) || '不适用',
      };
    }
  }

  if (typeof pass !== 'boolean') {
    return Object.assign({}, empty, { note: '结论不是布尔，无法判读' });
  }

  if (pass) {
    if (it.needsEvidence && !evidence) {
      return {
        result: ITEM_RESULTS.UNKNOWN,
        evidence: '',
        reason,
        note: '声明通过但没给证据 ⇒ 不算通过',
      };
    }
    return { result: ITEM_RESULTS.PASS, evidence, reason: '', note };
  }
  return { result: ITEM_RESULTS.FAIL, evidence, reason, note };
}

/**
 * Evaluate a whole checklist. Fail closed:
 *   - empty checklist → fail (nothing was verified);
 *   - any FAIL → fail;
 *   - any UNKNOWN → unknown (not deliverable);
 *   - all PASS/SKIP → pass.
 */
export function evaluateAcceptance(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      verdict: 'fail',
      reason: 'empty-checklist',
      items: [],
      failed: [],
      unknown: [],
      passed: [],
      skipped: [],
    };
  }
  const rows = items.map((entry, index) => {
    const it = asRecord(entry) || { id: String(entry) };
    const raw = Object.prototype.hasOwnProperty.call(it, 'result')
      ? it.result
      : Object.prototype.hasOwnProperty.call(it, 'value')
        ? it.value
        : undefined;
    const normalized = normalizeItemResult(it, raw);
    return Object.assign({ id: it.id || `item-${index + 1}`, label: it.label || '' }, normalized);
  });

  const failed = rows.filter((r) => r.result === ITEM_RESULTS.FAIL);
  const unknown = rows.filter((r) => r.result === ITEM_RESULTS.UNKNOWN);
  const passed = rows.filter((r) => r.result === ITEM_RESULTS.PASS);
  const skipped = rows.filter((r) => r.result === ITEM_RESULTS.SKIP);
  const verdict = failed.length ? 'fail' : unknown.length ? 'unknown' : 'pass';
  return { verdict, reason: '', items: rows, failed, unknown, passed, skipped };
}
