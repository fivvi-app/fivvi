import { spawnSync } from 'node:child_process';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import {
  databaseUrl,
  dropDatabase,
  identifier,
  newDatabaseName,
  onServer,
} from '@fivvi/testing/database/server';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { createDatabase, type DatabaseClient } from '../src/index.ts';
import {
  checkMarkers,
  compareCounts,
  countsPass,
  countTables,
  DRILL_TABLE,
  removeDrill,
  writeMarker,
} from '../src/restore.ts';
import { runRestore } from '../src/restore-cli.ts';
import { createWorkspace } from '../src/testing/index.ts';

// E016 AC2 and AC4 (database side), spec #479: the drill markers and the per-table counts, against
// a local Postgres with synthetic data. A "restore" here is a copy of the source taken between two
// moments (`CREATE DATABASE … TEMPLATE`), which is what a restored dump is: the state at the point.

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

interface Pair {
  source: DatabaseClient;
  sourceUrl: string;
  /** Takes the copy: the state of the source now. Closes the source's connections first. */
  restore(): Promise<{ client: DatabaseClient; url: string }>;
}

async function openSource(): Promise<Pair> {
  const database: TestDatabase = await cloneTemplateDatabase();
  let source = createDatabase({ url: database.url, maxConnections: 2 });
  cleanups.push(() => database.drop());
  const pair: Pair = {
    get source() {
      return source;
    },
    sourceUrl: database.url,
    async restore() {
      await source.close();
      const run = inject('fivviTestRun');
      if (!run) throw new Error('No test run.');
      const name = newDatabaseName(run.runId);
      await onServer(
        `CREATE DATABASE ${identifier(name)} TEMPLATE ${identifier(database.name)} STRATEGY FILE_COPY`,
      );
      cleanups.push(() => dropDatabase(name));
      source = createDatabase({ url: database.url, maxConnections: 2 });
      const url = databaseUrl(name);
      const client = createDatabase({ url, maxConnections: 2 });
      cleanups.push(() => client.close());
      return { client, url };
    },
  };
  cleanups.push(() => pair.source.close());
  return pair;
}

async function now(db: DatabaseClient): Promise<Date> {
  const { rows } = await db.db.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
  return new Date(rows[0]?.now as Date);
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 25));

async function tableExists(db: DatabaseClient): Promise<boolean> {
  const { rows } = await db.db.execute<{ found: boolean }>(
    sql`select to_regclass(${`public.${DRILL_TABLE}`}) is not null as found`,
  );
  return rows[0]?.found === true;
}

