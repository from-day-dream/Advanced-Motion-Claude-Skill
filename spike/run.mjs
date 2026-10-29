#!/usr/bin/env node
// Phase 0 spike: measure WebGL rendering in headless Chromium for the card-scene pipeline.
// For each GL mode (swiftshader, gpu) and variant (12 cards, 40 cards at 512px) it renders the ring
// twice through the Slide Motion contract (seek window.__scene.tl, screenshot, pipe to ffmpeg) and
// reports seconds per frame, the WebGL renderer actually used, and whether the two runs match.
//
// Usage: node spike/run.mjs [--seconds 4] [--fps 30] [--modes swiftshader,gpu]
// Writes spike/out/<mode>-<n>.mp4, spike/out/results.json and per-frame diffs when runs differ.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const ffmpeg = require('ffmpeg-static');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SECONDS = Number(arg('seconds', 4)), FPS = Number(arg('fps', 30)), W = 1080, H = 1920;
const MODES = arg('modes', 'swiftshader,gpu').split(',');
const OUT = path.join(ROOT, 'spike', 'out');
fs.mkdirSync(OUT, { recursive: true });

const LAUNCH = {
  swiftshader: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  gpu: { channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] },
};
const VARIANTS = [{ n: 12, tex: 512 }, { n: 40, tex: 512 }];

// ---------- placeholder cards: 12 numbered 4:5 PNGs with small text, to judge texture sharpness ----------
async function makeCards(px) {
  const dir = path.join(ROOT, 'spike', 'cards', String(px));
  if (fs.existsSync(path.join(dir, '11.png'))) return;
  fs.mkdirSync(dir, { recursive: true });
  const w = px, h = Math.round(px * 1.25);
  for (let i = 0; i < 12; i++) {
    const hue = (i * 30) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="100%" height="100%" rx="${w * 0.05}" fill="hsl(${hue},55%,62%)"/>
      <text x="8%" y="40%" font-family="Arial" font-weight="700" font-size="${w * 0.36}" fill="#111">${String(i + 1).padStart(2, '0')}</text>
      <text x="8%" y="85%" font-family="Arial" font-size="${w * 0.05}" fill="#111">Card ${i + 1} · small caption text</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(dir, `${i}.png`));
  }
}

// ---------- static server (module scripts and importmaps need http, not file://) ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------- one run: seek every frame, screenshot, hash, optionally encode ----------
async function run(mode, { n, tex }, encode) {
  const browser = await chromium.launch(LAUNCH[mode]);
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/spike/ring.html?n=${n}&tex=${tex}&dur=${SECONDS}`);
    await page.waitForFunction(() => window.__scene, null, { timeout: 60000 }).catch(() => { throw new Error(`scene never ready: ${errors.join('; ')}`); });
    const renderer = await page.evaluate(() => window.__gl);
    const frames = Math.round(SECONDS * FPS);
    const ff = encode && spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(OUT, `${mode}-${n}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
    const hashes = [], keep = {};
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) {
      await page.evaluate(t => { window.__scene.tl.seek(t, false); }, f / FPS);
      const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
      const raw = await sharp(png).removeAlpha().raw().toBuffer();
      hashes.push(crypto.createHash('sha1').update(raw).digest('hex'));
      if (f === 0 || f === frames >> 1 || f === frames - 1) keep[f] = raw;
      if (ff && !ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    }
    const secs = (performance.now() - t0) / 1000;
    if (ff) { ff.stdin.end(); await new Promise(r => ff.on('close', r)); }
    return { renderer, frames, secPerFrame: secs / frames, hashes, keep };
  } finally { await browser.close(); }
}

// Max per-channel difference and the share of differing pixels between two raw RGB buffers.
function pixelDiff(a, b) {
  let max = 0, px = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d) { px++; if (d > max) max = d; }
  }
  return { maxChannel: max, pixelsDiffering: +(px / (a.length / 3) * 100).toFixed(4) + '%' };
}

await makeCards(512);
const results = [];
for (const mode of MODES) {
  for (const v of VARIANTS) {
    const label = `${mode} · ${v.n} cards @${v.tex}px`;
    try {
      const a = await run(mode, v, true);
      const b = await run(mode, v, false);
      const mismatched = a.hashes.filter((h, i) => h !== b.hashes[i]).length;
      const diffs = mismatched ? Object.fromEntries(Object.keys(a.keep).map(f => [f, pixelDiff(a.keep[f], b.keep[f])])) : null;
      const r = { mode, ...v, renderer: a.renderer, frames: a.frames, secPerFrame: [+a.secPerFrame.toFixed(3), +b.secPerFrame.toFixed(3)], identicalRuns: mismatched === 0, mismatchedFrames: mismatched, diffs };
      results.push(r);
      console.log(`${label}: ${r.secPerFrame.join(' / ')} s/frame, ${mismatched ? `${mismatched}/${a.frames} frames differ` : 'runs identical'} — ${a.renderer}`);
    } catch (e) {
      results.push({ mode, ...v, error: e.message.split('\n')[0] });
      console.log(`${label}: FAILED — ${e.message.split('\n')[0]}`);
    }
  }
}
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ seconds: SECONDS, fps: FPS, size: `${W}x${H}`, results }, null, 2));
server.close();
