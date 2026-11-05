import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cloneTemplateDatabase,
  createTestDatabase,
  type TestDatabase,
  withRollback,
} from '@fivvi/testing/database';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authRateLimits,
  authUsers,
  clients,
  createDatabase,
  type DatabaseClient,
  type DatabaseExecutor,
  findSystemGreeting,
  groupClasses,
  HELLO_GREETING,
  locations,
  organizations,
  pingDatabase,
  sessionParticipants,
  sessions,
  systemGreetings,
  teamMembers,
  trainerInvitations,
  trainerProfiles,
} from '../src/index.ts';
import { migrationsFolder, runMigrations } from '../src/migrate.ts';
import { release } from '../src/release.ts';
import { resetRateLimits } from '../src/reset-rate-limits.ts';
import { seed } from '../src/seed.ts';
import { findTenancyViolations } from './conventions.ts';
import { NON_BUSINESS_TABLES, RULES } from './tenancy-rules.ts';

interface Journal {
  entries: { tag: string }[];
}

async function readJournal(folder: string): Promise<Journal> {
  return JSON.parse(await readFile(join(folder, 'meta', '_journal.json'), 'utf8')) as Journal;
}

async function rows<T>(db: DatabaseExecutor, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

// Migration tests start from an empty database and commit, so each gets its own.
async function withFreshDatabase(test: (client: DatabaseClient) => Promise<void>): Promise<void> {
  const database = await createTestDatabase();
  const client = createDatabase({ url: database.url, maxConnections: 2 });
  try {
    await test(client);
  } finally {
    await client.close();
    await database.drop();
  }
}

describe('E004 migrations', () => {
  it('migrate → seed → read works on an empty database', async () => {
    await withFreshDatabase(async (client) => {
      await runMigrations(client.db);
      await seed(client.db);

      expect(await findSystemGreeting(client.db, 'hello')).toEqual(HELLO_GREETING);
    });
  });

  it('inserts the hello greeting without the seed, as production needs it (E003)', async () => {
    await withFreshDatabase(async (client) => {
      await runMigrations(client.db);

      expect(await client.db.$count(systemGreetings)).toBe(1);
      expect(await findSystemGreeting(client.db, 'hello')).toEqual(HELLO_GREETING);
    });
  });

  it('records every committed migration as applied', async () => {
    await withFreshDatabase(async (client) => {
      await runMigrations(client.db);

      const journal = await readJournal(migrationsFolder);
      const applied = await rows<{ count: number }>(
        client.db,
        sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
      );
      expect(journal.entries.length).toBeGreaterThan(0);
      expect(applied[0]?.count).toBe(journal.entries.length);
    });
  });

  it('applies the latest migration on top of the previous version', async () => {
    const journal = await readJournal(migrationsFolder);
    const previous = await mkdtemp(join(tmpdir(), 'fivvi-migrations-'));
    try {
      // A copy of the migrations folder as it was before the latest migration.
      await cp(migrationsFolder, previous, { recursive: true });
      const previousJournal = { ...journal, entries: journal.entries.slice(0, -1) };
      await writeFile(join(previous, 'meta', '_journal.json'), JSON.stringify(previousJournal));

      await withFreshDatabase(async (client) => {
        await migrate(client.db, { migrationsFolder: previous });
        await runMigrations(client.db);
        await seed(client.db);

        expect(await findSystemGreeting(client.db, 'hello')).toEqual(HELLO_GREETING);
      });
    } finally {
      await rm(previous, { recursive: true, force: true });
    }
  });

  it('backfills trainer profiles for the Trainers and first Owners of an older database (F005 AC2, AC3)', async () => {
    const trainerProfilesBackfill = '0014_trainer_profiles_backfill';
    const journal = await readJournal(migrationsFolder);
    const backfillIndex = journal.entries.findIndex(
      (entry) => entry.tag === trainerProfilesBackfill,
    );
    expect(backfillIndex).toBeGreaterThanOrEqual(0);

    const previous = await mkdtemp(join(tmpdir(), 'fivvi-migrations-'));
    try {
      await cp(migrationsFolder, previous, { recursive: true });
      // The journal cut just before the backfill, so only that migration is applied after it.
      const previousJournal = { ...journal, entries: journal.entries.slice(0, backfillIndex) };
      await writeFile(join(previous, 'meta', '_journal.json'), JSON.stringify(previousJournal));

      await withFreshDatabase(async (client) => {
        // The database as it was before the backfill: members, no profiles.
        await migrate(client.db, { migrationsFolder: previous });
        // F002 inserts a workspace and its first Owner in one transaction, so both get the same
        // created_at (now()). The test sets that value on the workspace and its creator by hand.
        const created = {
          gym: '2026-01-01T10:00:00Z',
          studio: '2026-04-01T10:00:00Z',
          orphan: '2026-05-01T10:00:00Z',
        };
        const [workspace] = await rows<{ id: string }>(
          client.db,
          sql`insert into organizations (name, slug, default_locale, time_zone, created_at)
              values ('Backfill Gym', 'backfill-gym', 'nl-NL', 'Europe/Amsterdam', ${created.gym})
              returning id`,
        );
        const [other] = await rows<{ id: string }>(
          client.db,
          sql`insert into organizations (name, slug, default_locale, time_zone, created_at)
              values ('Backfill Studio', 'backfill-studio', 'en', 'Europe/Amsterdam', ${created.studio})
              returning id`,
        );
        // A workspace whose creator Owner was removed (F003): only a later Owner is left.
        const [orphan] = await rows<{ id: string }>(
          client.db,
          sql`insert into organizations (name, slug, default_locale, time_zone, created_at)
              values ('Backfill Orphan', 'backfill-orphan', 'nl-NL', 'Europe/Amsterdam', ${created.orphan})
              returning id`,
        );
        const member = async (
          organizationId: string | undefined,
          email: string,
          role: 'owner' | 'trainer',
          createdAt: string,
        ): Promise<string> => {
          const [account] = await rows<{ id: string }>(
            client.db,
            sql`insert into auth_users (email) values (${email}) returning id`,
          );
          const [created] = await rows<{ id: string }>(
            client.db,
            sql`insert into team_members (organization_id, account_id, role, created_at)
                values (${organizationId}, ${account?.id}, ${role}, ${createdAt}) returning id`,
          );
          return created?.id ?? '';
        };
        const firstOwner = await member(workspace?.id, 'first@example.com', 'owner', created.gym);
        const secondOwner = await member(
          workspace?.id,
          'second@example.com',
          'owner',
          '2026-02-01T10:00:00Z',
        );
        const trainer = await member(
          workspace?.id,
          'trainer@example.com',
          'trainer',
          '2026-03-01T10:00:00Z',
        );
        const otherOwner = await member(other?.id, 'studio@example.com', 'owner', created.studio);
        const laterOwner = await member(
          orphan?.id,
          'later@example.com',
          'owner',
          '2026-06-01T10:00:00Z',
        );

        const profiled = async (): Promise<string[]> =>
          (
            await rows<{ team_member_id: string }>(
              client.db,
              sql`select team_member_id from trainer_profiles order by team_member_id`,
            )
          ).map((row) => row.team_member_id);

        expect(await profiled()).toEqual([]);

        await runMigrations(client.db);
        const afterMigration = await profiled();
        expect(afterMigration).toEqual([firstOwner, trainer, otherOwner].sort());
        expect(afterMigration).not.toContain(secondOwner);
        expect(afterMigration).not.toContain(laterOwner);

        // Running the migration's SQL again changes nothing.
        const statements = (
          await readFile(join(migrationsFolder, `${trainerProfilesBackfill}.sql`), 'utf8')
        ).split('--> statement-breakpoint');
        for (const statement of statements) {
          await client.db.execute(sql.raw(statement));
        }
        expect(await profiled()).toEqual(afterMigration);
      });
    } finally {
      await rm(previous, { recursive: true, force: true });
    }
  });

  it('makes the client email required, and fails rather than invent an address (F006, spec #174 decision 5)', async () => {
    const emailRequired = '0015_clients_email_required';
    const journal = await readJournal(migrationsFolder);
    const index = journal.entries.findIndex((entry) => entry.tag === emailRequired);
    expect(index).toBeGreaterThanOrEqual(0);

    const previous = await mkdtemp(join(tmpdir(), 'fivvi-migrations-'));
    try {
      await cp(migrationsFolder, previous, { recursive: true });
      const previousJournal = { ...journal, entries: journal.entries.slice(0, index) };
      await writeFile(join(previous, 'meta', '_journal.json'), JSON.stringify(previousJournal));

      await withFreshDatabase(async (client) => {
        await migrate(client.db, { migrationsFolder: previous });
        const [workspace] = await rows<{ id: string }>(
          client.db,
          sql`insert into organizations (name, slug, default_locale, time_zone)
              values ('Email Gym', 'email-gym', 'nl-NL', 'Europe/Amsterdam') returning id`,
        );
        await client.db.execute(
          sql`insert into clients (organization_id, name, email)
              values (${workspace?.id}, 'Anna de Vries', 'anna@example.com')`,
        );
        const [withoutEmail] = await rows<{ id: string }>(
          client.db,
          sql`insert into clients (organization_id, name)
              values (${workspace?.id}, 'Mark Jansen') returning id`,
        );

        // A client without an email address stops the migration: no address is made up.
        await expect(runMigrations(client.db)).rejects.toThrow();
        expect(
          await rows(client.db, sql`select email from clients where id = ${withoutEmail?.id}`),
        ).toEqual([{ email: null }]);

        // With the address filled in by hand, the migration goes through, and the column is
        // required from then on.
        await client.db.execute(
          sql`update clients set email = 'mark@example.com' where id = ${withoutEmail?.id}`,
        );
        await runMigrations(client.db);
        await expect(
          client.db.execute(
            sql`insert into clients (organization_id, name) values (${workspace?.id}, 'Sophie')`,
          ),
        ).rejects.toMatchObject({ cause: { code: '23502', column: 'email' } });
      });
    } finally {
      await rm(previous, { recursive: true, force: true });
    }
  });

  it('gives only the seed’s own email-less client its address, so the seeded development database migrates (F006)', async () => {
    const emailRequired = '0015_clients_email_required';
    const journal = await readJournal(migrationsFolder);
    const index = journal.entries.findIndex((entry) => entry.tag === emailRequired);
    expect(index).toBeGreaterThanOrEqual(0);

    const previous = await mkdtemp(join(tmpdir(), 'fivvi-migrations-'));
    try {
      await cp(migrationsFolder, previous, { recursive: true });
      const previousJournal = { ...journal, entries: journal.entries.slice(0, index) };
      await writeFile(join(previous, 'meta', '_journal.json'), JSON.stringify(previousJournal));

      const insertWorkspace = (db: Parameters<typeof rows>[0], slug: string) =>
        rows<{ id: string }>(
          db,
          sql`insert into organizations (name, slug, default_locale, time_zone)
              values (${slug}, ${slug}, 'nl-NL', 'Europe/Amsterdam') returning id`,
        );

      await withFreshDatabase(async (client) => {
        await migrate(client.db, { migrationsFolder: previous });
        const [gym] = await insertWorkspace(client.db, 'johns-gym');
        const [other] = await insertWorkspace(client.db, 'other-gym');
        // The seed of an older version: Mark Jansen of John's Gym without an address.
        await client.db.execute(
          sql`insert into clients (organization_id, name) values (${gym?.id}, 'Mark Jansen')`,
        );
        // Not the seed's row: same name in another workspace, and another name in the seed's.
        const [stranger] = await rows<{ id: string }>(
          client.db,
          sql`insert into clients (organization_id, name)
              values (${other?.id}, 'Mark Jansen') returning id`,
        );
        const [sophie] = await rows<{ id: string }>(
          client.db,
          sql`insert into clients (organization_id, name)
              values (${gym?.id}, 'Sophie Bakker') returning id`,
        );

        // Any other row without an address still stops the migration: no address is made up.
        await expect(runMigrations(client.db)).rejects.toThrow();
        await client.db.execute(
          sql`update clients set email = 'a@example.com' where id = ${stranger?.id}`,
        );
        await expect(runMigrations(client.db)).rejects.toThrow();
        await client.db.execute(
          sql`update clients set email = 'b@example.com' where id = ${sophie?.id}`,
        );

        await runMigrations(client.db);
        expect(
          await rows(
            client.db,
            sql`select name, email from clients where organization_id = ${gym?.id} order by name`,
          ),
        ).toEqual([
          { name: 'Mark Jansen', email: 'mark@example.com' },
          { name: 'Sophie Bakker', email: 'b@example.com' },
        ]);
      });
    } finally {
      await rm(previous, { recursive: true, force: true });
    }
  });

  it('is a no-op when run again', async () => {
    await withFreshDatabase(async (client) => {
      await runMigrations(client.db);
      await runMigrations(client.db);

      const journal = await readJournal(migrationsFolder);
      const applied = await rows<{ count: number }>(
        client.db,
        sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
      );
      expect(applied[0]?.count).toBe(journal.entries.length);
    });
  });
});

describe('E003 release step', () => {
  it('migrates a new database and seeds it only when asked', async () => {
    await withFreshDatabase(async (client) => {
      const logs: string[] = [];

      await release(client.db, { seed: false }, (message) => logs.push(message));
      await release(client.db, { seed: true }, (message) => logs.push(message));

      expect(await findSystemGreeting(client.db, 'hello')).toEqual(HELLO_GREETING);
      // Each run migrates and reports the app role and the cron role; the second also seeds. No
      // password is set here, so the roles are left as they are (E011, E012).
      const appRoleLog = expect.stringMatching(
        /^App role fivvi_app: APP_DATABASE_PASSWORD is not set/,
      );
      const cronRoleLog = expect.stringMatching(
        /^Cron role fivvi_cron: CRON_DATABASE_PASSWORD is not set/,
      );
      expect(logs).toEqual([
        'Migrations applied.',
        appRoleLog,
        cronRoleLog,
        'Migrations applied.',
        appRoleLog,
        cronRoleLog,
        'Seed data inserted.',
      ]);
    });
  });

  it('pings a reachable database', async () => {
    await withFreshDatabase(async (client) => {
      await expect(pingDatabase(client.db)).resolves.toBeUndefined();
    });
  });

  it('fails the ping when the database is unreachable', async () => {
    const database = await createTestDatabase();
    await database.drop();
    const client = createDatabase({ url: database.url, maxConnections: 1 });
    try {
      await expect(pingDatabase(client.db)).rejects.toThrow();
    } finally {
      await client.close();
    }
  });
});

describe('E004 database', () => {
  // One migrated clone for this file; every test runs in a transaction that is rolled
  // back, so tests see a freshly migrated database (only the system rows the data
  // migrations insert) and never each other's rows.
  let database: TestDatabase;
  let client: DatabaseClient;
  let db: DatabaseClient['db'];

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    client = createDatabase({ url: database.url, maxConnections: 2 });
    db = client.db;
  });

  describe('F015 seed locations', () => {
    const ADDRESS = {
      postcode: '1234 AB',
      houseNumber: '1',
      houseNumberAddition: null,
      street: 'Voorbeeldstraat',
      city: 'Amsterdam',
    };

    it('AC12: gives every seeded workspace its one location and John’s Gym a synthetic address, once', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx);
        await seed(tx);

        const seeded = await tx
          .select({
            workspace: organizations.slug,
            name: locations.name,
            type: locations.type,
            isDefault: locations.isDefault,
            postcode: locations.postcode,
            houseNumber: locations.houseNumber,
            houseNumberAddition: locations.houseNumberAddition,
            street: locations.street,
            city: locations.city,
          })
          .from(locations)
          .innerJoin(organizations, eq(organizations.id, locations.organizationId))
          .orderBy(organizations.slug);
        expect(seeded).toEqual([
          {
            workspace: 'johns-gym',
            name: "John's Gym",
            type: 'organization_location',
            isDefault: true,
            ...ADDRESS,
          },
          {
            workspace: 'sarah-personal-training',
            name: 'Sarah Personal Training',
            type: 'organization_location',
            isDefault: true,
            postcode: null,
            houseNumber: null,
            houseNumberAddition: null,
            street: null,
            city: null,
          },
        ]);
      });
    });

    it('AC12: gives the location the backfill made (no address) its synthetic address, and keeps a name changed since', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx);
        await tx
          .update(locations)
          .set({ name: 'Renamed', postcode: null, houseNumber: null, street: null, city: null })
          .where(eq(locations.name, "John's Gym"));

        await seed(tx);

        const [gym] = await tx.select().from(locations).where(eq(locations.name, 'Renamed'));
        expect(gym).toMatchObject(ADDRESS);
        expect(await tx.$count(locations)).toBe(2);
      });
    });

    it('AC12: seeds no location in production', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { production: true });

        expect(await tx.$count(locations)).toBe(0);
      });
    });
  });

  describe('F011 seed trainer invitation', () => {
    it('AC14: gives John’s Gym a pending invitation for invitee@example.com, from John, once', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx);
        await seed(tx);

        const invitations = await tx
          .select({
            workspace: organizations.slug,
            name: trainerInvitations.name,
            email: trainerInvitations.email,
            status: trainerInvitations.status,
            inviter: authUsers.email,
            expiresAt: trainerInvitations.expiresAt,
            tokenHash: trainerInvitations.tokenHash,
          })
          .from(trainerInvitations)
          .innerJoin(organizations, eq(organizations.id, trainerInvitations.organizationId))
          .innerJoin(teamMembers, eq(teamMembers.id, trainerInvitations.inviterTeamMemberId))
          .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId));
        expect(invitations).toEqual([
          {
            workspace: 'johns-gym',
            name: 'Invitee',
            email: 'invitee@example.com',
            status: 'pending',
            inviter: 'owner@example.com',
            expiresAt: expect.any(Date),
            tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          },
        ]);
        expect(invitations[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());
      });
    });

    it('AC14: leaves an invitation the Owner has since sent again, or withdrawn, alone', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx);
        await tx.update(trainerInvitations).set({ status: 'withdrawn' });

        await seed(tx);

        // A withdrawn seed invitation is not made pending again behind the Owner's back.
        const rows = await tx
          .select({ status: trainerInvitations.status })
          .from(trainerInvitations);
        expect(rows).toEqual([{ status: 'withdrawn' }]);
      });
    });

    it('AC14: seeds no invitation in production', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { production: true });

        expect(await tx.$count(trainerInvitations)).toBe(0);
      });
    });
  });

  describe('F006 seed clients', () => {
    it('AC15: gives John’s Gym a few synthetic clients, every one with an @example.com email address, once', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx);
        await seed(tx);

        const [gym] = await tx
          .select()
          .from(organizations)
          .where(eq(organizations.slug, 'johns-gym'));
        const seeded = await tx
          .select({ name: clients.name, email: clients.email, accountId: clients.accountId })
          .from(clients)
          .where(eq(clients.organizationId, gym?.id ?? ''))
          .orderBy(clients.name);
        expect(seeded.map(({ name }) => name)).toEqual([
          'Anna de Vries',
          'Mark Jansen',
          'Sophie Bakker',
        ]);
        for (const { email } of seeded) {
          expect(email).toMatch(/^[a-z.]+@example\.com$/);
        }
        // Adding a client links nobody: the seed has no account for them (F006 AC4).
        expect(seeded.every(({ accountId }) => accountId === null)).toBe(true);
        expect(await tx.$count(clients)).toBe(3);
      });
    });

    it('AC15: seeds no client in production', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { production: true });

        expect(await tx.$count(clients)).toBe(0);
      });
    });
  });

  describe('F020 seed private sessions', () => {
    // Wednesday 4 November 2026: the week of Monday 2 November, in Amsterdam (CET, UTC+1).
    const WEDNESDAY = new Date('2026-11-04T12:00:00Z');

    /** The seeded sessions of John's Gym as the calendar reads them: local day and time, trainer, client. */
    function seededWeek(tx: DatabaseExecutor) {
      return rows<{
        day: string;
        time: string;
        minutes: number;
        trainer: string;
        client: string;
        status: string;
        type: string;
        capacity: number;
        location: string;
      }>(
        tx,
        sql`select to_char(s.starts_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD') as day,
                   to_char(s.starts_at at time zone 'Europe/Amsterdam', 'HH24:MI') as time,
                   (extract(epoch from s.ends_at - s.starts_at) / 60)::int as minutes,
                   u.name as trainer, c.name as client, s.status, s.type, s.capacity, l.name as location
            from sessions s
            join organizations o on o.id = s.organization_id and o.slug = 'johns-gym'
            join trainer_profiles tp on tp.id = s.trainer_profile_id
            join team_members tm on tm.id = tp.team_member_id
            join auth_users u on u.id = tm.account_id
            join session_participants sp on sp.session_id = s.id
            join clients c on c.id = sp.client_id
            join locations l on l.id = s.location_id and l.is_default
            order by s.starts_at`,
      );
    }

    it('AC15: gives John’s Gym a synthetic week of private sessions for John, Sarah and Tom with the seeded clients, once', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { now: WEDNESDAY });
        await seed(tx, { now: WEDNESDAY });

        const week = await seededWeek(tx);
        expect(week.length).toBeGreaterThanOrEqual(6);
        expect(new Set(week.map(({ trainer }) => trainer))).toEqual(
          new Set(['Owner', 'Sarah', 'Tom']),
        );
        expect(new Set(week.map(({ client }) => client))).toEqual(
          new Set(['Anna de Vries', 'Mark Jansen', 'Sophie Bakker']),
        );
        // Monday to Friday of that week, local days; every one a one-to-one session at the gym.
        const days = [...new Set(week.map(({ day }) => day))];
        expect(days).toEqual([
          '2026-11-02',
          '2026-11-03',
          '2026-11-04',
          '2026-11-05',
          '2026-11-06',
        ]);
        for (const session of week) {
          expect(session).toMatchObject({
            status: 'scheduled',
            type: 'private',
            capacity: 1,
            location: "John's Gym",
          });
          expect(session.minutes % 5).toBe(0);
        }
        expect(await tx.$count(sessions, eq(sessions.type, 'private'))).toBe(week.length);
        expect(await tx.$count(sessionParticipants)).toBe(week.length);
      });
    });

    it('AC15: keeps the wall-clock times in summer time and in winter time (07:00 UTC and 08:00 UTC for 09:00)', async () => {
      await withRollback(db, async (tx) => {
        // The week of Monday 21 September 2026 is summer time, that of Monday 2 November winter time.
        await seed(tx, { now: new Date('2026-09-23T12:00:00Z') });
        await seed(tx, { now: WEDNESDAY });

        const mondays = await rows<{ day: string; time: string; utc: string }>(
          tx,
          sql`select to_char(starts_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD') as day,
                     to_char(starts_at at time zone 'Europe/Amsterdam', 'HH24:MI') as time,
                     to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as utc
              from sessions
              where to_char(starts_at at time zone 'Europe/Amsterdam', 'HH24:MI') = '09:00'
                and to_char(starts_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD') in ('2026-09-21', '2026-11-02')
              order by starts_at`,
        );
        expect(mondays).toEqual([
          { day: '2026-09-21', time: '09:00', utc: '2026-09-21T07:00' },
          { day: '2026-11-02', time: '09:00', utc: '2026-11-02T08:00' },
        ]);
      });
    });

    it('AC15: adds the next week when the seed runs in it, and leaves a week alone that it has seeded', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { now: WEDNESDAY });
        const first = (await seededWeek(tx)).length;
        await tx.update(sessions).set({ status: 'cancelled' });

        await seed(tx, { now: WEDNESDAY });
        expect((await seededWeek(tx)).length).toBe(first);
        expect((await seededWeek(tx)).every(({ status }) => status === 'cancelled')).toBe(true);

        await seed(tx, { now: new Date('2026-11-11T12:00:00Z') });
        expect((await seededWeek(tx)).length).toBe(first * 2);
      });
    });

    it('AC15: gives Tom an account and a trainer profile in John’s Gym', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { now: WEDNESDAY });

        const [tom] = await tx
          .select()
          .from(authUsers)
          .where(eq(authUsers.email, 'tom@example.com'));
        expect(tom).toMatchObject({ name: 'Tom' });
        const [role] = await tx
          .select({ id: teamMembers.id, role: teamMembers.role })
          .from(teamMembers)
          .where(eq(teamMembers.accountId, tom?.id ?? ''));
        expect(role?.role).toBe('trainer');
        expect(
          await tx.$count(trainerProfiles, eq(trainerProfiles.teamMemberId, role?.id ?? '')),
        ).toBe(1);
      });
    });

    it('AC15: seeds no session in production', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { production: true, now: WEDNESDAY });

        expect(await tx.$count(sessions)).toBe(0);
        expect(await tx.$count(sessionParticipants)).toBe(0);
      });
    });
  });

  describe('F021 seed group classes', () => {
    // Wednesday 4 November 2026: the week of Monday 2 November, in Amsterdam (CET, UTC+1).
    const WEDNESDAY = new Date('2026-11-04T12:00:00Z');

    function seededClasses(tx: DatabaseExecutor) {
      return rows<{
        name: string;
        nameEn: string | null;
        trainer: string | null;
        capacity: number;
        minutes: number;
      }>(
        tx,
        sql`select gc.name_nl as name, gc.name_en as "nameEn", u.name as trainer, gc.capacity,
                   gc.duration_minutes as minutes
            from group_classes gc
            join organizations o on o.id = gc.organization_id and o.slug = 'johns-gym'
            left join trainer_profiles tp on tp.id = gc.default_trainer_profile_id
            left join team_members tm on tm.id = tp.team_member_id
            left join auth_users u on u.id = tm.account_id
            order by gc.name_nl`,
      );
    }

    function seededDates(tx: DatabaseExecutor) {
      return rows<{
        name: string;
        day: string;
        time: string;
        minutes: number;
        trainer: string | null;
        capacity: number;
        type: string;
        location: string;
      }>(
        tx,
        sql`select gc.name_nl as name,
                   to_char(s.starts_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD') as day,
                   to_char(s.starts_at at time zone 'Europe/Amsterdam', 'HH24:MI') as time,
                   (extract(epoch from s.ends_at - s.starts_at) / 60)::int as minutes,
                   u.name as trainer, s.capacity, s.type, l.name as location
            from sessions s
            join group_classes gc on gc.id = s.group_class_id
            join locations l on l.id = s.location_id and l.is_default
            left join trainer_profiles tp on tp.id = s.trainer_profile_id
            left join team_members tm on tm.id = tp.team_member_id
            left join auth_users u on u.id = tm.account_id
            order by s.starts_at`,
      );
    }

    it('AC12: gives John’s Gym three classes, one with an English name and one that needs a trainer', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { now: WEDNESDAY });
        await seed(tx, { now: WEDNESDAY });

        const classes = await seededClasses(tx);
        expect(classes).toHaveLength(3);
        expect(classes.filter(({ nameEn }) => nameEn !== null)).toHaveLength(1);
        expect(classes.filter(({ trainer }) => trainer === null)).toHaveLength(1);
        expect(classes.find(({ nameEn }) => nameEn !== null)).toMatchObject({
          name: 'Kracht',
          nameEn: 'Strength',
          trainer: 'Sarah',
          capacity: 8,
          minutes: 60,
        });
      });
    });

    it('AC12: schedules them in the synthetic week at the default location, copying the class', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { now: WEDNESDAY });
        await seed(tx, { now: WEDNESDAY });

        const dates = await seededDates(tx);
        expect(dates.length).toBeGreaterThanOrEqual(3);
        for (const date of dates) {
          expect(date).toMatchObject({ type: 'group', location: "John's Gym" });
          expect(date.day >= '2026-11-02' && date.day <= '2026-11-06').toBe(true);
        }
        expect(new Set(dates.map(({ name }) => name)).size).toBe(3);
        // Every date copied its class: the trainer, the capacity and the length.
        const classes = await seededClasses(tx);
        for (const date of dates) {
          const own = classes.find(({ name }) => name === date.name);
          expect(date).toMatchObject({
            trainer: own?.trainer,
            capacity: own?.capacity,
            minutes: own?.minutes,
          });
        }
        // A class that needs a trainer is scheduled without one.
        expect(dates.some(({ trainer }) => trainer === null)).toBe(true);
        // Wall-clock times, local to the workspace: Kracht at 18:00.
        expect(dates.find(({ name }) => name === 'Kracht')?.time).toBe('18:00');
      });
    });

    it('AC12: seeds the dates of the next week when the seed runs in it, once per week, and the classes once', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { now: WEDNESDAY });
        const first = (await seededDates(tx)).length;
        await seed(tx, { now: new Date('2026-11-11T12:00:00Z') });
        await seed(tx, { now: new Date('2026-11-11T12:00:00Z') });

        expect((await seededDates(tx)).length).toBe(first * 2);
        expect(await seededClasses(tx)).toHaveLength(3);
      });
    });

    it('AC12: leaves a class an Owner renamed alone and does not make it again', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { now: WEDNESDAY });
        await tx
          .update(groupClasses)
          .set({ capacity: 20 })
          .where(eq(groupClasses.nameNl, 'Kracht'));
        await seed(tx, { now: WEDNESDAY });

        expect((await seededClasses(tx)).find(({ name }) => name === 'Kracht')?.capacity).toBe(20);
      });
    });

    it('AC12: seeds no class in production', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { production: true, now: WEDNESDAY });

        expect(await tx.$count(groupClasses)).toBe(0);
      });
    });
  });

  afterAll(async () => {
    await client?.close();
    await database?.drop();
  });

  describe('seed', () => {
    it('is idempotent and keeps the system rows', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx);
        await seed(tx);

        expect(await tx.$count(systemGreetings)).toBe(1);
        expect(await findSystemGreeting(tx, 'hello')).toEqual(HELLO_GREETING);
      });
    });
  });

  describe('F001 clearing the sign-in rate limits', () => {
    it('deletes every counter, expired or not, and nothing else', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx);
        const future = new Date('2100-01-01T00:00:00Z');
        await tx.insert(authRateLimits).values([
          { key: 'email:a', count: 3, windowEndsAt: future },
          { key: 'ip:unknown', count: 20, windowEndsAt: new Date(0) },
        ]);

        await resetRateLimits(tx);

        expect(await tx.$count(authRateLimits)).toBe(0);
        // The seeded accounts: John, Sarah and Tom.
        expect(await tx.$count(authUsers)).toBe(3);
      });
    });
  });

  describe('F001 seed accounts', () => {
    it('creates the account owner@example.com with Dutch as its language, once', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx);
        await seed(tx);

        const users = await tx
          .select()
          .from(authUsers)
          .where(eq(authUsers.email, 'owner@example.com'));
        expect(users).toEqual([
          expect.objectContaining({
            email: 'owner@example.com',
            preferredLocale: 'nl-NL',
            emailVerified: true,
          }),
        ]);
      });
    });

    it('creates no account in production', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { production: true });

        expect(await tx.$count(authUsers)).toBe(0);
      });
    });

    it('seeds a deployed environment only outside production', async () => {
      await withFreshDatabase(async (client) => {
        await release(client.db, { seed: true, production: true }, () => {});
        expect(await client.db.$count(authUsers)).toBe(0);

        await release(client.db, { seed: true }, () => {});
        // John, Sarah and Tom.
        expect(await client.db.$count(authUsers)).toBe(3);
      });
    });
  });

  describe('F002 seed workspace', () => {
    it("AC13: creates John's Gym owned by owner@example.com, once", async () => {
      await withRollback(db, async (tx) => {
        await seed(tx);
        await seed(tx);

        const [gym] = await tx
          .select()
          .from(organizations)
          .where(eq(organizations.slug, 'johns-gym'));
        expect(gym).toEqual(
          expect.objectContaining({
            name: "John's Gym",
            slug: 'johns-gym',
            defaultLocale: 'nl-NL',
            timeZone: 'Europe/Amsterdam',
          }),
        );
        const [owner] = await tx
          .select({ role: teamMembers.role, email: authUsers.email })
          .from(teamMembers)
          .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
          .where(and(eq(teamMembers.organizationId, gym?.id ?? ''), eq(teamMembers.role, 'owner')));
        expect(owner).toEqual({ role: 'owner', email: 'owner@example.com' });
      });
    });

    it('F005: John, Sarah and Tom train in John’s Gym and Sarah in her own workspace, once', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx);
        await seed(tx);

        const training = await tx
          .select({ slug: organizations.slug, email: authUsers.email, role: teamMembers.role })
          .from(trainerProfiles)
          .innerJoin(teamMembers, eq(teamMembers.id, trainerProfiles.teamMemberId))
          .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
          .innerJoin(organizations, eq(organizations.id, trainerProfiles.organizationId));
        expect(
          training.toSorted((a, b) => `${a.slug}${a.email}`.localeCompare(`${b.slug}${b.email}`)),
        ).toEqual([
          { slug: 'johns-gym', email: 'owner@example.com', role: 'owner' },
          { slug: 'johns-gym', email: 'tom@example.com', role: 'trainer' },
          { slug: 'johns-gym', email: 'trainer@example.com', role: 'trainer' },
          { slug: 'sarah-personal-training', email: 'trainer@example.com', role: 'owner' },
        ]);
      });
    });

    it('AC13 (F003): Sarah is Trainer of John’s Gym and Owner of her own workspace, once', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx);
        await seed(tx);

        const roles = await tx
          .select({ role: teamMembers.role, slug: organizations.slug, name: authUsers.name })
          .from(teamMembers)
          .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
          .innerJoin(organizations, eq(organizations.id, teamMembers.organizationId))
          .where(eq(authUsers.email, 'trainer@example.com'));
        expect(roles.toSorted((a, b) => a.slug.localeCompare(b.slug))).toEqual([
          { role: 'trainer', slug: 'johns-gym', name: 'Sarah' },
          { role: 'owner', slug: 'sarah-personal-training', name: 'Sarah' },
        ]);
        const [second] = await tx
          .select()
          .from(organizations)
          .where(eq(organizations.slug, 'sarah-personal-training'));
        expect(second).toEqual(
          expect.objectContaining({
            name: 'Sarah Personal Training',
            timeZone: 'Europe/Amsterdam',
          }),
        );
        // John, Sarah and Tom in John's Gym, and Sarah in her own workspace.
        expect(await tx.$count(teamMembers)).toBe(4);
      });
    });

    it('AC13: creates no workspace in production', async () => {
      await withRollback(db, async (tx) => {
        await seed(tx, { production: true });

        expect(await tx.$count(organizations)).toBe(0);
        expect(await tx.$count(teamMembers)).toBe(0);
      });
    });

    it('AC13: a deployed environment seeds the workspace only outside production', async () => {
      await withFreshDatabase(async (client) => {
        await release(client.db, { seed: true, production: true }, () => {});
        expect(await client.db.$count(organizations)).toBe(0);

        await release(client.db, { seed: true }, () => {});
        expect(await client.db.$count(organizations)).toBe(2);
      });
    });
  });

  describe('system greetings', () => {
    it('stores the migrated greeting as an i18n key, not as copy', async () => {
      await withRollback(db, async (tx) => {
        const [row] = await tx.select().from(systemGreetings);
        expect(row?.i18nKey).toBe('hello.title');
      });
    });

    it('returns undefined for an unknown slug', async () => {
      await withRollback(db, async (tx) => {
        expect(await findSystemGreeting(tx, 'goodbye')).toBeUndefined();
      });
    });

    it.each(['Hallo, welkom bij Fivvi!', 'hello', 'system hello'])(
      'rejects %j as an i18n key',
      async (i18nKey) => {
        await withRollback(db, async (tx) => {
          await tx.delete(systemGreetings);
          await expect(
            tx.insert(systemGreetings).values({ slug: 'hello', i18nKey }),
          ).rejects.toMatchObject({ cause: { constraint: 'system_greetings_i18n_key_format' } });
        });
      },
    );

    it('refreshes updated_at on update and keeps created_at', async () => {
      await withRollback(db, async (tx) => {
        const longAgo = new Date('2000-01-01T00:00:00Z');
        await tx.delete(systemGreetings);
        await tx
          .insert(systemGreetings)
          .values({ ...HELLO_GREETING, createdAt: longAgo, updatedAt: longAgo });

        await tx.update(systemGreetings).set({ i18nKey: 'system.helloAgain' });

        const [row] = await tx.select().from(systemGreetings);
        expect(row?.createdAt).toEqual(longAgo);
        expect(row?.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime());
      });
    });
  });

  // Runs after the tests above, which Vitest guarantees within a file.
  it('leaves nothing behind: every test above was rolled back', async () => {
    expect(await db.select().from(systemGreetings)).toEqual([
      expect.objectContaining(HELLO_GREETING),
    ]);
  });

  describe('conventions', () => {
    it('runs every session in UTC', async () => {
      const [setting] = await rows<{ TimeZone: string }>(db, sql`show timezone`);
      expect(setting?.TimeZone).toBe('UTC');
    });

    it('stores every timestamp column as timestamptz', async () => {
      const columns = await rows<{ table_name: string; column_name: string; data_type: string }>(
        db,
        sql`select table_name, column_name, data_type from information_schema.columns
            where table_schema = 'public' and data_type like 'timestamp%'`,
      );
      expect(columns.length).toBeGreaterThan(0);
      for (const column of columns) {
        expect(column, `${column.table_name}.${column.column_name}`).toMatchObject({
          data_type: 'timestamp with time zone',
        });
      }
    });

    it('gives every table a uuid primary key named id', async () => {
      const keys = await rows<{ table_name: string; columns: string[]; types: string[] }>(
        db,
        sql`select c.relname as table_name,
                   array_agg(a.attname::text) as columns,
                   array_agg(format_type(a.atttypid, a.atttypmod)) as types
            from pg_index i
            join pg_class c on c.oid = i.indrelid
            join pg_namespace n on n.oid = c.relnamespace
            join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
            where i.indisprimary and n.nspname = 'public'
            group by c.relname`,
      );
      const tables = await publicTables(db);
      expect(keys.map((key) => key.table_name).sort()).toEqual(tables);
      for (const key of keys) {
        expect(key, key.table_name).toMatchObject({ columns: ['id'], types: ['uuid'] });
      }
    });

    it('AC1: every business table has organization_id, forced RLS, the workspace policy and an index', async () => {
      await withRollback(db, async (tx) => {
        expect(await findTenancyViolations(tx, RULES)).toEqual([]);

        // The allow-list and the business tables together are all of `public`.
        const tables = await publicTables(tx);
        expect(tables).toEqual(
          expect.arrayContaining([...Object.keys(NON_BUSINESS_TABLES), 'organizations']),
        );
        for (const reason of Object.values(NON_BUSINESS_TABLES)) {
          expect(reason.length).toBeGreaterThan(10);
        }
        // The first business tables are protected, not on the allow-list.
        expect(tables).toEqual(expect.arrayContaining(['team_members', 'clients']));
        expect(Object.keys(NON_BUSINESS_TABLES)).not.toContain('team_members');
        expect(Object.keys(NON_BUSINESS_TABLES)).not.toContain('clients');
      });
    });

    it('AC1: accepts a table that has all of it', async () => {
      await withRollback(db, async (tx) => {
        await createBusinessTable(tx, 'probe');
        expect(await findTenancyViolations(tx, RULES)).toEqual([]);
      });
    });

    it.each(PROBE_DEFECTS)(
      'AC1: fails for a table with $name, naming the table',
      async (defect) => {
        await withRollback(db, async (tx) => {
          await createBusinessTable(tx, 'probe', defect.options);

          const violations = await findTenancyViolations(tx, RULES);

          expect(violations).toEqual(
            expect.arrayContaining([expect.stringMatching(defect.message)]),
          );
          for (const violation of violations) expect(violation).toMatch(/^probe: /);
        });
      },
    );

    it('AC1: fails for a table that is neither business, workspace nor allow-listed', async () => {
      await withRollback(db, async (tx) => {
        await tx.execute(sql`create table stray (id uuid primary key default gen_random_uuid())`);

        const violations = await findTenancyViolations(tx, RULES);

        expect(violations).toEqual(
          expect.arrayContaining([expect.stringMatching(/^stray: missing organization_id column/)]),
        );
      });
    });

    it('AC1: fails when the workspace table is not filtered on id', async () => {
      await withRollback(db, async (tx) => {
        await tx.execute(sql`drop policy organizations_workspace on organizations`);
        await tx.execute(
          sql`create policy organizations_workspace on organizations to fivvi_app
              using (true) with check (true)`,
        );

        expect(await findTenancyViolations(tx, RULES)).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/^organizations: missing the workspace policy/),
          ]),
        );
      });
    });

    it('AC2: foreign keys between business tables include organization_id; no definer views or functions', async () => {
      await withRollback(db, async (tx) => {
        // The real schema: composite foreign keys, no views, no definer functions.
        expect(await findTenancyViolations(tx, RULES)).toEqual([]);

        // A foreign key on the id alone could point into another workspace.
        await createBusinessTable(tx, 'parent');
        await createBusinessTable(tx, 'child');
        await tx.execute(sql`alter table child add column parent_id uuid not null`);
        await tx.execute(
          sql`alter table child add constraint child_parent_fk foreign key (parent_id) references parent (id)`,
        );
        expect(await findTenancyViolations(tx, RULES)).toEqual([
          expect.stringMatching(
            /^child: foreign key child_parent_fk to parent must include organization_id/,
          ),
        ]);

        // The composite foreign key is fine.
        await tx.execute(sql`alter table child drop constraint child_parent_fk`);
        await tx.execute(
          sql`alter table child add constraint child_parent_fk
              foreign key (organization_id, parent_id) references parent (organization_id, id)`,
        );
        expect(await findTenancyViolations(tx, RULES)).toEqual([]);

        // A view runs with its owner's rights unless it is security_invoker.
        await tx.execute(sql`create view parent_view as select id from parent`);
        expect(await findTenancyViolations(tx, RULES)).toEqual([
          expect.stringMatching(/^parent_view: view on parent is not security_invoker/),
        ]);
        await tx.execute(sql`drop view parent_view`);
        await tx.execute(
          sql`create view parent_view with (security_invoker = true) as select id from parent`,
        );
        expect(await findTenancyViolations(tx, RULES)).toEqual([]);

        // A security definer function bypasses RLS for its caller.
        await tx.execute(
          sql`create function peek() returns bigint language sql security definer
              as 'select count(*) from parent'`,
        );
        expect(await findTenancyViolations(tx, RULES)).toEqual([
          expect.stringMatching(/^peek: SECURITY DEFINER function is not on the reviewed list/),
        ]);
        expect(await findTenancyViolations(tx, { ...RULES, definerFunctions: ['peek'] })).toEqual(
          [],
        );
      });
    });

    it('AC20: a business table with a client column needs the client policy', async () => {
      await withRollback(db, async (tx) => {
        // The real schema: `clients` itself (its client column is `id`) has it.
        expect(await findTenancyViolations(tx, RULES)).toEqual([]);
        await tx.execute(sql`drop policy clients_client on clients`);
        expect(await findTenancyViolations(tx, RULES)).toEqual([
          expect.stringMatching(/^clients: missing the client policy for fivvi_app/),
        ]);
      });
    });

    it.each(CLIENT_POLICIES)(
      'AC20: a table with a client_id column and $name',
      async ({ policy, violation }) => {
        await withRollback(db, async (tx) => {
          await createBusinessTable(tx, 'booking');
          await tx.execute(sql`alter table booking add column client_id uuid not null`);
          await tx.execute(
            sql`alter table booking add constraint booking_client_fk
                foreign key (organization_id, client_id) references clients (organization_id, id)`,
          );
          await tx.execute(
            sql.raw(policy.replaceAll('<table>', 'booking').replaceAll('<column>', 'client_id')),
          );

          const violations = await findTenancyViolations(tx, RULES);

          expect(violations).toEqual(
            violation ? expect.arrayContaining([expect.stringMatching(violation)]) : [],
          );
        });
      },
    );

    it('AC20: a client column is found by its foreign key to clients, whatever its name', async () => {
      await withRollback(db, async (tx) => {
        await createBusinessTable(tx, 'invoice');
        await tx.execute(sql`alter table invoice add column billed_to uuid not null`);
        await tx.execute(
          sql`alter table invoice add constraint invoice_billed_to_fk
              foreign key (organization_id, billed_to) references clients (organization_id, id)`,
        );

        expect(await findTenancyViolations(tx, RULES)).toEqual([
          expect.stringMatching(/^invoice: missing the client policy for fivvi_app/),
        ]);
      });
    });

    it('AC2: a view or SECURITY DEFINER function outside public is checked too', async () => {
      await withRollback(db, async (tx) => {
        await createBusinessTable(tx, 'parent');
        await tx.execute(sql`create schema reporting`);

        await tx.execute(sql`create view reporting.parent_view as select id from parent`);
        expect(await findTenancyViolations(tx, RULES)).toEqual([
          expect.stringMatching(/^reporting\.parent_view: view on parent is not security_invoker/),
        ]);
        await tx.execute(sql`drop view reporting.parent_view`);
        await tx.execute(
          sql`create view reporting.parent_view with (security_invoker = true) as select id from parent`,
        );
        expect(await findTenancyViolations(tx, RULES)).toEqual([]);

        await tx.execute(
          sql`create function reporting.peek() returns bigint language sql security definer
              as 'select count(*) from parent'`,
        );
        expect(await findTenancyViolations(tx, RULES)).toEqual([
          expect.stringMatching(
            /^reporting\.peek: SECURITY DEFINER function is not on the reviewed list/,
          ),
        ]);
        expect(
          await findTenancyViolations(tx, { ...RULES, definerFunctions: ['reporting.peek'] }),
        ).toEqual([]);
      });
    });
  });
});

