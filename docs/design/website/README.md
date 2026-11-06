# Fivvi website design

The design of the public website at `https://fivvi.app`, published as the [Fivvi Website artifact](https://claude.ai/artifact/TYm2FXMAATs5cB768MTiPG). It's throwaway code like the [prototype](../prototype-v2/README.md): it shows the look and the words, and [#611](https://github.com/fivvi-app/fivvi/issues/611) builds the real site in `apps/web`. Fictional data only. The owner's decisions are in [`DECISIONS.md` §9](../prototype-v2/DECISIONS.md#9-public-website).

**Run it:** make the generated files, then open `index.html`.

```bash
CAPTURE_OUT=/tmp/fivvi-shots node docs/design/website/capture.cjs
node docs/design/website/build-legal.cjs
```

`capture.cjs` writes PNGs; convert the ones the pages use to `assets/shots/<id>-<lang>-<mode>.webp` with `cwebp -q 80`. Screens come from the prototype, so they follow it.

| File | What |
|---|---|
| `index.html`, `site.css`, `site.js` | The pages and their routes |
| `content.js`, `pages.js` | The words, Dutch first; a few on the design-choices page sit in `site.js` |
| `capture.cjs` | Captures the prototype's screens, in Dutch and English, light and dark |
| `build-legal.cjs` | Makes `legal.js` from `docs/legal`, so the legal pages show the current drafts |
| `assets/scenes/` | The miniatures |

## Images

A series of miniature 3D scenes, generated with Codex's built-in `image_gen` tool on the owner's ChatGPT subscription, with transparent backgrounds and no people, text or logos. An image stands on its own beside the words, and is never a background behind screens or text (owner). The owner chose miniatures in the light colouring, over objects, number posters and an all-pink version, and rejected empty rooms and screens only.

To keep the series consistent, make one master, then pass it with `-i` as a style reference for the others ("match its camera angle, base shape and size, materials, lighting and colours exactly"). Always run Codex with `</dev/null`, or it can wait forever.

**Shared style:** a premium 3D illustration with a high-end Blender render look. A miniature cutaway scene in isometric view, seen from the front right at about 30 degrees, standing on one thick square base with softly rounded corners. Soft matte clay materials with subtle bevels, soft global illumination and gentle ambient occlusion, warm light from the upper left, small crisp details, tidy and uncluttered, charming and calm.

**Colour:** warm white walls and base, pale grey, light oak wood, a little soft green from plants, with vivid pink #E6164A on two or three objects only.

| File | Scene |
|---|---|
| `gym` | A boutique gym room: squat rack, bench, dumbbell rack, a strip of turf with a sled, kettlebells, a steel-framed window |
| `pilates` | A bright studio: three reformers in a row, a tall arched window, rolled mats, a pilates ring |
| `yoga` | A warm room: four mats, cork blocks and bolsters, a paper floor lamp, a linen curtain |
| `pt` | A corner of a Dutch city park: a tree, a gravel path, a bench, an exercise mat with a kettlebell and a water bottle |
| `client` | The street front of a small Dutch studio: brick, a glass door, a bench with a sports bag, a Dutch bicycle |
