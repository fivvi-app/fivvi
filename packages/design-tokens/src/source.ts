import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type MixSpace, mix } from './colour.ts';

export const modes = ['light', 'dark'] as const;
export type Mode = (typeof modes)[number];

/** The token source, relative to the package root (README.md explains each file). */
export const sourceFiles = {
  palette: 'tokens/palette.json',
  light: 'tokens/color.light.json',
  dark: 'tokens/color.dark.json',
  shared: ['tokens/typography.json', 'tokens/layout.json', 'tokens/motion.json'],
  contrastPairs: 'tokens/contrast-pairs.json',
} as const;

/**
 * Minimum contrast per kind of pair: text 1.4.3, non-text 1.4.11 (and the focus ring, 2.4.13).
 * `native-secondary-text` is the one exception to the 4.5:1 rule (ADR-032): the native apps'
 * secondary text in light mode, which may not drop below 3:1.
 */
export const minimumRatio = { text: 4.5, 'non-text': 3, 'native-secondary-text': 3 } as const;

/**
 * The minimum ratio of a kind of pair in a mode. The `native-secondary-text` exception is for light
 * mode only (ADR-032): in dark mode the apps' secondary text meets 4.5:1.
 */
export const minimumFor = (kind: keyof typeof minimumRatio, mode: Mode): number =>
  kind === 'native-secondary-text' && mode === 'dark' ? minimumRatio.text : minimumRatio[kind];

/** The one token that may be the foreground of a `native-secondary-text` pair, and only of those. */
export const nativeSecondaryText = 'color.text.secondary';

/** Colours the contrast check can't read: translucent glass surfaces and decorative marks. */
const outsideContrastPairs = /^color\.(web\.glass\.|fill\.decorative$)/;

export interface ContrastPair {
  fg: string;
  bg: string;
  kind: keyof typeof minimumRatio;
  use: string;
  /** Why the pair may stay under the usual minimum; required for `native-secondary-text`. */
  reason?: string;
}

/** A DTCG group or token: tokens have `$value`, groups have child keys. */
export type TokenTree = { [key: string]: unknown };

export interface TokenSource {
  /** Every token in light mode: the palette, the light semantic colours and the mode-independent tokens. */
  light: TokenTree;
  /** The dark value of every semantic colour (`tokens/color.dark.json`). */
  dark: TokenTree;
  pairs: ContrastPair[];
}

export class TokenSourceError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`The token source has ${problems.length} problem(s):\n${problems.join('\n')}`);
    this.problems = problems;
  }
}

const isObject = (value: unknown): value is TokenTree =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isToken = (node: unknown): node is TokenTree & { $value: unknown } =>
  isObject(node) && '$value' in node;

/** Dotted paths of every token in a tree, in source order. */
export function tokenPaths(tree: TokenTree, prefix: string[] = []): string[] {
  return Object.entries(tree).flatMap(([key, child]) => {
    if (key.startsWith('$') || !isObject(child)) return [];
    const childPath = [...prefix, key];
    return isToken(child) ? [childPath.join('.')] : tokenPaths(child, childPath);
  });
}

export type Platform = 'ios' | 'android';

/** The `$extensions` key for platform mapping notes, e.g. the native text style of a type style. */
const platformExtension = 'app.fivvi.platform';

/** The platform note of every token in `tree` that has one, by token path. */
export function platformNotes(tree: TokenTree, platform: Platform): Map<string, string> {
  const notes = new Map<string, string>();
  for (const tokenPath of tokenPaths(tree)) {
    let node: unknown = tree;
    for (const key of tokenPath.split('.')) node = isObject(node) ? node[key] : undefined;
    const extensions = isObject(node) ? node.$extensions : undefined;
    const mapping = isObject(extensions) ? extensions[platformExtension] : undefined;
    const note = isObject(mapping) ? mapping[platform] : undefined;
    if (typeof note === 'string') notes.set(tokenPath, note);
  }
  return notes;
}

