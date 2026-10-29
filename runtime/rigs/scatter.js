// scatter: a loose, seeded arrangement of tilted cards in shallow depth that drift and turn.
// Animate `phase` (drift cycles; loops by 1) and `cluster` (spread scale, e.g. gathering in).
// `keepOut` keeps a horizontal band around the centre clear (a fraction of the height), for a line of type.
import { TAU, D2R } from './math.js';
import { hash } from '../prng.js';

export default {
  name: 'scatter',
  modes: [],
  defaults: { seed: 7, spread: [2.6, 3.9, 1.1], rotRange: [10, 16, 12], drift: [0.07, 0.09, 0.06], driftRot: 3, phase: 0, cluster: 1, jitter: 0.32, keepOut: 0 },
  count: (p, N) => N,
  periods: () => ({ phase: 1 }),

  pose(p, j, N) {
    const r = salt => hash(p.seed, j, salt);
    // Stratified cells over the spread box, so cards scatter without piling up.
    const cols = Math.max(1, Math.round(Math.sqrt(N * p.spread[0] / p.spread[1]))), rows = Math.ceil(N / cols);
    const order = [...Array(cols * rows).keys()].sort((a, b) => hash(p.seed, a, 9) - hash(p.seed, b, 9));
    const cell = order[j], c = cell % cols, row = Math.floor(cell / cols);
    const cw = p.spread[0] / cols, ch = p.spread[1] / rows;
    const base = [
      ((c + 0.5) / cols - 0.5) * p.spread[0] + (r(1) - 0.5) * cw * p.jitter * 2,
      (0.5 - (row + 0.5) / rows) * p.spread[1] + (r(2) - 0.5) * ch * p.jitter * 2,
      (r(3) - 0.5) * p.spread[2],
    ];
    if (p.keepOut > 0) {
      const half = p.spread[1] / 2, k = Math.min(0.9, p.keepOut);
      base[1] = Math.sign(base[1] || 1) * (k + Math.abs(base[1]) / half * (1 - k)) * half;
    }
    // Drift: whole cycles of the phase, so phase 0 and phase 1 give the same pose.
    const w = (axis, salt) => Math.sin(TAU * (p.phase * (1 + Math.floor(r(salt) * 2)) + r(salt + 10)));
    return {
      pos: base.map((v, i) => v * p.cluster + p.drift[i] * w(i, 20 + i)),
      rot: [0, 1, 2].map(i => ((r(4 + i) * 2 - 1) * p.rotRange[i] + p.driftRot * w(i, 30 + i)) * D2R),
      tex: j,
    };
  },
};
