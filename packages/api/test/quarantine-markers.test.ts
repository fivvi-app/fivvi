import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkQuarantine, MARKERS } from '../../../scripts/quarantine.mjs';

// E002 #1361 (ADR-025, amendment of 12 November 2026, step 4): tenant isolation, concurrency and permission tests are never
// quarantined, and scripts/quarantine.mjs finds them by a marker in the title (`@isolation`, `@concurrency`,
// `@permission`; a describe block's marker is part of the full name of every test in it). The API tests are where most of
// them live: this keeps the existing ones marked and a new isolation suite file from going unmarked.
const TEST = join(import.meta.dirname);

const read = (path: string) => readFileSync(join(TEST, path), 'utf8');
/** The titles of the top-level `describe` blocks of a test file. */
const topLevelTitles = (source: string) =>
  [...source.matchAll(/^describe\(\s*['"`]([^'"`]+)['"`]/gm)].map((match) => match[1] as string);

describe('E002 #1361 the markers of the tests that are never quarantined', () => {
  it('names the three markers the rule reads', () => {
    expect(MARKERS).toEqual(['@isolation', '@concurrency', '@permission']);
  });

  it('marks every describe block of the tenant isolation suite @isolation', () => {
    const files = readdirSync(join(TEST, 'isolation')).filter((name) => name.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const titles = topLevelTitles(read(join('isolation', file)));
      expect(titles.length, file).toBeGreaterThan(0);
      for (const title of titles) expect(title, `${file}: ${title}`).toMatch(/^@isolation /);
    }
  });

  it('marks the tenant context and role tests, and the tests of two requests at once', () => {
    expect(topLevelTitles(read('tenant-context.integration.test.ts'))).toEqual([
      expect.stringMatching(/^@isolation /),
    ]);
    expect(topLevelTitles(read('roles.integration.test.ts'))).toEqual([
      expect.stringMatching(/^@permission /),
    ]);
    expect(topLevelTitles(read('route-capabilities.test.ts'))).toEqual([
      expect.stringMatching(/^@permission /),
    ]);
    expect(read('clients.integration.test.ts')).toMatch(
      /it\('@concurrency AC3: two parallel requests with one email add one client/,
    );
  });

  it('makes the rule refuse an entry for a marked test, as Vitest names it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markers-'));
    try {
      writeFileSync(
        join(dir, 'vitest.txt'),
        [
          '@isolation E011 isolation suite > a route answers 404 | #1400 | 2026-11-12 | 2026-11-19',
          '@permission F004 roles on every workspace route > AC3: x | #1400 | 2026-11-12 | 2026-11-19',
          'F004 roles on every workspace route > @concurrency AC5: racing | #1400 | 2026-11-12 | 2026-11-19',
        ].join('\n'),
      );
      const problems = checkQuarantine({ dir, today: '2026-11-12' });
      expect(problems).toHaveLength(3);
      expect(problems[0]).toMatch(/marked @isolation/);
      expect(problems[1]).toMatch(/marked @permission/);
      expect(problems[2]).toMatch(/marked @concurrency/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
