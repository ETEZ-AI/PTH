import { ROLES, STATUS, seedState, checkTask, allowedActions, act, getTask, validateState, exportBundle } from './model.js';

const STORAGE = 'handover-evidence-demo.v1';
const SESSION = 'handover-evidence-demo.role';
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
let state, rawBroken = null, lastStored = null;
try { lastStored = localStorage.getItem(STORAGE); state = lastStored ? JSON.parse(lastStored) : seedState(); if (!validateState(state)) throw new Error('invalid'); }
catch { rawBroken = lastStored || '本地存储不可用'; state = seedState(); }
let role = 'site';
try { const saved = sessionStorage.getItem(SESSION); if (ROLES.some(r => r.id === saved)) role = saved; } catch {}
let selectedId = state.tasks[0]?.id, view = 'work', detailTab = 'overview', search = '', filter = 'all', flowZoom = false, toastTimer;
const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const fmt = value => !value ? '未记录' : Number.isNaN(Date.parse(value)) ? '时间无效' : new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const roleInfo = () => ROLES.find(r => r.id === role) || ROLES[0];
const task = () => getTask(state, selectedId);
const paths = {
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5M5 5v14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  inbox: '<path d="m4 4-2 11v5h20v-5L20 4Z"/><path d="M2 15h6l2 3h4l2-3h6"/>',
  flow: '<rect x="8" y="2" width="8" height="5" rx="1"/><rect x="2" y="17" width="7" height="5" rx="1"/><rect x="15" y="17" width="7" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/>',
  chart: '<path d="M4 3v18h17M8 16v-5m5 5V6m5 10v-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  file: '<path d="M14 2H5v20h14V7ZM14 2v5h5M8 12h8m-8 4h6"/>',
  spark: '<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8ZM20 2v4m-2-2h4"/>',
  alert: '<path d="m12 3 10 18H2Zm0 6v5m0 3v.1"/>',
  link: '<path d="m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"/>',
  edit: '<path d="m4 16 12-12 4 4L8 20H4Zm10-10 4 4"/>',
  shield: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6Zm-5 10 3 3 7-7"/>',
  down: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-4a8 6 0 0 1 16 0v4"/>',
  book: '<path d="M12 4C9 2 5 2 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-3-2-7-2-10 0Zm0 0v16"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
const button = (label, action, cls = '', iconName = '', attrs = '') => `<button class="button ${cls}" data-action="${action}" ${attrs}>${iconName ? icon(iconName) : ''}${label}</button>`;
const statusLabel = value => typeof STATUS[value] === 'string' ? STATUS[value] : STATUS[value]?.label || value;
const badge = value => `<span class="badge ${value === 'archived' || value === 'ready_archive' ? 'green' : value.startsWith('pending') ? 'blue' : value === 'needs_info' ? 'warn' : ''}">${e(statusLabel(value))}</span>`;
const actions = t => allowedActions(state, t, role);
const openIssueCount = t => (t.issues || []).filter(i => i.status !== 'resolved' || i.reviewedRevision !== t.revision).length;
const can = (type, t = task()) => actions(t).includes(type);
function notify(message, error = false) { const t = document.querySelector('#toast'); clearTimeout(toastTimer); t.textContent = message; t.className = `visible${error ? ' error' : ''}`; toastTimer = setTimeout(() => t.className = '', error ? 7000 : 4000); }
function persist(next) {
  if (localStorage.getItem(STORAGE) !== lastStored) throw new Error('其他标签页已更新记录，本次未覆盖。请刷新后重新办理。');
  const serialized = JSON.stringify(next);
  localStorage.setItem(STORAGE, serialized);
  lastStored = serialized; state = next;
}
function run(type, payload = {}, success = '已保存') {
  try { const next = act(state, { type, taskId:selectedId, roleId:role, payload, expectedRevision:task()?.revision }); persist(next); render(); notify(success); return true; }
  catch (error) { notify(error.message || '保存失败，请重试或导出当前记录。', true); return false; }
}
function switchRole(nextRole) { role = nextRole; try { sessionStorage.setItem(SESSION, role); } catch {} render(); notify(`演示角色已切换：${roleInfo().name}`); }
function counts() { return { total:state.tasks.length, pending:state.tasks.filter(t => ['pending_owner','pending_quality','pending_receive','ready_archive'].includes(t.status)).length, issues:state.tasks.reduce((n,t) => n + (t.issues || []).filter(i => i.status !== 'resolved' || i.reviewedRevision !== t.revision).length,0), closed:state.tasks.filter(t => t.status === 'archived').length }; }
function statsHTML() { const c=counts(); return `<div class="stats">${[['本批次交接',c.total,'份','file'],['等待人工确认',c.pending,'份','clock'],['未闭环异常',c.issues,'项','alert'],['已完成闭环',c.closed,'份','shield']].map(([label,value,unit,i]) => `<div class="stat"><div><div class="stat-label">${label}</div><div class="stat-value">${value}<small>${unit}</small></div></div><div class="stat-icon">${icon(i)}</div></div>`).join('')}</div>`; }
function render() {
  if (rawBroken !== null) { app.innerHTML = `<div class="recovery"><h1>本地记录需要恢复</h1><p>存储内容无法读取。原始内容仍保留，请先导出备份，再选择重新载入合成样本。</p><div class="actions-inline">${button('导出原始备份','broken-export','','down')}${button('重置合成样本','reset','danger','refresh')}</div></div>`; return; }
  const r = roleInfo(), c=counts();
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><span class="brandmark">${icon('arrow')}</span><div><strong>交接有据</strong><small>HANDOVER WORKSPACE</small></div></div><div class="nav-label">工作空间</div><nav class="nav" aria-label="主导航">${[['work','grid','交接工作台'],['queue','inbox','待办与异常'],['flow','flow','整体流程'],['metrics','chart','试点看板']].map(([id,i,label]) => `<button data-view="${id}" class="${view===id?'active':''}" ${view===id?'aria-current="page"':''}>${icon(i)}${label}${id==='queue'?`<span class="count">${c.pending+c.issues}</span>`:''}</button>`).join('')}</nav><div class="sidebar-footer"><div class="batch-stamp"><span class="dot"></span>演示工作区<strong>生产岗位培训 · 工序交接</strong><small>单批次范围 / 合成数据</small></div><div class="footnote">每一次交接，都有依据。<br>DEMO V1.0 · 只读来源</div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">业务外包 <span>/</span><strong>岗位作业交接</strong></div><div class="top-actions"><span class="save-state"><span class="dot"></span>浏览器本地保存</span><div class="role-control"><span class="avatar">${e((r.person||r.name).slice(0,1))}</span><div><label for="role-select">当前演示角色</label><select id="role-select">${ROLES.map(x=>`<option value="${x.id}" ${role===x.id?'selected':''}>${e(x.person)} · ${e(x.name)}</option>`).join('')}</select></div></div></div></header><div class="content"><div class="page-head"><div><div class="eyebrow">${({work:'Every handover, accounted for',queue:'Make the next step clear',flow:'From evidence to closure',metrics:'Quality before completion'})[view]}</div><h1>${({work:'交接工作台',queue:'待办与异常',flow:'整体业务流程',metrics:'试点运行看板'})[view]}</h1><p>${({work:'把资料、问题和确认串起来，让每一步都能追溯。',queue:'看到等待的原因，也知道下一步由谁处理。',flow:'从资料准备到接收归档，保留每个判断与退回路径。',metrics:'基于本地演示记录计算，不代表真实业务试点效果。'})[view]}</p></div><div class="actions-inline">${button('演示指南','guide','ghost','book')}${button('新建交接','create','primary','plus',role!=='coordinator'?'title="切换协调员后可创建任务"':'')}</div></div><div class="intro-strip"><span>${icon('spark')}<strong>规则辅助模式</strong> · 合成资料演示，未接入真实 AI 与企业账号；角色切换仅用于体验流程。</span>${button('了解边界','boundaries','ghost small')}</div>${view==='work'?statsHTML()+workHTML():view==='queue'?queueHTML():view==='flow'?flowHTML():metricsHTML()}</div></main></div>`;
}
function taskCards() {
  const list=state.tasks.filter(t=>(filter==='all'||t.status!=='archived')&&`${t.title} ${t.id} ${t.batch}`.toLowerCase().includes(search.toLowerCase()));
  return list.length?list.map(t=>`<button class="task-card ${selectedId===t.id?'selected':''}" data-task="${e(t.id)}" aria-label="打开 ${e(t.title)}"><div class="task-top"><span class="task-code mono">${e(t.id)}</span>${badge(t.status)}</div><div class="task-title">${e(t.title)}</div><div class="task-meta">${e(t.batch)} · ${e(t.shift)}<br>${e(t.jobCode)} / ${e(t.processCode)}</div><div class="task-bottom"><span>修订 ${t.revision} · ${e(t.instructionVersion)}</span><b>${openIssueCount(t) ? `${openIssueCount(t)} 项异常待闭环`:'查看交接 →'}</b></div></button>`).join(''):'<div class="empty-state">没有找到交接记录<br>试试其他关键词</div>';
}
function workHTML() { return `<div class="workarea"><section class="task-list" aria-label="交接列表"><div class="list-head">交接记录<span>${state.tasks.length} 份样本</span></div><div class="search">${icon('search')}<input id="search" type="search" value="${e(search)}" placeholder="搜索名称或编号" aria-label="搜索交接"></div><div class="list-filters"><button data-filter="all" class="${filter==='all'?'active':''}">全部</button><button data-filter="open" class="${filter==='open'?'active':''}">未归档</button></div><div class="task-cards">${taskCards()}</div><div class="list-foot">所有样本均为虚构 · 仅供演练</div></section>${detailHTML()}</div>`; }
function stepper(t) { const n = ({draft:0,needs_info:1,pending_owner:1,pending_quality:2,pending_receive:3,ready_archive:4,archived:5})[t.status]??0; return `<div class="stepper" aria-label="交接进度">${['资料准备','核对修正','质量复核','接收确认','归档追溯'].map((s,i)=>`<div class="step ${i<n?'done':i===n?'current':''}"><span class="stepnum">${i<n?'✓':i+1}</span><span>${s}</span></div>`).join('')}</div>`; }
function detailHTML() {
  const t=task(); if(!t) return '<section class="detail empty-state">选择或新建一份交接</section>';
  return `<section class="detail" aria-label="交接详情"><div class="detail-head"><div class="detail-kicker"><span class="mono">${e(t.id)}</span><span>/</span><span>修订 ${t.revision}</span>${badge(t.status)}</div><div class="detail-title"><h2>${e(t.title)}</h2>${button('证据包','export','small','down')}</div><div class="detail-sub">${e(t.batch)} · ${e(t.shift)} · 业务发生 ${fmt(t.occurredAt)}</div></div>${stepper(t)}<div class="tabs" role="tablist">${[['overview','交接概览'],['sources','来源依据'],['timeline','确认记录']].map(([id,label])=>`<button role="tab" aria-selected="${detailTab===id}" data-tab="${id}" class="${detailTab===id?'active':''}">${label}</button>`).join('')}</div><div class="detail-body">${detailTab==='overview'?overviewHTML(t):detailTab==='sources'?sourcesHTML(t):timelineHTML(t)}</div>${nextHTML(t)}</section>`;
}
function overviewHTML(t) {
  const receiver=ROLES.find(x=>x.id===t.receiverId);
  return `<div class="section-title"><h3>${icon('file')}交接资料</h3>${can('update',t)?button('编辑资料','edit','small','edit'):''}</div><dl class="data-grid">${[['岗位 / 工序',`${e(t.jobCode)} / ${e(t.processCode)}`],['交接引用指引',`<span class="version-chip">${e(t.instructionVersion)}</span>`],['培训依据',`<span class="version-chip">${e(t.trainingVersion)}</span>`],['培训确认',t.trainingConfirmed?'已确认':'<span class="muted">尚未确认</span>'],['接收人员',e(receiver?.person || '指定接收人')],['处理期限',fmt(t.dueAt)],['关键字段核对',t.keyChecked?'已由当班人员核对':'<span class="muted">等待当班核对</span>'],['资料读取',(t.archivedSourceHealth || state.sourceHealth)?.status==='failed'?'<span class="badge red">失败 · 旧快照</span>':'<span class="badge green">演示快照可用</span>'],['业务变更',t.requiresOwnerApproval?'<span class="badge warn">需负责人确认</span>':'无待确认变更']].map(([k,v])=>`<div class="data-item"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${t.note?`<p class="pending-note">交接备注：${e(t.note)}</p><div class="section-divider"></div>`:''}<div class="rule-box"><div class="rule-head"><strong>${icon('spark')}辅助核对清单</strong><small>规则模式 · 结果附来源</small></div><div class="rule-body">${findingsHTML(t)}</div></div>${(t.issues||[]).length?`<div class="section-divider"></div><div class="section-title"><h3>${icon('alert')}异常与处理记录</h3><span class="muted"><small>${t.issues.length} 项</small></span></div>${t.issues.map(i=>`<div class="issue-card"><h4>${e(i.title)}</h4><div class="issue-meta"><span>责任：${e(ROLES.find(r=>r.id===i.owner)?.name || i.owner || '待确认')}</span><span>${i.ownerAccepted?'已接受责任':'等待责任接受'}</span><span>期限 ${fmt(i.dueAt)}</span></div>${i.status==='resolved'?`<div class="resolved">✓ ${i.reviewedRevision===t.revision?'当前修订已质量复核':'处理说明已登记，等待质量复核'}：${e(i.resolution)}</div>`:button('登记处理结果','resolve','small','','data-issue="'+e(i.id)+'" '+(can('resolve_issue',t)?'':'disabled'))}</div>`).join('')}`:''}`;
}
function findingsHTML(t) {
  if(t.checkedRevision!==t.revision) return `<div class="empty-check"><div><h3>先核对，再提交</h3><p>检查指引、培训记录与关键字段，定位需要处理的问题。</p></div>${button('开始核对','check','lime','spark',can('check',t)?'':'disabled')}</div>${state.sourceHealth?.status==='failed'?'<p class="pending-note">来源读取失败：当前为历史快照，不能据此推进确认。</p>':''}`;
  const findings=t.findings || [];
  return `${findings.length?findings.map(f=>`<div class="finding"><div class="finding-title">${icon('alert')}${e(f.title)}</div><p>${e(f.detail)}</p><div class="actions-inline">${(f.sourceIds||[]).map(id=>`<button class="source-link" data-source="${e(id)}">${icon('link')}查看来源 ${e(id)}</button>`).join('')}</div></div>`).join(''):`<div class="success-box">${icon('check')}<div>本次规则核对通过<p>修订 ${t.revision} · ${['ready_archive','archived'].includes(t.status)?'已取得当前修订的质量与接收确认。':'规则结果不替代人工结论，请继续完成确认。'}</p></div></div>`}<div class="pending-note">${findings.length?`${findings.filter(x=>x.blocking).length} 项阻塞待处理。修正后请重新核对。`:'依据来源快照生成，可在「来源依据」查看原文。'} ${can('check',t)?'<button class="source-link" data-action="check">重新核对</button>':''}</div>`;
}
function nextHTML(t) {
  const stage={draft:['site','准备并核对交接资料','完成培训确认和当班字段核对，再提交复核。'],needs_info:['site','补齐问题，重新核对','资料修正会生成新修订并保留原始记录。'],pending_owner:['owner','等待业务负责人确认变更','核对版本变更及修订原因后，确认当前修订。'],pending_quality:['quality','等待质量人员复核','检查证据、异常处置和当前修订，再给出结论。'],pending_receive:['receiver','等待接收人员确认','核对双方约定的版本、状态和处理结果。'],ready_archive:['coordinator','确认链完整，准备归档','归档后本次修订只读，保留全部证据与轨迹。'],archived:['coordinator','本次交接已形成闭环','已归档记录只读。可导出证据包查看确认链。']}[t.status]||['site','核对交接',''];
  let controls = '';
  if(t.status==='archived') controls=button('导出归档证据','export','primary','down');
  else if(role!==stage[0] && !(stage[0]==='site' && role==='coordinator')) controls=button(`切换到${ROLES.find(r=>r.id===stage[0])?.name||stage[0]}`,'switch-next','primary','user',`data-role="${stage[0]}"`);
  else if(t.status==='pending_owner') controls=button('确认业务变更','approve','primary','check',can('approve_change',t)?'':'disabled');
  else if(t.status==='pending_quality') controls=button('退回 / 待核查','review-other','','',can('review',t)?'':'disabled')+button('质量复核通过','review-pass','primary','check',can('review',t)?'':'disabled');
  else if(t.status==='pending_receive') controls=button('退回交接','receive-return','','',can('receive',t)?'':'disabled')+button('确认接收','receive-accept','primary','check',can('receive',t)?'':'disabled');
  else if(t.status==='ready_archive') controls=button('归档本次交接','archive','primary','shield',can('archive',t)?'':'disabled');
  else controls=button('规则核对','check','','spark',can('check',t)?'':'disabled')+button(t.requiresOwnerApproval?'提交业务确认':'提交质量复核','submit','primary','arrow',can('submit',t)?'':'disabled');
  return `<div class="next-step"><div><div class="next-label">下一步 · 修订 ${t.revision}</div><h3>${stage[1]}</h3><p>${stage[2]}</p></div><div class="actions-inline">${controls}</div></div>`;
}
function sourcesHTML(t) { return `${(t.archivedSourceHealth || state.sourceHealth)?.status==='failed'?'<div class="flow-caption">读取失败，以下为上次演示快照。恢复读取并重新核对后才可继续。</div>':''}<p class="source-note">以下内容全部为合成资料。源记录只读，修改交接包不会改写来源。</p><br>${(t.archivedSources || state.sources).map(s=>sourceCard(s)).join('')}`; }
function sourceCard(s) { return `<article class="source-card"><div class="source-top"><h3>${icon('file')} ${e(s.title)}</h3><span class="version-chip">${e(s.version || '记录')}</span></div><div class="source-meta">${e(s.id)} · ${e(s.locator)} · ${e(s.status==='confirmed'?'已确认（合成）':s.status || '合成来源')}</div><blockquote>${e(s.quote)}</blockquote><div class="source-note">适用期间 ${s.validFrom?fmt(s.validFrom):'以原始记录为准'}${s.validTo?' — '+fmt(s.validTo):''} · 仅用于演示</div></article>`; }
function timelineHTML(t) {
  const entries=state.audit.filter(x=>x.taskId===t.id || !x.taskId).slice().reverse();
  return `<div class="section-title"><h3>每一步确认，都绑定具体修订</h3></div>${(t.confirmations||[]).length?`<div class="actions-inline">${t.confirmations.map(c=>`<span class="badge ${c.valid===false?'warn':'green'}">${e({owner:'业务变更确认',quality:'质量复核',receiver:'接收确认'}[c.type] || c.type)} · R${c.revision}${c.valid===false?' · 已失效':''}</span>`).join('')}</div><div class="section-divider"></div>`:''}${entries.length?`<ol class="timeline">${entries.map(x=>`<li><h4>${e(x.detail || x.action)}</h4><p>${e(typeof x.actor==='object'?x.actor.name || x.actor.id:ROLES.find(r=>r.id===x.actor)?.person || x.actor)} · 修订 ${x.revision || '—'}</p><small>${fmt(x.at)} · ${e(x.action)}</small></li>`).join('')}</ol>`:'<div class="empty-state">尚无操作记录<br>核对、修改和确认都会保留在这里。</div>'}`;
}
function queueHTML() {
  const rows=state.tasks.filter(t=>t.status!=='archived');
  return `${statsHTML()}<section class="panel"><div class="panel-head"><div><h2>保持每一项有人跟进</h2><p>演示工作区内的待办。正式多用户权限尚未接入。</p></div><span class="badge green">${rows.length} 份未归档</span></div><div class="table-wrap"><table><thead><tr><th>交接记录</th><th>当前节点</th><th>未闭环异常</th><th>处理期限</th><th>操作</th></tr></thead><tbody>${rows.map(t=>`<tr><td><button class="text-button" data-task="${e(t.id)}">${e(t.title)}</button><br><small>${e(t.id)} · 修订 ${t.revision}</small></td><td>${badge(t.status)}</td><td>${openIssueCount(t)} 项</td><td class="mono">${fmt(t.dueAt)}</td><td><button class="source-link" data-task="${e(t.id)}">继续办理 →</button></td></tr>`).join('')}</tbody></table></div>${rows.length?'':'<div class="empty-state">全部交接已归档，当前没有待办。</div>'}</section><section class="panel"><h3>异常仍在原责任链上</h3><p class="pending-note">提出分派不等于对方接受责任；登记处理结果不等于质量复核通过。未复核事项不会因点击“已处理”而自动闭环。</p><div class="tools">${button(state.sourceHealth?.status==='failed'?'恢复来源读取':'模拟来源读取失败','source-toggle','','refresh')}${button('重置演示样本','reset','ghost','refresh')}<p>故障演练只影响本地合成数据；执行需切换到协调员。重置前可导出完整备份。</p></div></section>`;
}
function flowHTML() { return `<section class="panel"><div class="panel-head"><div><h2>从资料准备，到有据归档</h2><p>六个职责泳道 · 退回后重新核对 · 人工负责正式判断</p></div><div class="actions-inline">${button(flowZoom?'适应宽度':'查看细节','flow-zoom','small','search')}<a class="button small" href="./assets/overall-flow.svg" target="_blank">打开完整图 ↗</a><a class="button small" href="./assets/overall-flow.bpmn" download>${icon('down')}下载 BPMN</a></div></div><div class="flow-caption">规则核对 → 发现问题 → 补充修正 → 必要时确认业务变更 → 质量复核 → 接收确认 → 归档。<br>这是演示业务状态机的流程说明；未接入 BPMN 执行引擎，未连接生产设备或正式审批系统。</div><div class="flow-scroll ${flowZoom?'zoomed':''}" tabindex="0" aria-label="可横向滚动的整体流程图"><img src="./assets/overall-flow.svg" alt="生产岗位培训与工序交接目标 BPMN：现场准备、规则核对、问题修正、业务确认、质量复核、接收确认、归档"></div><p class="source-note">点击「查看细节」后可横向滚动，也可下载可编辑的 BPMN 文件。</p></section><div class="metrics-grid"><section class="panel"><h3>通过条件</h3><ul class="note-list"><li>当前修订通过规则核对，关键字段已人工核对。</li><li>必要的业务变更已确认，异常处理已登记。</li><li>质量与接收确认均对应当前修订。</li><li>来源可用，证据和确认链完整。</li></ul></section><section class="panel"><h3>退回与失效</h3><ul class="note-list"><li>质量或接收退回，保留原始问题及理由。</li><li>关键内容变化，旧确认失效，新修订重新办理。</li><li>来源失败保留旧快照，不默认为最新。</li><li>归档仅表示本次交接记录闭环。</li></ul></section></div>`; }
function metricsHTML() {
  const c=counts(), checked=state.tasks.filter(t=>t.status==='archived' || (t.checkedRevision===t.revision && !checkTask(state,t).length)).length, confirmed=state.tasks.filter(t=>['ready_archive','archived'].includes(t.status)).length;
  const metrics=[['当前修订核对通过',checked,c.total,'分母包含所有演示交接，未核对也保留。'],['确认链完整',confirmed,c.total,'当前修订已质量通过且接收确认。'],['归档闭环',c.closed,c.total,'完成归档的交接占全部演示交接。']];
  return `${statsHTML()}<div class="metrics-grid"><section class="panel"><h2>本地演示进度</h2>${metrics.map(([label,n,d,note])=>`<div class="metric-row"><div class="metric-text"><span>${label}</span><strong>${n} / ${d} · ${d?Math.round(n/d*100)+'%':'不适用'}</strong></div><meter class="meter" min="0" max="${d||1}" value="${n}" aria-label="${label}">${n}/${d}</meter><small>${note}</small></div>`).join('')}</section><section class="panel"><h2>真实试点需要继续验证</h2><ul class="note-list"><li>50 次交接的真实适用版本匹配情况。</li><li>人工处理总工时，包括建议复核与纠错。</li><li>返工次数、等待时长与确认完整率。</li><li>依据人工标注计算误报和漏报。</li></ul><div class="flow-caption">当前记录为合成演示，不生成虚构的效率提升、模型准确率或真实业务验收结论。</div></section></div><section class="panel"><div class="panel-head"><div><h3>运行与数据</h3><p>本地审计 ${state.audit.length} 条 · ${state.sources.length} 份合成来源 · 无源系统写回</p></div><div class="actions-inline">${button('导出完整备份','backup','','down')}${button('重置演示样本','reset','ghost','refresh')}</div></div></section>`;
}
function openDialog(title, body, footer, onSubmit) {
  dialog.innerHTML=`<form id="modal-form"><div class="dialog-head"><h2>${title}</h2><button type="button" class="dialog-close" data-close aria-label="关闭对话框">${icon('close')}</button></div><div class="dialog-body">${body}<div class="form-error" role="alert" id="form-error"></div></div><div class="dialog-foot"><button type="button" class="button" data-close>取消</button>${footer||'<button class="button primary" type="submit">保存</button>'}</div></form>`;
  dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
  dialog.querySelector('form').addEventListener('submit', event=>{event.preventDefault();try{const close=onSubmit?.(new FormData(event.currentTarget));if(close!==false)dialog.close();}catch(error){dialog.querySelector('#form-error').textContent=error.message;}});
  dialog.showModal();
}
function editDialog() {
  const t=task(), rev=t.revision;
  openDialog('修订交接资料',`<p>保存将生成新修订。指引和培训依据变更需要业务负责人确认，原有下游确认不会沿用。</p><div class="form-grid"><label class="field">工序指引版本<select name="instructionVersion"><option value="v1" ${t.instructionVersion==='v1'?'selected':''}>v1 · 旧版清单</option><option value="v2" ${t.instructionVersion==='v2'?'selected':''}>v2 · 新增复核检查项</option></select></label><label class="field">培训依据版本<select name="trainingVersion"><option value="v1" ${t.trainingVersion==='v1'?'selected':''}>v1 · 旧版培训记录</option><option value="v2" ${t.trainingVersion==='v2'?'selected':''}>v2 · 已覆盖新增项目</option></select></label></div><div class="checks"><label><input type="checkbox" name="trainingConfirmed" ${t.trainingConfirmed?'checked':''}>已人工核对培训确认记录</label><label><input type="checkbox" name="keyChecked" ${t.keyChecked?'checked':''}>当班人员已核对关键字段</label></div><div class="form-grid"><label class="field full">修订原因<textarea name="changeReason" placeholder="说明修改原因与依据，例如：核对 v2 指引后补充新增检查项培训记录。" required maxlength="1000"></textarea></label><label class="field full">交接备注<textarea name="note" maxlength="2000">${e(t.note)}</textarea></label></div>`,'<button class="button primary" type="submit">保存新修订</button>',data=>{const payload=Object.fromEntries(data);payload.trainingConfirmed=data.has('trainingConfirmed');payload.keyChecked=data.has('keyChecked');persist(act(state,{type:'update',taskId:selectedId,roleId:role,payload,expectedRevision:rev}));render();notify('已保存新修订，请重新核对。');});
}
function reasonDialog(title,type,payload,passLabel) {
  const rev=task().revision;
  openDialog(title,`<p>操作对象：${e(task().title)} · 修订 ${rev}。这是演示确认记录，不是源系统正式审批。</p><label class="field">${payload.decision==='return'?'退回原因':'确认依据 / 处理说明'}<textarea name="reason" required maxlength="1200" placeholder="请说明本次判断的依据，记录会保留在确认链中。"></textarea></label>` ,`<button class="button primary" type="submit">${passLabel||'确认提交'}</button>`,data=>{persist(act(state,{type,taskId:selectedId,roleId:role,payload:{...payload,reason:data.get('reason')},expectedRevision:rev}));render();notify('操作已记录，流程已更新。');});
}
function createDialog() {
  if(role!=='coordinator'){openDialog('切换到交付协调员',`<p>创建与分派交接任务由协调员办理。当前为 ${e(roleInfo().name)}，切换仅用于演示，不代表真实账号授权。</p>`,'<button class="button primary" type="submit">切换并创建</button>',()=>{dialog.close();switchRole('coordinator');setTimeout(createDialog,0);return false;});return;}
  openDialog('新建一份交接',`<p>建立合成演示任务，先准备资料，再由各角色逐步确认。</p><div class="form-grid"><label class="field full">交接名称<input name="title" required maxlength="80" placeholder="例如：装配二线 · 白班岗位交接"></label><label class="field">演示批次<input name="batch" required value="DEMO-20261012" maxlength="50"></label><label class="field">班次<select name="shift"><option>白班</option><option>夜班</option></select></label><label class="field">岗位代号<input name="jobCode" required value="PK-01" readonly maxlength="50"></label><label class="field">工序代号<input name="processCode" required value="PK-07" readonly maxlength="50"></label><label class="field">业务发生时间<input type="datetime-local" name="occurredAt" required value="2026-10-12T08:00"></label><label class="field">处理期限<input type="datetime-local" name="dueAt" required value="2026-10-13T18:00"></label></div><p class="pending-note">当前合成资料仅覆盖岗位 PK-01、工序 PK-07。接收人：演示接收人员；所有数据仅保存在当前浏览器。</p>`,'<button class="button primary" type="submit">创建交接任务</button>',data=>{const ids=new Set(state.tasks.map(t=>t.id));persist(act(state,{type:'create',roleId:role,payload:{...Object.fromEntries(data),receiverId:'receiver'}}));selectedId=state.tasks.find(t=>!ids.has(t.id)).id;view='work';detailTab='overview';render();notify('交接任务已建立。');});
}
function download(name,data,type='application/json;charset=utf-8'){const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function guideDialog() {openDialog('5 分钟，走完一次交接',`<ol class="guide-list"><li><div><strong>现场专员：先从旧清单样本开始</strong>点击「开始核对」，查看版本、培训和异常问题；点来源引用核实原文。</div></li><li><div><strong>修正资料与登记处理</strong>编辑为 v2，勾选培训确认和关键字段核对，填写修订原因；登记异常处理结果，再重新核对。</div></li><li><div><strong>业务负责人：确认变更</strong>提交业务确认并切换角色，确认依据；再由现场人员重新核对、提交质量复核。</div></li><li><div><strong>质量与接收：分别作出判断</strong>质量复核可通过、退回或待核查；通过后切换接收人员确认接收。</div></li><li><div><strong>协调员：归档、导出与追溯</strong>确认链齐备后归档，在「确认记录」查看全过程并导出证据包。</div></li></ol><p>也可以选取已待质量复核的样本，从中间节点快速体验。异常退回和来源故障可在待办页面演练。</p>`,'<button class="button primary" type="submit">开始体验</button>',()=>{});}
const handlers={
  'flow-zoom':()=>{flowZoom=!flowZoom;render();},
  guide:guideDialog,
  boundaries:()=>openDialog('这个 Demo 可以做什么',`<p>可以实际办理：新建交接、规则核对、修订、问题处理、业务确认、质量复核、接收、归档和 JSON 导出。刷新后保留本地记录。</p><p>当前使用合成资料，规则模式没有调用大模型；身份下拉框是角色模拟，尚无真实账号、企业权限或多人同步。已归档也不代表生产放行。</p><p>源系统没有被连接或写入。浏览器清理或访问地址改变后，本地记录不会同步，建议先导出备份。</p>`,'<button class="button primary" type="submit">了解</button>',()=>{}),
  create:createDialog,edit:editDialog,
  check:()=>run('check',{},'核对完成，清单已更新。'),
  submit:()=>run('submit',{},'已提交，等待下一角色确认。'),
  approve:()=>reasonDialog('确认本次业务变更','approve_change',{},'确认当前修订'),
  'review-pass':()=>reasonDialog('质量复核通过','review',{decision:'pass'},'确认质量通过'),
  'review-other':()=>openDialog('记录质量复核结论',`<p>退回或待核查都会保留当前版本、原始问题和处理依据。</p><div class="form-grid"><label class="field full">复核结论<select name="decision"><option value="return">退回修改</option><option value="hold">待人工核查</option></select></label><label class="field full">原因与补证要求<textarea name="reason" required maxlength="1200"></textarea></label></div>`,'<button class="button primary" type="submit">提交复核结论</button>',data=>{persist(act(state,{type:'review',taskId:selectedId,roleId:role,payload:Object.fromEntries(data),expectedRevision:task().revision}));render();notify('复核结论已登记。');}),
  'receive-accept':()=>reasonDialog('确认接收这份交接','receive',{decision:'accept'},'确认接收'),
  'receive-return':()=>reasonDialog('退回这份交接','receive',{decision:'return'},'确认退回'),
  archive:()=>reasonDialog('归档本次交接','archive',{},'确认归档'),
  resolve:element=>{const issueId=element.dataset.issue;openDialog('登记异常处理结果',`<p>处理说明将作为新的交接依据保存，质量人员仍需进行复核。</p><label class="field">处理结果与依据<textarea name="resolution" required maxlength="1200" placeholder="说明补齐了什么，以及对应的来源记录。"></textarea></label>`,'<button class="button primary" type="submit">保存处理结果</button>',data=>{persist(act(state,{type:'resolve_issue',taskId:selectedId,roleId:role,payload:{issueId,resolution:data.get('resolution')},expectedRevision:task().revision}));render();notify('处理结果已登记，请重新核对当前修订。');});},
  'switch-next':element=>switchRole(element.dataset.role),
  export:()=>{try{download(`${selectedId}-R${task().revision}-证据包.json`,exportBundle(state,selectedId,role));notify('证据包已导出。');}catch(error){notify(error.message,true);}},
  backup:()=>download('交接有据-演示备份.json',state),
  'broken-export':()=>download('交接有据-原始恢复备份.txt',rawBroken,'text/plain;charset=utf-8'),
  'source-toggle':()=>{if(role!=='coordinator'){notify('请先在右上角切换到交付协调员，再进行故障演练。',true);return;}run(state.sourceHealth?.status==='failed'?'source_restore':'source_failure',{reason:'演示只读来源暂不可用'},'来源演示状态已更新，相关交接需重新核对。');},
  reset:()=>openDialog('重新开始演示',`<p>将重置当前浏览器中的全部演示任务和操作记录，恢复初始 3 份样本。建议先导出完整备份。</p><button type="button" class="button small" id="reset-backup">${icon('down')}导出当前备份</button>`,'<button class="button danger" type="submit">重置为初始样本</button>',()=>{persist(seedState());rawBroken=null;selectedId=state.tasks[0]?.id;view='work';detailTab='overview';role='site';try{sessionStorage.setItem(SESSION,role);}catch{}render();notify('已恢复初始合成样本。');})
};
app.addEventListener('click',event=>{
  const el=event.target.closest('button');if(!el || el.disabled)return;
  if(el.dataset.view){view=el.dataset.view;render();return;}
  if(el.dataset.task){selectedId=el.dataset.task;view='work';detailTab='overview';render();return;}
  if(el.dataset.tab){detailTab=el.dataset.tab;render();return;}
  if(el.dataset.filter){filter=el.dataset.filter;render();return;}
  if(el.dataset.source){const s=state.sources.find(x=>x.id===el.dataset.source);if(s)openDialog('来源原文',sourceCard(s),'<button class="button primary" type="submit">返回核对</button>',()=>{});return;}
  handlers[el.dataset.action]?.(el);
});
app.addEventListener('change',event=>{if(event.target.id==='role-select')switchRole(event.target.value);});
app.addEventListener('input',event=>{if(event.target.id==='search'){search=event.target.value;document.querySelector('.task-cards').innerHTML=taskCards();}});
dialog.addEventListener('click',event=>{if(event.target.id==='reset-backup')download('交接有据-重置前备份.json',rawBroken??state);});
window.addEventListener('storage',event=>{if(event.key===STORAGE&&event.newValue){if(dialog.open){notify('其他窗口已更新数据，请关闭表单并刷新后再继续。',true);return;}try{const incoming=JSON.parse(event.newValue);if(!validateState(incoming))throw new Error('invalid');state=incoming;lastStored=event.newValue;if(!state.tasks.some(t=>t.id===selectedId))selectedId=state.tasks[0]?.id;render();notify('已同步此浏览器其他标签页的演示记录。');}catch{notify('其他标签页的数据格式异常，当前页面未覆盖。',true);}}});
render();
