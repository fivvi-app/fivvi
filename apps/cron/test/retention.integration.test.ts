import {
  accessLog,
  appendDeletionLog,
  authRateLimits,
  authSessions,
  authVerifications,
  createCronDatabase,
  createDatabase,
  type Database,
  type DatabaseClient,
  deletionLog,
  jobRuns,
  trainerInvitations,
} from '@fivvi/database';
import {
  addAccessLogEntry,
  addTeamRole,
  addTrainerInvitation,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import { manualClock } from '@fivvi/testing/clock';
import { cloneTemplateDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRegistry } from '../src/registry.ts';
import { runCron } from '../src/runner.ts';

// E014 AC16 and AC17 (ticket #1181): the retention tasks of the platform data, through E012's
// runner with a fake clock. Synthetic data only: John's Gym, its Owner John and the people named
// below. Rows sit on both sides of each boundary: exactly at the cutoff (past it, deleted) and one
// millisecond after (kept).

type TestDatabase = Awaited<ReturnType<typeof cloneTemplateDatabase>>;

let database: TestDatabase;
let admin: DatabaseClient;
let cronClient: DatabaseClient;
let db: Database;

beforeEach(async () => {
  database = await cloneTemplateDatabase();
  admin = createDatabase({ url: database.url, maxConnections: 2 });
  cronClient = createCronDatabase({ CRON_DATABASE_URL: database.cronUrl }, { maxConnections: 4 });
  db = cronClient.db;
});

afterEach(async () => {
  await cronClient.close();
  await admin.close();
  await database.drop();
});

// The day after Amsterdam went back to winter time (25 October 2026), 04:00 UTC: every period of
// hours or days below crosses the change of the clocks, and counts 24-hour days all the same.
const NOW = new Date('2026-10-26T04:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const RETENTION_TASKS = [
  'retention.sign-in-tokens',
  'retention.invitations',
  'retention.rate-limits',
  'retention.access-log',
  'retention.deletion-log',
  'retention.sessions',
];

function retentionCron(clock = manualClock(NOW)) {
  const tasks = createRegistry({}).filter(({ name }) => name.startsWith('retention.'));
  const logs: string[] = [];
  const errorReporter = { captureError: vi.fn() };
  return {
    clock,
    tasks,
    errorReporter,
    run: () => runCron({ db, tasks, clock, log: (message) => logs.push(message), errorReporter }),
  };
}

async function messages() {
  const rows = await db.select().from(jobRuns);
  return Object.fromEntries(rows.map((row) => [row.taskName, row.message]));
}

async function verification(identifier: string, expiresAt: Date) {
  await admin.db.insert(authVerifications).values({
    identifier: `sign-in:${identifier}`,
    value: 'hash-a',
    codeHash: 'hash-b',
    expiresAt,
  });
}

const remaining = async (table: typeof authVerifications) =>
  (await admin.db.select({ identifier: table.identifier }).from(table))
    .map((row) => row.identifier.replace('sign-in:', ''))
    .sort();

describe('E014 AC16: the retention tasks are daily, idempotent and record counts only', () => {
  it('AC16: registers one daily task per rule, with the names of the spec', () => {
    const tasks = createRegistry({}).filter(({ name }) => name.startsWith('retention.'));

    expect(tasks.map(({ name }) => name).sort()).toEqual([...RETENTION_TASKS].sort());
    expect(tasks.every(({ kind }) => kind === 'daily')).toBe(true);
  });

  it('AC16: a second run the same day changes nothing, and job_runs holds counts, no content', async () => {
    const { run, clock } = retentionCron();
    await verification('anna@example.com', ago(25 * HOUR));
    await verification('mark@example.com', ago(HOUR));
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const john = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: (await createAccount(admin.db, { label: 'john', name: 'John' })).id,
      role: 'owner',
    });
    await addTrainerInvitation(admin.db, {
      workspaceId: gym.id,
      inviterTeamMemberId: john.id,
      name: 'Sarah',
      email: 'sarah@example.com',
      expiresAt: ago(31 * DAY),
    });

    const first = await run();
    expect(first.failed).toBe(false);
    expect(first.results.map(({ name }) => name).sort()).toEqual([...RETENTION_TASKS].sort());
    const afterFirst = {
      tokens: await remaining(authVerifications),
      invitations: await admin.db.select().from(trainerInvitations),
      log: (await admin.db.select().from(deletionLog)).length,
    };

    clock.advance({ hours: 2 });
    const second = await run();

    expect(second.results).toEqual([]);
    expect({
      tokens: await remaining(authVerifications),
      invitations: await admin.db.select().from(trainerInvitations),
      log: (await admin.db.select().from(deletionLog)).length,
    }).toEqual(afterFirst);
    expect(await db.select().from(jobRuns)).toHaveLength(RETENTION_TASKS.length);
    // Counts per rule, never a name, an address or an ID.
    const recorded = await messages();
    expect(recorded['retention.sign-in-tokens']).toBe('deleted=1');
    expect(recorded['retention.invitations']).toBe('deleted=1');
    expect(recorded['retention.rate-limits']).toBe('deleted=0');
    for (const message of Object.values(recorded)) expect(message).toMatch(/^[a-z-]+=\d+$/);
  });

  it('AC16: a task that runs again at once finds nothing more to delete', async () => {
    const { tasks, clock } = retentionCron();
    await verification('anna@example.com', ago(25 * HOUR));
    const task = tasks.find(({ name }) => name === 'retention.sign-in-tokens');
    if (!task) throw new Error('retention.sign-in-tokens is not registered');
    const ctx = {
      db,
      now: clock.now(),
      runId: crypto.randomUUID(),
      log: () => {},
      errorReporter: { captureError: vi.fn() },
    };

    expect(await task.run(ctx)).toEqual({ counts: { deleted: 1 } });
    expect(await task.run(ctx)).toEqual({ counts: { deleted: 0 } });
  });
});

