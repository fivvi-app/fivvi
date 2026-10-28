import { randomBytes } from 'node:crypto';
import { createDatabase, type DatabaseClient, inspectConnectionRole } from '@fivvi/database';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StartupError, verifyStartup } from '../src/index.ts';

// Throw-away roles on the test server: a unique name per run, dropped afterwards. The password is
// obviously fake.
const PASSWORD = 'fake-startup-test-password';
const SUFFIX = randomBytes(4).toString('hex');
const roleName = (kind: string) => `fivvi_startup_${kind}_${SUFFIX}`;

describe('E011 the API checks its database role at start-up', () => {
  let database: TestDatabase;
  let privileged: DatabaseClient;
  const connections: DatabaseClient[] = [];
  const roles: string[] = [];

  /** A role with `attributes` on the test server, and the URL of this database as that role. */
  async function roleUrl(
    kind: string,
    attributes: string,
    setUp?: (role: string) => Promise<void>,
  ) {
    const role = roleName(kind);
    roles.push(role);
    await privileged.db.execute(
      sql.raw(`create role "${role}" login ${attributes} password '${PASSWORD}'`),
    );
    await setUp?.(role);
    const url = new URL(database.url);
    url.username = role;
    url.password = PASSWORD;
    return url.toString();
  }

  /** Starts the API as the login of `url`, the way apps/web wires its start-up check. */
  async function start(url: string) {
    const client = createDatabase({ url, maxConnections: 1 });
    connections.push(client);
    await verifyStartup({ inspectDatabaseRole: () => inspectConnectionRole(client.db) });
  }

  const refusal = (url: string) =>
    start(url).then(
      () => undefined,
      (error: Error) => error,
    );

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    privileged = createDatabase({ url: database.url, maxConnections: 2 });
  });

  afterAll(async () => {
    await Promise.all(connections.map((client) => client.close()));
    await privileged?.close();
    await database?.drop();
    // The cluster's roles outlive the database. Dropped on the server, after the database is gone.
    const server = createDatabase({ url: new URL('/postgres', database.url).toString() });
    try {
      for (const role of roles) await server.db.execute(sql.raw(`drop role if exists "${role}"`));
    } finally {
      await server.close();
    }
  });

  it('AC4: refuses to start with a privileged connection role', async () => {
    const [{ rolname: owner }] = (
      await privileged.db.execute<{ rolname: string }>(sql`select current_user as rolname`)
    ).rows as [{ rolname: string }];
    const cases: [string, string, string, (role: string) => Promise<void>][] = [
      ['superuser', 'superuser', 'is a superuser', async () => {}],
      ['bypassrls', 'bypassrls', 'has BYPASSRLS', async () => {}],
      [
        'owner',
        '',
        'owns a table',
        async (role) => {
          await privileged.db.execute(sql.raw('create table public.startup_probe (id int)'));
          await privileged.db.execute(
            sql.raw(`alter table public.startup_probe owner to "${role}"`),
          );
        },
      ],
      [
        'member',
        '',
        `is a member of "${owner}"`,
        async (role) => {
          await privileged.db.execute(sql.raw(`grant "${owner}" to "${role}"`));
        },
      ],
      ['createrole', 'createrole', 'can create roles', async () => {}],
    ];

    for (const [kind, attributes, why, setUp] of cases) {
      const url = await roleUrl(kind, attributes, setUp);

      const error = await refusal(url);

      expect(error, kind).toBeInstanceOf(StartupError);
      expect(error?.message, kind).toContain('Refusing to start');
      expect(error?.message, kind).toContain(why);
      // The message says why and where to fix it, never the connection string.
      expect(error?.message, kind).not.toContain(PASSWORD);
      expect(error?.message, kind).not.toContain(url);
      expect(error?.message, kind).toContain('APP_DATABASE_URL');
    }
  });

  it('AC4: starts with the app role', async () => {
    await expect(start(database.appUrl)).resolves.toBeUndefined();
  });

  it('refuses to start when the role cannot log in, without the connection string', async () => {
    const url = new URL(database.appUrl);
    url.password = 'fake-wrong-password-for-the-test';

    const error = await refusal(url.toString());

    expect(error).toBeInstanceOf(StartupError);
    expect(error?.message).toMatch(/could not be checked/);
    expect(error?.message).not.toContain('fake-wrong-password');
    expect(error?.message).not.toContain('localhost');
    expect(error?.message).not.toContain('fivvi_app');
  });
});
