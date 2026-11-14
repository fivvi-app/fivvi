import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { newDatabaseName, onServer, serverUrl } from '@fivvi/testing/database/server';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
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
  run(
    args: string[],
    mode?: Mode,
    env?: Record<string, string>,
  ): Promise<{ code: number; output: string; calls: string[][] }>;
  /** What the fake `railway` recorded per call: when the process started and ended, and its CREATE DATABASE. */
  railwayTimes(): RailwayTime[];
  /** The `before` marker of the source as the fake `railway` saw it when the restore was asked for. */
  beforeMarker(): { point: string; markerPoint: string | null; writtenAt: string | null };
  drillTableExists(): Promise<boolean>;
  restoredExists(): Promise<boolean>;
}

// Where the cleanup of a drill is registered: the `onTestFinished` of the test's own context (under
// `describe.concurrent` it must be the one of that context), or the `afterAll` of the file for the drill that
// several tests share.
interface Cleanup {
  onTestFinished(handler: () => Promise<void> | void): void;
  /** The test's own context has one; its name labels the timings. */
  task?: { name: string };
}

async function setUpDrill({ onTestFinished, task }: Cleanup): Promise<Drill> {
  const label = (task?.name ?? 'shared drill').slice(0, 60);
  onTestFinished(() => printTimings(label)); // the first to be registered runs last
  const source = await timed(label, 'clone of the template', cloneTemplateDatabase);
  onTestFinished(() => timed(label, 'drop of the source', () => source.drop()));
  await timed(label, 'workspace in the source', async () => {
    const client = createDatabase({ url: source.url, maxConnections: 1 });
    await createWorkspace(client.db, { label: SECRET });
    await client.close();
  });

  const run = inject('fivviTestRun');
  if (!run) throw new Error('No test run.');
  const restoredName = newDatabaseName(run.runId);
  onTestFinished(() =>
    timed(label, 'drop of the restored copy', () =>
      onServer(`DROP DATABASE IF EXISTS "${restoredName}" WITH (FORCE)`).then(() => {}),
    ),
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
    async run(args, mode = 'ok', extraEnv = {}) {
      // Asynchronous, so the tests of this file run side by side.
      const startedAt = Date.now();
      const what = `drill ${args.join(' ').slice(0, 40)} (${mode})`;
      // Known from here on, so a test that runs out of time still reports how far its drill got (printTimings).
      unfinished.set(label, { what, startedAt, log });
      const child = spawn(SCRIPT, args, {
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          RESTORE_DRILL_SOURCE_URL: source.url,
          // The script waits this long three times around the point, on top of a fixed two seconds. Only the test of
          // the settle time needs a real wait; the others take the shortest.
          RESTORE_DRILL_SETTLE: '0',
          RESTORE_DRILL_WAIT: '3',
          RESTORE_DRILL_INTERVAL: '1',
          FAKE_RAILWAY_LOG: log,
          FAKE_RAILWAY_MODE: mode,
          FAKE_RAILWAY_SERVER_URL: serverUrl(),
          FAKE_RAILWAY_SOURCE_DB: source.name,
          FAKE_RAILWAY_RESTORED_DB: restoredName,
          ...extraEnv,
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
      reportDrill(label, what, startedAt, log, `exit ${code}`);
      unfinished.delete(label);
      return { code, output, calls };
    },
    railwayTimes: () => readRailwayTimes(log),
    beforeMarker: () => JSON.parse(readFileSync(`${log}.before`, 'utf8')),
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

// Timings for the CI log (#1309): one line per step, `[restore-drill timing] <test> | <step> | <ms>`. The lines of a
// test are printed together when it has finished, so they do not run into those of the tests beside it. Read them as
// the gaps between the calls of `railway`: the script's own steps (the database helper, the checks) sit between them.
const timingLines = new Map<string, string[]>();
const timing = (label: string, step: string, ms: number) => {
  const lines = timingLines.get(label) ?? [];
  lines.push(`[restore-drill timing] ${label} | ${step} | ${Math.round(ms)} ms`);
  timingLines.set(label, lines);
};

// The drills a test has started and not seen end: a test that times out never gets to report its drill.
const unfinished = new Map<string, { what: string; startedAt: number; log: string }>();

function reportDrill(label: string, what: string, startedAt: number, log: string, end: string) {
  timing(label, `${what}, ${end}`, Date.now() - startedAt);
  for (const call of readRailwayTimes(log)) {
    timing(
      label,
      `  railway ${call.command} at +${call.startedAt - startedAt} ms`,
      call.endedAt - call.startedAt,
    );
    if (call.createDatabaseMs !== undefined) {
      timing(label, `    its CREATE DATABASE`, call.createDatabaseMs);
    }
  }
}

const printTimings = (label: string) => {
  const running = unfinished.get(label);
  if (running) {
    reportDrill(
      label,
      running.what,
      running.startedAt,
      running.log,
      'NOT FINISHED when the test ended',
    );
    unfinished.delete(label);
  }
  console.info((timingLines.get(label) ?? []).join('\n'));
  timingLines.delete(label);
};

async function timed<T>(label: string, step: string, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    timing(label, step, performance.now() - started);
  }
}

interface RailwayTime {
  command: string;
  startedAt: number;
  endedAt: number;
  createDatabaseMs?: number;
}

// No file when the script refused before it called `railway`.
const readRailwayTimes = (log: string): RailwayTime[] =>
  existsSync(`${log}.times`)
    ? readFileSync(`${log}.times`, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RailwayTime)
    : [];

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

// One passing drill, with the settle time of 3 seconds, for the three tests that check what a passing drill does
// (what it calls, what it prints, the order of the markers and the point). The settle time is the longest wait of
// the file, so it is waited for once, and the script's startup (the database helper is started five times per run)
// is paid once instead of three times. The tests that need their own drill (a refusal, another mode, a failure) set
// one up themselves.
const SHARED_SETTLE_SECONDS = 3;
const sharedCleanups: Array<() => Promise<void> | void> = [];
let sharedDrill: Promise<{ drill: Drill; passed: Awaited<ReturnType<Drill['run']>> }> | undefined;

function passingDrill() {
  sharedDrill ??= (async () => {
    const drill = await setUpDrill({
      onTestFinished: (handler) => {
        sharedCleanups.push(handler);
      },
    });
    const passed = await drill.run(['--environment', 'development', '--who', 'the owner'], 'ok', {
      RESTORE_DRILL_SETTLE: String(SHARED_SETTLE_SECONDS),
    });
    return { drill, passed };
  })();
  return sharedDrill;
}

// Started before the first test, so the longest wait of the file runs next to the other drills, not after them.
beforeAll(() => {
  passingDrill().catch(() => {}); // a failure reaches the tests that wait for it
});

afterAll(async () => {
  await sharedDrill?.catch(() => {});
  for (const cleanup of sharedCleanups.reverse()) await cleanup();
});

describe.concurrent('E016 the restore drill script', () => {
  it('AC2: drill refuses other environments and future times, before it touches anything', async (context) => {
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

  // The tests of the shared passing drill come last: while they wait for it they hold a place among the tests
  // that run side by side, which the tests with a drill of their own should have first.
  it('AC2: drill restores, checks markers and counts, and cleans up', async () => {
    const { drill, passed } = await passingDrill();

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
    // The fake railway times its own calls, for the timings in the log (#1309).
    const times = drill.railwayTimes();
    expect(times.map((call) => call.command)).toEqual(verbs(passed.calls));
    for (const call of times) expect(call.endedAt).toBeGreaterThanOrEqual(call.startedAt);
    expect(times[0]?.createDatabaseMs).toEqual(expect.any(Number));
  }, 60_000);

  it('AC2: the point is taken a settle time after the before marker, and the marker is not for a later point', async () => {
    const { drill, passed } = await passingDrill();

    expect(passed.code).toBe(0);
    const { point, markerPoint, writtenAt } = drill.beforeMarker();
    expect(writtenAt).not.toBeNull();
    // The comment of the script and the document say: marker, wait, point, wait, marker. The wait is measured on
    // the database's clock (the marker's written_at) against the point the restore was asked for.
    expect(Date.parse(point) - Date.parse(writtenAt as string)).toBeGreaterThanOrEqual(
      SHARED_SETTLE_SECONDS * 1_000,
    );
    expect(Date.parse(markerPoint as string)).toBeLessThanOrEqual(Date.parse(point));
  }, 60_000);

  it('AC4: output holds counts only', async () => {
    const { drill, passed } = await passingDrill();

    expect(passed.code).toBe(0);
    expectCountsOnly(passed.output, drill);
    expect(passed.output).toContain('public.organizations | 1 | 1 | 0 | match');
    expect(passed.output).toContain('table | development | postgres-drill-');
  }, 60_000);
});
