import { hue } from './colour.ts';
import type { Mode } from './source.ts';

/** How far apart the two hues of a gradient may be, in degrees: a gradient stays in one hue. */
export const hueTolerance = 5;

/** A resolved colour token: its dotted path and `#rrggbb` value. */
interface Colour {
  path: string;
  value: string;
}

/** The colours a gradient may belong to: a session type, a status colour or the accent. */
const gradientOwner = /^color\.(session\.[\w-]+|status\.[\w-]+|accent)$/;

/**
 * Problems with the gradient tokens (`<owner>.gradient-top` and `<owner>.gradient-bottom`) of one
 * mode: a gradient needs both ends, belongs to one session type, status colour or the accent, and
 * its two hues differ by at most `hueTolerance` degrees ("too much to the purple", owner,
 * 5 November 2026).
 */
export function gradientProblems(colours: Colour[], mode: Mode): string[] {
  const byPath = new Map(colours.map((colour) => [colour.path, colour.value]));
  const owners = new Set(
    colours
      .map((colour) => colour.path.match(/^(.+)\.gradient-(?:top|bottom)$/)?.[1])
      .filter((owner): owner is string => owner !== undefined),
  );
  const problems: string[] = [];
  for (const owner of owners) {
    const [top, bottom] = [
      byPath.get(`${owner}.gradient-top`),
      byPath.get(`${owner}.gradient-bottom`),
    ];
    if (!gradientOwner.test(owner)) {
      problems.push(
        `${owner}.gradient-*: a gradient belongs to one session type, status colour or the accent`,
      );
    }
    if (top === undefined || bottom === undefined) {
      problems.push(`${owner}: a gradient needs both gradient-top and gradient-bottom`);
      continue;
    }
    const distance = Math.abs(hue(top) - hue(bottom));
    const apart = Math.min(distance, 360 - distance);
    if (apart > hueTolerance) {
      problems.push(
        `${owner} gradient, ${mode}: ${top} to ${bottom} drifts ${apart.toFixed(1)}° in hue, at most ${hueTolerance}° (one hue per gradient)`,
      );
    }
  }
  return problems;
}
