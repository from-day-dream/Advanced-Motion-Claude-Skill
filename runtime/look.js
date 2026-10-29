// The look of the cards (references/look.md). Unlit, not PBR: a card shows its texture's exact colours,
// darkened only by a cheap angle term as it turns away (most of the "3D" feel), then faded into the
// background with depth. Colour is handled in sRGB end to end (no colour management), so brand hexes
// come out as they went in.
import * as THREE from 'three';

const VERT = /* glsl */`
uniform float uBend;
varying vec2 vUv;
varying vec3 vViewPos;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vec3 p = position;
  vec3 n = vec3(0.0, 0.0, 1.0);
  // Bend the plane around a vertical axis: curvature uBend = 1 / radius; positive brings the edges toward +z.
  if (abs(uBend) > 1e-5) {
    float R = 1.0 / uBend;
    float th = p.x / R;
    p.x = R * sin(th);
    p.z = R * (1.0 - cos(th));
    n = vec3(-sin(th), 0.0, cos(th));
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vViewPos = mv.xyz;
  vNormal = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec4 uRect;
uniform vec2 uSize;
uniform float uRadius;
uniform float uOpacity;
uniform float uShading;
uniform float uBackShade;
uniform int uFace;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFog;
varying vec2 vUv;
varying vec3 vViewPos;
varying vec3 vNormal;
float roundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 uv = vUv;
  vec3 n = normalize(vNormal);
  float back = 0.0;
  if (!gl_FrontFacing) {
    if (uFace == 1) discard;          // hide: backs are never shown
    if (uFace == 0) uv.x = 1.0 - uv.x; // flip: the back shows the card the right way round
    n = -n;
    back = 1.0;
  }
  // Rounded corners as coverage, so MSAA alpha-to-coverage smooths the edge without sorting problems.
  vec2 q = (uv - 0.5) * uSize;
  float d = roundBox(q, uSize * 0.5, min(uRadius, min(uSize.x, uSize.y) * 0.5));
  float aa = fwidth(d);
  float cover = 1.0 - smoothstep(-aa, aa, d);
  vec4 c = texture2D(uMap, mix(uRect.xy, uRect.zw, uv));
  float ndv = abs(dot(n, normalize(-vViewPos)));
  float shade = mix(1.0 - uShading, 1.0, ndv) * mix(1.0, 1.0 - uBackShade, back);
  vec3 col = c.rgb * shade;
  float f = uFog * smoothstep(uFogNear, uFogFar, -vViewPos.z);
  col = mix(col, uFogColor, f);
  float a = c.a * cover * uOpacity;
  if (a < 0.003) discard;
  // Premultiplied, like the canvas it composites into; otherwise partly covered edges come out too bright.
  gl_FragColor = vec4(col * a, a);
}`;

const FACE = { flip: 0, hide: 1, none: 2 };

export function cardMaterial(tex, look) {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uMap: { value: tex }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uSize: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: look.cornerRadius }, uOpacity: { value: 1 }, uBend: { value: 0 },
      uShading: { value: look.shading }, uBackShade: { value: look.backShade }, uFace: { value: FACE[look.faceCamera] ?? 0 },
      uFogColor: { value: new THREE.Color(look.background) }, uFogNear: { value: 1 }, uFogFar: { value: 10 }, uFog: { value: look.fog },
    },
    // Double-sided always: the shader decides what a back face shows (flipped, hidden or mirrored).
    side: THREE.DoubleSide,
    transparent: false, alphaToCoverage: true, premultipliedAlpha: true,
  });
  return m;
}

// A soft, dark rounded rect behind a card: contact darkening for scatter and stack.
const SHADOW_FRAG = /* glsl */`
uniform vec2 uSize;
uniform float uRadius;
uniform float uSoft;
uniform float uStrength;
uniform float uOpacity;
varying vec2 vUv;
float roundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 q = (vUv - 0.5) * (uSize + 2.0 * uSoft);
  float d = roundBox(q, uSize * 0.5, uRadius);
  float a = (1.0 - smoothstep(-uSoft * 0.3, uSoft, d)) * uStrength * uOpacity;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;

export function shadowMaterial(look) {
  return new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: SHADOW_FRAG,
    uniforms: { uSize: { value: new THREE.Vector2(1, 1) }, uRadius: { value: look.cornerRadius }, uSoft: { value: 0.18 }, uStrength: { value: look.shadowStrength }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, premultipliedAlpha: true,
  });
}

export function prepareTexture(tex, renderer) {
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}
