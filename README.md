# Advanced Motion

A Claude Code skill that turns **any topic, URL, document or set of images** into a branded, continuous **3D motion scene**: cards arranged and animated in real depth (a poster ring, a peeling stack, a ribbon feed, a tilted wall, an orbiting sphere, a tunnel, a cover flow and more) with one line of large type. Rendered locally to a silent MP4, 9:16 by default (any ratio), optionally a seamless loop.

It's self-contained: it sets up your brand with you, designs the cards from your sources, and renders the scene. No other skill is needed.

## What it does
- **Sets up your brand, once.** If you don't have one yet, it asks you about identity, voice, fonts (downloaded from Google Fonts or your own files), logo, colours, design language and how the brand moves. It saves all of it as a brand kit that every later scene uses. It has no style of its own: every colour, font, curve and timing comes from your brand.
- **Reads any source.** A topic on its own, web pages, PDF, Word, PowerPoint, Excel, text, CSV, images, or folders of them. It analyses them first; facts on screen come only from the sources or from you.
- **Designs the cards.** Each card is one thing from the sources (a statement, a number, a step, a photo, a quote), designed in HTML in your brand and rasterised to a sharp texture. Photos can be cards as they are.
- **Builds one continuous 3D scene.** Claude picks a template for the content (by how many cards there are and what they are), writes a declarative `scene.json`, and a fixed Three.js runtime renders it frame by frame.
- **Checks its own work.** Reading time, contrast against what's actually behind the line, safe areas, type hidden behind cards, card legibility, soft textures, mirrored cards, strobing, the loop seam, stillness and determinism. It fixes what it finds before handing over the video.

## Works best alongside Carousel Studio and Slide Motion (optional)
Advanced Motion works fine on its own. If its sibling skills are installed, they work together:
- **Carousel Studio:** a carousel's slides become the scene's cards directly (`carousel:latest`).
- **Slide Motion:** the same brand motion setup and the same `motion.json`. A brand set up in either skill moves the same way in both, and is never re-interviewed.
- **All three** share one workspace, one brand kit format and one gallery: carousels, videos and scenes side by side.

None of this is required. Without them, Advanced Motion creates the workspace and brand itself, and builds its cards from your sources.

## How it works
- A **rig** (`ring`, `spine`, `stack`, `scatter`, `grid`, `sphere`, `wall`, `arc`, `mosaic`) places card *j* of *N* from a few parameters. Animation tweens those parameters, never cards one by one, so scenes stay coherent and loops are exact.
- A **template** is a choreography preset on a rig: the camera, the beats (each with its reason), the type layers, card counts, the loop rule and the ranges you may tune. 14 ship with the skill, each with a specimen clip. None of them carries a colour, font or curve.
- **Eases** in a scene are brand tokens (`motion:enter`, `motion:move`…), resolved through the brand's `motion.json`.
- **Rendering** runs headless Chromium with WebGL (software by default, so no GPU is needed), seeks one GSAP master timeline frame by frame, and encodes with ffmpeg. Final renders add motion blur where things move.

## Requirements
Node 18+. `node scripts/setup.mjs` installs the npm dependencies and Playwright's Chromium (once). About 0.1 s per frame, or about 0.6 s with motion blur on final renders. `--gl gpu` uses a GPU when available.

## Getting started
Ask Claude for a scene ("make a 3D reel from this article", "a poster ring of our product line", "a scene about why layering beats one heavy jacket"). On the first run it sets up the brand with you; after that it goes straight to the scene. Scenes land in `<workspace>/scenes/<date>-<slug>-<ratio>/` with `video.mp4`, `poster.png`, `storyboard.png` and `render-report.json`.

The workspace is `$CAROUSEL_STUDIO_HOME`, else `./carousel-studio` in the current folder.

## Commands
| Command | What |
|---|---|
| `node scripts/setup.mjs [--check]` | Install, or check readiness (incl. WebGL) |
| `node scripts/setup.mjs --init --brand <slug>` | Create the workspace and an empty brand kit |
| `node scripts/setup.mjs --motion --brand <slug>` | Add an empty `motion.json` to an existing brand |
| `node scripts/fonts.mjs --family "<Family>" --weights 400,700 --role heading --brand <slug>` | Download a Google Font into the brand |
| `node scripts/render.mjs --specimen --brand <slug>` | The brand's type specimen and colour contrast grid |
| `node scripts/ingest.mjs <url \| file \| folder>… [--own]` | Sources into a new scene folder |
| `node scripts/ingest.mjs --topic "<topic>"` | A scene folder from a topic alone |
| `node scripts/cards.mjs <scene-dir>` | Rasterise the cards → `cards/out/`, `cards/contact.png` |
| `node scripts/render.mjs <scene-dir> [--draft] [--gl gpu]` | Render and check → `video.mp4`, `storyboard.png`, `render-report.json` |
| `node scripts/specimen.mjs <template\|all> [--brand <slug>]` | A template's specimen clip, in the grey brand or yours |
| `node scripts/breakdown.mjs <video>` | Reference video → contact sheet and motion strip |
| `node scripts/image.mjs --check --brand <slug>` | Optional image generation (fal, Atlas Cloud, OpenAI; off by default, paid) |
| `node scripts/gallery.mjs [--serve]` | Gallery of scenes and template specimens |
| `npm test` · `node tests/report-checks.mjs` | Rig tests · the render checks against deliberately broken scenes |

## Layout
| Path | What |
|---|---|
| `SKILL.md`, `references/` | The skill's instructions: brand setup, analysis, cards, images, templates, rigs, scene spec, look, type, critique, reference intake |
| `runtime/` | The scene runtime (Three.js): `scene.js`, `look.js` (card shader), `type.js` (DOM and SDF type), `rigs/` (pure rig functions), `prng.js` |
| `scripts/` | Setup, fonts, ingest, cards, render, specimen, gallery, breakdown, image generation; `lib/scene-spec.mjs` resolves a scene against its template and the brand; `lib/gl.mjs` launches WebGL Chromium |
| `templates/brand/` | The empty brand kit `--init` copies |
| `templates/cards/` | Card skeletons (statement, number, step, photo) with brand role placeholders |
| `templates/motion/<name>/` | The 14 templates: `template.json`, `notes.md`, `specimen.mp4` |
| `templates/specimen-brand/` | Grey placeholder brand for specimens (Inter, OFL) |
| `templates/scene.html` | The fixed page every scene renders in |
| `examples/` | Complete example scenes |
| `tests/` | Rig tests and render-check tests |
| `spike/`, `docs/` | The WebGL render measurements and the execution strategy |

## For maintainers: shared code with the sibling skills
So each skill installs on its own, a few files are identical copies across the three skills, checked by `scripts/check-sync.mjs` in the parent folder (`--fix` copies from each source):
- **From Carousel Studio:** `scripts/lib/workspace.mjs`, `render-core.mjs`, `serve.mjs`, `scripts/fonts.mjs`, `scripts/image.mjs`, `config/providers.json`, `templates/gallery.html`, and `templates/brand/` (except `motion.json`).
- **From Slide Motion:** `scripts/lib/motion.mjs` (the motion-token loader and curves), `config/ratios.json`, `templates/brand/motion.json`.
