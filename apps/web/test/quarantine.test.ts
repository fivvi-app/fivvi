import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// E002 #1361 (ADR-025, amendment of 12 November 2026): Playwright reads quarantine/playwright.txt. The required job
// (`E2E (Linux)`) leaves the listed tests out; the Quarantine job (FIVVI_QUARANTINE=only) runs exactly them. This lists the
// tests of the real config (`playwright test --list`, no browser and no server), with a list of its own
// (FIVVI_QUARANTINE_DIR).
const WEB = fileURLToPath(new URL('..', import.meta.url));

// Two tests of e2e/sign-in-mark.spec.ts (one per project, so four lines in all), as the list names them: the titles of
// the describe blocks and of the test, joined by ` › `, without the file and the project.
const LISTED = [
  'E020 sign-in mark › AC: at 767 px wide in light mode the sign-in shows the day dial and nothing else',
  'E020 sign-in mark › AC: at 768 px wide in dark mode the sign-in shows the wordmark and nothing else',
];

/** The tests `playwright test --list` prints: [project] › file:line:col › titles. */
function list(entries: string[], quarantine?: 'only'): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'quarantine-web-'));
  try {
    writeFileSync(
      join(dir, 'playwright.txt'),
      `${entries.join(' | #1400 | 2026-11-12 | 2026-11-19\n')}${entries.length ? ' | #1400 | 2026-11-12 | 2026-11-19\n' : ''}`,
    );
    const env: NodeJS.ProcessEnv = { ...process.env, FIVVI_QUARANTINE_DIR: dir };
    delete env.FIVVI_QUARANTINE;
    if (quarantine) env.FIVVI_QUARANTINE = quarantine;
    const result = spawnSync(
      join(WEB, 'node_modules/.bin/playwright'),
      ['test', '--list', '--reporter=list'],
      { cwd: WEB, env, encoding: 'utf8' },
    );
    return result.stdout
      .split('\n')
      .filter((line) => /^ {2}\[[^\]]+\] › /.test(line))
      .map((line) => line.trim());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('E002 #1361 Playwright and the quarantine list', { timeout: 120_000 }, () => {
  let all: string[];
  beforeAll(() => {
    all = list([]);
  });
  afterAll(() => {
    all = [];
  });

  const isListed = (line: string) => LISTED.some((title) => line.endsWith(` › ${title}`));

  it('finds the listed tests in every project, so the sample means something', () => {
    expect(all.filter(isListed)).toHaveLength(LISTED.length * 2);
  });

  it('leaves the listed tests out of the required run, in every project, and only them', () => {
    const required = list(LISTED);
    expect(required).toEqual(all.filter((line) => !isListed(line)));
  });

  it('runs exactly the listed tests in the Quarantine run', () => {
    expect(list(LISTED, 'only')).toEqual(all.filter(isListed));
  });
});
