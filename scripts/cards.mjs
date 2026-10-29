#!/usr/bin/env node
// Card rasteriser: every card in a scene becomes a PNG texture in cards/out/, sized for how large it
// is shown. A card is one of:
//   { id, src: "cards/<id>.html", px: [1080, 1350] }       HTML designed at px, in the brand (fonts, tokens;
//                                                           BRAND_* role placeholders as in templates/cards/)
//   { id, src: "cards/carousel/01.png", html: "…01.html" }   a carousel slide: the PNG, or its HTML re-rendered sharper
//   { id, image: "images/photo.jpg", aspect: "4:5" }        an image, cover-cropped to the aspect
// Resolution: 2 × the card's largest on-screen height from the last render (render-report.json →
// cards), capped at 2048 px; before any render, the card's own height. Cached by content hash in
// cards/.cache/. Writes cards/out/manifest.json and cards/contact.png.
//
// Usage: node cards.mjs <scene-dir> [--brand <slug> | --brand-dir <path>] [--workspace <path>] [--px <height>] [--force]
// Exit codes: 0 ok; 1 warnings or a card failed; 2 fatal (fonts, missing files).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SKILL_DIR, parseArgs, fail, readJSON, writeJSON, resolveWorkspace, resolveBrandDir } from './lib/workspace.mjs';
import { context, inject, loadAndVerify, sourceChecks, contactSheet, FontError } from './lib/render-core.mjs';
import { fillPlaceholders } from './lib/motion.mjs';

const require = createRequire(path.join(SKILL_DIR, 'package.json'));
const MAX = 2048, MIN = 256;
const sha = (...parts) => crypto.createHash('sha1').update(parts.map(p => (Buffer.isBuffer(p) ? p : String(p))).join('\u0000')).digest('hex').slice(0, 16);
const parseAspect = a => { if (typeof a === 'number') return a; const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(a || '4:5')); return m ? Number(m[1]) / Number(m[2]) : 0.8; };

// Smallest visible text in the page, as a fraction of the card's height (for the legibility check).
const MEASURE = () => {
  let min = Infinity;
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05 || r.width < 1 || r.height < 1) continue;
    min = Math.min(min, parseFloat(cs.fontSize));
  }
  return Number.isFinite(min) ? min / window.innerHeight : null;
};

