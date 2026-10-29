// scene.json + template + brand → the resolved spec the runtime reads (references/scene-spec.md).
// Everything aesthetic resolves through the brand: eases "motion:<token>" through motion.json (exactly
// as in Slide Motion), colours "token:<name>" and font roles through tokens.json. Template beats are
// fractions of the duration; here they become seconds. Collects warnings and errors for the report.
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, readJSON, stripComments } from './workspace.mjs';
import { RIGS, rigParams } from '../../runtime/rigs/index.js';

export const TEMPLATES_DIR = path.join(SKILL_DIR, 'templates', 'motion');
export const listTemplates = () => (fs.existsSync(TEMPLATES_DIR)
  ? fs.readdirSync(TEMPLATES_DIR).filter(d => fs.existsSync(path.join(TEMPLATES_DIR, d, 'template.json'))).sort() : []);
export function loadTemplate(name) {
  const file = path.join(TEMPLATES_DIR, name, 'template.json');
  if (!fs.existsSync(file)) return null;
  return stripComments(readJSON(file));
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
  return out;
};
const get = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const words = s => (String(s).match(/[\p{L}\p{N}]+/gu) || []).length;

// ---------- brand lookups ----------

const hexRGB = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lum = hex => hexRGB(hex).map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
export const contrastOf = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

export function brandColors(tokens) {
  const cols = Object.entries(tokens.colors || {}).map(([name, c]) => ({ name, hex: (typeof c === 'string' ? c : c.value).toLowerCase(), role: String((typeof c === 'string' ? '' : c.role) || '').toLowerCase() }));
  const bg = cols.find(c => /background/.test(c.role) && !/inverse/.test(c.role)) || cols[0];
  const textish = cols.filter(c => /text|ink/.test(c.role + c.name) && !/never text/.test(c.role) && c !== bg);
  const text = [...(textish.length ? textish : cols.filter(c => c !== bg))].sort((a, b) => contrastOf(b.hex, bg.hex) - contrastOf(a.hex, bg.hex))[0] || bg;
  const accent = cols.find(c => /accent/.test(c.role + c.name)) || text;
  return { list: cols, bg, text, accent };
}

function resolveColor(v, tokens, errors, where) {
  if (v == null) return v;
  const s = String(v);
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s.toLowerCase();
  const B = brandColors(tokens);
  const m = /^(token|role):(.+)$/.exec(s);
  if (m) {
    const k = m[2];
    if (m[1] === 'role') return (k === 'background' ? B.bg : k === 'text' ? B.text : k === 'accent' ? B.accent : B.list.find(c => c.role.includes(k)) || B.text).hex;
    const hit = B.list.find(c => c.name === k);
    if (hit) return hit.hex;
  }
  errors.push({ check: 'token', msg: `${where}: "${s}" is not a brand colour (use token:<name> from tokens.json or role:background|text|accent)` });
  return B.text.hex;
}

function fontFor(role, tokens, { weight, italic } = {}) {
  const F = tokens.fonts || {};
  const key = role === 'display' || role === 'heading' ? (F.heading ? 'heading' : Object.keys(F)[0])
    : role === 'accent' ? (F.accent ? 'accent' : F.heading ? 'heading' : Object.keys(F)[0])
      : F[role] ? role : (F.body ? 'body' : Object.keys(F)[0]);
  const font = F[key] || {};
  const files = (font.files || []).filter(f => (f.style || 'normal') === (italic ? 'italic' : 'normal'));
  const pool = files.length ? files : font.files || [];
  const want = weight || Math.max(400, ...pool.map(f => Number(f.weight) || 400));
  const file = [...pool].sort((a, b) => Math.abs((Number(a.weight) || 400) - want) - Math.abs((Number(b.weight) || 400) - want))[0];
  return { role: key, family: font.family || 'sans-serif', weight: Number(file?.weight) || want, style: italic && files.length ? 'italic' : 'normal', url: file ? `/brand/${file.path.replace(/\\/g, '/')}` : null };
}

// ---------- values ----------

