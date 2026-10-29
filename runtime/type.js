// Big type (references/type.md). Three layers:
//   behind       DOM, under the WebGL canvas: cards pass in front of it (partly occluded, by design)
//   front        DOM, over the canvas: always readable
//   interleaved  SDF text inside the 3D scene (troika-three-text): some cards in front, some behind
// Every entrance and exit is a tween on the master timeline, so the renderer can seek it.
import * as THREE from 'three';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function zoneBox(item, W, H, safe) {
  const left = safe.left, width = W - safe.left - safe.right;
  return { left, width, zone: item.zone ?? 'center' };
}

// ---------- DOM layers ----------

async function buildDom(item, layerEl, ctx) {
  await document.fonts.load(`${item.font.style || 'normal'} ${item.font.weight} 100px "${item.font.family}"`).catch(() => {});
  const { W, H, safe } = ctx;
  const { left, width: full, zone } = zoneBox(item, W, H, safe);
  const el = document.createElement('div');
  const width = full;
  el.className = 'am-type';
  el.dataset.type = item.id;
  const f = item.font;
  Object.assign(el.style, {
    position: 'absolute', left: `${left}px`, width: `${width}px`, textAlign: item.align || 'center',
    fontFamily: `"${f.family}"`, fontWeight: String(f.weight), fontStyle: f.style || 'normal',
    lineHeight: String(item.lineHeight ?? 0.95), letterSpacing: `${item.tracking ?? 0}em`,
    textTransform: item.case === 'upper' ? 'uppercase' : item.case === 'lower' ? 'lowercase' : 'none',
    color: item.color, whiteSpace: 'pre-line',
  });
  if (item.plate) Object.assign(el.style, { background: item.plate, padding: '0.18em 0.32em 0.22em', borderRadius: '0.12em', boxSizing: 'border-box' });
  // Words → masks → inner spans → characters, so any entrance can address any level.
  el.innerHTML = String(item.text).split('\n').map(line => line.split(/\s+/).filter(Boolean)
    .map(w => `<span class="am-w" style="display:inline-block;overflow:hidden;vertical-align:top;padding:0.06em 0.02em;margin:-0.06em -0.02em"><span class="am-wi" style="display:inline-block">${[...w].map(c => `<span class="am-c" style="display:inline-block">${esc(c)}</span>`).join('')}</span></span>`)
    .join(' ')).join('\n');
  layerEl.appendChild(el);

  // Size: px, or 'fit' to span the zone's width (display type sized from the canvas).
  if (item.size === 'fit') {
    el.style.fontSize = '100px';
    const probe = document.createElement('span');
    probe.style.whiteSpace = 'pre';
    probe.innerHTML = el.innerHTML;
    probe.style.font = getComputedStyle(el).font;
    probe.style.letterSpacing = el.style.letterSpacing; probe.style.textTransform = el.style.textTransform;
    probe.style.position = 'absolute'; probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const widest = Math.max(...String(item.text).split('\n').map(line => { probe.textContent = item.case === 'upper' ? line.toUpperCase() : line; return probe.getBoundingClientRect().width; }));
    probe.remove();
    const usable = item.plate ? width / 1.12 : width;  // a plate's padding takes some of the width
    el.style.fontSize = `${Math.min(item.maxSize || 9999, Math.floor(100 * usable / Math.max(1, widest) * 0.98))}px`;
  } else el.style.fontSize = `${item.size}px`;

  const h = el.getBoundingClientRect().height;
  const top = typeof zone === 'number' ? zone - h / 2
    : zone === 'top' ? safe.top : zone === 'bottom' ? H - safe.bottom - h : (H - h) / 2;
  el.style.top = `${top}px`;
  return el;
}

function domTweens(tl, item, el, ctx) {
  const words = el.querySelectorAll('.am-wi'), chars = el.querySelectorAll('.am-c');
  const e = item.enter, x = item.exit;
  if (!e || e.kind === 'none') gsap.set(el, { opacity: 1 });
  else {
    const o = { duration: e.dur, ease: e.ease };
    if (e.kind === 'mask-up') tl.fromTo(words, { yPercent: 115 }, { yPercent: 0, stagger: e.stagger, ...o }, e.at);
    else if (e.kind === 'stagger') tl.fromTo(chars, { opacity: 0, yPercent: 40 }, { opacity: 1, yPercent: 0, stagger: e.stagger / 2, ...o }, e.at);
    else if (e.kind === 'scale-settle') tl.fromTo(el, { opacity: 0, scale: 1.14 }, { opacity: 1, scale: 1, ...o }, e.at);
    else if (e.kind === 'depth-push') tl.fromTo(el, { opacity: 0, scale: 0.72 }, { opacity: 1, scale: 1, ...o }, e.at);
    else tl.fromTo(el, { opacity: 0 }, { opacity: 1, ...o }, e.at);
  }
  if (x) {
    const o = { duration: x.dur, ease: x.ease, immediateRender: false };
    if (x.kind === 'mask-down') tl.to(words, { yPercent: -115, stagger: x.stagger, ...o }, x.at);
    else if (x.kind === 'scale-out') tl.to(el, { opacity: 0, scale: 0.9, ...o }, x.at);
    else tl.to(el, { opacity: 0, ...o }, x.at);
  }
}

