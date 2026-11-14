import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { integrationConfig, unitConfig } from './vitest.ts';

describe('E010 Vitest presets', () => {
  it('runs tests in UTC, whatever the machine time zone is', () => {
    expect(process.env.TZ).toBe('UTC');
    expect(new Date('2026-07-15T12:00:00').toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });

  it('keeps integration and e2e tests out of the unit suite', () => {
    const { test } = unitConfig();

    expect(test?.include).toEqual(['**/*.test.{ts,tsx}']);
    expect(test?.exclude).toEqual(
      expect.arrayContaining(['**/*.integration.test.{ts,tsx}', 'e2e/**', '**/node_modules/**']),
    );
  });

  it('runs only integration tests in the integration suite, without retries', () => {
    const { test } = integrationConfig();

    expect(test?.include).toEqual(['**/*.integration.test.{ts,tsx}']);
    expect(test?.retry).toBe(0);
    expect(test?.env).toEqual({ TZ: 'UTC' });
  });

  it('merges overrides into the preset', () => {
    const { test } = integrationConfig({
      test: { globalSetup: ['./setup.ts'], exclude: ['x/**'] },
    });

    expect(test?.globalSetup).toEqual(['./setup.ts']);
    expect(test?.exclude).toEqual(expect.arrayContaining(['e2e/**', 'x/**']));
    expect(test?.testTimeout).toBe(30_000);
  });
});

// E002 #1361 (ADR-025, amendment of 12 November 2026): the presets read the Vitest quarantine list. The required jobs leave
// the listed tests out; the Quarantine job (FIVVI_QUARANTINE=only) runs exactly them. This runs the real Vitest on a small
// project that uses the real preset, with a list of its own (FIVVI_QUARANTINE_DIR).
describe('E002 #1361 the presets and the quarantine list', { timeout: 60_000 }, () => {
  const preset = fileURLToPath(new URL('./vitest.ts', import.meta.url));
  const vitest = fileURLToPath(new URL('../node_modules/.bin/vitest', import.meta.url));
  // Under node_modules so that the project is no part of any package's own run and is never committed.
  const parent = fileURLToPath(new URL('../node_modules/.cache', import.meta.url));
  let dir: string;

  beforeAll(() => {
    mkdirSync(parent, { recursive: true });
    dir = mkdtempSync(join(parent, 'quarantine-'));
    writeFileSync(
      join(dir, 'vitest.config.ts'),
      `import { unitConfig } from ${JSON.stringify(preset)};\nexport default unitConfig();\n`,
    );
    writeFileSync(
      join(dir, 'sample.test.ts'),
      [
        "import { describe, expect, it } from 'vitest';",
        "describe('suite', () => {",
        "  it('stays in the required run', () => expect(1).toBe(1));",
        "  it('is quarantined (flaky)', () => expect(1).toBe(2));",
        "  it('is quarantined (flaky) twice', () => expect(1).toBe(1));",
        '});',
        "it('is quarantined at the top', () => expect(1).toBe(2));",
        '',
      ].join('\n'),
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** Runs the sample project with a list of entries; returns the name and status of every test. */
  function run(entries: string[], quarantine?: 'only') {
    const lists = mkdtempSync(join(dir, 'lists-'));
    writeFileSync(join(lists, 'vitest.txt'), `${entries.join('\n')}\n`);
    const env: NodeJS.ProcessEnv = { ...process.env, FIVVI_QUARANTINE_DIR: lists };
    delete env.FIVVI_QUARANTINE;
    if (quarantine) env.FIVVI_QUARANTINE = quarantine;
    // A run inside a run must not take the outer one's settings.
    for (const name of Object.keys(env)) if (name.startsWith('VITEST')) delete env[name];
    const outputFile = join(lists, 'report.json');
    const result = spawnSync(
      vitest,
      ['run', '--root', dir, '--reporter=json', `--outputFile=${outputFile}`],
      { env, encoding: 'utf8' },
    );
    const report = JSON.parse(readFileSync(outputFile, 'utf8'));
    const tests: Record<string, string> = Object.fromEntries(
      report.testResults.flatMap(
        (file: { assertionResults: { fullName: string; status: string }[] }) =>
          file.assertionResults.map((test) => [test.fullName, test.status]),
      ),
    );
    return { tests, status: result.status };
  }

  const LISTED = [
    'suite > is quarantined (flaky) | #1400 | 2026-11-12 | 2026-11-19',
    'is quarantined at the top | #1401 | 2026-11-12 | 2026-11-19',
  ];

  it('runs every test when the list is empty', () => {
    const { tests, status } = run([]);
    expect(Object.values(tests).filter((state) => state === 'skipped')).toEqual([]);
    expect(status).toBe(1); // the two tests of the sample that fail: nothing is left out
  });

  it('leaves the listed tests out of the required run, and only them, so it passes', () => {
    const { tests, status } = run(LISTED);
    expect(tests).toEqual({
      'suite stays in the required run': 'passed',
      'suite is quarantined (flaky)': 'skipped',
      'suite is quarantined (flaky) twice': 'passed',
      'is quarantined at the top': 'skipped',
    });
    expect(status).toBe(0);
  });

  it('runs exactly the listed tests in the Quarantine run, and fails when one of them fails', () => {
    const { tests, status } = run(LISTED, 'only');
    expect(tests).toEqual({
      'suite stays in the required run': 'skipped',
      'suite is quarantined (flaky)': 'failed',
      'suite is quarantined (flaky) twice': 'skipped',
      'is quarantined at the top': 'failed',
    });
    expect(status).toBe(1);
  });

  it('passes the Quarantine run when the list is empty: it runs no test', () => {
    const { tests, status } = run([], 'only');
    expect(Object.values(tests).filter((state) => state !== 'skipped')).toEqual([]);
    expect(status).toBe(0);
  });
});
