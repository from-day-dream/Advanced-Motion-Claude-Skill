#!/usr/bin/env node
// Start a scene from a Carousel Studio carousel. Unlike Slide Motion, the slides are used as they are:
// each slide becomes one card in the scene. The rendered PNG is the card's texture; the slide HTML is
// kept next to it so cards.mjs can re-rasterise it sharper when the card is shown large.
//
// Usage:
//   node from-carousel.mjs <carousel-dir | folder name in <ws>/output | latest> [--ratio 9:16] [--duration <s>]
//                          [--workspace <path>]
//
// Writes <ws>/scenes/<date>-<slug>-<ratio>/ with cards/carousel/ (NN.png + NN.html), images/,
// caption.txt and meta.json (`cards`: one per slide; `content`: what each slide says).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { parseArgs, fail, readJSON, writeJSON, resolveWorkspace, resolveBrandDir } from './lib/workspace.mjs';
import { resolveRatio, ratioTag, loadMotion, readSlide, DEFAULT_RATIO } from './lib/motion.mjs';

const args = parseArgs();
const target = args._[0] || fail('usage: from-carousel.mjs <carousel-dir | name | latest> [--ratio 9:16] [--duration <s>]');

function findCarousel(spec) {
  if (fs.existsSync(path.join(spec, 'slides'))) return path.resolve(spec);
  const out = path.join(resolveWorkspace(args), 'output');
  if (!fs.existsSync(out)) fail(`no carousel at "${spec}" and no ${out}`);
  const dirs = fs.readdirSync(out, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(out, d.name, 'slides')))
    .map(d => ({ name: d.name, mtime: fs.statSync(path.join(out, d.name)).mtimeMs }));
  if (spec === 'latest') {
    if (!dirs.length) fail(`no carousels in ${out}`);
    return path.join(out, dirs.sort((a, b) => b.mtime - a.mtime)[0].name);
  }
  const hit = dirs.find(d => d.name === spec) || dirs.find(d => d.name.includes(spec));
  if (!hit) fail(`no carousel matching "${spec}" in ${out}`);
  return path.join(out, hit.name);
}

const words = s => (s ? s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length : 0);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

const src = findCarousel(target);
const ws = resolveWorkspace(args, src);
const meta = readJSON(path.join(src, 'meta.json'), {});
const brandDir = resolveBrandDir(args, ws, src);
const motion = loadMotion(brandDir, null, { strict: false });  // may not be set up yet
const ratio = resolveRatio(typeof args.ratio === 'string' ? args.ratio : DEFAULT_RATIO);
const duration = Number(args.duration) || null;  // null: the template's default length

const slideFiles = fs.readdirSync(path.join(src, 'slides')).filter(f => /^\d+\.html$/.test(f)).sort();
if (!slideFiles.length) fail(`no slides in ${path.join(src, 'slides')}`);
const pngDir = path.join(src, 'png');
const missing = slideFiles.filter(f => !fs.existsSync(path.join(pngDir, f.replace(/\.html$/, '.png'))));
if (missing.length) fail(`carousel not rendered: no png for ${missing.join(', ')} in ${pngDir} - render it in Carousel Studio first`);

const today = new Date().toISOString().slice(0, 10);
const base = `${today}-${path.basename(src).replace(/^\d{4}-\d{2}-\d{2}-/, '')}-${ratioTag(ratio.name)}`;
const root = path.join(ws, 'scenes');
let name = base;
for (let i = 2; fs.existsSync(path.join(root, name)); i++) name = `${base}-${i}`;
const out = path.join(root, name);
const cardDir = path.join(out, 'cards', 'carousel');
fs.mkdirSync(cardDir, { recursive: true });

let images = 0;
if (fs.existsSync(path.join(src, 'images'))) {
  fs.mkdirSync(path.join(out, 'images'), { recursive: true });
  for (const f of fs.readdirSync(path.join(src, 'images'))) {
    const s = path.join(src, 'images', f);
    if (fs.statSync(s).isFile()) { fs.copyFileSync(s, path.join(out, 'images', f)); images++; }
  }
}
if (fs.existsSync(path.join(src, 'caption.txt'))) fs.copyFileSync(path.join(src, 'caption.txt'), path.join(out, 'caption.txt'));

const cards = [], content = [];
for (const [i, f] of slideFiles.entries()) {
  const n = i + 1, stem = f.replace(/\.html$/, '');
  const png = path.join(cardDir, `${stem}.png`);
  fs.copyFileSync(path.join(pngDir, `${stem}.png`), png);
  // The slide sits two levels down now (cards/carousel/), so its ../images/ paths move up one more.
  fs.writeFileSync(path.join(cardDir, f), fs.readFileSync(path.join(src, 'slides', f), 'utf8').replace(/(["'(])\.\.\/images\//g, '$1../../images/'));
  const { width, height } = await sharp(png).metadata();
  const g = gcd(width, height);
  const fromHtml = readSlide(fs.readFileSync(path.join(src, 'slides', f), 'utf8'));
  const planned = (meta.slides || []).find(s => s.n === n) || {};
  const role = n === 1 ? 'hook' : n === slideFiles.length ? 'cta' : 'body';
  const headline = planned.headline || fromHtml.headline;
  cards.push({
    id: `c${stem}`, src: `cards/carousel/${stem}.png`, html: `cards/carousel/${f}`,
    aspect: `${width / g}:${height / g}`, px: [width, height], from: `slide ${n}`,
  });
  const c = {
    slide: n, card: `c${stem}`, role, idea: planned.idea || '', headline,
    key: planned.key ?? fromHtml.key, support: planned.support ?? fromHtml.support,
    items: planned.items?.length ? planned.items : fromHtml.items,
  };
  c.words = words(c.headline) + words(c.key) + words(c.support) + c.items.reduce((s, it) => s + words(it), 0);
  content.push(c);
}

writeJSON(path.join(out, 'meta.json'), {
  brand: path.basename(brandDir), ratio: ratio.name, duration, createdAt: new Date().toISOString(),
  topic: meta.topic || '', title: meta.title || '', framework: meta.framework || '',
  source: { type: 'carousel', carousel: path.relative(ws, src).replace(/\\/g, '/'), slides: slideFiles.length },
  positioning: meta.positioning || '', context: meta.context || {},
  caption: meta.caption || '', hashtags: meta.hashtags || [],
  cards, content,
  plan: null,
});

console.log(`Scene project: ${out}`);
console.log(`From carousel: ${src}  (${slideFiles.length} slides → ${cards.length} cards, ${images} image file(s) copied)`);
console.log(`Ratio ${ratio.name} (${ratio.width}×${ratio.height}) · brand ${path.basename(brandDir)}${motion ? '' : ' (motion not set up yet: run the motion setup before rendering)'}\n`);
for (const [i, c] of cards.entries()) console.log(`${c.id}  ${c.aspect.padEnd(5)} ${c.px.join('×').padEnd(10)} ${content[i].role.padEnd(5)} ${content[i].headline}`);
console.log(`\n${cards.length} cards. Cards carry their own text; pick a template whose card count fits (references/templates.md), and the one big line, if any, comes from the content.`);
