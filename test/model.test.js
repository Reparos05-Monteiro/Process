import test from 'node:test';
import assert from 'node:assert/strict';
import { casesForStage, daysSince, escapeHTML, orderedStages, reorderIds, safeColor } from '../src/model.js';

test('etapas reordenam sem perder identificadores estáveis', () => {
  const stages = [{ id: 'b', sort_order: 20 }, { id: 'a', sort_order: 10 }, { id: 'c', sort_order: 30 }];
  assert.deepEqual(orderedStages(stages).map(s => s.id), ['a', 'b', 'c']);
  assert.deepEqual(reorderIds(stages, 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(reorderIds(stages, 'a', -1), ['a', 'b', 'c']);
});

test('filtro e ordenação preservam os casos da etapa correta', () => {
  const cases = [
    { id: 1, stage_id: 'x', title: 'Pia', address: 'Rua Um', owner: 'Ana', opened_on: '2026-01-02' },
    { id: 2, stage_id: 'y', title: 'Pintura', address: 'Rua Dois', owner: 'Felipe', opened_on: '2026-01-01' },
    { id: 3, stage_id: 'x', title: 'Porta', address: 'Rua Três', owner: 'Ana', opened_on: '2026-01-03' },
  ];
  assert.deepEqual(casesForStage(cases, 'x', 'ANA', 'newest').map(c => c.id), [3, 1]);
  assert.deepEqual(casesForStage(cases, null, 'p', 'oldest').map(c => c.id), [2, 1, 3]);
});

test('entrada exibida escapa HTML e cores inválidas não entram no estilo', () => {
  assert.equal(escapeHTML('<img src="x" onerror=\'x\'>'), '&lt;img src=&quot;x&quot; onerror=&#39;x&#39;&gt;');
  assert.equal(safeColor('red; background:url(x)'), '#e9bc75');
  assert.equal(safeColor('#abcDEF'), '#abcDEF');
});

test('idade do caso compara dias de calendário sem arredondamento de horário', () => {
  assert.equal(daysSince('2026-09-29', new Date(2026, 8, 30, 0, 1)), 1);
  assert.equal(daysSince('2026-10-01', new Date(2026, 8, 30)), 0);
});