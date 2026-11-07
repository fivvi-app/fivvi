import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { sourceFiles } from '@fivvi/design-tokens/source';
import {
  coverage,
  decodePng,
  flatten,
  MARK_PATHS,
  POTRACE_TRANSFORM,
  parsePath,
  parseTransform,
  renderIcons,
  transformPath,
} from '../app-icon.mjs';
import { UNCOVERED_MESSAGE, uncovered } from './turbo-inputs.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
// Every file this test reads: turbo caches `//#test:root` by its `inputs`, so each must be one of them (last test below).
const reads = new Set();
const read = (path) => {
  reads.add(path);
  return readFileSync(join(ROOT, path));
};
const text = (path) => read(path).toString('utf8');

const IOS_SET = 'apps/ios/FivviPro/Assets.xcassets/AppIcon.appiconset';
const IOS_ICON = `${IOS_SET}/AppIcon.png`;
const PLAY_ICON = 'apps/android/app/src/main/ic_launcher-playstore.png';
const RES = 'apps/android/app/src/main/res';

// The colours the icon takes from the design tokens (light values, packages/design-tokens/tokens).
const tokenColour = (name) =>
  text('packages/design-tokens/generated/web/tokens.css').match(
    new RegExp(`--th-color-${name}: (#[0-9a-f]{6});`),
  )[1];
const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const pixel = (png, x, y) => [
  ...png.pixels.subarray((y * png.width + x) * 3, (y * png.width + x) * 3 + 3),
];

const near = (actual, expected, tolerance, message) =>
  assert.ok(
    actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance),
    `${message}: ${actual} is not within ${tolerance} of ${expected}`,
  );
