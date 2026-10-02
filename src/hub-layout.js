// Coordenadas em porcentagem da área do hub. A distribuição é irregular como
// no painel de referência, mas mantém uma volta contínua na ordem das etapas.
const slots = [
  [10, 36], [23, 24], [37, 11], [51, 12], [65, 22], [82, 28],
  [91, 49], [81, 70], [67, 83], [52, 86], [37, 81], [22, 75], [11, 57],
];

const smallLayouts = {
  1: [[50, 19]],
  2: [[18, 42], [82, 42]],
  3: [[24, 28], [77, 29], [50, 83]],
  4: [[21, 29], [77, 29], [77, 76], [21, 76]],
  5: [[15, 39], [37, 16], [78, 30], [75, 77], [23, 77]],
  6: [[12, 37], [35, 16], [70, 25], [88, 52], [70, 79], [23, 77]],
};

export function hubStagePositions(count) {
  if (count <= 0) return [];
  const layout = smallLayouts[count] || Array.from({ length: count }, (_, index) =>
    slots[Math.floor(index * slots.length / count) % slots.length]);
  return layout.map(([x, y]) => ({ x, y }));
}
