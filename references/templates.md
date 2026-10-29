# Templates

A template is a **choreography preset on top of a rig**: the rig's defaults, a camera, a beat skeleton (each beat with its reason), the type layers it supports, how many cards it suits, whether it loops, and the parameter ranges you may tune. It holds **no colours, fonts or curves**: those come from the brand (`tokens.json`, `motion.json`). Files: `templates/motion/<name>/template.json`, `notes.md` (what it's for, what breaks it) and `specimen.mp4` (rendered in a grey placeholder brand).

**See one in the brand before choosing:** `node <skill>/scripts/specimen.mjs <name> --brand <slug>` (about 15 s), or `all` for every template and a contact sheet.

## How to pick (state it in the plan, in this order)
1. **How many items?**
   - 1 image → `exploded-mosaic`
   - 3–7 → `fan-spread`, `deck-cycle`, `float-showcase`, `grid-board`
   - 8–16 → `poster-ring`, `peel-stack`, `depth-corridor`, `cover-flow`, `ribbon-feed`
   - 20+ → `orbit-sphere`, `vortex-trail`, `tilted-wall`, `card-tunnel`
2. **What are they?**
   - Pages with text that must be read → `cover-flow` (holds on each), `ribbon-feed`, `depth-corridor`
   - Posters → `poster-ring`
   - Photos → the 20+ group or `float-showcase`
   - UI cards, profiles, options → `deck-cycle`, `fan-spread`
3. **Is there a message line?** If the big line is the point, prefer templates whose type sits in the centre or interleaves: `orbit-sphere`, `vortex-trail`, `grid-board`, `float-showcase`, `tilted-wall`, `card-tunnel`.
4. **Loop or not?** Loops for feeds and backgrounds; `cover-flow` and `fan-spread` tell a story with an end.
5. **A reference?** `reference-intake.md` names the nearest template; start there and record the overrides you needed.

The user can always name one directly ("poster-ring from my last carousel"). A scene without a template is allowed, but the critique must say why none fitted.

## The catalogue

| Template | Rig | Motion in one line | Type | Cards | Loop | Length |
|---|---|---|---|---|---|---|
| `float-showcase` | scatter | Shallow-depth cards drift and turn; the camera creeps in and back. | behind / front, ≤3 words | 4–7 | yes | 8s (6–15) |
| `ribbon-feed` | spine (path) | Pages travel up an S-curve, banking as they turn, like scrolling a 3D feed. | none / front, ≤4 words | 5–10 | yes | 10s (6–15) |
| `peel-stack` | stack (peel) | A deck seen from below in strong perspective; the front card lifts away and the next is revealed. | none / front, ≤5 words | 6–12 | yes | 10s (6–16) |
| `poster-ring` | ring (cylinder) | Bent posters on a cylinder around the camera, spinning constantly. | none / front, ≤4 words | 8–16 | yes | 12s (8–20) |
| `grid-board` | grid | Editorial grid lines draw on; images pop in at the cells and drift in depth around a central line. | front, ≤4 words | 4–8 | yes | 8s (6–14) |
| `orbit-sphere` | sphere | Cards on a sphere shell orbit the word, passing in front of it and behind. | interleaved / front, ≤2 words | 15–30 | yes | 12s (8–20) |
| `vortex-trail` | spine (spiral) | Images stream out of a point, growing as they spiral toward the camera. | interleaved / front, ≤2 words | 20–40 | yes | 10s (6–15) |
| `depth-corridor` | stack (corridor) | Parallel planes seen at three-quarters; the camera trucks along them while the far planes frost. | front, ≤5 words | 8–14 | yes | 10s (6–16) |
| `deck-cycle` | stack (cycle) | A cascaded deck; the front card swipes off and tucks in at the back. | front, ≤5 words | 4–6 | yes | 8s (5–14) |
| `cover-flow` | arc (flow) | A row of cards, the centre one flat and the sides angled away; it steps from item to item with holds. | front, ≤5 words | 5–9 | no | 10s (6–16) |
| `fan-spread` | arc (fan) | Cards fan open from a pivot, settle, and breathe. | front, ≤5 words | 3–7 | no | 6s (4–10) |
| `tilted-wall` | wall | A large grid on a plane tilted about 40°, scrolling diagonally forever. | front, ≤4 words | 20–40 | yes | 14s (8–20) |
| `card-tunnel` | ring (tunnel) | Cards line a tube; the camera flies forward through it toward the word. | front, ≤3 words | 20–56 | yes | 10s (6–16) |
| `exploded-mosaic` | mosaic | One image split into tiles separates into depth, turns, and reassembles. | front, ≤5 words | 1 | yes | 8s (5–12) |

Few cards for a 20+ template? The rig repeats them (a wall or tunnel reuses textures), which shows; prefer a template made for the count.

## Using a template in scene.json
```json
{ "template": "poster-ring", "vars": { "turns": 1 }, "rig": { "rows": 2 }, "beats": { "build-in": null } }
```
- `vars`: the template's variables (`turns`, `cycles`, `rows`…), used in its beat values.
- `rig`, `camera`, `look`: merged over the template's. Overrides outside `ranges` are warned in the report.
- `beats`: per-name overrides of the template's beats (`{ "spin": { "ease": "motion:move" } }`), or `null` to drop one. Beats marked `skipOnLoop` (build-ins) are dropped automatically when the scene loops.
- `timeline`: extra entries of your own, appended (`scene-spec.md`).

## Template file format
```json
{
  "name": "deck-cycle", "description": "…", "reference": "Creator cards",
  "rig": { "type": "stack", "mode": "cycle", "gap": 0.14 },
  "ranges": { "rig.swipe": [1.2, 2.6] },
  "vars": {},
  "camera": { "preset": "front", "fit": 1.32, "elevate": 6 },
  "look": { "shadow": "soft" },
  "type": { "roles": ["front"], "maxWords": 5, "specimen": { "layer": "front", "zone": "top", "size": 96, "text": "…" } },
  "cards": { "count": [4, 6], "aspect": ["4:5", "3:4"] },
  "beats": [ { "name": "cycle", "at": 0, "dur": 1, "to": "rig.peel", "from": 0, "value": "N", "steps": "N", "fill": 0.5, "ease": "motion:move", "why": "hands the focus to the next card" } ],
  "duration": { "default": 8, "range": [5, 14] }, "loop": true,
  "fits": ["…"], "avoid": ["…"]
}
```
Beat `at` and `dur` are **fractions of the duration**, so one template works from its shortest to its longest length. `steps` splits a beat into equal steps, each a hold and then a move over `fill` of the step. `value`, `from` and `steps` may use `N` (cards), `D` (seconds) and the template's `vars`.

To add a template from a reference you've learnt: copy the nearest one, change the rig and beats, render its specimen, and write `notes.md`.
