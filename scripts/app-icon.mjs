#!/usr/bin/env node
// The app icon of Fivvi Pro on both platforms, generated from one source: the day dial B2, the owner's choice of
// 8 November 2026 (E020, #666; the vv wordmark stays the brand logo, only the app icon is the dial). Four layers in a
// 100 x 100 box: the background gradient, the track (a ring around the middle), the five sectors of the dial and, for
// Fivvi Pro only, PRO in the centre, drawn on top as round strokes (E020, #672).
// The five `d` strings below are copied unchanged from docs/design/brand/day-dial/b2/layers/3-five.svg (the owner keeps the
// drawn shapes, never a redraw). They are copied, not read from the brand folder at run time, because the root tests
// are cached by turbo on their `inputs` (turbo.json), which do not list docs/design/brand. The track is a circle
// (centre 50, 50, radius 25.5, stroke 7.14), drawn here as the ring between the radii 21.93 and 29.07. The colours are
// the logo's own (LOGO below), not design tokens: the pink of the sectors is a gradient from #FF4F7B to #C8103D, not
// Move pink (#E6164A), so the generator reads no token file.
//
//   node scripts/app-icon.mjs            write every icon file (pnpm app-icon); scripts/test/app-icon.test.mjs fails when a
//                                        committed file differs from what the source generates
//
// Output (generated, never edited by hand):
//   apps/ios/FivviPro/Assets.xcassets/AppIcon.appiconset/AppIcon{,-Dark,-Tinted}.png   1024 px, RGB without alpha
//                                        (App Store): the fivvi-day-dial-b2-pro-{light,dark,tinted}.svg previews (with
//                                        PRO) without the rounded clip, which iOS applies itself; with the soft shadow
//                                        under the sectors, none under PRO
//   apps/android/app/src/main/res/drawable/ic_launcher_{background,foreground,monochrome}.xml, vector layers
//   apps/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml   the adaptive icon with its monochrome layer
//   apps/android/app/src/main/ic_launcher-playstore.png                512 px, RGB (Google Play listing)
//   apps/android/client/src/main/...   the same four files for Fivvi, the client app (E017 #504): the plain day dial B2,
//                                        the owner's choice of 8 November 2026 (docs/design/brand/README.md, "The app
//                                        icon"), without PRO
//
// Fivvi Pro is B2 with PRO in the empty centre of the dial (owner, 8 November 2026; E020 #672): rounded monoline strokes
// from the path data of docs/design/brand/day-dial/b2-pro/layers/4-pro.svg, copied unchanged like the five (PRO below),
// `#1C1C1E` in the light icon and white in the dark and tinted ones, on top of everything and with no shadow (only the
// five cast one). On Android they are strokes of the foreground and monochrome layers at the dial's 0.72 dp a unit;
// the PNGs outline them (strokeOutline).
//
// No dependency: the path is parsed and flattened here, and the PNG is rasterised and encoded with Node's zlib.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The grid of an Android adaptive icon layer; a launcher shows at most the middle 72 x 72 dp, and keeps a 66 dp circle safe from every mask. */
const GRID = 108;
/** The part of the layer a launcher shows at most: its middle 72 x 72 dp (the round mask is a circle of radius 36). */
const VISIBLE = 72;

/** The size of the design: the SVGs of docs/design/brand/day-dial/b2 draw in 100 x 100 and scale to the icon. */
const DESIGN = 100;

