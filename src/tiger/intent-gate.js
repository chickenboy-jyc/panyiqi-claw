/**
 * Deterministic intent + delivery-authorization gate.
 *
 * Ported from the upstream `agent-intent-gate` (a sibling of this kernel, not
 * its parent). The important case:
 *
 *   把这份诊断报告存成 Word 文件
 *
 * contains 诊断, so a naive "diagnose" classifier sends it to read-only mode and
 * the file never gets written. The rule is structural: save verb + file kind,
 * within 12 characters and without crossing a sentence boundary.
 *
 * This gate is intentionally deterministic. It runs before Pro, so Pro is not
 * the only thing deciding whether a request is an answer or a task.
 */

export const MODE = Object.freeze({
  QUESTION: 'QUESTION',
  DIAGNOSE: 'DIAGNOSE',
  PLAN: 'PLAN',
  EXECUTE: 'EXECUTE',
});

const AUTHORIZED_MODES = new Set([MODE.EXECUTE]);
export const isExecutionAuthorized = (mode) => AUTHORIZED_MODES.has(mode);

export const READONLY_SKILLS = new Set([
  'file-read', 'file-list', 'file-search', 'doc-read',
  'image-info', 'image-ocr', 'web-fetch', 'calculator',
]);
export const META_TOOLS = new Set([
  'workflow_plan', 'request_material', 'clarify_requirements', 'pick_local_files',
]);
export const PRODUCER_SKILLS = new Set([
  'file-write', 'docx-generate', 'pdf-generate', 'ppt-generate',
  'excel-generate', 'chart-generate', 'image-generate',
]);

export function isSkillAllowed(skillName, mode) {
  const name = String(skillName || '');
  if (!name) return { allowed: false, reason: 'empty-name' };
  if (isExecutionAuthorized(mode)) return { allowed: true, reason: 'authorized' };
  if (META_TOOLS.has(name)) return { allowed: true, reason: 'meta-tool' };
  if (READONLY_SKILLS.has(name)) return { allowed: true, reason: 'readonly' };
  return { allowed: false, reason: 'needs-authorization' };
}

const NO_EXEC_PATTERNS = [
  /(?:先别|不要|别|不用|无需|不必)(?:去)?(?:动手|改|做|写|执行|部署|动|生成)/,
  /(?:只|先)(?:回答我|告诉我|说说|讲讲)/,
];
const EXEC_PATTERNS = [
  /(?:帮我|给我|替我|麻烦你?|请你?)(?:做|写|生成|改|修|导出|存|保存|整理|建|搭|跑|执行|部署)/,
  /(?:执行|开始做|动手|去做|搞定|改好|修好|完成它)/,
];
const TRUE_INQUIRY_RE = /(为什么|为何|什么|啥|怎么|如何|怎样|哪里|哪个|哪一|是不是|是否|算不算|对不对|有没|要不要)/;
const DIAGNOSE_PATTERNS = [
  /(查一下|查下|排查|诊断|定位|分析|看一下|看看)/,
  /(为什么|原因|怎么造成|什么导致的)/,
];
const PLAN_PATTERNS = [
  /(方案|建议|思路|计划|怎么改|如何改|选哪个|有什么办法)/,
];
const QUESTION_PATTERNS = [
  /[？?]\s*$/,
  /(吗|呢)\s*[？?]?\s*$/,
  /(什么是|是什么意思|能不能|可不可以|会不会)/,
];

/** Save verb + file kind, at most 12 chars apart, no sentence break. */
export const SAVE_VERB_RE = /(?:存成|存为|保存成|保存为|另存为|存到|保存到|写到|写入|写成|导出成|导出为|导出到|输出成|输出为|输出到|整理成|做成|转成)/;
export const FILE_KIND_RE = /(?:文件|文档|报告|表格|文案|清单|方案|总结|Word|word|DOCX|docx|PDF|pdf|Excel|excel|XLSX|xlsx|PPT|ppt|PPTX|pptx|TXT|txt|Markdown|markdown|md|图片|照片|截图|\.[a-z0-9]{2,5})/;
export const ARTIFACT_SAVE_RE = new RegExp(SAVE_VERB_RE.source + '[^。！？?]{0,12}' + FILE_KIND_RE.source);

/**
 * @param {string} userText
 * @returns {{mode:string, reason:string, signals:string[]}}
 */
