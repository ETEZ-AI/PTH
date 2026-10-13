import test from 'node:test';
import assert from 'node:assert/strict';
import { seedState, getTask, checkTask, act, allowedActions, exportBundle, validateState } from '../dist/model.js';

function send(state, taskId, roleId, type, payload = {}) {
  return act(state, { type, taskId, roleId, payload, expectedRevision: getTask(state, taskId).revision });
}
function qualityReady(state = seedState(), taskId = 'HJ-002') {
  state = send(state, taskId, 'site', 'check');
  return send(state, taskId, 'site', 'submit');
}
function finish(state, taskId = 'HJ-002') {
  state = send(state, taskId, 'quality', 'review', { decision: 'pass' });
  state = send(state, taskId, 'receiver', 'receive', { decision: 'accept' });
  return send(state, taskId, 'coordinator', 'archive');
}
function ownerThenSubmit(state, taskId) {
  if (getTask(state, taskId).status !== 'pending_owner') {
    state = send(state, taskId, 'site', 'check');
    state = send(state, taskId, 'site', 'submit');
  }
  state = send(state, taskId, 'owner', 'approve_change', { reason: '核实补充培训与修订证据。' });
  state = send(state, taskId, 'site', 'check');
  return send(state, taskId, 'site', 'submit');
}

test('seed is valid and deterministic rules explain old-version evidence', () => {
  const state = seedState();
  assert.equal(validateState(state), true);
  const findings = checkTask(state, getTask(state, 'HJ-001'));
  assert.deepEqual(new Set(findings.map((item) => item.type)), new Set(['conflict', 'unconfirmed']));
  assert.ok(findings.some((item) => item.id === 'instruction-version' && item.sourceIds.includes('instruction-v2')));
  assert.ok(findings.some((item) => item.id === 'training-version' && item.sourceIds.includes('training-v1')));
  assert.equal(checkTask(state, getTask(state, 'HJ-002')).length, 0);
});

test('complete clean workflow archives same revision with source and human evidence', () => {
  const initial = seedState();
  const state = finish(qualityReady(initial));
  const task = getTask(state, 'HJ-002');
  assert.equal(task.status, 'archived');
  assert.equal(task.revision, 1);
  assert.equal(task.confirmations.length, 2);
  assert.ok(task.confirmations.every((entry) => entry.revision === 1 && entry.valid));
  assert.equal(task.archivedSources.length, 6);
  const bundle = exportBundle(state, task.id, 'receiver');
  assert.equal(bundle.task.id, task.id);
  assert.ok(bundle.notice.includes('AI 未接入'));
  assert.ok(bundle.audit.some((event) => event.action === 'archive'));
  assert.equal(getTask(initial, task.id).status, 'draft', 'actions must not mutate prior state');
});

test('archive retains the supplied human explanation in the record and audit', () => {
  let state = qualityReady();
  state = send(state, 'HJ-002', 'quality', 'review', { decision: 'pass' });
  state = send(state, 'HJ-002', 'receiver', 'receive', { decision: 'accept' });
  const reason = '已逐项核查演示来源和 r1 确认回执，移交资料管理。';
  state = send(state, 'HJ-002', 'coordinator', 'archive', { reason });
  assert.equal(getTask(state, 'HJ-002').archivedReason, reason);
  assert.ok(state.audit.findLast((event) => event.action === 'archive').detail.includes(reason));
  assert.equal(exportBundle(state, 'HJ-002', 'coordinator').task.archivedReason, reason);
});

test('night-shift anomaly reaches archive only after correction, owner and quality confirmation', () => {
  let state = seedState();
  state = send(state, 'HJ-001', 'site', 'check');
  assert.throws(() => send(state, 'HJ-001', 'site', 'submit'), /阻塞问题/);
  state = send(state, 'HJ-001', 'site', 'update', { instructionVersion: 'v2', trainingVersion: 'v2', trainingConfirmed: true, keyChecked: true, changeReason: '已补充封签复核培训记录及当班确认。' });
  state = send(state, 'HJ-001', 'site', 'check');
  assert.throws(() => send(state, 'HJ-001', 'site', 'submit'), /未结异常/);
  state = send(state, 'HJ-001', 'site', 'resolve_issue', { issueId: 'ISS-001', resolution: '对照指引 v2 完成封签复核，补充培训及现场确认。' });
  state = ownerThenSubmit(state, 'HJ-001');
  state = finish(state, 'HJ-001');
  const task = getTask(state, 'HJ-001');
  assert.equal(task.status, 'archived');
  assert.equal(task.revision, 3);
  assert.equal(task.original.instructionVersion, 'v1');
  assert.equal(task.revisions.length, 2);
  assert.equal(task.issues[0].reviewedRevision, 3);
  assert.deepEqual(task.confirmations.filter((entry) => entry.valid).map((entry) => entry.type), ['owner', 'quality', 'receiver']);
});