describe('E016 the drill markers', () => {
  it('AC2: finds the marker before the point and not the one after, in a database restored between them', async () => {
    const pair = await openSource();
    const point = await now(pair.source);
    await writeMarker(pair.source.db, 'before', point);
    const restored = await pair.restore();
    await pause();
    await writeMarker(pair.source.db, 'after', point);

    expect(await checkMarkers(restored.client.db)).toEqual({
      before: true,
      after: false,
      ok: true,
    });
    expect(await checkMarkers(pair.source.db)).toEqual({ before: true, after: true, ok: false });
  });

  it('AC2: a database without the drill table holds neither marker', async () => {
    const pair = await openSource();

    expect(await checkMarkers(pair.source.db)).toEqual({ before: false, after: false, ok: false });
  });

  it('AC2: writing a marker again replaces it', async () => {
    const pair = await openSource();
    await writeMarker(pair.source.db, 'before', new Date('2026-11-10T09:00:00Z'));
    await writeMarker(pair.source.db, 'before', new Date('2026-11-10T10:00:00Z'));

    const { rows } = await pair.source.db.execute<{ n: string }>(
      sql`select count(*)::text as n from ${sql.identifier(DRILL_TABLE)}`,
    );
    expect(rows[0]?.n).toBe('1');
  });

  it('AC2: the cleanup removes the drill table and its markers, and a second one is harmless', async () => {
    const pair = await openSource();
    await writeMarker(pair.source.db, 'before', new Date());
    expect(await tableExists(pair.source)).toBe(true);

    expect(await removeDrill(pair.source.db)).toBe(true);
    expect(await tableExists(pair.source)).toBe(false);
    expect(await removeDrill(pair.source.db)).toBe(false);
  });

  it('AC2: the drill table is owned by the connection role and the app role cannot read it', async () => {
    const database = await cloneTemplateDatabase();
    cleanups.push(() => database.drop());
    const owner = createDatabase({ url: database.url, maxConnections: 1 });
    cleanups.push(() => owner.close());
    await writeMarker(owner.db, 'before', new Date());
    const app = createDatabase({ url: database.appUrl, maxConnections: 1 });
    cleanups.push(() => app.close());

    await expect(
      app.db.execute(sql`select kind from ${sql.identifier(DRILL_TABLE)}`),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });
});

describe('E016 the row counts', () => {
  it('AC4: an identical restore passes, with the drill table left out', async () => {
    const pair = await openSource();
    await createWorkspace(pair.source.db);
    await writeMarker(pair.source.db, 'before', new Date());
    const restored = await pair.restore();
    const point = await now(pair.source);

    const comparison = compareCounts(
      await countTables(pair.source.db, point),
      await countTables(restored.client.db),
    );

    expect(countsPass(comparison)).toBe(true);
    expect(comparison.every((entry) => entry.status === 'match')).toBe(true);
    const tables = comparison.map((entry) => entry.table);
    expect(tables).toContain('public.organizations');
    expect(tables).toContain('drizzle.__drizzle_migrations');
    expect(tables).not.toContain(`public.${DRILL_TABLE}`);
  });

  it('AC4: allows the rows created in the source after the point', async () => {
    const pair = await openSource();
    await createWorkspace(pair.source.db);
    const restored = await pair.restore();
    await pause();
    const point = await now(pair.source);
    await pause();
    await createWorkspace(pair.source.db);

    const comparison = compareCounts(
      await countTables(pair.source.db, point),
      await countTables(restored.client.db),
    );

    const organizations = comparison.find((entry) => entry.table === 'public.organizations');
    expect(organizations).toMatchObject({
      source: 2,
      restored: 1,
      changedAfter: 1,
      status: 'within-changes',
    });
    expect(countsPass(comparison)).toBe(true);
  });

  it('AC4: reports the tables that differ beyond the rows changed after the point', async () => {
    const pair = await openSource();
    await createWorkspace(pair.source.db);
    const restored = await pair.restore();
    const point = await now(pair.source);
    await createWorkspace(restored.client.db);
    await createWorkspace(restored.client.db);

    const comparison = compareCounts(
      await countTables(pair.source.db, point),
      await countTables(restored.client.db),
    );

    expect(countsPass(comparison)).toBe(false);
    expect(
      comparison.filter((entry) => entry.status === 'differs').map((entry) => entry.table),
    ).toEqual(['public.locations', 'public.organizations']);
  });

  it('AC4: refuses a connection that row-level security would hide rows from', async () => {
    const database = await cloneTemplateDatabase();
    cleanups.push(() => database.drop());
    const app = createDatabase({ url: database.appUrl, maxConnections: 1 });
    cleanups.push(() => app.close());

    await expect(countTables(app.db)).rejects.toThrow('cannot count every row');
  });
});

describe('E016 the command line', () => {
  const SECRET = 'zzqsecret-gym-name';

  async function run(
    pair: Pair,
    restoredUrl: string | undefined,
    argv: string[],
  ): Promise<{ code: number; output: string }> {
    process.env.RESTORE_TEST_SOURCE = pair.sourceUrl;
    if (restoredUrl) process.env.RESTORE_TEST_RESTORED = restoredUrl;
    cleanups.push(async () => {
      delete process.env.RESTORE_TEST_SOURCE;
      delete process.env.RESTORE_TEST_RESTORED;
    });
    const lines: string[] = [];
    const { openPrivilegedDatabase } = await import('../src/privileged.ts');
    const code = await runRestore(argv, {
      open: (variable) =>
        openPrivilegedDatabase('restore', { variable, log: (m) => lines.push(m) }),
      out: (line) => lines.push(line),
    });
    return { code, output: lines.join('\n') };
  }

  it('AC4: writes, checks and removes the markers, naming the database by variable', async () => {
    const pair = await openSource();
    const at = ['--at', '2026-11-10T09:00:00Z'];
    const url = ['--database-url-env', 'RESTORE_TEST_SOURCE'];

    const before = await run(pair, undefined, [
      'markers',
      'write',
      '--kind',
      'before',
      ...at,
      ...url,
    ]);
    const restored = await pair.restore();
    const after = await run(pair, undefined, [
      'markers',
      'write',
      '--kind',
      'after',
      ...at,
      ...url,
    ]);
    process.env.RESTORE_TEST_RESTORED = restored.url;
    const good = await run(pair, restored.url, [
      'markers',
      'check',
      '--database-url-env',
      'RESTORE_TEST_RESTORED',
    ]);
    const bad = await run(pair, restored.url, ['markers', 'check', ...url]);
    const removed = await run(pair, restored.url, ['markers', 'remove', ...url]);

    expect([before.code, after.code, good.code, bad.code, removed.code]).toEqual([0, 0, 0, 1, 0]);
    expect(good.output).toContain('Markers: passed.');
    expect(bad.output).toContain('Marker after the point: found.');
    expect(await tableExists(pair.source)).toBe(false);
  });

  it('AC4: exits non-zero and names the tables when the counts differ', async () => {
    const pair = await openSource();
    await createWorkspace(pair.source.db);
    const restored = await pair.restore();
    await createWorkspace(restored.client.db, { label: SECRET });

    const result = await run(pair, restored.url, [
      'counts',
      '--source-url-env',
      'RESTORE_TEST_SOURCE',
      '--restored-url-env',
      'RESTORE_TEST_RESTORED',
      '--at',
      new Date().toISOString(),
      '--source-name',
      'production',
      '--restored-name',
      'postgres-drill-2026-11-10',
    ]);

    expect(result.code).toBe(1);
    expect(result.output).toContain('Counts: failed (public.locations, public.organizations).');
    expect(result.output).toContain('public.organizations | 1 | 2 | 0 | differs');
    expect(result.output).toContain('production');
  });

  it('AC4: prints no row value and no connection string, for a pass or a failure', async () => {
    const pair = await openSource();
    const workspace = await createWorkspace(pair.source.db, { label: SECRET });
    const restored = await pair.restore();
    const args = [
      'counts',
      '--source-url-env',
      'RESTORE_TEST_SOURCE',
      '--restored-url-env',
      'RESTORE_TEST_RESTORED',
      '--at',
      new Date().toISOString(),
    ];

    const passed = await run(pair, restored.url, args);
    await createWorkspace(restored.client.db, { label: SECRET });
    const failed = await run(pair, restored.url, args);

    expect(passed.code).toBe(0);
    expect(failed.code).toBe(1);
    for (const { output } of [passed, failed]) {
      for (const value of [SECRET, workspace.marker, workspace.id, 'Europe/Amsterdam', 'nl-NL']) {
        expect(output).not.toContain(value);
      }
      expect(output).not.toMatch(/postgres(ql)?:\/\//);
      expect(output).not.toContain(new URL(pair.sourceUrl).password);
    }
  });

  it('AC5: refuses a database URL given as an argument, without echoing it', async () => {
    const pair = await openSource();

    const result = await run(pair, undefined, [
      'markers',
      'check',
      '--database-url',
      pair.sourceUrl,
    ]);

    expect(result.code).toBe(2);
    expect(result.output).not.toContain(pair.sourceUrl);
    expect(result.output).not.toContain(new URL(pair.sourceUrl).password);
    expect(await tableExists(pair.source)).toBe(false);
  });

  it('AC5: refuses a variable that is not set, naming the variable only', async () => {
    const pair = await openSource();

    const result = await run(pair, undefined, [
      'markers',
      'check',
      '--database-url-env',
      'RESTORE_TEST_NOT_SET',
    ]);

    expect(result.code).toBe(2);
    expect(result.output).not.toMatch(/postgres(ql)?:\/\//);
  });

  it('AC5: runs as a script, with the URL in an environment variable', async () => {
    const pair = await openSource();
    const env = { ...process.env, RESTORE_TEST_SOURCE: pair.sourceUrl };
    const script = (args: string[]) =>
      spawnSync(process.execPath, ['src/scripts/restore.ts', ...args], {
        cwd: new URL('..', import.meta.url),
        env,
        encoding: 'utf8',
      });

    const written = script([
      'markers',
      'write',
      '--kind',
      'before',
      '--at',
      '2026-11-10T09:00:00Z',
      '--database-url-env',
      'RESTORE_TEST_SOURCE',
    ]);
    const checked = script(['markers', 'check', '--database-url-env', 'RESTORE_TEST_SOURCE']);
    const refused = script(['markers', 'check', '--database-url', pair.sourceUrl]);

    expect(written.status).toBe(0);
    expect(written.stdout).toContain('Privileged database access: restore');
    expect(checked.status).toBe(0);
    expect(refused.status).toBe(2);
    expect(`${refused.stdout}${refused.stderr}`).not.toContain(pair.sourceUrl);
  });
});
