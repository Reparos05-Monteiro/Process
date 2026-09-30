import { createClient } from '@supabase/supabase-js';
import './style.css';
import './refinement.css';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './public-config.js';
import {
  DEFAULT_SETTINGS, PRIORITIES, ICONS, escapeHTML as e, safeColor,
  orderedStages, casesForStage, daysSince, caseCode, reorderIds,
} from './model.js';

const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
const url = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY;
function validEndpoint(value) {
  try {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password && !parsed.pathname.replaceAll('/', '') &&
      (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && parsed.hostname === 'localhost'));
  } catch { return false; }
}
const configured = validEndpoint(url) && !!key && !key.includes('SUA_CHAVE');
const db = configured ? createClient(url, key) : null;
const state = {
  loading: true, error: '', user: null, member: null, stages: [], cases: [],
  settings: DEFAULT_SETTINGS, view: 'hub', panel: null, stageId: null,
  caseId: null, query: '', sort: 'oldest', authMode: 'login', signupEmail: '', requests: [],
};
let noticeTimer;
let authSubscription;
let loginInProgress = false;
let composingSearch = false;

const admin = () => state.member?.role === 'admin';
const stage = id => state.stages.find(item => item.id === id);
const number = id => String(state.stages.findIndex(item => item.id === id) + 1).padStart(2, '0');
const style = item => `--accent:${safeColor(item.color)}`;
const count = id => state.cases.filter(item => item.stage_id === id).length;
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatDate = date => date ? new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${date}T12:00:00Z`)) : '—';
function notify(message, isError = false) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.className = `visible${isError ? ' error' : ''}`;
  noticeTimer = setTimeout(() => { notice.className = ''; }, 5500);
}
function requireData(result) {
  if (result.error) throw result.error;
  return result.data;
}

async function loadPublic() {
  const [stages, settings] = await Promise.all([
    db.from('repair_stages').select('id,name,description,color,icon,sort_order').order('sort_order'),
    db.from('repair_settings').select('title,stale_days,visible_cards').eq('id', 1).single(),
  ]);
  state.stages = orderedStages(requireData(stages));
  state.settings = requireData(settings);
  document.title = state.settings.title;
}

async function loadCases() {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const page = requireData(await db.from('repair_cases')
      .select('id,stage_id,title,address,owner,priority,description,note,opened_on,updated_at')
      .order('id', { ascending: true }).range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  state.cases = rows;
}

async function loadRequests() {
  state.requests = admin() ? requireData(await db.from('repair_access_requests')
    .select('user_id,email,requested_at').order('requested_at', { ascending: false })) : [];
}

async function hydrateAuth() {
  const { data, error } = await db.auth.getUser();
  if (error && !/session missing/i.test(error.message)) throw error;
  state.user = data?.user ?? null;
  state.member = null;
  state.cases = [];
  if (!state.user) return;
  const membership = requireData(await db.from('repair_members')
    .select('role').eq('user_id', state.user.id).maybeSingle());
  state.member = membership;
  if (membership) {
    await Promise.all([loadCases(), loadRequests()]);
  } else {
    const request = await db.from('repair_access_requests').insert({ user_id: state.user.id, email: state.user.email });
    if (request.error && request.error.code !== '23505') throw request.error;
  }
}

async function initialize() {
  if (!configured) { state.loading = false; render(); return; }
  try {
    await hydrateAuth();
    if (state.member) await loadPublic();
    state.error = '';
  } catch (error) {
    state.error = `Não foi possível carregar o sistema: ${error.message}`;
  } finally {
    state.loading = false;
    render();
  }
  authSubscription?.unsubscribe();
  authSubscription = db.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      state.user = null; state.member = null; state.cases = [];
      state.stages = []; state.requests = []; state.view = 'hub'; state.panel = null; state.authMode = 'login';
      render();
    }
    // Não chamar o cliente Supabase dentro do callback de autenticação.
    if (event === 'SIGNED_IN' && !state.user && !loginInProgress) {
      setTimeout(async () => {
        try { await hydrateAuth(); if (state.member) await loadPublic(); render(); }
        catch (err) { notify(err.message, true); }
      }, 0);
    }
  }).data.subscription;
}

function render() {
  if (!configured) {
    app.innerHTML = `<main class="centered"><div class="empty-card"><div class="brand">R<span>·</span></div><h1>Configuração pendente</h1><p>Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> na Vercel. Consulte o README do projeto.</p></div></main>`;
    return;
  }
  if (state.loading) { app.innerHTML = '<main class="centered"><p>Carregando o mapa de reparos…</p></main>'; return; }
  if (state.error) {
    app.innerHTML = `<main class="centered"><div class="empty-card"><h1>Conexão indisponível</h1><p>${e(state.error)}</p><button class="primary" data-action="retry">Tentar novamente</button></div></main>`;
    return;
  }
  if (!state.user) { app.innerHTML = renderAuth(); return; }
  if (!state.member) { app.innerHTML = renderPending(); return; }
  app.innerHTML = (state.view === 'hub' ? renderHub() : renderBoard()) + renderPanel();
}

function renderAuth() {
  const signup = state.authMode === 'signup';
  const confirmation = state.authMode === 'confirm';
  return `<main class="auth-screen"><div class="auth-ambient" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="auth-layout"><section class="auth-intro"><div class="auth-brand"><span>R<span>·</span></span> REPAROS</div><span class="auth-kicker">CENTRAL DE PROCESSOS</span><h1>Seu fluxo,<br><em>em movimento.</em></h1><p>Organize cada reparo no passo certo.</p><div class="auth-mini-orbit" aria-hidden="true"><span>◇</span><span>◈</span><span>↗</span><b>R·</b><span>✳</span><span>✓</span><span>↺</span></div></section>
      <section class="auth-card" aria-label="Acesso ao sistema">${confirmation ? `<span class="auth-card-kicker">CONFIRMAÇÃO</span><h2>Confira seu e-mail.</h2><p>Enviamos um link de confirmação para <strong>${e(state.signupEmail)}</strong>. Depois de confirmar, volte e entre com sua senha.</p><button class="secondary full" data-action="auth-login">Voltar ao login</button>` : `<span class="auth-card-kicker">${signup ? 'NOVA CONTA' : 'BEM-VINDO DE VOLTA'}</span><h2>${signup ? 'Criar conta' : 'Entrar no sistema'}</h2><p>${signup ? 'Use seu e-mail para solicitar acesso à central.' : 'Acesse sua central de reparos.'}</p>
        <form id="${signup ? 'signup-form' : 'login-form'}" class="auth-form"><label>E-mail<input type="email" name="email" autocomplete="email" placeholder="voce@exemplo.com" required></label><label>Senha<input type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" ${signup ? 'minlength="8"' : ''} placeholder="${signup ? 'Mínimo de 8 caracteres' : 'Sua senha'}" required></label>${signup ? '<label>Confirmar senha<input type="password" name="confirm_password" autocomplete="new-password" minlength="8" required></label>' : ''}<button type="submit" class="primary full">${signup ? 'Criar minha conta' : 'Entrar'} <span>→</span></button></form><div class="auth-switch">${signup ? 'Já tem uma conta?' : 'Ainda não tem conta?'} <button data-action="${signup ? 'auth-login' : 'auth-signup'}">${signup ? 'Entrar' : 'Criar conta'}</button></div>`}</section>
    </div></main>`;
}

function renderPending() {
  return `<main class="auth-screen pending-screen"><div class="pending-card"><div class="pending-symbol">◷</div><span class="auth-card-kicker">CONTA CADASTRADA</span><h1>Aguardando liberação</h1><p>O cadastro de <strong>${e(state.user.email)}</strong> foi realizado. O administrador precisa liberar o acesso aos casos. Assim que ele fizer isso, clique em verificar.</p><div class="pending-id"><span>Identificador da conta</span><code>${e(state.user.id)}</code></div><button class="primary full" data-action="check-access">Verificar acesso</button><button class="text-button" data-action="logout">Sair da conta</button></div></main>`;
}

function stageIcon(symbol) {
  const paths = {
    '◇': '<path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h5"/>',
    '◈': '<circle cx="11" cy="11" r="6"/><path d="m15.5 15.5 5 5M8 11h6M11 8v6"/>',
    '↗': '<path d="M4 19 20 4M9 4h11v11"/>',
    '✳': '<path d="M14 5a5 5 0 0 0-6 6l-5 5 4 4 5-5a5 5 0 0 0 6-6l-3 3-3-3z"/>',
    '✓': '<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/>',
    '↺': '<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>',
  };
  return paths[symbol] ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[symbol]}</svg>` : `<span>${e(symbol)}</span>`;
}

