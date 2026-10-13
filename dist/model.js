/** Browser-local synthetic demo. Role checks below are workflow guards, not server authentication. */
export const ROLES = Object.freeze([
  { id: 'site', name: '现场专员', person: '林亦舟' },
  { id: 'coordinator', name: '交付协调员', person: '唐映秋' },
  { id: 'owner', name: '业务负责人', person: '顾明岚' },
  { id: 'quality', name: '质量复核员', person: '傅景' },
  { id: 'receiver', name: '接收人员', person: '演示接收人' },
]);

export const STATUS = Object.freeze({
  draft: '草稿', needs_info: '待补充 / 重新核对', pending_owner: '待业务变更确认',
  pending_quality: '待质量复核', pending_receive: '待接收确认',
  ready_archive: '待归档', archived: '已归档',
});

const EDIT_FIELDS = ['instructionVersion', 'trainingVersion', 'trainingConfirmed', 'keyChecked', 'note'];
const FIELD_LABELS = { instructionVersion: '指引版本', trainingVersion: '培训依据', trainingConfirmed: '培训确认', keyChecked: '关键字段核对', note: '交接备注' };
const EVIDENCE_FIELDS = ['instructionVersion', 'trainingVersion', 'trainingConfirmed'];
const now = () => new Date().toISOString();
const copy = (value) => structuredClone(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const date = (value) => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value));
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const role = (id) => ROLES.find((entry) => entry.id === id);
const uid = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const latest = (task, type) => task.confirmations.findLast((entry) => entry.type === type && entry.revision === task.revision && entry.valid !== false && entry.decision === 'pass');

function snapshot(task) {
  const { history, revisions, original, ...record } = task;
  return copy(record);
}

function record(state, task, action, actor, detail) {
  const event = { id: uid('EV'), taskId: task?.id ?? null, action, actor, at: now(), revision: task?.revision ?? null, detail };
  state.audit.push(event);
  if (task) task.history.push(copy(event));
}

function ensureAccess(task, roleId) {
  requireThat(role(roleId), '请选择有效的演示角色。');
  requireThat(task?.scope === 'demo', '此记录不在当前演示项目范围内。');
  requireThat(roleId !== 'receiver' || task.receiverId === roleId, '此交接包未指定给当前接收人员。');
}

function invalidate(task, reason) {
  task.checkedRevision = null;
  task.findings = [];
  for (const confirmation of task.confirmations) {
    if (confirmation.valid !== false) {
      confirmation.valid = false;
      confirmation.invalidatedAt = now();
      confirmation.invalidatedReason = reason;
    }
  }
}

function revise(task, actor, reason) {
  const previous = snapshot(task);
  task.revisions.push({ revision: task.revision, at: now(), actor, reason, snapshot: previous });
  task.revision += 1;
  task.changeReason = reason;
  invalidate(task, `修订至 r${task.revision}：${reason}`);
}

function confirmation(task, actor, type, decision, reason) {
  task.confirmations.push({ id: uid('CF'), type, actor, person: role(actor).person, decision, reason, revision: task.revision, at: now(), valid: true, channel: '演示工作台（非正式业务回执）' });
}

function currentCheck(state, task) {
  requireThat(state.sourceHealth.status === 'ok', '来源读取失败：当前仅有历史快照，请先恢复并重新核对。');
  requireThat(task.checkedRevision === task.revision, '当前修订尚未核对，请先运行规则核对。');
  const findings = checkTask(state, task);
  requireThat(!findings.some((item) => item.blocking), `尚有阻塞问题：${findings.filter((item) => item.blocking).map((item) => item.title).join('；')}`);
  requireThat(task.keyChecked, '当班人员尚未确认关键字段。');
}

function addReturnIssue(task, title, reason) {
  task.issues.push({ id: uid('ISS'), title: `${title}：${reason}`, owner: 'site', ownerAccepted: true, status: 'open', resolution: '', dueAt: task.dueAt, sourceIds: ['handover-log'] });
}