/** The `d` of the five sectors of docs/design/brand/day-dial/b2/layers/3-five.svg, copied unchanged. */
export const FIVE_PATHS = [
  `M36.45 18.82 A34 34 0 0 1 46.14 16.22 Q48.53 16.03 48.64 18.43 L49.16 30.62 Q49.27 33.02 46.88 33.29 A17 17 0 0 0 44.34 33.97 Q42.14 34.92 41.03 32.80 L35.39 21.98 Q34.29 19.85 36.45 18.82Z`,
  `M53.86 16.22 A34 34 0 0 1 63.55 18.82 Q65.71 19.85 64.61 21.98 L58.97 32.80 Q57.86 34.92 55.66 33.97 A17 17 0 0 0 53.12 33.29 Q50.73 33.02 50.84 30.62 L51.36 18.43 Q51.47 16.03 53.86 16.22Z`,
  `M83.78 53.86 A34 34 0 0 1 81.18 63.55 Q80.15 65.71 78.02 64.61 L67.20 58.97 Q65.08 57.86 66.03 55.66 A17 17 0 0 0 66.71 53.12 Q66.98 50.73 69.38 50.84 L81.57 51.36 Q83.97 51.47 83.78 53.86Z`,
  `M46.14 83.78 A34 34 0 0 1 36.45 81.18 Q34.29 80.15 35.39 78.02 L41.03 67.20 Q42.14 65.08 44.34 66.03 A17 17 0 0 0 46.88 66.71 Q49.27 66.98 49.16 69.38 L48.64 81.57 Q48.53 83.97 46.14 83.78Z`,
  `M29.77 77.33 A34 34 0 0 1 22.67 70.23 Q21.32 68.25 23.34 66.97 L33.63 60.42 Q35.66 59.13 37.08 61.05 A17 17 0 0 0 38.95 62.92 Q40.87 64.34 39.58 66.37 L33.03 76.66 Q31.75 78.68 29.77 77.33Z`,
];

/**
 * PRO in the centre of Fivvi Pro's dial, from docs/design/brand/day-dial/b2-pro/layers/4-pro.svg: in a letter box 10
 * tall, scaled by `scale` about the middle of the design (50, 50), drawn as strokes of `width` (2.63 x 0.95 = 2.5 in
 * the design) with round caps and joins. Each letter's `d` is in its own box, which starts at `at` (the box of the O is
 * given by its ellipse, so its `at` is zero). The P and R data are copied unchanged, the O's numbers are the file's
 * `<ellipse>`; copied, not read from the brand folder, for the reason above.
 */
const P_PATH = 'M0 10 L0 0 L3.4 0 A2.9 2.9 0 0 1 3.4 5.8 L0 5.8';
const O_ELLIPSE = { cx: 9.8, cy: 0, rx: 3.6, ry: 5 };
export const PRO = {
  scale: 0.95,
  width: 2.63,
  ellipse: O_ELLIPSE,
  letters: [
    { d: P_PATH, at: [-13.5, -5] },
    { d: `${P_PATH} M2.6 5.8 L6.1 10`, at: [-3.6, -5] },
    {
      // the ellipse as two half turns (an arc cannot be a full ellipse), starting at its left end
      d: `M${O_ELLIPSE.cx - O_ELLIPSE.rx} ${O_ELLIPSE.cy} A${O_ELLIPSE.rx} ${O_ELLIPSE.ry} 0 1 1 ${O_ELLIPSE.cx + O_ELLIPSE.rx} ${O_ELLIPSE.cy} A${O_ELLIPSE.rx} ${O_ELLIPSE.ry} 0 1 1 ${O_ELLIPSE.cx - O_ELLIPSE.rx} ${O_ELLIPSE.cy}`,
      at: [0, 0],
    },
  ],
};

/** The track: a circle in the design, stroked; its outline is the ring between the two radii. */
const TRACK = { centre: DESIGN / 2, radius: 25.5, width: 7.14 };
/** The ring as path data: the outer circle clockwise on screen like the sectors, the inner one back, so that it is a ring. */
const TRACK_PATH = (() => {
  const { centre: c, radius, width } = TRACK;
  const [outer, inner] = [radius + width / 2, radius - width / 2].map((r) => Number(r.toFixed(4)));
  const circle = (r, sweep) =>
    `M${c - r} ${c}A${r} ${r} 0 1 ${sweep} ${c + r} ${c}A${r} ${r} 0 1 ${sweep} ${c - r} ${c}Z`;
  return `${circle(outer, 1)} ${circle(inner, 0)}`;
})();