// ---------- interleaved (in the 3D scene) ----------

async function buildScene(item, ctx) {
  const { Text } = await import('troika-three-text');
  const { W, H, safe, worldPerPx } = ctx;
  const t = new Text();
  t.text = item.case === 'upper' ? String(item.text).toUpperCase() : String(item.text);
  t.font = item.font.url;
  t.color = new THREE.Color(item.color);
  t.anchorX = 'center'; t.anchorY = 'middle';
  t.textAlign = item.align || 'center';
  t.lineHeight = item.lineHeight ?? 0.95;
  t.letterSpacing = item.tracking ?? 0;
  const width = W - safe.left - safe.right;
  t.maxWidth = width * worldPerPx;
  t.fontSize = (item.size === 'fit' ? 200 : item.size) * worldPerPx;
  await new Promise(r => t.sync(r));
  if (item.size === 'fit') {
    const bb = t.geometry.boundingBox, w = bb.max.x - bb.min.x;
    const size = t.fontSize * Math.min((item.maxSize || 9999) * worldPerPx / t.fontSize, (width * worldPerPx * 0.98) / Math.max(1e-6, w));
    // troika only calls back when something changed: re-sync only for a new size, or this never resolves.
    if (Math.abs(size - t.fontSize) > 1e-9) { t.fontSize = size; await new Promise(r => t.sync(r)); }
  }
  const zone = item.zone ?? 'center';
  const yPx = typeof zone === 'number' ? zone : zone === 'top' ? safe.top + 160 : zone === 'bottom' ? H - safe.bottom - 160 : H / 2;
  // depth in world units, or depthR in rig radii (toward the camera), so the line sits where only the nearest cards cross it.
  const dz = item.depthR != null ? item.depthR * ctx.rigRadius : item.depth || 0;
  t.position.set(ctx.center[0], ctx.center[1] + (H / 2 - yPx) * worldPerPx, ctx.center[2] + dz);
  t.material.depthWrite = false;
  t.renderOrder = 2;
  t.userData.state = { opacity: 1, scale: 1, z: 0, y: 0 };
  return t;
}

function sceneTweens(tl, item, t) {
  const s = t.userData.state, e = item.enter, x = item.exit;
  if (e && e.kind !== 'none') {
    const from = e.kind === 'depth-push' ? { opacity: 0, z: -1.6, scale: 0.85 } : e.kind === 'scale-settle' ? { opacity: 0, scale: 1.15 } : { opacity: 0, y: -0.25 };
    tl.fromTo(s, from, { opacity: 1, z: 0, scale: 1, y: 0, duration: e.dur, ease: e.ease }, e.at);
  }
  if (x) tl.to(s, { opacity: 0, duration: x.dur, ease: x.ease, immediateRender: false }, x.at);
}

// ---------- public ----------

export async function buildType(items, ctx) {
  const dom = [], meshes = [];
  for (const item of items || []) {
    if (item.layer === 'interleaved') {
      const t = await buildScene(item, ctx);
      ctx.scene.add(t);
      meshes.push({ item, t, base: t.position.clone() });
    } else {
      const el = await buildDom(item, document.getElementById(item.layer === 'behind' ? 'type-behind' : 'type-front'), ctx);
      dom.push({ item, el });
    }
  }
  return {
    addTweens(tl) {
      for (const { item, el } of dom) domTweens(tl, item, el, ctx);
      for (const { item, t } of meshes) sceneTweens(tl, item, t);
    },
    update() {
      for (const { t, base } of meshes) {
        const s = t.userData.state;
        t.fillOpacity = s.opacity;
        t.visible = s.opacity > 0.001;
        t.scale.setScalar(s.scale);
        t.position.set(base.x, base.y + s.y, base.z + s.z);
      }
    },
    // Screen boxes and visible opacity of every type item, for the render checks.
    report(camera) {
      const out = [];
      for (const { item, el } of dom) {
        const spans = [...el.querySelectorAll('.am-c')];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const s of spans) { const r = s.getBoundingClientRect(); x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
        let op = 1;
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
        const charOp = spans.length ? spans.reduce((a, s) => a + Number(getComputedStyle(s).opacity), 0) / spans.length : 1;
        out.push({ id: item.id, layer: item.layer, rect: [x0, y0, x1, y1], opacity: op * charOp, fontPx: parseFloat(el.style.fontSize) });
      }
      for (const { item, t } of meshes) {
        const bb = t.geometry.boundingBox;
        if (!bb) continue;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, depth = 0;
        for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) {
          const v = new THREE.Vector3(cx, cy, 0).applyMatrix4(t.matrixWorld);
          depth = v.clone().applyMatrix4(camera.matrixWorldInverse).z;
          v.project(camera);
          const sx = (v.x + 1) / 2 * ctx.W, sy = (1 - v.y) / 2 * ctx.H;
          x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
        }
        out.push({ id: item.id, layer: 'interleaved', rect: [x0, y0, x1, y1], opacity: t.userData.state.opacity, depth, fontPx: t.fontSize / ctx.worldPerPx });
      }
      return out;
    },
    setVisible(v) {
      for (const { el } of dom) el.style.visibility = v ? 'visible' : 'hidden';
      for (const { t } of meshes) t.material.visible = v;
    },
  };
}
