/**
 * Ratchet judge: a metric is allowed to go down, never up without an explicit
 * baseline update. This is how "don't add one more button / one more color /
 * one more hardcoded path" survives a fast-moving codebase.
 *
 * A ratchet is only useful if it can fail. The test suite includes a mutation
 * that raises a metric by 1 and expects `ok: false`.
 */
export function judgeRatchet({ current, baseline, direction = 'down', name = 'metric' } = {}) {
  const now = Number(current);
  const was = Number(baseline);
  if (!Number.isFinite(now) || !Number.isFinite(was)) {
    return { ok: false, reason: `${name}: current/baseline must be finite numbers`, current: now, baseline: was };
  }
  if (direction === 'up') {
    if (now < was) return { ok: false, reason: `${name}: ${now} < ${was}（只许升不许降）`, current: now, baseline: was };
    return { ok: true, reason: `${name}: ${now} >= ${was}`, current: now, baseline: was };
  }
  if (now > was) return { ok: false, reason: `${name}: ${now} > ${was}（只许降不许升）`, current: now, baseline: was };
  return { ok: true, reason: `${name}: ${now} <= ${was}`, current: now, baseline: was };
}

export function judgeRatchetMap(current, baseline, opts = {}) {
  const keys = new Set([...Object.keys(current || {}), ...Object.keys(baseline || {})]);
  const failures = [];
  for (const key of keys) {
    const r = judgeRatchet({
      current: current[key],
      baseline: baseline[key],
      direction: opts.direction || 'down',
      name: key,
    });
    if (!r.ok) failures.push(r.reason);
  }
  return { ok: failures.length === 0, failures };
}
