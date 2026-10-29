// stack: a deck in depth.
//   peel      seen from below; the front card lifts away and the next is revealed. Animate `peel`.
//   cycle     a cascaded deck; the front card swipes off and tucks behind. Animate `peel`.
//   corridor  parallel planes at an angle; the camera trucks along them. Animate `travel`.
// peel/cycle loop by N (every card has come round once); corridor by N × gap.
import { D2R, mod, clamp, lerp, smooth } from './math.js';

const rest = (p, k) => ({
  pos: [k * p.stepX, k * p.stepY, -k * p.gap],
  rot: [0, 0, k * p.stepRot * D2R],
  scale: 1 - k * p.shrink,
  opacity: clamp(p.depth - k + 1),
});

export default {
  name: 'stack',
  modes: ['peel', 'cycle', 'corridor'],
  defaults: {
    mode: 'peel', peel: 0, gap: 0.09, stepX: 0, stepY: 0.06, stepRot: 0, shrink: 0, depth: 'all',
    lift: 2.4, liftRot: -38, swipe: 1.7, swipeRot: 16,
    travel: 0, side: 0.75, sideAngle: -58, alternate: false, corridorGap: 0.95,
  },
  count: (p, N) => N,
  periods: (p, N) => (p.mode === 'corridor' ? { travel: N * p.corridorGap } : { peel: N }),

  pose(p0, j, N) {
    const p = { ...p0, depth: typeof p0.depth === 'number' ? p0.depth : N };
    if (p.mode === 'corridor') {
      const total = N * p.corridorGap;
      const z = mod(-j * p.corridorGap + p.travel + p.corridorGap, total) - total + p.corridorGap;
      const left = p.alternate && j % 2;
      return {
        pos: [p.alternate ? (left ? -p.side : p.side) : 0, 0, z],
        rot: [0, (left ? -1 : 1) * p.sideAngle * D2R, 0],
        opacity: clamp((p.corridorGap - z) / (p.corridorGap * 0.6)),
        tex: j,
      };
    }
    const k = mod(j - p.peel, N);
    if (k <= N - 1) return { ...rest(p, k), tex: j };
    // The front card in transit to the back: s runs 0 → 1 while `peel` passes from j to j + 1.
    const s = N - k, front = rest(p, 0), back = rest(p, N - 1);
    if (p.mode === 'peel') {
      if (s < 0.6) {
        const q = s / 0.6;
        return { ...front, pos: [front.pos[0], front.pos[1] + q * p.lift, front.pos[2] + q * 0.4], rot: [q * p.liftRot * D2R, 0, 0], opacity: 1 - smooth(q), tex: j };
      }
      return { ...back, opacity: back.opacity * smooth((s - 0.6) / 0.4), tex: j };
    }
    // cycle: swipe out to the side, then tuck in behind the deck.
    if (s < 0.5) {
      const q = smooth(s / 0.5);
      return { ...front, pos: [front.pos[0] + q * p.swipe, front.pos[1], front.pos[2] + q * 0.15], rot: [0, 0, q * p.swipeRot * D2R], tex: j };
    }
    const q = smooth((s - 0.5) / 0.5);
    return {
      pos: [lerp(front.pos[0] + p.swipe, back.pos[0], q), lerp(front.pos[1], back.pos[1], q), lerp(front.pos[2] + 0.15, back.pos[2], q)],
      rot: [0, 0, lerp(p.swipeRot * D2R, back.rot[2], q)],
      scale: lerp(front.scale, back.scale, q), opacity: back.opacity, tex: j,
    };
  },
};