/** The colours of the day dial: the logo's own, not design tokens (the pink here is not Move pink, #E6164A). */
const LOGO = {
  pinkTop: '#ff4f7b',
  pinkBottom: '#c8103d',
  trackLight: '#e4e4ea',
  white: '#ffffff',
  ink: '#1c1c1e',
};
/** The three appearances: background gradient (top right to bottom left), track, the sectors, the shadow's opacity and the colour of PRO. */
const APPEARANCES = {
  light: {
    background: ['#ffffff', '#ececf1'],
    track: { colour: LOGO.trackLight, alpha: 1 },
    five: [LOGO.pinkTop, LOGO.pinkBottom],
    shadow: 0.1,
    pro: LOGO.ink,
  },
  dark: {
    background: ['#2c2c2e', '#0b0b0c'],
    track: { colour: LOGO.white, alpha: 0x1a / 255 },
    five: [LOGO.pinkTop, LOGO.pinkBottom],
    shadow: 0.35,
    pro: LOGO.white,
  },
  tinted: {
    background: ['#4a4a4e', '#1e1e20'],
    track: { colour: LOGO.white, alpha: 0x1f / 255 },
    five: [LOGO.white, LOGO.white],
    shadow: 0.35,
    pro: LOGO.white,
  },
};
/** The background gradient of the SVGs in objectBoundingBox units, from the top right to the bottom left. */
const BACKGROUND_VECTOR = [0.8, 0, 0.2, 1];
/** The soft shadow under the sectors: down by `dy`, a Gaussian blur of `deviation`, in design units. */
const SHADOW = { dy: 1.2, deviation: 1.4 };

// ---- SVG path data: parsing, transforms and flattening -------------------------------------------------------------

const COMMAND_ARGUMENTS = { m: 2, l: 2, c: 6, q: 4, a: 7, z: 0 };
const TOKEN = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const isCommand = (token) => /^[a-zA-Z]$/.test(token);

/**
 * An elliptical arc as cubic Beziers, one for every quarter turn at most (SVG 1.1, F.6.5: the end point form with the
 * large-arc and sweep flags, turned into the centre form). Cubics keep the arc exact enough and stay one kind of curve
 * for Android's `pathData`. No radius draws a line, the same end point nothing, and radii that are too small grow.
 */
function arcToCubics([x1, y1], rx, ry, degrees, large, sweep, [x2, y2]) {
  if (x1 === x2 && y1 === y2) return [];
  if (rx === 0 || ry === 0) return [['L', x2, y2]];
  const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  const [dx, dy] = [(x1 - x2) / 2, (y1 - y2) / 2];
  const [px, py] = [cos * dx + sin * dy, -sin * dx + cos * dy];
  const grow = Math.sqrt((px / Math.abs(rx)) ** 2 + (py / Math.abs(ry)) ** 2);
  const [a, b] =
    grow > 1 ? [Math.abs(rx) * grow, Math.abs(ry) * grow] : [Math.abs(rx), Math.abs(ry)];
  const squares = a * a * py * py + b * b * px * px;
  const factor =
    (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (a * a * b * b - squares) / squares));
  const [cx, cy] = [(factor * a * py) / b, (-factor * b * px) / a];
  const [centreX, centreY] = [
    cos * cx - sin * cy + (x1 + x2) / 2,
    sin * cx + cos * cy + (y1 + y2) / 2,
  ];
  const start = Math.atan2((py - cy) / b, (px - cx) / a);
  let sweepAngle = Math.atan2((-py - cy) / b, (-px - cx) / a) - start;
  if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
  if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;
  const parts = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2) - 1e-9));
  const step = sweepAngle / parts;
  const reach = (4 / 3) * Math.tan(step / 4);
  const point = (t) => [
    centreX + a * Math.cos(t) * cos - b * Math.sin(t) * sin,
    centreY + a * Math.cos(t) * sin + b * Math.sin(t) * cos,
  ];
  const slope = (t) => [
    -a * Math.sin(t) * cos - b * Math.cos(t) * sin,
    -a * Math.sin(t) * sin + b * Math.cos(t) * cos,
  ];
  const cubics = [];
  for (let k = 0; k < parts; k++) {
    const [t0, t1] = [start + k * step, start + (k + 1) * step];
    const [from, to, slope0, slope1] = [point(t0), point(t1), slope(t0), slope(t1)];
    cubics.push([
      'C',
      from[0] + reach * slope0[0],
      from[1] + reach * slope0[1],
      to[0] - reach * slope1[0],
      to[1] - reach * slope1[1],
      // the last one ends exactly where the path says, whatever the rounding
      ...(k === parts - 1 ? [x2, y2] : to),
    ]);
  }
  return cubics;
}

