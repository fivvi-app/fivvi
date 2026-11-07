#!/usr/bin/env node
// The app icon of Fivvi Pro on both platforms, generated from one source: the Fivvi logo mark, the owner's choice of
// 7 November 2026 (E020, #666; docs/design/brand/README.md). The mark is the traced path of
// docs/design/brand/fivvi-mark-white.svg, the four `d` strings below copied unchanged (the owner keeps the traced
// shapes, never a redraw). They are copied, not read from the brand folder at run time, because the root tests are
// cached by turbo on their `inputs` (turbo.json), which do not list docs/design/brand. The colours come from
// packages/design-tokens: Move pink (`color.action.primary.bg`) and white (`.fg`). The other stops of the gradients
// belong to the logo alone (LOGO below), as in the brand README.
//
//   node scripts/app-icon.mjs            write every icon file (pnpm app-icon); scripts/test/app-icon.test.mjs fails when a
//                                        committed file differs from what the source generates
//
// Output (generated, never edited by hand):
//   apps/ios/FivviPro/Assets.xcassets/AppIcon.appiconset/AppIcon{,-Dark,-Tinted}.png   1024 px, RGB without alpha
//                                        (App Store): fivvi-app-icon.svg, fivvi-app-icon-dark.svg, fivvi-app-icon-tinted.svg
//   apps/android/app/src/main/res/drawable/ic_launcher_{background,foreground,monochrome}.xml, vector layers
//   apps/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml   the adaptive icon with its monochrome layer
//   apps/android/app/src/main/ic_launcher-playstore.png                512 px, RGB (Google Play listing)
//
// No dependency: the path is parsed and flattened here, and the PNG is rasterised and encoded with Node's zlib.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { readTokenSource } from '@fivvi/design-tokens/source';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The grid of an Android adaptive icon layer; the launcher shows the middle 66 x 66 whatever shape it cuts. */
const GRID = 108;
/** The safe zone: a circle of this radius around the middle of the layer. */
const SAFE_RADIUS = 33;
/** The mark keeps this far (in dp) inside the safe zone, so that rounding the coordinates never crosses it. */
const SAFE_MARGIN = 0.1;

