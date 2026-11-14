import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { crc32 } from 'node:zlib';
import {
  coverage,
  decodePng,
  FIVE_PATHS,
  flatten,
  PRO,
  parsePath,
  renderIcons,
  strokeOutline,
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
/** Android: the 100 unit design on the 72 dp the launcher shows of the 108 dp layer. */
const ANDROID_SCALE = 72 / 100;

const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const pixel = (png, x, y) => [
  ...png.pixels.subarray((y * png.width + x) * 3, (y * png.width + x) * 3 + 3),
];
/** The pixel of the 1024 px icon under the point (x, y) of the 100 x 100 design. */
const at = (png, x, y) =>
  pixel(png, Math.floor((x * png.width) / 100), Math.floor((y * png.width) / 100));
const mix = (from, to, share) => from.map((value, i) => value + (to[i] - value) * share);

/** The colour of the background gradient of the design (objectBoundingBox from (.8, 0) to (.2, 1)) at (x, y) of 100. */
const backgroundAt = (top, bottom, x, y) => {
  const [u, v] = [x / 100, y / 100];
  const t = Math.min(1, Math.max(0, ((u - 0.8) * -0.6 + v) / (0.36 + 1)));
  return mix(rgb(top), rgb(bottom), t);
};

const near = (actual, expected, tolerance, message) =>
  assert.ok(
    actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance),
    `${message}: ${actual} is not within ${tolerance} of ${expected}`,
  );
