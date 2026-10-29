#!/usr/bin/env node
// scene.json → MP4. A scene is ONE continuous 3D piece: cards on a rig, a camera and big type, all
// driven by one master GSAP timeline in a fixed Three.js runtime (runtime/scene.js). This resolves
// the scene against its template and the brand (scripts/lib/scene-spec.mjs), rasterises the cards if
// needed, seeks the timeline frame by frame in headless Chromium (WebGL), encodes with ffmpeg and
// checks the result (references/critique.md):
//   kept from Slide Motion: never still, reading time, safe zones, fonts, contrast, determinism, length
//   3D only: type occluded at its hold, card text too small, soft texture, mirrored card, strobing,
//            loop seam, off-brand shading, template ranges, timeline entries without a "why", custom.js
// The brand's motion.json is the same file Slide Motion uses; eases resolve the same way.
//
// Usage:
//   node render.mjs <scene-dir> [--brand <slug> | --brand-dir <path>] [--workspace <path>]
//                   [--draft] [--gl swiftshader|gpu|auto] [--blur <samples>|auto] [--shutter 0-1] [--fps 30]
//                   [--no-platform-safe] [--no-video]
//   node render.mjs --specimen [--brand <slug> | --brand-dir <path>]   the brand's type specimen (brand setup)
//
// Outputs in <scene-dir>: video.mp4, poster.png, storyboard.png, loop-seam.png (loops), png/, render-report.json.
// Exit codes: 0 = rendered, no errors; 1 = rendered, report has errors; 2 = fatal (fonts, motion tokens, cards, spec, ffmpeg).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SKILL_DIR, parseArgs, fail, readJSON, writeJSON, resolveWorkspace, resolveBrandDir } from './lib/workspace.mjs';
import { context, inject, contactSheet, FontError, renderSpecimen } from './lib/render-core.mjs';
import { resolveRatio, safeZone, loadMotion, motionHead, GSAP_FILES, DEFAULT_RATIO } from './lib/motion.mjs';
import { resolveScene, contrastOf } from './lib/scene-spec.mjs';
import { openGLBrowser, serveScene, seek, seekReport } from './lib/gl.mjs';
import { rasterise } from './cards.mjs';

const require = createRequire(path.join(SKILL_DIR, 'package.json'));
const words = s => (String(s).match(/[\p{L}\p{N}]+/gu) || []).length;

// ---------- encoding (Slide Motion's, unchanged in behaviour) ----------