test('missing training version and unconfirmed existing record remain different findings', () => {
  const state = seedState();
  const task = getTask(state, 'HJ-002');
  task.trainingVersion = '';
  task.trainingConfirmed = false;
  const findings = checkTask(state, task);
  assert.equal(findings.find((entry) => entry.id === 'missing-training').type, 'missing');
  assert.equal(findings.find((entry) => entry.id === 'training-unconfirmed').type, 'unconfirmed');
});

test('version validity follows business occurrence time, not current time', () => {
  const state = seedState();
  const task = getTask(state, 'HJ-002');
  task.occurredAt = '2026-10-05T09:00:00+08:00';
  task.instructionVersion = 'v1';
  task.trainingVersion = 'v1';
  assert.equal(checkTask(state, task).length, 0);
  task.instructionVersion = 'v2';
  assert.ok(checkTask(state, task).some((item) => item.id === 'instruction-version'));
});

test('overlapping effective instructions cannot be auto-selected', () => {
  const state = seedState();
  state.sources.find((source) => source.id === 'instruction-v1').validTo = '';
  assert.ok(checkTask(state, getTask(state, 'HJ-002')).some((item) => item.id === 'instruction-ambiguous'));
});

test('wrong demo role cannot review, receive, archive or change source health', () => {
  const state = qualityReady();
  assert.throws(() => send(state, 'HJ-002', 'site', 'review', { decision: 'pass' }), /不能/);
  const reviewed = send(state, 'HJ-002', 'quality', 'review', { decision: 'pass' });
  assert.throws(() => send(reviewed, 'HJ-002', 'quality', 'receive', { decision: 'accept' }), /不能/);
  const received = send(reviewed, 'HJ-002', 'receiver', 'receive', { decision: 'accept' });
  assert.throws(() => send(received, 'HJ-002', 'site', 'archive'), /不能/);
  assert.throws(() => act(state, { type: 'source_failure', roleId: 'quality' }), /仅交付协调员/);
});

test('unassigned receiver and foreign scope cannot access export or actions', () => {
  const state = seedState();
  const task = getTask(state, 'HJ-002');
  task.receiverId = 'other-receiver';
  assert.deepEqual(allowedActions(state, task, 'receiver'), []);
  assert.throws(() => exportBundle(state, task.id, 'receiver'), /未指定/);
  task.scope = 'another-project';
  assert.equal(validateState(state), false);
  assert.throws(() => exportBundle(state, task.id, 'coordinator'), /格式异常/);
});

test('source failure keeps snapshot and blocks pass; restoring still requires recheck', () => {
  let state = qualityReady();
  const sources = structuredClone(state.sources);
  const readAt = state.sourceHealth.lastReadAt;
  state = act(state, { type: 'source_failure', roleId: 'coordinator' });
  assert.deepEqual(state.sources, sources);
  assert.equal(state.sourceHealth.lastReadAt, readAt);
  assert.equal(getTask(state, 'HJ-002').checkedRevision, null);
  assert.throws(() => send(state, 'HJ-002', 'quality', 'review', { decision: 'pass' }), /来源读取失败/);
  state = act(state, { type: 'source_restore', roleId: 'coordinator' });
  assert.throws(() => send(state, 'HJ-002', 'quality', 'review', { decision: 'pass' }), /尚未核对/);
  state = send(state, 'HJ-002', 'quality', 'check');
  assert.equal(send(state, 'HJ-002', 'quality', 'review', { decision: 'pass' }).tasks.find((task) => task.id === 'HJ-002').status, 'pending_receive');
});

test('stale revision cannot overwrite a newer local state', () => {
  let state = seedState();
  state = send(state, 'HJ-002', 'site', 'update', { note: '补充交接说明。' });
  assert.throws(() => act(state, { type: 'update', taskId: 'HJ-002', roleId: 'site', payload: { note: '旧页面修改。' }, expectedRevision: 1 }), /版本已变化/);
});

