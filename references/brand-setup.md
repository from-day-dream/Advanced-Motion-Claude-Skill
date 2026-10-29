# Brand setup

A brand lives in `<ws>/brands/<slug>/`: `brand.md` (identity and voice), `tokens.json` (colours, fonts, type scale, spacing), `design-language.md` (how it looks, and how it moves), `fonts/`, `logo/`, `images.json`, and `motion.json` (how the brand moves and what its scenes show, defined with the user). This skill creates all of it from scratch when there's no brand yet (**Full setup**), and needs nothing else installed.

The skill ships no style of its own: everything aesthetic comes from this setup.

**Works with the sibling skills, if present (optional).** The kit is the same format Carousel Studio and Slide Motion use, in the same workspace, and the motion setup below is Slide Motion's, unchanged (same questions, same `motion.json` schema, same loader: `scripts/lib/motion.mjs` is an identical copy of Slide Motion's). So:
- a brand set up in Carousel Studio needs only the motion setup here;
- a brand whose motion was set up in Slide Motion is **ready here as it is**: never re-interview, never rewrite its `motion.json`;
- a brand set up here works in both of them, and moves the same way in Slide Motion's videos as in these scenes.

`<skill>` is this skill's folder; `<ws>` is the workspace (`$CAROUSEL_STUDIO_HOME` or `./carousel-studio`).

## Which path?
Run `node <skill>/scripts/setup.mjs --check`. Its `brands` list shows each brand with `motion`: `ready`, `incomplete` or `missing`.

| Situation | Do |
|---|---|
| `motion: ready` (whichever skill set it up) | Nothing. Use it. |
| `motion: missing` or `incomplete` (e.g. a brand made in Carousel Studio) | **Motion setup** only (below). Don't re-interview anything else. |
| No brand | **Full setup** (steps 0-7), then the motion setup. |

Never change an existing brand's `tokens.json`, `brand.md` or fonts for a scene; ask first if a motion choice seems to need it.

