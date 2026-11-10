import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { brandFiles } from '../scripts/brand-icons.ts';

// #669: the favicon files and the wordmark of the website come from `docs/design/brand` by a script
// (`pnpm --filter @fivvi/web brand-icons`), never by hand. These tests fail when a committed file
// differs from what the script makes of the brand files today.
const webRoot = path.resolve(import.meta.dirname, '..');
const brandDir = path.resolve(webRoot, '../../docs/design/brand');
const brand = (name: string) => readFileSync(path.join(brandDir, name));

/** The width and height of a PNG: the IHDR chunk after the 8-byte signature. */
function pngSize(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

/** The RGBA of the first pixel of a PNG (8-bit RGBA): its first row has nothing above or to the left, so every filter leaves the byte as it is. */
function firstPixel(png: Buffer) {
  expect([png[24], png[25]]).toEqual([8, 6]);
  const data: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT') {
      data.push(png.subarray(at + 8, at + 8 + length));
    }
    at += length + 12;
  }
  return [...inflateSync(Buffer.concat(data)).subarray(1, 5)];
}

describe('#669 the brand files of the website', () => {
  it('has the files Next serves as the icons of every page, and the wordmark', async () => {
    const files = await brandFiles();

    expect(Object.keys(files).sort()).toEqual([
      'app/apple-icon.png',
      'app/favicon.ico',
      'app/icon.png',
      'app/icon.svg',
      'public/site-images/brand/fivvi-day-dial-dark.svg',
      'public/site-images/brand/fivvi-day-dial.svg',
      'public/site-images/brand/fivvi-logo-dark.svg',
      'public/site-images/brand/fivvi-logo.svg',
    ]);
  });

  it('serves the favicon and the wordmarks exactly as drawn', async () => {
    const files = await brandFiles();

    expect(files['app/icon.svg']).toEqual(brand('favicon.svg'));
    expect(files['public/site-images/brand/fivvi-logo.svg']).toEqual(brand('fivvi-logo.svg'));
    expect(files['public/site-images/brand/fivvi-logo-dark.svg']).toEqual(
      brand('fivvi-logo-dark.svg'),
    );
  });

  it('serves the plain day dial B2, light and dark, exactly as drawn: the mark of the trainer web sign-in below 768 px (#626)', async () => {
    const files = await brandFiles();

    expect(files['public/site-images/brand/fivvi-day-dial.svg']).toEqual(
      brand('day-dial/b2/fivvi-day-dial-b2-light.svg'),
    );
    expect(files['public/site-images/brand/fivvi-day-dial-dark.svg']).toEqual(
      brand('day-dial/b2/fivvi-day-dial-b2-dark.svg'),
    );
  });

  it('makes the PNG sizes: 180 for iOS, 192 for Android and search, an icon file with 32 and 48', async () => {
    const files = await brandFiles();

    expect(pngSize(files['app/apple-icon.png'] as Buffer)).toEqual([180, 180]);
    expect(pngSize(files['app/icon.png'] as Buffer)).toEqual([192, 192]);
    const ico = files['app/favicon.ico'] as Buffer;
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 2]);
    const entries = [0, 1].map((i) => {
      const entry = 6 + 16 * i;
      const image = ico
        .subarray(ico.readUInt32LE(entry + 12))
        .subarray(0, ico.readUInt32LE(entry + 8));
      return [ico[entry], ico[entry + 1], ...pngSize(image)];
    });
    expect(entries).toEqual([
      [32, 32, 32, 32],
      [48, 48, 48, 48],
    ]);
  });

  it('keeps the rounded corners of the favicon, but fills the whole square for iOS, which rounds it itself', async () => {
    const files = await brandFiles();

    expect(firstPixel(files['app/icon.png'] as Buffer)[3]).toBe(0);
    const [, , , alpha] = firstPixel(files['app/apple-icon.png'] as Buffer);
    expect(alpha).toBe(255);
  });

  it('are the committed files: running the script changes nothing', async () => {
    const files = await brandFiles();

    for (const [file, content] of Object.entries(files)) {
      expect(readFileSync(path.join(webRoot, file)).equals(content), `${file} is stale`).toBe(true);
    }
  });
});
