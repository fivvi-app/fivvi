import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRAINER_WORDS } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { trainerWord } from './schema/organizations.ts';

// The runtime image's `ops` stage (Dockerfile) ships only some packages, so the release step and
// the cron job can load nothing else at runtime: the first F068 preview failed at start with
// ERR_MODULE_NOT_FOUND for @fivvi/i18n imported by the schema. This walks what those two entry
// points load, package by package, and compares it with what the Dockerfile copies.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const dockerfile = readFileSync(resolve(repoRoot, 'Dockerfile'), 'utf8');

/** The packages the runtime image copies from the ops stage: `COPY --from=ops /repo/packages/<name>`. */
function shippedPackages(): Set<string> {
  const names = [...dockerfile.matchAll(/^COPY --from=ops \/repo\/packages\/([\w-]+)/gm)];
  return new Set(names.map((match) => `@fivvi/${match[1]}`));
}

/** The files the services start: `#   release   node ops/packages/database/src/scripts/release.ts` in the Dockerfile. */
function entryPoints(): string[] {
  const lines = [...dockerfile.matchAll(/^#\s+\w+\s+node ops\/(\S+\.ts)/gm)];
  return lines.map((match) => resolve(repoRoot, match[1] ?? ''));
}

/** The source with comments blanked out, so a comment can neither hide an import nor fake one. */
function withoutComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const char = source[i] ?? '';
    const next = source[i + 1];
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      out += ' ';
    } else if (char === "'" || char === '"' || char === '`') {
      const start = i;
      i += 1;
      while (i < source.length && source[i] !== char) i += source[i] === '\\' ? 2 : 1;
      i += 1;
      out += source.slice(start, i);
    } else {
      out += char;
      i += 1;
    }
  }
  return out;
}

/**
 * The addresses a file loads at runtime. Only `import type` and `export type` are erased by
 * Node's type stripping; `import { type X } from 'pkg'` stays as `import {} from 'pkg'` and still
 * loads the package. Dynamic imports with a literal address count too.
 */
function runtimeImports(source: string): string[] {
  const code = withoutComments(source);
  const found: { at: number; specifier: string }[] = [];
  for (const match of code.matchAll(
    /\b(?:import|export)\s+(type\s+)?[^;'"`]*?\bfrom\s*(['"])([^'"]+)\2/g,
  )) {
    if (!match[1]) found.push({ at: match.index ?? 0, specifier: match[3] ?? '' });
  }
  for (const match of code.matchAll(/\bimport\s*(['"])([^'"]+)\1/g)) {
    found.push({ at: match.index ?? 0, specifier: match[2] ?? '' });
  }
  for (const match of code.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) {
    found.push({ at: match.index ?? 0, specifier: match[2] ?? '' });
  }
  return found.toSorted((a, b) => a.at - b.at).map(({ specifier }) => specifier);
}

/** `@fivvi/database/seed` -> the file its package.json exports names. */
function fileOfPackage(specifier: string): string {
  const [scope, name, ...rest] = specifier.split('/');
  const dir = resolve(repoRoot, 'packages', name ?? '');
  const manifest = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as {
    exports: Record<string, string>;
  };
  const target = manifest.exports[rest.length === 0 ? '.' : `./${rest.join('/')}`];
  if (!target) throw new Error(`${scope}/${name} exports nothing for ${specifier}`);
  return resolve(dir, target);
}

/**
 * Every file the entry points load, following relative imports and the imports of packages the
 * image ships. A package it does not ship is reported and not followed.
 */
function walk(
  entries: string[],
  shipped: Set<string> = shippedPackages(),
): { files: string[]; missing: string[] } {
  const seen = new Set<string>();
  const missing: string[] = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop() ?? '';
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of runtimeImports(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) {
        queue.push(resolve(dirname(file), specifier));
      } else if (specifier.startsWith('@fivvi/')) {
        const name = specifier.split('/').slice(0, 2).join('/');
        if (shipped.has(name)) queue.push(fileOfPackage(specifier));
        else missing.push(`${file.slice(repoRoot.length + 1)} imports ${specifier}`);
      }
    }
  }
  return { files: [...seen], missing };
}

describe('F068 the runtime image can load the database package', () => {
  it('reads the packages the ops stage ships from the Dockerfile', () => {
    expect([...shippedPackages()].toSorted()).toEqual(
      expect.arrayContaining(['@fivvi/database', '@fivvi/observability']),
    );
  });

  it('reads the release step and the cron job as the entry points', () => {
    expect(
      entryPoints()
        .map((file) => file.slice(repoRoot.length + 1))
        .toSorted(),
    ).toEqual(['apps/cron/src/main.ts', 'packages/database/src/scripts/release.ts']);
  });

  it('loads no workspace package at runtime that the ops stage leaves out', () => {
    const { files, missing } = walk(entryPoints());
    const walked = files.map((file) => file.slice(repoRoot.length + 1));
    // The walk really got into the schema, the cron job and the observability package.
    expect(walked).toEqual(
      expect.arrayContaining([
        'packages/database/src/schema/organizations.ts',
        'apps/cron/src/runner.ts',
        'packages/observability/src/index.ts',
      ]),
    );
    expect(missing).toEqual([]);
  });

  it('reports a package the image leaves out', () => {
    const { missing } = walk(entryPoints(), new Set(['@fivvi/database']));
    expect(missing).toContain('apps/cron/src/main.ts imports @fivvi/observability');
  });

  it('counts only import type and export type as erased', () => {
    expect(runtimeImports("import type { Locale } from '@fivvi/i18n';")).toEqual([]);
    expect(runtimeImports("export type { Locale } from '@fivvi/i18n';")).toEqual([]);
    // Node's type stripping leaves `import {} from '…'` behind, which still loads the package.
    expect(runtimeImports("import { type Locale } from '@fivvi/i18n';")).toEqual(['@fivvi/i18n']);
    expect(runtimeImports("export { type Locale } from '@fivvi/i18n';")).toEqual(['@fivvi/i18n']);
    expect(runtimeImports("import { TRAINER_WORDS, type Locale } from '@fivvi/i18n';")).toEqual([
      '@fivvi/i18n',
    ]);
    expect(runtimeImports("export { x } from '@fivvi/i18n';")).toEqual(['@fivvi/i18n']);
    expect(runtimeImports("import '@fivvi/i18n';")).toEqual(['@fivvi/i18n']);
  });

  it('catches a dynamic import with a literal address', () => {
    expect(runtimeImports("const x = await import('@fivvi/i18n');")).toEqual(['@fivvi/i18n']);
    expect(runtimeImports('const x = await import(name);')).toEqual([]);
  });

  it('is not fooled by comments, strings or a multi-line clause', () => {
    const source = [
      "// import { a } from '@fivvi/commented';",
      '/* import { b } from "@fivvi/block"; */',
      'import {',
      "  // we don't need the type, only the value",
      '  value,',
      "} from '@fivvi/i18n';",
      "const url = 'https://example.com'; // don't stop here",
      "import { c } from '@fivvi/testing/clock';",
    ].join('\n');
    expect(runtimeImports(source)).toEqual(['@fivvi/i18n', '@fivvi/testing/clock']);
  });

  it('keeps the enum values in step with the words the API and the apps know', () => {
    expect(trainerWord.enumValues).toEqual([...TRAINER_WORDS]);
  });
});
