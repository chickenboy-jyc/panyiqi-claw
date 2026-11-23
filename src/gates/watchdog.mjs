/**
 * "Incomplete reading" watchdog.
 *
 * A gate that crashes before printing its summary exits 1 — exactly the same
 * code as a gate that ran and found a real failure. Downstream that means
 * "someone broke the product" and "the gate never ran" look identical.
 *
 * Contract:
 *   - call installWatchdog('NAME SUMMARY') once, before anything that can exit;
 *   - call markDone() right after printing the real summary line;
 *   - if the process exits without markDone(), it exits 99 instead.
 */
import fs from 'node:fs';

export const EXIT_INCOMPLETE = 99;
const WITNESS = '[watchdog] ';

function stderr(line) {
  try { fs.writeSync(2, WITNESS + line + '\n'); } catch { /* ignore */ }
}

export function installWatchdog(sentinel) {
  const state = {
    installed: true,
    sentinel: String(sentinel || 'SUMMARY'),
    sawSentinel: false,
    fired: false,
    exitCodeBefore: null,
  };
  const realExit = process.exit.bind(process);

  const incomplete = (why, code) => {
    if (state.sawSentinel || state.fired) return;
    state.fired = true;
    state.exitCodeBefore = code == null ? null : code;
    stderr(`读数不完整：${why}；原退出码 ${code == null ? '?' : code} → 99`);
    realExit(EXIT_INCOMPLETE);
  };

  process.exit = (code) => {
    if (!state.sawSentinel) {
      state.exitCodeBefore = code;
      state.fired = true;
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
    incomplete('未捕获异常', 1);
  });
  process.on('unhandledRejection', (e) => {
    stderr('未处理的 Promise 拒绝：' + String((e && e.stack) || e));
    incomplete('未处理的 Promise 拒绝', 1);
  });

  return {
    installed: true,
    state,
    markDone() { state.sawSentinel = true; },
  };
}
