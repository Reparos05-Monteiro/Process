import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepairRepository } from '../src/repair-repository.js';

test('aprovação de acesso insere apenas editor e deixa a atomicidade para o trigger', async () => {
  const calls = [];
  const db = {
    from(table) {
      assert.equal(table, 'repair_members');
      return {
        async insert(payload) {
          calls.push(payload);
          return { data: null, error: null };
        },
      };
    },
  };
  const repository = createRepairRepository(db);
  await repository.approveAccess('00000000-0000-4000-8000-000000000010');
  assert.deepEqual(calls, [{
    user_id: '00000000-0000-4000-8000-000000000010',
    role: 'editor',
  }]);
});

test('edição usa updated_at como trava otimista', async () => {
  const filters = [];
  const result = { data: { id: 12, updated_at: '2026-10-02T10:00:01Z' }, error: null };
  const query = {
    update(payload) { this.payload = payload; return this; },
    eq(column, value) { filters.push([column, value]); return this; },
    select(columns) { this.columns = columns; return this; },
    async maybeSingle() { return result; },
  };
  const db = { from: table => {
    assert.equal(table, 'repair_cases');
    return query;
  } };
  const repository = createRepairRepository(db);
  const updated = await repository.updateCase(
    12,
    '2026-10-02T10:00:00Z',
    { title: 'Novo título' }
  );
  assert.deepEqual(filters, [
    ['id', 12],
    ['updated_at', '2026-10-02T10:00:00Z'],
  ]);
  assert.equal(updated.id, 12);
});

test('resultado com erro do Supabase é propagado', async () => {
  const db = {
    from: () => ({ insert: async () => ({ data: null, error: new Error('falha') }) }),
  };
  const repository = createRepairRepository(db);
  await assert.rejects(repository.approveAccess('x'), /falha/);
});