/**
 * The commands of SVG path data, as absolute ones: ['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y],
 * ['Q', x1, y1, x, y] and ['Z']. Reads m, l, c, q, a and z in both cases, with implicit repeats (after a move they are
 * lines) and compact numbers; an arc comes out as cubics (flags must be separated from the numbers). Anything else
 * (h, v, shorthand curves) is refused.
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
    // an arc's radii, rotation and flags are never relative; only the coordinates are
    const first = kind === 'a' ? 5 : 0;
    const values = numbers.map(
      (value, k) => Number(value) + (relative && k >= first ? (k % 2 === first % 2 ? x : y) : 0),
    );
    if (kind === 'm') {
      commands.push(['M', ...values]);
      [startX, startY] = values;
      command = relative ? 'l' : 'L';
    } else if (kind === 'a') {
      const [rx, ry, degrees, large, sweep, endX, endY] = values;
      commands.push(...arcToCubics([x, y], rx, ry, degrees, large, sweep, [endX, endY]));
    } else {
      commands.push([kind.toUpperCase(), ...values]);
    }
    [x, y] = values.slice(-2);
  }
  return commands;
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

/** The sub-paths of absolute commands as closed polylines (the curves flattened to within `tolerance`). */
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
    } else if (command === 'Q') {
      // raised to a cubic: the control points a third of the way from each end to the quadratic's one
      const [x0, y0] = current.at(-1);
      const [qx, qy] = [p[0], p[1]];
      current.push(
        ...cubicPoints(
          [x0, y0],
          [x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0)],
          [p[2] + (2 / 3) * (qx - p[2]), p[3] + (2 / 3) * (qy - p[3])],
          [p[2], p[3]],
          tolerance,
        ),
      );
    } else if (command === 'Z') {
      // the next sub-path starts with its own M; a drawing command after Z would restart at the start
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

/**
 * The outline of polylines stroked `width` wide with round caps and joins, as polygons for `coverage` to fill by the
 * non-zero rule: a rectangle along every segment and a disc at every vertex (the caps at the ends, the round joins in
 * the corners, and on a flattened curve the little wedges between the rectangles). Every polygon runs the same way,
 * so where they overlap the union is filled once, never cut out. The polylines are open; a closed one repeats its
 * first point at the end.
 */
export function strokeOutline(polylines, width, tolerance = 0.02) {
  const half = width / 2;
  // the discs are inscribed polygons that stay within `tolerance` of the circle
  const corners = Math.max(8, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - tolerance / half))));
  const disc = ([x, y]) =>
    Array.from({ length: corners }, (_, k) => [
      x + half * Math.cos((2 * Math.PI * k) / corners),
      y + half * Math.sin((2 * Math.PI * k) / corners),
    ]);
  const polygons = [];
  for (const polyline of polylines) {
    for (const point of polyline) polygons.push(disc(point));
    for (let k = 0; k + 1 < polyline.length; k++) {
      const [[x0, y0], [x1, y1]] = [polyline[k], polyline[k + 1]];
      const length = Math.hypot(x1 - x0, y1 - y0);
      if (length === 0) continue;
      const [nx, ny] = [(-(y1 - y0) / length) * half, ((x1 - x0) / length) * half];
      // the same way round as the discs
      polygons.push([
        [x0 + nx, y0 + ny],
        [x0 - nx, y0 - ny],
        [x1 - nx, y1 - ny],
        [x1 + nx, y1 + ny],
      ]);
    }
  }
  return polygons;
}

