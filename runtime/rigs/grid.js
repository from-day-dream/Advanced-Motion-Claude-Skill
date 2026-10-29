// grid: an editorial grid; cards pop in at cells and drift gently in depth; optional grid lines draw on.
// Animate `pop` (0 → N reveals cards in order), `draw` (0 → 1 draws the lines) and `phase` (loops by 1).
import { TAU, clamp, lerp, smooth } from './math.js';
import { hash } from '../prng.js';

export default {
  name: 'grid',
  modes: [],
  defaults: { cols: 2, rows: 3, gap: 0.28, slots: null, pop: 'all', zAmp: 0.12, phase: 0, lines: true, draw: 1, seed: 5 },
  count: (p, N) => N,
  periods: () => ({ phase: 1 }),

  cell(p, A) { return [A + p.gap, 1 + p.gap]; },

  pose(p, j, N, ctx) {
    const [cw, ch] = this.cell(p, ctx.A);
    const slot = Array.isArray(p.slots) ? p.slots[j % p.slots.length] : j;
    const c = slot % p.cols, r = Math.floor(slot / p.cols);
    const pop = typeof p.pop === 'number' ? p.pop : N;
    const b = smooth(clamp(pop - j));
    return {
      pos: [(c - (p.cols - 1) / 2) * cw, ((p.rows - 1) / 2 - r) * ch, p.zAmp * Math.sin(TAU * (p.phase * (1 + (j % 2)) + hash(p.seed, j)))],
      scale: lerp(0.6, 1, b), opacity: clamp(b * 2.5), tex: j,
    };
  },

  // Line segments [x0, y0, z0, x1, y1, z1] on the cell boundaries, extended past the grid.
  lines(p, N, ctx) {
    if (!p.lines) return [];
    const [cw, ch] = this.cell(p, ctx.A), W = p.cols * cw, H = p.rows * ch, ext = 0.6, z = -0.3, out = [];
    for (let c = 0; c <= p.cols; c++) { const x = -W / 2 + c * cw; out.push([x, -H / 2 - ext, z, x, H / 2 + ext, z]); }
    for (let r = 0; r <= p.rows; r++) { const y = -H / 2 + r * ch; out.push([-W / 2 - ext, y, z, W / 2 + ext, y, z]); }
    return out;
  },
};
