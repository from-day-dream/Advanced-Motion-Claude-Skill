# scene.json

Claude writes a **declarative** `scene.json`; a fixed runtime (`runtime/scene.js`) interprets it. Never free-form Three.js: the spec only exposes rig parameters, the camera, the look and type, so scenes stay coherent and debuggable. `scripts/lib/scene-spec.mjs` merges it with its template and the brand, and the report lists every warning.

```json
{
  "template": "poster-ring",
  "canvas": { "ratio": "9:16", "duration": 12, "loop": true, "fps": 30 },
  "vars": { "turns": 1 },
  "cards": [ { "id": "c01", "src": "cards/carousel/01.png", "html": "cards/carousel/01.html" } ],
  "rig": { "rows": 3 },
  "camera": { "fov": 60 },
  "look": { "fog": 0.4 },
  "type": [ { "id": "line", "text": "Lineup 2026", "layer": "front", "zone": "bottom", "size": "fit", "enter": "mask-up", "exit": { "kind": "fade", "at": 11 } } ],
  "beats": { "spin": { "ease": "motion:move" } },
  "timeline": [ { "at": 0, "dur": 12, "to": "camera.pedestal", "from": 0.1, "value": -0.1, "ease": "motion:ambient", "why": "keeps the frame alive" } ],
  "seed": 4
}
```

## Fields
- **template**: a name from `templates.md`. Supplies the rig, camera, look, beats and ranges.
- **canvas**: `ratio` (default `meta.json → ratio`, else 9:16; any W:H), `duration` in seconds (default: what the user asked for, else the template's default), `loop`, `fps`.
- **cards**: in order. Each needs an `id` and one source (`cards.mjs`):
  - `src: "cards/<id>.html"` with `px: [w, h]`: a card designed in HTML at that size, using the brand's tokens (`var(--brand-…)`, `{{FONT_FACES}}{{TOKENS}}` in the head, like a Carousel Studio slide);
  - `src: "cards/carousel/NN.png"` + `html`: a carousel slide (from-carousel.mjs writes these);
  - `image: "images/x.jpg"`, `aspect: "4:5"`, optional `focus` (`north`, `south`…): a photo, cover-cropped.
  Cards carry visuals and 1–3 words; the big line carries the message. No text baked into photos.
- **rig / camera / look**: merged over the template (`rigs.md`, `look.md`). Values may be expressions over `N`, `D` and `vars` (`"N*0.95"`).
- **type**: the big line(s), `type.md`.
- **beats**: overrides of the template's beats by name, or `null` to drop one.
- **timeline**: extra tweens. Each entry: `at` and `dur` in seconds (`dur` may be `"motion:move"` etc.), `to` (`rig.<param>`, `camera.<param>`, `look.fog|shading`), optional `from`, `value`, `ease`, and **`why`**: what the move does (carries, reveals, connects, emphasises, hands over, keeps the frame alive). An entry without a reason is warned; a move you can't give a reason for is cut.
- **motion**: per-scene adjustments to the brand's motion tokens ("slower this time"), same as `meta.json → motion`.
- **custom**: path to a `custom.js` module for an effect the spec can't express. Its default export gets `{ THREE, scene, camera, P, tl, meshes, group, frame }`. Flagged in the report; say why it was needed. Same determinism rules.
- **seed**: default seed for the rig.

## Eases and timing
`"ease": "motion:<token>"` resolves through the brand's `motion.json → ease` (`enter`, `exit`, `move`, `fade`, `ambient`, `cutOut`, `cutIn`), exactly as in Slide Motion, so both skills move the same way for the same brand. `"dur": "motion:<token>"` resolves through `motion.json → duration`. `"linear"` or `"none"` for constant motion (spins, feeds, scrolls). Raw GSAP eases are allowed but leave the brand's curves; prefer tokens.

## Determinism
No `Math.random`, CSS animations, timers, `Date`, or `<video>`. All randomness is seeded. Frames are identical run to run within one GL mode (SwiftShader by default; `--gl gpu` uses the GPU, whose pixels differ slightly from SwiftShader's).

## Folder
```
<ws>/scenes/<date>-<slug>-<ratio>/
  meta.json          analysis, plan, cards from a carousel
  scene.json         what you write
  cards/             card sources; cards/out/ textures + manifest.json; cards/contact.png
  images/, source/   from ingest
  video.mp4, poster.png, storyboard.png, loop-seam.png, png/, render-report.json, caption.txt
```
