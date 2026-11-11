import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRAINER_WORDS } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { trainerWord } from './schema/organizations.ts';

// The runtime image's `ops` stage (Dockerfile) ships only these packages, so the release step
// and the cron job can load nothing else at runtime: the first F068 preview failed at start with
// ERR_MODULE_NOT_FOUND for @fivvi/i18n imported by the schema.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

/** The packages the runtime image copies from the ops stage: `COPY --from=ops /repo/packages/<name>`. */
function shippedPackages(): Set<string> {
  const dockerfile = readFileSync(resolve(repoRoot, 'Dockerfile'), 'utf8');
  const names = [...dockerfile.matchAll(/^COPY --from=ops \/repo\/(?:packages|apps)\/([\w-]+)/gm)];
  return new Set(names.map((match) => `@fivvi/${match[1]}`));
}

/** The workspace packages a file imports at runtime: `import type` and all-`type` braces are erased. */
function runtimeImports(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(
    /^(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s+'([^']+)'/gm,
  )) {
    const [, typeOnly, clause = '', specifier = ''] = match;
    if (typeOnly) continue;
    const braces = /^\{([^}]*)\}$/.exec(clause.trim())?.[1];
    if (braces !== undefined) {
      const items = braces
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      if (items.length > 0 && items.every((item) => item.startsWith('type '))) continue;
    }
    found.push(specifier);
  }
  for (const match of source.matchAll(/^import\s+'([^']+)'/gm)) found.push(match[1] ?? '');
  return found;
}

/** Every file the release step and the cron job can reach in this package, from their entry points. */
function reachableFiles(entries: string[]): Map<string, string> {
  const files = new Map<string, string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop() ?? '';
    if (files.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    files.set(file, source);
    for (const specifier of runtimeImports(source)) {
      if (specifier.startsWith('.')) queue.push(resolve(dirname(file), specifier));
    }
  }
  return files;
}

describe('F068 the runtime image can load the database package', () => {
  it('reads the packages the ops stage ships from the Dockerfile', () => {
    expect([...shippedPackages()].toSorted()).toEqual(
      expect.arrayContaining(['@fivvi/database', '@fivvi/observability']),
    );
  });

  it('imports no workspace package at runtime that the ops stage leaves out', () => {
    const shipped = shippedPackages();
    const files = reachableFiles([
      resolve(here, 'index.ts'),
      resolve(here, 'migrate.ts'),
      resolve(here, 'seed.ts'),
      resolve(here, 'scripts/release.ts'),
    ]);
    expect(files.size).toBeGreaterThan(10);
    const missing = [...files].flatMap(([file, source]) =>
      runtimeImports(source)
        .filter((specifier) => specifier.startsWith('@fivvi/'))
        .map((specifier) => specifier.split('/').slice(0, 2).join('/'))
        .filter((name) => !shipped.has(name))
        .map((name) => `${file.slice(repoRoot.length + 1)} imports ${name}`),
    );
    expect(missing).toEqual([]);
  });

  it('tells a value import from a type import', () => {
    expect(runtimeImports("import type { Locale } from '@fivvi/i18n';")).toEqual([]);
    expect(runtimeImports("import { type Locale } from '@fivvi/i18n';")).toEqual([]);
    expect(runtimeImports("import { TRAINER_WORDS, type Locale } from '@fivvi/i18n';")).toEqual([
      '@fivvi/i18n',
    ]);
    expect(runtimeImports("export { x } from '@fivvi/i18n';")).toEqual(['@fivvi/i18n']);
  });

  it('keeps the enum values in step with the words the API and the apps know', () => {
    expect(trainerWord.enumValues).toEqual([...TRAINER_WORDS]);
  });
});
