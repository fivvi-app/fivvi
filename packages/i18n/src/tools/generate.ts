import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { locales } from '../config.ts';
import { type Analysis, analyze } from './analyze.ts';
import { androidValuesDir, renderStringsXml } from './android.ts';
import { type CatalogSet, readCatalogSet } from './catalog.ts';
import { renderXcstrings } from './xcstrings.ts';

/** Committed output, relative to the package root. E008 wires these into the apps. */
export const generatedDir = 'generated';

export class CatalogError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`The catalogs have ${problems.length} problem(s):\n${problems.join('\n')}`);
    this.problems = problems;
  }
}

/** Renders every native catalog, keyed by path relative to the package root. */
export function renderNativeCatalogs(analysis: Analysis): Map<string, string> {
  const problems = [...analysis.parity, ...analysis.icu];
  if (problems.length > 0) throw new CatalogError(problems);
  const files = new Map<string, string>();
  files.set(`${generatedDir}/ios/Localizable.xcstrings`, renderXcstrings(analysis));
  for (const locale of locales) {
    files.set(
      `${generatedDir}/android/${androidValuesDir[locale]}/strings.xml`,
      renderStringsXml(analysis, locale),
    );
  }
  return files;
}

export async function writeNativeCatalogs(root: string, set?: CatalogSet): Promise<string[]> {
  const files = renderNativeCatalogs(analyze(set ?? (await readCatalogSet(root))));
  for (const [file, content] of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  return [...files.keys()];
}

/** Files under `generated/` that differ from what the generator would write, or shouldn't exist. */
export async function staleNativeCatalogs(
  root: string,
  expected: Map<string, string>,
): Promise<string[]> {
  const stale: string[] = [];
  for (const [file, content] of expected) {
    const actual = await readFile(path.join(root, file), 'utf8').catch(() => undefined);
    if (actual === undefined) stale.push(`${file} is missing`);
    else if (actual !== content) stale.push(`${file} is out of date`);
  }
  const existing = await readdir(path.join(root, generatedDir), {
    recursive: true,
    withFileTypes: true,
  })
    .then((entries) =>
      entries
        .filter((entry) => entry.isFile())
        .map((entry) =>
          path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
        ),
    )
    .catch(() => []);
  for (const file of existing) {
    if (!expected.has(file)) stale.push(`${file} is not produced by the generator; delete it`);
  }
  return stale;
}