const close = (actual, expected, tolerance = 1e-9, message = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} ${actual} is not ${expected}`);
/** The coordinates of a path in the Android `pathData` form (M, L, C, Q and Z, absolute), as a flat list. */
const androidPoints = (pathData) => parsePath(pathData).flatMap((command) => command.slice(1));
/** The paths of an Android vector: the data, the plain fill, the gradient's ends and its colours. */
const androidPaths = (file) =>
  text(file)
    .split('<path')
    .slice(1)
    .map((element) => ({
      d: element.match(/android:pathData="([^"]+)"/)[1],
      fill: element.match(/android:fillColor="([^"]+)"/)?.[1],
      stroke: {
        colour: element.match(/android:strokeColor="([^"]+)"/)?.[1],
        width: Number(element.match(/android:strokeWidth="([^"]+)"/)?.[1]),
        cap: element.match(/android:strokeLineCap="([^"]+)"/)?.[1],
        join: element.match(/android:strokeLineJoin="([^"]+)"/)?.[1],
      },
      gradient: Object.fromEntries(
        [...element.matchAll(/android:(startX|startY|endX|endY)="([^"]+)"/g)].map(
          ([, key, value]) => [key, Number(value)],
        ),
      ),
      colours: [...element.matchAll(/android:color="(#\w+)"/g)].map(([, colour]) => colour),
    }));
const distinctCommands = (commands) => [...new Set(commands.map(([command]) => command))].sort();
const onCircle = (points, [cx, cy], radius, message) => {
  for (const [x, y] of points) close(Math.hypot(x - cx, y - cy), radius, 0.05, message);
};

describe('E020 AC1: the path data of the day dial is handled exactly', () => {
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

  it('reads a quadratic curve, absolute or relative, with implicit repeats', () => {
    assert.deepEqual(parsePath('M0 0 Q1 2 3 4'), [
      ['M', 0, 0],
      ['Q', 1, 2, 3, 4],
    ]);
    assert.deepEqual(parsePath('M10 10 q1 2 3 4 1 1 2 2'), [
      ['M', 10, 10],
      ['Q', 11, 12, 13, 14],
      ['Q', 14, 15, 15, 16],
    ]);
  });

  it('flattens a quadratic curve to points on the parabola', () => {
    // B(t) = (10t, 20t(1-t)) is the parabola y = 2x - x^2 / 5
    const [curve] = flatten(parsePath('M0 0 Q5 10 10 0'), 0.01);
    assert.ok(curve.length > 8, `${curve.length} points`);
    for (const [x, y] of curve) close(y, 2 * x - (x * x) / 5, 1e-9, 'a point off the curve');
    assert.deepEqual(
      [curve[0], curve.at(-1)],
      [
        [0, 0],
        [10, 0],
      ],
    );
  });

  it('turns an arc into cubics: a quarter circle is one cubic with the usual control distance', () => {
    const k = 0.5522847498 * 10;
    const [move, cubic, ...rest] = parsePath('M10 0 A10 10 0 0 1 0 10');
    assert.deepEqual(move, ['M', 10, 0]);
    assert.deepEqual(rest, []);
    assert.equal(cubic[0], 'C');
    cubic.slice(1).forEach((value, i) => {
      close(value, [10, k, k, 10, 0, 10][i], 1e-6, `coordinate ${i}`);
    });
  });

  it('chooses the centre of the arc by its large-arc and sweep flags', () => {
    // from (0, 0) to (10, 10) on a circle of radius 10: the centre is (10, 0) or (0, 10)
    const points = (flags) => flatten(parsePath(`M0 0 A10 10 0 ${flags} 10 10`), 0.01)[0];
    // small arc, clockwise on screen (sweep 1): around (0, 10), a quarter turn, one cubic
    onCircle(points('0 1'), [0, 10], 10, 'small, sweep 1');
    assert.equal(parsePath('M0 0 A10 10 0 0 1 10 10').length, 2);
    // small arc, the other way: around (10, 0)
    onCircle(points('0 0'), [10, 0], 10, 'small, sweep 0');
    // large arc, clockwise: around (10, 0), three quarters, so more than one cubic
    onCircle(points('1 1'), [10, 0], 10, 'large, sweep 1');
    assert.equal(parsePath('M0 0 A10 10 0 1 1 10 10').length, 4);
    // large arc, the other way: around (0, 10)
    onCircle(points('1 0'), [0, 10], 10, 'large, sweep 0');
    // the large arc passes the point (-10, 0)'s side of the chord; the small arc does not
    assert.ok(points('1 1').some(([x, y]) => x > 19.9 || y < -9.9));
    assert.ok(points('0 1').every(([x, y]) => x <= 10.01 && y >= -0.01));
  });

  it('reads a relative arc by its end point only', () => {
    assert.deepEqual(parsePath('M10 0 a10 10 0 0 1 -10 10'), parsePath('M10 0 A10 10 0 0 1 0 10'));
  });

  it('draws an ellipse arc, turned by the rotation, on the ellipse', () => {
    // x^2 / 20^2 + y^2 / 10^2 = 1, a quarter from (20, 0) to (0, 10)
    for (const [x, y] of flatten(parsePath('M20 0 A20 10 0 0 1 0 10'), 0.01)[0]) {
      close((x / 20) ** 2 + (y / 10) ** 2, 1, 1e-3, 'a point off the ellipse');
    }
    // turned by 90 degrees the long axis points down: x^2 / 10^2 + y^2 / 20^2 = 1, from (10, 0) to (0, 20)
    for (const [x, y] of flatten(parsePath('M10 0 A20 10 90 0 1 0 20'), 0.01)[0]) {
      close((x / 10) ** 2 + (y / 20) ** 2, 1, 1e-3, 'a point off the turned ellipse');
    }
  });

  it('scales radii that are too small up until the arc reaches its end, and draws a line for no radius', () => {
    // a radius of 1 cannot span 10: the half circle around (5, 0) with radius 5
    const half = flatten(parsePath('M0 0 A1 1 0 0 1 10 0'), 0.01)[0];
    onCircle(half, [5, 0], 5, 'a half circle');
    assert.deepEqual(parsePath('M0 0 A0 5 0 0 1 10 0'), [
      ['M', 0, 0],
      ['L', 10, 0],
    ]);
    // the same end point draws nothing
    assert.deepEqual(parsePath('M3 3 A5 5 0 0 1 3 3'), [['M', 3, 3]]);
  });

  it('refuses what the day dial does not use: a missing number, an unknown command, numbers without a command', () => {
    assert.throws(() => parsePath('M1'), /number/);
    assert.throws(() => parsePath('M1 2 A1 1 0 0 1 2'), /number/);
    assert.throws(() => parsePath('M1 2 H3'), /command/);
    assert.throws(() => parsePath('1 2'), /command/);
    assert.throws(() => parsePath('M1 2 z 3 4'), /number/);
  });

  it('applies a transform to every point of a path, control points included', () => {
    const moved = transformPath(parsePath('M0 0 C1 0 2 1 3 3 Q1 2 3 4 Z'), [2, 0, 0, -1, 1, 1]);
    assert.deepEqual(moved, [['M', 1, 1], ['C', 3, 1, 5, 0, 7, -2], ['Q', 3, -1, 7, -3], ['Z']]);
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
    onCircle(arc, [0, 0], 100, 'a point off the circle');
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

  it('draws the five sectors of docs/design/brand/day-dial/b2/layers/3-five.svg, copied unchanged', () => {
    assert.equal(FIVE_PATHS.length, 5);
    // The five `d` attributes of that file, joined by a newline: their length and CRC-32 (the number, not a secret).
    // This fails when the copy in the script is touched.
    const joined = FIVE_PATHS.join('\n');
    assert.deepEqual([joined.length, crc32(joined)], [949, 2922639480]);
    for (const d of FIVE_PATHS) {
      assert.match(d, /A34 34 0 0 1/, 'an outer arc');
      assert.match(d, /A17 17 0 0 0/, 'an inner arc');
      assert.match(d, /Q/, 'a rounded corner');
      const commands = parsePath(d);
      assert.deepEqual(distinctCommands(commands), ['C', 'L', 'M', 'Q', 'Z']);
      assert.equal(commands.filter(([command]) => command === 'M').length, 1);
    }
  });
});

describe('E020 #672 AC1: PRO is drawn from the path data of b2-pro/layers/4-pro.svg, as round strokes', () => {
  /** The sum of the coverage: the area, in pixels, of what the polygons fill. */
  const area = (polylines, size) =>
    coverage(polylines, size).reduce((sum, share) => sum + share, 0);
  const stroked = (d, width, size = 16) =>
    coverage(strokeOutline(flatten(parsePath(d), 0.01), width), size);

  it('strokes a line with a round cap beyond each end: a half disc, not a square', () => {
    // a line from (2, 4) to (10, 4), 2 wide, on a 12 px grid
    const line = stroked('M2 4 L10 4', 2, 12);
    for (const x of [2, 5, 9]) {
      close(line[3 * 12 + x], 1, 1e-9, `row 3, column ${x}`);
      close(line[4 * 12 + x], 1, 1e-9, `row 4, column ${x}`);
      close(line[2 * 12 + x], 0, 1e-9, `row 2, column ${x}`);
      close(line[5 * 12 + x], 0, 1e-9, `row 5, column ${x}`);
    }
    // the cap is a half disc of radius 1: a quarter of it in each of the two pixels next to the end
    close(line[3 * 12 + 1], Math.PI / 4, 0.03, 'a quarter disc');
    close(line[4 * 12 + 10], Math.PI / 4, 0.03, 'a quarter disc at the other end');
    close(line[3 * 12 + 0], 0, 1e-9, 'nothing beyond the cap');
    close(line[4 * 12 + 11], 0, 1e-9, 'nothing beyond the cap, right');
  });

  it('rounds the outside of a corner and fills the inside once, whichever way the line runs', () => {
    const corner = stroked('M2 2 L8 2 L8 8', 2, 12);
    // a mitre would fill the whole pixel (8, 1) of the outer corner; a round join a quarter disc
    close(corner[1 * 12 + 8], Math.PI / 4, 0.03, 'the outer corner is round');
    close(corner[2 * 12 + 7], 1, 1e-9, 'the inside of the corner is filled');
    assert.deepEqual(
      [...stroked('M8 8 L8 2 L2 2', 2, 12)].map((v) => Math.round(v * 20)),
      [...corner].map((v) => Math.round(v * 20)),
    );
  });

  it('strokes a curve with its width all along: a half circle of radius 10 is pi x 10 x 2 and two caps', () => {
    const half = flatten(parsePath('M10 20 A10 10 0 0 1 30 20'), 0.01);
    // the length of the half circle times the width, plus the disc the two half-disc caps make
    close(area(strokeOutline(half, 2), 40), Math.PI * 10 * 2 + Math.PI, 0.4, 'the area');
    // the width is the same at the top of the arc: the 2 units from y = 9 to y = 11
    const top = coverage(strokeOutline(half, 2), 40);
    close(top[9 * 40 + 20], 1, 1e-9, 'the arc at the top, inside');
    close(top[8 * 40 + 20], 0, 1e-9, 'and not outside it');
  });

  it('draws PRO from the path data of 4-pro.svg, copied unchanged', () => {
    // The two `d` of the P and the R of that file, joined by a newline: their length and CRC-32 (not a secret).
    // This fails when the copy in the script is touched.
    const joined = PRO.letters
      .slice(0, 2)
      .map(({ d }) => d)
      .join('\n');
    assert.deepEqual([joined.length, crc32(joined)], [112, 436934462]);
    // the O is an ellipse in the file, not a path; its numbers, and where each letter's box starts, from the file
    assert.deepEqual(PRO.ellipse, { cx: 9.8, cy: 0, rx: 3.6, ry: 5 });
    assert.deepEqual(
      PRO.letters.map(({ at }) => at),
      [
        [-13.5, -5],
        [-3.6, -5],
        [0, 0],
      ],
    );
    // 2.63 in the letter box, scaled by 0.95 about the middle: the stroke of 2.5 of the ticket
    assert.deepEqual([PRO.scale, PRO.width], [0.95, 2.63]);
    close(PRO.scale * PRO.width, 2.5, 0.005, 'the stroke width in the design');
  });

  it('PRO is 27 units wide and centred on the middle of the design: cap height 9.5, the letters 3.6 apart', () => {
    const [p, r, o] = PRO.letters;
    const [width, gap] = [27.0, 3.6];
    assert.equal(p.at[0] + width / 2, 0, 'the row is centred');
    // widths 6.3, 6.1 and 7.4 with 3.6 between them
    close(r.at[0] - p.at[0], 6.3 + gap, 1e-9, 'P to R');
    // the O's box is 7.4 wide around its ellipse (rx 3.6 is the line, the box allows for the stroke)
    const box = PRO.ellipse.cx - 7.4 / 2;
    close(box - r.at[0], 6.1 + gap, 1e-9, 'R to O');
    close(PRO.ellipse.cx + 7.4 / 2 - p.at[0], width, 1e-9, 'the whole row');
    assert.equal(
      o.at.every((value) => value === 0),
      true,
    );
    assert.equal(p.at[1] + 10 / 2, 0, 'the letter box of 10 is centred vertically');
    close(PRO.scale * 10, 9.5, 1e-9, 'cap height');
  });
});

describe('E017 AC8: the app icon is generated, not drawn by hand', () => {
  it('the committed icon files are what the script generates', () => {
    const files = renderIcons();

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
});

describe('E020 AC2: the iOS icons are the light, dark and tinted day dial', () => {
  // The fill of the second sector (the 12 o'clock one on the right) runs from its top to its bottom.
  const sector = flatten(parsePath(FIVE_PATHS[1]), 0.01)[0];
  const [top, bottom] = [
    Math.min(...sector.map(([, y]) => y)),
    Math.max(...sector.map(([, y]) => y)),
  ];
  const fiveAt = (y) => mix(rgb('#ff4f7b'), rgb('#c8103d'), (y - top) / (bottom - top));
  const ios = (name) => decodePng(read(`${IOS_SET}/${name}`));

  it('AppIcon.png is 1024 px RGB without alpha: the light gradient, the grey track and the pink sectors', () => {
    const png = ios('AppIcon.png');

    assert.deepEqual([png.width, png.height], [1024, 1024]);
    assert.equal(
      png.colorType,
      2,
      'RGB without an alpha channel: the App Store refuses transparency',
    );
    // no rounded clip: iOS masks the icon itself, so the corners are the gradient
    assert.deepEqual(pixel(png, 1021, 2), [255, 255, 255], 'top right: #FFFFFF');
    near(pixel(png, 2, 1021), rgb('#ececf1'), 1, 'bottom left: #ECECF1');
    near(pixel(png, 2, 2), backgroundAt('#ffffff', '#ececf1', 0.1, 0.1), 1, 'top left');
    // the track at 1:30 on the dial, away from every sector
    near(at(png, 68.03, 31.97), rgb('#e4e4ea'), 1, 'the track');
    // inside the dial and outside it the background shows
    // the middle of the dial holds PRO; the empty dial left of it shows the background
    near(at(png, 30, 50), backgroundAt('#ffffff', '#ececf1', 30, 50), 1, 'inside the dial');
    near(
      at(png, 73.3, 26.7),
      backgroundAt('#ffffff', '#ececf1', 73.3, 26.7),
      2,
      'outside the track',
    );
    // each sector has its own gradient from its top to its bottom
    near(at(png, 57.5, 20), fiveAt(20), 4, 'a sector near its top');
    near(at(png, 57.5, 31), fiveAt(31), 4, 'a sector near its bottom');
  });

  it('the sectors cast a soft shadow below them', () => {
    const png = ios('AppIcon.png');
    const bare = backgroundAt('#ffffff', '#ececf1', 57.5, 36);
    // 2 units under the sector's inner edge, inside the dial
    const shadowed = at(png, 57.5, 36);
    assert.ok(
      shadowed.every((value, i) => value < bare[i] - 4),
      `${shadowed} is not darker than ${bare}`,
    );
  });

  it('the dark icon: near-black gradient, the track as 10 % white, the same pink sectors', () => {
    const png = ios('AppIcon-Dark.png');

    assert.deepEqual([png.width, png.height, png.colorType], [1024, 1024, 2]);
    near(pixel(png, 1021, 2), rgb('#2c2c2e'), 1, 'top right');
    near(pixel(png, 2, 1021), rgb('#0b0b0c'), 1, 'bottom left');
    const track = mix(backgroundAt('#2c2c2e', '#0b0b0c', 68.03, 31.97), [255, 255, 255], 26 / 255);
    near(at(png, 68.03, 31.97), track, 1.5, 'the track');
    near(at(png, 57.5, 20), fiveAt(20), 4, 'a sector near its top');
    const bare = backgroundAt('#2c2c2e', '#0b0b0c', 57.5, 36);
    assert.ok(
      at(png, 57.5, 36).every((value, i) => value < bare[i] - 2),
      'the shadow is darker',
    );
  });

  it('the tinted icon: grey gradient, the track as 12 % white, white sectors', () => {
    const png = ios('AppIcon-Tinted.png');

    assert.deepEqual([png.width, png.height, png.colorType], [1024, 1024, 2]);
    near(pixel(png, 1021, 2), rgb('#4a4a4e'), 1, 'top right');
    near(pixel(png, 2, 1021), rgb('#1e1e20'), 1, 'bottom left');
    const track = mix(backgroundAt('#4a4a4e', '#1e1e20', 68.03, 31.97), [255, 255, 255], 31 / 255);
    near(at(png, 68.03, 31.97), track, 1.5, 'the track');
    assert.deepEqual(at(png, 57.5, 20), [255, 255, 255], 'a white sector');
    assert.deepEqual(at(png, 57.5, 31), [255, 255, 255], 'a white sector');
  });

  describe('PRO in the middle of the dial (#672)', () => {
    // the design is 100 wide; PRO is 0.95 of its letter boxes about (50, 50): the P's stem is at x 50 - 13.5 x 0.95
    const STEM = 50 - 13.5 * 0.95;
    const INK = {
      'AppIcon.png': [28, 28, 30],
      'AppIcon-Dark.png': [255, 255, 255],
      'AppIcon-Tinted.png': [255, 255, 255],
    };
    const luminance = ([r, g, b]) => (r + g + b) / 3;
    /** How many pixels of row y, from x0 to x1, are ink: darker than the middle grey for light, lighter for dark. */
    const inkRun = (png, y, x0, x1, light) => {
      let count = 0;
      for (let x = x0; x < x1; x++)
        if (light ? luminance(pixel(png, x, y)) < 128 : luminance(pixel(png, x, y)) > 200) count++;
      return count;
    };

    for (const [name, ink] of Object.entries(INK)) {
      it(`${name}: PRO is ${ink[0] === 255 ? 'white' : '#1C1C1E'}, in the stem of the P and the left of the O`, () => {
        const png = ios(name);
        assert.deepEqual(at(png, STEM, 50), ink, 'the stem of the P');
        assert.deepEqual(at(png, 50 + 0.95 * (9.8 - 3.6), 50), ink, 'the left of the O');
        // the top of the P's bowl, 0.95 x 5 above the middle
        assert.deepEqual(at(png, 50 + 0.95 * (-13.5 + 1.5), 50 - 4.75), ink, 'the top of the P');
      });
    }

    it('the stroke is 2.5 wide in the design, 25.6 px on the 1024 px icon, in light and in dark', () => {
      const light = inkRun(ios('AppIcon.png'), 548, 340, 420, true);
      const dark = inkRun(ios('AppIcon-Dark.png'), 548, 340, 420, false);
      for (const run of [light, dark]) assert.ok(run >= 25 && run <= 27, `${run} px`);
    });

    it('the empty middle of the O and the space between the letters stay the background', () => {
      const png = ios('AppIcon.png');
      const o = 50 + 0.95 * 9.8;
      near(at(png, o, 50), backgroundAt('#ffffff', '#ececf1', o, 50), 2, 'inside the O');
      const between = 50 + 0.95 * (-3.6 - 1.8);
      near(
        at(png, between, 50),
        backgroundAt('#ffffff', '#ececf1', between, 50),
        2,
        'between P and R',
      );
    });

    it('PRO has round joins: the outer corner of the P is a quarter circle, not a square', () => {
      const png = ios('AppIcon.png');
      // the top left corner of the P: stem at x = STEM, bar at y = 50 - 4.75; 1.1 left and above it is outside a stroke
      // of radius 1.25 (1.1 x 1.1 is 1.56 away) and inside a mitred one
      const [x, y] = [STEM - 1.1, 50 - 4.75 - 1.1];
      near(at(png, x, y), backgroundAt('#ffffff', '#ececf1', x, y), 2, 'the outer corner');
    });
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
});

describe('E020 AC3: the Android adaptive icon is the day dial in the safe zone', () => {
  const layer = (name) => `${RES}/drawable/ic_launcher_${name}.xml`;

  it('the icon is adaptive, with a background, a foreground and a monochrome layer for themed icons', () => {
    const icon = text(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`);

    for (const name of ['background', 'foreground', 'monochrome']) {
      const drawable = icon.match(new RegExp(`<${name} android:drawable="@drawable/(\\w+)"`))?.[1];
      assert.ok(drawable, `no ${name} layer`);
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

  it('the background is the light gradient of the iOS icon, over the whole layer', () => {
    const [background, ...others] = androidPaths(layer('background'));

    assert.deepEqual(others, []);
    assert.deepEqual(background.colours, ['#FFFFFFFF', '#FFECECF1']);
    assert.deepEqual(background.gradient, { startX: 86.4, startY: 0, endX: 21.6, endY: 108 });
    assert.match(text(layer('background')), /android:type="linear"/);
  });

  it('every point of the foreground and the monochrome layer is inside the 66 dp safe zone, control points included', () => {
    for (const name of ['foreground', 'monochrome']) {
      for (const { d, stroke } of androidPaths(layer(name))) {
        // a stroke reaches half its width beyond the line
        const half = Number.isNaN(stroke.width) ? 0 : stroke.width / 2;
        const points = androidPoints(d);
        assert.ok(points.length > 30, `${name}: ${points.length} numbers`);
        for (let i = 0; i < points.length; i += 2) {
          assert.ok(
            Math.hypot(points[i] - 54, points[i + 1] - 54) <= 33 - half,
            `${name}: (${points[i]}, ${points[i + 1]}) is outside the safe zone`,
          );
        }
        // what a launcher draws lies inside too
        for (const polyline of flatten(parsePath(d), 0.01)) {
          for (const [x, y] of polyline)
            assert.ok(Math.hypot(x - 54, y - 54) <= 33 - half, `${name}: (${x}, ${y})`);
        }
      }
    }
  });

  it('the foreground is the track and the five sectors, each with its own gradient from top to bottom, then PRO', () => {
    const [track, ...rest] = androidPaths(layer('foreground'));
    const sectors = rest.slice(0, 5);

    assert.equal(track.fill, '#FFE4E4EA');
    assert.equal(rest.length, 6, 'the five sectors and PRO');
    sectors.forEach(({ d, gradient, colours }, i) => {
      assert.deepEqual(colours, ['#FFFF4F7B', '#FFC8103D']);
      const polyline = flatten(parsePath(d), 0.005)[0];
      const [top, bottom] = [
        Math.min(...polyline.map(([, y]) => y)),
        Math.max(...polyline.map(([, y]) => y)),
      ];
      assert.equal(gradient.startX, gradient.endX, `sector ${i}: vertical`);
      close(gradient.startY, top, 0.01, `sector ${i}: top`);
      close(gradient.endY, bottom, 0.01, `sector ${i}: bottom`);
    });
  });

  it('the sectors are the day dial: the same commands, every point moved by one scale about the middle', () => {
    const sectors = androidPaths(layer('foreground')).slice(1, 6);
    const original = FIVE_PATHS.map((d) => parsePath(d));
    const drawn = sectors.map(({ d }) => parsePath(d));

    drawn.forEach((commands, i) => {
      assert.deepEqual(
        commands.map(([command]) => command),
        original[i].map(([command]) => command),
      );
    });
    // the 100 unit design on the 72 dp visible area of the layer: 0.72 dp a unit, about its middle (50, 50), moved to 54, 54
    drawn.forEach((commands, i) => {
      const a = original[i].flatMap((command) => command.slice(1));
      const b = commands.flatMap((command) => command.slice(1));
      for (const [k, value] of a.entries()) {
        close(b[k], (value - 50) * ANDROID_SCALE + 54, 0.002, `sector ${i}, number ${k}`);
      }
    });
    // the dial keeps the proportions of the reference (34 / 50 of the visible half, as on iOS and in the Play icon):
    // the sectors reach 34 x 0.72 = 24.5 dp from the middle, their control points a little further, and the mask edge is 36 dp
    const reach = Math.max(
      ...drawn.flatMap((commands) => {
        const p = commands.flatMap((command) => command.slice(1));
        return p.filter((_, k) => k % 2 === 0).map((x, k) => Math.hypot(x - 54, p[2 * k + 1] - 54));
      }),
    );
    assert.ok(reach > 24 && reach < 26, `the furthest point is ${reach} dp from the middle`);
  });

  it('the track is a ring around the middle, 7.14 wide in the design', () => {
    const [track] = androidPaths(layer('foreground'));
    const polylines = flatten(parsePath(track.d), 0.01);

    assert.equal(polylines.length, 2);
    const radii = polylines.map((polyline) => {
      onCircle(
        polyline,
        [54, 54],
        Math.hypot(polyline[0][0] - 54, polyline[0][1] - 54),
        'a circle',
      );
      return Math.hypot(polyline[0][0] - 54, polyline[0][1] - 54);
    });
    close(Math.max(...radii), 29.07 * ANDROID_SCALE, 0.01, 'outer radius');
    close(Math.min(...radii), 21.93 * ANDROID_SCALE, 0.01, 'inner radius');
    // a ring, not a disc: the middle is empty
    const filled = coverage(polylines, 108);
    assert.equal(filled[54 * 108 + 54], 0);
    assert.equal(filled[54 * 108 + 54 + Math.round(25.5 * ANDROID_SCALE)], 1);
  });

  it('the monochrome layer is the track and the five as one black shape with no hole where they overlap, and PRO in black', () => {
    const paths = androidPaths(layer('monochrome'));
    assert.equal(paths.length, 2);
    assert.equal(paths[0].fill, '#FF000000');
    assert.equal(paths[1].stroke.colour, '#FF000000');

    const mono = coverage(flatten(parsePath(paths[0].d), 0.01), 108);
    for (const { d } of androidPaths(layer('foreground')).slice(0, 6)) {
      const part = coverage(flatten(parsePath(d), 0.01), 108);
      for (const [i, share] of part.entries()) {
        assert.ok(mono[i] >= share - 1e-9, `pixel ${i}: ${mono[i]} < ${share}`);
      }
    }
    // some pixel is on the track and in a sector at once
    const [track, ...sectors] = androidPaths(layer('foreground'))
      .slice(0, 6)
      .map(({ d }) => coverage(flatten(parsePath(d), 0.01), 108));
    assert.ok(
      track.some((share, i) => share === 1 && sectors.some((s) => s[i] === 1)),
      'no overlap to test',
    );
  });

  it('PRO is round strokes in the foreground and the monochrome layer, at 0.72 dp a unit like the dial', () => {
    const scale = ANDROID_SCALE * PRO.scale;
    const original = PRO.letters.map(({ d, at: [dx, dy] }) =>
      parsePath(d).flatMap((command) =>
        command.slice(1).map((value, k) => value + (k % 2 === 0 ? dx : dy)),
      ),
    );
    for (const [name, colour] of [
      ['foreground', '#FF1C1C1E'],
      ['monochrome', '#FF000000'],
    ]) {
      const paths = androidPaths(layer(name));
      const pro = paths.at(-1);
      assert.equal(pro.fill, undefined, `${name}: PRO is a stroke, not a fill`);
      assert.deepEqual(
        [pro.stroke.colour, pro.stroke.cap, pro.stroke.join],
        [colour, 'round', 'round'],
        name,
      );
      // 2.63 x 0.95 x 0.72 dp: 2.5 design units at 0.72 dp a unit
      close(pro.stroke.width, PRO.width * scale, 0.002, `${name}: the stroke width`);
      close(pro.stroke.width, 2.5 * ANDROID_SCALE, 0.01, `${name}: 2.5 units at 0.72 dp`);
      // the numbers are the data of the file, every point moved by the scale about the middle (54, 54)
      const drawn = androidPoints(pro.d);
      const expected = original.flat();
      assert.equal(drawn.length, expected.length, `${name}: the same commands`);
      for (const [k, value] of expected.entries())
        close(drawn[k], 54 + value * scale, 0.002, `${name}: number ${k}`);
    }
  });

  it('PRO fits inside the dial: well inside the track, and inside the 66 dp safe zone with its stroke', () => {
    const pro = androidPaths(layer('foreground')).at(-1);
    const half = pro.stroke.width / 2;
    for (const polyline of flatten(parsePath(pro.d), 0.01)) {
      for (const [x, y] of polyline) {
        const reach = Math.hypot(x - 54, y - 54) + half;
        assert.ok(reach <= 33, `(${x}, ${y}) reaches ${reach} dp`);
        // the ring's inner edge is at 21.93 x 0.72 dp
        assert.ok(reach < 21.93 * ANDROID_SCALE, `(${x}, ${y}) touches the track`);
      }
    }
  });

  it('the Play Store icon has PRO: the same dark P stem as the iOS icon, at 512 px', () => {
    const png = decodePng(read(PLAY_ICON));
    assert.deepEqual(at(png, 50 - 13.5 * 0.95, 50), [28, 28, 30]);
  });

  it('the Play Store icon is 512 px RGB, the light icon at half the size', () => {
    const png = decodePng(read(PLAY_ICON));
    const light = decodePng(read(IOS_ICON));

    assert.deepEqual([png.width, png.height, png.colorType], [512, 512, 2]);
    assert.deepEqual(pixel(png, 510, 1), [255, 255, 255], 'top right');
    near(pixel(png, 300, 300), pixel(light, 600, 600), 6, 'half the size of the App Store icon');
    near(pixel(png, 348, 160), pixel(light, 696, 320), 6, 'the track');
  });
});

