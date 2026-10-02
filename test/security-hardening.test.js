import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('configuração pública não contém credenciais privilegiadas', async () => {
  const config = await read('src/public-config.js');
  const match = config.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*["']([^"']+)["']/);
  assert.ok(match, 'publishable key não encontrada');
  assert.match(match[1], /^sb_publishable_/);
  assert.doesNotMatch(match[1], /service_role|sb_secret_/i);
});

test('deploy envia headers de segurança essenciais', async () => {
  const vercel = JSON.parse(await read('vercel.json'));
  const headers = Object.fromEntries(vercel.headers[0].headers.map(item => [item.key.toLowerCase(), item.value]));
  assert.match(headers['content-security-policy'], /default-src 'self'/);
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.match(headers['permissions-policy'], /camera=\(\)/);
});

test('schema exige autenticação para dados operacionais e inclui hardening', async () => {
  const schema = await read('supabase/schema.sql');
  assert.doesNotMatch(schema, /repair_stages for select to anon/);
  assert.doesNotMatch(schema, /repair_settings for select to anon/);
  assert.match(schema, /private\.repair_is_member/);
  assert.match(schema, /repair_approve_access/);
  assert.match(schema, /repair_stages_limit/);
  assert.match(schema, /repair_cases_created_by_idx/);
});

test('frontend usa aprovação atômica, trava otimista e debounce', async () => {
  const main = await read('src/main.js');
  const repository = await read('src/repair-repository.js');
  assert.match(main, /repository\.approveAccess\(id\)/);
  assert.match(main, /\^sb_publishable_/);
  assert.match(repository, /db\.rpc\('repair_approve_access'/);
  assert.match(repository, /\.eq\('updated_at', previousUpdatedAt\)/);
  assert.match(main, /setTimeout\(\(\) => \{[\s\S]*render\(\);[\s\S]*\}, 140\)/);
});

test('CSS legado do hub não volta a competir com o refinamento', async () => {
  const base = await read('src/style.css');
  const refinement = await read('src/refinement.css');
  assert.doesNotMatch(base, /\.hub(?:\b|[-_])/);
  assert.match(refinement, /svg\.hub-waves/);
  assert.match(refinement, /stroke:\s*none/);
});