/** The `d` of the four paths of docs/design/brand/fivvi-mark-white.svg, copied unchanged (potrace: m, c and z only). */
export const MARK_PATHS = [
  `M652 1122 c-16 -2 -28 -11 -35 -25 -6 -11 -6 -5 -2 -141 1 -41 2 -47
14 -58 19 -19 57 -15 71 7 7 11 8 13 10 95 1 23 2 51 3 61 0 23 -1 30 -8 40
-11 17 -29 24 -53 21z`,
  `M421 1005 c-19 -3 -37 -21 -40 -40 -3 -18 2 -30 16 -43 22 -20 51
-46 62 -56 11 -11 35 -33 42 -38 9 -8 24 -10 37 -6 27 10 39 39 27 66 -1 3 -7
10 -22 24 -56 55 -85 83 -91 87 -7 5 -22 8 -31 6z`,
  `M877 1005 c-11 -2 -13 -4 -64 -56 -28 -28 -52 -53 -54 -56 -12 -17
-12 -40 2 -56 10 -12 19 -16 34 -16 19 0 20 1 66 45 14 13 30 29 36 34 30 29
32 31 37 44 3 6 3 20 1 27 -5 12 -16 24 -28 31 -7 3 -8 3 -17 4 -5 0 -11 0
-13 -1z`,
  `M754 774 c-11 -1 -18 -3 -33 -8 -22 -9 -45 -31 -54 -53 -2 -6 -4 -13
-5 -15 -1 -5 -1 -5 -3 -5 -1 1 -2 3 -2 6 -1 7 -7 22 -12 30 -5 9 -19 23 -27
29 -26 16 -57 20 -85 11 -20 -7 -30 -13 -44 -27 -27 -29 -41 -60 -78 -179 -9
-28 -12 -38 -16 -50 -1 -4 -4 -13 -6 -19 -2 -7 -4 -15 -5 -17 0 -2 -3 -11 -5
-20 -4 -14 -7 -23 -12 -40 -1 -4 -4 -12 -5 -19 -2 -7 -4 -12 -4 -13 -2 -1 -4
1 -4 3 0 2 -1 5 -1 7 -1 2 -3 8 -5 15 -2 6 -4 12 -5 14 -1 1 -3 8 -5 15 -2 6
-6 17 -8 25 -3 7 -7 18 -9 24 -2 6 -5 14 -6 17 -2 4 -3 7 -3 8 0 0 -1 2 -1 4
-2 4 -3 7 -8 21 -2 5 -4 10 -5 12 0 1 -3 7 -6 14 -10 25 -24 49 -37 61 -37 35
-90 41 -134 14 -45 -28 -64 -85 -45 -134 5 -12 12 -29 22 -49 2 -5 4 -9 4 -9
0 -1 2 -4 4 -9 2 -4 6 -14 10 -22 3 -8 7 -17 9 -20 1 -3 4 -9 6 -13 1 -4 4
-10 5 -13 2 -3 5 -10 7 -14 9 -21 12 -28 18 -41 4 -8 7 -14 7 -15 0 0 4 -9 18
-39 26 -57 45 -94 58 -112 23 -32 56 -55 90 -63 18 -5 42 -5 61 0 10 3 27 9
30 12 1 0 2 1 2 1 3 0 20 13 32 24 25 25 36 47 67 126 15 37 16 39 27 69 5 13
12 33 16 43 8 22 28 82 39 114 10 30 22 71 29 92 5 17 17 62 19 72 2 11 4 10
6 0 1 -13 7 -38 20 -89 3 -11 11 -38 14 -50 4 -12 12 -41 17 -55 1 -7 5 -19 7
-26 3 -8 7 -22 10 -31 3 -9 8 -25 11 -35 3 -10 7 -23 9 -28 2 -6 7 -23 12 -37
5 -15 10 -30 11 -34 1 -4 4 -13 7 -21 3 -8 6 -16 6 -17 0 -1 2 -5 3 -8 1 -3 3
-7 3 -8 0 -1 1 -4 2 -5 0 -1 2 -5 3 -8 7 -18 18 -38 28 -50 8 -11 25 -28 33
-33 3 -2 8 -5 9 -6 5 -4 20 -10 29 -13 39 -13 81 -7 117 17 16 10 40 38 54 62
1 2 3 6 4 8 10 18 24 45 64 126 11 23 38 76 58 117 46 93 48 97 48 125 0 51
-39 97 -89 106 -12 2 -36 1 -46 -2 -26 -8 -45 -23 -61 -49 -6 -9 -22 -41 -22
-43 0 -1 -5 -11 -10 -22 -1 -2 -4 -10 -8 -19 -3 -9 -6 -17 -7 -18 0 -2 -2 -5
-3 -7 -1 -3 -3 -6 -3 -7 -3 -7 -5 -13 -9 -23 -3 -7 -5 -13 -6 -14 -6 -13 -8
-20 -16 -39 -2 -8 -5 -14 -5 -15 -2 -2 -4 -1 -4 1 0 3 -3 21 -8 40 0 4 -2 12
-4 19 -1 7 -3 17 -5 23 -1 6 -3 15 -5 21 -1 6 -3 14 -4 19 -2 8 -4 18 -9 37
-3 13 -11 45 -13 53 0 2 -2 7 -3 11 -10 40 -18 65 -28 83 -2 5 -5 10 -6 12 -1
1 -4 7 -8 12 -24 39 -62 58 -105 55z`,
];
/** The transform of the group that holds them in that file (potrace: y up, 1/3 scale). */
export const POTRACE_TRANSFORM =
  'scale(0.333333) translate(0.000000,1170.000000) scale(1.000000,-1.000000)';
/** Where the group sits in the 1024 px app icons of the brand folder (fivvi-app-icon*.svg). */
const ICON_PLACEMENT = 'translate(180.9 224.1) scale(1.5152)';
/** The size of those SVGs. */
const ICON_SIZE = 1024;

/** Colours that belong to the logo alone: not design tokens, not used in the UI (docs/design/brand/README.md). */
const LOGO = {
  pinkLight: '#ff4f7b',
  pinkDark: '#b80f3a',
  nearBlackTop: '#2a2a2d',
  nearBlackBottom: '#0b0b0c',
  greyTop: '#6e6e73',
  greyBottom: '#3a3a3c',
};
/** The soft light at the top right of the main icon (the radial gradient of fivvi-app-icon.svg). */
const LIGHT = { cx: 0.88, cy: 0.08, r: 0.7, opacity: 0.3 };