export function seedState() {
  const sources = [
    { id: 'instruction-v1', kind: 'instruction', title: '包装工序作业指引', version: 'v1', locator: 'WI-PK-07 / 第 3 节（合成样本）', quote: '包装完成后，核对标签、批次及件数。v1 适用于 2026-09-01 至 2026-10-09 发生的交接。', status: 'confirmed', validFrom: '2026-09-01T00:00:00+08:00', validTo: '2026-10-09T23:59:59+08:00' },
    { id: 'instruction-v2', kind: 'instruction', title: '包装工序作业指引', version: 'v2', locator: 'WI-PK-07 / 第 3.4 节（合成样本）', quote: '自 2026-10-10 起，包装交接增加“封签复核”检查项；当班人员须核对培训覆盖记录及封签复核结果，并保留确认记录。', status: 'confirmed', validFrom: '2026-10-10T00:00:00+08:00', validTo: '' },
    { id: 'training-v1', kind: 'training', title: '包装岗位培训清单', version: 'v1', locator: 'TR-PK-01 / 第 12 行（合成样本）', quote: '岗位 PK-01，工序 PK-07；培训覆盖标签、批次及件数核对，使用 WI-PK-07 v1。此清单未包含“封签复核”。', status: 'confirmed', validFrom: '2026-09-01T00:00:00+08:00', validTo: '2026-10-09T23:59:59+08:00' },
    { id: 'training-v2', kind: 'training', title: '包装岗位补充培训记录', version: 'v2', locator: 'TR-PK-02 / 第 8 行（合成样本）', quote: '岗位 PK-01，工序 PK-07；补充培训覆盖 WI-PK-07 v2 新增的“封签复核”。记录确认状态须由现场人员核查，存在记录不自动代表已确认。', status: 'confirmed', validFrom: '2026-10-10T00:00:00+08:00', validTo: '' },
    { id: 'handover-log', kind: 'handover', title: '交接原始台账', version: '2026-10-12', locator: 'HL-DEMO / 第 01—03 行（合成样本）', quote: '分别记录业务发生时间、当班字段核对、接收人和未结项。补录时间不能替代业务发生时间；只填写“已完成”不构成完整交接。', status: 'confirmed', validFrom: '2026-10-12T00:00:00+08:00', validTo: '' },
    { id: 'quality-log', kind: 'quality', title: '演示闭环复核规则', version: 'demo-1', locator: 'QL-DEMO / 规则 01—04（设计建议）', quote: '同一修订须完成字段核对、必要的业务变更确认、质量复核与指定接收人确认；未处理或未复核的异常不得归档。演示确认不构成生产放行。', status: 'confirmed', validFrom: '2026-10-01T00:00:00+08:00', validTo: '' },
  ];
  const base = {
    batch: 'B-20261012', jobCode: 'PK-01', processCode: 'PK-07', receiverId: 'receiver', revision: 1,
    instructionVersion: 'v2', trainingVersion: 'v2', trainingConfirmed: true, keyChecked: true,
    note: '', issues: [], findings: [], confirmations: [], history: [], revisions: [], scope: 'demo',
    checkedRevision: null, changeReason: '', requiresOwnerApproval: false, submittedOnce: false,
  };
  const tasks = [
    { ...copy(base), id: 'HJ-001', title: '夜班包装交接 · 旧版清单待核对', shift: '夜班', occurredAt: '2026-10-12T22:00:00+08:00', dueAt: '2026-10-13T09:00:00+08:00', status: 'draft', instructionVersion: 'v1', trainingVersion: 'v1', trainingConfirmed: false, keyChecked: false, note: '原始记录仅写“已完成”，需要对照新指引补充核对。', issues: [{ id: 'ISS-001', title: '封签复核新增项未留存确认', owner: 'site', ownerAccepted: true, status: 'open', resolution: '', dueAt: '2026-10-13T09:00:00+08:00', sourceIds: ['instruction-v2', 'training-v1'] }] },
    { ...copy(base), id: 'HJ-002', title: '日班包装交接 · 完整资料样本', shift: '日班', occurredAt: '2026-10-12T10:00:00+08:00', dueAt: '2026-10-13T12:00:00+08:00', status: 'draft', note: '新版培训及封签复核记录齐备，等待提交人工复核。' },
    { ...copy(base), id: 'HJ-003', title: '中班包装交接 · 待质量复核', shift: '中班', occurredAt: '2026-10-12T16:00:00+08:00', dueAt: '2026-10-13T10:30:00+08:00', status: 'pending_quality', checkedRevision: 1, submittedOnce: true, note: '现场已提交 r1，请质量人员核对证据后给出结论。' },
  ];
  const state = { schemaVersion: 1, tasks, audit: [], sources, sourceHealth: { status: 'ok', lastReadAt: '2026-10-13T00:00:00.000Z', failedAt: null, reason: '' } };
  for (const task of tasks) {
    task.original = snapshot(task);
    record(state, task, 'seed', 'coordinator', '载入合成演示任务；不代表真实业务记录。');
  }
  record(state, tasks[2], 'submit', 'site', '演示样本已完成规则及字段核对，提交 r1 质量复核。');
  return state;
}

