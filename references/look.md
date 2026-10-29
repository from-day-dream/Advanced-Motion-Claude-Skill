# Look

The look is what keeps a card scene from reading as a WebGL demo. In the order they matter:

1. **Unlit + angle shading, not PBR.** Cards keep their exact brand colours (colour is handled in sRGB end to end); a cheap term darkens a card as it turns away from the camera. This is most of the 3D feel. `look.shading` 0–1 (templates use 0.2–0.35). The report warns when the focus card at a hold is darkened past 18%: its colours drift from the brand's.
2. **Rounded corners, sharp textures.** `look.cornerRadius` in card heights (default 0.035; match the brand's card radius). Textures are rasterised at 2× their largest on-screen size, with mipmaps and anisotropic filtering, and re-rasterised automatically when a card turns out larger than its texture.
3. **Depth.** `look.fog` 0–1 fades far cards into the background colour (rings, spines, corridors, tunnels). `look.shadow: "soft"` puts a soft contact shadow behind each card (scatter, stacks, fans; `shadowStrength`).
4. **Backs.** `look.faceCamera`: `flip` (default; a card seen from behind shows its front the right way round, darkened by `backShade`), `hide`, or `none` (mirrored; the report errors when one shows).
5. **Motion blur** on final renders: sub-frame accumulation, 8 samples, 180° shutter, only on frames that move (as in Slide Motion). `--draft` turns it off; `--blur 1` turns it off for a final.

| `look` field | Default | |
|---|---|---|
| `background` | `role:background` | Any `token:<name>` or `role:background|text|accent`. Fog fades to it. |
| `shading` | 0.35 | Angle darkening |
| `backShade` | 0.25 | Extra darkening on backs |
| `fog` | 0.35 | 0 none → 1 strong |
| `cornerRadius` | 0.035 | In card heights |
| `faceCamera` | `flip` | `flip` / `hide` / `none` |
| `shadow` | `none` | `soft` |
| `shadowStrength` | 0.35 | |
| `lineColor` | text colour | Grid lines (`grid-board`) |
| `dots` | none | A dotted ground for a design-canvas brand: `{ "color": "token:dot", "pitch": 48, "size": 3 }` (px). Take the values from the brand's design language. |

Animatable: `look.fog`, `look.shading`, and `look.groundX` / `look.groundY` (px: the dotted ground pans, e.g. two pitches over the scene, when the brand lets the canvas drift).

Depth of field isn't supported in this version.

**Background and cards:** a card the same colour as the background disappears at its edges. Give such cards a shadow, or set the background to another brand colour (`token:<name>`).