// ---- SVG path data: parsing, transforms and flattening -------------------------------------------------------------

const COMMAND_ARGUMENTS = { m: 2, l: 2, c: 6, z: 0 };
const TOKEN = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const isCommand = (token) => /^[a-zA-Z]$/.test(token);

/**
 * The commands of SVG path data, as absolute ones: ['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y] and ['Z'].
 * Reads what potrace writes and its relatives: m, l, c, z in both cases, with implicit repeats (after a move they are
 * lines) and compact numbers. Anything else (arcs, shorthand curves) is refused.
 */
export function parsePath(d) {
  const tokens = d.match(TOKEN) ?? [];
  const commands = [];
  let command = null;
  let [x, y, startX, startY] = [0, 0, 0, 0];
  let i = 0;
  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      command = tokens[i++];
      if (!(command.toLowerCase() in COMMAND_ARGUMENTS))
        throw new Error(`unsupported path command ${command}`);
      if (command.toLowerCase() === 'z') {
        commands.push(['Z']);
        [x, y] = [startX, startY];
        continue;
      }
    } else if (command === null) {
      throw new Error(`path data starts with a number, not a command: ${d}`);
    } else if (COMMAND_ARGUMENTS[command.toLowerCase()] === 0) {
      throw new Error(`number after z, expected a command: ${tokens[i]}`);
    }
    const kind = command.toLowerCase();
    const count = COMMAND_ARGUMENTS[kind];
    const numbers = tokens.slice(i, i + count);
    if (numbers.length < count || numbers.some(isCommand))
      throw new Error(`command ${command} needs ${count} numbers`);
    i += count;
    const relative = command === kind;
    const points = numbers.map(
      (value, k) => Number(value) + (relative ? (k % 2 === 0 ? x : y) : 0),
    );
    if (kind === 'm') {
      commands.push(['M', ...points]);
      [startX, startY] = points;
      command = relative ? 'l' : 'L';
    } else {
      commands.push([kind.toUpperCase(), ...points]);
    }
    [x, y] = points.slice(-2);
  }
  return commands;
}

/** The matrix [a, b, c, d, e, f] of an SVG transform list (translate and scale), the leftmost applied last. */
export function parseTransform(transform) {
  let matrix = [1, 0, 0, 1, 0, 0];
  for (const [, name, list] of transform.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const [a, b] = (list.match(TOKEN) ?? []).map(Number);
    let next;
    if (name === 'translate') next = [1, 0, 0, 1, a, b ?? 0];
    else if (name === 'scale') next = [a, 0, 0, b ?? a, 0, 0];
    else throw new Error(`unsupported transform ${name}`);
    matrix = multiply(matrix, next);
  }
  if (transform.replace(/(\w+)\s*\(([^)]*)\)/g, '').trim() !== '')
    throw new Error(`unsupported transform ${transform}`);
  return matrix;
}

/** The matrix of applying `second` first and then `first`. */
function multiply(first, second) {
  const [a1, b1, c1, d1, e1, f1] = first;
  const [a2, b2, c2, d2, e2, f2] = second;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** The commands with every point (control points too, so a Bezier stays exact) moved by the matrix. */
export function transformPath(commands, [a, b, c, d, e, f]) {
  return commands.map(([command, ...points]) => [
    command,
    ...points.map((value, k) =>
      k % 2 === 0 ? a * value + c * points[k + 1] + e : b * points[k - 1] + d * value + f,
    ),
  ]);
}

/** A cubic Bezier as points on it, so that no point of the curve is further than `tolerance` from the polyline. */
function cubicPoints([x0, y0], [x1, y1], [x2, y2], [x3, y3], tolerance) {
  const bend = Math.max(
    Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2),
    Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3),
  );
  // the distance of a chord from its curve is at most max|B''| / (8 n^2) = 6 bend / (8 n^2)
  const steps = Math.max(1, Math.ceil(Math.sqrt((0.75 * bend) / tolerance)));
  const points = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    points.push([
      u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
      u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3,
    ]);
  }
  return points;
}