export function getTask(state, id) {
  const task = state.tasks.find((item) => item.id === id);
  requireThat(task, '未找到这份交接包，请重新选择任务。');
  return task;
}

export function checkTask(state, task) {
  const findings = [];
  const add = (id, type, title, detail, sourceIds = []) => findings.push({ id, type, title, detail, sourceIds, blocking: true });
  if (state.sourceHealth.status !== 'ok') add('source-stale', 'stale', '来源读取失败，仅保留历史快照', `最后读取时间：${state.sourceHealth.lastReadAt}。恢复来源并重新核对前，不能推进确认或归档。`, ['handover-log']);
  for (const [field, label] of [['batch', '批次'], ['jobCode', '岗位代号'], ['processCode', '工序'], ['shift', '班次'], ['receiverId', '接收人员']]) {
    if (!text(task[field])) add(`missing-${field}`, 'missing', `${label}缺失`, '请由协调员核实任务范围后补充，系统不会推测填写。', ['handover-log']);
  }
  if (!date(task.occurredAt)) add('missing-time', 'missing', '业务发生时间缺失或无效', '无法判断发生时适用的指引版本；录入时间不能代替发生时间。', ['handover-log']);
  if (!date(task.dueAt)) add('missing-due', 'missing', '处理期限缺失或无效', '请明确接收或异常处理期限。', ['handover-log']);
  if (task.receiverId && task.receiverId !== 'receiver') add('receiver-unknown', 'unconfirmed', '接收人员尚未纳入演示授权', '此 Demo 仅允许指定的演示接收人员确认。', ['handover-log']);
  const time = Date.parse(task.occurredAt);
  const instructions = state.sources.filter((source) => source.kind === 'instruction' && source.status === 'confirmed' && Date.parse(source.validFrom) <= time && (!source.validTo || time <= Date.parse(source.validTo)));
  const expected = instructions.length === 1 ? instructions[0] : null;
  if (date(task.occurredAt) && !expected) add('instruction-ambiguous', 'conflict', instructions.length ? '指引有效期重叠，需人工裁定' : '未找到发生时适用的已确认指引', '不能按上传顺序、文件名或“最新”标记自动选版。', instructions.map((item) => item.id));
  if (!text(task.instructionVersion)) add('missing-instruction', 'missing', '交接指引版本缺失', '请选择有证据支持的指引版本。', expected ? [expected.id] : []);
  else if (expected && task.instructionVersion !== expected.version) add('instruction-version', 'conflict', `交接指引 ${task.instructionVersion} 与适用 ${expected.version} 不一致`, `按业务发生时间应对照 ${expected.version}；v2 新增“封签复核”，旧记录不能直接视为覆盖。`, [expected.id, ...state.sources.filter((source) => source.kind === 'instruction' && source.version === task.instructionVersion).map((source) => source.id)]);
  if (!text(task.trainingVersion)) add('missing-training', 'missing', '培训记录版本缺失', '未找到培训记录版本，与“存在但尚未确认”分别处理。', ['training-v2']);
  else if (expected && task.trainingVersion !== expected.version) add('training-version', 'conflict', '培训记录未覆盖适用指引版本', `培训记录使用 ${task.trainingVersion}，发生时适用指引为 ${expected.version}。请核实新增项覆盖记录并由人员确认。`, [expected.id, ...state.sources.filter((source) => source.kind === 'training' && source.version === task.trainingVersion).map((source) => source.id)]);
  if (!task.trainingConfirmed) add('training-unconfirmed', 'unconfirmed', '培训记录待人工确认', '存在记录不代表已确认，请现场人员核实覆盖证据。', [`training-${task.trainingVersion || 'v2'}`].filter((id) => state.sources.some((source) => source.id === id)));
  if (!task.keyChecked) add('fields-unconfirmed', 'unconfirmed', '当班关键字段尚未核对', '请人工核对批次、岗位、工序、版本及新增检查项，再记录字段确认。', ['handover-log', expected?.id].filter(Boolean));
  for (const issue of task.issues) {
    if (!issue.owner || !issue.ownerAccepted) add(`issue-owner-${issue.id}`, 'unconfirmed', `异常责任尚未接受：${issue.title}`, '保留原责任链跟踪，候选责任人不视为已承接。', issue.sourceIds);
    if (issue.status !== 'resolved' || !text(issue.resolution)) add(`issue-${issue.id}`, 'unconfirmed', `未结异常：${issue.title}`, `责任角色：${role(issue.owner)?.name || '待明确'}；期限：${issue.dueAt || '待明确'}。须保留处理说明后再次送审。`, issue.sourceIds);
  }
  return findings;
}

