// The favicon files and the wordmark of the website and the app, made from the brand files in
// docs/design/brand (F064, #669). Never edited by hand:
//
//   pnpm --filter @fivvi/web brand-icons     write the files below
//   test/brand-icons.test.ts                 fails when a committed file differs from what this makes
//
// Output, written where Next.js serves it (app/ icon files are metadata files: Next adds the
// <link> tags of every page, the site's and the app's, and serves them at /icon.svg and so on):
//   app/icon.svg                             favicon.svg as drawn, unchanged
//   app/favicon.ico                          32 and 48 px PNGs in one ICO file, the fallback browsers ask for
//   app/icon.png                             192 px, for Android and search results (a multiple of 48)
//   app/apple-icon.png                       180 px, the iOS home-screen icon: the whole square, with no
//                                            rounded clip, which iOS applies itself (an empty corner turns black)
//   public/site-images/brand/fivvi-logo.svg, fivvi-logo-dark.svg    the wordmarks as drawn, for the header and footer
//   public/site-images/brand/fivvi-day-dial.svg, fivvi-day-dial-dark.svg    the plain day dial B2 as drawn (light is
//                                            favicon.svg's mark), the sign-in mark of the trainer web below 768 px (#626)
//   ../android/app/src/main/res/drawable-nodpi/fivvi_pro_dial_{light,dark}.png    512 px, the day dial B2 with PRO
//                                            (day-dial/b2-pro), the sign-in mark of Fivvi Pro on Android (E020, #632); Android has no SVG
//   ../android/client/src/main/res/drawable-nodpi/fivvi_dial_{light,dark}.png    512 px, the plain day dial B2
//                                            (day-dial/b2), the sign-in mark of the client app Fivvi on Android (E020, #634)
//
// No dependency: next/og (satori and resvg, which already draw the share images) rasterises the SVG,
// and the ICO is a header around the PNGs. The same input gives the same bytes.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImageResponse } from 'next/og.js';
import { createElement } from 'react';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.resolve(webRoot, '../../docs/design/brand');

/** The rounded corners of favicon.svg: the clip every drawn layer sits in. */
const ROUNDED_CLIP = '<rect width="100" height="100" rx="22.4"/>';
const SQUARE_CLIP = '<rect width="100" height="100"/>';

/** An SVG as a PNG of `size` px, with its alpha (the corners outside a rounded clip stay empty). */
async function rasterise(svg: Buffer | string, size: number): Promise<Buffer> {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const response = new ImageResponse(createElement('img', { src, width: size, height: size }), {
    width: size,
    height: size,
  });
  return Buffer.from(await response.arrayBuffer());
}

/** An ICO file that holds PNG images (supported since Windows Vista and by every browser). */
export function ico(images: readonly { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); // an icon file
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    header[entry] = size;
    header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

/** Every generated file, by its path from `apps/web`. */
export async function brandFiles(): Promise<Record<string, Buffer>> {
  const brand = (name: string) => readFile(path.join(brandDir, name));
  const favicon = await brand('favicon.svg');
  const faviconText = favicon.toString('utf8');
  if (!faviconText.includes(ROUNDED_CLIP)) {
    throw new Error('favicon.svg no longer has the rounded clip this script removes for iOS');
  }
  const square = faviconText.replace(ROUNDED_CLIP, SQUARE_CLIP);
  const [png32, png48, png192, apple] = await Promise.all([
    rasterise(favicon, 32),
    rasterise(favicon, 48),
    rasterise(favicon, 192),
    rasterise(square, 180),
  ]);
  const [proLight, proDark] = await Promise.all(
    ['light', 'dark'].map(async (mode) =>
      rasterise(await brand(`day-dial/b2-pro/fivvi-day-dial-b2-pro-${mode}.svg`), 512),
    ),
  );
  const [plainLight, plainDark] = await Promise.all(
    ['light', 'dark'].map(async (mode) =>
      rasterise(await brand(`day-dial/b2/fivvi-day-dial-b2-${mode}.svg`), 512),
    ),
  );
  return {
    '../android/client/src/main/res/drawable-nodpi/fivvi_dial_light.png': plainLight as Buffer,
    '../android/client/src/main/res/drawable-nodpi/fivvi_dial_dark.png': plainDark as Buffer,
    '../android/app/src/main/res/drawable-nodpi/fivvi_pro_dial_light.png': proLight as Buffer,
    '../android/app/src/main/res/drawable-nodpi/fivvi_pro_dial_dark.png': proDark as Buffer,
    'app/icon.svg': favicon,
    'app/favicon.ico': ico([
      { size: 32, png: png32 },
      { size: 48, png: png48 },
    ]),
    'app/icon.png': png192,
    'app/apple-icon.png': apple,
    'public/site-images/brand/fivvi-logo.svg': await brand('fivvi-logo.svg'),
    'public/site-images/brand/fivvi-logo-dark.svg': await brand('fivvi-logo-dark.svg'),
    'public/site-images/brand/fivvi-day-dial.svg': await brand(
      'day-dial/b2/fivvi-day-dial-b2-light.svg',
    ),
    'public/site-images/brand/fivvi-day-dial-dark.svg': await brand(
      'day-dial/b2/fivvi-day-dial-b2-dark.svg',
    ),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [file, content] of Object.entries(await brandFiles())) {
    const target = path.join(webRoot, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
    console.log(`wrote ${file}`);
  }
}