## Full setup
Ask in **small batches** (2-4 questions per message), never one long form. Accept pasted text, links (read the user's site or Instagram and summarise what it shows) and uploaded files. Draft answers yourself and ask the user to confirm.

### 0. Create the kit
```
node <skill>/scripts/setup.mjs --init --brand <slug>
```
Creates the workspace if needed and `<ws>/brands/<slug>/` from `templates/brand/` (an empty kit, including an empty `motion.json`), and makes it active if none is. Slug: lowercase-dashes from the brand name. The workspace is `$CAROUSEL_STUDIO_HOME`, else `./carousel-studio` in the current folder; pass `--workspace <path>` to put it elsewhere.

### 1. Identity → `brand.md`
Name, handle, website. What the brand does and for whom (positioning), who watches (audience). If they give a link, read it and propose positioning + audience for them to correct.

### 2. Voice → `brand.md`
3-5 voice traits, each with a do/don't line. Words to use and to avoid. The exact closing CTA text for the end of a video (default: "Follow @handle for more <topic>").

### 3. Fonts → `tokens.json` + `fonts/`
For each role (`heading`, `body`, optional `accent`):
- **Google Font:** `node <skill>/scripts/fonts.mjs --family "<Family>" --weights 400,600 [--italic] --role heading --brand <slug>`. Download every weight and style the design will use.
- **User's own files:** copy into `fonts/` and add `{ "family", "files": [{ "path": "fonts/…", "weight": 600, "style": "normal" }] }` to `tokens.json`.
- Not sure: propose 2 pairings that fit the voice, render specimens for both, let them pick.

Render and **show** the specimen: `node <skill>/scripts/render.mjs --specimen --brand <slug>`. Exit 2 = a font failed; fix it first.

### 4. Logo → `logo/`
SVG preferred, transparent PNG accepted. Set `logo.primary` (light backgrounds) and `logo.alt` (dark).

### 5. Colours → `tokens.json`
At least `background`, `text` and `accent` roles; usually a muted text colour and an inverse colour. Name them by what they are (`paper`, `ink`, `clay`), set a `role`, mark decorative ones `"never text"`. Re-render the specimen and record off-limits text pairings (< 4.5:1) in `design-language.md`.

### 6. Design language → `design-language.md`
Draft it from everything gathered, using the template headings. Specific and measurable: margins in px, type case and tracking, colour placement, textures, image treatment, Do/Don't. Set `typeScale` and `spacing` in `tokens.json` to match. Show it for approval.

### 7. Images and reference layouts
`images.json` starts off: scenes use the sources' own images and designed cards. Turn generation on only if the brand's scenes will need generated photos:
1. Pick a provider (`fal`, `atlas` or `openai`; models in `config/providers.json`) and set `images.json → enabled: true, provider, model`.
2. The user puts the key in `<ws>/.env` (`FAL_KEY`, `ATLAS_CLOUD_API_KEY` or `OPENAI_API_KEY`; `.env.example` lists them). Never ask for the key in chat.
3. Write a one-paragraph style anchor in `images.json → styleAnchor` from the design language (light, colour, lens, treatment).
4. Check with `node <skill>/scripts/image.mjs --check --brand <slug>`, then one test image: `node <skill>/scripts/image.mjs --prompt "<subject>" --out <ws>/brands/<slug>/test/image.png --size 1080x1350 --brand <slug>`. Show it.

Generation is paid: ask before each use in a scene. If Carousel Studio or Slide Motion is installed, mention once that they can use this brand straight away.

## Motion setup (every brand, once)
The skill ships **no style**: no presets, no default curves. How a brand moves, and what its videos show, is worked out with the user here and saved in `brands/<slug>/motion.json` plus the `## Motion` (and, if they use illustrations, `## Illustration`) sections of `design-language.md`. The renderer refuses to run until `motion.json` is complete.

If the brand has no `motion.json`, run `node <skill>/scripts/setup.mjs --motion --brand <slug>`: it writes an empty schema to fill in.

**Start fresh.** Ignore any motion defined before: earlier videos' `meta.json → motion` (including the bundled example), other brands' `motion.json`, a previous `motion.json` for this brand when it's being redone, and anything remembered from earlier sessions. Don't offer them as options or anchors ("same as Bananafarm", "slower than last time"). Describe choices in absolute terms (seconds, px, curve shapes), drawn from this brand's kit and the user's references.

**Ask about the brand, never about choreography.** Setup asks the user only what the brand *is* in motion:
- its references;
- its character;
- what its videos show;
- its overall pace.

How things move inside a scene is **Claude's decision, made per scene while composing**. The user can suggest any of it for a given scene, but setup never asks about it, offers options for it, or saves it as a rule. That covers:
- which template and rig (`templates.md`, `rigs.md`);
- how the camera moves and how the cards travel;
- how the big line enters and leaves (`type.md`);
- staggers, steps and holds.

The tokens these moves use (every `ease.*` and `duration.*`, `distance`) are **derived by you** from the character, pace and references. Show them in the summary and in the motion test for approval; don't turn each one into a question.

### 1. Gather (one batch, open questions)
Draft answers from what you already know (the brand's voice, design language, logo, carousels, website) and ask the user to confirm or correct. Ask only these:
1. **References:** videos, reels, sites or apps whose motion they like (links or files), and anything they dislike. Read or watch descriptions of those references and name what they have in common. For reference video files the user provides, run `scripts/breakdown.mjs` and read its contact sheet (`reference-intake.md`); what you take from a reference is pace and character, never its look.
2. **Character:** three words for how the brand should feel in motion, then make them concrete. For example, "settles slowly, never bounces" or "fast in, firm stop".
3. **What the videos show:** type, photos, illustrations, UI or product shots, data. In what mix? Is a headline always present, or can an image carry a moment alone? How many words can sit on screen at once?
4. **Overall pace:** calm, measured or brisk, in the user's words, plus the reading speed if the audience reads in a second language.

If the user volunteers exact curves (a GSAP ease, `logistic(k)` with k ≈ 5 gentle … 15 very steep, or a `cubic-bezier(…)` copied from Figma or After Effects), use them. Otherwise don't ask for curves; derive them.

### 2. Write `motion.json`
Translate the answers into tokens yourself: pick curves and timings that express the character and pace (the `.in`/`.out` halves for moves split across a cut are derived from the cut curve). Every field below is required except `visual` and `notes`.
```json
{
  "ease": { "enter": "…", "exit": "…", "move": "…", "fade": "…", "ambient": "…", "cutOut": "….in", "cutIn": "….out" },
  "duration": { "enter": 0.6, "exit": 0.5, "move": 1.2, "cut": 0.5, "stagger": 0.08 },
  "distance": 120,
  "readingSpeed": 3.5,
  "visual": { "wordsPerBeat": 7, "headline": "required | optional", "requires": "photo | illustration | null", "maxVisuals": 2 },
  "notes": "anything that doesn't fit a token"
}
```
- **`ease`:**
  - `enter`/`exit`: the curve for things arriving and leaving (how they arrive or leave in a given video is chosen per video);
  - `move`: transformations, charts, camera, re-arrangements;
  - `fade`: opacity;
  - `ambient`: the curve for the slow layer that keeps the frame alive, usually linear or a soft sine;
  - `cutOut`/`cutIn`: the two halves of a move split across a cut.
- **`readingSpeed`:** keep 3.5 words/s unless the audience reads in a second language (then 3).
- **`visual`:** the brand's rules for what is shown.

### 3. Design language
Write `## Motion` in `design-language.md`: 3-5 specific rules in the brand's own terms, about the brand and not the choreography:
- the character, made concrete;
- the overall pace;
- what never happens (from the user's dislikes).

If the brand has motifs (a cursor, arrows, selection boxes, stickers…), list each one with what it **means**, not where it goes: "cursor: clicks or drags something that's actually interactive". Videos and scenes use a motif only when that meaning applies (in this skill, motifs live on the cards; see `critique.md` → Intent).

Decide which of the skill's decorative material fits the brand (`templates/shapes/`, `templates/textures/`), from its character and carousels, and write it as two lines in `design-language.md`. Show them with the rest for approval; don't ask a separate question.
```
Shapes: deny all                      (a minimal brand: no stickers ever)
Shapes: allow circle, pill, star-4    (only these)
Textures: deny grain, gradient-mesh   (everything else is fine)
```
A missing line allows everything. Slide Motion's renderer warns when a video uses something the brand rules out; Advanced Motion draws no shapes or textures of its own, but cards designed for a scene follow the same lines.

If the brand uses illustrations, also write `## Illustration`, so two illustrations drawn weeks apart match:
- stroke and caps;
- fills vs outlines, and which token colours go where;
- corner radius;
- perspective;
- level of detail;
- what never appears.

Invite 1-3 reference images into `brands/<slug>/illustrations/`. If the brand uses photos, say where they come from: the sources' image library, `brands/<slug>/photos/`, or generation through `images.json` (off by default).

### 4. Motion test (approval)
If the brand's motion was set up in Slide Motion and the user approved its motion test there, skip this: the tokens are the same.

Otherwise render, in the brand, the templates that show the curves best: a stepped one (`deck-cycle`: the `move` curve and its holds) and one with type (`grid-board`: `enter` on the line and the build-in):
```
node <skill>/scripts/specimen.mjs deck-cycle --brand <slug> --workspace <ws>
node <skill>/scripts/specimen.mjs grid-board --brand <slug> --workspace <ws>
```
They land in `brands/<slug>/specimens/scenes/<name>/` (Slide Motion's specimens stay in `specimens/`). Optionally `specimen.mjs all --brand <slug>` for every template and a contact sheet. Show `specimen-storyboard.png` and give the `specimen.mp4` paths. Ask for approval of the *feel* (character, curves, pace), not the choreography. If the user wants it different ("snappier", "softer landings"), adjust the tokens yourself and re-render; iterate until approved. If Slide Motion is installed, say once that its videos use the same tokens.

A single scene can adjust any token for itself in `meta.json → motion` (or `scene.json → motion`) when the user asks ("slower this time"). Change the brand's `motion.json` only when they want a new default; it changes Slide Motion's videos too.

## Editing later
Change only the file concerned. Re-render the type specimen (fonts, colours) or the scene specimens (anything that moves) and show the result. `motion.json` is shared: a change shows in Slide Motion's videos too.
