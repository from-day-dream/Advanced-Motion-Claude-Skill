# Critique

After every render look at, in order: `storyboard.png` (six samples plus every hold), `poster.png`, `loop-seam.png` (loops), a few frames from `video.mp4` (`ffmpeg -ss <t> -i video.mp4 -frames:v 1 out.png`), then `render-report.json`. Two rounds at most; finish with a full (non-draft) render. In "quick mode", one round, but fix every report error.

## Intent (check first)
1. **The template fits the content** (`templates.md` picking order). If none fitted, say why.
2. **Every move has a reason.** Each timeline entry's `why` is true on screen: it carries, reveals, connects, emphasises, hands over or keeps the frame alive. A move without one is cut, not kept for energy. Camera moves serve the cards, not the other way round.
3. **One idea.** The line says one thing; the cards support it; nothing on screen competes with it at its hold.
4. **True to the sources.** Every fact on the line or on a card comes from the sources or the user. Third-party images only with a yes.

## Brand
5. **Only the brand's tokens.** Colours via `token:`/`role:`, eases via `motion:`. The scene moves like the brand's Slide Motion videos would (same `motion.json`).
6. **Cards look like the brand.** Carousel slides as designed; HTML cards in the brand's fonts and colours; photos treated the way `design-language.md` says.
7. **Shading** keeps the focus card's colours (no `shading` warning), backgrounds don't swallow cards of the same colour.

## Motion and depth
8. **A continuous piece.** It plays as one scene: something always moves (no `still` error), and at the hold only the line pauses.
9. **Depth reads.** Near and far cards are distinct (fog, scale, shadow); the frame isn't a flat row.
10. **Fill the canvas.** In 9:16, cards reach the top and bottom bands or bleed off them; no bare band along an edge (raise `rows`, lower `fit`, or change the camera).
11. **Loops are seamless** (loop seam ≈ 0). If the seam shows, a loop parameter doesn't advance a whole number of periods, or the line doesn't leave.
12. **No strobing.** Fast spins or flights at 30 fps need motion blur (final renders have it) or a slower move.

## Legibility
13. **The line**: reading time, contrast, safe area, occlusion: zero report errors.
14. **Cards that must be read** (pages, steps) are shown large enough (`card-text` warning: smallest text under 22 px at the hold). If they must be read, use a template that holds on each (`cover-flow`, `deck-cycle`, `peel-stack`) or let the line carry the words.

## Report
15. **Zero errors**: reading-time, occlusion, safe-area, contrast, mirrored, loop-seam, still, determinism, length, page, font, cards.
16. **Warnings**: fix unless deliberate, and say why: soft-texture, card-text, shading, strobing, range, template, intent, loop, custom, type.

## Fix loop
Change `scene.json` (template overrides, beats, type), never the runtime. Re-render with `--draft` while iterating; the final is a full render.