const close = (actual, expected, tolerance = 1e-9, message = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} ${actual} is not ${expected}`);
const apply = (matrix, [x, y]) => [
  matrix[0] * x + matrix[2] * y + matrix[4],
  matrix[1] * x + matrix[3] * y + matrix[5],
];
/** The points of a path in the Android `pathData` form (M, L, C, Z with absolute coordinates). */
const androidPoints = (pathData) => parsePath(pathData).flatMap((command) => command.slice(1));

describe('E020 AC1: the path of the mark is handled exactly', () => {
  it('parses absolute and relative commands, with implicit repeats and compact numbers', () => {
    assert.deepEqual(parsePath('M1,2 L3,4 5,6 Z'), [['M', 1, 2], ['L', 3, 4], ['L', 5, 6], ['Z']]);
    // a first relative m is absolute; the numbers after it are relative lines
    assert.deepEqual(parsePath('m10 20 l5 0 0 5 z'), [
      ['M', 10, 20],
      ['L', 15, 20],
      ['L', 15, 25],
      ['Z'],
    ]);
    // a relative c has all three points relative to the start of the segment; two sets repeat the command
    assert.deepEqual(parsePath('M10 10 c1 2 3 4 5 6 1 1 2 2 3 3'), [
      ['M', 10, 10],
      ['C', 11, 12, 13, 14, 15, 16],
      ['C', 16, 17, 17, 18, 18, 19],
    ]);
    assert.deepEqual(parsePath('M0 0 C1 1 2 2 3 3'), [
      ['M', 0, 0],
      ['C', 1, 1, 2, 2, 3, 3],
    ]);
    assert.deepEqual(parsePath('M-1.5-2.5L.5-.25'), [
      ['M', -1.5, -2.5],
      ['L', 0.5, -0.25],
    ]);
  });

  it('continues from the start of the sub-path after a closing z', () => {
    assert.deepEqual(parsePath('M10 10 l5 0 z l1 1'), [
      ['M', 10, 10],
      ['L', 15, 10],
      ['Z'],
      ['L', 11, 11],
    ]);
  });

  it('refuses what potrace does not write: a missing number, an unknown command, numbers without a command', () => {
    assert.throws(() => parsePath('M1'), /number/);
    assert.throws(() => parsePath('M1 2 A1 1 0 0 1 2 2'), /command/);
    assert.throws(() => parsePath('1 2'), /command/);
    assert.throws(() => parsePath('M1 2 z 3 4'), /number/);
  });

  it('parses transforms and applies them left to right, outermost first', () => {
    const matrix = parseTransform('translate(10 20) scale(2)');
    assert.deepEqual(apply(matrix, [1, 1]), [12, 22]);
    assert.deepEqual(apply(parseTransform('scale(2) translate(10,20)'), [1, 1]), [22, 42]);
    assert.deepEqual(apply(parseTransform('translate(5) scale(1,-1)'), [1, 2]), [6, -2]);
    assert.throws(() => parseTransform('rotate(10)'), /transform/);
  });

  it('applies a transform to every point of a path, control points included', () => {
    const moved = transformPath(
      parsePath('M0 0 C1 0 2 1 3 3 Z'),
      parseTransform('translate(1 1) scale(2,-1)'),
    );
    assert.deepEqual(moved, [['M', 1, 1], ['C', 3, 1, 5, 0, 7, -2], ['Z']]);
  });

  it('flattens a straight cubic to its ends, a curve to points on it, and keeps closed sub-paths apart', () => {
    const [line] = flatten(parsePath('M0 0 C10 0 20 0 30 0 Z'), 0.01);
    assert.deepEqual(
      [line[0], line.at(-1)],
      [
        [0, 0],
        [30, 0],
      ],
    );
    assert.ok(line.every(([, y]) => y === 0));

    // a quarter circle of radius 100 as the cubic with the usual 0.5523 control distance
    const k = 55.2285;
    const [arc] = flatten(parsePath(`M100 0 C100 ${k} ${k} 100 0 100 Z`), 0.01);
    assert.ok(arc.length > 8, `${arc.length} points`);
    for (const [x, y] of arc) close(Math.hypot(x, y), 100, 0.05, 'a point off the circle');
    assert.deepEqual(
      [arc[0], arc.at(-1)],
      [
        [100, 0],
        [0, 100],
      ],
    );

    const two = flatten(parsePath('M0 0 L1 0 L1 1 Z M5 5 L6 5 L6 6 Z'), 0.01);
    assert.deepEqual(
      two.map((polyline) => polyline.length),
      [3, 3],
    );
  });

  it('covers the pixels a shape fills: whole, half, and nothing, with anti-aliasing on the edges', () => {
    // a square from (1, 1) to (3, 3) on a 4 px grid
    const square = flatten(parsePath('M1 1 L3 1 L3 3 L1 3 Z'), 0.01);
    const full = coverage(square, 4);
    assert.deepEqual([...full], [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]);

    // a quarter of the pixel (0, 0) and half of the pixel (1, 0)
    const part = coverage(flatten(parsePath('M0.5 0.5 L2 0.5 L2 1 L0.5 1 Z'), 0.01), 4);
    close(part[0], 0.25);
    close(part[1], 0.5);
    close(part[2], 0);
  });

  it('fills by the non-zero rule: an inner shape in the same direction stays filled, in the opposite one it is a hole', () => {
    const outer = 'M0 0 L8 0 L8 8 L0 8 Z';
    const same = coverage(flatten(parsePath(`${outer} M2 2 L6 2 L6 6 L2 6 Z`), 0.01), 8);
    assert.equal(same[4 * 8 + 4], 1);
    const hole = coverage(flatten(parsePath(`${outer} M2 2 L2 6 L6 6 L6 2 Z`), 0.01), 8);
    assert.equal(hole[4 * 8 + 4], 0);
    assert.equal(hole[1 * 8 + 1], 1);
  });

  it('draws the traced path of docs/design/brand/fivvi-mark-white.svg, copied unchanged', () => {
    assert.equal(MARK_PATHS.length, 4);
    // The four `d` attributes of that file, joined by a newline; this fails when the copy in the script is touched.
    assert.equal(
      createHash('sha256').update(MARK_PATHS.join('\n')).digest('hex'),
      '08931331fb4fe1e8a959eb37a210cd16ec812619b78e23b5241c99419f399df2',
    );
    for (const d of MARK_PATHS) {
      const commands = parsePath(d);
      assert.deepEqual(
        [...new Set(commands.map(([command]) => command))].sort(),
        ['C', 'M', 'Z'],
        'potrace writes only m, c and z',
      );
      assert.equal(commands.filter(([command]) => command === 'M').length, 1);
    }
  });
});

describe('E017 AC8: the app icon is generated from the design tokens', () => {
  it('the committed icon files are what the script generates', async () => {
    const files = await renderIcons(ROOT);

    assert.ok(files.size >= 9, [...files.keys()].join(', '));
    for (const [path, content] of files) {
      assert.ok(existsSync(join(ROOT, path)), `${path} is missing: run pnpm app-icon`);
      if (path.endsWith('.png')) {
        const committed = decodePng(read(path));
        const generated = decodePng(content);
        assert.deepEqual(
          [committed.width, committed.height, committed.colorType],
          [generated.width, generated.height, generated.colorType],
          path,
        );
        assert.ok(committed.pixels.equals(generated.pixels), `${path} is stale: run pnpm app-icon`);
      } else {
        assert.equal(text(path), content, `${path} is stale: run pnpm app-icon`);
      }
    }
  });

  it('the App Store icon is 1024 px square without transparency: the white mark on the pink gradient of the brand', () => {
    const png = decodePng(read(IOS_ICON));
    const pink = rgb(tokenColour('action-primary-bg'));
    const white = rgb(tokenColour('action-primary-fg'));

    assert.deepEqual([png.width, png.height], [1024, 1024]);
    assert.equal(
      png.colorType,
      2,
      'RGB without an alpha channel: the App Store refuses transparency',
    );
    // The gradient runs from #FF4F7B at the top right through the pink of the primary action to #B80F3A at the bottom.
    near(pixel(png, 2, 2), pink, 3, 'top left, on the middle stop of the gradient');
    assert.ok(
      pixel(png, 1021, 2).every((v, i) => v >= pink[i]) && pixel(png, 1021, 2)[2] > pink[2] + 60,
      'top right is lighter than pink: #FF4F7B and the soft light',
    );
    near(pixel(png, 2, 1021), rgb('#b80f3a'), 12, 'bottom left: the dark end');
    // The middle of the spark (the layout of the brand SVG puts it at about 509, 275) is white.
    assert.deepEqual(pixel(png, 509, 275), white, 'the spark is white');
  });

  it('the dark and tinted icons are the pink mark on near-black and the white mark on grey', () => {
    const dark = decodePng(read(`${IOS_SET}/AppIcon-Dark.png`));
    const tinted = decodePng(read(`${IOS_SET}/AppIcon-Tinted.png`));

    for (const png of [dark, tinted]) {
      assert.deepEqual([png.width, png.height, png.colorType], [1024, 1024, 2]);
    }
    near(pixel(dark, 512, 2), rgb('#2a2a2d'), 2, 'dark: top');
    near(pixel(dark, 512, 1021), rgb('#0b0b0c'), 2, 'dark: bottom');
    assert.deepEqual(
      pixel(dark, 509, 275),
      rgb(tokenColour('action-primary-bg')),
      'dark: pink mark',
    );
    near(pixel(tinted, 512, 2), rgb('#6e6e73'), 2, 'tinted: top');
    near(pixel(tinted, 512, 1021), rgb('#3a3a3c'), 2, 'tinted: bottom');
    assert.deepEqual(
      pixel(tinted, 509, 275),
      rgb(tokenColour('action-primary-fg')),
      'tinted: white mark',
    );
  });

  it('the Play Store icon is 512 px square, the same layout as the App Store icon', () => {
    const png = decodePng(read(PLAY_ICON));
    const ios = decodePng(read(IOS_ICON));

    assert.deepEqual([png.width, png.height, png.colorType], [512, 512, 2]);
    near(pixel(png, 1, 1), rgb(tokenColour('action-primary-bg')), 3, 'top left');
    assert.deepEqual(pixel(png, 254, 137), rgb(tokenColour('action-primary-fg')), 'the spark');
    near(pixel(png, 300, 300), pixel(ios, 600, 600), 4, 'half the size of the App Store icon');
  });

  it('the asset catalog declares the light, dark and tinted icons, and the project builds it', () => {
    const contents = JSON.parse(text(`${IOS_SET}/Contents.json`));

    assert.deepEqual(
      contents.images.map(({ filename, size, platform, appearances }) => [
        filename,
        size,
        platform,
        appearances?.map(({ appearance, value }) => `${appearance}=${value}`),
      ]),
      [
        ['AppIcon.png', '1024x1024', 'ios', undefined],
        ['AppIcon-Dark.png', '1024x1024', 'ios', ['luminosity=dark']],
        ['AppIcon-Tinted.png', '1024x1024', 'ios', ['luminosity=tinted']],
      ],
    );
    assert.match(
      text('apps/ios/FivviPro.xcodeproj/project.pbxproj'),
      /ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/,
    );
  });

  it('the Android icon is adaptive, with a background, a foreground and a monochrome layer for themed icons', () => {
    const icon = text(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`);

    for (const layer of ['background', 'foreground', 'monochrome']) {
      const drawable = icon.match(new RegExp(`<${layer} android:drawable="@drawable/(\\w+)"`))?.[1];
      assert.ok(drawable, `no ${layer} layer`);
      assert.ok(
        existsSync(join(ROOT, `${RES}/drawable/${drawable}.xml`)),
        `${drawable}.xml is missing`,
      );
    }
    assert.match(
      text('apps/android/app/src/main/AndroidManifest.xml'),
      /android:icon="@mipmap\/ic_launcher"/,
    );
  });

  it('the Android mark stays inside the 66 dp safe zone of the 108 dp icon, control points included', () => {
    for (const layer of ['foreground', 'monochrome']) {
      const path = text(`${RES}/drawable/ic_launcher_${layer}.xml`).match(
        /android:pathData="([^"]+)"/,
      )[1];
      const points = androidPoints(path);
      assert.ok(points.length > 100, `${layer}: ${points.length} numbers`);
      for (let i = 0; i < points.length; i += 2) {
        assert.ok(
          Math.hypot(points[i] - 54, points[i + 1] - 54) <= 33,
          `${layer}: (${points[i]}, ${points[i + 1]}) is outside the safe zone`,
        );
      }
    }
  });

  it('the Android mark is the traced shape: the same commands, every point moved by one scale and shift', () => {
    const original = MARK_PATHS.flatMap((d) =>
      transformPath(parsePath(d), parseTransform(POTRACE_TRANSFORM)),
    );
    const path = text(`${RES}/drawable/ic_launcher_foreground.xml`);
    const drawn = parsePath(path.match(/android:pathData="([^"]+)"/)[1]);

    assert.deepEqual(
      drawn.map(([command]) => command),
      original.map(([command]) => command),
    );
    const a = original.flatMap((command) => command.slice(1));
    const b = drawn.flatMap((command) => command.slice(1));
    // one scale and shift keeps every distance between points in proportion: compare them with the first point,
    // taking the scale from the point furthest from it (the rounding to three decimals counts least there)
    const from = (points, i) => Math.hypot(points[i] - points[0], points[i + 1] - points[1]);
    let furthest = 2;
    for (let i = 2; i < a.length; i += 2) if (from(a, i) > from(a, furthest)) furthest = i;
    const scale = from(b, furthest) / from(a, furthest);
    assert.ok(scale > 0.05 && scale < 0.3, `scale ${scale}`);
    for (let i = 0; i < a.length; i += 2) {
      close(from(b, i), scale * from(a, i), 0.01, `point ${i / 2}`);
    }
    // the monochrome layer is the same mark
    const mono = text(`${RES}/drawable/ic_launcher_monochrome.xml`);
    assert.equal(
      mono.match(/android:pathData="([^"]+)"/)[1],
      path.match(/android:pathData="([^"]+)"/)[1],
    );
  });

  it('the Android background is the pink gradient and the foreground is white', () => {
    const background = text(`${RES}/drawable/ic_launcher_background.xml`);
    const pink = tokenColour('action-primary-bg').slice(1).toUpperCase();

    assert.match(background, /<aapt:attr name="android:fillColor">/);
    assert.match(background, /android:type="linear"/);
    assert.match(background, /android:color="#FFFF4F7B"/);
    assert.match(background, new RegExp(`android:color="#FF${pink}"`));
    assert.match(background, /android:color="#FFB80F3A"/);
    assert.match(
      text(`${RES}/drawable/ic_launcher_foreground.xml`),
      new RegExp(
        `android:fillColor="#FF${tokenColour('action-primary-fg').slice(1).toUpperCase()}"`,
      ),
    );
  });
});

describe('E017 AC8: a change to what the icon depends on is not served from the test cache', () => {
  it('turbo.json lists as inputs of the root tests every file the icon test and the generator read', () => {
    // What the generator reads that the test does not read itself: the token source files (as the token package names
    // them), the package's `./source` export and the script.
    const depends = new Set([
      ...reads,
      ...[
        sourceFiles.palette,
        sourceFiles.light,
        sourceFiles.dark,
        ...sourceFiles.shared,
        sourceFiles.contrastPairs,
      ].map((file) => `packages/design-tokens/${file}`),
      'packages/design-tokens/src/source.ts',
      'packages/design-tokens/package.json',
      'scripts/app-icon.mjs',
    ]);
    assert.deepEqual(uncovered([...depends]), [], UNCOVERED_MESSAGE);
  });
});
