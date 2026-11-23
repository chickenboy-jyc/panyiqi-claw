/**
 * Frozen baseline state.
 *
 * One JSON file per session. A proposal lives in `pending`; only an explicit
 * user confirmation turns it into `baseline`. Once frozen, Do and Check read it
 * and never write it back.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function defaultStateDir() {
  return process.env.TIGER_STATE_DIR
    || path.join(os.tmpdir(), 'panyiqi-claw-agent', 'tiger-state');
}

export function sessionKey(payload) {
  const raw = String((payload && (payload.sessionId || payload.threadId)) || 'default');
  return raw.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'default';
}

export function statePath(stateDir, payload) {
  return path.join(stateDir || defaultStateDir(), sessionKey(payload) + '.json');
}

export function emptyState() {
  return {
    pending: null,
    baseline: null,
    history: [],
    version: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function loadState(stateDir, payload) {
  try {
    const raw = fs.readFileSync(statePath(stateDir, payload), 'utf8');
    const state = Object.assign(emptyState(), JSON.parse(raw));
    if (!Array.isArray(state.history)) state.history = [];
    return state;
  } catch {
    return emptyState();
  }
}

export function saveState(stateDir, payload, state) {
  try {
    const p = statePath(stateDir, payload);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // State is best-effort. A failed write must not block the turn.
  }
}

export function makeVersionId(state, payload) {
  const n = Number(state && state.version) || 0;
  const key = sessionKey(payload).replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase() || 'SESSION';
  return `TIGER-${key}-v${n + 1}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Freeze a pending proposal into a baseline.
 *
 * `confirmedBy` is deliberately a required concept, not a detail: the Pro wheel
 * may advise, but it must never be the thing that turns its own proposal into
 * an executable baseline. Only a human confirmation reaches this function.
 */
export function freezePending(state, payload, versionId, confirmedBy) {
  const pending = state && state.pending;
  if (!pending) throw new Error('no pending proposal to freeze');
  const approver = String(confirmedBy || '').trim();
  if (!approver) throw new Error('baseline requires a human approver');
  if (!Array.isArray(state.history)) state.history = [];
  if (state.baseline) {
    state.history.push(state.baseline);
    // Keep the last 20 frozen versions; the current baseline is separate.
    while (state.history.length > 20) state.history.shift();
  }
  state.version = (Number(state.version) || 0) + 1;
  state.baseline = {
    versionId: versionId || makeVersionId(state, payload),
    summary: String(pending.summary || ''),
    hard: pending.hard && typeof pending.hard === 'object' ? pending.hard : {},
    soft: Array.isArray(pending.soft) ? pending.soft : [],
    request: String(pending.request || ''),
    intent: pending.intent || null,
    deliveryAuthorized: pending.deliveryAuthorized || null,
    confirmedBy: approver,
    confirmedAt: new Date().toISOString(),
    frozenAt: new Date().toISOString(),
  };
  state.pending = null;
  return state.baseline;
}

export function clearState(stateDir, payload) {
  try { fs.rmSync(statePath(stateDir, payload), { force: true }); } catch { /* ignore */ }
}
