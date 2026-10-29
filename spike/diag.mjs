#!/usr/bin/env node
// Spike diagnostic: load ring.html in one GL mode and time a few seek + screenshot steps, logging each.
// Usage: node spike/diag.mjs [swiftshader|gpu|default] [frames]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'swiftshader', frames = Number(process.argv[3] || 4);
const LAUNCH = {
  swiftshader: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  gpu: { channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
  default: {},
  'swiftshader-gl': { args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] },
  'headless-new': { channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
};
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms))]);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

const browser = await chromium.launch(LAUNCH[mode]); log('launched', mode);
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('console', m => log('console', m.text()));
page.on('pageerror', e => log('pageerror', e.message));
page.on('requestfailed', r => log('reqfail', r.url()));
await page.goto(`http://127.0.0.1:${server.address().port}/spike/ring.html?n=12&tex=512&dur=1`, { timeout: 20000 }); log('loaded');
const ready = await page.waitForFunction(() => window.__scene, null, { timeout: 20000 }).then(() => true, () => false);
log(ready ? 'ready' : 'NOT READY (window.__scene never set)');
if (ready) {
  log('gl', await page.evaluate(() => window.__gl));
  for (let f = 0; f < frames; f++) {
    const t0 = Date.now();
    try { await within(page.evaluate(t => { window.__scene.tl.seek(t, false); }, f / 30), 30000, 'seek'); } catch (e) { log(e.message); break; }
    const t1 = Date.now();
    try { await within(page.screenshot({ type: 'png', timeout: 30000, path: f === 0 ? path.join(ROOT, 'spike', `diag-${mode}.png`) : undefined }), 35000, 'screenshot'); } catch (e) { log(e.message.split('\n')[0]); break; }
    log(`frame ${f}: seek ${t1 - t0} ms, screenshot ${Date.now() - t1} ms`);
  }
}
await within(browser.close(), 10000, 'close').catch(() => {});
server.close();
process.exit(0);
