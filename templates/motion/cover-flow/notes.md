# cover-flow

A row of cards, the centre one flat and the sides angled away; it steps from item to item with holds.

- **Rig:** `arc` (flow) · **camera:** `front` · **cards:** 5-9 · **loop:** no · **length:** 10s (6-16s)
- **Type:** front, up to 5 words
- **From:** fills a gap the references leave

**What it's for:** pages that must be read one at a time; a ranked list; product options.

**Avoid:** a seamless loop (set rig.loop true and step to N instead).

**What breaks it:** Too many items for the duration make each hold too short to read.

**Beats:**
- `build-in` → `rig.build`: reveals the cards: they arrive in order before the motion takes over (dropped when the scene loops)
- `step` → `rig.focus` in N-1 steps: steps the focus from item to item, holding each long enough to read
