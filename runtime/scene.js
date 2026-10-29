// The scene runtime. Reads the resolved spec (window.__SPEC, written by scripts/render.mjs from
// scene.json + template + brand), builds one mesh per rig slot, binds rig / camera / look parameters
// to one paused GSAP master timeline, and exposes the renderer contract:
//   window.__scene = { tl, frame }   seek tl, then frame() draws that moment
//   window.__report()                every card's screen quad, facing, opacity and texel density, plus type boxes
//   window.__typeVisible(bool)       hide type (contrast checks sample what's behind it)
// Nothing here may use Math.random, timers or the wall clock.
import * as THREE from 'three';
import { RIGS, rigParams, poses } from './rigs/index.js';
import { cardMaterial, shadowMaterial, prepareTexture } from './look.js';
import { buildType } from './type.js';
import { D2R } from './rigs/math.js';

const S = window.__SPEC;
const fail = msg => { window.__errors = [...(window.__errors || []), msg]; throw new Error(msg); };
// Where start-up got to, for the renderer's timeout message.
const stage = s => { window.__stage = s; };
stage('textures');

THREE.ColorManagement.enabled = false;
const { width: W, height: H, duration: D } = S.canvas;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x000000, 0);
renderer.sortObjects = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(S.camera.fov || 35, W / H, 0.05, 400);

// ---------- textures ----------
const loader = new THREE.TextureLoader();
const textures = await Promise.all(S.cards.map(c => new Promise((res, rej) => loader.load(c.tex, t => res(prepareTexture(t, renderer)), undefined, () => rej(new Error(`card texture failed to load: ${c.id} (${c.tex})`))))))
  .catch(e => fail(e.message));
const N = S.cards.length;
if (!N) fail('scene has no cards');
const aspects = S.cards.map((c, i) => c.aspect || textures[i].image.width / textures[i].image.height);
const A = Math.max(...aspects);

stage('meshes');
// ---------- parameters the timeline animates ----------
const look = { fog: 0.35, shading: 0.35, backShade: 0.25, cornerRadius: 0.035, faceCamera: 'flip', shadow: 'none', shadowStrength: 0.35, ...S.look };
const P = {
  rig: rigParams(S.rig),
  camera: { dolly: 0, orbit: 0, elevate: 0, truck: 0, pedestal: 0, roll: 0, fov: S.camera.fov || 35, ...S.camera.animate },
  look: { fog: look.fog, shading: look.shading, exposure: 1, groundX: 0, groundY: 0 },
};
const rig = RIGS[P.rig.type];
const ctxAt = u => ({ N, A, aspects, u });

// ---------- meshes ----------
const group = new THREE.Group();
scene.add(group);
const initial = poses({ ...P.rig, build: 1, idle: 0 }, N, ctxAt(0));
const meshes = initial.map((q, j) => {
  const size = q.size || [aspects[q.tex], 1];
  const geo = new THREE.PlaneGeometry(size[0], size[1], 32, 1);
  const mat = cardMaterial(textures[q.tex], look);
  mat.uniforms.uSize.value.set(size[0], size[1]);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { j, tex: q.tex, size };
  if (look.shadow === 'soft') {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(size[0] + 0.36, size[1] + 0.36), shadowMaterial(look));
    sh.material.uniforms.uSize.value.set(size[0], size[1]);
    sh.position.set(0.04, -0.07, -0.05);
    sh.renderOrder = -1;
    mesh.add(sh);
    mesh.userData.shadow = sh;
  }
  group.add(mesh);
  return mesh;
});

// Grid lines (grid rig): thin lines in the brand's line colour that draw on with `draw`.
let lines = null;
if (rig.lines) {
  const segs = rig.lines(P.rig, N, ctxAt(0));
  if (segs.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(segs.length * 6), 3));
    lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(look.lineColor || S.look.text || '#888888'), transparent: true, opacity: 0.6 }));
    lines.userData.segs = segs;
    group.add(lines);
  }
}