// ---- The day dial in the app icons ----------------------------------------------------------------------------------

/** The sectors and the ring in the coordinates of the design (100 x 100, y down). */
const fiveCommands = FIVE_PATHS.map(parsePath);
const trackCommands = parsePath(TRACK_PATH);

/**
 * PRO's letters in the 100 unit design: each box moved to its place, then scaled by `PRO.scale` about the middle
 * (SVG: `translate(50 50) scale(0.95)` and the letter's own `translate`), then by `extra`, a matrix, for the target.
 */
const proCommands = (extra = [1, 0, 0, 1, 0, 0]) => {
  const middle = DESIGN / 2;
  return PRO.letters.map(({ d, at: [dx, dy] }) => {
    const placed = transformPath(parsePath(d), [
      PRO.scale,
      0,
      0,
      PRO.scale,
      middle + PRO.scale * dx,
      middle + PRO.scale * dy,
    ]);
    return transformPath(placed, extra);
  });
};

/** The polylines of `commands` in the pixels of a `size` px icon. */
const inPixels = (commands, size) =>
  flatten(transformPath(commands, [size / DESIGN, 0, 0, size / DESIGN, 0, 0]), 0.02);

/** The vertical extent of polylines: an SVG gradient in objectBoundingBox units runs over the shape's own box. */
function verticalExtent(polylines) {
  const ys = polylines.flat().map(([, y]) => y);
  return [Math.min(...ys), Math.max(...ys)];
}

/**
 * The dial on the visible area of the 108 dp layer: the 100 unit design scaled by 72 / 100 (0.72 dp a unit) about its
 * middle (50, 50), which goes to the middle of the layer. As on iOS, in the Play icon and in the reference SVGs, the
 * sectors then reach 34 / 50 of the visible half (24.5 of 36 dp), so the dial keeps its proportions with the space
 * around it that a round, squircle or teardrop mask needs, and every point (control points too: a launcher is not told
 * the curve stays inside their hull) stays well inside the 33 dp safe zone.
 */
function androidDial() {
  const middle = DESIGN / 2;
  const scale = VISIBLE / DESIGN;
  const offset = GRID / 2 - middle * scale;
  const matrix = [scale, 0, 0, scale, offset, offset];
  return {
    track: transformPath(trackCommands, matrix),
    five: fiveCommands.map((commands) => transformPath(commands, matrix)),
    // PRO at the same scale, so it keeps the proportion it has on iOS; its stroke is `PRO.width x PRO.scale` units
    pro: proCommands(matrix),
    proWidth: PRO.width * PRO.scale * scale,
  };
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

const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const argb = (hex, alpha = 'FF') => `#${alpha}${hex.slice(1).toUpperCase()}`;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const mix = (from, to, share) => from.map((value, c) => value + (to[c] - value) * share);

/**
 * The colour at (u, v), both 0 to 1 across the box, of an SVG linear gradient in objectBoundingBox units from
 * (x1, y1) to (x2, y2) with evenly spaced `stops` (hex colours).
 */
function linearGradient([x1, y1, x2, y2], stops) {
  const colours = stops.map(rgb);
  const [dx, dy] = [x2 - x1, y2 - y1];
  return (u, v) => {
    const t = clamp01(((u - x1) * dx + (v - y1) * dy) / (dx * dx + dy * dy));
    const position = t * (colours.length - 1);
    const index = Math.min(Math.floor(position), colours.length - 2);
    return mix(colours[index], colours[index + 1], position - index);
  };
}

/** `values` (size x size, row by row) blurred by a Gaussian of standard deviation `sigma` px, zero beyond the edge. */
function blur(values, size, sigma) {
  const radius = Math.ceil(3 * sigma);
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, k) =>
    Math.exp(-((k - radius) ** 2) / (2 * sigma * sigma)),
  );
  const total = kernel.reduce((sum, weight) => sum + weight, 0);
  const pass = (source, step, across) => {
    const result = new Float64Array(size * size);
    for (let line = 0; line < size; line++) {
      for (let k = 0; k < size; k++) {
        let sum = 0;
        for (let w = Math.max(0, radius - k); w <= Math.min(2 * radius, radius + size - 1 - k); w++)
          sum += kernel[w] * source[line * across + (k + w - radius) * step];
        result[line * across + k * step] = sum / total;
      }
    }
    return result;
  };
  return pass(pass(values, 1, size), size, 1);
}

