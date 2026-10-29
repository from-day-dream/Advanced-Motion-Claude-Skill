// Rig tests: every rig is pure and deterministic, and advancing a loop parameter by its period gives
// back the exact poses of t = 0 (so a looping scene's last frame meets its first).
import test from 'node:test';
import assert from 'node:assert/strict';
import { RIGS, rigParams, poses } from '../runtime/rigs/index.js';

const N = 12;
const ctx = (u = 0) => ({ A: 0.8, aspects: Array(N).fill(0.8), u });
const near = (a, b, label) => {
  const flat = q => [...q.pos, ...(q.rot || []), ...(q.basis ? [...q.basis.x, ...q.basis.y, ...q.basis.z] : []), q.scale, q.bend, q.opacity, q.tex];
  const x = flat(a), y = flat(b);
  assert.equal(x.length, y.length, label);
  x.forEach((v, i) => assert.ok(Math.abs(v - y[i]) < 1e-6, `${label}: component ${i} ${v} vs ${y[i]}`));
};
const finite = (list, label) => list.forEach((q, j) => [...q.pos, q.scale, q.opacity].forEach(v => assert.ok(Number.isFinite(v), `${label} mesh ${j} not finite`)));

const variants = Object.entries(RIGS).flatMap(([type, rig]) => (rig.modes.length ? rig.modes : [null]).map(mode => ({ type, ...(mode ? { mode } : {}) })));

for (const v of variants) {
  const label = v.mode ? `${v.type}/${v.mode}` : v.type;
  test(`${label}: deterministic and finite`, () => {
    const p = rigParams({ ...v, idle: 0.05 });
    const a = poses(p, N, ctx(0.37)), b = poses(p, N, ctx(0.37));
    finite(a, label);
    a.forEach((q, j) => near(q, b[j], `${label} mesh ${j}`));
  });

  test(`${label}: loops by its period`, () => {
    const p = rigParams({ ...v, ...(v.type === 'arc' ? { loop: true } : {}) });
    const periods = RIGS[v.type].periods(p, N);
    for (const [key, period] of Object.entries(periods)) {
      const start = poses(p, N, ctx(0));
      const end = poses({ ...p, [key]: (typeof p[key] === 'number' ? p[key] : 0) + period }, N, ctx(1));
      start.forEach((q, j) => near(q, end[j], `${label} ${key}+${period} mesh ${j}`));
    }
  });
}

test('idle drift returns to its start at u = 1', () => {
  const p = rigParams({ type: 'scatter', idle: 0.08 });
  poses(p, N, ctx(0)).forEach((q, j) => near(q, poses(p, N, ctx(1))[j], `scatter idle mesh ${j}`));
});

test('build 0 hides every card, build 1 shows them', () => {
  const p = rigParams({ type: 'stack', mode: 'cycle' });
  assert.ok(poses({ ...p, build: 0 }, N, ctx()).every(q => q.opacity === 0));
  assert.ok(poses({ ...p, build: 1 }, N, ctx()).every(q => q.opacity > 0));
});

test('slice spreads one card across meshes', () => {
  const p = rigParams({ type: 'stack', mode: 'peel', slice: { card: 2, meshes: [0, 1], axis: 'x' } });
  const [a, b] = poses(p, N, ctx());
  assert.equal(a.tex, 2); assert.equal(b.tex, 2);
  assert.deepEqual(a.uv, [0, 0, 0.5, 1]); assert.deepEqual(b.uv, [0.5, 0, 1, 1]);
});