describe('E017 #504: Fivvi, the client app, has the plain day dial B2 as its icon', () => {
  const CLIENT_PLAY_ICON = 'apps/android/client/src/main/ic_launcher-playstore.png';
  const CLIENT_RES = 'apps/android/client/src/main/res';

  /** An Android layer without its PRO stroke path (the one with a strokeColor), which only Fivvi Pro has. */
  const withoutPro = (xml) => xml.replace(/ {4}<path\n {8}android:strokeColor[\s\S]*?\/>\n/, '');

  it('has the layers of Fivvi Pro without PRO: the dial B2, generated from the same source', () => {
    const background = 'drawable/ic_launcher_background.xml';
    assert.equal(text(`${CLIENT_RES}/${background}`), text(`${RES}/${background}`));
    for (const name of ['foreground', 'monochrome']) {
      const file = `drawable/ic_launcher_${name}.xml`;
      const pro = text(`${RES}/${file}`);
      assert.notEqual(withoutPro(pro), pro, `${name}: Fivvi Pro has the PRO path`);
      assert.equal(text(`${CLIENT_RES}/${file}`), withoutPro(pro), `${name}: the dial alone`);
      assert.doesNotMatch(text(`${CLIENT_RES}/${file}`), /strokeColor/, `${name}: no PRO`);
    }
    const foreground = text(`${CLIENT_RES}/drawable/ic_launcher_foreground.xml`);
    assert.equal(foreground.match(/<path\b/g).length, 6, 'the track and the five sectors');
    assert.doesNotMatch(
      foreground,
      /#FF(?!E4E4EA|FF4F7B|C8103D)[0-9A-F]{6}/,
      'only the logo colours',
    );
    assert.match(foreground, /#FFFF4F7B/);
  });

  it('is an adaptive icon with a monochrome layer, and the manifest uses it', () => {
    const icon = text(`${CLIENT_RES}/mipmap-anydpi-v26/ic_launcher.xml`);
    for (const layer of ['background', 'foreground', 'monochrome']) {
      assert.match(icon, new RegExp(`<${layer} android:drawable="@drawable/ic_launcher_${layer}"`));
      assert.ok(existsSync(join(ROOT, `${CLIENT_RES}/drawable/ic_launcher_${layer}.xml`)));
    }
    assert.match(
      text('apps/android/client/src/main/AndroidManifest.xml'),
      /android:icon="@mipmap\/ic_launcher"/,
    );
  });

  it('the Play Store icon is the 512 px light dial without PRO: the one of Fivvi Pro, outside the letters', () => {
    const png = decodePng(read(CLIENT_PLAY_ICON));
    const pro = decodePng(read(PLAY_ICON));

    assert.deepEqual([png.width, png.height, png.colorType], [512, 512, 2]);
    near(pixel(png, 510, 1), rgb('#ffffff'), 3, 'the light background at the top right');
    // the middle of the dial is empty here and holds the P's stem in Fivvi Pro
    near(at(png, 50 - 13.5 * 0.95, 50), backgroundAt('#ffffff', '#ececf1', 36.7, 50), 2, 'no PRO');
    assert.notDeepEqual(at(png, 50 - 13.5 * 0.95, 50), at(pro, 50 - 13.5 * 0.95, 50));
  });

  it('is part of what the generator writes, so the generated-files test covers it', () => {
    const files = renderIcons();
    for (const path of [
      CLIENT_PLAY_ICON,
      `${CLIENT_RES}/drawable/ic_launcher_foreground.xml`,
      `${CLIENT_RES}/mipmap-anydpi-v26/ic_launcher.xml`,
    ])
      assert.ok(files.has(path), path);
  });
});

describe('E020 #672 AC5: the five hours keep their soft shadow, and PRO has none', () => {
  const plain = decodePng(read('apps/android/client/src/main/ic_launcher-playstore.png'));
  const pro = decodePng(read(PLAY_ICON));
  // The box of PRO (x 50 +- 12.8, y 50 +- 4.75) with its stroke (1.25) and one unit more; the shadow of the five
  // (down by 1.2, blurred by 1.4, so about 4 units) does not reach it, and a shadow under PRO would reach 5 units beyond.
  const inside = (x, y) => {
    const [ux, uy] = [((x + 0.5) * 100) / 512, ((y + 0.5) * 100) / 512];
    return ux > 35 && ux < 65 && uy > 43 && uy < 57;
  };

  it('Fivvi Pro differs from the plain dial only inside the box of the letters: no shadow around PRO', () => {
    let changed = 0;
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const [a, b] = [pixel(plain, x, y), pixel(pro, x, y)];
        if (a.every((value, i) => value === b[i])) continue;
        changed++;
        assert.ok(inside(x, y), `(${x}, ${y}) changed outside PRO: ${a} to ${b}`);
      }
    }
    assert.ok(changed > 1000, `${changed} pixels changed: PRO is drawn`);
  });

  it('the dial around the letters is the plain dial, the five with their shadow', () => {
    // 2 units under the inner edge of the second sector, as in the iOS test, is darker than the bare background
    const bare = backgroundAt('#ffffff', '#ececf1', 57.5, 36);
    assert.ok(
      at(pro, 57.5, 36).every((value, i) => value < bare[i] - 4),
      'the shadow of the five',
    );
    assert.deepEqual(at(pro, 57.5, 36), at(plain, 57.5, 36));
  });
});

describe('E017 AC8: a change to what the icon depends on is not served from the test cache', () => {
  it('turbo.json lists as inputs of the root tests every file the icon test and the generator read', () => {
    // The generator reads no file: it has the path data and the colours in itself. So: what the test reads, and the script.
    const depends = new Set([...reads, 'scripts/app-icon.mjs']);
    assert.deepEqual(uncovered([...depends]), [], UNCOVERED_MESSAGE);
  });
});
