# Examples

Four complete scenes from one 5-slide carousel ("Your weekly review, in 15 minutes") in Carousel Studio's `demo` brand (Fraunces and Inter, paper, ink and clay). Each folder has the `scene.json` Claude wrote, the plan and analysis in `meta.json`, the cards, and the rendered `video.mp4`, `poster.png` and `storyboard.png` (plus `loop-seam.png` for loops).

| Example | Template | Cards | Line | Loop |
|---|---|---|---|---|
| `weekly-review-cover-flow` | `cover-flow` | the 5 slides, held one by one | "15 minutes. 3 steps." (front, bottom) | no, 12 s |
| `weekly-review-deck-cycle` | `deck-cycle` | the 5 slides as a cascaded deck | "Weekly review" (front, top) | yes, 10 s |
| `weekly-review-poster-ring` | `poster-ring` | the 5 slides plus 4 step posters designed in the brand (`cards/posters/`) | none | yes, 12 s |
| `weekly-review-float-showcase` | `float-showcase` | the 5 slides drifting on the ink ground | "Friday" in the accent italic, behind the cards | yes, 8 s |

These start from a carousel because one was at hand. A scene from a topic, URL or document works the same way, with cards designed from the sources (`references/cards.md`, skeletons in `templates/cards/`).

**Motion:** the tokens are recorded in each `meta.json → motion`. They were made with Slide Motion's `setup.mjs --motion` and filled the way its motion setup would for a calm brand: a `cubic-bezier` enter, a `logistic(7)` move. This shows a Slide Motion `motion.json` driving these scenes unchanged. Because the tokens are in `meta.json`, the examples re-render on a `demo` brand that has no `motion.json` of its own.

**To re-render one:** copy its folder into `<workspace>/scenes/`, make sure the workspace has the `demo` brand, then run `node <skill>/scripts/render.mjs <folder> --brand demo`.
