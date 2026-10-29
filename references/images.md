# Images as cards

Every scene folder has an **image library** from ingest: `images/library.json` and a numbered contact sheet `images/library.png`. In a scene, images become **cards**.

## Annotate the library
View the contact sheet and fill each entry in `library.json`: `desc` (what it shows), `tags`, `quality` 1–5 (sharp, well lit, subject clear), `rights` (`own`, `third-party`, `unknown`) and, once the user says yes to a third-party image, `approved: true`.

## Choose cards
1. **Right for the idea**: each card shows something the line or the sources are about.
2. **One look**: similar light, colour and style across the set. Mismatched photos can be unified with a token-coloured duotone in an HTML card (`<img>` plus a brand-coloured overlay).
3. **Sharp enough**: a card's texture is at most its source size. A photo shown full-frame needs about 2000 px on its long side; the report warns (`soft-texture`) when a card is shown larger than its texture.
4. **No text in the photo** that competes with the line; no watermarks.
5. **Rights**: third-party images only with the user's yes (`approved`).

## Card forms
- A photo as it is: `{ "id": "p1", "image": "images/x.jpg", "aspect": "4:5", "focus": "north" }`. Cover-cropped to the aspect; `focus` keeps the subject in the crop.
- A designed card: an HTML file in `cards/` at its size (`px`), in the brand, with the photo, a caption or a number on it. Use this when a card needs words, a brand frame or a treatment.
- A carousel slide: as from-carousel wrote it.

Generate images only as a last resort, with the user's yes (`scripts/image.mjs`, paid).
