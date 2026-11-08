// Replaceable DEMO physics profile. SI units, model axes: +Z nose, +Y up, +X right.
// Boxes approximate load-bearing volumes; the ring is hollow, not a solid disk.
const box = (center, size, angle = 0) => ({ center, size, angle });
const part = (id, label, mass, center, boxes, area = .004, section = .006) => ({
  id, label, mass, center, boxes, area: area * 4, section: section * 4,
  damageEnergyJ: Math.max(150000, mass * 500),
  aimPoint: id === 'solar' ? [0, 3.5, -11.6] : id === 'ring' ? [10.5, 0, -2] : center,
  approach: id === 'cargo' ? [0, 1, 0] : id === 'solar' ? [0, 0, 1] : id === 'ring' ? [-1, 0, 0] : [0, -1, 0],
  shearStrength: 120e6, tensileStrength: 240e6, contactSeconds: .02,
  attachmentAxis: id === 'cargo' ? [0, 1, 0] : ['solarRight', 'solarLeft'].includes(id) ? [1, 0, 0] : [0, 0, 1],
});
export const DEMO_PARTS = [
  part('command', 'Command module', 1500, [0, 0, 13], [box([0, 0, 13], [3.4, 3.4, 5]), box([0, 0, 16.1], [2.5, 2.5, 1.2])]),
  part('hab', 'Habitation module', 1500, [0, 0, 7.4], [box([0, 0, 7.4], [2.9, 2.9, 4.4])]),
  part('node', 'Junction node', 1500, [0, 0, 3.6], [box([0, 0, 3.6], [3.8, 3.8, 3.8])]),
  part('cargo', 'Cargo pod', 1500, [0, -4.4, 3.6], [box([0, -4.4, 3.6], [3.6, 2.6, 3.6])]),
  part('spine', 'Spine truss', 1800, [0, 0, -5], [box([0, 0, -5.8], [1.2, 1.2, 15.6])], .012, .015),
  part('ring', 'Habitat ring', 9000, [0, 0, -2], [
    box([0, 0, -2], [3.1, 3.1, 2.4]),
    ...Array.from({ length: 36 }, (_, i) => {
      const a = i * Math.PI / 18;
      return box([10.5 * Math.cos(a), 10.5 * Math.sin(a), -2], [1.3, 1.87, 1.9], a);
    }),
    ...[90, 210, 330].map(deg => { const a = deg * Math.PI / 180; return box([5.6 * Math.cos(a), 5.6 * Math.sin(a), -2], [8.2, .6, .6], a); }),
  ], .01, .02),
  part('solar', 'Auxiliary arrays & radiators', 400, [0, 0, -10], [box([0, 3, -11.6], [1.6, 4, .1]), box([0, -3, -11.6], [1.6, 4, .1])], .001, .002),
  part('solarRight', 'Right solar wing', 100, [6.1, 0, -6], [box([6.1, 0, -6], [9.2, .15, 3])], .0005, .001),
  part('solarLeft', 'Left solar wing', 100, [-6.1, 0, -6], [box([-6.1, 0, -6], [9.2, .15, 3])], .0005, .001),
  part('engine', 'Engine section', 3000, [0, 0, -16.3], [box([0, 0, -15.5], [5.4, 5.4, 6]), box([0, 0, -19.5], [2.8, 2.8, 2])], .008, .012),
];
export const DEMO_ARM_MOUNTS = {
  command: { part: 'command', position: [0, 1.7, 11.8] },
  hab: { part: 'hab', position: [1.45, 0, 8] },
  node: { part: 'node', position: [-2.35, 0, 3.6] },
  cargo: { part: 'cargo', position: [0, -5.8, 3.6] },
  ringHub: { part: 'ring', position: [0, 1.55, -1.4] },
  ringRailA: { part: 'ring', position: [9.21, 5.03, -.74] },
  ringRailB: { part: 'ring', position: [-9.21, -5.03, -.74] },
  solarRight: { part: 'solarRight', position: [1, .22, -6] },
  solarLeft: { part: 'solarLeft', position: [-1, -.22, -6] },
  engine: { part: 'engine', position: [2.8, 0, -14] },
};
