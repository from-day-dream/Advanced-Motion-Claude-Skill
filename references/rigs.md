# Rigs

A rig is a pure function `pose(params, j, N) → { position, rotation, scale, bend, opacity }` for card slot *j* of *N* (`runtime/rigs/`). **Animation tweens 2–4 rig parameters, never cards one by one**: that keeps a scene coherent and loops exact. World units: a card is 1 tall and its aspect wide.

| Rig | Modes | Animate | Loops by | Other parameters |
|---|---|---|---|---|
| `ring` | `cylinder` | `angle` (°) | 360 | `radius` (auto from N), `facing` in/out, `bend` 0–1, `rows` (stacked rings to fill a tall frame), `rowGap`, `gap` |
| | `tunnel` | `travel` | rings × spacing | `perRing`, `rings`, `spacing`, `radius`, `bend` |
| `spine` | `path` | `offset` (0–1 along the path) | 1 | `points` (S-curve by default), `stretch` (height scale; templates use N/6), `bank`°, `twist`°, `scaleStart`/`scaleEnd`, `fadeEnds`, `spacing` (auto 1/N) |
| | `spiral` | `offset` | 1 | `turns`, `r0`/`r1` radius, `z0`/`z1` depth, `scaleStart`/`scaleEnd`, `twist` |
| `stack` | `peel` | `peel` (cards peeled) | N | `gap` (depth), `stepX`/`stepY`, `stepRot`, `shrink`, `depth` (visible cards), `lift`, `liftRot` |
| | `cycle` | `peel` | N | as peel, plus `swipe`, `swipeRot` |
| | `corridor` | `travel` | N × corridorGap | `corridorGap`, `side`, `sideAngle`°, `alternate` |
| `scatter` | — | `phase` (drift cycles), `cluster` (spread scale) | 1 | `seed`, `spread` [x, y, z], `rotRange` [x, y, z]°, `drift`, `driftRot`, `jitter` |
| `grid` | — | `pop` (0 → N reveals), `draw` (lines 0 → 1), `phase` | 1 | `cols`, `rows`, `gap`, `slots` (which cells, in order), `zAmp`, `lines` |
| `sphere` | — | `yaw`°, `pitch`° | 360 | `radius` (auto), `face` tangent / billboard, `density` (slots per card), `cardScale` |
| `wall` | — | `scrollX`, `scrollY` (cells) | cols / rows | `cols`, `rows` (incl. margin), `gap`, `curvature` |
| `arc` | `flow` | `focus` (card index) | N, with `loop: true` | `sideAngle`°, `centerGap`, `sideGap`, `depthBack`, `visible` |
| | `fan` | `open` (0–1) | — | `spread`°, `pivot` |
| `mosaic` | — | `explode` (0–1) | 0 → 1 → 0 | `cols`, `rows`, `depth`, `spread`, `rotSpread`°, `seed`, `card` |

## Shared parameters (every rig)
- `build` 0 → 1: the cards arrive in order (a build-in); `buildSpread` sets the overlap. Default 1 (all built). Templates use it with `skipOnLoop`.
- `idle`: a small seeded drift (world units) on every card, in whole cycles of the scene, so nothing is ever still and loops stay exact.
- `slice`: `{ "card": 2, "meshes": [0, 1], "axis": "x" }` spreads one card's image across several slots (as in the colour-stack reference).
- `tilt`, `yaw`, `roll` (°) and `lift`: the whole rig's transform. `tilted-wall` uses `tilt` and `roll`.
- `seed`: for scatter, grid drift, mosaic and idle. Never `Math.random`.

## Loops
A looping scene ends exactly where it starts. For a rig parameter that means advancing a **whole number of periods** (the "Loops by" column). The resolver warns otherwise, and the render compares the first and last frames (`loop-seam.png`). With distinct cards, one step of a ring (360/N) is *not* a loop: every slot shows a different card. Go all the way round.

## Camera (scene.json → camera)
- `preset`: `front`, `below` (strong perspective from beneath; `peel-stack`), `above`, `three-quarter`, `side` (`depth-corridor`), `inside-axis` (the camera inside a ring or tunnel, looking along −z).
- `fit`: the base distance frames the rig's extent × `fit`. Values above 1 leave a margin; values below 1 crop into the rig so it bleeds off the frame (`ribbon-feed` 0.5, `tilted-wall` 0.42).
- `position` / `target`: a fixed view instead of a fitted one. `offsetR` (inside-axis): an offset in rig radii.
- Animatable: `dolly` (fraction toward the target), `orbit`° (around the target), `elevate`°, `truck`, `pedestal`, `roll`°. Shorthand `"dolly": [0, 0.1]` tweens over the whole scene on `motion:ambient`, but it doesn't loop: for loops, use two beats out and back.
- `fov` (default 35).