function renderHub() {
  const n = state.stages.length;
  const points = state.stages.map((item, index) => {
    const angle = (-150 + index * 360 / Math.max(n, 1)) * Math.PI / 180;
    return { item, x: 600 + 470 * Math.cos(angle), y: 310 + 210 * Math.sin(angle) };
  });
  return `<main class="hub"><button class="hub-logout" data-action="logout" aria-label="Sair da conta" title="Sair da conta">Sair ↗</button>
    <div class="hub-orbit" aria-label="Etapas do processo"><svg class="hub-rays" viewBox="0 0 1200 620" preserveAspectRatio="none" aria-hidden="true">${points.map(({ x, y }) => `<path d="M600 310 L${x.toFixed(1)} ${y.toFixed(1)}"/>`).join('')}</svg>
      <button class="hub-center" data-action="enter" aria-label="Entrar no sistema completo"><span class="hub-monogram">R<span>·</span></span><strong>REPAROS</strong><small>ENTRAR</small></button>
      ${points.map(({ item, x, y }) => `<button class="hub-stage" style="--hub-x:${(x / 12).toFixed(2)}%;--hub-y:${(y / 6.2).toFixed(2)}%;${style(item)}" data-action="open-stage" data-id="${e(item.id)}" aria-label="Abrir ${e(item.name)}: ${count(item.id)} casos"><span class="hub-stage-icon">${stageIcon(item.icon)}${count(item.id) ? `<b>${count(item.id)}</b>` : ''}</span><span class="hub-label">${e(item.name)}</span><span class="hub-tooltip"><strong>${e(item.name)}</strong><small>${count(item.id)} ${count(item.id) === 1 ? 'caso' : 'casos'} · ${e(item.description || 'Etapa do processo')}</small></span></button>`).join('')}
    </div></main>`;
}

