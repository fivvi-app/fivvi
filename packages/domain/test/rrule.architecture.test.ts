// F022 AC10: a recurrence rule is expanded into dates in `packages/domain` and nowhere else
// (ADR-012). Neither the web, the apps nor the API read an RRULE: they store the rule text the
// domain wrote, and ask `expandSeries`, `materialize` and `applyThisAndFollowing` for dates. This
// test reads every source file outside `packages/domain` (TypeScript, Swift and Kotlin) and fails
// when one imports a recurrence library or spells a rule (`FREQ=`, `BYDAY`, `RRule`), except the
// few files that only store or document the rule text, listed below with the reason.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Files outside the domain that may spell a rule, and why. Anything else that does fails the test. */
const ALLOWED: Readonly<Record<string, string>> = {
  'packages/database/src/schema/class-series.ts':
    'the table documents its rule column and the migration checks its syntax',
  'packages/database/src/seed.ts':
    'writes the seeded timetable as rule text; the package cannot import the domain',
  'packages/database/src/testing/factories.ts': 'a test factory stores a default rule text',
  'packages/api/src/routes/group-classes.ts': 'OpenAPI descriptions of the stored rule text',
  'packages/api/src/routes/sessions.ts': 'OpenAPI descriptions of the stored rule text',
};

/** A recurrence library, imported or required. */
const LIBRARY =
  /(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)['"](?:rrule|rrule-[\w-]+|@[\w-]+\/rrule[\w-]*|ical|ical\.js|ical-expander|node-ical|rschedule|@rschedule\/[\w-]+)['"]/;
/** A rule spelled out, or the RRule class of a library. */
const RULE_TEXT = /\bFREQ\s*=|\bBYDAY\b|\bRRule\b|\bRRULE\b/;

const SOURCE = /\.(?:ts|tsx|mjs|swift|kt)$/;
// Lower case: the Swift client is generated into `Generated`.
const SKIPPED_DIRS = new Set([
  'node_modules',
  'generated',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.vitest',
  '.gradle',
  '.build',
  'test',
  'tests',
  'e2e',
  'androidtest',
  'fivvitests',
]);
const isTest = (file: string) => /\.test\.(?:ts|tsx|mjs)$|Tests?\.(?:swift|kt)$/.test(file);

/** The violations in `sources` (path relative to the repository root to text): one line per file. */
function ruleViolations(sources: Readonly<Record<string, string>>): string[] {
  return Object.entries(sources).flatMap(([file, text]) => {
    if (file.startsWith('packages/domain/') || isTest(file)) return [];
    if (LIBRARY.test(text)) return [`${file}: imports a recurrence library`];
    if (RULE_TEXT.test(text) && !(file in ALLOWED)) return [`${file}: spells a recurrence rule`];
    return [];
  });
}

function walk(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name.toLowerCase()) ? [] : walk(relative);
    }
    return SOURCE.test(entry.name) ? [relative] : [];
  });
}

describe('the checker', () => {
  it('passes when nothing outside the domain reads a rule', () => {
    expect(
      ruleViolations({
        'apps/web/src/page.tsx': 'export const x = 1;',
        'packages/domain/src/scheduling/series-rule.ts': "const r = 'FREQ=WEEKLY;BYDAY=TU';",
      }),
    ).toEqual([]);
  });

  it('AC10: fails on a recurrence library, in any of the three languages', () => {
    expect(
      ruleViolations({
        'apps/web/src/a.ts': "import { RRule } from 'rrule';",
        'apps/web/src/b.tsx': "const { rrulestr } = require('rrule');",
        'packages/api/src/c.ts': "import ical from 'node-ical';",
      }),
    ).toEqual([
      'apps/web/src/a.ts: imports a recurrence library',
      'apps/web/src/b.tsx: imports a recurrence library',
      'packages/api/src/c.ts: imports a recurrence library',
    ]);
  });

  it('AC10: fails on a rule spelled out in the web, the apps or the API', () => {
    expect(
      ruleViolations({
        'apps/web/src/expand.ts': "const weekly = rule.startsWith('FREQ=WEEKLY');",
        'apps/ios/Fivvi/Series.swift': 'let day = rule.components(separatedBy: ";BYDAY=")',
        'apps/android/app/src/main/kotlin/Series.kt': 'val rule = RRule(text)',
        'packages/api/src/routes/other.ts': "const x = 'BYDAY';",
      }),
    ).toHaveLength(4);
  });

  it('lets the listed files store and document the rule text, and tests spell it', () => {
    expect(
      ruleViolations({
        'packages/database/src/seed.ts': "const rrule = 'FREQ=WEEKLY;BYDAY=TU';",
        'packages/api/test/class-series.integration.test.ts': "'FREQ=WEEKLY;BYDAY=TU'",
        'apps/ios/FivviTests/SeriesTests.swift': 'let rule = "FREQ=WEEKLY;BYDAY=TU"',
      }),
    ).toEqual([]);
  });
});

describe('the repository', () => {
  const files = [...walk('apps'), ...walk('packages')];
  const sources = Object.fromEntries(
    files.map((file) => [file, readFileSync(path.join(ROOT, file), 'utf8')]),
  );

  it('has sources to check, so the check is never empty', () => {
    expect(files.some((f) => f.startsWith('packages/api/src/'))).toBe(true);
    expect(files.some((f) => f.startsWith('apps/web/'))).toBe(true);
  });

  it('AC10: no recurrence rule is read or expanded outside packages/domain', () => {
    expect(ruleViolations(sources)).toEqual([]);
  });

  it('every file the check lets through exists, so the list does not rot', () => {
    for (const file of Object.keys(ALLOWED)) expect(files, file).toContain(file);
  });
});