export function classifyIntent(userText) {
  const text = String(userText == null ? '' : userText).trim();
  if (!text) return { mode: MODE.EXECUTE, reason: 'empty-input', signals: [] };

  if (NO_EXEC_PATTERNS.some((re) => re.test(text))) {
    const diag = DIAGNOSE_PATTERNS.some((re) => re.test(text));
    return { mode: diag ? MODE.DIAGNOSE : MODE.QUESTION, reason: 'explicit-no-execute', signals: [] };
  }

  const exec = EXEC_PATTERNS.filter((re) => re.test(text)).map(String);
  if (exec.length) return { mode: MODE.EXECUTE, reason: 'explicit-execute', signals: exec };

  // Must run before the diagnose branch: "把诊断报告存成 Word" contains 诊断.
  if (!TRUE_INQUIRY_RE.test(text) && ARTIFACT_SAVE_RE.test(text)) {
    return { mode: MODE.EXECUTE, reason: 'artifact-save', signals: [String(ARTIFACT_SAVE_RE)] };
  }

  if (DIAGNOSE_PATTERNS.some((re) => re.test(text))) {
    return { mode: MODE.DIAGNOSE, reason: 'diagnose', signals: [] };
  }
  if (PLAN_PATTERNS.some((re) => re.test(text))) {
    return { mode: MODE.PLAN, reason: 'plan', signals: [] };
  }
  if (QUESTION_PATTERNS.some((re) => re.test(text))) {
    return { mode: MODE.QUESTION, reason: 'question', signals: [] };
  }
  return { mode: MODE.EXECUTE, reason: 'default-execute', signals: [] };
}

const DELIVERY_AUTH_REASONS = new Set(['explicit-execute', 'artifact-save']);
const CREATION_QUANTIFIER_RE = /(?:写|生成|制作|做|画|创建|新建|搭建|出|整理|输出)(?:一个|一份|一张|一套|一篇|一版|个|份|张|套|篇|版)/;
const IMPERATIVE_YIXIA_RE = /(?:跑|试|执行|调|改|弄|搞|处理|做|写|生成|画|建|搭|装|部署|上传|打包)(?:一下|下)/;
const AFFIRM_WORDS = new Set([
  '好', '好的', '可以', '可以了', '行', '行吧', '嗯', '对', '是的', '没问题', '同意',
  '做吧', '开始', '开始吧', '干吧', '去吧', '搞吧', '动手', '开工', '继续', '接着来',
  'ok', 'okay',
]);
const AFFIRM_THEN_REQUEST_RE = /^(?:可以|好|行|没问题|同意|嗯)(?:但|不过|只是|另外|同时|顺便|然后)/;

function squash(text) {
  return String(text == null ? '' : text)
    .replace(/[\s，,。.!！?？~～、；;："'“”‘’…—-]/g, '')
    .toLowerCase();
}

export function isAffirmative(text) {
  const t = squash(text);
  if (!t) return false;
  if (AFFIRM_WORDS.has(t)) return true;
  if (AFFIRM_THEN_REQUEST_RE.test(t)) return true;
  for (const w of AFFIRM_WORDS) {
    if (w.length >= t.length) continue;
    if (t.indexOf(w) !== 0) continue;
    if (AFFIRM_WORDS.has(t.slice(w.length))) return true;
  }
  return false;
}

/**
 * Is this turn allowed to create a new artifact?
 * `default-execute` is deliberately not authorized: it means "nothing matched".
 */
export function isDeliveryAuthorized(userText) {
  const text = String(userText == null ? '' : userText);
  if (!text.trim()) return { ok: false, reason: 'empty-input' };
  const intent = classifyIntent(text);
  if (DELIVERY_AUTH_REASONS.has(intent.reason)) return { ok: true, reason: intent.reason };
  if (isAffirmative(text)) return { ok: true, reason: 'affirmative' };
  if (CREATION_QUANTIFIER_RE.test(text)) return { ok: true, reason: 'creation-with-quantifier' };
  if (IMPERATIVE_YIXIA_RE.test(text)) return { ok: true, reason: 'imperative-with-yixia' };
  return { ok: false, reason: intent.reason };
}

/**
 * New-artifact authorization gate. Only producer skills, only when the target
 * does not already exist, and only once per task.
 */
export function planAuthGate(opts) {
  const o = opts || {};
  const name = String(o.skillName || '');
  const pass = (reason) => ({ blocked: false, reason, target: '', directive: '' });
  if (!PRODUCER_SKILLS.has(name)) return pass('not-producer-skill');
  if (o.pathExists === true) return pass('overwrite-existing');
  if (o.alreadyBlocked === true) return pass('already-blocked-once');
  if (o.alreadyGranted === true) return pass('granted-by-answer');

  const auth = isDeliveryAuthorized(o.userText);
  if (auth.ok) return pass('authorized:' + auth.reason);

  const target = String(o.target == null ? '' : o.target);
  return {
    blocked: true,
    reason: 'no-delivery-auth:' + auth.reason,
    target,
    directive:
      '【没有创建文件】这一轮用户说的是「' + String(o.userText || '').slice(0, 120) + '」，' +
      '既没有动作要求，也没有明确点头。若确实该出一份文件，问一句「要我现在整理成文件吗？」然后停下等回复；' +
      '用户回「可以 / 做吧」后下一轮直接做。禁止换个技能名或换个路径重试。',
  };
}
