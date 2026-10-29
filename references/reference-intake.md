# Reference intake

When the user gives a reference video ("make it like this"), you can't watch it, so read frames instead:

```
node <skill>/scripts/breakdown.mjs <video | frames folder> [--out <dir>] [--every 0.25]
```
It writes `contact.png` (a frame every 0.25 s, with times), `motion-strip.png` (how much changes between frames: tall bars = big moves or cuts) and `breakdown.json`.

Read them and name, in the plan:
1. **The arrangement → the rig.** Cards on a cylinder → `ring`; along a curve → `spine`; in a deck → `stack`; scattered → `scatter`; in a grid or on a tilted plane → `grid` / `wall`; on a ball → `sphere`; in a row or fan → `arc`; one image in pieces → `mosaic`.
2. **What moves.** The one or two parameters that change (the ring turns, the deck peels, the feed scrolls) and the camera move (still, creep, orbit, fly-through).
3. **The type role.** None, on the cards, a line in front, behind, or interleaved.
4. **Pace.** Constant (spins, feeds) or stepped with holds (peels, cover flow); how long each step and hold lasts (from the frame times).
5. **The nearest template** (`templates.md`) and the overrides you'll need from it. Record them in `meta.json → plan.reference`.

Take structure, choreography and pace from a reference, **never its look**: no colours, fonts, artwork or copy. Those come from the brand and the sources. If the reference is a scene with several cuts, take only the part that's one continuous scene; multi-scene sequences are Slide Motion's job.
