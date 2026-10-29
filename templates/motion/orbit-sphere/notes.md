# orbit-sphere

Cards on a sphere shell orbit the word, passing in front of it and behind.

- **Rig:** `sphere` · **camera:** `front` · **cards:** 15-30 · **loop:** yes · **length:** 12s (8-20s)
- **Type:** interleaved or front, up to 2 words
- **From:** Create

**What it's for:** a community or many contributors; a big library behind one idea; a launch word.

**Avoid:** fewer than 15 cards (the shell has holes); readable cards (they are small).

**What breaks it:** Few cards leave the sphere patchy; long lines collide with passing cards.

**Beats:**
- `build-in` → `rig.build`: reveals the cards: they arrive in order before the motion takes over (dropped when the scene loops)
- `orbit` → `rig.yaw`: orbits the cards around the word, passing in front of it and behind
