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
| `assets/photos/` | The images |

## Images

Generated with Codex's built-in `image_gen` tool on the owner's ChatGPT subscription, with transparent backgrounds and no people, text or logos. An image stands on its own beside the words, and is never a background behind screens or text (owner). The owner is choosing between three styles at `#beeld`; the unused ones then leave this folder.

- **Objects** (`obj-*`): *clean Apple-like product photography of one simple matte fitness object group, soft even studio light, a subtle soft contact shadow, one crisp accent colour of vivid pink #E6164A, everything else black, white or grey.*
- **Miniatures** (`min-*`): *a miniature isometric 3D diorama on a small rounded square base, matte clay materials, soft even light, simple rounded forms, tidy and calm, palette of white, light grey and charcoal with one crisp accent colour of vivid pink #E6164A.*
- **Numbers:** no images. The app's gradient card as a poster, in CSS.

Rejected by the owner: empty rooms (they looked like stock photos) and screens only (the pages already have screens).
