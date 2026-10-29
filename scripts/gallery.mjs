#!/usr/bin/env node
// Rebuild <workspace>/scenes/index.json from scenes/*/ and refresh <workspace>/gallery.html, the viewer
// shared with Carousel Studio and Slide Motion. Its Scenes tab plays scenes (thumbnails jump to each
// storyboard moment); its Templates tab plays the template specimens, copied into scenes/.templates/
// so the workspace server can reach them.
//
//   node gallery.mjs [--workspace <path>]                 rebuild index + viewer
//   node gallery.mjs --serve [--port 4173] [--workspace]  rebuild, then serve the workspace on localhost
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, parseArgs, readJSON, writeJSON, resolveWorkspace } from './lib/workspace.mjs';
import { serve } from './lib/serve.mjs';
import { listTemplates, loadTemplate } from './lib/scene-spec.mjs';

const args = parseArgs();
const ws = resolveWorkspace(args);
const scenesDir = path.join(ws, 'scenes');
fs.mkdirSync(scenesDir, { recursive: true });

const rel = p => path.relative(ws, p).replace(/\\/g, '/');
const bust = p => `${rel(p)}?v=${Math.round(fs.statSync(p).mtimeMs)}`;
const readText = p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '');

// Storyboard stills are named frame-NN-<t>s.png: each becomes a thumbnail that plays from its moment.
function moments(dir, duration) {
  const png = path.join(dir, 'png');
  if (!fs.existsSync(png)) return [];
  const files = fs.readdirSync(png).filter(f => /^frame-\d+-[\d.]+s\.png$/.test(f)).sort();
  return files.map((f, i) => {
    const t = Number(/-([\d.]+)s\.png$/.exec(f)[1]);
    const next = i + 1 < files.length ? Number(/-([\d.]+)s\.png$/.exec(files[i + 1])[1]) : duration;
    return { n: i + 1, start: Math.max(0, +(t - 0.3).toFixed(3)), duration: +(next - t).toFixed(3), png: bust(path.join(png, f)), headline: `${t.toFixed(1)}s`, body: '', beat: '' };
  });
}

function entry(folder) {
  const dir = path.join(scenesDir, folder);
  const video = path.join(dir, 'video.mp4');
  const report = readJSON(path.join(dir, 'render-report.json'), null);
  if (!fs.existsSync(video) || !report?.frames) return null;
  const meta = readJSON(path.join(dir, 'meta.json'), {});
  const [width, height] = String(report.size || '1080x1920').split('x').map(Number);
  const date = folder.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || (meta.createdAt || '').slice(0, 10);
  const poster = path.join(dir, 'poster.png');
  return {
    id: folder, date, createdAt: meta.createdAt || date,
    title: meta.title || meta.topic || folder, topic: meta.topic || '', brand: meta.brand || report.brand || '',
    style: [report.template, report.loop ? 'loop' : ''].filter(Boolean).join(' · '),
    ratio: report.ratio, width, height, fps: report.fps, duration: report.duration,
    source: meta.source?.carousel ? path.basename(meta.source.carousel) : '',
    caption: readText(path.join(dir, 'caption.txt')) || [meta.caption, (meta.hashtags || []).join(' ')].filter(Boolean).join('\n\n'),
    video: bust(video), poster: fs.existsSync(poster) ? bust(poster) : null,
    report: { errors: report.errors.length, warnings: report.warnings.length },
    scenes: moments(dir, report.duration),
  };
}

const scenes = fs.readdirSync(scenesDir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.'))
  .map(d => entry(d.name)).filter(Boolean)
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));

// Template specimens: the brand's own if rendered (brands/<slug>/specimens/scenes/), else the grey ones.
const tplOut = path.join(scenesDir, '.templates');
fs.mkdirSync(tplOut, { recursive: true });
const cfg = readJSON(path.join(ws, 'config.json'), {});
const brandSpec = cfg.activeBrand ? path.join(ws, 'brands', cfg.activeBrand, 'specimens', 'scenes') : null;
const templates = listTemplates().map(name => {
  const t = loadTemplate(name);
  const own = brandSpec && fs.existsSync(path.join(brandSpec, name, 'specimen.mp4')) ? path.join(brandSpec, name) : null;
  const src = own || path.join(SKILL_DIR, 'templates', 'motion', name);
  if (!fs.existsSync(path.join(src, 'specimen.mp4'))) return null;
  for (const f of ['specimen.mp4', 'specimen.png']) if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(tplOut, `${name}-${f}`));
  const poster = path.join(tplOut, `${name}-specimen.png`);
  return {
    id: name, date: '', createdAt: '', title: name, topic: t.description, brand: own ? cfg.activeBrand : 'specimen',
    style: `${t.rig.type}${t.rig.mode ? ` (${t.rig.mode})` : ''} · ${t.cards.count.join('-')} cards${t.loop ? ' · loop' : ''}`,
    ratio: '9:16', width: 1080, height: 1920, fps: 30, duration: 6, source: '',
    caption: [t.description, `For: ${t.fits.join('; ')}.`, `Avoid: ${t.avoid.join('; ')}.`].join('\n\n'),
    video: bust(path.join(tplOut, `${name}-specimen.mp4`)), poster: fs.existsSync(poster) ? bust(poster) : null, report: null,
    scenes: fs.existsSync(poster) ? [{ n: 1, start: 0, duration: 6, png: bust(poster), headline: t.description, body: '', beat: '' }] : [],
  };
}).filter(Boolean);

writeJSON(path.join(scenesDir, 'index.json'), { generatedAt: new Date().toISOString(), scenes, templates });
fs.copyFileSync(path.join(SKILL_DIR, 'templates', 'gallery.html'), path.join(ws, 'gallery.html'));
console.log(`Indexed ${scenes.length} scene(s) and ${templates.length} template specimen(s) → ${path.join(scenesDir, 'index.json')}`);

if (args.serve) serve(ws, Number(args.port) || 4173);
