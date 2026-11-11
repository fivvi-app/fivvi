// Separate clocks (ADR-012, F057 AC7 and AC16): an agreement's payment schedule is a clock of its
// own and never derives from class times. The test reads the imports of `src/` and fails when
// agreement or schedule code reaches scheduling code (sessions, series, class times), or
// scheduling code reaches the schedule, directly or through other files.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

/** Reads the source of a file, by path relative to `src/`; `undefined` when there is none. */
type ReadSource = (file: string) => string | undefined;

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"]+)\1/g;

/** The relative import specifiers of a source text, resolved to paths relative to `src/`. */
function importsOf(file: string, source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[2] ?? '';
    if (!specifier.startsWith('.')) continue;
    found.add(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
  }
  return [...found];
}

/** Every file reachable from `start` through relative imports, `start` included. */
function reachable(start: string, read: ReadSource): Map<string, string> {
  const seen = new Map<string, string>([[start, start]]);
  const queue = [start];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    const source = read(file);
    if (source === undefined) continue;
    for (const imported of importsOf(file, source)) {
      if (seen.has(imported)) continue;
      seen.set(imported, file);
      queue.push(imported);
    }
  }
  return seen;
}

const isScheduling = (file: string) => file.startsWith('scheduling/');
/** The schedule and the agreement code: `commerce/schedule*.ts` and `commerce/agreement*.ts`. */
const isSchedule = (file: string) =>
  /^commerce\/(schedule|agreements?)(?:[.-][^/]*)?\.ts$/.test(file);
const isTest = (file: string) => file.endsWith('.test.ts');

/** The violations: each is `from -> to`, the first file of the path that crossed over. */
function clockViolations(files: readonly string[], read: ReadSource): string[] {
  const violations: string[] = [];
  for (const file of files.filter((f) => isSchedule(f) && !isTest(f))) {
    for (const [reached, via] of reachable(file, read)) {
      if (isScheduling(reached)) violations.push(`${file} -> ${reached} (imported by ${via})`);
    }
  }
  for (const file of files.filter((f) => isScheduling(f) && !isTest(f))) {
    for (const [reached, via] of reachable(file, read)) {
      if (isSchedule(reached)) violations.push(`${file} -> ${reached} (imported by ${via})`);
    }
  }
  return violations;
}

function listSources(dir = ''): string[] {
  return readdirSync(path.join(SRC, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return listSources(relative);
    return relative.endsWith('.ts') ? [relative] : [];
  });
}

const readFromDisk: ReadSource = (file) => {
  try {
    return readFileSync(path.join(SRC, file), 'utf8');
  } catch {
    return undefined;
  }
};

function graph(sources: Record<string, string>) {
  return {
    files: Object.keys(sources),
    read: ((file) => sources[file]) as ReadSource,
  };
}

describe('the checker', () => {
  it('passes when the schedule and scheduling stay apart', () => {
    const { files, read } = graph({
      'commerce/schedule.ts': "import { x } from './offers.ts';",
      'commerce/offers.ts': "import { y } from '@fivvi/i18n';",
      'scheduling/zoned-time.ts': 'export const z = 1;',
      'scheduling/group-class.ts': "import { z } from './zoned-time.ts';",
    });
    expect(clockViolations(files, read)).toEqual([]);
  });

  it('AC7/AC16: fails when the schedule imports scheduling', () => {
    const { files, read } = graph({
      'commerce/schedule.ts': "import { addDays } from '../scheduling/zoned-time.ts';",
      'scheduling/zoned-time.ts': 'export const addDays = 1;',
    });
    expect(clockViolations(files, read)).toEqual([
      'commerce/schedule.ts -> scheduling/zoned-time.ts (imported by commerce/schedule.ts)',
    ]);
  });

  it('AC7/AC16: fails when scheduling imports the schedule', () => {
    const { files, read } = graph({
      'commerce/schedule.ts': 'export const dueDates = 1;',
      'scheduling/group-class.ts': "import { dueDates } from '../commerce/schedule.ts';",
    });
    expect(clockViolations(files, read)).toEqual([
      'scheduling/group-class.ts -> commerce/schedule.ts (imported by scheduling/group-class.ts)',
    ]);
  });

  it('fails on agreement code too, and on a re-export or a dynamic import', () => {
    const { files, read } = graph({
      'commerce/agreements.ts': "export { localDateOf } from '../scheduling/zoned-time.ts';",
      'commerce/agreements-offer.ts': "const m = await import('../scheduling/group-class.ts');",
      'scheduling/zoned-time.ts': '',
      'scheduling/group-class.ts': '',
    });
    expect(clockViolations(files, read)).toHaveLength(2);
  });

  it('fails when the import goes through another file', () => {
    const { files, read } = graph({
      'commerce/schedule.ts': "import { shared } from '../shared.ts';",
      'shared.ts': "export * from './scheduling/zoned-time.ts';",
      'scheduling/zoned-time.ts': '',
    });
    expect(clockViolations(files, read)).toEqual([
      'commerce/schedule.ts -> scheduling/zoned-time.ts (imported by shared.ts)',
    ]);
  });

  it('fails when scheduling reaches the schedule through the package index', () => {
    const { files, read } = graph({
      'commerce/schedule.ts': '',
      'index.ts': "export * from './commerce/schedule.ts';",
      'scheduling/group-class.ts': "import { x } from '../index.ts';",
    });
    expect(clockViolations(files, read)).toEqual([
      'scheduling/group-class.ts -> commerce/schedule.ts (imported by index.ts)',
    ]);
  });
});

describe('the domain package', () => {
  const files = listSources();

  it('has the files the rule is about, so the check is never empty', () => {
    expect(files.filter((f) => isSchedule(f) && !isTest(f)).length).toBeGreaterThan(0);
    expect(files.filter((f) => isScheduling(f) && !isTest(f)).length).toBeGreaterThan(0);
  });

  it('AC7/AC16: schedule never imports scheduling, scheduling never imports the schedule', () => {
    expect(clockViolations(files, readFromDisk)).toEqual([]);
  });
});
