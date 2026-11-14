import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cloneTemplateDatabase,
  createTestDatabase,
  type TestDatabase,
} from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createTenantScopes,
  createWorkspaceWithOwner,
  type DatabaseClient,
  type DatabaseExecutor,
  findJoinLink,
  organizations,
  renewJoinLink,
} from '../src/index.ts';
import { migrationsFolder, runMigrations } from '../src/migrate.ts';
import {
  addTeamRole,
  createAccount,
  createWorkspace,
  testDefaultOffers,
} from '../src/testing/index.ts';

// The join link of a workspace (F029, spec #484, ticket #898): the code and its renewal time on
// `organizations`, the backfill of the older workspaces, and the two repository functions, as the
// app role where RLS applies. Synthetic: John's Gym and Fit Studio.

// Crockford's base32 (no I, L, O, U), 8 characters: `JOIN_CODE_ALPHABET` of @fivvi/domain, which this
// package does not depend on; the API tests compare the two.
const CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

async function rows<T>(db: DatabaseExecutor, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

describe('F029 the join code of a workspace', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 6 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  const scopes = () => createTenantScopes(() => app.db);

  async function codeOf(workspaceId: string) {
    const [row] = await admin.db
      .select({ code: organizations.joinCode, renewedAt: organizations.joinLinkRenewedAt })
      .from(organizations)
      .where(eq(organizations.id, workspaceId));
    if (!row) throw new Error('no such workspace');
    return row;
  }

  it('a new workspace gets a code of 8 unambiguous Crockford characters and has not been renewed', async () => {
    const john = await createAccount(admin.db, { label: 'john' });

    const created = await scopes().inAccountScope(
      { accountId: john.id, workspaces: 'team' },
      (scope) =>
        createWorkspaceWithOwner(scope, {
          name: "John's Gym",
          slug: `johns-gym-${john.marker}`,
          defaultLocale: 'nl-NL',
          timeZone: 'Europe/Amsterdam',
          ownerTrains: false,
          defaultOffers: testDefaultOffers(),
        }),
    );

    const stored = await codeOf(created?.id ?? '');
    expect(stored.code).toMatch(CODE);
    expect(stored.renewedAt).toBeNull();
  });

  it('codes are unique and use the whole alphabet, 400 draws', async () => {
    const codes = new Set<string>();
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const [row] = await rows<{ code: string }>(admin.db, sql`select new_join_code() as code`);
      codes.add(row?.code ?? '');
      for (const character of row?.code ?? '') seen.add(character);
    }
    expect(codes.size).toBe(400);
    for (const code of codes) expect(code).toMatch(CODE);
    // 3 200 draws of 32 symbols: a symbol the function never makes would show. Every symbol is in
    // the format above, so 32 different ones are the whole alphabet.
    expect(seen.size).toBe(32);
  });

  it('the database refuses a code that is not in the format, and a code another workspace has', async () => {
    const first = await createWorkspace(admin.db, { label: 'first' });
    const second = await createWorkspace(admin.db, { label: 'second' });
    const { code } = await codeOf(first.id);

    const attempt = (value: string) =>
      admin.db.execute(sql`update organizations set join_code = ${value} where id = ${second.id}`);

    await expect(attempt('7KQ2M9X')).rejects.toThrow();
    await expect(attempt('7KQ2M9XAA')).rejects.toThrow();
    await expect(attempt('7kq2m9xa')).rejects.toThrow();
    await expect(attempt('7KQ2M9XI')).rejects.toThrow();
    await expect(attempt('7KQ2M9XU')).rejects.toThrow();
    await expect(attempt(code)).rejects.toThrow();
    await attempt('7KQ2M9XA');
    expect((await codeOf(second.id)).code).toBe('7KQ2M9XA');
  });

  it('AC6: findJoinLink answers the code and the renewal time of the scope’s workspace only', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const studio = await createWorkspace(admin.db, { label: 'fit-studio' });
    const john = await createAccount(admin.db, { label: 'john' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });

    const found = await scopes().inWorkspaceScope(
      { accountId: john.id, workspaceId: gym.id, admit: () => 'team' },
      (scope) => findJoinLink(scope),
    );

    const gymCode = (await codeOf(gym.id)).code;
    const studioCode = (await codeOf(studio.id)).code;
    expect(gymCode).toMatch(CODE);
    expect(found).toEqual({ status: 'entered', value: await codeOf(gym.id) });
    expect(found).not.toEqual({ status: 'entered', value: await codeOf(studio.id) });
    expect(studioCode).not.toBe(gymCode);
  });

  it('AC6: renewJoinLink replaces the code, stores the time, and the old code is nowhere', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const studio = await createWorkspace(admin.db, { label: 'fit-studio' });
    const john = await createAccount(admin.db, { label: 'john' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
    const before = await codeOf(gym.id);
    const studioBefore = await codeOf(studio.id);
    const now = new Date('2026-11-10T10:00:00Z');

    let renewed: Awaited<ReturnType<typeof renewJoinLink>>;
    let read: Awaited<ReturnType<typeof findJoinLink>>;
    await scopes().inWorkspaceScope(
      { accountId: john.id, workspaceId: gym.id, admit: () => 'team' },
      async (scope) => {
        renewed = await renewJoinLink(scope, now);
        read = await findJoinLink(scope);
      },
    );

    expect(renewed).toEqual({ code: expect.stringMatching(CODE), renewedAt: now });
    expect(renewed?.code).not.toBe(before.code);
    expect(read).toEqual(renewed);
    expect(await codeOf(gym.id)).toEqual({ code: renewed?.code, renewedAt: now });
    // The old code names no workspace any more, and the other workspace is untouched.
    const holders = await rows<{ id: string }>(
      admin.db,
      sql`select id from organizations where join_code = ${before.code}`,
    );
    expect(holders).toEqual([]);
    expect(await codeOf(studio.id)).toEqual(studioBefore);
  });
});

describe('F029 the backfill', () => {
  it('gives every workspace that exists before the join code its own code', async () => {
    const tag = '0027_organizations_join_code';
    const journal = JSON.parse(
      await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] };
    const index = journal.entries.findIndex((entry) => entry.tag === tag);
    expect(index).toBeGreaterThanOrEqual(0);

    const previous = await mkdtemp(join(tmpdir(), 'fivvi-migrations-'));
    const database = await createTestDatabase();
    const client = createDatabase({ url: database.url, maxConnections: 2 });
    try {
      await cp(migrationsFolder, previous, { recursive: true });
      // The journal cut just before the join code: the workspaces have none yet.
      await writeFile(
        join(previous, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, index) }),
      );
      await migrate(client.db, { migrationsFolder: previous });
      await client.db.execute(
        sql`insert into organizations (name, slug, default_locale, time_zone)
            select 'Older ' || n, 'older-' || n, 'nl-NL', 'Europe/Amsterdam'
            from generate_series(1, 50) as n`,
      );

      await runMigrations(client.db);

      const stored = await rows<{ join_code: string; join_link_renewed_at: Date | null }>(
        client.db,
        sql`select join_code, join_link_renewed_at from organizations`,
      );
      expect(stored).toHaveLength(50);
      for (const row of stored) {
        expect(row.join_code).toMatch(CODE);
        expect(row.join_link_renewed_at).toBeNull();
      }
      expect(new Set(stored.map((row) => row.join_code)).size).toBe(50);
    } finally {
      await client.close();
      await database.drop();
      await rm(previous, { recursive: true, force: true });
    }
  });
});
