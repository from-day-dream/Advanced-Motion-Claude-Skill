// sphere: cards spread evenly on a sphere shell (Fibonacci points), orbiting a centre where the big
// line can sit, passing in front of and behind it. Animate `yaw` (loops by 360) and `pitch`.
import { D2R, rotate, norm, basis } from './math.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const countFor = (p, N) => Math.max(N, Math.round(N * p.density));

export default {
  name: 'sphere',
  modes: [],
  defaults: { radius: 'auto', yaw: 0, pitch: 14, face: 'tangent', density: 1, cardScale: 1 },
  count: countFor,
  periods: () => ({ yaw: 360 }),

  pose(p, j, N, ctx) {
    const n = countFor(p, N);
    const R = typeof p.radius === 'number' ? p.radius : Math.sqrt(n * ctx.A * 2.4 / (4 * Math.PI)) * p.cardScale;
    const y = 1 - 2 * (j + 0.5) / n, r = Math.sqrt(1 - y * y), th = j * GOLDEN;
    let pos = [Math.cos(th) * r * R, y * R, Math.sin(th) * r * R];
    pos = rotate(rotate(pos, [0, 1, 0], p.yaw * D2R), [1, 0, 0], p.pitch * D2R);
    const out = { pos, scale: p.cardScale, tex: j % N };
    if (p.face === 'billboard') return { ...out, billboard: true };
    return { ...out, basis: basis(norm(pos), [0, 1, 0]), bend: -1 / R * 0.6 };
  },
};
