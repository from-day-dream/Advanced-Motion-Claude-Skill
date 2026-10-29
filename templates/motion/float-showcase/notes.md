# float-showcase

Shallow-depth cards drift and turn; the camera creeps in and back.

- **Rig:** `scatter` · **camera:** `front` · **cards:** 4-7 · **loop:** yes · **length:** 8s (6-15s)
- **Type:** behind or front, up to 3 words
- **From:** Jitter "Showcase 11"

**What it's for:** product showcase; portfolio highlights; a few hero images; a big word with supporting visuals.

**Avoid:** more than 7 cards (they crowd); cards that must be read (they tilt).

**What breaks it:** Too many cards crowd the spread and hide the word behind; text-heavy cards tilt out of legibility.

**Beats:**
- `build-in` → `rig.build`: reveals the cards: they arrive in order before the motion takes over (dropped when the scene loops)
- `drift` → `rig.phase`: keeps the frame alive: each card drifts and turns on its own slow cycle
- `dolly-out` → `camera.dolly`: keeps the frame alive: the camera creeps in and settles back
- `dolly-back` → `camera.dolly`: keeps the frame alive: the camera creeps in and settles back