/** Whether a token belongs to the base palette, which apps never use directly. */
export const isPalette = (tokenPath: string) => tokenPath.startsWith('color.base.');

/** Whether a semantic colour is for the web only (`color.web.*`): the native apps don't generate it. */
export const isWebOnly = (tokenPath: string) => tokenPath.startsWith('color.web.');

/** Paths of the semantic colours (`color.*` outside the base palette): what apps may use. */
export function semanticColours(source: TokenSource): string[] {
  return tokenPaths(source.light).filter(
    (tokenPath) => tokenPath.startsWith('color.') && !isPalette(tokenPath),
  );
}

/** A token file without its root-level `$` keys (the file's `$description`). */
const withoutFileMeta = (file: TokenTree): TokenTree =>
  Object.fromEntries(Object.entries(file).filter(([key]) => !key.startsWith('$')));

/** Deep-merges token files into one tree; a token defined in two files is a problem. */
function combineFiles(files: TokenTree[]): { tree: TokenTree; problems: string[] } {
  const problems: string[] = [];
  const merge = (target: TokenTree, from: TokenTree, at: string[]) => {
    for (const [key, child] of Object.entries(from)) {
      const existing = target[key];
      if (isObject(existing) && isObject(child) && !isToken(existing) && !isToken(child)) {
        merge(existing, child, [...at, key]);
      } else if (existing !== undefined && !key.startsWith('$')) {
        problems.push(`${[...at, key].join('.')} is defined in more than one token file`);
      } else {
        target[key] = structuredClone(child);
      }
    }
  };
  const tree: TokenTree = {};
  for (const file of files) merge(tree, withoutFileMeta(file), []);
  return { tree, problems };
}

/** A copy of `base` where every token in `overrides` replaces the fields it sets. */
function overlay(base: TokenTree, overrides: TokenTree): TokenTree {
  const result = structuredClone(base);
  for (const [key, child] of Object.entries(overrides)) {
    const existing = result[key];
    if (isToken(existing) && isToken(child)) result[key] = { ...existing, ...child };
    else if (isObject(existing) && isObject(child)) result[key] = overlay(existing, child);
    else result[key] = structuredClone(child);
  }
  return result;
}

/**
 * A colour derived from others, written as the `$value` of a token:
 * `{ "mix": { "color": "{color.base.accent.fill}", "with": "#000000", "amount": 85, "space": "oklab" } }`
 * is `amount`% of `color` with the rest of `with`, as CSS `color-mix`. Both may be `#rrggbb`
 * or a reference. Derived values are written down once, so changing a base colour changes them.
 */
interface MixValue {
  mix: { color: string; with: string; amount: number; space: MixSpace };
}

const isMix = (value: unknown): value is MixValue =>
  isObject(value) && isObject(value.mix) && 'color' in value.mix;

/** The token at a dotted path in `tree`, if it is one. */
function tokenAt(
  tree: TokenTree,
  tokenPath: string,
): (TokenTree & { $value: unknown }) | undefined {
  let node: unknown = tree;
  for (const key of tokenPath.split('.')) node = isObject(node) ? node[key] : undefined;
  return isToken(node) ? node : undefined;
}

