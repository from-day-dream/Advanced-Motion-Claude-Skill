// arc: cards in a row or a fan.
//   flow  cover flow: the focus card flat in the centre, the others angled away to the sides. Animate
//         `focus` (a card index, fractional between cards); with `loop` it wraps and loops by N.
//   fan   cards fan open from a pivot below them. Animate `open` (0 closed → 1 open).
import { D2R, mod, clamp } from './math.js';

export default {
  name: 'arc',
  modes: ['flow', 'fan'],
  defaults: { mode: 'flow', focus: 0, loop: false, centerGap: 0.14, sideGap: 0.3, sideAngle: 62, depthBack: 0.55, visible: 4, spread: 64, open: 1, pivot: 1.9 },
  count: (p, N) => N,
  periods: (p, N) => (p.mode === 'flow' && p.loop ? { focus: N } : {}),

  pose(p, j, N, ctx) {
    const A = ctx.A;
    if (p.mode === 'fan') {
      const side = N > 1 ? (j - (N - 1) / 2) / ((N - 1) / 2) : 0;
      const a = -side * p.spread / 2 * p.open * D2R;
      return { pos: [-Math.sin(a) * p.pivot, -p.pivot + Math.cos(a) * p.pivot, j * 0.015], rot: [0, 0, a], tex: j };
    }
    let d = j - p.focus;
    if (p.loop) d = mod(d + N / 2, N) - N / 2;
    const ad = Math.abs(d), sgn = Math.sign(d), near = Math.min(ad, 1), far = Math.max(ad - 1, 0);
    const first = A / 2 + p.centerGap + (A / 2) * Math.cos(p.sideAngle * D2R);
    return {
      pos: [sgn * (near * first + far * p.sideGap), 0, -near * p.depthBack - far * 0.02],
      rot: [0, -sgn * near * p.sideAngle * D2R, 0],
      opacity: clamp(p.visible + 1 - ad),
      tex: j,
    };
  },
};