test('a changed revision invalidates prior quality and receiver confirmations', () => {
  let state = qualityReady();
  state = send(state, 'HJ-002', 'quality', 'review', { decision: 'pass' });
  state = send(state, 'HJ-002', 'receiver', 'receive', { decision: 'accept' });
  state = send(state, 'HJ-002', 'site', 'update', { note: '修订交接说明。', changeReason: '接收后发现说明需要补充，重新确认。' });
  const task = getTask(state, 'HJ-002');
  assert.equal(task.revision, 2);
  assert.equal(task.status, 'pending_owner');
  assert.equal(task.checkedRevision, null);
  assert.ok(task.confirmations.every((entry) => entry.valid === false));
  assert.throws(() => send(state, task.id, 'coordinator', 'archive'), /不能/);
  state = ownerThenSubmit(state, task.id);
  state = finish(state, task.id);
  assert.equal(getTask(state, task.id).status, 'archived');
  assert.equal(getTask(state, task.id).confirmations.filter((entry) => entry.valid).length, 3);
});

test('quality return and hold require explanations and retain unresolved work', () => {
  for (const decision of ['return', 'hold']) {
    const state = qualityReady();
    assert.throws(() => send(state, 'HJ-002', 'quality', 'review', { decision, reason: '  ' }), /必须填写原因/);
    const next = send(state, 'HJ-002', 'quality', 'review', { decision, reason: '封签复核证据需补充说明。' });
    const task = getTask(next, 'HJ-002');
    assert.equal(task.status, 'needs_info');
    assert.equal(task.issues[0].status, 'open');
    assert.equal(task.issues[0].owner, 'site');
    assert.equal(task.confirmations[0].decision, decision);
  }
});

test('receiver return requires reason and loops through correction and renewed review', () => {
  let state = qualityReady();
  state = send(state, 'HJ-002', 'quality', 'review', { decision: 'pass' });
  assert.throws(() => send(state, 'HJ-002', 'receiver', 'receive', { decision: 'return', reason: '' }), /必须填写/);
  state = send(state, 'HJ-002', 'receiver', 'receive', { decision: 'return', reason: '请补充封签核对结果位置。' });
  const issueId = getTask(state, 'HJ-002').issues[0].id;
  state = send(state, 'HJ-002', 'site', 'resolve_issue', { issueId, resolution: '已补充复核结果位于演示台账第 02 行。' });
  state = ownerThenSubmit(state, 'HJ-002');
  state = finish(state);
  const task = getTask(state, 'HJ-002');
  assert.equal(task.status, 'archived');
  assert.ok(task.confirmations.some((entry) => entry.type === 'receiver' && entry.decision === 'return' && !entry.valid));
});

test('unaccepted responsibility blocks resolution and closure', () => {
  let state = seedState();
  getTask(state, 'HJ-001').issues[0].ownerAccepted = false;
  assert.ok(checkTask(state, getTask(state, 'HJ-001')).some((item) => item.id === 'issue-owner-ISS-001'));
  assert.throws(() => send(state, 'HJ-001', 'site', 'resolve_issue', { issueId: 'ISS-001', resolution: '尝试处理' }), /责任尚未接受/);
});

test('duplicates do not produce repeated submit, confirmation or archive', () => {
  let state = qualityReady();
  assert.throws(() => send(state, 'HJ-002', 'site', 'submit'), /不能/);
  state = send(state, 'HJ-002', 'quality', 'review', { decision: 'pass' });
  assert.throws(() => send(state, 'HJ-002', 'quality', 'review', { decision: 'pass' }), /不能/);
  state = send(state, 'HJ-002', 'receiver', 'receive', { decision: 'accept' });
  state = send(state, 'HJ-002', 'coordinator', 'archive');
  assert.throws(() => send(state, 'HJ-002', 'coordinator', 'archive'), /已冻结/);
  assert.equal(getTask(state, 'HJ-002').confirmations.length, 2);
});

