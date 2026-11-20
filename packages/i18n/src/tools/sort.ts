import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type Locale, locales } from '../config.ts';
import { type CatalogSet, catalogFile, commentsFile, isPlainObject } from './catalog.ts';

/** The command that sorts the catalogs; the `sorted` check names it. */
export const sortCommand = 'pnpm --filter @fivvi/i18n sort';

/**
 * `en.json`, `nl-NL.json` and `comments.json` keep their keys sorted at every object level
 * (E001 #1272), so two PRs that each add a key touch different lines. The order is plain
 * code-unit order, the one of `Array.prototype.sort()`: it does not depend on a locale.
 * Key segments are letters and digits, which all sort after `.`, so a nested catalog and the
 * flat dot-path keys of `comments.json` list the same keys in the same order.
 */
const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A copy of the tree with the keys of every object sorted; values are untouched. */
export function sortKeys(tree: unknown): unknown {
  if (!isPlainObject(tree)) return tree;
  return Object.fromEntries(
    Object.keys(tree)
      .sort(byKey)
      .map((key) => [key, sortKeys(tree[key])]),
  );
}

export function sortedCatalogs(set: CatalogSet): CatalogSet {
  return {
    messages: Object.fromEntries(
      locales.map((locale) => [locale, sortKeys(set.messages[locale])]),
    ) as Record<Locale, unknown>,
    comments: sortKeys(set.comments),
  };
}

/** The first key of each object level that comes before the key above it, as a dot path. */
function outOfOrder(tree: unknown, prefix = ''): string[] {
  if (!isPlainObject(tree)) return [];
  const keys = Object.keys(tree);
  const found: string[] = [];
  const first = keys.findIndex(
    (key, index) => index > 0 && byKey(keys[index - 1] as string, key) > 0,
  );
  if (first > 0) {
    const key = keys[first] as string;
    found.push(`"${prefix}${key}" comes after "${prefix}${keys[first - 1]}"`);
  }
  for (const key of keys) found.push(...outOfOrder(tree[key], `${prefix}${key}.`));
  return found;
}

const SHOWN_PER_FILE = 10;

/** One problem per place a catalog is out of order, then the command that sorts them. */
export function unsortedCatalogProblems(set: CatalogSet): string[] {
  const files: [string, unknown][] = [
    ...locales.map((locale): [string, unknown] => [catalogFile(locale), set.messages[locale]]),
    [commentsFile, set.comments],
  ];
  const problems = files.flatMap(([file, tree]) => {
    const found = outOfOrder(tree).map((problem) => `${file}: ${problem}; keys must be sorted`);
    const more = found.length - SHOWN_PER_FILE;
    return more > 0 ? [...found.slice(0, SHOWN_PER_FILE), `${file}: … and ${more} more`] : found;
  });
  if (problems.length > 0) problems.push(`Run \`${sortCommand}\` and commit the result.`);
  return problems;
}

/** Writes the catalogs and `comments.json` sorted, in the layout they are committed in. */
export async function writeSortedCatalogs(root: string, set: CatalogSet): Promise<string[]> {
  const sorted = sortedCatalogs(set);
  const files: [string, unknown][] = [
    ...locales.map((locale): [string, unknown] => [catalogFile(locale), sorted.messages[locale]]),
    [commentsFile, sorted.comments],
  ].filter(([file, tree]) => file !== commentsFile || Object.keys(tree as object).length > 0) as [
    string,
    unknown,
  ][];
  for (const [file, tree] of files) {
    await writeFile(path.join(root, file), `${JSON.stringify(tree, null, 2)}\n`);
  }
  return files.map(([file]) => file);
}