/**
 * One appearance as a `size` px square (RGB, row by row): the background gradient, the track over it, the soft shadow
 * of the five, and each sector with its own gradient from its top to its bottom, then PRO (`withPro`: Fivvi Pro's icon),
 * all anti-aliased.
 */
function raster(size, { background, track, five, shadow, pro }, withPro) {
  const scale = size / DESIGN;
  const sectors = fiveCommands.map((commands) => inPixels(commands, size));
  const fills = sectors.map((polylines) => {
    const [top, bottom] = verticalExtent(polylines);
    const gradient = linearGradient([0, 0, 0, 1], five);
    return (y) => gradient(0, (y + 0.5 - top) / (bottom - top));
  });
  const covered = sectors.map((polylines) => coverage(polylines, size));
  const ring = coverage(inPixels(trackCommands, size), size);
  const shifted = sectors
    .flat()
    .map((polyline) => polyline.map(([x, y]) => [x, y + SHADOW.dy * scale]));
  const shade = blur(coverage(shifted, size), size, SHADOW.deviation * scale);
  // PRO: round strokes in pixels, on top of everything, with no shadow
  const letters =
    withPro &&
    coverage(
      strokeOutline(
        proCommands([scale, 0, 0, scale, 0, 0]).flatMap((commands) => flatten(commands, 0.02)),
        PRO.width * PRO.scale * scale,
      ),
      size,
    );
  const proColour = rgb(pro);
  const gradient = linearGradient(BACKGROUND_VECTOR, background);
  const trackColour = rgb(track.colour);
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    const fill = fills.map((at) => at(y));
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let colour = gradient((x + 0.5) / size, (y + 0.5) / size);
      colour = mix(colour, trackColour, ring[i] * track.alpha);
      colour = colour.map((value) => value * (1 - shade[i] * shadow));
      covered.forEach((share, s) => {
        if (share[i] > 0) colour = mix(colour, fill[s], share[i]);
      });
      if (letters && letters[i] > 0) colour = mix(colour, proColour, letters[i]);
      colour.forEach((value, channel) => {
        pixels[i * 3 + channel] = Math.round(value);
      });
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

const AAPT = '\n    xmlns:aapt="http://schemas.android.com/aapt"';
const vector = (name, body, namespaces = '') => `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/app-icon.mjs (${name}); never edit by hand. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"${namespaces}
    android:width="${GRID}dp"
    android:height="${GRID}dp"
    android:viewportWidth="${GRID}"
    android:viewportHeight="${GRID}">
${body}</vector>
`;

const number = (value) => Number(value.toFixed(3));
const plainPath = (fill, d) => `    <path
        android:fillColor="${fill}"
        android:pathData="${d}" />
`;

/** A path drawn as a stroke of `width` with round caps and joins and no fill (PRO). */
const strokePath = (colour, width, d) => `    <path
        android:strokeColor="${colour}"
        android:strokeWidth="${number(width)}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:pathData="${d}" />
`;

/** A path filled with a linear gradient from (x1, y1) to (x2, y2) in the layer's coordinates (API 24 and up; the icon is 26+). */
const gradientPath = (d, [x1, y1, x2, y2], stops) => `    <path android:pathData="${d}">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="linear"
                android:startX="${number(x1)}"
                android:startY="${number(y1)}"
                android:endX="${number(x2)}"
                android:endY="${number(y2)}">
${stops.map((colour, k) => `                <item android:offset="${k / (stops.length - 1)}" android:color="${argb(colour)}" />\n`).join('')}            </gradient>
        </aapt:attr>
    </path>
`;

/** The background layer: the light gradient of the 1024 px icon over the whole layer. */
const backgroundVector = () =>
  vector(
    'background',
    gradientPath(
      `M0,0H${GRID}V${GRID}H0Z`,
      BACKGROUND_VECTOR.map((value) => value * GRID),
      APPEARANCES.light.background,
    ),
    AAPT,
  );

/** The foreground layer: the track, then each sector with its own gradient over its own height, then PRO if `withPro`. */
function foregroundVector({ track, five, pro, proWidth }, withPro) {
  const { track: ring, five: stops } = APPEARANCES.light;
  return vector(
    'foreground',
    plainPath(argb(ring.colour), pathData(track)) +
      five
        .map((commands) => {
          const [top, bottom] = verticalExtent(flatten(commands, 0.005));
          const x = GRID / 2;
          return gradientPath(pathData(commands), [x, top, x, bottom], stops);
        })
        .join('') +
      (withPro ? strokePath(argb(APPEARANCES.light.pro), proWidth, pathData(pro.flat())) : ''),
    AAPT,
  );
}

/**
 * The monochrome layer: the track and the five as one shape; the ring and the sectors wind the same way, so nothing
 * cancels. PRO is a stroke in black on top, if `withPro`.
 */
const monochromeVector = ({ track, five, pro, proWidth }, withPro) =>
  vector(
    'monochrome',
    plainPath('#FF000000', pathData([...track, ...five.flat()])) +
      (withPro ? strokePath('#FF000000', proWidth, pathData(pro.flat())) : ''),
  );

const appIconSet = 'apps/ios/FivviPro/Assets.xcassets/AppIcon.appiconset';

/** Every icon file as a map from its path in the repo to its content (a string or a Buffer). */
export function renderIcons() {
  const dial = androidDial();
  const png = (size, appearance, withPro) => encodePng(size, raster(size, appearance, withPro));
  /** The files of an Android app's launcher icon (`module` is `app` for Fivvi Pro, `client` for Fivvi); only Pro has PRO. */
  const androidIcon = (module, withPro) => {
    const res = `apps/android/${module}/src/main/res`;
    return [
      [
        `apps/android/${module}/src/main/ic_launcher-playstore.png`,
        png(512, APPEARANCES.light, withPro),
      ],
      [`${res}/drawable/ic_launcher_background.xml`, backgroundVector()],
      [`${res}/drawable/ic_launcher_foreground.xml`, foregroundVector(dial, withPro)],
      [`${res}/drawable/ic_launcher_monochrome.xml`, monochromeVector(dial, withPro)],
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
    ];
  };
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
    [`${appIconSet}/AppIcon.png`, png(1024, APPEARANCES.light, true)],
    [`${appIconSet}/AppIcon-Dark.png`, png(1024, APPEARANCES.dark, true)],
    [`${appIconSet}/AppIcon-Tinted.png`, png(1024, APPEARANCES.tinted, true)],
    ...androidIcon('app', true),
    ...androidIcon('client', false),
  ]);
}

function main(argv) {
  if (argv.length > 0) {
    console.error('Usage: node scripts/app-icon.mjs');
    return 2;
  }
  const files = renderIcons();
  for (const [path, content] of files) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true });
    writeFileSync(join(ROOT, path), content);
    console.log(`wrote ${path}`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
