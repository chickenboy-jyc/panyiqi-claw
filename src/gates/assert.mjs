/**
 * Minimal assertion helpers shared by gate scripts.
 *
 * A gate is not a test runner: it must print a machine-readable summary and
 * exit 0 (pass), 1 (a real failure), or 99 (incomplete reading). Keeping the
 * summary shape consistent is what lets the chain runner treat a crashed gate
 * differently from a failed one.
 */
export function createSuite(name) {
  const passed = [];
  const failed = [];

  function check(label, fn, detail) {
    let ok = false;
    let extra = detail;
    try {
      ok = typeof fn === 'function' ? !!fn() : !!fn;
    } catch (e) {
      ok = false;
      extra = (extra ? extra + ' · ' : '') + 'threw: ' + String((e && e.message) || e);
    }
    if (ok) {
      passed.push(label);
      console.log('  ✔ ' + label + (extra ? '  ← ' + extra : ''));
    } else {
      failed.push(label + (extra ? '  ← ' + extra : ''));
      console.log('  ✘ ' + label + (extra ? '  ← ' + extra : ''));
    }
    return ok;
  }

  function summary() {
    const total = passed.length + failed.length;
    const line = `${name} SUMMARY 通过 ${passed.length} / 失败 ${failed.length}（共 ${total} 条）`;
    console.log('');
    console.log(line);
    if (failed.length) {
      console.log('失败清单：');
      for (const f of failed) console.log('  - ' + f);
    }
    return { total, passed: passed.length, failed: failed.length, line };
  }

  return { check, summary, passed, failed };
}

/** Format a value for a one-line failure detail. */
export function short(value, max = 180) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + '…' : s;
}
