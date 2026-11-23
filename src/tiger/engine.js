/**
 * Tiger three-wheel engine (Pro → freeze → Do → machine gate → Check).
 *
 * This is a small, dependency-free reference implementation. The real product
 * plugs a tool-using DSH executor into `runDo`; here `runDo` is injected so the
 * state machine can be tested without a model or a filesystem sandbox.
 */
import {
  checkSystem,
  doSystem,
  proSystem,
  buildCheckPrompt,
  buildDoPrompt,
  buildProPrompt,
} from './prompts.js';
import {
  clearState,
  defaultStateDir,
  freezePending,
  loadState,
  saveState,
} from './baseline.js';

/** A short "yes" is a confirmation, not a new task. Keep this list conservative. */
export const CONFIRM_RE = /^(可以|行|好|好的|确认|同意|按这个来|就这样|开始|做吧|干吧|ok|okay|yes|y)[。！!，,.\s]*$/i;

export function lastUserText(messages) {
  const rows = Array.isArray(messages) ? messages : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const m = rows[i];
    if (!m || m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content.trim();
    if (Array.isArray(m.content)) return m.content.map((x) => (x && x.text) || '').join('\n').trim();
  }
  return '';
}

export function recentConversation(messages, maxChars = 6000) {
  const rows = Array.isArray(messages) ? messages.slice(-10) : [];
  const lines = [];
  for (const m of rows) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const text = typeof m.content === 'string' ? m.content.trim() : '';
    if (!text) continue;
    lines.push((m.role === 'user' ? '用户：' : '助手：') + truncate(text, 1200));
  }
  return truncate(lines.join('\n'), maxChars);
}

export function truncate(value, max) {
  const s = String(value == null ? '' : value);
  return s.length > max ? s.slice(0, max) + '\n…（已截断）' : s;
}

/** Models sometimes wrap JSON in fences or add a sentence before it. */
export function parseJsonLoose(text) {
  const s = String(text || '').trim();
  const cleaned = s.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(cleaned.slice(a, b + 1)); } catch { /* ignore */ }
  }
  return null;
}

function asArray(v) {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
}

function decide(check, machine) {
  const completeIssues = asArray(check && check.completeIssues);
  const severe = asArray(check && check.severe);
  const minor = asArray(check && check.minor);
  const machineOk = !machine || machine.ok !== false;
  if (!machineOk) {
    return { kind: 'blocked', status: 'blocked', reason: 'machine_gate', issues: asArray(machine && machine.failures) };
  }
  if (check && check.complete === false) {
    return { kind: 'blocked', status: 'blocked', reason: 'incomplete', issues: completeIssues };
  }
  if (severe.length) {
    return { kind: 'blocked', status: 'blocked', reason: 'severe_drift', issues: severe };
  }
  return { kind: 'delivered', status: 'delivered', minor, notes: String((check && check.notes) || '') };
}

/**
 * Run one turn.
 *
 * @param {Object} opts
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {string} [opts.sessionId]
 * @param {string} [opts.userId]       recorded as the human approver on freeze
 * @param {string} [opts.stateDir]
 * @param {string} [opts.assistantName]
 * @param {(args:{role:string,system:string,user:string})=>Promise<string>} opts.model
 * @param {(args:{baseline:object,request:string,prompt:string})=>Promise<string|{text:string}>} opts.runDo
 * @param {(args:{baseline:object,output:string})=>Promise<{ok:boolean,summary?:string,failures?:string[]}>} [opts.machineGate]
 * @param {string} [opts.externalText]
 * @param {boolean} [opts.reset]
 */
export async function runTigerTurn(opts) {
  const o = opts || {};
  if (o.reset) clearState(o.stateDir, { sessionId: o.sessionId });
  if (typeof o.model !== 'function') throw new TypeError('model() is required');
  if (typeof o.runDo !== 'function') throw new TypeError('runDo() is required');

  const stateDir = o.stateDir || defaultStateDir();
  const payload = { sessionId: o.sessionId || 'default' };
  const name = o.assistantName || 'the assistant';
  const userText = lastUserText(o.messages);
  if (!userText) {
    return { kind: 'error', error: 'empty user message', state: loadState(stateDir, payload) };
  }

  let state = loadState(stateDir, payload);
  const externalText = o.externalText || '';

  // A short confirmation with a pending proposal freezes the baseline and runs.
  // Do this before calling Pro: otherwise Pro may re-propose on "可以".
  if (state.pending && CONFIRM_RE.test(userText)) {
    // Only an explicit human confirmation can freeze. Pro never freezes its
    // own proposal; Do never starts from a pending item.
    const baseline = freezePending(state, payload, undefined, o.userId || 'user');
    saveState(stateDir, payload, state);
    return executeBaseline({ o, state, stateDir, payload, baseline, name });
  }

  const proRaw = await o.model({
    role: 'pro',
    system: proSystem(name),
    user: buildProPrompt(userText, recentConversation(o.messages), state, externalText),
  });
  const pro = parseJsonLoose(proRaw);
  if (!pro || (pro.action !== 'answer' && pro.action !== 'propose')) {
    return { kind: 'error', error: 'Pro returned invalid JSON', raw: String(proRaw || ''), state };
  }

  if (pro.action === 'answer') {
    return {
      kind: 'answer',
      text: String(pro.answer || '').trim() || '（Pro returned an empty answer）',
      state,
    };
  }

  state.pending = {
    summary: String(pro.summary || '').trim(),
    hard: pro.hard && typeof pro.hard === 'object' ? pro.hard : {},
    soft: asArray(pro.soft),
    request: userText,
  };
  saveState(stateDir, payload, state);
  return { kind: 'proposal', summary: state.pending.summary, pending: state.pending, state };
}

async function executeBaseline({ o, state, stateDir, payload, baseline, name }) {
  const request = String(baseline.request || '').trim();
  let doText = '';
  try {
    const result = await o.runDo({
      baseline,
      request,
      prompt: buildDoPrompt(baseline, request, o.plan),
    });
    doText = typeof result === 'string' ? result : String((result && result.text) || '');
  } catch (e) {
    return {
      kind: 'blocked',
      reason: 'do_failed',
      issues: [String((e && e.message) || e)],
      baseline,
      state,
    };
  }

  let machine = { ok: true, summary: 'no machine gate' };
  if (typeof o.machineGate === 'function') {
    try {
      machine = await o.machineGate({ baseline, output: doText });
    } catch (e) {
      machine = { ok: false, failures: ['machine gate threw: ' + String((e && e.message) || e)] };
    }
  }

  const checkRaw = await o.model({
    role: 'check',
    system: checkSystem(name),
    user: buildCheckPrompt(baseline, doText, machine.summary || '', doText),
  });
  const check = parseJsonLoose(checkRaw);
  if (!check) {
    return {
      kind: 'blocked',
      reason: 'check_invalid_json',
      issues: ['Check returned invalid JSON'],
      raw: String(checkRaw || ''),
      baseline,
      doText,
      machine,
      state,
    };
  }

  const decision = decide(check, machine);
  saveState(stateDir, payload, state);
  return Object.assign({ baseline, doText, machine, check, state }, decision);
}
