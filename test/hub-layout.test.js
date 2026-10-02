import test from 'node:test';
import assert from 'node:assert/strict';
import { hubStagePositions } from '../src/hub-layout.js';

test('as etapas configuráveis mantêm posições distintas e espaço para o núcleo', () => {
  for (let count = 1; count <= 12; count++) {
    const points = hubStagePositions(count);
    assert.equal(points.length, count);
    for (const { x, y } of points) {
      assert.ok(x >= 10 && x <= 91 && y >= 11 && y <= 86);
      assert.ok(Math.hypot((x - 50) * 13.2, (y - 50) * 6) > 120);
    }
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const a = points[i], b = points[j];
        assert.ok(Math.hypot((a.x - b.x) * 13.2, (a.y - b.y) * 6) > 80,
          `etapas ${i} e ${j} próximas demais com ${count} etapas`);
      }
    }
  }
});
