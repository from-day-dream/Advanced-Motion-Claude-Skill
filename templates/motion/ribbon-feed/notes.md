# ribbon-feed

Pages travel up an S-curve, banking as they turn, like scrolling a 3D feed.

- **Rig:** `spine` (path) · **camera:** `front` · **cards:** 5-10 · **loop:** yes · **length:** 10s (6-15s)
- **Type:** none or front, up to 4 words
- **From:** Noteform deck

**What it's for:** a deck or report walked through; a carousel shown as a feed; pages that should stay readable.

**Avoid:** fewer than 5 cards (gaps in the feed); photos without text (use float-showcase).

**What breaks it:** Fewer than 5 cards leaves gaps; very wide cards bank into each other.

**Beats:**
- `build-in` → `rig.build`: reveals the cards: they arrive in order before the motion takes over (dropped when the scene loops)
- `travel` → `rig.offset`: carries the eye up the feed, page after page
- `orbit-out` → `camera.orbit`: keeps the frame alive: the view swings gently around the curve
- `orbit-back` → `camera.orbit`: keeps the frame alive: the view swings gently around the curve
