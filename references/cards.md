# Cards

A scene is only as good as its cards. They come from three places:

| Source | Cards |
|---|---|
| A Carousel Studio carousel (optional) | Ready-made: each slide is a card (`from-carousel.mjs`). |
| Photos (from the sources, the user, or the image library) | `{ "id": "p1", "image": "images/x.jpg", "aspect": "4:5" }`: no HTML needed (`images.md`). |
| A topic, URL, document, deck, spreadsheet… | **Designed by you**: one HTML file per card in `cards/`, in the brand. |

Without Carousel Studio, the third row is the usual case. The rest of this file is about it.

## Plan the set first
From `meta.json → analysis`, decide **how many cards and what each one is**, then pick the template (`templates.md`): the count and kind of cards decide it. Each card is one thing from the sources:
- a **statement**: a key point in a few words;
- a **number**: one figure and what it means;
- a **step**: one step of a process;
- a **photo**: an image from the sources, with or without a caption;
- a **quote**, a **name/logo**, a **product shot**, a **UI screenshot** from the sources.

Cards carry visuals and 1–3 words, a figure, or a short line. The scene's big line carries the message (`type.md`). A card that needs a paragraph is the wrong card; the template may hold on it, but at 9:16 most cards are seen at 300–900 px tall. Small text should be at least 3% of the card's height to stay readable when the card is shown large (the render warns when it isn't).

Vary them: alternate grounds (light / dark / accent), kinds and scale, the way a carousel varies its slides. A set of identical cards reads as a pattern, not a story, unless that's the point (a wall, a tunnel).

## Write each card
1. Start from a skeleton in `<skill>/templates/cards/` (`statement`, `number`, `step`, `photo`): copy it to `cards/<id>.html`.
2. Put the content in; words and figures only from the sources.
3. Restyle it to the brand's `design-language.md`: its grounds, type treatments, emphasis device, corners, motifs that apply. The skeletons are structure only.

Rules:
- A full HTML document at the card's size (default 1080×1350, 4:5; any `px: [w, h]` in scene.json). `{{FONT_FACES}}{{TOKENS}}` in the head: the brand's fonts and tokens are injected there.
- Colours and fonts only from the brand: the role placeholders (`BRAND_BACKGROUND`, `BRAND_SURFACE`, `BRAND_TEXT`, `BRAND_MUTED`, `BRAND_DARK`, `BRAND_ACCENT`, `BRAND_ACCENT_2`, `BRAND_ON_ACCENT`, `BRAND_COLOR_1`…`4`, `BRAND_FONT_DISPLAY`, `BRAND_FONT_BODY`, `BRAND_FONT_SECOND`, `BRAND_SECOND_STYLE`, `BRAND_WEIGHT_DISPLAY`, `BRAND_WEIGHT_SECOND`, `BRAND_GUTTER`) or the brand's own `var(--brand-<token>)`. No raw hex (the render warns). `{{LOGO}}` / `{{LOGO_ALT}}` insert the logo.
- Images by relative path (`../images/x.jpg` from `cards/`). No external URLs. No text baked into photos.
- Nothing moves inside a card: the scene moves the cards. No animation, scripts or video.

## Rasterise and check
`node <skill>/scripts/cards.mjs <scene-dir>` renders every card to `cards/out/` and writes `cards/contact.png`. View the contact sheet before writing `scene.json`: do the cards look like one brand, one set, and are they legible? Re-run after any change; unchanged cards come from the cache.
