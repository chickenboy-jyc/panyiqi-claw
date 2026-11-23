import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODE,
  classifyIntent,
  isDeliveryAuthorized,
  planAuthGate,
} from '../src/tiger/intent-gate.js';

test('artifact-save: save verb + file kind wins over the word 诊断', () => {
  const r = classifyIntent('把这份诊断报告存成 Word 文件');
  assert.equal(r.mode, MODE.EXECUTE);
  assert.equal(r.reason, 'artifact-save');
});

test('a true question about saving a file stays a question/diagnose', () => {
  const r = classifyIntent('为什么这份报告存不成 Word 文件？');
  assert.notEqual(r.mode, MODE.EXECUTE);
});

test('explicit execute is recognized', () => {
  const r = classifyIntent('帮我修一下这个 bug');
  assert.equal(r.mode, MODE.EXECUTE);
  assert.equal(r.reason, 'explicit-execute');
});

test('explicit no-execute is not overridden by a later verb', () => {
  const r = classifyIntent('先别改，只告诉我为什么');
  assert.notEqual(r.mode, MODE.EXECUTE);
});

test('delivery authorization: artifact-save is authorized, "看看" is not', () => {
  assert.equal(isDeliveryAuthorized('把报告存成 Word 文件').ok, true);
  assert.equal(isDeliveryAuthorized('看看这个报告写得怎么样').ok, false);
});

test('planAuthGate blocks a new file without delivery authorization', () => {
  const blocked = planAuthGate({
    skillName: 'file-write',
    pathExists: false,
    userText: '看看这个报告写得怎么样',
    target: 'report.docx',
  });
  assert.equal(blocked.blocked, true);
  assert.match(blocked.reason, /no-delivery-auth/);
});

test('planAuthGate allows an explicit save request', () => {
  const ok = planAuthGate({
    skillName: 'file-write',
    pathExists: false,
    userText: '把这份诊断报告存成 Word 文件',
    target: 'report.docx',
  });
  assert.equal(ok.blocked, false);
  assert.match(ok.reason, /artifact-save/);
});
