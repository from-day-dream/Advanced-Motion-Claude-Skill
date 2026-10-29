#!/usr/bin/env node
// Report checks: renders deliberately broken scenes (short, draft, no video where possible) and
// confirms each check fires. Slow (a real render per case), so it isn't part of `npm test`.
//
// Usage: node tests/report-checks.mjs [--keep]
// Uses the grey specimen brand; works in a temp folder next to this file (tests/.checks/).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { renderScene } from '../scripts/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(ROOT, 'templates', 'specimen-brand');
const work = path.join(ROOT, 'tests', '.checks');
fs.rmSync(work, { recursive: true, force: true });

async function scene(name, n, sceneJson, extra = {}) {
  const dir = path.join(work, name);
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
  const cards = [];
  for (let i = 0; i < n; i++) {
    const f = `images/c${i}.png`;
    await sharp({ create: { width: 512, height: 640, channels: 3, background: ['#8c8c88', '#4a4a48', '#f2f2ef'][i % 3] } }).png().toFile(path.join(dir, f));
    cards.push({ id: `c${i}`, image: f, aspect: '4:5' });
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ brand: 'specimen', ratio: '9:16' }));
  fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify({ cards, ...sceneJson }, null, 2));
  for (const [f, body] of Object.entries(extra)) fs.writeFileSync(path.join(dir, f), body);
  return dir;
}

const spin = { at: 0, dur: 3, to: 'rig.angle', from: 0, value: 360, ease: 'linear', why: 'test' };
const CASES = [
  { name: 'mirrored', expect: ['error', 'mirrored'], n: 8, scene: { template: 'poster-ring', canvas: { duration: 2, loop: true }, look: { faceCamera: 'none' }, rig: { facing: 'out' }, camera: { preset: 'front', offsetR: null } } },
  { name: 'loop-seam', expect: ['error', 'loop-seam'], n: 8, scene: { template: 'poster-ring', canvas: { duration: 2, loop: true }, beats: { spin: { value: 90 } } } },
  { name: 'loop-param', expect: ['warning', 'loop'], n: 8, scene: { template: 'poster-ring', canvas: { duration: 2, loop: true }, beats: { spin: { value: 90 } } } },
  { name: 'reading-time', expect: ['error', 'reading-time'], n: 6, scene: { template: 'grid-board', canvas: { duration: 3 }, type: [{ text: 'Too many words to read in this short hold', size: 60, enter: 'none', hold: [0.5, 0.9] }] } },
  { name: 'safe-area', expect: ['error', 'safe-area'], n: 6, scene: { template: 'grid-board', canvas: { duration: 2 }, type: [{ text: 'Edge', zone: 40, size: 120, enter: 'none' }] } },
  { name: 'contrast', expect: ['error', 'contrast'], n: 6, scene: { template: 'grid-board', canvas: { duration: 2 }, type: [{ text: 'Invisible', zone: 'top', size: 120, enter: 'none', color: 'role:background' }] } },
  { name: 'occlusion', expect: ['error', 'occlusion'], n: 6, scene: { template: 'float-showcase', canvas: { duration: 2 }, rig: { keepOut: 0, spread: [1.2, 1.6, 0.4] }, type: [{ text: 'Hidden', layer: 'behind', size: 'fit', enter: 'none' }] } },
  { name: 'still', expect: ['error', 'still'], n: 6, scene: { template: 'grid-board', canvas: { duration: 2 }, beats: { drift: null, 'dolly-out': null, 'dolly-back': null, lines: null, pop: null } } },
  { name: 'strobing', expect: ['warning', 'strobing'], n: 8, args: { blur: 1 }, scene: { template: 'poster-ring', canvas: { duration: 1, loop: true }, beats: { spin: { value: 1440 } } } },
  { name: 'intent', expect: ['warning', 'intent'], n: 6, scene: { template: 'grid-board', canvas: { duration: 2 }, timeline: [{ at: 0, dur: 2, to: 'camera.orbit', from: 0, value: 5 }] } },
  { name: 'range', expect: ['warning', 'range'], n: 6, scene: { template: 'grid-board', canvas: { duration: 2 }, rig: { gap: 2 } } },
  { name: 'determinism', expect: ['error', 'determinism'], n: 6, scene: { template: 'grid-board', canvas: { duration: 2 }, custom: 'custom.js' },
    files: { 'custom.js': 'let n = 0;\nexport default ({ meshes }) => { meshes[0].onBeforeRender = () => { n++; meshes[0].material.uniforms.uOpacity.value = 0.4 + (n % 5) / 10; }; };\n' } },
  { name: 'custom-flag', expect: ['warning', 'custom'], n: 6, scene: { template: 'grid-board', canvas: { duration: 2 }, custom: 'custom.js' }, files: { 'custom.js': 'export default () => {};\n' } },
];

let failed = 0;
for (const c of CASES) {
  const dir = await scene(c.name, c.n, c.scene, c.files);
  const rep = await renderScene(dir, { brandDir, quiet: true, noRetexture: true, args: { draft: true, 'no-video': true, ...(c.args || {}) } });
  const [kind, check] = c.expect;
  const list = kind === 'error' ? rep.errors : rep.warnings;
  const hit = list.find(x => x.check === check);
  if (!hit) failed++;
  console.log(`${hit ? 'ok  ' : 'FAIL'} ${c.name.padEnd(14)} expects ${kind} "${check}"${hit ? `: ${hit.msg.slice(0, 90)}` : `; got errors [${rep.errors.map(e => e.check)}] warnings [${rep.warnings.map(w => w.check)}]`}`);
}
if (!process.argv.includes('--keep')) fs.rmSync(work, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) did not fire` : `\nAll ${CASES.length} checks fire.`);
process.exit(failed ? 1 : 0);