function renderBoard() {
  const n = state.stages.length;
  const width = Math.max(760, n * 230 + 50);
  const visible = casesForStage(state.cases, null, state.query, state.sort);
  const aged = state.cases.filter(item => daysSince(item.opened_on) >= state.settings.stale_days).length;
  return `<div class="shell"><aside class="sidebar" aria-label="Navegação"><button class="sidebar-brand" data-action="home" aria-label="Início">R<span>·</span></button><div class="side-links"><button class="side-button" data-action="home" title="Início" aria-label="Início">⌂</button><button class="side-button selected" data-action="all" title="Todos os casos" aria-label="Todos os casos">▦</button>${admin() ? '<button class="side-button" data-action="settings" title="Configurações" aria-label="Configurações">⚙</button>' : ''}</div><button class="side-button bottom" data-action="logout" title="Sair" aria-label="Sair">⇥</button></aside>
    <div class="workspace"><header class="topbar"><span>REPAROS <i>/</i> SISTEMA COMPLETO</span><div class="topbar-actions"><span>${admin() ? 'ADMINISTRADOR' : 'EQUIPE'} <i>·</i> ${e(state.user.email)}</span><button class="text-button" data-action="refresh" title="Atualizar dados">Atualizar ↻</button></div></header>
      <main class="main"><div class="main-heading"><div><span class="eyebrow">CENTRAL DE ACOMPANHAMENTO</span><h1>${e(state.settings.title)}<span class="star">✳</span></h1><p>Cada etapa mostra alguns cartões. Clique nela para acessar todos os casos.</p></div><button class="primary" data-action="new-case">+ Novo caso</button></div>
      <div class="toolbar"><div class="stat"><strong>${state.cases.length}</strong><span>casos no sistema</span></div><div class="stat"><strong>${aged}</strong><span>há ${state.settings.stale_days}+ dias</span></div><div class="stat"><strong>${n}</strong><span>etapas do fluxo</span></div><label class="search">⌕ <input id="search" type="search" value="${e(state.query)}" placeholder="Buscar caso, endereço ou responsável" aria-label="Buscar casos"></label></div>
      <section class="board"><div class="board-heading"><div><span class="eyebrow">VISÃO DO FLUXO</span><h2>Onde cada caso está agora</h2></div><button class="text-button" data-action="all">Ver todos os casos →</button></div>
        <div class="map-viewport"><div class="map-canvas" style="width:${width}px"><svg class="connection-layer" width="${width}" height="690" viewBox="0 0 ${width} 690" aria-hidden="true">${state.stages.slice(0, -1).map((_, i) => `<path class="spine-line" d="M${130 + i * 230} 343 L${360 + i * 230} 343"/>`).join('')}${state.stages.map((item, i) => {
          const stageCases = visible.filter(c => c.stage_id === item.id);
          const center = 130 + i * 230;
          return `<path class="thread" stroke="${safeColor(item.color)}" d="M${center} 282 L${center} 202" style="opacity:${stageCases.length ? 1 : .25}"/><path class="thread" stroke="${safeColor(item.color)}" d="M${center} 405 L${center} 492" style="opacity:${stageCases.length > 1 ? 1 : .25}"/>`;
        }).join('')}</svg>${state.stages.map((item, index) => renderMapStage(item, index, visible)).join('')}
        ${!state.cases.length ? '<div class="map-message">Nenhum caso cadastrado ainda.<small>Crie o primeiro caso para iniciar o fluxo.</small></div>' : !visible.length ? '<div class="map-message">Nenhum caso corresponde à busca.</div>' : ''}</div></div>
        <div class="board-footer">As linhas ligam os cartões à etapa atual. <span>DESLIZE PARA EXPLORAR →</span></div></section>
      <div class="flow-footer">${state.stages.map((item, index) => `<span><b>${String(index + 1).padStart(2, '0')}</b> ${e(item.name)}</span>`).join('<i>→</i>')}</div></main></div></div>`;
}

