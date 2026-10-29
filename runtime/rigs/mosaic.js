// mosaic: one image split into tiles that separate into depth, turn, and reassemble.
// Animate `explode` (0 assembled → 1 apart; a loop goes 0 → 1 → 0).
import { D2R } from './math.js';
import { hash } from '../prng.js';

export default {
  name: 'mosaic',
  modes: [],
  defaults: { cols: 3, rows: 4, explode: 0, depth: 1.8, spread: 0.35, rotSpread: 40, seed: 3, card: 0 },
  count: p => p.cols * p.rows,
  periods: () => ({}),

  pose(p, j, N, ctx) {
    const A = ctx.aspects[p.card % N] || ctx.A;
    const w = A / p.cols, h = 1 / p.rows, c = j % p.cols, r = Math.floor(j / p.cols);
    const x = (c + 0.5) * w - A / 2, y = 0.5 - (r + 0.5) * h, e = p.explode;
    const rnd = salt => hash(p.seed, j, salt) * 2 - 1;
    return {
      pos: [x * (1 + p.spread * e) + rnd(1) * 0.15 * e, y * (1 + p.spread * e) + rnd(2) * 0.15 * e, rnd(3) * p.depth * e],
      rot: [rnd(4) * p.rotSpread * 0.6 * e * D2R, rnd(5) * p.rotSpread * e * D2R, rnd(6) * p.rotSpread * 0.4 * e * D2R],
      size: [w, h],
      uv: [c / p.cols, 1 - (r + 1) / p.rows, (c + 1) / p.cols, 1 - r / p.rows],
      tex: p.card % N,
    };
  },
};
