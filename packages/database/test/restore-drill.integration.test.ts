import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { newDatabaseName, onServer, serverUrl } from '@fivvi/testing/database/server';
import pg from 'pg';
import { describe, expect, inject, it, type TestContext } from 'vitest';
import { createDatabase } from '../src/index.ts';
import { DRILL_TABLE } from '../src/restore.ts';
import { createWorkspace } from '../src/testing/index.ts';

// E016 AC2 and AC4 (spec #479, ticket #1043): `scripts/restore-drill.sh` against a fake `railway` CLI on PATH
// (test/fixtures/fake-railway.mjs: it records its calls and simulates a restore, a healthy service and a failure)
// and a local Postgres with synthetic data. The "restored service" is a copy of the source database taken at the
// restore, without what was written after the chosen point, which is what a point-in-time restore gives.

const SCRIPT = join(import.meta.dirname, '../../../scripts/restore-drill.sh');
const FAKE = join(import.meta.dirname, 'fixtures/fake-railway.mjs');
const SECRET = 'zzqsecret-gym-name';

type Mode =
  | 'ok'
  | 'restore-fails'
  | 'never-healthy'
  | 'wrong-point'
  | 'extra-table'
  | 'delete-fails';

interface Drill {
  source: TestDatabase;
  restoredName: string;
  run(args: string[], mode?: Mode): Promise<{ code: number; output: string; calls: string[][] }>;
  drillTableExists(): Promise<boolean>;
  restoredExists(): Promise<boolean>;
}

