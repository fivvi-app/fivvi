#!/usr/bin/env node
/*
 * Publishes screens for the real website: turns the PNGs capture.cjs wrote into the responsive
 * WebP files the pages serve, in apps/web/public/site-images/shots.
 *
 *   node docs/design/website/publish-shots.cjs <folder with the PNGs> <shot-id ...>
 *
 * Every id is published in Dutch and English, light and dark (`<id>-<lang>-<mode>-<width>.webp`).
 * A phone is published 320 and 640 px wide, a trainer-web screen (web-*) 640 and 1280 px wide.
 * The ids a page uses are in apps/web/site/home/screens.ts; a test there fails when a file is
 * missing, so publish exactly what it lists. Needs cwebp (`brew install webp`).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const out = path.resolve(__dirname, '../../../apps/web/public/site-images/shots');
const [from, ...ids] = process.argv.slice(2);
if (!from || ids.length === 0) {
  console.error('usage: publish-shots.cjs <folder with the PNGs> <shot-id ...>');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

let count = 0;
for (const id of ids) {
  const widths = /^web-/.test(id) ? [640, 1280] : [320, 640];
  for (const lang of ['nl', 'en']) {
    for (const mode of ['light', 'dark']) {
      const png = path.join(from, `${id}-${lang}-${mode}.png`);
      if (!fs.existsSync(png)) throw new Error(`missing ${png}: run capture.cjs first`);
      for (const width of widths) {
        const file = path.join(out, `${id}-${lang}-${mode}-${width}.webp`);
        execFileSync('cwebp', ['-quiet', '-q', '80', '-alpha_q', '80', '-resize', String(width), '0', png, '-o', file]);
        count++;
      }
    }
  }
}
console.log(`published ${count} files to ${path.relative(process.cwd(), out)}`);