function renderMapStage(item, index, visible) {
  const list = casesForStage(visible, item.id, '', state.sort);
  const x = 36 + index * 230;
  const note = (row, position) => `<button class="floating-note ${position}" style="left:${x + (position === 'lower' ? 14 : 0)}px;${style(item)}" data-action="case" data-id="${row.id}"><span class="note-code">${caseCode(row.id)} <i>●</i></span><strong>${e(row.title)}</strong><small>${e(row.address)}</small><span class="note-age">Há ${daysSince(row.opened_on)} dia(s) <b>↗</b></span></button>`;
  return `${list[0] && state.settings.visible_cards > 0 ? note(list[0], 'upper') : ''}${list[1] && state.settings.visible_cards > 1 ? note(list[1], 'lower') : ''}
    <button class="stage-node" style="left:${x}px;${style(item)}" data-action="open-stage" data-id="${e(item.id)}"><span class="stage-top">${number(item.id)} / ${String(state.stages.length).padStart(2, '0')} <b>${e(item.icon)}</b></span><strong>${e(item.name)}</strong><span class="stage-bottom">${list.length} ${list.length === 1 ? 'caso' : 'casos'} <b>→</b></span></button>
    ${list.length > state.settings.visible_cards ? `<button class="more" style="left:${x + 30}px" data-action="open-stage" data-id="${e(item.id)}">+${list.length - state.settings.visible_cards} outros casos</button>` : ''}`;
}

function caseButton(row) {
  const age = daysSince(row.opened_on);
  return `<button class="list-case" data-action="case" data-id="${row.id}"><span class="list-top"><span>${caseCode(row.id)}</span><span class="age-tag ${age >= state.settings.stale_days ? 'aged' : ''}">${age ? `Há ${age} dia(s)` : 'Hoje'}</span></span><strong>${e(row.title)}</strong><small>${e(row.address)}</small><span class="list-bottom">${e(row.owner)} <i>·</i> ${e(stage(row.stage_id)?.name ?? 'Etapa removida')} <b>›</b></span></button>`;
}

