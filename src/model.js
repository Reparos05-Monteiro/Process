export const DEFAULT_SETTINGS = { title: 'Mapa de Reparos', stale_days: 21, visible_cards: 2 };
export const PRIORITIES = ['Baixa', 'Normal', 'Alta'];
export const ICONS = ['◇', '◈', '↗', '✳', '✓', '↺', '●', '⌁', '□', '✦'];

export function escapeHTML(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? color : '#e9bc75';
}

export function orderedStages(stages) {
  return [...stages].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function casesForStage(cases, stageId, query = '', sort = 'oldest') {
  const search = query.trim().toLocaleLowerCase('pt-BR');
  return cases.filter(item => (!stageId || item.stage_id === stageId) &&
    (!search || [item.id, item.title, item.address, item.owner, item.description, item.note]
      .some(value => String(value ?? '').toLocaleLowerCase('pt-BR').includes(search))))
    .sort((a, b) => {
      const direction = sort === 'newest' ? -1 : 1;
      return direction * (a.opened_on.localeCompare(b.opened_on) || Number(a.id) - Number(b.id));
    });
}

export function daysSince(isoDate, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate ?? '')) return 0;
  const [year, month, day] = isoDate.split('-').map(Number);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today - Date.UTC(year, month - 1, day)) / 86400000));
}

export function caseCode(id) { return `RP-${String(id).padStart(5, '0')}`; }

export function reorderIds(stages, id, direction) {
  const ids = orderedStages(stages).map(stage => stage.id);
  const index = ids.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return ids;
  [ids[index], ids[next]] = [ids[next], ids[index]];
  return ids;
}