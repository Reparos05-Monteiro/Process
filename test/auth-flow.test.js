import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';

function tick() { return new Promise(resolve => setTimeout(resolve, 0)); }

test('primeira tela pede autenticação; cadastro e login avançam para liberação', async () => {
  const listeners = {};
  const app = { innerHTML: '' };
  const notice = { textContent: '', className: '' };
  const requests = [];
  let user = null;
  let publicReads = 0;
  const db = {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      signUp: async ({ email, password, options }) => {
        assert.equal(email, 'dono@example.com');
        assert.equal(password, 'senha-super-segura');
        assert.equal(options.emailRedirectTo, 'https://reparos.example/');
        return { data: { user: { email }, session: null }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        assert.equal(email, 'dono@example.com');
        assert.equal(password, 'senha-super-segura');
        user = { id: '00000000-0000-4000-8000-000000000001', email };
        return { data: { user }, error: null };
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from(table) {
      if (table === 'repair_members') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      if (table === 'repair_access_requests') {
        return { insert: async payload => { requests.push(payload); return { data: null, error: null }; } };
      }
      publicReads++;
      throw Error(`Leitura pública inesperada: ${table}`);
    },
  };
  const document = {
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '#notice') return notice;
      return { focus() {} };
    },
    addEventListener(type, handler) { listeners[type] = handler; },
  };
  class FakeFormData {
    constructor(form) { this.fields = form.fields; }
    get(key) { return this.fields[key] ?? null; }
  }
  const source = (await readFile(new URL('../src/main.js', import.meta.url), 'utf8'))
    .replace("import { createClient } from '@supabase/supabase-js';", '')
    .replace(/^import '.\/.*\.css';$/gm, '')
    .replace(/import \{[\s\S]*?\} from '.\/model\.js';/, '')
    .replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://supabase.example'")
    .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', "'chave-publica'");
  vm.runInNewContext(source, {
    ...model, e: model.escapeHTML, createClient: () => db, document,
    window: { location: { origin: 'https://reparos.example', pathname: '/' } },
    FormData: FakeFormData, URL, Date, Intl, setTimeout, clearTimeout,
  });
  await tick();
  assert.match(app.innerHTML, /id="login-form"/);
  assert.match(app.innerHTML, /Criar conta/);
  assert.doesNotMatch(app.innerHTML, /class="hub-orbit"/);
  assert.equal(publicReads, 0);

  const click = async action => {
    const button = { dataset: { action }, disabled: false, closest: () => button };
    await listeners.click({ target: button });
  };
  await click('auth-signup');
  assert.match(app.innerHTML, /id="signup-form"/);
  assert.match(app.innerHTML, /Confirmar senha/);
  const form = {
    id: 'signup-form', fields: { email: 'dono@example.com', password: 'senha-super-segura', confirm_password: 'senha-super-segura' },
    querySelector: () => ({ disabled: false }),
  };
  await listeners.submit({ target: form, preventDefault() {} });
  assert.equal(notice.textContent, '');
  assert.match(app.innerHTML, /Confira seu e-mail/);
  await click('auth-login');
  form.id = 'login-form';
  await listeners.submit({ target: form, preventDefault() {} });
  assert.match(app.innerHTML, /Aguardando liberação/);
  assert.doesNotMatch(app.innerHTML, /class="hub-orbit"/);
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{ user_id: user.id, email: user.email }]);
  assert.equal(publicReads, 0);
});