function ffmpeg(argv, stdin = false) {
  const proc = spawn(require('ffmpeg-static'), ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = '';
  proc.stderr.on('data', d => { err += d; });
  const done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim().slice(-600)}`))));
  });
  return { proc, done };
}
const x264 = draft => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', draft ? '28' : '18', '-preset', draft ? 'veryfast' : 'medium', '-movflags', '+faststart'];

// Motion blur by temporal supersampling (as in Slide Motion): each frame averages `samples` sub-frames
// over the shutter window in linear light; frames that barely move stay sharp in auto mode.
const AUTO_DIFF = 0.5;
const TO_LIN = Float32Array.from({ length: 256 }, (_, c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const FROM_LIN = Uint8Array.from({ length: 65536 }, (_, i) => { const v = i / 65535; return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); });
function blurOptions(a, draft) {
  const given = a.blur !== undefined && a.blur !== true;
  const auto = given ? a.blur === 'auto' : !draft;
  const samples = auto ? 8 : given ? Math.max(1, Math.round(Number(a.blur)) || 1) : 1;
  const shutter = Math.min(1, Math.max(0, a.shutter !== undefined ? Number(a.shutter) : 0.5));
  return { samples: shutter > 0 ? samples : 1, shutter, auto };
}

// Mean abs difference of two small greyscale thumbnails (0-255): the "is anything moving" signal.
const thumb = async buf => sharp(buf).resize(48, 85, { fit: 'fill' }).greyscale().raw().toBuffer();
const tdiff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };

async function encodeScene(page, frames, fps, W, H, outMp4, draft, blur) {
  const clip = { x: 0, y: 0, width: W, height: H };
  const diffs = [];
  let prev = null;
  const track = async buf => { const t = await thumb(buf); if (prev) diffs.push(tdiff(prev, t)); prev = t; };
  if (blur.samples <= 1) {
    const { proc, done } = ffmpeg(['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-vf', 'scale=out_range=tv,format=yuv420p', ...x264(draft), outMp4], true);
    for (let i = 0; i < frames; i++) {
      await seek(page, i / fps);
      const buf = await page.screenshot({ type: 'jpeg', quality: draft ? 80 : 95, clip });
      await track(buf);
      if (!proc.stdin.write(buf)) await new Promise(r => proc.stdin.once('drain', r));
    }
    proc.stdin.end();
    await done;
    return { blurred: 0, diffs };
  }
  const shot = await page.screenshot({ type: 'jpeg', clip });
  const { width: pw, height: ph } = await sharp(shot).metadata();
  const { proc, done } = ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${pw}x${ph}`, '-framerate', String(fps), '-i', '-', '-vf', 'scale=out_range=tv,format=yuv420p', ...x264(draft), outMp4], true);
  const end = (frames - 1) / fps, n = blur.samples, px = pw * ph * 3;
  const grab = async t => { await seek(page, Math.min(end, Math.max(0, t))); return sharp(await page.screenshot({ type: 'jpeg', quality: 95, clip })).removeAlpha().raw().toBuffer(); };
  const acc = new Float32Array(px);
  let blurred = 0;
  for (let i = 0; i < frames; i++) {
    const t = i / fps, at = k => t + ((k + 0.5) / n - 0.5) * blur.shutter / fps;
    const first = await grab(at(0)), last = await grab(at(n - 1));
    let out, still = first.equals(last);
    if (!still && blur.auto) {
      let d = 0;
      for (let p = 0; p < px; p += 7) d += Math.abs(first[p] - last[p]);
      still = d / Math.ceil(px / 7) < AUTO_DIFF;
    }
    if (still) out = first.equals(last) ? first : await grab(t);
    else {
      blurred++;
      acc.fill(0);
      const add = buf => { for (let p = 0; p < px; p++) acc[p] += TO_LIN[buf[p]]; };
      add(first);
      for (let k = 1; k < n - 1; k++) add(await grab(at(k)));
      add(last);
      out = Buffer.allocUnsafe(px);
      for (let p = 0; p < px; p++) out[p] = FROM_LIN[Math.round((acc[p] / n) * 65535)];
    }
    const t8 = await sharp(out, { raw: { width: pw, height: ph, channels: 3 } }).resize(48, 85, { fit: 'fill' }).greyscale().raw().toBuffer();
    if (prev) diffs.push(tdiff(prev, t8));
    prev = t8;
    if (!proc.stdin.write(out)) await new Promise(r => proc.stdin.once('drain', r));
  }
  proc.stdin.end();
  await done;
  return { blurred, diffs };
}

// ---------- geometry helpers for the checks ----------

const inQuad = (x, y, q) => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c !== 0) { if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false; }
  }
  return true;
};
// Share of a rect covered by any of the quads, sampled on a grid.
function coverage(rect, quads) {
  const [x0, y0, x1, y1] = rect;
  if (!quads.length || x1 <= x0 || y1 <= y0) return 0;
  let hit = 0, n = 0;
  for (let i = 0; i < 16; i++) for (let k = 0; k < 6; k++) {
    const x = x0 + (i + 0.5) / 16 * (x1 - x0), y = y0 + (k + 0.5) / 6 * (y1 - y0);
    n++;
    if (quads.some(q => inQuad(x, y, q))) hit++;
  }
  return hit / n;
}
const focusCard = cards => cards.filter(c => c.opacity > 0.5 && !c.behindCamera && c.facing > 0.3).sort((a, b) => b.projH - a.projH)[0];
const centroid = q => [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];