function stageOptions(current) {
  return state.stages.map((item, i) => `<option value="${e(item.id)}" ${current === item.id ? 'selected' : ''}>${String(i + 1).padStart(2, '0')} · ${e(item.name)}</option>`).join('');
}
function priorityOptions(current) {
  return PRIORITIES.map(item => `<option ${current === item ? 'selected' : ''}>${item}</option>`).join('');
}
function field(label, name, value = '', max = 100, required = true) {
  return `<label class="field"><span>${label}</span><input name="${name}" value="${e(value)}" maxlength="${max}" ${required ? 'required' : ''}></label>`;
}

function renderPanel() {
  const type = state.panel;
  if (!type) return '';
  let title = '', content = '';
  if (type === 'all' || type === 'stage') {
    const current = stage(state.stageId);
    title = type === 'all' ? 'Todos os casos' : current?.name ?? 'Etapa';
    const rows = casesForStage(state.cases, type === 'stage' ? state.stageId : null, state.query, state.sort);
    content = `<p class="panel-muted">${type === 'stage' ? e(current?.description || 'Casos desta etapa do processo.') : 'Registros da central de reparos.'}</p><div class="panel-controls"><strong>${rows.length} ${rows.length === 1 ? 'caso' : 'casos'}</strong><label>Ordenar <select id="sort"><option value="oldest" ${state.sort === 'oldest' ? 'selected' : ''}>Mais antigos</option><option value="newest" ${state.sort === 'newest' ? 'selected' : ''}>Mais recentes</option></select></label></div><div class="case-list">${rows.map(caseButton).join('') || '<div class="empty-list">Nenhum caso nesta lista.</div>'}</div><div class="panel-footer"><button class="primary full" data-action="new-case" data-id="${e(type === 'stage' ? state.stageId : state.stages[0]?.id ?? '')}">+ Novo caso</button></div>`;
  } else if (type === 'new') {
    title = 'Novo caso';
    content = `<p class="panel-muted">O registro será salvo no Supabase e aparecerá na etapa escolhida.</p><form id="case-create" class="form-stack scroll-form">${field('Título *', 'title', '', 120)}${field('Endereço *', 'address', '', 180)}${field('Responsável *', 'owner', '', 80)}<label class="field"><span>Etapa</span><select name="stage_id" required>${stageOptions(state.stageId)}</select></label><label class="field"><span>Prioridade</span><select name="priority">${priorityOptions('Normal')}</select></label><label class="field"><span>Data de abertura</span><input type="date" name="opened_on" value="${localToday()}" required></label><label class="field"><span>Descrição</span><textarea name="description" maxlength="3000" rows="4"></textarea></label><button class="primary full" type="submit">Criar caso →</button></form>`;
  } else if (type === 'detail') {
    const row = state.cases.find(item => String(item.id) === String(state.caseId));
    if (!row) return '';
    title = caseCode(row.id);
    content = `<p class="panel-muted">Aberto em ${formatDate(row.opened_on)} · atualizado em ${formatDate(row.updated_at?.slice(0, 10))}</p><form id="case-update" class="form-stack scroll-form">${field('Título *', 'title', row.title, 120)}${field('Endereço *', 'address', row.address, 180)}${field('Responsável *', 'owner', row.owner, 80)}<label class="field"><span>Etapa</span><select name="stage_id">${stageOptions(row.stage_id)}</select></label><label class="field"><span>Prioridade</span><select name="priority">${priorityOptions(row.priority)}</select></label><label class="field"><span>Data de abertura</span><input type="date" name="opened_on" value="${e(row.opened_on)}" required></label><label class="field"><span>Descrição</span><textarea name="description" maxlength="3000" rows="4">${e(row.description)}</textarea></label><label class="field"><span>Observação</span><textarea name="note" maxlength="5000" rows="4">${e(row.note)}</textarea></label><button class="primary full" type="submit">Salvar alterações</button>${admin() ? `<button class="danger full" type="button" data-action="delete-case" data-id="${row.id}">Excluir caso</button>` : ''}</form>`;
  } else if (type === 'settings' && admin()) {
    title = 'Configurações';
    content = `<p class="panel-muted">Somente o administrador pode alterar estas opções. As mudanças aparecem para todos.</p><h3 class="panel-subheading">Etapas do processo</h3><div class="stage-settings">${state.stages.map((item, index) => `<div class="setting-row"><span class="setting-symbol" style="${style(item)}">${e(item.icon)}</span><span><strong>${e(item.name)}</strong><small>${e(item.description)}</small></span><button data-action="move-up" data-id="${e(item.id)}" ${index === 0 ? 'disabled' : ''} aria-label="Subir ${e(item.name)}">↑</button><button data-action="move-down" data-id="${e(item.id)}" ${index === state.stages.length - 1 ? 'disabled' : ''} aria-label="Descer ${e(item.name)}">↓</button><button data-action="edit-stage" data-id="${e(item.id)}" aria-label="Editar ${e(item.name)}">✎</button></div>`).join('')}</div><button class="secondary full" data-action="add-stage" ${state.stages.length >= 12 ? 'disabled' : ''}>+ Adicionar etapa ${state.stages.length >= 12 ? '(limite de 12)' : ''}</button><h3 class="panel-subheading">Preferências gerais</h3><form id="settings-form" class="form-stack">${field('Nome do sistema', 'title', state.settings.title, 60)}<label class="field"><span>Alerta de caso antigo (dias)</span><input type="number" name="stale_days" min="1" max="365" required value="${state.settings.stale_days}"></label><label class="field"><span>Cartões visíveis por etapa no mapa</span><select name="visible_cards">${[0, 1, 2].map(i => `<option value="${i}" ${i === state.settings.visible_cards ? 'selected' : ''}>${i}</option>`).join('')}</select></label><button class="primary full" type="submit">Salvar preferências</button></form><h3 class="panel-subheading">Cadastros aguardando acesso (${state.requests.length})</h3><div class="access-requests">${state.requests.length ? state.requests.map(request => `<div class="access-request"><strong>${e(request.email)}</strong><small>${e(request.user_id)}</small><button class="secondary" data-action="approve-request" data-id="${e(request.user_id)}">Liberar como editor</button></div>`).join('') : '<p>Nenhum cadastro pendente.</p>'}</div>`;
  } else if (type === 'stage-form' && admin()) {
    const item = stage(state.stageId);
    title = item ? 'Editar etapa' : 'Adicionar etapa';
    content = `<p class="panel-muted">Nome, cor, símbolo e descrição aparecem no mapa e na entrada.</p><form id="stage-form" class="form-stack">${field('Nome da etapa *', 'name', item?.name ?? '', 40)}${field('Descrição', 'description', item?.description ?? '', 120, false)}<label class="field"><span>Cor</span><input type="color" name="color" value="${safeColor(item?.color ?? '#e9bc75')}"></label><label class="field"><span>Símbolo</span><select name="icon">${ICONS.map(icon => `<option value="${e(icon)}" ${item?.icon === icon ? 'selected' : ''}>${e(icon)}</option>`).join('')}</select></label><button class="primary full" type="submit">${item ? 'Salvar etapa' : 'Criar etapa'}</button>${item && state.stages.length > 1 ? `<button class="danger full" type="button" data-action="delete-stage" data-id="${e(item.id)}">Excluir etapa</button>` : ''}</form><button class="text-button panel-return" data-action="settings">← Voltar às configurações</button>`;
  }
  return `<div class="scrim" data-action="close"></div><aside class="panel" role="dialog" aria-modal="true" aria-label="${e(title)}"><div class="panel-top"><span>REPAROS / ${e(title.toUpperCase())}</span><button data-action="close" aria-label="Fechar painel">×</button></div><div class="panel-content"><h2>${e(title)}</h2>${content}</div></aside>`;
}