async function publicTables(db: DatabaseExecutor): Promise<string[]> {
  const tables = await rows<{ table_name: string }>(
    db,
    sql`select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
  );
  return tables.map((row) => row.table_name);
}

interface ProbeOptions {
  /** `none`: no column; `nullable`; `plain`: not null but no foreign key. */
  column?: 'none' | 'nullable' | 'plain' | 'ok';
  index?: boolean;
  rls?: 'off' | 'enabled' | 'forced';
  policy?: 'standard' | 'none' | 'read-only' | 'no-check' | 'other-column' | 'other-role' | 'open';
  /** An extra permissive policy that nobody reviewed. */
  extra?: boolean;
}

const PROBE_DEFECTS: { name: string; options: ProbeOptions; message: RegExp }[] = [
  {
    name: 'no organization_id',
    options: { column: 'none', policy: 'none' },
    message: /missing organization_id column/,
  },
  {
    name: 'a nullable organization_id',
    options: { column: 'nullable' },
    message: /organization_id must be a non-null uuid/,
  },
  {
    name: 'an organization_id without a foreign key',
    options: { column: 'plain' },
    message: /organization_id does not reference organizations/,
  },
  {
    name: 'no index on organization_id',
    options: { index: false },
    message: /missing an index that starts with organization_id/,
  },
  {
    name: 'RLS off',
    options: { rls: 'off', policy: 'standard' },
    message: /row-level security is not enabled/,
  },
  {
    name: 'RLS not forced',
    options: { rls: 'enabled' },
    message: /row-level security is not forced/,
  },
  {
    name: 'no policy',
    options: { policy: 'none' },
    message: /missing the workspace policy for fivvi_app .* on SELECT, UPDATE, DELETE, INSERT/,
  },
  {
    name: 'a read-only policy',
    options: { policy: 'read-only' },
    message: /missing the workspace policy for fivvi_app .* on UPDATE, DELETE, INSERT/,
  },
  {
    name: 'a policy without WITH CHECK',
    options: { policy: 'no-check' },
    message: /missing the workspace policy for fivvi_app .* on INSERT, UPDATE/,
  },
  {
    name: 'a policy on another column',
    options: { policy: 'other-column' },
    message: /missing the workspace policy/,
  },
  {
    name: 'a policy for another role',
    options: { policy: 'other-role' },
    message: /missing the workspace policy/,
  },
  { name: 'an open policy', options: { policy: 'open' }, message: /missing the workspace policy/ },
  {
    name: 'an unreviewed extra policy',
    options: { extra: true },
    message: /unreviewed permissive policy probe_extra/,
  },
];

const CLIENT_SCOPE = 'app_client_id() IS NULL OR <column> = app_client_id()';

/** The client policy variants (AC20) a table with a client column may have, and what is wrong. */
const CLIENT_POLICIES = [
  {
    name: 'no client policy',
    policy: 'select 1',
    violation: /^booking: missing the client policy for fivvi_app/,
  },
  {
    name: 'the standard client policy',
    policy: `create policy <table>_client on <table> as restrictive to fivvi_app using (${CLIENT_SCOPE}) with check (${CLIENT_SCOPE})`,
    violation: null,
  },
  {
    name: 'a client policy that is permissive (it would widen access)',
    policy: `create policy <table>_client on <table> as permissive to fivvi_app using (${CLIENT_SCOPE}) with check (${CLIENT_SCOPE})`,
    violation: /^booking: missing the client policy for fivvi_app/,
  },
  {
    name: 'a client policy without WITH CHECK',
    policy: `create policy <table>_client on <table> as restrictive to fivvi_app using (${CLIENT_SCOPE})`,
    violation: /^booking: missing the client policy for fivvi_app/,
  },
  {
    name: 'a client policy for select only',
    policy: `create policy <table>_client on <table> as restrictive for select to fivvi_app using (${CLIENT_SCOPE})`,
    violation: /^booking: missing the client policy for fivvi_app/,
  },
  {
    name: 'a client policy on another column',
    policy: `create policy <table>_client on <table> as restrictive to fivvi_app using (app_client_id() IS NULL OR id = app_client_id()) with check (app_client_id() IS NULL OR id = app_client_id())`,
    violation: /^booking: missing the client policy for fivvi_app/,
  },
  {
    name: 'a client policy that lets any client context through',
    policy: `create policy <table>_client on <table> as restrictive to fivvi_app using (true) with check (true)`,
    violation: /^booking: missing the client policy for fivvi_app/,
  },
] as const;

/** Creates a business table in the current transaction, with the defects asked for. */
async function createBusinessTable(
  tx: DatabaseExecutor,
  name: string,
  options: ProbeOptions = {},
): Promise<void> {
  const {
    column = 'ok',
    index = true,
    rls = 'forced',
    policy = 'standard',
    extra = false,
  } = options;
  const organizationColumn = {
    none: '',
    nullable: ', organization_id uuid references organizations (id)',
    plain: ', organization_id uuid not null',
    ok: ', organization_id uuid not null references organizations (id)',
  }[column];
  const run = (statement: string) => tx.execute(sql.raw(statement));

  await run(
    `create table ${name} (id uuid primary key default gen_random_uuid()${organizationColumn}${
      column === 'none' ? '' : `, unique (organization_id, id)`
    })`,
  );
  if (index && column !== 'none') await run(`create index on ${name} (organization_id)`);
  if (!index && column !== 'none') {
    // The unique constraint also starts with organization_id: drop it so the index is truly missing.
    await run(`alter table ${name} drop constraint ${name}_organization_id_id_key`);
  }
  if (rls !== 'off') await run(`alter table ${name} enable row level security`);
  if (rls === 'forced') await run(`alter table ${name} force row level security`);

  const scope = 'organization_id = any (app_workspace_ids())';
  const policies = {
    standard: `create policy ${name}_workspace on ${name} to fivvi_app using (${scope}) with check (${scope})`,
    'read-only': `create policy ${name}_workspace on ${name} for select to fivvi_app using (${scope})`,
    'no-check': `create policy ${name}_workspace on ${name} to fivvi_app using (${scope})`,
    'other-column': `create policy ${name}_workspace on ${name} to fivvi_app using (id = any (app_workspace_ids())) with check (id = any (app_workspace_ids()))`,
    'other-role': `create policy ${name}_workspace on ${name} to public using (${scope}) with check (${scope})`,
    open: `create policy ${name}_workspace on ${name} to fivvi_app using (true) with check (true)`,
    none: null,
  }[policy];
  if (policies) await run(policies);
  if (extra)
    await run(`create policy ${name}_extra on ${name} for select to fivvi_app using (true)`);
}
