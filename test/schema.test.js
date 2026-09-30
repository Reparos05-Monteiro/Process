import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('esquema aplica RLS para visitante, editor e administrador', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    const admin = '00000000-0000-4000-8000-000000000001';
    const editor = '00000000-0000-4000-8000-000000000002';
    await db.exec(`
      insert into auth.users (id) values ('${admin}'), ('${editor}');
      insert into public.repair_members (user_id,role)
        values ('${admin}','admin'), ('${editor}','editor');
    `);
    assert.equal((await db.query('select count(*)::integer as n from public.repair_cases')).rows[0].n, 0);
    assert.deepEqual((await db.query('select name from public.repair_stages order by sort_order')).rows.map(r => r.name),
      ['Orçando', 'Análise', 'Enviado', 'Execução', 'Finalizado', 'Execução PR']);

    await db.exec('set role anon');
    assert.equal((await db.query('select count(*)::integer as n from public.repair_stages')).rows[0].n, 6);
    await assert.rejects(db.query('select * from public.repair_cases'), /permission denied/);
    await db.exec('reset role');

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${editor}', false);`);
    assert.equal((await db.query("update public.repair_settings set title='Indevido' where id=1 returning id")).rows.length, 0);
    await assert.rejects(db.query("insert into public.repair_stages(name,sort_order) values('Indevida',70)"), /row-level security/);
    const stageId = (await db.query("select id from public.repair_stages where name='Orçando'")).rows[0].id;
    await db.query(`insert into public.repair_cases (stage_id,title,address,owner)
      values ($1,'Reparo teste','Rua Um, 10','Editor')`, [stageId]);
    assert.equal((await db.query('select count(*)::integer as n from public.repair_cases')).rows[0].n, 1);
    await db.exec('reset role');

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${admin}', false);`);
    assert.equal((await db.query("update public.repair_settings set title='Central Nova' where id=1 returning id")).rows.length, 1);
    const ids = (await db.query('select id from public.repair_stages order by sort_order')).rows.map(r => r.id);
    const reversed = [...ids].reverse();
    await db.query('select public.repair_reorder_stages($1::uuid[])', [reversed]);
    assert.deepEqual((await db.query('select id from public.repair_stages order by sort_order')).rows.map(r => r.id), reversed);
    await assert.rejects(db.query('delete from public.repair_stages where id=$1', [stageId]), /foreign key constraint/);
  } finally {
    await db.close();
  }
});