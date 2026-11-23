/**
 * "Incomplete reading" watchdog.
 *
 * A gate that crashes before printing its summary exits 1 — exactly the same
 * code as a gate that ran and found a real failure. Downstream that means
 * "someone broke the product" and "the gate never ran" look identical.
 *
 * Contract:
 *   - call installWatchdog('NAME SUMMARY') once, before anything that can exit;
 *   - print the real summary line (the sentinel must actually reach stdout);
 *   - markDone() is optional; it only says "the caller believes it is done".
 *
 * The authoritative signal is the sentinel observed on stdout, not markDone():
 *   - markDone() without the summary line  → exit 99 (no evidence);
 *   - summary line without markDone()      → exit 0 (the line is evidence);
 *   - neither                              → exit 99.
 */
import fs from 'node:fs';

export const EXIT_INCOMPLETE = 99;
const WITNESS = '[watchdog] ';

function stderr(line) {
  try { fs.writeSync(2, WITNESS + line + '\n'); } catch { /* ignore */ }
}

function asText(chunk) {
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString('utf8');
  return String(chunk == null ? '' : chunk);
}

export function installWatchdog(sentinel) {
  const state = {
    installed: true,
    sentinel: String(sentinel || 'SUMMARY'),
    sawSentinel: false,
    markDoneCalled: false,
    fired: false,
    exitCodeBefore: null,
  };
  const realExit = process.exit.bind(process);
  const realWrite = process.stdout.write.bind(process.stdout);

  const observe = (chunk) => {
    try {
      if (asText(chunk).includes(state.sentinel)) state.sawSentinel = true;
    } catch { /* observation must never break the gate */ }
  };

  // Observe what the gate actually prints. This is the evidence; markDone()
  // alone is not.
  process.stdout.write = function patchedWrite(...args) {
    observe(args[0]);
    return realWrite(...args);
  };

  const incomplete = (why, code) => {
    if (state.sawSentinel || state.fired) return;
    state.fired = true;
    state.exitCodeBefore = code == null ? null : code;
    stderr(`读数不完整：${why}；原退出码 ${code == null ? '?' : code} → 99`);
    realExit(EXIT_INCOMPLETE);
  };

  process.exit = (code) => {
    if (!state.sawSentinel) {
      state.fired = true;
      state.exitCodeBefore = code;
      stderr(`读数不完整：进程在打印汇总行之前退出（原退出码 ${code == null ? 0 : code}）→ 99`);
      realExit(EXIT_INCOMPLETE);
      return;
    }
    realExit(code);
  };

  process.on('beforeExit', (code) => {
    if (!state.sawSentinel) incomplete('事件循环已空，但没有打印汇总行', code);
  });
  process.on('uncaughtException', (e) => {
    stderr('未捕获异常：' + String((e && e.stack) || e));
    if (state.sawSentinel) realExit(1);
    else incomplete('未捕获异常', 1);
  });
  process.on('unhandledRejection', (e) => {
    stderr('未处理的 Promise 拒绝：' + String((e && e.stack) || e));
    if (state.sawSentinel) realExit(1);
    else incomplete('未处理的 Promise 拒绝', 1);
  });

  return {
    installed: true,
    state,
    /** Optional. Does NOT count as evidence; the sentinel on stdout does. */
    markDone() {
      state.markDoneCalled = true;
      return state.sawSentinel;
    },
  };
}
