# Advanced Motion Skill — Execution Strategy

Oct 28, 2026 · @Subin K

## Goal and scope

Build a sibling skill to Slide Motion that renders one continuous 3D scene: a set of cards (posters, deck pages, photos, carousel slides) arranged and animated in real depth, paired with one line or a few words of large type. No scene-to-scene handovers in v1.

What the four references actually are, stripped of styling:

| Reference | Arrangement | What moves | Type role |
| --- | --- | --- | --- |
| Jitter "Showcase 11" | Loose scatter of tilted cards + one 3D object (hand) in shallow depth | Cards drift and rotate slowly, camera dollies | Huge word sits *behind* the cards, partly occluded |
| Noteform deck | Cards placed along a curved spine (ribbon/helix), each tilted to the curve | Cards travel along the path, like scrolling a 3D feed | Type lives on the cards; no overlay |
| Colour stack | Deck stacked in Z, seen from below in strong perspective | Cards peel/fly off to reveal the next; one image sliced across two cards | None, or one line |
| VK Fest lineup | Ring of curved posters (cylinder), camera near the axis | Ring rotates continuously, loopable | Type on posters only |

The common denominator is small: **N textured planes + a parametric layout + a camera + optional big type**. The skill should be built around that, not around four bespoke templates.

**In scope for v1:** single scene, 5–20 s, 9:16 default (reuse Slide Motion's ratios and safe zones), silent MP4, seamless-loop option, brand kit + `motion.json` shared with Slide Motion / Carousel Studio.

**Out of scope for v1:** multi-scene sequences, cloth or physics, 3D hero objects (the hand), video textures. All listed as later phases.

## Core decision: Three.js, not CSS 3D

Use Three.js (WebGL) for the card scene, inside the same Playwright + GSAP + ffmpeg pipeline Slide Motion already has. CSS 3D looks like the cheaper path because it reuses everything, but it fails on exactly what makes these references look premium.

| Need | CSS 3D (`preserve-3d`) | Three.js |
| --- | --- | --- |
| Curved posters (VK ring) | No. A plane can't bend; faking it with vertical slices shows seams | Bend in the vertex shader or `CylinderGeometry` segment |
| Correct depth sorting when cards cross | Unreliable in Chromium once planes intersect; flicker | Z-buffer, solved |
| Depth fade, fog, depth of field | Fake with filters per element, expensive and wrong | Fog + one post pass |
| Soft shadows / contact darkening | Box-shadow only, ignores 3D | Shadow-catcher plane or baked blob shadows |
| Motion blur | No | Sub-frame accumulation (deterministic) |
| Text crispness on cards | Best (live DOM) | Good if cards are rasterised at 2× and mip-mapped |
| 3D objects later (hand) | No | GLTF loader |

**Rule that keeps both worlds:** cards are still designed in HTML (your brand fonts, Carousel Studio layouts), then rasterised to PNG and used as textures. Big type sits in a DOM layer *or* in the scene as SDF text, depending on whether it must be occluded by cards (see Architecture).

**The cost you accept:** WebGL in headless Chromium. Without a GPU it falls back to SwiftShader (software). That is slower but stable and deterministic on one machine. Byte-identical output across different GPUs is not guaranteed, so Slide Motion's "same input, same bytes" promise weakens to "same machine, same mode". Phase 0 measures this before anything else is built.

## Architecture

The pipeline is Slide Motion's with one new middle: Claude authors `scene.json`, and a fixed runtime turns it into 3D.

&#91;embedded content: advanced-motion pipeline · 5 steps, 3 composition layers\]

The composition is three stacked layers so big type can sit behind or in front of the cards cheaply in DOM. Only when type must interleave with cards in depth (some in front, some behind) does it move into the WebGL layer as SDF text.

**Components to build:**

- **`runtime/scene.js`** — the engine. Sets up a transparent WebGL renderer, builds one mesh per card (rounded rect, segmented so it can bend), applies the rig, binds rig/camera/type params to the GSAP master timeline, exposes `window.__seek(t)` and `window.__report()` (projected quads per frame for checks).
- **`runtime/rigs/*.js`** — one pure function per rig. No state, no randomness except the seeded PRNG passed in.
- **`runtime/look.js`** — angle shading shader, fog, shadow catcher, DoF pass, sub-frame accumulation.
- **`runtime/type.js`** — DOM type enters (mask, stagger, scale) and troika SDF text for in-scene type, both driven by the same timeline.
- **`scripts/cards.mjs`** — rasteriser and cache. Resolution = card's max projected size at any frame × 2, capped at 2048 px.
- **`scripts/render.mjs`** — extend Slide Motion's: launch Chromium with WebGL flags, wait for textures + fonts, seek, screenshot full page (captures all three layers), optional sub-frame accumulation, then the existing ffmpeg path.
- **`scripts/reference.mjs`** — frames from a reference video onto a contact sheet.

## Rig catalogue

A **rig** is a pure function `(params, i, N) → {position, rotation, scale, bend, opacity}` for card *i* of *N*. Animation is GSAP tweening a handful of rig params on the master timeline (`ring.angle`, `spine.offset`, `stack.peel`). This is the single most important design choice: Claude animates 2–4 numbers, not 20 cards × 9 channels, so output stays coherent and loops are exact.

| Rig | Modes | Key params (animatable) | Loop rule | Templates |
| --- | --- | --- | --- | --- |
| `ring` | cylinder, tunnel | radius, angle, tilt, bend, depth repeat (tunnel), camera inside/outside | `angle` advances 360°/N × k; tunnel advances one ring spacing | `poster-ring`, `card-tunnel` |
| `spine` | path, spiral | spline points, offset along path, spacing, twist, bank, scale ramp | `offset` advances one spacing | `ribbon-feed`, `vortex-trail` |
| `stack` | peel, cycle, corridor | depth gap, x/y step, peel (0→1 per card), translucency, viewing angle | Front card recycles to back | `peel-stack`, `deck-cycle`, `depth-corridor` |
| `scatter` | — | seed (fixed), spread box, drift amplitude/phase, rotation range | Drift uses sin/cos of loop phase | `float-showcase` |
| `grid` | — | columns, rows, cell slots, z-drift per slot, grid-line draw | Drift uses loop phase | `grid-board` |
| `sphere` | — | radius, rotation (yaw/pitch), face mode (billboard/tangent), density | Yaw advances 360°/k | `orbit-sphere` |
| `wall` | — | rows, cols, plane tilt, curvature, scroll vector | Scroll one cell | `tilted-wall` |
| `arc` | flow, fan | spread angle, pivot, focus index, side angle, open (0→1) | Flow steps one item; fan none | `cover-flow`, `fan-spread` |
| `mosaic` | — | tile grid, explode (0→1), depth spread, rotation spread | explode 0 → 1 → 0 | `exploded-mosaic` |

Shared modifiers any rig can take: **slice** (one image spread across consecutive cards, as in the stack reference), **face-camera** clamp (never show a mirrored back), **depth fade**, and **idle drift** (small noise so nothing is ever still, which keeps Slide Motion's "never still" check passing).

`scatter` uses a seeded PRNG inside the runtime, not `Math.random`, so the determinism check stays valid.

## Motion templates

Ship 14 base templates. A template is a **choreography preset on top of a rig**: rig defaults, camera move, beat skeleton, type role and the param ranges Claude may tune. It holds no colours, fonts or curves; those still come from the brand kit and `motion.json`, so Slide Motion's "no built-in style" rule survives. Nine come from your references, five fill the gaps they leave.

| # | Template | Rig | Source | Motion in one line | Type role | Cards | Loop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `float-showcase` | scatter | Jitter | Shallow-depth cards drift and turn; camera creeps in | Behind, partly occluded | 4–7 | Yes |
| 2 | `ribbon-feed` | spine | Noteform | Pages travel up an S-curve, banking as they turn | On cards only | 5–10 | Yes |
| 3 | `peel-stack` | stack (peel) | Colour stack | Seen from below; front card lifts away, next is revealed | One line, front | 6–12 | Yes |
| 4 | `poster-ring` | ring | VK Fest | Bent posters on a cylinder, camera near the axis, constant spin | On posters only | 8–16 | Yes |
| 5 | `grid-board` | grid | Visual Board | Editorial grid lines; images pop in at intersections and drift in Z | Centre, 1–2 lines, front | 4–6 | Yes |
| 6 | `orbit-sphere` | sphere | Create | Cards on a sphere shell orbit the word, passing in front and behind | Centre, interleaved | 15–30 | Yes |
| 7 | `vortex-trail` | spine (spiral + scale ramp) | Cursor trail | Images stream out of a point, growing as they spiral toward camera | Centre, interleaved | 20–40 | Yes |
| 8 | `depth-corridor` | stack (corridor) | Unveil | Parallel planes seen at 3/4; camera trucks along, far planes frost | Side caption, front | 8–14 | Yes |
| 9 | `deck-cycle` | stack (cycle) | Creator cards | Cascaded deck; front card swipes off and tucks to the back | Above deck, front | 4–6 | Yes |
| 10 | `cover-flow` | arc (flow) | New | Row of cards, centre flat, sides angled; steps item to item with holds | Below, changes per item | 5–9 | Optional |
| 11 | `fan-spread` | arc (fan) | New | Cards fan open from a pivot, settle, breathe | Above, front | 3–7 | No |
| 12 | `tilted-wall` | wall | New | Large grid on a plane tilted \~40°, scrolling diagonally forever | Over, front | 20–40 | Yes |
| 13 | `card-tunnel` | ring (tunnel) | New | Cards line a tube; camera flies forward through it to the word | Ends in view, front | 20+ | Optional |
| 14 | `exploded-mosaic` | mosaic | New | One image split into tiles separates into depth, rotates, reassembles | One line, front | 1 image → 6–16 tiles | Yes |

This needs five rigs beyond the original four: `grid`, `sphere`, `wall`, `arc` (flow and fan modes) and `mosaic`. `tunnel` is a `ring` extruded along Z, and `vortex-trail` is a `spine` with a spiral path and scale ramp, so they cost a mode, not a rig.

### Template file format

Each template is a folder: `templates/motion/<name>/template.json`, a neutral `specimen.mp4` rendered with a grey placeholder brand, and a short `notes.md` (what it's for, what breaks it).

```json
{
  "name": "poster-ring",
  "rig": { "type": "ring", "radius": 1.8, "tilt": -6, "bend": true },
  "ranges": { "rig.radius": [1.2, 2.6], "rig.tilt": [-12, 12], "turns": [0.25, 1] },
  "camera": { "preset": "inside-axis", "dolly": [0, -0.2] },
  "type": { "roles": ["none", "front"], "maxWords": 4 },
  "cards": { "count": [8, 16], "aspect": ["4:5", "3:4"] },
  "beats": [
    { "at": 0.0, "dur": 0.12, "name": "build-in", "ease": "motion:enter" },
    { "at": 0.0, "dur": 1.0,  "name": "spin", "to": "rig.angle", "value": "turns*360", "ease": "linear" }
  ],
  "duration": { "default": 10, "range": [6, 15] },
  "loop": true,
  "fits": ["lineup", "product-range", "poster-series"],
  "avoid": ["dense text on cards", "fewer than 8 items"]
}
```

Beat times are fractions of the duration, so one template scales from 6 s to 15 s. In `scene.json` Claude writes `"template": "poster-ring"` plus overrides; the runtime merges them and the report warns on any override outside `ranges`. A scene with no template is still allowed, but the critique step must say why none fitted.

### How Claude picks one

In the plan, Claude states the content shape first, then the template, in this order:

1. **How many items?** 1 image → `exploded-mosaic` · 3–7 → `fan-spread`, `deck-cycle`, `float-showcase`, `grid-board` · 8–16 → `poster-ring`, `peel-stack`, `depth-corridor`, `cover-flow`, `ribbon-feed` · 20+ → `orbit-sphere`, `vortex-trail`, `tilted-wall`, `card-tunnel`.
2. **What are they?** Pages with text → `ribbon-feed`, `cover-flow`, `depth-corridor` (cards stay readable). Posters → `poster-ring`. Photos → the 20+ group or `float-showcase`. UI cards/profiles → `deck-cycle`.
3. **Is there a message line?** If the big line is the point, prefer templates whose type role is centre or interleaved (`orbit-sphere`, `vortex-trail`, `grid-board`, `float-showcase`).
4. **Reference given?** The reference intake names the nearest template; Claude starts there and records the overrides it needed.

The user can always name one directly: `/advanced-motion poster-ring from my last carousel`.

## Skill workflow

Claude writes a declarative `scene.json`, not raw Three.js. Free-form WebGL per video would give the same variance and bugs you see now, only harder to debug. The runtime interprets the spec; a small `custom.js` hook exists for the rare effect the spec can't express, and the critique step flags when it was used.

1. **Ingest** — reuse Slide Motion's `ingest.mjs` and image library as-is. Add one input type: a Carousel Studio carousel becomes a card set directly (each slide = one card).
2. **Reference intake (optional)** — if the user gives a reference video, `ffmpeg` pulls 8 frames onto a contact sheet. Claude names the rig, camera move, type role and pace it sees, and writes that into the plan. Claude can't watch video; frames are the honest substitute.
3. **Plan** (`meta.json → plan`) — pick the rig from content shape (count of items, are they pages, posters or one hero), card set and order, the one line of type and its role (behind / in front / on a card), camera move, beats, loop yes/no.
4. **Rasterise cards** — each card is an HTML file at its real aspect, rendered to PNG at 2× its largest on-screen size. Cached by content hash.
5. **Compose** — write `scene.json`. Beats are a short list, typically: build-in (0–1.5 s), travel (the rig param runs), read hold for the type, settle or loop-close.
6. **Render + report** — draft (540p, no blur) first, then final.
7. **Critique** — storyboard of 6 sampled frames + the report; fix and re-render.

### `scene.json` shape

```json
{
  "canvas": { "ratio": "9:16", "fps": 30, "duration": 10, "loop": true },
  "look":   { "background": "token:bg", "fog": 0.35, "dof": { "focus": "card:3", "amount": 0.4 }, "shadow": "soft", "shading": "angle", "cornerRadius": 24, "motionBlur": 8 },
  "cards":  [ { "id": "c1", "src": "cards/c1.html", "aspect": "4:5" } ],
  "rig":    { "type": "ring", "radius": 1.8, "tilt": -6, "bend": true },
  "camera": { "fov": 35, "position": [0, 0.2, 0], "target": [0, 0, -1] },
  "type":   [ { "text": "Lineup 2026", "layer": "behind", "style": "token:display", "enter": "mask-up", "hold": [1.2, 6] } ],
  "timeline": [
    { "at": 0,   "to": "rig.angle",  "from": 0, "value": 90, "dur": 10, "ease": "motion:move" },
    { "at": 0,   "to": "camera.dolly", "value": -0.3, "dur": 10, "ease": "motion:ambient" }
  ]
}
```

Eases resolve through the brand's `motion.json` exactly like Slide Motion, so both skills move the same way for the same brand.

## Render checks and quality passes

Keep every Slide Motion check that still applies (never still, reading time, safe zones, fonts, contrast, determinism, length). Add the checks that only exist in 3D; the runtime can compute them exactly because it knows every card's projected quad per frame.

| Check | How | Severity |
| --- | --- | --- |
| Type occluded at its read hold | Project card quads, intersect with type bbox; > 15% overlap during hold | Error |
| Card text too small | Card's projected height × its smallest font ratio < 22 px at a read moment | Warning |
| Soft texture | Projected px > 1.0× texture px on any card in focus | Warning |
| Mirrored card | Card normal faces away from camera while opacity > 0.2 | Error |
| Strobing | Per-card screen velocity > \~1/3 frame width per frame without motion blur | Warning |
| Loop seam | Frame 0 vs frame N pixel diff above threshold when `loop: true` | Error |
| Off-brand colour | Shading darkens card fills beyond ΔE limit vs token colour | Warning |

**Quality passes, in the order they matter for the look:**

1. **Unlit + angle shading.** Not PBR. Cards keep exact brand colours; a cheap normal·view term darkens cards as they turn away. This is most of the "3D" feel in all four references.
2. **Rounded corners + 2× textures with mipmaps + anisotropy.** Kills the shimmer that makes WebGL cards look cheap.
3. **Soft contact shadow / depth fade.** Shadow-catcher plane for `scatter` and `stack`; fog for `ring` and `spine`.
4. **Motion blur by sub-frame accumulation** (e.g. 8 sub-samples, 180° shutter). Final render only. Costs 8× render time, worth it for `ring` rotation.
5. **Depth of field.** Optional, subtle. Easy to overdo; off by default.

## Phased build plan

Hand Claude Code one phase at a time. Each phase ends in a render you look at; don't let it start the next phase until the gate passes. Phases 0–4 are the real risk; 5–9 are mostly writing.

1. **Phase 0 — WebGL render spike.** One HTML page: 12 textured planes on a rotating ring at 1080×1920, seeked frame by frame via Playwright, piped to ffmpeg. Measure SwiftShader vs GPU (`--use-angle=swiftshader` vs default) for speed and whether two runs produce identical frames. Also time a 40-card scene with 512 px textures, since four templates need 20–40 cards.
   - **Gate:** ≤ 1.5 s/frame on SwiftShader at 1080p, identical frames across two runs on one machine. If it fails, switch default to GPU mode and drop the cross-run byte check to a pixel-diff tolerance.
2. **Phase 1 — Scaffold.** New repo `advanced-motion` (or your name), plugin manifest, `SKILL.md` stub. Copy the shared libs the same way Slide Motion copies Carousel Studio's (`workspace`, `render-core`, `serve`, `fonts`, `motion.mjs`). Same workspace folder, new `scenes/<date>-<topic>-<ratio>/` output.
3. **Phase 2 — Card rasteriser.** `scripts/cards.mjs`: HTML card → PNG at computed resolution, content-hash cache, carousel-slide import, image-only cards, brand-font check. **Gate:** a contact sheet of 12 cards, text sharp at 100%.
4. **Phase 3 — Scene runtime** (`runtime/scene.js`, loaded by the composition): renderer, camera, card mesh (rounded rect, bend uniform), angle shading, fog, the `window.__seek(t)` contract, GSAP timeline bound to rig params, seeded PRNG, and the template loader (merge `template.json` + overrides, range check). **Gate:** `scene.json` with a static 3×3 layout renders correctly through `render.mjs`.
5. **Phase 4 — Rigs, then templates, in batches.** Each rig lands with a test that its output at t=0 equals t=loop; then its templates land with `specimen.mp4` and `notes.md`. The order is chosen so each batch proves something new:
   - **Batch A** (core depth): `ring`, `stack` → `poster-ring`, `peel-stack`, `deck-cycle`, `depth-corridor`.
   - **Batch B** (paths + scatter): `spine`, `scatter` → `ribbon-feed`, `float-showcase`.
   - **Batch C** (flat-ish, cheap wins): `grid`, `arc` → `grid-board`, `cover-flow`, `fan-spread`.
   - **Batch D** (many cards; needs Phase 5's in-scene type first): `sphere`, `wall`, spiral and tunnel modes → `orbit-sphere`, `vortex-trail`, `tilted-wall`, `card-tunnel`.
   - **Batch E**: `mosaic` → `exploded-mosaic`.
   - **Gate per template:** its 6 s specimen, viewed next to the reference frame it came from, is one you'd accept as a first draft.
6. **Phase 5 — Type layer.** DOM layers (behind/front) plus SDF in-scene text (troika-three-text) for the interleaved case; enters: mask-up, per-char stagger, scale-settle, depth push. Brand display font loaded as SDF. Build it between Batch C and Batch D.
7. **Phase 6 — Quality passes:** shadows, sub-frame motion blur, DoF, anisotropy. Toggle via `look`; `--draft` disables all. Re-render all specimens after this phase.
8. **Phase 7 — Report checks** from the table above, plus storyboard, loop-seam image and template range warnings.
9. **Phase 8 — Skill text:** `SKILL.md`, `references/templates.md` (the picking order and a row per template), `references/rigs.md`, `references/scene-spec.md`, `references/look.md`, `references/type.md`, `references/critique.md`, reference-intake procedure.
10. **Phase 9 — Examples + gallery.** Four full example projects with your own brand content (not the references' artwork), plus a templates page in the shared gallery that plays every `specimen.mp4`.

Later (v2): new templates captured from your own reference intakes, GLB hero objects (hand) with optional generation via fal, image-sequence textures for pre-baked cloth, handing a finished scene to Slide Motion as one sequence of a longer video.

## Risks and the handoff prompt

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| SwiftShader too slow with blur on | 15 s × 30 fps × 8 sub-frames = 3,600 renders | GPU mode default when available; blur only on final; 540p drafts |
| Output looks "WebGL demo" | Default lighting, aliasing, flat planes | Unlit + angle shading, rounded corners, mipmaps, fog. Judge every rig against its reference at Phase 4 gate |
| Claude over-animates | Many tweens per card = noise | Spec only exposes rig params + camera + type; per-card tweens need `custom.js` and get flagged |
| Cards too small to read | 9:16 frame, 10+ cards in depth | Legibility check + rule: cards carry visuals and 1–3 words; the big line carries the message |
| Scope creep into Slide Motion | Two skills doing sequences | Single scene only; v2 hands scenes to Slide Motion instead of growing transitions here |
| Shared-lib drift | Copies of Carousel Studio libs in three repos | Keep the same "identical copies" list and add a check script that diffs them |

### Prompt to start Claude Code with

```text
Read docs/execution-strategy.md (this document). We are building a new Claude Code skill
"advanced-motion", a sibling of ~/.claude/skills/slide-motion. Reuse its render pipeline
(Playwright seek → ffmpeg), workspace layout, brand kit and motion.json, and copy its
shared libs the same way it copies Carousel Studio's.

Do Phase 0 only. Build the WebGL render spike described there, run both SwiftShader and
GPU modes, and report: seconds per frame at 1080x1920, whether two runs are identical,
and any Chromium flags needed. Do not start Phase 1 until I approve the result.

Constraints for every phase: Three.js for the scene; cards designed as HTML and rasterised
to textures; Claude-authored output is scene.json interpreted by a runtime, not free-form
Three.js; no Math.random, CSS animations, timers or <video> in compositions; every phase
ends with a render I can review.
```

After each gate, the next prompt is just: *"Phase N passed with these notes: … Do Phase N+1."* Export this doc as Markdown into the new repo's `docs/` so Claude Code can read it.
