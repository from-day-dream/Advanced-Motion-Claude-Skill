// Small vector and path helpers for rigs. Pure ES module, no three.js, so rigs run under node --test.
export const TAU = Math.PI * 2;
export const D2R = Math.PI / 180;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const mod = (x, m) => ((x % m) + m) % m;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Rotate a vector about an axis through the origin (Rodrigues).
export function rotate(v, axis, angle) {
  const k = norm(axis), c = Math.cos(angle), s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

// An orthonormal card frame from a facing direction (the card's +z) and a rough up (its +y).
export function basis(facing, up = [0, 1, 0]) {
  const z = norm(facing);
  let y = sub(up, scale(z, dot(up, z)));
  if (len(y) < 1e-6) y = Math.abs(z[1]) < 0.9 ? sub([0, 1, 0], scale(z, z[1])) : sub([0, 0, -1], scale(z, -z[2]));
  y = norm(y);
  return { x: cross(y, z), y, z };
}

// Centripetal-free uniform Catmull-Rom through points, re-parameterised by arc length so u ∈ [0, 1]
// moves at constant speed. Returns { at(u) → { p, t } } (position and unit tangent).
export function makePath(points, closed = false) {
  const P = points.map(p => [p[0], p[1], p[2] ?? 0]);
  const n = P.length;
  const get = i => (closed ? P[mod(i, n)] : P[clamp(i, 0, n - 1)]);
  const segs = closed ? n : n - 1;
  const raw = s => {
    const k = Math.min(segs - 1, Math.floor(s * segs)), t = s * segs - k;
    const p0 = get(k - 1), p1 = get(k), p2 = get(k + 1), p3 = get(k + 2);
    const f = i => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t * t * t);
    return [f(0), f(1), f(2)];
  };
  const STEPS = 400, lut = [0];
  let prev = raw(0);
  for (let i = 1; i <= STEPS; i++) { const p = raw(i / STEPS); lut.push(lut[i - 1] + len(sub(p, prev))); prev = p; }
  const total = lut[STEPS] || 1;
  const sOf = u => {
    const target = clamp(u) * total;
    let lo = 0, hi = STEPS;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lut[mid] < target) lo = mid; else hi = mid; }
    const span = lut[hi] - lut[lo] || 1;
    return (lo + (target - lut[lo]) / span) / STEPS;
  };
  return {
    length: total,
    at(u) {
      const s = sOf(u), e = 1e-3;
      const p = raw(s), a = raw(clamp(s - e)), b = raw(clamp(s + e));
      return { p, t: norm(sub(b, a)) };
    },
  };
}