/** The sub-paths of absolute commands as closed polylines (the Beziers flattened to within `tolerance`). */
export function flatten(commands, tolerance = 0.05) {
  const polylines = [];
  let current = null;
  for (const [command, ...p] of commands) {
    if (command === 'M') {
      current = [[p[0], p[1]]];
      polylines.push(current);
    } else if (command === 'L') {
      current.push([p[0], p[1]]);
    } else if (command === 'C') {
      current.push(
        ...cubicPoints(current.at(-1), [p[0], p[1]], [p[2], p[3]], [p[4], p[5]], tolerance),
      );
    } else if (command === 'Z') {
      // the next sub-path of potrace data starts with its own M; a drawing command after Z would restart at the start
      const [start] = current;
      current = [start];
      polylines.push(current);
    }
  }
  return polylines.filter((polyline) => polyline.length > 1);
}

/**
 * How much of each pixel of a `size` px square the polylines fill (0 to 1, row by row), by the non-zero rule of SVG,
 * with `samples` x `samples` points per pixel.
 */
export function coverage(polylines, size, samples = 4) {
  const edges = [];
  for (const polyline of polylines) {
    for (let k = 0; k < polyline.length; k++) {
      const [x0, y0] = polyline[k];
      const [x1, y1] = polyline[(k + 1) % polyline.length];
      if (y0 !== y1) edges.push({ x0, y0, x1, y1, direction: y1 > y0 ? 1 : -1 });
    }
  }
  const counts = new Float64Array(size * size);
  const columns = size * samples;
  for (let row = 0; row < columns; row++) {
    const y = (row + 0.5) / samples;
    const crossings = [];
    for (const { x0, y0, x1, y1, direction } of edges) {
      if (y0 <= y !== y1 <= y) crossings.push([x0 + ((y - y0) * (x1 - x0)) / (y1 - y0), direction]);
    }
    crossings.sort((a, b) => a[0] - b[0]);
    let winding = 0;
    for (let k = 0; k + 1 < crossings.length; k++) {
      winding += crossings[k][1];
      if (winding === 0) continue;
      const from = Math.max(0, Math.ceil(crossings[k][0] * samples - 0.5));
      const to = Math.min(columns, Math.ceil(crossings[k + 1][0] * samples - 0.5));
      const line = Math.floor(row / samples) * size;
      for (let column = from; column < to; column++) counts[line + Math.floor(column / samples)]++;
    }
  }
  return counts.map((count) => count / (samples * samples));
}

// ---- The mark in the app icons --------------------------------------------------------------------------------------

/** The mark's sub-paths in the coordinates of the brand SVGs' icon group (y down). */
const markCommands = MARK_PATHS.flatMap((d) =>
  transformPath(parsePath(d), parseTransform(POTRACE_TRANSFORM)),
);

/** The mark as polylines in the pixels of a `size` px icon laid out like fivvi-app-icon.svg. */
function markPolylines(size) {
  const matrix = parseTransform(`scale(${size / ICON_SIZE}) ${ICON_PLACEMENT}`);
  return flatten(transformPath(markCommands, matrix), 0.02);
}