test('archived record and archived source snapshot cannot be edited by workflow actions', () => {
  const state = finish(qualityReady());
  assert.throws(() => send(state, 'HJ-002', 'site', 'update', { note: '覆盖归档', changeReason: '不允许' }), /已冻结/);
  const bundle = exportBundle(state, 'HJ-002', 'coordinator');
  bundle.task.note = '外部修改';
  bundle.sources[0].quote = '外部修改';
  assert.notEqual(getTask(state, 'HJ-002').note, bundle.task.note);
  assert.notEqual(getTask(state, 'HJ-002').archivedSources[0].quote, bundle.sources[0].quote);
});

test('create validates role, required scope, dates and unique local identifiers', () => {
  const payload = { title: '演示新交接', batch: 'B-20261013', jobCode: 'PK-01', processCode: 'PK-07', shift: '日班', occurredAt: '2026-10-13T10:00:00+08:00', dueAt: '2026-10-13T18:00:00+08:00', receiverId: 'receiver' };
  const state = seedState();
  assert.throws(() => act(state, { type: 'create', roleId: 'site', payload }), /仅交付协调员/);
  assert.throws(() => act(state, { type: 'create', roleId: 'coordinator', payload: { ...payload, jobCode: 'OTHER' } }), /仅覆盖岗位/);
  assert.throws(() => act(state, { type: 'create', roleId: 'coordinator', payload: { ...payload, dueAt: '2026-10-12T18:00:00+08:00' } }), /不能早于/);
  const next = act(state, { type: 'create', roleId: 'coordinator', payload });
  const created = getTask(next, 'HJ-004');
  assert.equal(created.status, 'draft');
  assert.equal(created.instructionVersion, '');
  assert.equal(validateState(next), true);
});

test('unknown direct-edit fields cannot bypass workflow rules', () => {
  const state = seedState();
  assert.throws(() => send(state, 'HJ-002', 'site', 'update', { status: 'archived' }), /不可直接修改/);
  assert.throws(() => send(state, 'HJ-002', 'site', 'update', { instructionVersion: 'v1' }), /填写变更原因/);
  assert.throws(() => send(state, 'HJ-002', 'site', 'update', { keyChecked: 'yes' }), /明确的是或否/);
});

test('revision audit names changed business fields in Chinese', () => {
  const state = send(seedState(), 'HJ-001', 'site', 'update', { instructionVersion: 'v2', trainingVersion: 'v2', trainingConfirmed: true, keyChecked: true, note: '补充说明。', changeReason: '补充新指引覆盖证据。' });
  const detail = state.audit.findLast((event) => event.action === 'update').detail;
  assert.ok(detail.includes('指引版本、培训依据、培训确认、关键字段核对、交接备注'));
  assert.ok(!detail.includes('instructionVersion'));
});

test('saved JSON roundtrips; malformed and duplicate records are rejected', () => {
  const state = finish(qualityReady());
  assert.equal(validateState(JSON.parse(JSON.stringify(state))), true);
  assert.equal(validateState(null), false);
  assert.equal(validateState({ schemaVersion: 1 }), false);
  const duplicate = structuredClone(state);
  duplicate.tasks.push(duplicate.tasks[0]);
  assert.equal(validateState(duplicate), false);
  const broken = structuredClone(state);
  broken.tasks[0].revision = '3';
  assert.equal(validateState(broken), false);
});

test('malformed nested saved records are rejected before UI rendering', () => {
  let seed = seedState();
  seed = send(seed, 'HJ-001', 'site', 'check');
  seed = finish(qualityReady(seed));
  const mutations = [
    (state) => { state.tasks = []; },
    (state) => { state.tasks[0].findings[0].title = {}; },
    (state) => { state.tasks[0].findings[0].detail = null; },
    (state) => { state.tasks[0].findings[0].type = 'unknown'; },
    (state) => { state.tasks[0].findings[0].sourceIds = [null]; },
    (state) => { state.tasks[0].findings[0].blocking = 'true'; },
    (state) => { state.tasks[0].issues[0].ownerAccepted = 'true'; },
    (state) => { state.tasks[1].confirmations[0].decision = {}; },
    (state) => { state.tasks[1].confirmations[0].valid = 'yes'; },
    (state) => { state.tasks[1].confirmations[0].reason = null; },
    (state) => { state.sources[0].kind = null; },
    (state) => { state.tasks[0].history[0].detail = {}; },
  ];
  for (const mutate of mutations) {
    const state = structuredClone(seed);
    mutate(state);
    assert.equal(validateState(state), false, mutate.toString());
  }
});
