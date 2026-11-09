#!/usr/bin/env node
/*
 * Makes the AVIF files of the miniature scenes in apps/web/public/site-images/scenes, 400, 600 and
 * 800 px wide, from the 800 px WebP of each scene (<id>-800.webp). The page serves AVIF to the
 * browsers that take it (about a third of the WebP's size, which keeps the largest picture of a
 * phone's first screen small, AC15) and the WebP to the rest.
 *
 *   node docs/design/website/publish-scenes.cjs
 *
 * Needs sharp, which Next.js installs next to itself; nothing else is installed for this.
 */
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');

const web = path.resolve(__dirname, '../../../apps/web');
const scenes = path.join(web, 'public/site-images/scenes');
const sharp = createRequire(require.resolve('next/package.json', { paths: [web] }))('sharp');

(async () => {
  let count = 0;
  for (const file of fs.readdirSync(scenes).filter((name) => name.endsWith('-800.webp'))) {
    const id = file.replace('-800.webp', '');
    for (const width of [400, 600, 800]) {
      await sharp(path.join(scenes, file))
        .resize(width)
        .avif({ quality: 50, effort: 6 })
        .toFile(path.join(scenes, `${id}-${width}.avif`));
      count++;
    }
  }
  console.log(`published ${count} files to ${path.relative(process.cwd(), scenes)}`);
})();