function openPanel(type) { state.panel = type; render(); document.querySelector('.panel input, .panel button')?.focus(); }
function gateTo(destination, id = null) {
  state.view = 'board'; state.stageId = id;
  if (destination === 'stage') openPanel('stage'); else { state.panel = null; render(); }
}
async function write(form, task, success) {
  const submit = form?.querySelector('[type="submit"]');
  if (submit?.disabled) return;
  if (submit) submit.disabled = true;
  try { await task(); await success(); }
  catch (error) { notify(error.message || 'Não foi possível salvar.', true); if (submit) submit.disabled = false; }
}
async function refresh() { await loadPublic(); if (state.member) await Promise.all([loadCases(), loadRequests()]); render(); }
function caseValues(form, includeNote = false) {
  const data = new FormData(form);
  const value = name => String(data.get(name) ?? '').trim();
  const payload = {
    title: value('title'), address: value('address'), owner: value('owner'),
    stage_id: value('stage_id'), priority: value('priority'),
    opened_on: value('opened_on'), description: value('description'),
  };
  if (includeNote) payload.note = value('note');
  if (!payload.title || !payload.address || !payload.owner || !stage(payload.stage_id) ||
      !PRIORITIES.includes(payload.priority)) throw new Error('Revise os campos do caso.');
  return payload;
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const { action, id } = button.dataset;
  if (action === 'retry') { state.loading = true; state.error = ''; render(); await initialize(); }
  if (action === 'auth-login' || action === 'auth-signup') {
    state.authMode = action === 'auth-login' ? 'login' : 'signup'; render();
    document.querySelector('.auth-form [name="email"]')?.focus();
  }
  if (action === 'check-access') {
    button.disabled = true;
    try { await hydrateAuth(); if (state.member) await loadPublic(); render(); if (!state.member) notify('Seu acesso ainda está pendente.'); }
    catch (error) { button.disabled = false; notify(error.message, true); }
  }
  if (action === 'approve-request' && admin()) {
    button.disabled = true;
    try {
      const added = await db.from('repair_members').insert({ user_id: id, role: 'editor' });
      if (added.error && added.error.code !== '23505') throw added.error;
      requireData(await db.from('repair_access_requests').delete().eq('user_id', id));
      await loadRequests(); render(); notify('Acesso de editor liberado.');
    } catch (error) { button.disabled = false; notify(error.message, true); }
  }
  if (action === 'refresh') {
    button.disabled = true;
    try { await refresh(); notify('Dados atualizados.'); }
    catch (error) { button.disabled = false; notify(error.message, true); }
  }
  if (action === 'enter') gateTo('board');
  if (action === 'open-stage') gateTo('stage', id);
  if (action === 'home') { state.view = 'hub'; state.panel = null; state.query = ''; render(); }
  if (action === 'all') { state.stageId = null; openPanel('all'); }
  if (action === 'case') { state.caseId = id; openPanel('detail'); }
  if (action === 'close') { state.panel = null; render(); }
  if (action === 'new-case') { state.stageId = id || state.stageId || state.stages[0]?.id; openPanel('new'); }
  if (action === 'settings' && admin()) openPanel('settings');
  if (action === 'add-stage' && admin()) { state.stageId = null; openPanel('stage-form'); }
  if (action === 'edit-stage' && admin()) { state.stageId = id; openPanel('stage-form'); }
  if (action === 'logout') { const { error } = await db.auth.signOut(); if (error) notify(error.message, true); }
  if ((action === 'move-up' || action === 'move-down') && admin()) {
    button.disabled = true;
    try {
      requireData(await db.rpc('repair_reorder_stages', { p_ids: reorderIds(state.stages, id, action === 'move-up' ? -1 : 1) }));
      await refresh(); notify('Ordem das etapas atualizada.');
    } catch (error) { button.disabled = false; notify(error.message, true); }
  }
  if (action === 'delete-stage' && admin()) {
    if (count(id)) { notify('Mova os casos desta etapa antes de excluí-la.', true); return; }
    if (state.stages.length <= 1 || !window.confirm('Excluir esta etapa?')) return;
    button.disabled = true;
    try { requireData(await db.from('repair_stages').delete().eq('id', id)); state.panel = 'settings'; await refresh(); notify('Etapa excluída.'); }
    catch (error) { button.disabled = false; notify(error.message, true); }
  }
  if (action === 'delete-case' && admin()) {
    if (!window.confirm(`Excluir o caso ${caseCode(id)} permanentemente?`)) return;
    button.disabled = true;
    try { requireData(await db.from('repair_cases').delete().eq('id', id)); state.panel = 'all'; await refresh(); notify('Caso excluído.'); }
    catch (error) { button.disabled = false; notify(error.message, true); }
  }
});

