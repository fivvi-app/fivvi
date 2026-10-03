import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  cloneTemplateDatabase,
  createTestDatabase,
  type TestDatabase,
  withRollback,
} from '../src/database.ts';
import { databaseUrl } from '../src/database-server.ts';

interface Connected {
  database: TestDatabase;
  db: NodePgDatabase;
  close(): Promise<void>;
}

function connect(database: TestDatabase): Connected {
  const pool = new pg.Pool({ connectionString: database.url, max: 2 });
  return { database, db: drizzle({ client: pool }), close: () => pool.end() };
}

async function labels(db: Pick<NodePgDatabase, 'execute'>): Promise<string[]> {
  const result = await db.execute<{ label: string }>(sql`select label from fixture order by id`);
  return result.rows.map((row) => row.label);
}

async function exists(name: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: databaseUrl('postgres') });
  await client.connect();
  try {
    const result = await client.query('select 1 from pg_database where datname = $1', [name]);
    return result.rowCount === 1;
  } finally {
    await client.end();
  }
}

describe('E010 template database', () => {
  it('gives every clone the migrated schema and data', async () => {
    const clone = connect(await cloneTemplateDatabase());
    try {
      expect(await labels(clone.db)).toEqual(['from the template']);
    } finally {
      await clone.close();
      await clone.database.drop();
    }
  });

  it('isolates clones from each other', async () => {
    const [a, b] = await Promise.all([
      cloneTemplateDatabase().then(connect),
      cloneTemplateDatabase().then(connect),
    ]);
    try {
      await a.db.execute(sql`insert into fixture values (2, 'only in a')`);

      expect(await labels(a.db)).toEqual(['from the template', 'only in a']);
      expect(await labels(b.db)).toEqual(['from the template']);
    } finally {
      await Promise.all([a.close(), b.close()]);
      await Promise.all([a.database.drop(), b.database.drop()]);
    }
  });

  it('refuses connections to the template itself', async () => {
    const run = inject('trainerHubTestRun');
    const client = new pg.Client({ connectionString: databaseUrl(run?.templateName ?? '') });

    await expect(client.connect()).rejects.toMatchObject({ code: '55000' });
  });

  it('creates an empty database for migration tests', async () => {
    const empty = connect(await createTestDatabase());
    try {
      await expect(labels(empty.db)).rejects.toMatchObject({ cause: { code: '42P01' } });
    } finally {
      await empty.close();
      await empty.database.drop();
    }
  });

  it('drops a database', async () => {
    const database = await createTestDatabase();
    expect(await exists(database.name)).toBe(true);

    await database.drop();

    expect(await exists(database.name)).toBe(false);
  });
});

describe('E010 withRollback', () => {
  let clone: Connected;

  beforeAll(async () => {
    clone = connect(await cloneTemplateDatabase());
  });

  afterAll(async () => {
    await clone?.close();
    await clone?.database.drop();
  });

  it('sees its own writes and leaves the database unchanged', async () => {
    const inside = await withRollback(clone.db, async (tx) => {
      await tx.execute(sql`insert into fixture values (2, 'rolled back')`);
      return labels(tx);
    });

    expect(inside).toEqual(['from the template', 'rolled back']);
    expect(await labels(clone.db)).toEqual(['from the template']);
  });

  it('rethrows a failing test and still rolls back', async () => {
    await expect(
      withRollback(clone.db, async (tx) => {
        await tx.execute(sql`insert into fixture values (3, 'also rolled back')`);
        throw new Error('assertion failed');
      }),
    ).rejects.toThrow('assertion failed');

    expect(await labels(clone.db)).toEqual(['from the template']);
  });

  it('keeps transaction-local settings inside the test (the RLS context model, E011)', async () => {
    const setting = sql`select current_setting('app.organization_id', true) as value`;

    const inside = await withRollback(clone.db, async (tx) => {
      await tx.execute(sql`select set_config('app.organization_id', 'org-a', true)`);
      return (await tx.execute<{ value: string }>(setting)).rows[0]?.value;
    });

    expect(inside).toBe('org-a');
    const after = (await clone.db.execute<{ value: string | null }>(setting)).rows[0]?.value;
    expect(after ?? '').toBe('');
  });
});
