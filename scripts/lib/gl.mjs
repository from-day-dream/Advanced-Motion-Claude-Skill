// WebGL browser for card scenes. The shared openBrowser (render-core.mjs) launches without GL flags and
// stays identical across the skills, so the scene renderer launches its own Chromium here.
//
// Modes (docs/phase0-results.md):
//   swiftshader  software WebGL (ANGLE → SwiftShader). The default: no GPU needed, frames identical
//                across runs on one machine, and as fast as the GPU here (the screenshot dominates).
//   gpu          the machine's GPU through ANGLE (needs the new headless, not the headless shell).
//   auto         gpu if it comes up with a hardware renderer, else swiftshader.
// Frames are identical run to run within a mode, not across modes: record the mode in the report.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SKILL_DIR, fail } from './workspace.mjs';

const require = createRequire(path.join(SKILL_DIR, 'package.json'));
const ANGLE = { win32: 'd3d11', darwin: 'metal', linux: 'vulkan' }[process.platform] || 'gl';

export const GL_MODES = {
  swiftshader: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  gpu: { channel: 'chromium', args: [`--use-angle=${ANGLE}`, '--enable-gpu', '--ignore-gpu-blocklist'] },
};

const isSoftware = renderer => /swiftshader|llvmpipe|software/i.test(renderer || '');

async function launch(mode) {
  const { chromium } = require('playwright');
  return chromium.launch(GL_MODES[mode]);
}

// The WebGL renderer string a mode actually gets, or null if WebGL doesn't come up.
export async function probeGL(mode = 'swiftshader') {
  let browser;
  try {
    browser = await launch(mode);
    const page = await browser.newPage();
    return await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      if (!gl) return null;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
  } catch { return null; } finally { await browser?.close().catch(() => {}); }
}

// Launch Chromium with WebGL for a W×H page (CSS px; `scale` < 1 renders drafts smaller). Returns { browser, page, mode }.
export async function openGLBrowser(W, H, mode = 'swiftshader', scale = 1) {
  if (mode === 'auto') {
    const r = await probeGL('gpu');
    mode = r && !isSoftware(r) ? 'gpu' : 'swiftshader';
  }
  if (!GL_MODES[mode]) fail(`unknown --gl mode "${mode}" (swiftshader | gpu | auto)`, 2);
  const browser = await launch(mode).catch(e => fail(`could not launch Chromium (${mode}) - run scripts/setup.mjs first.\n${e.message}`, 2));
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  return { browser, page, mode };
}

// Module scripts and import maps don't load from file://, so scenes are served over http. Serves the
// skill folder at /, the scene folder at /scene/ and the brand folder at /brand/. Returns { url, close }.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
export async function serveScene(sceneDir, brandDir) {
  const roots = [['/scene/', path.resolve(sceneDir)], ...(brandDir ? [['/brand/', path.resolve(brandDir)]] : []), ['/', SKILL_DIR]];
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const [prefix, root] = roots.find(([p]) => url.startsWith(p));
    const file = path.resolve(root, url.slice(prefix.length));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) };
}

// Seek the master timeline and draw that moment. The callback must return nothing: returning the GSAP
// timeline makes Playwright try to serialise it, and the call never resolves (docs/phase0-results.md).
export const seek = (page, t) => page.evaluate(time => { window.__scene.tl.seek(time, false); window.__scene.frame(); }, t);
// Seek, draw and return the runtime's report for that moment (card quads, facing, type boxes).
export const seekReport = (page, t) => page.evaluate(time => { window.__scene.tl.seek(time, false); window.__scene.frame(); return window.__report(); }, t);