export function allowedActions(state, task, roleId) {
  try { ensureAccess(task, roleId); } catch { return []; }
  if (task.status === 'archived') return ['export'];
  const actions = ['check', 'export'];
  if (roleId === 'site' || roleId === 'coordinator') {
    actions.push('update');
    if (task.issues.some((issue) => issue.status !== 'resolved')) actions.push('resolve_issue');
    if (['draft', 'needs_info'].includes(task.status)) actions.push('submit');
  }
  if (roleId === 'owner' && task.status === 'pending_owner') actions.push('approve_change');
  if (roleId === 'quality' && task.status === 'pending_quality') actions.push('review');
  if (roleId === 'receiver' && task.status === 'pending_receive') actions.push('receive');
  if (roleId === 'coordinator' && task.status === 'ready_archive') actions.push('archive');
  return actions;
}

export function act(input, { type, taskId, roleId, payload = {}, expectedRevision } = {}) {
  requireThat(role(roleId), '请选择有效的演示角色。');
  requireThat(validateState(input), '本地数据格式异常，请导出备份后重置演示数据。');
  const state = copy(input);
  if (type === 'source_failure' || type === 'source_restore') {
    requireThat(roleId === 'coordinator', '仅交付协调员可以演示来源故障与恢复。');
    const failed = type === 'source_failure';
    requireThat(state.sourceHealth.status !== (failed ? 'failed' : 'ok'), failed ? '来源已处于读取失败状态。' : '来源已经恢复，无需重复操作。');
    state.sourceHealth = { ...state.sourceHealth, status: failed ? 'failed' : 'ok', failedAt: failed ? now() : null, reason: failed ? (text(payload.reason) || '演示：只读资料连接失败') : '', ...(failed ? {} : { lastReadAt: now() }) };
    for (const task of state.tasks) if (task.status !== 'archived') { task.checkedRevision = null; task.findings = checkTask(state, task); }
    record(state, null, type, roleId, failed ? '模拟来源读取失败，保留旧快照；所有未归档任务须重新核对。' : '模拟来源恢复；重新核对后才可推进。此操作未连接真实系统。');
    return state;
  }
  if (type === 'create') {
    requireThat(roleId === 'coordinator', '仅交付协调员可以建立演示任务。');
    for (const field of ['title', 'batch', 'jobCode', 'processCode', 'shift', 'occurredAt', 'dueAt', 'receiverId']) requireThat(text(payload[field]), `创建任务缺少必填字段：${field}`);
    requireThat(date(payload.occurredAt) && date(payload.dueAt), '发生时间和处理期限必须是有效时间。');
    requireThat(Date.parse(payload.dueAt) >= Date.parse(payload.occurredAt), '处理期限不能早于业务发生时间。');
    requireThat(payload.receiverId === 'receiver', '请选择当前演示项目内的接收人员。');
    requireThat(payload.jobCode === 'PK-01' && payload.processCode === 'PK-07', '演示资料仅覆盖岗位 PK-01、工序 PK-07，请保持该范围。');
    const number = Math.max(0, ...state.tasks.map((task) => Number(task.id.replace('HJ-', '')) || 0)) + 1;
    const task = { id: `HJ-${String(number).padStart(3, '0')}`, title: text(payload.title), batch: text(payload.batch), jobCode: payload.jobCode, processCode: payload.processCode, shift: text(payload.shift), occurredAt: payload.occurredAt, dueAt: payload.dueAt, receiverId: payload.receiverId, revision: 1, status: 'draft', instructionVersion: '', trainingVersion: '', trainingConfirmed: false, keyChecked: false, note: '', issues: [], findings: [], confirmations: [], history: [], revisions: [], scope: 'demo', checkedRevision: null, changeReason: '', requiresOwnerApproval: false, submittedOnce: false };
    task.original = snapshot(task);
    state.tasks.push(task);
    record(state, task, type, roleId, '建立合成演示任务；资料待现场补充。');
    return state;
  }
  const task = getTask(state, taskId);
  ensureAccess(task, roleId);
  requireThat(expectedRevision === task.revision, `记录版本已变化：当前 r${task.revision}，请重新读取后再操作。`);
  requireThat(task.status !== 'archived', '已归档记录已冻结，不能原地修改或重复确认。');
  requireThat(allowedActions(state, task, roleId).includes(type), `${role(roleId).name}不能在“${STATUS[task.status]}”执行此操作。`);
  if (type === 'check') {
    task.findings = checkTask(state, task);
    task.checkedRevision = task.revision;
    record(state, task, type, roleId, `规则核对 r${task.revision}：${task.findings.length} 项待处理。未调用 AI 模型。`);
  } else if (type === 'update') {
    const unknown = Object.keys(payload).filter((field) => ![...EDIT_FIELDS, 'changeReason'].includes(field));
    requireThat(!unknown.length, `不可直接修改字段：${unknown.join('、')}`);
    for (const field of ['instructionVersion', 'trainingVersion']) if (Object.hasOwn(payload, field)) requireThat(['', 'v1', 'v2'].includes(payload[field]), '请选择演示资料中的 v1 或 v2 版本。');
    for (const field of ['trainingConfirmed', 'keyChecked']) if (Object.hasOwn(payload, field)) requireThat(typeof payload[field] === 'boolean', '确认字段须为明确的是或否。');
    if (Object.hasOwn(payload, 'note')) requireThat(typeof payload.note === 'string' && payload.note.length <= 4000, '交接说明须为不超过 4000 字的文本。');
    const changed = EDIT_FIELDS.filter((field) => Object.hasOwn(payload, field) && payload[field] !== task[field]);
    requireThat(changed.length, '没有可保存的修改。');
    const evidenceChanged = changed.some((field) => EVIDENCE_FIELDS.includes(field));
    const needsReason = evidenceChanged || task.revision > 1 || task.submittedOnce;
    requireThat(!needsReason || text(payload.changeReason), '修订资料必须填写变更原因，原记录将保留。');
    const reason = text(payload.changeReason) || '当班人员补充交接说明与字段核对';
    const needOwner = evidenceChanged || task.submittedOnce;
    revise(task, roleId, reason);
    for (const field of changed) task[field] = payload[field];
    task.requiresOwnerApproval = task.requiresOwnerApproval || needOwner;
    task.status = task.submittedOnce && task.requiresOwnerApproval ? 'pending_owner' : 'needs_info';
    record(state, task, type, roleId, `保存 r${task.revision}，修改 ${changed.map((field) => FIELD_LABELS[field]).join('、')}。原因：${reason}；旧确认保留并标记失效。`);
  } else if (type === 'resolve_issue') {
    const issue = task.issues.find((item) => item.id === payload.issueId);
    requireThat(issue && issue.status !== 'resolved', '未找到可处理的未结异常。');
    requireThat(text(payload.resolution), '请填写异常处理说明，不能直接标为已处理。');
    requireThat(issue.ownerAccepted, '异常责任尚未接受，请先由协调员核实责任链。');
    const reason = text(payload.resolution);
    const issueId = issue.id;
    revise(task, roleId, reason);
    const currentIssue = task.issues.find((item) => item.id === issueId);
    currentIssue.status = 'resolved'; currentIssue.resolution = reason; currentIssue.resolvedAt = now(); currentIssue.resolvedBy = roleId; currentIssue.reviewedRevision = null;
    task.requiresOwnerApproval = task.requiresOwnerApproval || task.submittedOnce;
    task.status = task.submittedOnce && task.requiresOwnerApproval ? 'pending_owner' : 'needs_info';
    record(state, task, type, roleId, `记录异常处理：${reason}。仍需当前修订的质量复核。`);
  } else if (type === 'submit') {
    currentCheck(state, task);
    task.submittedOnce = true;
    task.status = task.requiresOwnerApproval ? 'pending_owner' : 'pending_quality';
    record(state, task, type, roleId, `提交 r${task.revision}，进入${STATUS[task.status]}。`);
  } else if (type === 'approve_change') {
    requireThat(state.sourceHealth.status === 'ok', '来源读取失败，不能确认变更。');
    requireThat(task.requiresOwnerApproval, '当前修订没有待确认的业务变更。');
    const reason = text(payload.reason) || `确认修订依据：${task.changeReason}`;
    confirmation(task, roleId, 'owner', 'pass', reason);
    task.requiresOwnerApproval = false; task.checkedRevision = null; task.status = 'needs_info';
    record(state, task, type, roleId, '业务负责人确认演示变更；须重新核对本修订后提交质量复核。');
  } else if (type === 'review') {
    requireThat(['pass', 'return', 'hold'].includes(payload.decision), '请选择通过、退回或待核查。');
    const reason = text(payload.reason);
    requireThat(payload.decision === 'pass' || reason, '退回或待核查必须填写原因。');
    if (payload.decision === 'pass') {
      currentCheck(state, task);
      requireThat(!task.requiresOwnerApproval, '业务变更尚未确认，不能质量通过。');
      confirmation(task, roleId, 'quality', 'pass', reason || '已按当前修订核对来源、培训覆盖和异常处理记录。');
      for (const issue of task.issues) issue.reviewedRevision = task.revision;
      task.status = 'pending_receive';
    } else {
      invalidate(task, `质量${payload.decision === 'return' ? '退回' : '待核查'}：${reason}`);
      confirmation(task, roleId, 'quality', payload.decision, reason);
      addReturnIssue(task, payload.decision === 'return' ? '质量退回' : '质量待核查', reason);
      task.status = 'needs_info';
    }
    record(state, task, type, roleId, `质量结论：${{ pass: '通过', return: '退回', hold: '待核查' }[payload.decision]}。${reason}`);
  } else if (type === 'receive') {
    requireThat(['accept', 'return'].includes(payload.decision), '请选择接受或退回交接。');
    const reason = text(payload.reason);
    requireThat(payload.decision === 'accept' || reason, '退回交接必须填写具体原因。');
    if (payload.decision === 'accept') {
      currentCheck(state, task);
      requireThat(latest(task, 'quality'), '缺少当前修订有效的质量通过记录。');
      confirmation(task, roleId, 'receiver', 'pass', reason || '接收方已核对当前修订、来源、状态及未结项。');
      task.status = 'ready_archive';
    } else {
      invalidate(task, `接收退回：${reason}`);
      confirmation(task, roleId, 'receiver', 'return', reason);
      addReturnIssue(task, '接收退回', reason);
      task.status = 'needs_info';
    }
    record(state, task, type, roleId, `接收结论：${payload.decision === 'accept' ? '接受' : '退回'}。${reason}`);
  } else if (type === 'archive') {
    currentCheck(state, task);
    requireThat(!task.requiresOwnerApproval, '待确认的业务变更不能归档。');
    requireThat(latest(task, 'quality') && latest(task, 'receiver'), '缺少当前修订有效的质量与接收确认，不能归档。');
    requireThat(task.issues.every((issue) => issue.status === 'resolved' && issue.reviewedRevision === task.revision), '有异常尚未在当前修订完成质量复核。');
    task.status = 'archived'; task.archivedAt = now(); task.archivedBy = roleId;
    task.archivedReason = text(payload.reason) || '已核对来源、当前修订确认链及异常处理记录，证据完整。';
    task.archivedSources = copy(state.sources);
    task.archivedSourceHealth = copy(state.sourceHealth);
    record(state, task, type, roleId, `交接记录闭环并冻结归档。归档说明：${task.archivedReason}；这不是设备操作许可或生产放行。`);
  } else throw new Error('不支持此操作。');
  return state;
}