describe('E014 AC17: each rule deletes exactly the rows past its boundary', () => {
  it('R2: sign-in codes and links 24 hours after they expired', async () => {
    await verification('expired-exactly-24h@example.com', ago(24 * HOUR));
    await verification('expired-long-ago@example.com', ago(30 * DAY));
    await verification('expired-23h59@example.com', ago(24 * HOUR - 1));
    await verification('expired-an-hour-ago@example.com', ago(HOUR));
    await verification('still-valid@example.com', new Date(NOW.getTime() + 15 * 60 * 1000));

    await retentionCron().run();

    expect(await remaining(authVerifications)).toEqual([
      'expired-23h59@example.com',
      'expired-an-hour-ago@example.com',
      'still-valid@example.com',
    ]);
  });

  it('R14: rate-limit rows older than 24 hours', async () => {
    const row = (key: string, writtenAt: Date) => ({
      key,
      count: 3,
      windowEndsAt: writtenAt,
      createdAt: writtenAt,
      updatedAt: writtenAt,
    });
    await admin.db
      .insert(authRateLimits)
      .values([
        row('sign-in:email:old', ago(24 * HOUR)),
        row('sign-in:email:older', ago(3 * DAY)),
        row('sign-in:email:fresh', ago(24 * HOUR - 1)),
        row('sign-in:ip:recent', ago(HOUR)),
      ]);

    await retentionCron().run();

    expect(
      (await admin.db.select({ key: authRateLimits.key }).from(authRateLimits))
        .map((r) => r.key)
        .sort(),
    ).toEqual(['sign-in:email:fresh', 'sign-in:ip:recent']);
  });

  it('R10: sign-in sessions that expired, 30 days after their last use; active ones stay', async () => {
    const anna = await createAccount(admin.db, { label: 'anna' });
    const session = (token: string, expiresAt: Date, lastUsedAt: Date) => ({
      userId: anna.id,
      token,
      expiresAt,
      createdAt: lastUsedAt,
      updatedAt: lastUsedAt,
    });
    await admin.db
      .insert(authSessions)
      .values([
        session('expired-unused-30d', ago(HOUR), ago(30 * DAY)),
        session('expired-unused-60d', ago(10 * DAY), ago(60 * DAY)),
        session('expired-used-29d', ago(HOUR), ago(30 * DAY - 1)),
        session('active-used-just-now', new Date(NOW.getTime() + 20 * DAY), ago(HOUR)),
        session('active-unused-45d', new Date(NOW.getTime() + 1000), ago(45 * DAY)),
      ]);

    await retentionCron().run();

    expect(
      (await admin.db.select({ token: authSessions.token }).from(authSessions))
        .map((row) => row.token)
        .sort(),
    ).toEqual(['active-unused-45d', 'active-used-just-now', 'expired-used-29d']);
  });

  it('R3: trainer invitations 30 days after they expired, were withdrawn, declined or accepted', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const john = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: (await createAccount(admin.db, { label: 'john', name: 'John' })).id,
      role: 'owner',
    });
    const closedAt = (status: 'accepted' | 'declined' | 'withdrawn', at: Date) => ({
      status,
      updatedAt: at,
    });
    const invite = async (email: string, expiresAt: Date, closed?: ReturnType<typeof closedAt>) => {
      const { id } = await addTrainerInvitation(admin.db, {
        workspaceId: gym.id,
        inviterTeamMemberId: john.id,
        email,
        expiresAt,
      });
      if (closed) {
        await admin.db.update(trainerInvitations).set(closed).where(eq(trainerInvitations.id, id));
      }
      return id;
    };
    const soon = new Date(NOW.getTime() + 5 * DAY);
    const ids = {
      expiredAtBoundary: await invite('expired-boundary@example.com', ago(30 * DAY)),
      expiredJustInside: await invite('expired-inside@example.com', ago(30 * DAY - 1)),
      pendingStillValid: await invite('pending@example.com', soon),
      acceptedAtBoundary: await invite(
        'accepted-boundary@example.com',
        soon,
        closedAt('accepted', ago(30 * DAY)),
      ),
      acceptedJustInside: await invite(
        'accepted-inside@example.com',
        soon,
        closedAt('accepted', ago(30 * DAY - 1)),
      ),
      withdrawnAtBoundary: await invite(
        'withdrawn-boundary@example.com',
        soon,
        closedAt('withdrawn', ago(30 * DAY)),
      ),
      withdrawnJustInside: await invite(
        'withdrawn-inside@example.com',
        soon,
        closedAt('withdrawn', ago(30 * DAY - 1)),
      ),
      declinedAtBoundary: await invite(
        'declined-boundary@example.com',
        soon,
        closedAt('declined', ago(30 * DAY)),
      ),
      withdrawnRecently: await invite(
        'withdrawn-recently@example.com',
        ago(31 * DAY),
        closedAt('withdrawn', ago(HOUR)),
      ),
    };

    await retentionCron().run();

    const left = (
      await admin.db.select({ id: trainerInvitations.id }).from(trainerInvitations)
    ).map((r) => r.id);
    expect(left.sort()).toEqual(
      [
        ids.expiredJustInside,
        ids.pendingStillValid,
        ids.acceptedJustInside,
        ids.withdrawnJustInside,
      ].sort(),
    );
    // Every deletion of a business record goes to the deletion log: the table, the ID, the workspace.
    const logged = await admin.db
      .select()
      .from(deletionLog)
      .where(eq(deletionLog.tableName, 'trainer_invitations'));
    expect(logged.map((entry) => entry.recordId).sort()).toEqual(
      [
        ids.expiredAtBoundary,
        ids.acceptedAtBoundary,
        ids.withdrawnAtBoundary,
        ids.declinedAtBoundary,
        ids.withdrawnRecently,
      ].sort(),
    );
    expect(
      logged.every(
        (entry) => entry.organizationId === gym.id && entry.deletedAt.getTime() === NOW.getTime(),
      ),
    ).toBe(true);
  });

  it('R12: access-log entries older than 12 months, in every workspace', async () => {
    const john = await createWorkspace(admin.db, { label: 'johns-gym' });
    const mike = await createWorkspace(admin.db, { label: 'fit-studio' });
    const twelveMonthsAgo = new Date('2025-10-26T04:00:00Z');
    const entry = (workspaceId: string, occurredAt: Date) =>
      addAccessLogEntry(admin.db, { workspaceId, occurredAt });
    const boundary = await entry(john.id, twelveMonthsAgo);
    const boundaryOther = await entry(mike.id, twelveMonthsAgo);
    const old = await entry(john.id, new Date('2024-01-05T10:00:00Z'));
    const inside = await entry(john.id, new Date(twelveMonthsAgo.getTime() + 1));
    const recent = await entry(mike.id, ago(DAY));

    await retentionCron().run();

    expect(
      (await admin.db.select({ id: accessLog.id }).from(accessLog)).map((r) => r.id).sort(),
    ).toEqual([inside.id, recent.id].sort());
    const logged = await admin.db
      .select()
      .from(deletionLog)
      .where(eq(deletionLog.tableName, 'access_log'));
    expect(logged.map((e) => [e.recordId, e.organizationId]).sort()).toEqual(
      [
        [boundary.id, john.id],
        [boundaryOther.id, mike.id],
        [old.id, john.id],
      ].sort(),
    );
  });

  it('§3.5: deletion-log entries older than 30 days, and the entries the other tasks wrote today stay', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const record = (n: number, deletedAt: Date) => ({
      table: 'clients',
      recordId: `00000000-0000-4000-8000-00000000000${n}`,
      workspaceId: gym.id,
      deletedAt,
    });
    await appendDeletionLog(admin.db, [
      record(1, ago(30 * DAY)),
      record(2, ago(90 * DAY)),
      record(3, ago(30 * DAY - 1)),
      record(4, ago(DAY)),
    ]);
    await addAccessLogEntry(admin.db, {
      workspaceId: gym.id,
      occurredAt: new Date('2024-01-05T10:00:00Z'),
    });

    await retentionCron().run();

    const rows = await admin.db.select().from(deletionLog);
    expect(rows.map((r) => r.recordId).sort()).toEqual(
      [
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000004',
        // The entry that today's access-log task wrote.
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      ].sort(),
    );
    expect(rows.filter((r) => r.tableName === 'access_log')).toHaveLength(1);
    expect((await messages())['retention.deletion-log']).toBe('deleted=2');
  });

  it('counts the same across the change of the clocks in spring', async () => {
    // 30 March 2026, 04:00 UTC, the day after Amsterdam went to summer time.
    const spring = new Date('2026-03-30T04:00:00Z');
    const clock = manualClock(spring);
    const at = (ms: number) => new Date(spring.getTime() - ms);
    await verification('boundary@example.com', at(24 * HOUR));
    await verification('inside@example.com', at(24 * HOUR - 1));

    await retentionCron(clock).run();

    expect(await remaining(authVerifications)).toEqual(['inside@example.com']);
  });
});
