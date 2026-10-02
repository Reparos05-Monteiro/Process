import test from 'node:test';
import assert from 'node:assert/strict';
import { mountHubMotion, wakeRoute } from '../src/hub-motion.js';

test('a rota termina na borda real dos ícones em qualquer proporção de tela', () => {
  const source = { x: 34, y: 90, radius: 28.5 };
  const target = { x: 288, y: 170, radius: 28.5 };
  const center = { x: 161, y: 130, radius: 63 };
  const route = wakeRoute(source, target, center);
  assert.ok(route);
  assert.ok(Math.abs(Math.hypot(route.start.x - source.x, route.start.y - source.y) - 36.5) < 1e-8);
  assert.ok(Math.abs(Math.hypot(route.end.x - target.x, route.end.y - target.y) - 36.5) < 1e-8);
  assert.ok(route.d.startsWith('M') && route.d.includes(' Q'));
  assert.notEqual(route.control.y, 130, 'etapas opostas devem contornar o centro');
  const middle = { x: (route.start.x + 2 * route.control.x + route.end.x) / 4,
    y: (route.start.y + 2 * route.control.y + route.end.y) / 4 };
  assert.ok(Math.hypot(middle.x - center.x, middle.y - center.y) > center.radius + 20);
});

test('o destaque muda na chegada e a próxima onda inicia sem pausa', () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const oldObserver = globalThis.ResizeObserver;
  const classes = () => {
    const set = new Set();
    return { add: (...names) => names.forEach(name => set.add(name)),
      remove: (...names) => names.forEach(name => set.delete(name)),
      contains: name => set.has(name) };
  };
  const positions = [80, 320];
  const stages = positions.map(x => ({
    classList: classes(),
    querySelector: () => ({ getBoundingClientRect: () => ({ left: x, top: 70, width: 64, height: 64 }) }),
  }));
  const paths = positions.map(() => {
    const attrs = new Map([['d', 'M0 0']]);
    return { setAttribute: (name, value) => attrs.set(name, value), getAttribute: name => attrs.get(name) };
  });
  const wakes = positions.map(() => ({ classList: classes() }));
  const motions = positions.map(() => {
    const events = new EventTarget();
    return { starts: 0, addEventListener: (...args) => events.addEventListener(...args),
      removeEventListener: (...args) => events.removeEventListener(...args),
      beginElement() { this.starts++; }, endElement() { events.dispatchEvent(new Event('endEvent')); },
      arrive() { events.dispatchEvent(new Event('endEvent')); } };
  });
  const svg = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 300 }), setAttribute() {} };
  const orbit = { isConnected: true, querySelector: selector => selector === '.hub-center'
    ? { getBoundingClientRect: () => ({ width: 154 }) } : svg,
    querySelectorAll: selector => ({ '[data-hub-stage]': stages, '[data-flow-path]': paths,
      '[data-flow-wake]': wakes, '[data-flow-motion]': motions })[selector] };
  const media = Object.assign(new EventTarget(), { matches: false });
  globalThis.window = { matchMedia: () => media };
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };

  try {
    const dispose = mountHubMotion(orbit);
    assert.equal(motions[0].starts, 1);
    assert.equal(stages[0].classList.contains('auto-hover'), true);
    assert.equal(stages[1].classList.contains('auto-hover'), false);
    assert.equal(wakes[0].classList.contains('running'), true);
    assert.notEqual(paths[0].getAttribute('d'), 'M0 0');

    motions[0].arrive();
    assert.equal(stages[0].classList.contains('auto-hover'), false);
    assert.equal(stages[1].classList.contains('auto-hover'), true);
    assert.equal(stages[1].classList.contains('flow-arrived'), true);
    assert.equal(wakes[0].classList.contains('running'), false);
    assert.equal(motions[1].starts, 1, 'o próximo segmento começa no evento de chegada');
    assert.equal(wakes[1].classList.contains('running'), true);

    motions[1].arrive();
    assert.equal(stages[0].classList.contains('auto-hover'), true);
    assert.equal(motions[0].starts, 2, 'o fluxo continua ao retornar ao início');

    media.matches = true;
    media.dispatchEvent(new Event('change'));
    assert.equal(stages[1].classList.contains('auto-hover'), false);
    assert.equal(wakes.some(wake => wake.classList.contains('running')), false);
    media.matches = false;
    media.dispatchEvent(new Event('change'));
    assert.equal(motions[0].starts, 3, 'ao desativar redução de movimento, o fluxo reinicia');

    dispose();
    assert.equal(stages[1].classList.contains('auto-hover'), false);
    motions[0].arrive();
    assert.equal(motions[1].starts, 1);
  } finally {
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
    globalThis.ResizeObserver = oldObserver;
  }
});
