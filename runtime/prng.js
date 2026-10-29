// Seeded randomness for rigs and the scene. Never Math.random: the same scene.json must give the same
// frames. Pure ES module (runs in the page and under node --test).

// mulberry32: a seeded generator → () => [0, 1).
export function rng(seed) {
  if (typeof seed !== 'number' || !isFinite(seed)) throw new Error('rng: a numeric seed is required');
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One stable value in [0, 1) for (seed, index, salt): what card j of a rig gets, independent of N.
export const hash = (seed, i, salt = 0) => rng(((seed * 2654435761) ^ (i * 40503) ^ (salt * 69069)) >>> 0)();