/** The mark fitted into the safe zone of the 108 dp layer: the same shape, centred on the middle of its extent. */
function androidMark() {
  const points = flatten(markCommands, 0.05).flat();
  const [xs, ys] = [points.map(([x]) => x), points.map(([, y]) => y)];
  const [centreX, centreY] = [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
  // control points count: the curve stays inside their hull, but a launcher is not told that
  const reach = Math.max(
    ...markCommands.flatMap(([, ...p]) =>
      p.map((value, k) => (k % 2 === 0 ? Math.hypot(value - centreX, p[k + 1] - centreY) : 0)),
    ),
  );
  const scale = (SAFE_RADIUS - SAFE_MARGIN) / reach;
  const matrix = [scale, 0, 0, scale, GRID / 2 - centreX * scale, GRID / 2 - centreY * scale];
  return transformPath(markCommands, matrix);
}

/** The commands as Android `pathData`, absolute, with at most three decimals. */
const pathData = (commands) =>
  commands
    .map(([command, ...p]) => {
      const pairs = [];
      for (let k = 0; k < p.length; k += 2)
        pairs.push(`${Number(p[k].toFixed(3))},${Number(p[k + 1].toFixed(3))}`);
      return `${command}${pairs.join(' ')}`;
    })
    .join(' ');

// ---- Colours and the raster -----------------------------------------------------------------------------------------

/** The token `path` of the light palette with references (`{color.base.white}`) followed, as `#rrggbb`. */
function colour(tree, path) {
  let value = path.split('.').reduce((node, key) => node?.[key], tree)?.$value;
  while (typeof value === 'string' && value.startsWith('{')) {
    value = value
      .slice(1, -1)
      .split('.')
      .reduce((node, key) => node?.[key], tree)?.$value;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(value ?? ''))
    throw new Error(`token ${path} is not a #rrggbb colour: ${value}`);
  return value.toLowerCase();
}

const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const argb = (hex, alpha = 'FF') => `#${alpha}${hex.slice(1).toUpperCase()}`;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * The colour at (u, v), both 0 to 1 across the square, of an SVG linear gradient in objectBoundingBox units from
 * (x1, y1) to (x2, y2) with evenly spaced `stops` (hex colours).
 */
function linearGradient([x1, y1, x2, y2], stops) {
  const colours = stops.map(rgb);
  const [dx, dy] = [x2 - x1, y2 - y1];
  return (u, v) => {
    const t = clamp01(((u - x1) * dx + (v - y1) * dy) / (dx * dx + dy * dy));
    const position = t * (colours.length - 1);
    const index = Math.min(Math.floor(position), colours.length - 2);
    const share = position - index;
    return colours[index].map((from, c) => from + (colours[index + 1][c] - from) * share);
  };
}

/** The main icon's background: the pink gradient with the soft light at the top right over it. */
function pinkBackground(pink) {
  const gradient = linearGradient([1, 0, 0.25, 1], [LOGO.pinkLight, pink, LOGO.pinkDark]);
  return (u, v) => {
    const alpha = LIGHT.opacity * (1 - clamp01(Math.hypot(u - LIGHT.cx, v - LIGHT.cy) / LIGHT.r));
    return gradient(u, v).map((value) => value + (255 - value) * alpha);
  };
}

/** A `size` px square: the `background(u, v)` with the mark in `foreground` over it, anti-aliased. */
function raster(size, background, foreground) {
  const covered = coverage(markPolylines(size), size);
  const to = rgb(foreground);
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const share = covered[y * size + x];
      const from = background((x + 0.5) / size, (y + 0.5) / size);
      for (let channel = 0; channel < 3; channel++) {
        pixels[(y * size + x) * 3 + channel] = Math.round(
          from[channel] + (to[channel] - from[channel]) * share,
        );
      }
    }
  }
  return pixels;
}

/** The PNG file of an RGB (colour type 2, 8 bit, no alpha) image. */
function encodePng(size, pixels) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    pixels.copy(rows, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Reads a PNG written by this script (filter type 0 on every row): its size, colour type and RGB pixels. */
export function decodePng(file) {
  let offset = 8;
  let header;
  const data = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('latin1', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = body;
    if (type === 'IDAT') data.push(body);
    offset += 12 + length;
  }
  const [width, height] = [header.readUInt32BE(0), header.readUInt32BE(4)];
  const colorType = header[9];
  const channels = colorType === 2 ? 3 : 4;
  const rows = inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    const start = y * (width * channels + 1);
    if (rows[start] !== 0) throw new Error('only PNGs without row filters are supported');
    rows.copy(pixels, y * width * channels, start + 1, start + 1 + width * channels);
  }
  return { width, height, colorType, pixels };
}

const vector = (name, body, namespaces = '') => `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/app-icon.mjs (${name}); never edit by hand. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"${namespaces}
    android:width="${GRID}dp"
    android:height="${GRID}dp"
    android:viewportWidth="${GRID}"
    android:viewportHeight="${GRID}">
${body}</vector>
`;

const markVector = (name, fill, commands) =>
  vector(
    name,
    `    <path
        android:fillColor="${fill}"
        android:pathData="${pathData(commands)}" />
`,
  );