// ---------- camera ----------
// The base view comes from a preset and is fitted to the rig's extent, so any card count frames well.
function bounds() {
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  initial.forEach((q, j) => {
    const r = Math.hypot(...(meshes[j].userData.size)) / 2 * (q.scale || 1);
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q.pos[i] - r); hi[i] = Math.max(hi[i], q.pos[i] + r); }
  });
  return { lo, hi, c: lo.map((v, i) => (v + hi[i]) / 2) };
}
const PRESET_DIR = {
  front: [0, 0, 1], below: [0, -0.62, 1], above: [0, 0.62, 1], 'three-quarter': [Math.sin(35 * D2R), 0.16, Math.cos(35 * D2R)],
  side: [Math.sin(62 * D2R), 0.05, Math.cos(62 * D2R)],
};
function groupMatrix() {
  const g = new THREE.Object3D();
  g.position.y = P.rig.lift;
  g.rotation.set(P.rig.tilt * D2R, P.rig.yaw * D2R, P.rig.roll * D2R, 'YXZ');
  g.updateMatrix();
  return g.matrix;
}
const base = (() => {
  const c = S.camera, preset = c.preset || 'front';
  const b = bounds(), gm = groupMatrix();
  const center = new THREE.Vector3(...(c.target || b.c)).applyMatrix4(gm);
  if (preset === 'inside-axis') {
    // offsetR: an offset in units of the rig's radius (how far the cards sit from the axis).
    const R0 = Math.max(...initial.map(q => Math.hypot(q.pos[0], q.pos[2])));
    const rel = (c.offsetR || [0, 0, 0]).map(v => v * R0);
    const pos = new THREE.Vector3(...(c.position || [0, 0, 0])).add(new THREE.Vector3(...rel)).applyMatrix4(gm);
    return { pos, target: pos.clone().add(new THREE.Vector3(0, 0, -1)), center: pos.clone().add(new THREE.Vector3(0, 0, -1)) };
  }
  if (c.position) return { pos: new THREE.Vector3(...c.position), target: center, center };
  const dir = new THREE.Vector3(...(PRESET_DIR[preset] || PRESET_DIR.front)).normalize();
  // Fit: the distance at which every corner of the (transformed) bounds fits the frame × margin.
  const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(up, dir).normalize(), camUp = new THREE.Vector3().crossVectors(dir, right);
  const vf = (c.fov || 35) * D2R / 2, hf = Math.atan(Math.tan(vf) * W / H), m = c.fit ?? 1.0;
  let dist = 0;
  for (const x of [b.lo[0], b.hi[0]]) for (const y of [b.lo[1], b.hi[1]]) for (const z of [b.lo[2], b.hi[2]]) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(gm).sub(center);
    const toward = v.dot(dir);
    dist = Math.max(dist, toward + Math.abs(v.dot(right)) * m / Math.tan(hf), toward + Math.abs(v.dot(camUp)) * m / Math.tan(vf));
  }
  dist *= c.distance ?? 1;
  return { pos: center.clone().add(dir.multiplyScalar(dist)), target: center, center };
})();

function placeCamera() {
  const c = P.camera;
  const target = base.target.clone(), off = base.pos.clone().sub(target);
  off.applyAxisAngle(new THREE.Vector3(0, 1, 0), c.orbit * D2R);
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), off).normalize();
  if (right.lengthSq() > 0) off.applyAxisAngle(right, -c.elevate * D2R);
  const pos = target.clone().add(off.multiplyScalar(1 - c.dolly));
  // inside-axis: dolly moves forward along the view instead of toward a target the camera sits on.
  if (S.camera.preset === 'inside-axis') { const fwd = target.clone().sub(base.pos).normalize(); pos.copy(base.pos).addScaledVector(fwd, c.dolly * 4); target.copy(pos).add(fwd); }
  const camRight = new THREE.Vector3().crossVectors(target.clone().sub(pos), new THREE.Vector3(0, 1, 0)).normalize();
  pos.addScaledVector(camRight, c.truck).add(new THREE.Vector3(0, c.pedestal, 0));
  target.addScaledVector(camRight, c.truck).add(new THREE.Vector3(0, c.pedestal, 0));
  camera.position.copy(pos);
  camera.up.set(Math.sin(c.roll * D2R), Math.cos(c.roll * D2R), 0);
  camera.lookAt(target);
  if (camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
}

// Fog range follows the view: starts just behind the rig centre, fully faded at twice the rig depth.
const dist0 = base.pos.distanceTo(base.center);
const b0 = bounds(), depth0 = Math.max(1, ...b0.hi.map((v, i) => v - b0.lo[i]));

// ---------- type ----------
const worldPerPx = 2 * dist0 * Math.tan((S.camera.fov || 35) * D2R / 2) / H;
stage('fonts');
await document.fonts.ready;
stage('type');
const rigRadius = Math.max(0.5, ...initial.map(q => Math.hypot(q.pos[0] - base.center.x, q.pos[1] - base.center.y, q.pos[2] - base.center.z)));
const type = await buildType(S.type, { scene, W, H, safe: S.canvas.safe, worldPerPx, rigRadius, center: [base.center.x, base.center.y, base.center.z] });

