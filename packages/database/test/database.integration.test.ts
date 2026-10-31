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
  HELLO_GREETING,
  organizations,
  pingDatabase,
  systemGreetings,
  teamMembers,
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
      // Each run migrates and reports the app role; the second also seeds. No password is set
      // here, so the role is left as it is (E011).
      const roleLog = expect.stringMatching(
        /^App role fivvi_app: APP_DATABASE_PASSWORD is not set/,
      );
      expect(logs).toEqual([
        'Migrations applied.',
        roleLog,
        'Migrations applied.',
        roleLog,
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

  describe('F006 seed clients', () => {
    it('AC15: gives John’s Gym a few synthetic clients, one without an email address, once', async () => {
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
        expect(seeded.filter(({ email }) => email === null)).toHaveLength(1);
        for (const { email } of seeded) {
          if (email !== null) expect(email).toMatch(/^[a-z.]+@example\.com$/);
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
        expect(await tx.$count(authUsers)).toBe(2);
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
        expect(await client.db.$count(authUsers)).toBe(2);
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
        expect(await tx.$count(teamMembers)).toBe(3);
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