export async function rasterise(dir, opts = {}) {
  dir = path.resolve(dir);
  const scene = readJSON(path.join(dir, 'scene.json'), {});
  const meta = readJSON(path.join(dir, 'meta.json'), {});
  const cards = scene.cards || meta.cards || [];
  if (!cards.length) fail(`no cards in ${dir} (scene.json → cards or meta.json → cards)`, 2);
  const report = readJSON(path.join(dir, 'render-report.json'), null);
  const outDir = path.join(dir, 'cards', 'out'), cacheDir = path.join(dir, 'cards', '.cache');
  for (const d of [outDir, cacheDir]) fs.mkdirSync(d, { recursive: true });

  let ctxCache = new Map(), browser = null;
  const brandDir = opts.brandDir;
  const ctxFor = (w, h) => {
    const k = `${w}x${h}`;
    if (!ctxCache.has(k)) ctxCache.set(k, context(brandDir, { width: w, height: h }));
    return ctxCache.get(k);
  };
  const page = async (w, h, scale) => {
    if (!browser) browser = await require('playwright').chromium.launch().catch(e => fail(`could not launch Chromium - run scripts/setup.mjs first.\n${e.message}`, 2));
    return browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  };

  const manifest = { cards: {}, warnings: [], errors: [], createdAt: new Date().toISOString() };
  const want = (c, baseH) => {
    const seen = report?.cards?.[c.id]?.maxProjH;
    const target = Number(opts.px) || Number(c.texturePx) || (seen ? Math.ceil(seen * 2) : baseH);
    return Math.max(MIN, Math.min(MAX, Math.round(target)));
  };

  try {
    for (const c of cards) {
      if (!c.id) { manifest.errors.push({ check: 'cards', msg: 'a card has no id' }); continue; }
      const htmlRel = c.html || (/\.html?$/i.test(c.src || '') ? c.src : null);
      const imgRel = c.image || (c.src && !/\.html?$/i.test(c.src) ? c.src : null);
      let file = null, px = null, minFontRatio = null, source = null;

      // An existing image (carousel PNG or photo) and how big it already is.
      let img = null;
      if (imgRel) {
        const abs = path.join(dir, imgRel);
        if (!fs.existsSync(abs)) { manifest.errors.push({ check: 'cards', msg: `${c.id}: ${imgRel} not found` }); continue; }
        img = { abs, ...(await sharp(abs).metadata()) };
      }
      if (htmlRel && !fs.existsSync(path.join(dir, htmlRel))) { manifest.errors.push({ check: 'cards', msg: `${c.id}: ${htmlRel} not found` }); continue; }
      const aspect = c.aspect ? parseAspect(c.aspect) : img ? img.width / img.height : c.px ? c.px[0] / c.px[1] : 0.8;
      const baseH = c.px?.[1] || (img ? img.height : 1350), baseW = c.px?.[0] || Math.round(baseH * aspect);
      const target = want(c, img && !htmlRel ? Math.min(img.height, 2048) : baseH);

      // HTML: render when there is no image, or the image is too small for how large the card is shown.
      const renderHtml = htmlRel && (!img || img.height < target * 0.95 || opts.force);
      if (htmlRel) {
        if (!brandDir) fail('HTML cards need a brand (--brand <slug>)', 2);
        const ctx = ctxFor(baseW, baseH);
        // Role placeholders (BRAND_TEXT, BRAND_FONT_DISPLAY…, as in templates/cards/) bind to this brand's tokens.
        const html = fillPlaceholders(fs.readFileSync(path.join(dir, htmlRel), 'utf8'), ctx.tokens);
        const src = sourceChecks(html, ctx.tokens);
        manifest.errors.push(...src.errors.map(e => ({ ...e, card: c.id })));
        manifest.warnings.push(...src.warnings.map(e => ({ ...e, card: c.id })));
        const scale = renderHtml ? target / baseH : 1;
        const key = sha('html', html, JSON.stringify(ctx.tokens), baseW, baseH, scale.toFixed(4));
        const cached = path.join(cacheDir, `${key}.png`), meas = path.join(cacheDir, `${key}.json`);
        if (renderHtml && fs.existsSync(cached) && fs.existsSync(meas) && !opts.force) {
          file = cached; minFontRatio = readJSON(meas).minFontRatio;
        } else {
          const tmp = path.join(path.dirname(path.join(dir, htmlRel)), `.card-${c.id}.html`);
          fs.writeFileSync(tmp, inject(html, ctx));
          const pg = await page(baseW, baseH, scale);
          try {
            await loadAndVerify(pg, tmp, ctx.faces);
            minFontRatio = await pg.evaluate(MEASURE);
            if (renderHtml) { await pg.screenshot({ path: cached, clip: { x: 0, y: 0, width: baseW, height: baseH } }); file = cached; }
            writeJSON(meas, { minFontRatio });
          } catch (e) {
            if (e instanceof FontError) fail(`${c.id}: ${e.message}`, 2);
            throw e;
          } finally { await pg.close(); fs.rmSync(tmp, { force: true }); }
        }
        source = renderHtml ? 'html' : 'png';
      }
      if (!file && img) {
        // Image (or a carousel PNG that is already large enough): cover-crop to the aspect, never upscale.
        const ih = Math.min(img.height, Math.round(img.width / aspect), target), iw = Math.round(ih * aspect);
        const key = sha('img', fs.readFileSync(img.abs), iw, ih, JSON.stringify(c.focus || 'centre'));
        const cached = path.join(cacheDir, `${key}.png`);
        if (!fs.existsSync(cached) || opts.force) {
          const position = c.focus ? sharp.gravity[c.focus] ?? 'centre' : 'centre';
          await sharp(img.abs).resize(iw, ih, { fit: 'cover', position }).png().toFile(cached);
        }
        file = cached;
        source = source || 'image';
        if (ih < target * 0.95) manifest.warnings.push({ check: 'soft-texture', card: c.id, msg: `${c.id}: source is ${ih}px tall, ${target}px wanted - it may look soft when shown large` });
      }
      if (!file) { manifest.errors.push({ check: 'cards', msg: `${c.id}: no html, src or image` }); continue; }
      const outName = `${c.id}.png`;
      fs.copyFileSync(file, path.join(outDir, outName));
      const m = await sharp(path.join(outDir, outName)).metadata();
      px = [m.width, m.height];
      manifest.cards[c.id] = { file: outName, px, minFontRatio, source, target };
    }
  } finally { await browser?.close(); }

  writeJSON(path.join(outDir, 'manifest.json'), manifest);
  const pngs = cards.filter(c => manifest.cards[c.id]).map(c => path.join(outDir, manifest.cards[c.id].file));
  if (pngs.length) await contactSheet(pngs, path.join(dir, 'cards', 'contact.png'));
  return manifest;
}

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs();
  const dir = args._[0] ? path.resolve(args._[0]) : fail('usage: cards.mjs <scene-dir> [--brand <slug>] [--px <height>] [--force]', 2);
  const ws = resolveWorkspace(args, dir);
  const brandDir = resolveBrandDir(args, ws, dir);
  const m = await rasterise(dir, { brandDir, px: args.px, force: !!args.force });
  for (const [id, c] of Object.entries(m.cards)) console.log(`${id.padEnd(8)} ${c.px.join('×').padEnd(10)} ${c.source.padEnd(5)} ${c.minFontRatio ? `smallest text ${(c.minFontRatio * 100).toFixed(1)}% of height` : ''}`);
  for (const e of m.errors) console.log(`  error ${e.check}: ${e.msg}`);
  for (const w of m.warnings) console.log(`  warn  ${w.check}: ${w.msg}`);
  console.log(`\n${Object.keys(m.cards).length} card(s) → ${path.join(dir, 'cards', 'out')}  ·  contact sheet: ${path.join(dir, 'cards', 'contact.png')}`);
  process.exit(m.errors.length ? 1 : 0);
}
