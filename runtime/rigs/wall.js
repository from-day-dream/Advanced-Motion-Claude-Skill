// wall: a large grid of cards on one plane (tilt it with the rig's `tilt`), scrolling forever.
// Animate `scrollX` / `scrollY` in cells; each loops by its grid size (cols / rows), as every cell
// keeps its card. cols and rows include margin cells so the wrap happens out of frame.
import { mod } from './math.js';

export default {
  name: 'wall',
  modes: [],
  defaults: { cols: 6, rows: 9, gap: 0.14, scrollX: 0, scrollY: 0, curvature: 0 },
  count: p => p.cols * p.rows,
  periods: p => ({ scrollX: p.cols, scrollY: p.rows }),

  pose(p, j, N, ctx) {
    const cw = ctx.A + p.gap, ch = 1 + p.gap;
    const c = j % p.cols, r = Math.floor(j / p.cols);
    const x = (mod(c + p.scrollX, p.cols) - p.cols / 2 + 0.5) * cw;
    const y = -(mod(r + p.scrollY, p.rows) - p.rows / 2 + 0.5) * ch;
    // Shift tex by row so neighbouring rows don't repeat the same column of cards.
    const tex = (c + r * 3) % N;
    if (!p.curvature) return { pos: [x, y, 0], tex };
    const R = 1 / p.curvature, a = x / R;
    return { pos: [R * Math.sin(a), y, -R * (1 - Math.cos(a))], rot: [0, -a, 0], bend: p.curvature, tex };
  },
};