async function verifyFonts(page, faces) {
  const res = await page.evaluate(async list => {
    const out = [];
    for (const f of list) {
      try { const l = await document.fonts.load(`${f.style} ${f.weight.split(/\s+/)[0]} 40px "${f.family}"`); out.push({ ...f, ok: l.some(x => x.status === 'loaded') }); }
      catch (e) { out.push({ ...f, ok: false }); }
    }
    return out;
  }, faces.map(({ family, weight, style, file }) => ({ family, weight, style, file })));
  const bad = res.filter(f => !f.ok);
  if (bad.length) throw new FontError(`brand font failed to load - output would use a fallback font:\n  ${bad.map(f => `"${f.family}" ${f.weight} ${f.style} (${f.file})`).join('\n  ')}`);
}

// ---------- render ----------

export async function renderScene(dir, opts = {}) {
  dir = path.resolve(dir);
  const a = { ...parseArgs([]), ...opts.args };
  const scene = readJSON(path.join(dir, 'scene.json'), null) || fail(`no scene.json in ${dir} (references/scene-spec.md)`, 2);
  const meta = readJSON(path.join(dir, 'meta.json'), {});
  const ratio = resolveRatio(scene.canvas?.ratio || meta.ratio || DEFAULT_RATIO);
  const ws = resolveWorkspace(a, dir);
  const brandDir = opts.brandDir || resolveBrandDir(a, ws, dir);
  const ctx = context(brandDir, { width: ratio.width, height: ratio.height });
  const motion = loadMotion(brandDir, { ...(meta.motion || {}), ...(scene.motion || {}) });
  const W = ratio.width, H = ratio.height, draft = !!a.draft, fps = Number(a.fps) || Number(scene.canvas?.fps) || 30;
  const blur = blurOptions(a, draft);
  const safe = (() => { const s = safeZone(ratio, ctx.tokens.spacing?.safeArea ?? 72, !a['no-platform-safe']); return typeof s === 'number' ? { top: s, right: s, bottom: s, left: s } : s; })();
  const log = opts.quiet ? () => {} : (...m) => console.log(...m);

  // Cards: rasterise when there's no manifest, it lacks a card, or a card source is newer.
  const manFile = path.join(dir, 'cards', 'out', 'manifest.json');
  const cardList = scene.cards || meta.cards || [];
  const stale = () => {
    const man = readJSON(manFile, null);
    if (!man) return true;
    const t = fs.statSync(manFile).mtimeMs;
    return cardList.some(c => !man.cards[c.id] || [c.src, c.html, c.image].filter(Boolean).some(f => fs.existsSync(path.join(dir, f)) && fs.statSync(path.join(dir, f)).mtimeMs > t));
  };
  if (stale()) { log('Rasterising cards…'); await rasterise(dir, { brandDir }); }
  let manifest = readJSON(manFile);

  const resolve = () => resolveScene({ scene, meta, motion, tokens: ctx.tokens, ratio, safe, manifest, sceneDir: dir });
  let { spec, errors: specErrors, warnings: specWarnings } = resolve();
  if (specErrors.length) fail(`scene.json can't be resolved:\n  ${specErrors.map(e => `${e.check}: ${e.msg}`).join('\n  ')}`, 2);
  const D = spec.canvas.duration, frames = Math.round(D * fps);
  const report = {
    scene: path.basename(dir), brand: path.basename(brandDir), template: spec.template, ratio: ratio.name, size: `${W}x${H}`, fps, duration: D, frames,
    loop: spec.canvas.loop, draft, gl: null, renderer: null, blur: null, motion: motion.source,
    errors: [...manifest.errors], warnings: [...specWarnings, ...manifest.warnings], cards: {}, holds: spec.type.map(t => ({ id: t.id, hold: t.hold })),
  };
  const E = (check, msg, extra = {}) => report.errors.push({ check, msg, ...extra });
  const Wn = (check, msg, extra = {}) => report.warnings.push({ check, msg, ...extra });

  const gsapSource = GSAP_FILES.map(f => fs.readFileSync(require.resolve('gsap/dist/' + f), 'utf8')).join('\n;\n');
  const buildPage = () => {
    const html = fs.readFileSync(path.join(SKILL_DIR, 'templates', 'scene.html'), 'utf8')
      .replace('SCENE_BACKGROUND', (() => {
        const d = spec.look.dots;
        if (!d) return spec.look.background;
        return `${spec.look.background} radial-gradient(circle at center, ${d.color} ${d.size / 2}px, transparent ${d.size / 2 + 0.6}px) ${d.offset}px ${d.offset}px / ${d.pitch}px ${d.pitch}px`;
      })())
      .replace('SCENE_SPEC', () => JSON.stringify(spec).replace(/</g, '\\u003c'));
    const out = inject(html, ctx).replace(/<style data-injected>[\s\S]*?<\/style>/, m => `${m}\n${motionHead(gsapSource, motion, JSON.stringify(spec.timeline) + JSON.stringify(spec.type))}`);
    fs.writeFileSync(path.join(dir, '.render-scene.html'), out);
  };
  buildPage();

  const server = await serveScene(dir, brandDir);
  const { browser, page, mode } = await openGLBrowser(W, H, a.gl || 'swiftshader', draft ? 0.5 : 1);
  report.gl = mode;
  const pageErrors = [], consoleLog = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { consoleLog.push(`${m.type()}: ${m.text()}`); if (m.type() === 'error') pageErrors.push(m.text()); });
  const load = async () => {
    await page.goto(`${server.url}/scene/.render-scene.html`, { waitUntil: 'load' });
    const ok = await page.waitForFunction(() => window.__ready || (window.__errors && window.__errors.length), null, { timeout: 90000 }).then(() => true, () => false);
    const errs = await page.evaluate(() => window.__errors || []);
    if (!ok || errs.length) {
      const tail = consoleLog.length ? `\nconsole:\n  ${consoleLog.slice(-12).join('\n  ')}` : '';
      const at = await page.evaluate(() => window.__stage || 'loading').catch(() => '?');
      fail(`scene failed to start: ${[...errs, ...pageErrors].join('; ') || `timed out at "${at}"`}${tail}`, 2);
    }
    try { await verifyFonts(page, ctx.faces); } catch (e) { if (e instanceof FontError) fail(e.message, 2); throw e; }
  };

  try {
    await load();
    report.renderer = await page.evaluate(() => { const gl = document.getElementById('gl').getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; });

    // ---------- analysis pass: the runtime's report at every frame ----------
    const analyse = async () => {
      const per = [];
      for (let f = 0; f <= frames; f++) per.push(await seekReport(page, Math.min(D, f / fps)));
      return per;
    };
    let per = await analyse();
    const maxProj = {};
    for (const r of per) for (const c of r.cards) if (c.opacity > 0.2 && !c.behindCamera) {
      const id = spec.cards[c.tex]?.id;
      if (id) maxProj[id] = Math.max(maxProj[id] || 0, c.projH * (1 / Math.max(1e-3, c.texH / (spec.cards[c.tex].px[1] || c.texH))));
    }
    // Soft textures that a sharper rasterise can fix: re-rasterise at 2× the largest size seen, reload.
    // Only HTML cards can get sharper; a photo or PNG is already at its source size.
    const hasHtml = id => { const c = cardList.find(x => x.id === id); return !!(c && (c.html || /\.html?$/i.test(c.src || ''))); };
    const fixable = spec.cards.filter(c => (maxProj[c.id] || 0) > c.px[1] * 1.02 && c.px[1] < 2048 && hasHtml(c.id));
    if (fixable.length && !opts.noRetexture) {
      log(`Re-rasterising ${fixable.length} card(s) shown larger than their texture…`);
      writeJSON(path.join(dir, 'render-report.json'), { cards: Object.fromEntries(Object.entries(maxProj).map(([k, v]) => [k, { maxProjH: v }])) });
      await rasterise(dir, { brandDir });
      manifest = readJSON(manFile);
      ({ spec } = resolve());
      buildPage();
      await load();
      per = await analyse();
    }

    // ---------- checks from the per-frame reports ----------
    const R = motion.readingSpeed || 3.5;
    const at = t => per[Math.min(per.length - 1, Math.round(t * fps))];
    const inHold = (item, t) => t >= item.hold[0] && t <= item.hold[1];
    for (const item of spec.type) {
      const need = Math.max(1, words(item.text) / R);
      const len = item.hold[1] - item.hold[0];
      if (len + 1e-6 < need) E('reading-time', `type "${item.id}" holds ${len.toFixed(2)}s; ${words(item.text)} words need ${need.toFixed(2)}s at ${R} words/s`);
      const covs = [];
      for (let f = 0; f < per.length; f++) {
        const t = f / fps;
        if (!inHold(item, t)) continue;
        const r = per[f], box = r.type.find(x => x.id === item.id);
        if (!box || box.opacity < 0.5) continue;
        if (item.layer !== 'front') {
          const quads = r.cards.filter(c => c.opacity > 0.35 && !c.behindCamera && (item.layer === 'behind' || c.depth > (box.depth ?? -Infinity))).map(c => c.quad);
          covs.push(coverage(box.rect, quads));
        }
      }
      if (covs.length) {
        const mean = covs.reduce((s, v) => s + v, 0) / covs.length, peak = Math.max(...covs);
        const limit = item.layer === 'behind' ? (item.maxOcclusion ?? 0.3) : 0.15;
        if (mean > limit) E('occlusion', `type "${item.id}" is ${(mean * 100).toFixed(0)}% covered by cards during its hold (limit ${(limit * 100).toFixed(0)}% for ${item.layer})`);
        else if (peak > limit + 0.2) Wn('occlusion', `type "${item.id}" is up to ${(peak * 100).toFixed(0)}% covered at moments of its hold`);
      }
      // Safe zones and size, at the middle of the hold (DOM layers).
      const mid = at((item.hold[0] + item.hold[1]) / 2), box = mid?.type.find(x => x.id === item.id);
      if (box && item.layer !== 'interleaved') {
        const [x0, y0, x1, y1] = box.rect;
        if (x0 < safe.left - 2 || y0 < safe.top - 2 || x1 > W - safe.right + 2 || y1 > H - safe.bottom + 2) E('safe-area', `type "${item.id}" leaves the safe area (${[x0, y0, x1, y1].map(Math.round).join(', ')})`);
      }
    }
    // Card legibility, soft textures, shading and mirrored backs at the moments that matter.
    const holdTimes = spec.type.flatMap(t => [t.hold[0], (t.hold[0] + t.hold[1]) / 2]);
    const keyTimes = holdTimes.length ? holdTimes : [0.25, 0.5, 0.75].map(k => k * D);
    const flagged = new Set();
    for (const t of keyTimes) {
      const r = at(t), fc = r && focusCard(r.cards);
      if (!fc) continue;
      const card = spec.cards[fc.tex];
      if (card?.minFontRatio && fc.projH * card.minFontRatio < 22 && !flagged.has(`small-${card.id}`)) {
        flagged.add(`small-${card.id}`);
        Wn('card-text', `card ${card.id}'s smallest text is ${(fc.projH * card.minFontRatio).toFixed(0)}px on screen at ${t.toFixed(1)}s (min 22px) - cards carry visuals and a few words; the big line carries the message`);
      }
      const dark = (fc.shading ?? 0) * (1 - Math.abs(fc.facing));
      if (dark > 0.18 && !flagged.has('shade')) { flagged.add('shade'); Wn('shading', `the focus card is darkened ${(dark * 100).toFixed(0)}% by angle shading at ${t.toFixed(1)}s - its colours drift from the brand's; lower look.shading or face it to the camera`); }
    }
    for (const [f, r] of per.entries()) {
      for (const c of r.cards) {
        if (c.opacity < 0.2 || c.behindCamera) continue;
        const id = spec.cards[c.tex]?.id;
        if (r.faceCamera === 'none' && c.facing < -0.05 && !flagged.has(`mirror-${id}`)) { flagged.add(`mirror-${id}`); E('mirrored', `card ${id} shows its mirrored back at ${(f / fps).toFixed(2)}s - use look.faceCamera "flip" or "hide"`); }
        if (c.projH > c.texH * 1.15 && c.facing > 0.3 && c.quad.every(([x, y]) => x >= -2 && y >= -2 && x <= W + 2 && y <= H + 2) && !flagged.has(`soft-${id}`)) { flagged.add(`soft-${id}`); Wn('soft-texture', `card ${id} is shown ${Math.round(c.projH)}px tall from a ${Math.round(c.texH)}px texture at ${(f / fps).toFixed(2)}s`); }
      }
      if (f && blur.samples <= 1) {
        const prev = per[f - 1];
        for (const c of r.cards) {
          const p = prev.cards.find(x => x.j === c.j);
          if (!p || !p.quad || !c.quad || c.opacity < 0.3 || p.opacity < 0.3 || c.behindCamera || p.behindCamera) continue;
          const [ax, ay] = centroid(p.quad), [bx, by] = centroid(c.quad);
          if (Math.hypot(bx - ax, by - ay) > W / 3 && !flagged.has(`strobe-${c.j}`)) { flagged.add(`strobe-${c.j}`); Wn('strobing', `a card jumps ${Math.round(Math.hypot(bx - ax, by - ay))}px between frames at ${(f / fps).toFixed(2)}s - slow it down or render with motion blur`); }
        }
      }
    }
    for (const c of spec.cards) report.cards[c.id] = { maxProjH: Math.round(maxProj[c.id] || 0), texture: c.px };

    // ---------- stills: holds, six samples, poster ----------
    const pngDir = path.join(dir, 'png');
    fs.rmSync(pngDir, { recursive: true, force: true });
    fs.mkdirSync(pngDir, { recursive: true });
    const stillTimes = [...new Set([...spec.type.map(t => (t.hold[0] + t.hold[1]) / 2), ...[0, 1, 2, 3, 4, 5].map(k => (k + 0.5) / 6 * D)].map(t => +t.toFixed(3)))].sort((x, y) => x - y);
    const stills = [], hashes = {};
    for (const [i, t] of stillTimes.entries()) {
      await seek(page, t);
      const file = path.join(pngDir, `frame-${String(i + 1).padStart(2, '0')}-${t.toFixed(2)}s.png`);
      const buf = await page.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } });
      hashes[t] = crypto.createHash('sha1').update(buf).digest('hex');
      stills.push(file);
    }
    await contactSheet(stills, path.join(dir, 'storyboard.png'));
    const posterT = spec.type.length ? (spec.type[0].hold[0] + spec.type[0].hold[1]) / 2 : D * 0.45;
    await seek(page, posterT);
    await page.screenshot({ path: path.join(dir, 'poster.png'), clip: { x: 0, y: 0, width: W, height: H } });

    // ---------- contrast: sample what's behind each DOM line at its hold ----------
    for (const item of spec.type.filter(t => t.layer !== 'interleaved')) {
      const t = (item.hold[0] + item.hold[1]) / 2, r = at(t), box = r?.type.find(x => x.id === item.id);
      if (!box) continue;
      if (item.plate) {
        const c = contrastOf(item.color, item.plate), min = box.fontPx >= 48 ? 3 : 4.5;
        if (c < min) E('contrast', `type "${item.id}" has ${c.toFixed(2)}:1 against its plate (min ${min}:1)`);
        continue;
      }
      await seek(page, t);
      await page.evaluate(() => window.__typeVisible(false));
      const shot = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
      await page.evaluate(() => window.__typeVisible(true));
      const s = draft ? 0.5 : 1;
      const [x0, y0, x1, y1] = box.rect.map(v => Math.max(0, Math.round(v * s)));
      const w = Math.max(1, Math.min(Math.round(W * s), x1) - x0), h = Math.max(1, Math.min(Math.round(H * s), y1) - y0);
      const raw = await sharp(shot).extract({ left: Math.min(x0, Math.round(W * s) - 1), top: Math.min(y0, Math.round(H * s) - 1), width: w, height: h }).removeAlpha().resize(64, 32, { fit: 'fill' }).raw().toBuffer();
      // Behind the cards, the text only shows where no card covers it: sample only there.
      const covers = item.layer === 'behind' ? r.cards.filter(c => c.opacity > 0.35 && !c.behindCamera).map(c => c.quad) : [];
      const ratios = [];
      for (let p = 0, i = 0; p < raw.length; p += 3, i++) {
        const sx = box.rect[0] + ((i % 64) + 0.5) / 64 * (box.rect[2] - box.rect[0]), sy = box.rect[1] + (Math.floor(i / 64) + 0.5) / 32 * (box.rect[3] - box.rect[1]);
        if (covers.some(q => inQuad(sx, sy, q))) continue;
        ratios.push(contrastOf(item.color, `#${[raw[p], raw[p + 1], raw[p + 2]].map(v => v.toString(16).padStart(2, '0')).join('')}`));
      }
      if (!ratios.length) continue;
      ratios.sort((x, y) => x - y);
      const worst = ratios[Math.floor(ratios.length * 0.2)];
      const min = box.fontPx >= 48 ? 3 : 4.5;
      if (worst < min) E('contrast', `type "${item.id}" has ${worst.toFixed(2)}:1 against what's behind it at ${t.toFixed(1)}s (min ${min}:1)`);
    }

    // ---------- encode ----------
    let enc = { blurred: 0, diffs: [] };
    if (!a['no-video']) {
      log(`Encoding ${frames} frames (${mode}${blur.samples > 1 ? `, motion blur ${blur.samples}${blur.auto ? ' auto' : ''}` : ''})…`);
      enc = await encodeScene(page, frames, fps, W, H, path.join(dir, 'video.mp4'), draft, blur);
      report.blur = { samples: blur.samples, auto: blur.auto, shutter: blur.shutter, blurredFrames: enc.blurred };
    }
    // Never still: no stretch over 0.5s in which no visible card moves on screen (only the line may pause).
    {
      let run = 0, worst = 0, worstAt = 0;
      for (let f = 1; f < per.length; f++) {
        let move = 0;
        for (const c of per[f].cards) {
          const p = per[f - 1].cards.find(x => x.j === c.j);
          if (!p || !p.quad || !c.quad || c.behindCamera || p.behindCamera || Math.max(c.opacity, p.opacity) < 0.2) continue;
          for (let k = 0; k < 4; k++) move = Math.max(move, Math.hypot(c.quad[k][0] - p.quad[k][0], c.quad[k][1] - p.quad[k][1]));
          move = Math.max(move, Math.abs(c.opacity - p.opacity) * 100);
        }
        run = move < 0.15 ? run + 1 : 0;
        if (run > worst) { worst = run; worstAt = f / fps; }
      }
      if (worst / fps > 0.5) E('still', `nothing moves for ${(worst / fps).toFixed(2)}s (ending ${worstAt.toFixed(2)}s) - a scene is never still; add rig.idle or a slow camera move`);
    }

    // ---------- loop seam ----------
    if (spec.canvas.loop) {
      await seek(page, 0);
      const f0 = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
      await seek(page, D);
      const fN = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
      const [r0, rN] = await Promise.all([f0, fN].map(b => sharp(b).removeAlpha().raw().toBuffer()));
      let d = 0;
      for (let p = 0; p < r0.length; p++) d += Math.abs(r0[p] - rN[p]);
      const mean = d / r0.length;
      report.loopSeam = +mean.toFixed(3);
      const tw = 270, th = 480;
      const diffImg = Buffer.alloc(r0.length);
      for (let p = 0; p < r0.length; p++) diffImg[p] = Math.min(255, Math.abs(r0[p] - rN[p]) * 8);
      const meta0 = await sharp(f0).metadata();
      await sharp({ create: { width: tw * 3 + 40, height: th + 20, channels: 3, background: '#111111' } }).composite([
        { input: await sharp(f0).resize(tw, th).toBuffer(), left: 10, top: 10 },
        { input: await sharp(fN).resize(tw, th).toBuffer(), left: tw + 20, top: 10 },
        { input: await sharp(diffImg, { raw: { width: meta0.width, height: meta0.height, channels: 3 } }).resize(tw, th).png().toBuffer(), left: tw * 2 + 30, top: 10 },
      ]).png().toFile(path.join(dir, 'loop-seam.png'));
      if (mean > 1.0) E('loop-seam', `the last frame differs from the first (mean ${mean.toFixed(2)}/255) - see loop-seam.png; loop parameters must advance a whole number of periods and type must leave before the end`);
    }

    // ---------- determinism: the same moments, seeked in reverse order, give the same pixels ----------
    for (const t of [...stillTimes].reverse().slice(0, 4)) {
      await seek(page, t);
      const buf = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
      if (crypto.createHash('sha1').update(buf).digest('hex') !== hashes[t]) { E('determinism', `the frame at ${t.toFixed(2)}s changes with seek order - something depends on state outside the timeline`); break; }
    }

    // Length.
    if (Math.abs(frames / fps - D) > 0.05) E('length', `${(frames / fps).toFixed(2)}s rendered for a ${D}s scene`);
    if (pageErrors.length) E('page', `page errors: ${[...new Set(pageErrors)].slice(0, 3).join('; ')}`);
  } finally {
    await browser.close();
    await server.close();
    fs.rmSync(path.join(dir, '.render-scene.html'), { force: true });
  }

  writeJSON(path.join(dir, 'render-report.json'), report);
  return report;
}

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs();
  // Type specimen + colour contrast grid for a brand → <brandDir>/specimen.png (brand setup, fonts and colours).
  if (args.specimen) { await renderSpecimen(resolveBrandDir(args, resolveWorkspace(args))); process.exit(0); }
  const dir = args._[0] ? path.resolve(args._[0]) : fail('usage: render.mjs <scene-dir> [--brand <slug>] [--draft] [--gl swiftshader|gpu|auto]  |  render.mjs --specimen --brand <slug>', 2);
  const t0 = Date.now();
  let report;
  try { report = await renderScene(dir, { args }); } catch (e) { fail(e.stack || e.message, 2); }
  console.log(`\n${report.scene} · ${report.template || 'no template'} · ${report.ratio} ${report.duration}s · ${report.gl} (${report.renderer || '?'})`);
  for (const e of report.errors) console.log(`  error ${e.check}: ${e.msg}`);
  for (const w of report.warnings) console.log(`  warn  ${w.check}: ${w.msg}`);
  console.log(`\n${report.errors.length ? `${report.errors.length} error(s)` : 'No errors'}, ${report.warnings.length} warning(s). ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`video: ${path.join(dir, 'video.mp4')}\nstoryboard: ${path.join(dir, 'storyboard.png')}${report.loop ? `\nloop seam: ${path.join(dir, 'loop-seam.png')} (${report.loopSeam})` : ''}`);
  process.exit(report.errors.length ? 1 : 0);
}
