# Type

A scene has **one line of large type, or a few words**, or none. The cards carry visuals and 1–3 words each; the line carries the message. Up to the template's `maxWords` and the brand's `motion.json → visual.wordsPerBeat`, whichever is smaller.

## Layers
| Layer | Where | Use |
|---|---|---|
| `front` | DOM, over the cards | Always readable. The default. |
| `behind` | DOM, under the cards | Cards pass in front (Jitter showcase). Up to 30% may be covered during its hold (`maxOcclusion` to change); past that the report errors. |
| `interleaved` | SDF text inside the 3D scene | Some cards pass in front, some behind (`orbit-sphere`, `vortex-trail`). At most 15% covered during its hold. Needs a .ttf/.otf/.woff brand font. `depth` moves it in z. |

## Fields
```json
{ "id": "line", "text": "Lineup\n2026", "layer": "front", "zone": "bottom", "align": "center",
  "size": "fit", "maxSize": 180, "font": "display", "weight": 600, "italic": false,
  "case": "upper", "tracking": -0.02, "lineHeight": 0.92, "color": "role:text",
  "enter": { "kind": "mask-up", "at": 1.2 }, "exit": { "kind": "fade", "at": 9.5 }, "hold": [1.8, 9.5] }
```
- `zone`: `top`, `center`, `bottom` (inside the safe area), or a y in px.
- `size`: px, `"fit"` (spans the safe width, capped by `maxSize`), or a `typeScale` level (`"headline"`).
- `font`: `display` (the brand's heading face), `body`, `accent`. `weight`/`italic` pick the file.
- `color`: `role:text` (default), `role:accent`, or `token:<name>`. Never a raw hex.
- `enter`: `mask-up` (words rise out of masks, staggered by `duration.stagger`), `stagger` (characters), `scale-settle`, `depth-push`, `fade`, or `none`. Defaults: `at` 12% of the scene, `dur` `motion:enter`, `ease` `motion:enter`. In-scene type supports `fade`, `scale-settle`, `depth-push`.
- `exit`: `fade`, `mask-down`, `scale-out`; `at` in seconds; `dur`/`ease` default to `motion:exit`.
- `hold`: when the line is settled and read. Computed from the entrance and exit if omitted. The render checks reading time (words ÷ `readingSpeed`, min 1 s), contrast against what's actually behind it, the safe area and occlusion during the hold.

## Loops
In a looping scene the first and last frames must match: the line is either there from the start (`"enter": "none"`) or enters **and** leaves before the end.

## Contrast
Checked at the middle of the hold against the pixels behind the line (cards, fog and background): 4.5:1, or 3:1 for text 48 px and up. A line over busy cards needs a calmer moment, another zone, or the behind layer with fewer cards crossing it.
