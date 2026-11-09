/** Colour arithmetic for the token source: mixing (as CSS `color-mix`) and hue, on opaque `#rrggbb`. */

export type MixSpace = 'oklab' | 'srgb';

type Rgb = [number, number, number];

const hexPattern = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** The channels of an opaque `#rrggbb` colour, 0 to 1 (gamma-encoded sRGB). */
export function parseHex(colour: string): Rgb {
  const channels = colour.match(hexPattern)?.slice(1);
  if (!channels) throw new Error(`${colour} is not an opaque #rrggbb colour`);
  const [r = 0, g = 0, b = 0] = channels.map((hex) => Number.parseInt(hex, 16) / 255);
  return [r, g, b];
}

const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0 to 1, gamma-encoded) to Oklab (Björn Ottosson). */
function toOklab(colour: Rgb): Rgb {
  const [r = 0, g = 0, b = 0] = colour.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([lightness, a, b]: Rgb): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * `amount` percent of `colour` mixed with the rest of `other`, as CSS `color-mix(in <space>, colour
 * amount%, other)`. The prototype mixes session colours with black and ink in Oklab (gradients,
 * glyphs, text) and tints in sRGB.
 */
export function mix(colour: string, other: string, amount: number, space: MixSpace): string {
  const t = amount / 100;
  const [a, b] = [parseHex(colour), parseHex(other)];
  if (space === 'srgb') {
    return toHex(a.map((channel, i) => channel * t + (b[i] ?? 0) * (1 - t)) as Rgb);
  }
  const [oa, ob] = [toOklab(a), toOklab(b)];
  return toHex(fromOklab(oa.map((channel, i) => channel * t + (ob[i] ?? 0) * (1 - t)) as Rgb));
}

/** The hue of a colour in degrees (0 to 360), as in HSL. */
export function hue(colour: string): number {
  const [r, g, b] = parseHex(colour);
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
  if (max === min) return 0;
  const delta = max - min;
  const degrees =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (degrees * 60 + 360) % 360;
}
