import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authUsers,
  claimWorkspaceCreation,
  createDatabase,
  createTenantScopes,
  createWorkspaceWithOwner,
  type DatabaseClient,
  listMyWorkspaces,
  listTeamWorkspaces,
  organizations,
  teamMembers,
} from '../src/index.ts';
import { addClient, addTeamRole, createAccount, createWorkspace } from '../src/testing/index.ts';

// The repository functions that create a workspace (F002, #277, ADR-022) as the app role: RLS
// applies, so a create has to put the new workspace in the request's context before it inserts.

const DEFAULTS = { defaultLocale: 'nl-NL', timeZone: 'Europe/Amsterdam' } as const;

describe('F002 creating a workspace', () => {
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

  it('AC1: makes the workspace, the owner’s team role and the account’s name in one go, under RLS', async () => {
    const account = await createAccount(admin.db, { label: 'sarah' });

    const created = await scopes().inAccountScope(
      { accountId: account.id, workspaces: 'team' },
      async (scope) => {
        const claim = await claimWorkspaceCreation(scope);
        const workspace = await createWorkspaceWithOwner(scope, {
          ...DEFAULTS,
          name: "John's Gym",
          slug: 'johns-gym',
          ownerName: 'Sarah',
        });
        return { claim, workspace, places: await listMyWorkspaces(scope) };
      },
    );

    expect(created.claim).toEqual({ hasTeamRole: false });
    expect(created.workspace).toEqual({
      id: expect.any(String),
      name: "John's Gym",
      slug: 'johns-gym',
      defaultLocale: 'nl-NL',
      timeZone: 'Europe/Amsterdam',
    });
    const [row] = await admin.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'johns-gym'));
    expect(row).toMatchObject({ id: created.workspace?.id, name: "John's Gym" });
    const roles = await admin.db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.accountId, account.id));
    expect(roles).toEqual([
      expect.objectContaining({ organizationId: created.workspace?.id, role: 'owner' }),
    ]);
    const [user] = await admin.db.select().from(authUsers).where(eq(authUsers.id, account.id));
    expect(user?.name).toBe('Sarah');
  });

  it('leaves the account’s name alone when none is given', async () => {
    const account = await createAccount(admin.db, { label: 'kept' });
    const before = (await admin.db.select().from(authUsers).where(eq(authUsers.id, account.id)))[0]
      ?.name;

    await scopes().inAccountScope({ accountId: account.id, workspaces: 'team' }, (scope) =>
      createWorkspaceWithOwner(scope, { ...DEFAULTS, name: 'No Name Gym', slug: 'no-name-gym' }),
    );

    const [user] = await admin.db.select().from(authUsers).where(eq(authUsers.id, account.id));
    expect(user?.name).toBe(before);
  });

  it('AC2: a slug that is taken gives undefined and creates nothing, even one the account can’t see', async () => {
    const other = await createWorkspace(admin.db);
    const taken = (
      await admin.db.select().from(organizations).where(eq(organizations.id, other.id))
    )[0]?.slug as string;
    const account = await createAccount(admin.db, { label: 'late' });

    const result = await scopes().inAccountScope(
      { accountId: account.id, workspaces: 'team' },
      async (scope) => ({
        refused: await createWorkspaceWithOwner(scope, { ...DEFAULTS, name: 'Late', slug: taken }),
        places: await listMyWorkspaces(scope),
      }),
    );

    expect(result.refused).toBeUndefined();
    expect(result.places).toEqual([]);
    expect(await admin.db.$count(teamMembers, eq(teamMembers.accountId, account.id))).toBe(0);
    expect(await admin.db.$count(organizations, eq(organizations.slug, taken))).toBe(1);
  });

  it('AC1: a failure after the create leaves nothing behind', async () => {
    const account = await createAccount(admin.db, { label: 'rolled' });

    await expect(
      scopes().inAccountScope({ accountId: account.id, workspaces: 'team' }, async (scope) => {
        await createWorkspaceWithOwner(scope, {
          ...DEFAULTS,
          name: 'Rolled Back',
          slug: 'rolled-back',
          ownerName: 'Gone',
        });
        throw new Error('the request failed');
      }),
    ).rejects.toThrow('the request failed');

    expect(await admin.db.$count(organizations, eq(organizations.slug, 'rolled-back'))).toBe(0);
    expect(await admin.db.$count(teamMembers, eq(teamMembers.accountId, account.id))).toBe(0);
    const [user] = await admin.db.select().from(authUsers).where(eq(authUsers.id, account.id));
    expect(user?.name).not.toBe('Gone');
  });

  it('AC4: the claim sees a team role the account has in any workspace', async () => {
    const workspace = await createWorkspace(admin.db);
    const account = await createAccount(admin.db, { label: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: workspace.id, accountId: account.id });

    const claim = await scopes().inAccountScope(
      { accountId: account.id, workspaces: 'team' },
      (scope) => claimWorkspaceCreation(scope),
    );

    expect(claim).toEqual({ hasTeamRole: true });
  });

  it('AC4: two requests of one account at once create one workspace, not two', async () => {
    const account = await createAccount(admin.db, { label: 'twice' });
    const attempt = (slug: string) =>
      scopes().inAccountScope({ accountId: account.id, workspaces: 'team' }, async (scope) => {
        const { hasTeamRole } = await claimWorkspaceCreation(scope);
        if (hasTeamRole) return 'refused';
        await createWorkspaceWithOwner(scope, { ...DEFAULTS, name: slug, slug });
        return 'created';
      });

    const results = await Promise.all([attempt('twice-one'), attempt('twice-two')]);

    expect(results.toSorted()).toEqual(['created', 'refused']);
    expect(await admin.db.$count(teamMembers, eq(teamMembers.accountId, account.id))).toBe(1);
  });

  it('two accounts that want the same slug at once: one gets it, the other is told it is taken', async () => {
    const [one, two] = await Promise.all([
      createAccount(admin.db, { label: 'race-one' }),
      createAccount(admin.db, { label: 'race-two' }),
    ]);
    const attempt = (accountId: string) =>
      scopes().inAccountScope({ accountId, workspaces: 'team' }, (scope) =>
        createWorkspaceWithOwner(scope, { ...DEFAULTS, name: 'Race', slug: 'race' }),
      );

    const results = await Promise.all([attempt(one.id), attempt(two.id)]);

    expect(results.filter((result) => result !== undefined)).toHaveLength(1);
    expect(await admin.db.$count(organizations, eq(organizations.slug, 'race'))).toBe(1);
  });

  it('AC11: lists the workspaces the account has a team role in, and no other', async () => {
    const owned = await createWorkspace(admin.db);
    const clientOf = await createWorkspace(admin.db);
    const stranger = await createWorkspace(admin.db);
    const account = await createAccount(admin.db, { label: 'lister' });
    await addTeamRole(admin.db, { workspaceId: owned.id, accountId: account.id, role: 'owner' });
    await addClient(admin.db, { workspaceId: clientOf.id, accountId: account.id });

    const listed = await scopes().inAccountScope(
      { accountId: account.id, workspaces: 'team' },
      (scope) => listTeamWorkspaces(scope),
    );
    // Even a scope that holds a client's workspace lists team workspaces only.
    const fromAny = await scopes().inAccountScope(
      { accountId: account.id, workspaces: 'any' },
      (scope) => listTeamWorkspaces(scope),
    );

    const [row] = await admin.db.select().from(organizations).where(eq(organizations.id, owned.id));
    expect(listed).toEqual([{ id: owned.id, name: row?.name, slug: row?.slug }]);
    expect(fromAny).toEqual(listed);
    expect(JSON.stringify([listed, fromAny])).not.toContain(stranger.id);
    expect(JSON.stringify([listed, fromAny])).not.toContain(clientOf.id);
  });

  it('AC11: an account without a team role has an empty list', async () => {
    const account = await createAccount(admin.db, { label: 'nobody' });

    const listed = await scopes().inAccountScope(
      { accountId: account.id, workspaces: 'team' },
      (scope) => listTeamWorkspaces(scope),
    );

    expect(listed).toEqual([]);
  });
});
