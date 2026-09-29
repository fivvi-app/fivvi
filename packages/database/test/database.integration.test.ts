import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  type DatabaseClient,
  findSystemGreeting,
  systemGreetings,
} from '../src/index.ts';
import { migrationsFolder, runMigrations } from '../src/migrate.ts';
import { HELLO_GREETING, seed } from '../src/seed.ts';
import { createTestDatabase, type TestDatabase } from './support/test-database.ts';

/**
 * Tables that are not business data and therefore have no `organization_id`.
 * Adding a table here needs a reason in the PR (AGENTS.md, ADR-006).
 */
const NON_BUSINESS_TABLES = ['system_greetings'];

interface Journal {
  entries: { tag: string }[];
}

async function readJournal(folder: string): Promise<Journal> {
  return JSON.parse(await readFile(join(folder, 'meta', '_journal.json'), 'utf8')) as Journal;
}

async function rows<T>(client: DatabaseClient, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await client.db.execute(query)).rows as T[];
}

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

  it('records every committed migration as applied', async () => {
    await withFreshDatabase(async (client) => {
      await runMigrations(client.db);

      const journal = await readJournal(migrationsFolder);
      const applied = await rows<{ count: number }>(
        client,
        sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
      );
      expect(journal.entries.length).toBeGreaterThan(0);
      expect(applied[0]?.count).toBe(journal.entries.length);
    });
  });

  it('applies the latest migration on top of the previous version', async () => {
    const journal = await readJournal(migrationsFolder);
    const previous = await mkdtemp(join(tmpdir(), 'trainer-hub-migrations-'));
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
        client,
        sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
      );
      expect(applied[0]?.count).toBe(journal.entries.length);
    });
  });
});

describe('E004 database', () => {
  let database: TestDatabase;
  let client: DatabaseClient;

  beforeAll(async () => {
    database = await createTestDatabase();
    client = createDatabase({ url: database.url, maxConnections: 2 });
    await runMigrations(client.db);
  });

  afterEach(async () => {
    await client.db.delete(systemGreetings);
  });

  afterAll(async () => {
    await client?.close();
    await database?.drop();
  });

  describe('seed', () => {
    it('is idempotent', async () => {
      await seed(client.db);
      await seed(client.db);

      expect(await client.db.$count(systemGreetings)).toBe(1);
      expect(await findSystemGreeting(client.db, 'hello')).toEqual(HELLO_GREETING);
    });

    it('restores a changed greeting when run again', async () => {
      await seed(client.db);
      await client.db.update(systemGreetings).set({ i18nKey: 'system.changed' });

      await seed(client.db);

      expect(await findSystemGreeting(client.db, 'hello')).toEqual(HELLO_GREETING);
    });

    it('stores the greeting as an i18n key, not as copy', async () => {
      await seed(client.db);

      const [row] = await client.db.select().from(systemGreetings);
      expect(row?.i18nKey).toBe('system.hello');
    });
  });

  describe('system greetings', () => {
    it('returns undefined for an unknown slug', async () => {
      await seed(client.db);

      expect(await findSystemGreeting(client.db, 'goodbye')).toBeUndefined();
    });

    it.each(['Hallo, welkom bij Trainer Hub!', 'hello', 'system hello'])(
      'rejects %j as an i18n key',
      async (i18nKey) => {
        await expect(
          client.db.insert(systemGreetings).values({ slug: 'hello', i18nKey }),
        ).rejects.toMatchObject({ cause: { constraint: 'system_greetings_i18n_key_format' } });
      },
    );

    it('refreshes updated_at on update and keeps created_at', async () => {
      const longAgo = new Date('2000-01-01T00:00:00Z');
      await client.db
        .insert(systemGreetings)
        .values({ ...HELLO_GREETING, createdAt: longAgo, updatedAt: longAgo });

      await client.db.update(systemGreetings).set({ i18nKey: 'system.helloAgain' });

      const [row] = await client.db.select().from(systemGreetings);
      expect(row?.createdAt).toEqual(longAgo);
      expect(row?.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime());
    });
  });

  describe('conventions', () => {
    it('runs every session in UTC', async () => {
      const [setting] = await rows<{ TimeZone: string }>(client, sql`show timezone`);
      expect(setting?.TimeZone).toBe('UTC');
    });

    it('stores every timestamp column as timestamptz', async () => {
      const columns = await rows<{ table_name: string; column_name: string; data_type: string }>(
        client,
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
        client,
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
      const tables = await publicTables(client);
      expect(keys.map((key) => key.table_name).sort()).toEqual(tables);
      for (const key of keys) {
        expect(key, key.table_name).toMatchObject({ columns: ['id'], types: ['uuid'] });
      }
    });

    it('puts organization_id on every business table', async () => {
      const tables = await publicTables(client);
      const withOrganization = await rows<{ table_name: string }>(
        client,
        sql`select table_name from information_schema.columns
            where table_schema = 'public' and column_name = 'organization_id'`,
      );
      const scoped = new Set(withOrganization.map((row) => row.table_name));

      // The allow-list must only name tables that exist.
      expect(tables).toEqual(expect.arrayContaining(NON_BUSINESS_TABLES));
      const unscoped = tables.filter(
        (table) => !scoped.has(table) && !NON_BUSINESS_TABLES.includes(table),
      );
      expect(unscoped).toEqual([]);
    });
  });
});

async function publicTables(client: DatabaseClient): Promise<string[]> {
  const tables = await rows<{ table_name: string }>(
    client,
    sql`select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
  );
  return tables.map((row) => row.table_name);
}
