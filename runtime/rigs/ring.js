// ring: cards on a cylinder (cylinder mode; `rows` stacks rings to fill a tall frame) or lining a tube
// the camera flies through (tunnel mode).
// Animate `angle` (cylinder) or `travel` (tunnel). Loops: angle by 360, travel by rings × spacing.
import { TAU, D2R, mod, clamp, basis } from './math.js';

const radiusFor = (p, N, A) => {
  if (typeof p.radius === 'number') return p.radius;
  const around = p.mode === 'tunnel' ? p.perRing : N;
  return Math.max(1.2, around * (A + p.gap) / TAU);
};
const ringsFor = (p, N) => (typeof p.rings === 'number' ? p.rings : Math.max(6, Math.ceil(N / p.perRing)));

export default {
  name: 'ring',
  modes: ['cylinder', 'tunnel'],
  defaults: { mode: 'cylinder', radius: 'auto', angle: 0, facing: 'out', bend: 1, gap: 0.14, rows: 1, rowGap: 0.12, perRing: 8, rings: 'auto', spacing: 1.5, travel: 0 },
  count: (p, N) => (p.mode === 'tunnel' ? p.perRing * ringsFor(p, N) : N * p.rows),
  periods: (p, N) => (p.mode === 'tunnel' ? { travel: ringsFor(p, N) * p.spacing } : { angle: 360 }),

  pose(p, j, N, ctx) {
    const R = radiusFor(p, N, ctx.A);
    if (p.mode !== 'tunnel') {
      // Rows stack upward, each shifted half a card so the posters brick-lay; row r shows cards from r × 3 on.
      const row = Math.floor(j / N), m = j % N;
      const a = mod(p.angle * D2R + TAU * (m + row * 0.5) / N, TAU);
      const out = p.facing !== 'in';
      return {
        pos: [Math.sin(a) * R, (row - (p.rows - 1) / 2) * (1 + p.rowGap), Math.cos(a) * R],
        rot: [0, out ? a : a + Math.PI, 0],
        // Bent to the cylinder: an outward card's edges fall away from the viewer, an inward card's come toward it.
        bend: (out ? -1 : 1) * p.bend / R,
        tex: (m + row * 3) % N,
      };
    }
    // Tunnel: rings along -z, each card's face toward the axis, its top pointing down the tube.
    const rings = ringsFor(p, N), k = Math.floor(j / p.perRing), m = j % p.perRing;
    const a = p.angle * D2R + TAU * m / p.perRing + (k % 2) * Math.PI / p.perRing;
    const total = rings * p.spacing;
    const z = mod(-k * p.spacing + p.travel + p.spacing, total) - total + p.spacing;
    const inward = [-Math.sin(a), -Math.cos(a), 0];
    return {
      pos: [Math.sin(a) * R, Math.cos(a) * R, z],
      basis: basis(inward, [0, 0, -1]),
      bend: p.bend / R,
      // Cards fade out as they pass the camera, so the wrap from front to back is never seen.
      opacity: clamp((p.spacing - z) / (p.spacing * 0.6)),
      tex: j % N,
    };
  },
};
