import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import {
  cloneTemplateDatabase,
  createTestDatabase,
  createTestPool,
  type TestDatabase,
  withRollback,
} from '../src/database.ts';
import { appRoleUrl, databaseUrl, onServer } from '../src/database-server.ts';

interface Connected {
  database: TestDatabase;
  db: NodePgDatabase;
  close(): Promise<void>;
}

function connect(database: TestDatabase): Connected {
  const pool = createTestPool(database.url, { max: 2 });
  return { database, db: drizzle({ client: pool }), close: () => pool.close() };
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
    const run = inject('fivviTestRun');
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

describe('E011 test roles', () => {
  it('AC18: the setup creates the app role once per server, so every clone shares it', async () => {
    const clone = await cloneTemplateDatabase();
    const app = new pg.Client({ connectionString: appRoleUrl(clone.name) });
    try {
      await app.connect();
      const { rows } = await app.query(
        'select current_user as name, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb from pg_roles where rolname = current_user',
      );
      expect(rows).toEqual([
        {
          name: 'fivvi_app',
          rolsuper: false,
          rolbypassrls: false,
          rolcreaterole: false,
          rolcreatedb: false,
        },
      ]);
    } finally {
      await app.end();
      await clone.drop();
    }
  });

  it('AC18: the app role is a different role from the one that created the template', async () => {
    const clone = await cloneTemplateDatabase();
    try {
      expect(clone.appUrl).toBe(appRoleUrl(clone.name));
      expect(new URL(clone.appUrl).username).toBe('fivvi_app');
      expect(new URL(clone.url).username).not.toBe('fivvi_app');
    } finally {
      await clone.drop();
    }
  });
});

// #1443: a pool of a test file must not turn the end of its database into an unhandled error.
// `pool.end()` returns before the sockets are closed, and an idle client keeps the pool's
// listener, so a backend ended by `DROP DATABASE ... WITH (FORCE)` or `pg_terminate_backend`
// reached Vitest as `57P01 terminating connection due to administrator command`.
describe('E002 #1443 test pools', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
  });

  afterAll(async () => {
    await database?.drop();
  });

  it('survives the backend of an idle client being terminated, and serves the next query', async () => {
    // No error listener of its own: Vitest fails the run on an unhandled error (as in CI).
    const pool = createTestPool(database.url, { max: 1 });
    try {
      const { rows } = await pool.query<{ pid: number }>('select pg_backend_pid() as pid');
      const pid = rows[0]?.pid;
      expect(pool.idleCount).toBe(1);

      await onServer({ text: 'select pg_terminate_backend($1)', values: [pid] });
      await vi.waitFor(() => expect(pool.totalCount).toBe(0));

      const next = await pool.query<{ pid: number }>('select pg_backend_pid() as pid');
      expect(next.rows[0]?.pid).not.toBe(pid);
    } finally {
      await pool.close();
    }
  });

  it('closes its connections before close() resolves, so dropping the database ends none', async () => {
    const pool = createTestPool(database.url, { max: 2 });
    const clients: pg.PoolClient[] = [];
    const ended: string[] = [];
    pool.on('connect', (client) => {
      clients.push(client);
      client.once('end', () => ended.push('end'));
    });
    await Promise.all([pool.query('select 1'), pool.query('select pg_sleep(0.05)')]);
    expect(clients.length).toBeGreaterThan(0);

    await pool.close();

    expect(ended).toHaveLength(clients.length);
  });
});
