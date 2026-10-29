// Rig registry and the modifiers every rig shares. A rig is a pure function of a few parameters:
// pose(params, j, N, ctx) → { pos, rot | basis, scale, bend, opacity, tex, uv?, size?, billboard? }
// for mesh j. Animation tweens those parameters, never the cards one by one.
//
// Shared parameters (any rig):
//   build        0 → 1 reveals the cards in order (a build-in); default 1 (all built)
//   buildSpread  how many cards overlap in the build-in stagger
//   idle         small seeded drift amplitude (world units) so nothing is ever still; loops with the scene
//   slice        { card, meshes: [j…], axis: 'x' | 'y' }: one card's image spread across those meshes
//   tilt, yaw, roll (degrees), lift (y): the whole rig's transform, applied by the runtime
import { TAU, clamp, lerp, smooth } from './math.js';
import { hash } from '../prng.js';
import ring from './ring.js';
import spine from './spine.js';
import stack from './stack.js';
import scatter from './scatter.js';
import grid from './grid.js';
import sphere from './sphere.js';
import wall from './wall.js';
import arc from './arc.js';
import mosaic from './mosaic.js';

export const RIGS = { ring, spine, stack, scatter, grid, sphere, wall, arc, mosaic };
export const SHARED = { build: 1, buildSpread: 2.5, idle: 0, slice: null, tilt: 0, yaw: 0, roll: 0, lift: 0, seed: 1 };

export function rigParams(spec) {
  const rig = RIGS[spec.type];
  if (!rig) throw new Error(`unknown rig "${spec.type}" (${Object.keys(RIGS).join(', ')})`);
  return { ...SHARED, ...rig.defaults, ...spec };
}

// Every mesh's pose at time fraction u (0 → 1 over the scene; drives the idle drift so it loops).
export function poses(p, N, ctx) {
  const rig = RIGS[p.type];
  const n = rig.count(p, N);
  const out = [];
  for (let j = 0; j < n; j++) {
    const q = { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, bend: 0, opacity: 1, tex: j % N, ...rig.pose(p, j, N, ctx) };
    // Build-in: card j arrives as `build` passes its slot; it rises from slightly behind and scales up.
    if (p.build < 1) {
      const b = smooth(clamp((p.build * (n + p.buildSpread) - j) / p.buildSpread));
      q.opacity *= b;
      q.scale *= lerp(0.82, 1, b);
      q.pos = [q.pos[0], q.pos[1] - (1 - b) * 0.25, q.pos[2] - (1 - b) * 0.6];
    }
    if (p.idle) {
      const w = salt => Math.sin(TAU * ((1 + Math.floor(hash(p.seed, j, salt) * 2)) * (ctx.u || 0) + hash(p.seed, j, salt + 7)));
      q.pos = [q.pos[0] + p.idle * w(1), q.pos[1] + p.idle * 0.8 * w(2), q.pos[2] + p.idle * 0.5 * w(3)];
      if (q.rot) q.rot = [q.rot[0] + p.idle * 0.12 * w(4), q.rot[1] + p.idle * 0.18 * w(5), q.rot[2] + p.idle * 0.1 * w(6)];
    }
    out.push(q);
  }
  if (p.slice && Array.isArray(p.slice.meshes)) {
    const k = p.slice.meshes.length;
    p.slice.meshes.forEach((j, i) => {
      if (!out[j]) return;
      const A = ctx.aspects[p.slice.card] || ctx.A;
      out[j].tex = p.slice.card;
      out[j].uv = p.slice.axis === 'y' ? [0, 1 - (i + 1) / k, 1, 1 - i / k] : [i / k, 0, (i + 1) / k, 1];
      out[j].size = p.slice.axis === 'y' ? [A, 1 / k] : [A / k, 1];
    });
  }
  return out;
}
