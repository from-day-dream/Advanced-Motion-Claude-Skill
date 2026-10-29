# grid-board

Editorial grid lines draw on; images pop in at the cells and drift in depth around a central line.

- **Rig:** `grid` · **camera:** `front` · **cards:** 4-8 · **loop:** yes · **length:** 8s (6-14s)
- **Type:** front, up to 4 words
- **From:** Visual Board

**What it's for:** a moodboard; a collection with one message; an editorial announcement.

**Avoid:** more than 8 cards; no message line (the centre stays empty).

**What breaks it:** Without a line the empty centre cell reads as a hole.

**Beats:**
- `lines` → `rig.draw`: builds the editorial frame the images will land in (dropped when the scene loops)
- `pop` → `rig.pop`: reveals the images one by one, each at its cell (dropped when the scene loops)
- `drift` → `rig.phase`: keeps the frame alive: cards breathe in depth
- `dolly-out` → `camera.dolly`: keeps the frame alive: a slow push in and out
- `dolly-back` → `camera.dolly`: keeps the frame alive: a slow push in and out
