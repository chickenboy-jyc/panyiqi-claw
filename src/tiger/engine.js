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

function isRecord(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Fail closed: a drifted Check shape is a block, not a delivery. */
function checkShapeIssues(check) {
  if (!isRecord(check)) return ['Check output must be an object'];
  const issues = [];
  if (typeof check.complete !== 'boolean') issues.push('check.complete must be boolean');
  // Required arrays, not "optional if absent": a missing `severe` is exactly
  // the shape drift that used to turn a drift into a delivery.
  for (const key of ['completeIssues', 'severe', 'minor']) {
    if (!Array.isArray(check[key])) issues.push(`check.${key} must be an array`);
  }
  if (check.notes != null && typeof check.notes !== 'string') issues.push('check.notes must be a string');
  return issues;
}

function machineShapeIssues(machine) {
  if (!isRecord(machine)) return ['machine gate must return an object'];
  if (typeof machine.ok !== 'boolean') return ['machine.ok must be boolean'];
  if (machine.summary != null && typeof machine.summary !== 'string') return ['machine.summary must be a string'];
  if (machine.failures != null && !Array.isArray(machine.failures)) return ['machine.failures must be an array'];
  return [];
}

function decide(check, machine) {
  const shape = checkShapeIssues(check);
  if (shape.length) {
    return { kind: 'blocked', status: 'blocked', reason: 'check_invalid_shape', issues: shape };
  }
  const completeIssues = asArray(check.completeIssues);
  const severe = asArray(check.severe);
  const minor = asArray(check.minor);

  // The document says "complete first": an incomplete output is blocked before
  // the machine gate is allowed to interpret it.
  if (check.complete === false) {
    return {
      kind: 'blocked',
      status: 'blocked',
      reason: 'incomplete',
      issues: completeIssues.length ? completeIssues : ['Check marked incomplete without details'],
    };
  }

  const machineShape = machineShapeIssues(machine);
  if (machineShape.length) {
    return { kind: 'blocked', status: 'blocked', reason: 'machine_gate_invalid', issues: machineShape };
  }
  if (machine.ok === false) {
    return { kind: 'blocked', status: 'blocked', reason: 'machine_gate', issues: asArray(machine.failures) };
  }
  if (severe.length) {
    return { kind: 'blocked', status: 'blocked', reason: 'severe_drift', issues: severe };
  }
  return { kind: 'delivered', status: 'delivered', minor, notes: String(check.notes || '') };
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
 * @param {(args:{baseline:object,request:string,prompt:string})=>Promise<string|{text:string,artifacts?:any[]}>} opts.runDo
 * @param {(args:{baseline:object,output:string,artifacts:any[]})=>Promise<{ok:boolean,summary?:string,failures?:string[]}>} [opts.machineGate]
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
    // own proposal; Do never starts from a pending item. No userId = no
    // confirmation: a literal "user" default would make confirmedBy a lie.
    const approver = String(o.userId || '').trim();
    if (!approver) {
      return {
        kind: 'error',
        error: 'confirmation requires a human userId',
        state,
      };
    }
    const baseline = freezePending(state, payload, undefined, approver);
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
  let artifacts = [];
  try {
    const result = await o.runDo({
      baseline,
      request,
      prompt: buildDoPrompt(baseline, request, o.plan),
    });
    if (typeof result === 'string') {
      doText = result;
    } else if (isRecord(result)) {
      doText = String(result.text || '');
      if ('artifacts' in result) {
        if (!Array.isArray(result.artifacts)) {
          return {
            kind: 'blocked',
            status: 'blocked',
            reason: 'do_invalid_artifacts',
            issues: ['runDo().artifacts must be an array'],
            baseline,
            state,
          };
        }
        artifacts = result.artifacts;
      }
    } else if (result != null) {
      return {
        kind: 'blocked',
        status: 'blocked',
        reason: 'do_invalid_result',
        issues: ['runDo() must return a string or { text, artifacts }'],
        baseline,
        state,
      };
    }
  } catch (e) {
    return {
      kind: 'blocked',
      reason: 'do_failed',
      issues: [String((e && e.message) || e)],
      baseline,
      state,
    };
  }

  // No text and no artifact means there is nothing to verify. Do not let a
  // friendly Check turn "nothing happened" into a delivery.
  if (!doText.trim() && artifacts.length === 0) {
    return {
      kind: 'blocked',
      status: 'blocked',
      reason: 'do_empty',
      issues: ['Do returned neither text nor artifacts'],
      baseline,
      state,
    };
  }

  let machine = { ok: true, summary: 'no machine gate' };
  if (typeof o.machineGate === 'function') {
    try {
      machine = await o.machineGate({ baseline, output: doText, artifacts });
    } catch (e) {
      machine = { ok: false, failures: ['machine gate threw: ' + String((e && e.message) || e)] };
    }
  }

  const checkRaw = await o.model({
    role: 'check',
    system: checkSystem(name),
    user: buildCheckPrompt(baseline, doText, machine.summary || '', doText, artifacts),
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
      artifacts,
      machine,
      state,
    };
  }

  const decision = decide(check, machine);
  saveState(stateDir, payload, state);
  return Object.assign({ baseline, doText, artifacts, machine, check, state }, decision);
}