/** A copy of `tree` where every mixed colour is its resulting `#rrggbb`. */
export function resolveMixes(tree: TokenTree): TokenTree {
  const copy = structuredClone(tree);
  const problems: string[] = [];
  const resolving: string[] = [];
  const colourOf = (operand: string, from: string): string => {
    if (!operand.startsWith('{')) return operand;
    const target = operand.slice(1, -1);
    const token = tokenAt(copy, target);
    if (!token) {
      problems.push(`${from} mixes ${operand}, which is not a token`);
      return '#000000';
    }
    return colourValue(target, token.$value);
  };
  const colourValue = (tokenPath: string, value: unknown): string => {
    if (typeof value === 'string' && value.startsWith('{')) return colourOf(value, tokenPath);
    if (!isMix(value)) return String(value);
    if (resolving.includes(tokenPath)) {
      problems.push(`${tokenPath} mixes itself: ${[...resolving, tokenPath].join(' > ')}`);
      return '#000000';
    }
    resolving.push(tokenPath);
    const { color, with: other, amount, space } = value.mix;
    const result = mix(colourOf(color, tokenPath), colourOf(other, tokenPath), amount, space);
    resolving.pop();
    return result;
  };
  for (const tokenPath of tokenPaths(copy)) {
    const token = tokenAt(copy, tokenPath);
    if (token && isMix(token.$value)) token.$value = colourValue(tokenPath, token.$value);
  }
  if (problems.length > 0) throw new TokenSourceError(problems);
  return copy;
}

/** The full token tree for a mode: dark is light with the dark semantic colours on top. */
export function treeFor(source: TokenSource, mode: Mode): TokenTree {
  return resolveMixes(mode === 'light' ? source.light : overlay(source.light, source.dark));
}

/** Problems that make the source unusable: missing or unknown dark values, bad contrast pairs. */
export function validate(source: TokenSource): string[] {
  const problems: string[] = [];
  const colours = semanticColours(source);
  const darkPaths = tokenPaths(source.dark);
  for (const colour of colours) {
    if (!darkPaths.includes(colour)) {
      problems.push(`${colour} has no dark value in ${sourceFiles.dark}`);
    }
  }
  for (const darkPath of darkPaths) {
    if (!colours.includes(darkPath)) {
      problems.push(
        `${darkPath} in ${sourceFiles.dark} is not a semantic colour in ${sourceFiles.light}`,
      );
    }
  }
  for (const [index, pair] of source.pairs.entries()) {
    const label = `${sourceFiles.contrastPairs} pair ${index + 1}`;
    for (const side of [pair.fg, pair.bg]) {
      if (!colours.includes(side)) problems.push(`${label}: ${side} is not a semantic colour`);
    }
    if (!Object.hasOwn(minimumRatio, pair.kind)) {
      problems.push(`${label}: kind must be one of ${Object.keys(minimumRatio).join(', ')}`);
    }
    for (const side of [pair.fg, pair.bg]) {
      if (outsideContrastPairs.test(side)) {
        problems.push(`${label}: ${side} is translucent or decorative and has no contrast pair`);
      }
    }
    if (pair.kind === 'native-secondary-text') {
      if (pair.fg !== nativeSecondaryText) {
        problems.push(`${label}: only ${nativeSecondaryText} may be a native-secondary-text pair`);
      }
      if (!pair.reason?.trim())
        problems.push(`${label}: a native-secondary-text pair needs a reason`);
    } else if (pair.fg === nativeSecondaryText) {
      problems.push(
        `${label}: ${nativeSecondaryText} may only be in native-secondary-text pairs (ADR-032)`,
      );
    }
  }
  return problems;
}

async function readJson(root: string, file: string): Promise<TokenTree> {
  const parsed: unknown = JSON.parse(await readFile(path.join(root, file), 'utf8'));
  if (!isObject(parsed)) throw new TokenSourceError([`${file} must contain a JSON object`]);
  return parsed;
}

export async function readTokenSource(root: string): Promise<TokenSource> {
  const { tree: light, problems } = combineFiles(
    await Promise.all(
      [sourceFiles.palette, sourceFiles.light, ...sourceFiles.shared].map((file) =>
        readJson(root, file),
      ),
    ),
  );
  const dark = withoutFileMeta(await readJson(root, sourceFiles.dark));
  const { pairs } = await readJson(root, sourceFiles.contrastPairs);
  if (!Array.isArray(pairs)) {
    problems.push(`${sourceFiles.contrastPairs} must have a "pairs" array`);
  }
  if (problems.length > 0) throw new TokenSourceError(problems);
  return { light, dark, pairs: pairs as ContrastPair[] };
}