export function exportBundle(state, taskId, roleId) {
  requireThat(validateState(state), '本地数据格式异常，无法导出证据包。');
  const task = getTask(state, taskId);
  ensureAccess(task, roleId);
  return copy({ format: 'handover-demo-evidence-v1', exportedAt: now(), exportedBy: roleId, notice: '全部为合成演示资料；角色切换不是企业账号权限，演示确认不是正式业务回执。AI 未接入，核对由本地规则完成。', task, sources: task.archivedSources || state.sources, sourceHealth: task.archivedSourceHealth || state.sourceHealth, audit: state.audit.filter((entry) => entry.taskId === taskId || entry.taskId === null) });
}

export function validateState(state) {
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.tasks) || !Array.isArray(state.sources) || !Array.isArray(state.audit)) return false;
  if (!state.tasks.length || state.tasks.length > 2000 || state.sources.length > 1000 || state.audit.length > 50000) return false;
  if (!state.sourceHealth || !['ok', 'failed'].includes(state.sourceHealth.status) || !date(state.sourceHealth.lastReadAt)) return false;
  const ids = state.tasks.map((task) => task?.id);
  if (new Set(ids).size !== ids.length) return false;
  const stringIds = (values) => Array.isArray(values) && values.every((value) => Boolean(text(value)));
  const validEvent = (event) => event && text(event.id) && text(event.action) && role(event.actor) && date(event.at) && typeof event.detail === 'string';
  const validFinding = (item) => item && text(item.id) && ['missing', 'conflict', 'unconfirmed', 'stale'].includes(item.type) && text(item.title) && typeof item.detail === 'string' && stringIds(item.sourceIds) && typeof item.blocking === 'boolean';
  const validIssue = (issue) => issue && text(issue.id) && text(issue.title) && ['open', 'resolved'].includes(issue.status) && stringIds(issue.sourceIds) && typeof issue.resolution === 'string' && typeof issue.ownerAccepted === 'boolean';
  const validConfirmation = (entry) => entry && text(entry.id) && ['owner', 'quality', 'receiver'].includes(entry.type) && role(entry.actor) && Number.isInteger(entry.revision) && entry.revision > 0 && ['pass', 'return', 'hold'].includes(entry.decision) && typeof entry.valid === 'boolean' && typeof entry.reason === 'string' && date(entry.at);
  const validSource = (source) => source && ['instruction', 'training', 'handover', 'quality'].includes(source.kind) && ['id', 'title', 'version', 'locator', 'quote', 'status', 'validFrom', 'validTo'].every((field) => typeof source[field] === 'string');
  return state.tasks.every((task) => task && text(task.id) && text(task.title) && task.scope === 'demo' && Object.hasOwn(STATUS, task.status) && Number.isInteger(task.revision) && task.revision > 0 && ['batch', 'jobCode', 'processCode', 'shift', 'occurredAt', 'dueAt', 'receiverId', 'instructionVersion', 'trainingVersion', 'note', 'changeReason'].every((field) => typeof task[field] === 'string') && typeof task.trainingConfirmed === 'boolean' && typeof task.keyChecked === 'boolean' && typeof task.requiresOwnerApproval === 'boolean' && typeof task.submittedOnce === 'boolean' && (task.checkedRevision === null || (Number.isInteger(task.checkedRevision) && task.checkedRevision <= task.revision)) && Array.isArray(task.issues) && task.issues.every(validIssue) && Array.isArray(task.findings) && task.findings.every(validFinding) && Array.isArray(task.confirmations) && task.confirmations.every(validConfirmation) && Array.isArray(task.history) && task.history.every(validEvent) && Array.isArray(task.revisions) && task.original && typeof task.original === 'object') && state.sources.every(validSource) && state.audit.every(validEvent);
}