// Under `describe.concurrent` the cleanup hook must be the one of the test's own context.
async function setUpDrill({ onTestFinished }: Pick<TestContext, 'onTestFinished'>): Promise<Drill> {
  const source = await cloneTemplateDatabase();
  onTestFinished(() => source.drop());
  const client = createDatabase({ url: source.url, maxConnections: 1 });
  await createWorkspace(client.db, { label: SECRET });
  await client.close();

  const run = inject('fivviTestRun');
  if (!run) throw new Error('No test run.');
  const restoredName = newDatabaseName(run.runId);
  onTestFinished(() =>
    onServer(`DROP DATABASE IF EXISTS "${restoredName}" WITH (FORCE)`).then(() => {}),
  );

  const dir = mkdtempSync(join(tmpdir(), 'restore-drill-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, 'railway-calls.log');
  writeFileSync(log, '');
  writeFileSync(join(dir, 'railway'), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`);
  chmodSync(join(dir, 'railway'), 0o755);

  const exists = async (query: string) =>
    ((await onServer<{ found: boolean }>(query))[0] as { found: boolean }).found;

  return {
    source,
    restoredName,
    async run(args, mode = 'ok') {
      // Asynchronous, so the tests of this file run side by side.
      const child = spawn(SCRIPT, args, {
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          RESTORE_DRILL_SOURCE_URL: source.url,
          RESTORE_DRILL_SETTLE: '1',
          RESTORE_DRILL_WAIT: '3',
          RESTORE_DRILL_INTERVAL: '1',
          FAKE_RAILWAY_LOG: log,
          FAKE_RAILWAY_MODE: mode,
          FAKE_RAILWAY_SERVER_URL: serverUrl(),
          FAKE_RAILWAY_SOURCE_DB: source.name,
          FAKE_RAILWAY_RESTORED_DB: restoredName,
        },
      });
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      const code = await new Promise<number>((resolve) =>
        child.on('close', (c) => resolve(c ?? -1)),
      );
      const calls = readFileSync(log, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]);
      return { code, output, calls };
    },
    async drillTableExists() {
      const client = new pg.Client({ connectionString: source.url });
      await client.connect();
      try {
        const { rows } = await client.query<{ found: boolean }>(
          'select to_regclass($1) is not null as found',
          [`public.${DRILL_TABLE}`],
        );
        return rows[0]?.found === true;
      } finally {
        await client.end();
      }
    },
    restoredExists: () =>
      exists(`select exists(select 1 from pg_database where datname = '${restoredName}') as found`),
  };
}

const verbs = (calls: string[][]) => calls.map((call) => call.slice(0, 3).join(' '));

// The output holds environment, times, durations, service and table names and counts: no value of a row, no secret
// the fake railway printed or returned, no connection URL.
function expectCountsOnly(output: string, drill: Drill) {
  for (const value of [SECRET, 'zzq-fake-token', 'Europe/Amsterdam', 'nl-NL']) {
    expect(output).not.toContain(value);
  }
  expect(output).not.toMatch(/postgres(ql)?:\/\//);
  expect(output).not.toContain(new URL(drill.source.url).password);
}

describe.concurrent('E016 the restore drill script', () => {
  it('AC2: drill restores, checks markers and counts, and cleans up; refuses other environments and future times', async (context) => {
    const drill = await setUpDrill(context);

    const refusedEnvironment = await drill.run(['--environment', 'staging']);
    const refusedPreview = await drill.run(['--environment', 'fivvi-pr-12']);
    const refusedFuture = await drill.run([
      '--environment',
      'production',
      '--at',
      new Date(Date.now() + 3_600_000).toISOString(),
    ]);
    const refusedNoOffset = await drill.run([
      '--environment',
      'production',
      '--at',
      '2026-11-10T09:00:00',
    ]);
    for (const refused of [refusedEnvironment, refusedPreview, refusedFuture, refusedNoOffset]) {
      expect(refused.code).not.toBe(0);
      expect(refused.calls).toEqual([]);
    }
    expect(refusedEnvironment.output).toContain('--environment must be development or production');
    expect(refusedFuture.output).toContain('--at is in the future');
    expect(await drill.drillTableExists()).toBe(false);

    const passed = await drill.run(['--environment', 'development', '--who', 'the owner']);

    expect(passed.output).toContain('Result: passed');
    expect(passed.code).toBe(0);
    expect(verbs(passed.calls)).toEqual([
      'postgres pitr restore',
      'variable list --service',
      'service delete --service',
    ]);
    const [restore] = passed.calls as [string[]];
    expect(restore).toEqual(
      expect.arrayContaining(['--service', 'postgres', '--environment', 'development', '--yes']),
    );
    const name = restore[restore.indexOf('--new-service-name') + 1] as string;
    expect(name).toMatch(/^postgres-drill-\d{8}-\d{4}$/);
    expect(passed.calls[2]).toEqual(expect.arrayContaining(['--service', name, '--yes']));
    expect(passed.output).toContain('Marker before the point: found.');
    expect(passed.output).toContain('Marker after the point: absent.');
    expect(passed.output).toContain('Markers: passed.');
    expect(passed.output).toMatch(/Counts: passed \(\d+ tables\)\./);
    expect(passed.output).toContain(`Cleanup: scratch service ${name} removed`);
    expect(passed.output).toContain('Cleanup: drill table and markers removed from development');
    expect(passed.output).toMatch(
      /\| \d{4}-\d{2}-\d{2} \| development \| \d{4}-\d{2}-\d{2}T[\d:]+Z \| \d+m \d+s \| (\d+) of \1 tables \| the owner \| passed \|/,
    );
    expect(await drill.drillTableExists()).toBe(false);
    expect(await drill.restoredExists()).toBe(false);
  }, 60_000);

  it('AC2: restores to a chosen past point and finds neither marker there', async (context) => {
    const drill = await setUpDrill(context);

    const passed = await drill.run([
      '--environment',
      'production',
      '--at',
      new Date(Date.now() - 60_000).toISOString(),
    ]);

    expect(passed.output).toContain('Result: passed');
    expect(passed.code).toBe(0);
    expect(passed.output).toContain('Marker before the point: absent (expected).');
    expect(passed.output).toContain('Marker after the point: absent (expected).');
    expect(await drill.drillTableExists()).toBe(false);
    expect(await drill.restoredExists()).toBe(false);
  }, 60_000);

  it('AC4: output holds counts only', async (context) => {
    const drill = await setUpDrill(context);

    const passed = await drill.run(['--environment', 'development']);

    expect(passed.code).toBe(0);
    expectCountsOnly(passed.output, drill);
    expect(passed.output).toContain('public.organizations | 1 | 1 | 0 | match');
    expect(passed.output).toContain('table | development | postgres-drill-');
  }, 60_000);

  it('AC4: cleanup also after a failed check (the restore is not at the point)', async (context) => {
    const drill = await setUpDrill(context);

    const wrongPoint = await drill.run(['--environment', 'development'], 'wrong-point');

    expect(wrongPoint.code).not.toBe(0);
    expectCountsOnly(wrongPoint.output, drill);
    expect(wrongPoint.output).toContain('Marker after the point: found.');
    expect(wrongPoint.output).toContain('FAILED: the markers');
    expect(wrongPoint.output).toContain('Result: failed (the markers)');
    expect(verbs(wrongPoint.calls)).toContain('service delete --service');
    expect(wrongPoint.output).toContain(
      'Cleanup: drill table and markers removed from development',
    );
    expect(wrongPoint.output).toMatch(
      /Cleanup: scratch service postgres-drill-\d{8}-\d{4} removed/,
    );
    expect(await drill.drillTableExists()).toBe(false);
    expect(await drill.restoredExists()).toBe(false);
  }, 60_000);

  it('AC4: cleanup also after a failed check (the counts differ)', async (context) => {
    const drill = await setUpDrill(context);

    const countsDiffer = await drill.run(['--environment', 'development'], 'extra-table');

    expect(countsDiffer.code).not.toBe(0);
    expectCountsOnly(countsDiffer.output, drill);
    expect(countsDiffer.output).toContain('public.restore_extra | - | 0 | 0 | missing-in-source');
    expect(countsDiffer.output).toContain('Result: failed (the row counts)');
    expect(verbs(countsDiffer.calls)).toContain('service delete --service');
    expect(countsDiffer.output).toMatch(
      /Cleanup: scratch service postgres-drill-\d{8}-\d{4} removed/,
    );
    expect(await drill.drillTableExists()).toBe(false);
    expect(await drill.restoredExists()).toBe(false);
  }, 60_000);

  it('AC4: cleanup also after a failed restore, and the output of railway is not shown', async (context) => {
    const drill = await setUpDrill(context);

    const failed = await drill.run(['--environment', 'development'], 'restore-fails');

    expect(failed.code).not.toBe(0);
    expect(failed.output).toContain('FAILED: the restore');
    expect(failed.output).not.toContain('zzq-secret-detail');
    expect(failed.output).not.toContain('zzq-password');
    expect(verbs(failed.calls)).toEqual(['postgres pitr restore', 'service delete --service']);
    expect(failed.output).toContain('Cleanup: drill table and markers removed from development');
    expect(await drill.drillTableExists()).toBe(false);
    expect(await drill.restoredExists()).toBe(false);
  }, 60_000);

  it('AC4: cleanup also when the restored service never answers', async (context) => {
    const drill = await setUpDrill(context);

    const unhealthy = await drill.run(['--environment', 'development'], 'never-healthy');

    expect(unhealthy.code).not.toBe(0);
    expect(unhealthy.output).toContain('FAILED: the scratch service did not answer in time');
    expect(verbs(unhealthy.calls)).toContain('service delete --service');
    expect(await drill.drillTableExists()).toBe(false);
  }, 60_000);

  it('AC4: a cleanup that fails makes the run fail, and says what to remove by hand', async (context) => {
    const drill = await setUpDrill(context);

    const stuck = await drill.run(['--environment', 'development'], 'delete-fails');

    expect(stuck.code).not.toBe(0);
    expect(stuck.output).toContain('Cleanup: COULD NOT remove scratch service postgres-drill-');
    expect(stuck.output).toMatch(/Result: failed/);
    expect(await drill.drillTableExists()).toBe(false);
  }, 60_000);

  it('AC2: keeping the scratch service is an explicit choice and the script prints how to remove it', async (context) => {
    const drill = await setUpDrill(context);

    const kept = await drill.run(['--environment', 'development', '--keep-scratch']);

    expect(kept.code).toBe(0);
    expect(verbs(kept.calls)).toEqual(['postgres pitr restore', 'variable list --service']);
    expect(kept.output).toMatch(
      /Cleanup: scratch service postgres-drill-\d{8}-\d{4} KEPT; remove it with: railway service delete --service postgres-drill-\d{8}-\d{4} --environment development --project \S+ --yes/,
    );
    expect(await drill.restoredExists()).toBe(true);
    expect(await drill.drillTableExists()).toBe(false);
  }, 60_000);
});
