# Fivvi website design

The design of the public website at `https://fivvi.app`, published as the [Fivvi Website artifact](https://claude.ai/artifact/TYm2FXMAATs5cB768MTiPG). It's throwaway code like the [prototype](../prototype-v2/README.md): it shows the look and the words, and [#611](https://github.com/fivvi-app/fivvi/issues/611) builds the real site in `apps/web`. Fictional data only. The owner's decisions are in [`DECISIONS.md` §9](../prototype-v2/DECISIONS.md#9-public-website).

**Run it:** make the generated files, then open `index.html`.

```bash
CAPTURE_OUT=/tmp/fivvi-shots node docs/design/website/capture.cjs
node docs/design/website/build-legal.cjs
```

`capture.cjs` writes PNGs; convert the ones the pages use to `assets/shots/<id>-<lang>-<mode>.webp` with `cwebp -q 80`. Screens come from the prototype, so they follow it. Real gym names in its sample data become neutral names in the capture only.

| File | What |
|---|---|
| `index.html`, `site.css`, `site.js` | The pages and their routes |
| `content.js`, `pages.js` | The words, Dutch first; a few on the design-choices page sit in `site.js` |
| `capture.cjs` | Captures the prototype's screens, in Dutch and English, light and dark |
| `build-legal.cjs` | Makes `legal.js` from `docs/legal`, so the legal pages show the current drafts |
| `assets/photos/` | The photos |

## Photos

Generated with Codex's built-in `image_gen` tool on the owner's ChatGPT subscription. They're atmosphere only: the real screens do the explaining. No people, text or logos, so no image can pass for a real customer. The shared style:

> Editorial architecture photography, 35mm, soft natural daylight, muted warm neutrals with one small accent of soft pink, calm and uncluttered, believable materials. Wide landscape. No people, no text, no logos, no watermark.

| File | Subject |
|---|---|
| `gym` | A small boutique training studio in a Dutch canal house: large windows, oak floor, a bench and kettlebells, an empty wall on the left |
| `team` | A larger, tidy gym floor in a converted Dutch warehouse: squat racks, benches and a strip of turf, brick walls, steel-framed windows |
| `pilates` | A bright white pilates studio with six wooden reformers in a neat row, pale oak floor, tall windows |
| `yoga` | A warm yoga room with rolled mats and cork blocks stacked along an oak floor, linen curtains, late afternoon light |
| `pt` | A quiet Dutch city park at first light: a rolled mat, a kettlebell and a water bottle on the grass beside a path |
| `client` | A simple wooden bench by a studio door: a sports bag, a folded towel and a water bottle, soft window light |

## Image styles being compared

`#beeld` shows these next to the rooms above and next to screens only. The owner picks one; the others then leave this folder.

- **Objects** (`obj-*`): *clean Apple-like product photography, one simple matte fitness object group centred on a plain seamless light grey #F2F2F7 background, soft even studio light, a soft contact shadow, lots of empty space, one crisp accent colour of vivid pink #E6164A, everything else black, white or grey.*
- **In motion** (`mov-*`): *bold high-contrast black-and-white sports photography, very close crop on hands or feet only, dramatic side light on a near-black background, real texture and motion, with one thin rim of vivid pink #E6164A light as the only colour.*
