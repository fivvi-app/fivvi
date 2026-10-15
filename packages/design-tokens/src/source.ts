import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

/** WCAG 2.2 AA minimum per kind of pair: text 1.4.3, non-text 1.4.11 (and the focus ring, 2.4.13). */
export const minimumRatio = { text: 4.5, 'non-text': 3 } as const;

export interface ContrastPair {
  fg: string;
  bg: string;
  kind: keyof typeof minimumRatio;
  use: string;
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

/** Paths of the semantic colours (`color.*` outside the base palette): what apps may use. */
export function semanticColours(source: TokenSource): string[] {
  return tokenPaths(source.light).filter(
    (tokenPath) => tokenPath.startsWith('color.') && !tokenPath.startsWith('color.base.'),
  );
}

/** A copy of `tree` without the token at `tokenPath`. */
export function withoutToken(tree: TokenTree, tokenPath: string): TokenTree {
  const copy = structuredClone(tree);
  const segments = tokenPath.split('.');
  const leaf = segments.pop() ?? '';
  let node: unknown = copy;
  for (const segment of segments) node = isObject(node) ? node[segment] : undefined;
  if (isObject(node)) delete node[leaf];
  return copy;
}

/** A copy of `tree` with the `$value` of the token at `tokenPath` replaced. */
export function withValue(tree: TokenTree, tokenPath: string, value: unknown): TokenTree {
  const copy = structuredClone(tree);
  let node: unknown = copy;
  for (const segment of tokenPath.split('.')) node = isObject(node) ? node[segment] : undefined;
  if (!isToken(node)) throw new Error(`No token at ${tokenPath}`);
  node.$value = value;
  return copy;
}

/**
 * Deep-merges token trees. With `override`, later tokens replace earlier ones (dark over light);
 * without it a token defined twice is a source error. Root-level `$` keys (file descriptions) are dropped.
 */
export function mergeTrees(
  trees: TokenTree[],
  override = false,
  problems: string[] = [],
): TokenTree {
  const merge = (target: TokenTree, from: TokenTree, at: string[]) => {
    for (const [key, child] of Object.entries(from)) {
      if (at.length === 0 && key.startsWith('$')) continue;
      const existing = target[key];
      if (isObject(existing) && isObject(child) && !isToken(existing) && !isToken(child)) {
        merge(existing, child, [...at, key]);
      } else if (isToken(existing) && isToken(child) && override) {
        target[key] = { ...existing, ...child };
      } else if (existing !== undefined && !key.startsWith('$')) {
        problems.push(`${[...at, key].join('.')} is defined in more than one token file`);
      } else {
        target[key] = structuredClone(child);
      }
    }
  };
  const result: TokenTree = {};
  for (const tree of trees) merge(result, tree, []);
  return result;
}

/** The full token tree for a mode: dark is light with the dark semantic colours on top. */
export function treeFor(source: TokenSource, mode: Mode): TokenTree {
  return mode === 'light' ? source.light : mergeTrees([source.light, source.dark], true);
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
  }
  return problems;
}

async function readJson(root: string, file: string): Promise<TokenTree> {
  const parsed: unknown = JSON.parse(await readFile(path.join(root, file), 'utf8'));
  if (!isObject(parsed)) throw new TokenSourceError([`${file} must contain a JSON object`]);
  return parsed;
}

export async function readTokenSource(root: string): Promise<TokenSource> {
  const problems: string[] = [];
  const light = mergeTrees(
    await Promise.all(
      [sourceFiles.palette, sourceFiles.light, ...sourceFiles.shared].map((file) =>
        readJson(root, file),
      ),
    ),
    false,
    problems,
  );
  const dark = mergeTrees([await readJson(root, sourceFiles.dark)]);
  const { pairs } = await readJson(root, sourceFiles.contrastPairs);
  if (!Array.isArray(pairs))
    problems.push(`${sourceFiles.contrastPairs} must have a "pairs" array`);
  if (problems.length > 0) throw new TokenSourceError(problems);
  return { light, dark, pairs: pairs as ContrastPair[] };
}