// ---------- one frame ----------
const tmp = new THREE.Object3D();
function frame() {
  const t = tl.time(), u = D ? Math.min(1, t / D) : 0;
  group.position.set(0, P.rig.lift, 0);
  group.rotation.set(P.rig.tilt * D2R, P.rig.yaw * D2R, P.rig.roll * D2R, 'YXZ');
  placeCamera();
  group.updateMatrixWorld(true);
  const list = poses(P.rig, N, ctxAt(u));
  const fogNear = dist0 - depth0 * 0.15, fogFar = dist0 + depth0 * 1.1;
  list.forEach((q, j) => {
    const m = meshes[j];
    if (!m) return;
    m.position.set(...q.pos);
    if (q.billboard) {
      const inv = new THREE.Quaternion(); group.getWorldQuaternion(inv).invert();
      m.quaternion.copy(inv.multiply(camera.quaternion));
    } else if (q.basis) {
      tmp.matrix.makeBasis(new THREE.Vector3(...q.basis.x), new THREE.Vector3(...q.basis.y), new THREE.Vector3(...q.basis.z));
      m.quaternion.setFromRotationMatrix(tmp.matrix);
    } else m.rotation.set(q.rot[0], q.rot[1], q.rot[2], 'YXZ');
    m.scale.setScalar(q.scale);
    const op = Math.max(0, Math.min(1, q.opacity));
    m.visible = op > 0.002;
    const U = m.material.uniforms;
    U.uOpacity.value = op; U.uBend.value = q.bend || 0;
    U.uShading.value = P.look.shading; U.uFog.value = P.look.fog;
    U.uFogNear.value = fogNear; U.uFogFar.value = fogFar;
    if (q.uv) U.uRect.value.set(...q.uv);
    m.material.transparent = op < 0.999;
    m.material.depthWrite = op > 0.5;
    if (m.userData.shadow) m.userData.shadow.material.uniforms.uOpacity.value = op;
  });
  if (lines) {
    const draw = typeof P.rig.draw === 'number' ? P.rig.draw : 1, arr = lines.geometry.attributes.position.array;
    lines.userData.segs.forEach((s, i) => {
      const k = Math.max(0, Math.min(1, draw * 1.6 - i / lines.userData.segs.length * 0.6));
      arr.set([s[0], s[1], s[2], s[0] + (s[3] - s[0]) * k, s[1] + (s[4] - s[1]) * k, s[2] + (s[5] - s[2]) * k], i * 6);
    });
    lines.geometry.attributes.position.needsUpdate = true;
  }
  if (look.dots) document.body.style.backgroundPosition = `${look.dots.offset + P.look.groundX}px ${look.dots.offset + P.look.groundY}px`;
  type.update();
  renderer.render(scene, camera);
}

stage('timeline');
// ---------- timeline ----------
const targets = { rig: P.rig, camera: P.camera, look: P.look };
const tl = gsap.timeline({ paused: true, onUpdate: frame });
for (const e of S.timeline) {
  const [root, key] = e.to.split('.');
  const obj = targets[root];
  if (!obj || !(key in obj)) fail(`timeline target "${e.to}" is not an animatable parameter`);
  const to = { [key]: e.value, duration: e.dur, ease: e.ease || 'none', immediateRender: false };
  if (e.from !== undefined && e.from !== null) tl.fromTo(obj, { [key]: e.from }, to, e.at);
  else tl.to(obj, to, e.at);
}
type.addTweens(tl);
tl.set({}, {}, D);  // the timeline is exactly the scene's length
if (S.custom) {
  const mod = await import(S.custom);
  mod.default({ THREE, scene, camera, renderer, P, tl, meshes, group, frame });
}
// Initialise every tween's start values in order, then rest at 0.
tl.progress(1, true).progress(0, true);
frame();

// ---------- renderer contract ----------
const vproj = new THREE.Vector3();
window.__scene = { tl, frame };
window.__typeVisible = v => { type.setVisible(v); frame(); };
window.__report = () => {
  const cards = meshes.map(m => {
    if (!m.visible) return { j: m.userData.j, tex: m.userData.tex, opacity: 0 };
    m.updateMatrixWorld();
    const [w, h] = m.userData.size;
    // Corners in view space first: a corner behind the camera can't be projected meaningfully.
    let behind = false;
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => {
      vproj.set(x, y, 0).applyMatrix4(m.matrixWorld);
      if (vproj.clone().applyMatrix4(camera.matrixWorldInverse).z > -camera.near * 2) behind = true;
      vproj.project(camera);
      return [(vproj.x + 1) / 2 * W, (1 - vproj.y) / 2 * H];
    });
    const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
    const offscreen = Math.max(...xs) < 0 || Math.min(...xs) > W || Math.max(...ys) < 0 || Math.min(...ys) > H;
    const centre = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(m.matrixWorld);
    const toCam = camera.position.clone().sub(centre).normalize();
    const depth = centre.clone().applyMatrix4(camera.matrixWorldInverse).z;
    const projH = Math.max(Math.hypot(corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]), Math.hypot(corners[2][0] - corners[1][0], corners[2][1] - corners[1][1]));
    const uv = m.material.uniforms.uRect.value;
    const texH = textures[m.userData.tex].image.height * (uv.w - uv.y);
    return {
      j: m.userData.j, tex: m.userData.tex, opacity: m.material.uniforms.uOpacity.value,
      quad: corners, behindCamera: behind || offscreen,
      facing: normal.dot(toCam), depth, projH, texH, shading: P.look.shading,
    };
  });
  return { t: tl.time(), cards, type: type.report(camera), faceCamera: look.faceCamera };
};
window.__ready = true;
