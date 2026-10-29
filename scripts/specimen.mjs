#!/usr/bin/env node
// Template specimens: renders a template with placeholder cards as a short clip, so its structure and
// choreography can be seen before choosing it (references/templates.md).
//   default      the grey specimen brand (templates/specimen-brand/) → templates/motion/<name>/specimen.mp4 + specimen.png
//   --brand <s>  the user's brand (its colours on the placeholder cards, its fonts and motion.json)
//                → <brandDir>/specimens/scenes/<name>/ (Slide Motion keeps its own in specimens/)
// "all" renders every template and a contact sheet of their posters.
//
// Usage: node specimen.mjs <template | all> [--brand <slug> | --brand-dir <path>] [--workspace <path>]
//                          [--seconds 6] [--draft] [--gl swiftshader|gpu|auto] [--keep]
// Exit codes: 0 ok; 1 a specimen has report errors; 2 fatal.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { SKILL_DIR, parseArgs, fail, writeJSON, resolveWorkspace, resolveBrandDir, loadTokens } from './lib/workspace.mjs';
import { contactSheet } from './lib/render-core.mjs';
import { listTemplates, loadTemplate, brandColors } from './lib/scene-spec.mjs';
import { renderScene } from './render.mjs';

const args = parseArgs();
const which = args._[0] || fail('usage: specimen.mjs <template | all> [--brand <slug>] [--seconds 6] [--draft]', 2);
const names = which === 'all' ? listTemplates() : [which];
for (const n of names) if (!loadTemplate(n)) fail(`unknown template "${n}" (${listTemplates().join(', ')})`, 2);

const own = !!(args.brand || args['brand-dir']);
const brandDir = own ? resolveBrandDir(args, resolveWorkspace(args)) : path.join(SKILL_DIR, 'templates', 'specimen-brand');
const tokens = loadTokens(brandDir);
const seconds = Number(args.seconds) || 6;
const outRoot = own ? path.join(brandDir, 'specimens', 'scenes') : path.join(SKILL_DIR, 'templates', 'motion');

// Placeholder cards in the brand's colours: numbered, with a band and a dot so motion and orientation read.
const B = brandColors(tokens);
const fills = B.list.filter(c => c !== B.bg && c !== B.text && !/never text/.test(c.role)).map(c => c.hex);
const palette = fills.length ? fills : ['#8c8c88', '#4a4a48', '#f2f2ef'];
const ink = hex => { const n = parseInt(hex.slice(1, 7), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 150 ? '#1c1c1c' : '#f2f2ef'; };
const parseAspect = a => { const [w, h] = String(a).split(':').map(Number); return w / h; };

async function placeholder(file, i, aspect, H = 1024) {
  const W = Math.round(H * aspect), bg = palette[i % palette.length], fg = ink(bg);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <rect x="${W * 0.08}" y="${H * 0.08}" width="${W * 0.84}" height="${H * 0.5}" fill="${fg}" opacity="0.12"/>
    <circle cx="${W * 0.8}" cy="${H * 0.17}" r="${W * 0.05}" fill="${fg}" opacity="0.6"/>
    <text x="${W * 0.08}" y="${H * 0.82}" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="${H * 0.2}" fill="${fg}">${String(i + 1).padStart(2, '0')}</text>
    <rect x="${W * 0.08}" y="${H * 0.88}" width="${W * 0.5}" height="${H * 0.025}" fill="${fg}" opacity="0.5"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}
// One image for the mosaic: a composition with clear regions, so each tile is different.
async function mosaicImage(file, aspect, H = 1800) {
  const W = Math.round(H * aspect), [a, b, c] = [palette[0], palette[1 % palette.length], palette[2 % palette.length]];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="${a}"/><circle cx="${W * 0.62}" cy="${H * 0.38}" r="${W * 0.34}" fill="${b}"/>
    <rect x="${W * 0.08}" y="${H * 0.62}" width="${W * 0.6}" height="${H * 0.28}" fill="${c}"/>
    <text x="${W * 0.08}" y="${H * 0.22}" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="${H * 0.14}" fill="${ink(a)}">ONE</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

const results = [];
for (const name of names) {
  const t = loadTemplate(name);
  const dir = path.join(outRoot, name), work = path.join(dir, '.work');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'images'), { recursive: true });
  const n = t.rig.type === 'mosaic' ? 1 : Math.min(32, Math.round((t.cards.count[0] + t.cards.count[1]) / 2));
  const aspect = parseAspect(t.cards.aspect[0]);
  const cards = [];
  for (let i = 0; i < n; i++) {
    const f = `images/card-${String(i + 1).padStart(2, '0')}.png`;
    if (t.rig.type === 'mosaic') await mosaicImage(path.join(work, f), aspect); else await placeholder(path.join(work, f), i, aspect);
    cards.push({ id: `c${String(i + 1).padStart(2, '0')}`, image: f, aspect: t.cards.aspect[0] });
  }
  const sp = t.type?.specimen;
  const type = sp ? [{ ...sp, id: 'line', enter: t.loop ? 'none' : { kind: 'mask-up', at: seconds * 0.15 } }] : [];
  writeJSON(path.join(work, 'meta.json'), { brand: path.basename(brandDir), ratio: '9:16', specimen: name });
  writeJSON(path.join(work, 'scene.json'), { template: name, canvas: { duration: seconds, loop: t.loop === true }, cards, type });
  process.stdout.write(`${name.padEnd(16)} ${n} card(s)… `);
  const t0 = Date.now();
  const report = await renderScene(work, { brandDir, quiet: true, args: { draft: !!args.draft, gl: args.gl, workspace: args.workspace } });
  fs.copyFileSync(path.join(work, 'video.mp4'), path.join(dir, 'specimen.mp4'));
  fs.copyFileSync(path.join(work, 'poster.png'), path.join(dir, 'specimen.png'));
  fs.copyFileSync(path.join(work, 'storyboard.png'), path.join(dir, 'specimen-storyboard.png'));
  if (!args.keep) fs.rmSync(work, { recursive: true, force: true });
  const errs = report.errors.filter(e => e.check !== 'card-text'), warns = report.warnings.filter(w => !['card-text', 'template'].includes(w.check));
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s · ${errs.length} error(s), ${warns.length} warning(s)${report.loop ? ` · loop seam ${report.loopSeam}` : ''}`);
  for (const e of errs) console.log(`    error ${e.check}: ${e.msg}`);
  for (const w of warns) console.log(`    warn  ${w.check}: ${w.msg}`);
  results.push({ name, errors: errs.length, poster: path.join(dir, 'specimen.png') });
}
if (names.length > 1) {
  const sheet = path.join(outRoot, own ? 'scenes.png' : 'specimens.png');
  await contactSheet(results.map(r => r.poster), sheet);
  console.log(`\nContact sheet: ${sheet}`);
}
process.exit(results.some(r => r.errors) ? 1 : 0);