/** The background layer: the pink gradient and the soft light, as the 1024 px icon has them (API 24 and up; the icon is 26+). */
function backgroundVector(pink) {
  const stop = (offset, colourValue) =>
    `                <item android:offset="${offset}" android:color="${colourValue}" />\n`;
  const full = `M0,0H${GRID}V${GRID}H0Z`;
  const light = Math.round(LIGHT.opacity * 255)
    .toString(16)
    .toUpperCase();
  return vector(
    'background',
    `    <path android:pathData="${full}">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="linear"
                android:startX="${GRID * 1}"
                android:startY="0"
                android:endX="${GRID * 0.25}"
                android:endY="${GRID}">
${stop(0, argb(LOGO.pinkLight))}${stop(0.5, argb(pink))}${stop(1, argb(LOGO.pinkDark))}            </gradient>
        </aapt:attr>
    </path>
    <path android:pathData="${full}">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="radial"
                android:centerX="${Number((GRID * LIGHT.cx).toFixed(3))}"
                android:centerY="${Number((GRID * LIGHT.cy).toFixed(3))}"
                android:gradientRadius="${Number((GRID * LIGHT.r).toFixed(3))}">
${stop(0, argb('#ffffff', light))}${stop(1, argb('#ffffff', '00'))}            </gradient>
        </aapt:attr>
    </path>
`,
    '\n    xmlns:aapt="http://schemas.android.com/aapt"',
  );
}

const appIconSet = 'apps/ios/FivviPro/Assets.xcassets/AppIcon.appiconset';

/** Every icon file as a map from its path in the repo to its content (a string or a Buffer). */
export async function renderIcons(root = ROOT) {
  const { light } = await readTokenSource(join(root, 'packages/design-tokens'));
  const pink = colour(light, 'color.action.primary.bg');
  const white = colour(light, 'color.action.primary.fg');
  const res = 'apps/android/app/src/main/res';
  const mark = androidMark();
  const main = pinkBackground(pink);
  const png = (size, background, foreground) =>
    encodePng(size, raster(size, background, foreground));
  const image = (filename, appearance) => ({
    ...(appearance && { appearances: [{ appearance: 'luminosity', value: appearance }] }),
    filename,
    idiom: 'universal',
    platform: 'ios',
    size: '1024x1024',
  });
  return new Map([
    [
      'apps/ios/FivviPro/Assets.xcassets/Contents.json',
      '{\n  "info" : {\n    "author" : "xcode",\n    "version" : 1\n  }\n}\n',
    ],
    [
      `${appIconSet}/Contents.json`,
      `${JSON.stringify(
        {
          images: [
            image('AppIcon.png'),
            image('AppIcon-Dark.png', 'dark'),
            image('AppIcon-Tinted.png', 'tinted'),
          ],
          info: { author: 'xcode', version: 1 },
        },
        null,
        2,
      )}\n`,
    ],
    [`${appIconSet}/AppIcon.png`, png(1024, main, white)],
    [
      `${appIconSet}/AppIcon-Dark.png`,
      png(1024, linearGradient([0, 0, 0, 1], [LOGO.nearBlackTop, LOGO.nearBlackBottom]), pink),
    ],
    [
      `${appIconSet}/AppIcon-Tinted.png`,
      png(1024, linearGradient([0, 0, 0, 1], [LOGO.greyTop, LOGO.greyBottom]), white),
    ],
    ['apps/android/app/src/main/ic_launcher-playstore.png', png(512, main, white)],
    [`${res}/drawable/ic_launcher_background.xml`, backgroundVector(pink)],
    [`${res}/drawable/ic_launcher_foreground.xml`, markVector('foreground', argb(white), mark)],
    [`${res}/drawable/ic_launcher_monochrome.xml`, markVector('monochrome', '#FF000000', mark)],
    [
      `${res}/mipmap-anydpi-v26/ic_launcher.xml`,
      `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/app-icon.mjs; never edit by hand. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`,
    ],
  ]);
}

async function main(argv) {
  const files = await renderIcons();
  if (argv.length > 0) {
    console.error('Usage: node scripts/app-icon.mjs');
    return 2;
  }
  for (const [path, content] of files) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true });
    writeFileSync(join(ROOT, path), content);
    console.log(`wrote ${path}`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = await main(process.argv.slice(2));