document.addEventListener('input', event => {
  if (event.target.id !== 'search' || composingSearch) return;
  state.query = event.target.value;
  const position = event.target.selectionStart;
  render();
  const next = document.querySelector('#search'); next?.focus();
  try { next?.setSelectionRange(position, position); } catch { /* Alguns navegadores não aceitam seleção em search. */ }
});
document.addEventListener('compositionstart', event => { if (event.target.id === 'search') composingSearch = true; });
document.addEventListener('compositionend', event => {
  if (event.target.id === 'search') { composingSearch = false; event.target.dispatchEvent(new Event('input', { bubbles: true })); }
});
document.addEventListener('change', event => {
  if (event.target.id === 'sort') { state.sort = event.target.value; render(); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.panel) { state.panel = null; render(); }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  event.preventDefault();
  if (form.id === 'login-form') {
    const data = new FormData(form);
    await write(form, async () => {
      loginInProgress = true;
      try {
        requireData(await db.auth.signInWithPassword({ email: String(data.get('email')).trim(), password: String(data.get('password')) }));
        await hydrateAuth();
        if (state.member) await loadPublic();
      } finally { loginInProgress = false; }
    }, async () => {
      state.view = 'hub'; state.panel = null;
      render();
    });
  }
  if (form.id === 'signup-form') {
    const data = new FormData(form);
    const email = String(data.get('email')).trim();
    const password = String(data.get('password'));
    if (password !== String(data.get('confirm_password'))) { notify('As senhas não coincidem.', true); return; }
    await write(form, async () => {
      loginInProgress = true;
      try {
        const created = requireData(await db.auth.signUp({ email, password,
          options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
        }));
        if (created.session) { await hydrateAuth(); if (state.member) await loadPublic(); }
        else { state.authMode = 'confirm'; state.signupEmail = email; }
      } finally { loginInProgress = false; }
    }, async () => render());
  }
  if (form.id === 'case-create') {
    let payload; try { payload = caseValues(form); } catch (error) { notify(error.message, true); return; }
    await write(form, async () => {
      const created = requireData(await db.from('repair_cases').insert(payload).select('id,stage_id').single());
      state.caseId = created.id; state.stageId = created.stage_id;
    }, async () => { state.panel = 'detail'; await refresh(); notify('Caso criado.'); });
  }
  if (form.id === 'case-update') {
    let payload; try { payload = caseValues(form, true); } catch (error) { notify(error.message, true); return; }
    await write(form, async () => { requireData(await db.from('repair_cases').update(payload).eq('id', state.caseId).select('id').single()); },
      async () => { state.stageId = payload.stage_id; await refresh(); notify('Caso atualizado.'); });
  }
  if (form.id === 'stage-form' && admin()) {
    const data = new FormData(form);
    const payload = { name: String(data.get('name')).trim(), description: String(data.get('description')).trim(), color: String(data.get('color')), icon: String(data.get('icon')) };
    if (!payload.name || !ICONS.includes(payload.icon)) { notify('Revise os campos da etapa.', true); return; }
    await write(form, async () => {
      if (state.stageId) requireData(await db.from('repair_stages').update(payload).eq('id', state.stageId).select('id').single());
      else requireData(await db.from('repair_stages').insert({ ...payload, sort_order: Math.max(0, ...state.stages.map(s => s.sort_order)) + 10 }).select('id').single());
    }, async () => { state.panel = 'settings'; await refresh(); notify('Etapa salva.'); });
  }
  if (form.id === 'settings-form' && admin()) {
    const data = new FormData(form);
    const payload = { title: String(data.get('title')).trim(), stale_days: Number(data.get('stale_days')), visible_cards: Number(data.get('visible_cards')) };
    if (!payload.title || payload.stale_days < 1 || payload.stale_days > 365 || ![0, 1, 2].includes(payload.visible_cards)) { notify('Revise as preferências.', true); return; }
    await write(form, async () => { requireData(await db.from('repair_settings').update(payload).eq('id', 1).select('id').single()); },
      async () => { await refresh(); notify('Preferências atualizadas.'); });
  }
});

initialize();