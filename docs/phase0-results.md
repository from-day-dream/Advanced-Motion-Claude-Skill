# Phase 0 — WebGL render spike: results

2026-10-29 · Windows 11, NVIDIA GeForce RTX 2070 SUPER, Playwright 1.64.1 (Chromium 1248), three 0.180.0, GSAP 3.15.0

## Setup
`spike/ring.html`: N textured 4:5 cards (512 px) on a rotating ring at 1080×1920, a GSAP timeline on `ring.angle`, `window.__scene = { tl }` (Slide Motion's contract). `spike/run.mjs`: seek every frame → PNG screenshot → ffmpeg (libx264), 10 s at 30 fps = 300 frames per run, two runs per variant, a SHA-1 per frame (raw RGB) to compare runs.

## Results (s/frame, run 1 / run 2)

| Mode | WebGL renderer | 12 cards | 40 cards | Two runs identical |
|---|---|---|---|---|
| SwiftShader | ANGLE Vulkan / SwiftShader (Subzero) | 0.086 / 0.082 | 0.083 / 0.081 | Yes, every frame, every pass |
| GPU | ANGLE D3D11 / RTX 2070 SUPER | 0.074 / 0.069 | 0.073 / 0.071 | Yes, every frame, every pass |

**Gate: passed.** ≤ 1.5 s/frame (actual ≈ 0.08, ~18× headroom) and identical frames across runs on one machine, in both modes.

## Findings
1. **SwiftShader is as fast as GPU here.** About 70 ms of each frame is Playwright's screenshot and PNG encode, not WebGL. Card count (12 → 40) doesn't change the time. Estimated cost of an 8-sample motion-blur final: ~0.6 s/frame, so ~4.5 min for 15 s at 30 fps.
2. **Determinism holds per mode, not across modes.** The same frame from SwiftShader and GPU differs (4.7% of pixels, max channel diff 46: antialiasing and texture filtering). The render report must record the GL mode, and the determinism check compares runs in the same mode only.
3. **GPU mode had one crash in 10 runs** ("Target page, context or browser has been closed" mid-render); 9 runs were clean. SwiftShader had none in 6 runs.

## Recommendation (changes the strategy's fallback)
- **Default to SwiftShader.** It's the same speed, passes the gate, runs on any machine (no GPU needed), and had no crashes.
- Offer `--gl gpu` as an option for heavy scenes later (blur + DoF + 2048 px textures), if those make SwiftShader slow. Re-measure in Phase 6.
- Keep the byte-identical determinism check, per mode.

## Chromium flags
- **SwiftShader:** `--use-angle=swiftshader --enable-unsafe-swiftshader`, with the default headless shell.
- **GPU:** `channel: 'chromium'` (new headless; the headless shell has no GPU), `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`. (`--enable-unsafe-webgpu` in `run.mjs` isn't needed.) On other platforms `d3d11` becomes `metal` (macOS) or `vulkan`/`gl` (Linux).
- Renderer settings: `preserveDrawingBuffer: true`, `setPixelRatio(1)`, `outputColorSpace = SRGBColorSpace`.

## Pitfalls hit (carry into Phase 3)
- **Seek must return nothing.** `page.evaluate(t => window.__scene.tl.seek(t))` returns the GSAP timeline, which Playwright tries to serialise and never finishes; it looked like a GL hang in every mode. Use `t => { window.__scene.tl.seek(t, false); }`, as Slide Motion does.
- **Module scripts and import maps need http, not `file://`.** The runtime is served by a local server (Slide Motion's `serve.mjs` can do it).
- **Wait for textures before the first seek** (`DefaultLoadingManager.onLoad`, then one render).
- **Transparent card corners render black** unless the material is `transparent: true` (or the corners are cut in geometry, as planned with rounded-rect meshes).
- **Back faces show mirrored** with `DoubleSide`: the face-camera clamp and the mirrored-card check are needed.
- **The camera has to follow the rig's size.** With a fixed camera, the 40-card ring put the camera inside the ring. Templates must derive camera distance and fog from rig params.

## Not measured yet
Sub-frame motion blur, DoF, 2048 px textures, in-scene SDF type and DOM layers over the canvas. Re-time in Phases 5–6.

## Files
`spike/ring.html`, `spike/run.mjs`, `spike/diag.mjs`, `spike/out/{swiftshader,gpu}-{12,40}.mp4`, `spike/out/results.json`