function easeOf(v, motion, errors, where) {
  if (v == null || v === 'linear') return 'none';
  const m = /^motion[:.](\w+)$/.exec(String(v));
  if (!m) return String(v);
  const e = motion.ease?.[m[1]];
  if (!e) { errors.push({ check: 'ease', msg: `${where}: motion.json has no ease.${m[1]}` }); return 'none'; }
  return e;
}
function durOf(v, motion, D, errors, where) {
  const m = /^motion[:.](\w+)$/.exec(String(v));
  if (m) {
    const d = motion.duration?.[m[1]];
    if (!(d > 0)) { errors.push({ check: 'duration', msg: `${where}: motion.json has no duration.${m[1]}` }); return 0.5; }
    return d;
  }
  return Number(v);
}
// Numbers, or small arithmetic over named variables ("turns*360", "N", "cycles*N").
function evalExpr(v, vars, errors, where) {
  if (typeof v === 'number' || v == null) return v;
  const s = String(v).replace(/[A-Za-z_]\w*/g, k => {
    if (!(k in vars)) { errors.push({ check: 'template', msg: `${where}: unknown variable "${k}" in "${v}"` }); return '0'; }
    return `(${Number(vars[k])})`;
  });
  if (!/^[-+*/().\d\se]+$/.test(s)) { errors.push({ check: 'template', msg: `${where}: "${v}" is not a number or expression` }); return 0; }
  return Function(`"use strict";return (${s});`)();
}

// ---------- resolve ----------

