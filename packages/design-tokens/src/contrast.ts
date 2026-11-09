import { resolveTokens } from './build.ts';
import { parseHex } from './colour.ts';
import { type ContrastPair, type Mode, minimumFor, modes, type TokenSource } from './source.ts';

export interface ContrastResult {
  pair: ContrastPair;
  mode: Mode;
  ratio: number;
  minimum: number;
  passes: boolean;
}

function relativeLuminance(colour: string): number {
  const [r = 0, g = 0, b = 0] = parseHex(colour).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio of two opaque `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [lighter = 0, darker = 0] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/** Every declared pair in light and dark mode. */
export async function contrastResults(source: TokenSource): Promise<ContrastResult[]> {
  const resolved = await resolveTokens(source);
  return source.pairs.flatMap((pair) =>
    modes.map((mode) => {
      const value = (tokenPath: string) => {
        const token = resolved[mode].find((candidate) => candidate.path === tokenPath);
        if (!token) throw new Error(`${tokenPath} has no ${mode} value`);
        return token.value;
      };
      const ratio = contrastRatio(value(pair.fg), value(pair.bg));
      const minimum = minimumFor(pair.kind, mode);
      return { pair, mode, ratio, minimum, passes: ratio >= minimum };
    }),
  );
}

/** Rounded down, so a ratio just under the minimum never reads as passing. */
const formatRatio = (ratio: number) => (Math.floor(ratio * 100) / 100).toFixed(2);

export function describeFailure({ pair, mode, ratio, minimum }: ContrastResult): string {
  return `${pair.fg} on ${pair.bg} (${pair.use}), ${mode}: ${formatRatio(ratio)}:1, needs ${minimum}:1`;
}
