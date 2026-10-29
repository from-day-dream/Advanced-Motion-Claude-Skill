// spine: cards travel along a curve (path mode: an S-curve feed of pages, banking as they turn) or
// stream out of a point on a widening spiral toward the camera (spiral mode). Animate `offset`
// (fraction of the path); loops by 1, since cards wrap from the end back to the start.
import { TAU, D2R, mod, clamp, lerp, smooth, makePath, basis, rotate, sub, scale, dot, norm } from './math.js';

const paths = new Map();
// `stretch` scales the path's height, so a longer feed of cards keeps its spacing.
const pathFor = p => {
  const key = JSON.stringify([p.points, p.closed, p.stretch]);
  if (!paths.has(key)) paths.set(key, makePath(p.points.map(q => [q[0], q[1] * p.stretch, q[2] ?? 0]), p.closed));
  return paths.get(key);
};

export default {
  name: 'spine',
  modes: ['path', 'spiral'],
  defaults: {
    mode: 'path', offset: 0, spacing: 'auto', closed: false, fadeEnds: 0.1,
    points: [[-0.9, -3.4, 0], [0.8, -1.3, -0.5], [-0.8, 0.9, -0.3], [0.7, 3.4, 0]],
    stretch: 1, bank: 28, twist: 0, scaleStart: 1, scaleEnd: 1,
    turns: 2.2, r0: 0.05, r1: 2.6, z0: -7, z1: 2.2,
  },
  count: (p, N) => N,
  periods: () => ({ offset: 1 }),

  pose(p, j, N) {
    const spacing = typeof p.spacing === 'number' ? p.spacing : 1 / N;
    const u = mod(p.offset + j * spacing, 1);
    const fade = clamp(u / p.fadeEnds) * clamp((1 - u) / p.fadeEnds);
    const s = lerp(p.scaleStart, p.scaleEnd, u);
    if (p.mode === 'spiral') {
      const a = TAU * p.turns * u, r = lerp(p.r0, p.r1, u ** 1.3);
      return {
        pos: [Math.cos(a) * r, Math.sin(a) * r, lerp(p.z0, p.z1, u)],
        rot: [0, 0, a * p.twist / 360],
        scale: s, opacity: smooth(fade), tex: j % N,
      };
    }
    const { p: pos, t } = pathFor(p).at(u);
    // Card up follows the path; its face turns toward the camera, banked by how much the path leans sideways.
    let face = norm(sub([0, 0, 1], scale(t, dot(t, [0, 0, 1]))));
    face = rotate(face, t, -p.bank * D2R * t[0] + p.twist * D2R * u);
    return { pos, basis: basis(face, t), scale: s, opacity: p.closed ? 1 : smooth(fade), tex: j % N };
  },
};