export function resolveScene({ scene, meta, motion, tokens, ratio, safe, manifest, sceneDir }) {
  const errors = [], warnings = [];
  const t = scene.template ? loadTemplate(scene.template) : null;
  if (scene.template && !t) errors.push({ check: 'template', msg: `unknown template "${scene.template}" (${listTemplates().join(', ')})` });
  if (!scene.template) warnings.push({ check: 'template', msg: 'no template: say in the critique why none fitted (references/templates.md)' });

  // Cards: scene.json order, textures from the rasterised manifest.
  const cardList = scene.cards || meta.cards || [];
  const cards = [];
  for (const c of cardList) {
    const m = manifest?.cards?.[c.id];
    if (!m) { errors.push({ check: 'cards', msg: `card "${c.id}" has not been rasterised - run scripts/cards.mjs` }); continue; }
    cards.push({ id: c.id, tex: `/scene/cards/out/${m.file}`, aspect: m.px[0] / m.px[1], px: m.px, minFontRatio: m.minFontRatio ?? null });
  }
  const N = cards.length;
  if (t?.cards?.count && (N < t.cards.count[0] || N > t.cards.count[1])) warnings.push({ check: 'template', msg: `${N} cards; ${scene.template} is made for ${t.cards.count[0]}-${t.cards.count[1]}` });

  const canvasIn = scene.canvas || {};
  const loop = canvasIn.loop ?? meta.loop ?? t?.loop === true;
  const D = Number(canvasIn.duration) || Number(meta.duration) || t?.duration?.default || 10;
  if (t?.duration?.range && (D < t.duration.range[0] || D > t.duration.range[1])) warnings.push({ check: 'template', msg: `duration ${D}s is outside ${scene.template}'s ${t.duration.range.join('-')}s` });
  if (loop && t && t.loop === false) warnings.push({ check: 'loop', msg: `${scene.template} isn't made to loop` });

  const vars = { N, D, ...(t?.vars || {}), ...(scene.vars || {}) };
  const rigIn = merge(t?.rig, scene.rig);
  if (scene.seed != null && rigIn.seed == null) rigIn.seed = scene.seed;
  if (!RIGS[rigIn.type]) errors.push({ check: 'rig', msg: `unknown rig "${rigIn.type}" (${Object.keys(RIGS).join(', ')})` });
  // Rig values may be expressions over the variables ("N*0.5"); words like "auto" or "cylinder" stay as they are.
  for (const [k, v] of Object.entries(rigIn)) if (typeof v === 'string' && (/[*+/()]/.test(v) || v in vars)) rigIn[k] = evalExpr(v, vars, errors, `rig.${k}`);
  const camIn = merge(t?.camera, scene.camera);
  const lookIn = merge(t?.look, scene.look);

  // Range checks: every override the template bounds.
  const scope = { rig: rigIn, camera: camIn, look: lookIn, vars };
  for (const [k, [lo, hi]] of Object.entries(t?.ranges || {})) {
    const v = k.includes('.') ? get(scope, k) : vars[k];
    if (typeof v === 'number' && (v < lo || v > hi)) warnings.push({ check: 'range', msg: `${k} = ${v} is outside ${scene.template}'s range ${lo}-${hi}` });
  }

  // Timeline: template beats (fractions → seconds) with per-name overrides, then the scene's own entries.
  const timeline = [];
  const overrides = scene.beats || {};
  for (const b of t?.beats || []) {
    if (overrides[b.name] === null) continue;
    if (loop && b.skipOnLoop) continue;
    const o = { ...b, ...(overrides[b.name] || {}) };
    const where = `beat ${o.name}`;
    const at = evalExpr(o.at, vars, errors, where) * (o.seconds ? 1 : D);
    const dur = typeof o.dur === 'string' && o.dur.startsWith('motion') ? durOf(o.dur, motion, D, errors, where) : evalExpr(o.dur, vars, errors, where) * (o.seconds ? 1 : D);
    if (o.steps == null) { timeline.push({ ...o, at, dur }); continue; }
    // Stepped beat: k equal steps, each a hold then a move over `fill` of the step (a peel, a cover-flow step).
    const k = Math.max(1, Math.round(evalExpr(o.steps, vars, errors, where)));
    const from = evalExpr(o.from ?? 0, vars, errors, where), to = evalExpr(o.value, vars, errors, where);
    const step = dur / k, fill = o.fill ?? 0.6;
    for (let i = 0; i < k; i++) {
      timeline.push({ ...o, name: `${o.name}-${i + 1}`, steps: undefined, at: at + i * step + step * (1 - fill), dur: step * fill, from: from + (to - from) * i / k, value: from + (to - from) * (i + 1) / k });
    }
  }
  for (const e of scene.timeline || []) timeline.push({ ...e, dur: durOf(e.dur, motion, D, errors, `timeline ${e.to}`) });
  // Camera shorthand: camera.<key>: [from, to] over the whole scene.
  const animate = { dolly: 0, orbit: 0, elevate: 0, truck: 0, pedestal: 0, roll: 0 };
  for (const k of Object.keys(animate)) {
    if (Array.isArray(camIn[k])) {
      timeline.push({ at: 0, dur: D, to: `camera.${k}`, from: camIn[k][0], value: camIn[k][1], ease: camIn.ease || 'motion:ambient', why: camIn.why || 'keeps the frame alive: a slow camera drift', name: `camera-${k}` });
      animate[k] = camIn[k][0];
    } else if (typeof camIn[k] === 'number') animate[k] = camIn[k];
  }
  for (const e of timeline) {
    const where = `timeline ${e.name || e.to}`;
    e.value = evalExpr(e.value, vars, errors, where);
    if (e.from !== undefined) e.from = evalExpr(e.from, vars, errors, where);
    e.ease = easeOf(e.ease, motion, errors, where);
    if (!e.why) warnings.push({ check: 'intent', msg: `${where} has no "why" (carries / reveals / connects / emphasises / hands over / keeps alive)` });
    if (!/^(rig|camera|look)\.\w+$/.test(e.to || '')) errors.push({ check: 'timeline', msg: `${where}: "to" must be rig.<param>, camera.<param> or look.<param>` });
    if (e.at < 0 || e.at + e.dur > D + 1e-6) warnings.push({ check: 'timeline', msg: `${where} runs ${e.at.toFixed(2)}-${(e.at + e.dur).toFixed(2)}s, outside the ${D}s scene` });
  }

  // Loop: every looping parameter must come back to an equivalent value (a whole number of periods).
  if (loop && RIGS[rigIn.type]) {
    const p = rigParams(rigIn);
    const periods = RIGS[rigIn.type].periods(p, Math.max(1, N));
    const finals = {};
    for (const e of [...timeline].sort((a, b) => a.at + a.dur - (b.at + b.dur))) if (e.to.startsWith('rig.')) finals[e.to.slice(4)] = { from: e.from, value: e.value };
    for (const [k, f] of Object.entries(finals)) {
      const start = typeof p[k] === 'number' ? p[k] : 0;
      const delta = f.value - start, period = periods[k];
      if (period ? Math.abs(delta / period - Math.round(delta / period)) > 1e-3 : Math.abs(delta) > 1e-6) {
        warnings.push({ check: 'loop', msg: `rig.${k} goes ${start} → ${f.value}${period ? `; a seamless loop needs a whole number of periods (${period})` : '; it must end where it starts'}` });
      }
    }
  }

  // Look.
  const B = brandColors(tokens);
  const look = { ...lookIn, background: resolveColor(lookIn.background ?? 'role:background', tokens, errors, 'look.background'), text: B.text.hex };
  if (lookIn.lineColor) look.lineColor = resolveColor(lookIn.lineColor, tokens, errors, 'look.lineColor');
  // A dotted ground (a design-canvas brand): dots in a brand colour on the background, panned by look.groundX/Y.
  if (lookIn.dots) {
    const d = lookIn.dots === true ? {} : lookIn.dots;
    look.dots = { color: resolveColor(d.color ?? 'role:text', tokens, errors, 'look.dots.color'), pitch: Number(d.pitch) || 48, size: Number(d.size) || 3, offset: Number(d.offset ?? (Number(d.pitch) || 48) / 2) };
  }
  if (look.dof) warnings.push({ check: 'look', msg: 'look.dof is not supported in this version; ignored' });

  // Type.
  const roles = t?.type?.roles;
  const maxWords = Math.min(t?.type?.maxWords ?? 99, motion.visual?.wordsPerBeat ?? 99);
  const type = (scene.type || []).map((it, i) => {
    const id = it.id || `t${i + 1}`, layer = it.layer || 'front';
    if (roles && !roles.includes(layer)) warnings.push({ check: 'template', msg: `type "${id}" is on layer "${layer}"; ${scene.template} expects ${roles.join(' | ')}` });
    if (words(it.text) > maxWords) warnings.push({ check: 'type', msg: `type "${id}" has ${words(it.text)} words; keep it to ${maxWords} (the big line carries one idea; cards carry the rest)` });
    const font = fontFor(it.font || (layer === 'interleaved' || it.style === 'display' ? 'display' : it.style || 'display'), tokens, { weight: it.weight, italic: it.italic });
    if (layer === 'interleaved' && (!font.url || !/\.(ttf|otf|woff)$/i.test(font.url))) errors.push({ check: 'font', msg: `type "${id}": in-scene text needs a .ttf/.otf/.woff brand font file (got ${font.url || 'none'})` });
    const size = it.size === 'fit' || it.size == null ? 'fit' : typeof it.size === 'number' ? it.size : Number(tokens.typeScale?.[it.size]) || 96;
    const enterIn = it.enter === 'none' ? { kind: 'none' } : typeof it.enter === 'string' ? { kind: it.enter } : it.enter || { kind: 'mask-up' };
    const enter = enterIn.kind === 'none' ? { kind: 'none', at: 0, dur: 0 } : {
      kind: enterIn.kind, at: Number(enterIn.at ?? D * 0.12), dur: durOf(enterIn.dur ?? 'motion:enter', motion, D, errors, `type ${id}`),
      ease: easeOf(enterIn.ease ?? 'motion:enter', motion, errors, `type ${id}`), stagger: Number(enterIn.stagger ?? motion.duration?.stagger ?? 0.06),
    };
    const exit = it.exit ? {
      kind: typeof it.exit === 'string' ? it.exit : it.exit.kind || 'fade', at: Number(it.exit.at ?? D - 0.8),
      dur: durOf(it.exit.dur ?? 'motion:exit', motion, D, errors, `type ${id}`), ease: easeOf(it.exit.ease ?? 'motion:exit', motion, errors, `type ${id}`),
      stagger: Number(it.exit.stagger ?? motion.duration?.stagger ?? 0.06),
    } : null;
    const nUnits = enter.kind === 'mask-up' ? words(it.text) : enter.kind === 'stagger' ? String(it.text).length / 2 : 1;
    const settled = enter.at + enter.dur + Math.max(0, nUnits - 1) * (enter.stagger || 0);
    const hold = it.hold || [Math.min(D, settled), exit ? exit.at : D];
    if (loop && enter.kind !== 'none' && !exit) warnings.push({ check: 'loop', msg: `type "${id}" enters but never leaves; the loop's first and last frames won't match` });
    return {
      id, text: String(it.text), layer, zone: it.zone ?? 'center', align: it.align || 'center', font, size, maxSize: it.maxSize,
      lineHeight: it.lineHeight, tracking: it.tracking, case: it.case, color: resolveColor(it.color ?? 'role:text', tokens, errors, `type ${id}`),
      depth: it.depth || 0, depthR: it.depthR, enter, exit, hold,
      plate: it.plate ? resolveColor(it.plate === true ? 'role:background' : it.plate, tokens, errors, `type ${id} plate`) : null,
    };
  });

  const camera = { preset: camIn.preset || 'front', fov: camIn.fov || 35, fit: camIn.fit, distance: camIn.distance, position: camIn.position, offsetR: camIn.offsetR, target: camIn.target, animate };
  const custom = scene.custom ? `/scene/${scene.custom.replace(/\\/g, '/')}` : null;
  if (custom) warnings.push({ check: 'custom', msg: `custom.js hook used (${scene.custom}); say why the spec couldn't express it` });
  if (custom && fs.existsSync(path.join(sceneDir, scene.custom)) && /Math\.random|setTimeout|setInterval|requestAnimationFrame|Date\.now/.test(fs.readFileSync(path.join(sceneDir, scene.custom), 'utf8'))) {
    errors.push({ check: 'determinism', msg: `${scene.custom} uses Math.random, timers or the clock - use the seeded rng and the timeline` });
  }

  const spec = {
    canvas: { width: ratio.width, height: ratio.height, duration: D, loop: !!loop, safe, fps: Number(canvasIn.fps) || 30 },
    template: scene.template || null, cards, rig: rigIn, camera, look, type, timeline, custom,
  };
  return { spec, errors, warnings, template: t };
}
