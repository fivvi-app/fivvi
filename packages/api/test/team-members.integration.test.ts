import { readFileSync } from 'node:fs';
import {
  authSessions,
  authUsers,
  clients,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  teamMembers,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F003 (spec #171), the first slice: the Owner lists the team of a workspace and removes a
// trainer from it. The API runs as the app role, so RLS applies; the data is read back through
// the privileged connection. Synthetic people: John (Owner) and Sarah (Trainer) of one gym, Mike
// (Owner) of another.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

interface TeamMemberBody {
  id: string;
  name: string;
  email: string;
  role: string;
}

describe('F003 team list and removal', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 12 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  function api(overrides: Partial<ApiDependencies> = {}) {
    return createApp({
      ...NO_DEPENDENCIES,
      // The sign-in session is a boundary of its own (F001's tests cover it): a header names who calls.
      findSignedInAccount: async (headers) => {
        const id = headers.get('x-test-account');
        if (!id) return undefined;
        const [row] = await admin.db
          .select({
            id: authUsers.id,
            email: authUsers.email,
            name: authUsers.name,
            preferredLocale: authUsers.preferredLocale,
          })
          .from(authUsers)
          .where(eq(authUsers.id, id));
        return row satisfies SignedInAccount | undefined;
      },
      tenantScopes: createTenantScopes(() => app.db),
      ...overrides,
    });
  }

  /** A gym with John (Owner) and Sarah (Trainer), and Mike, Owner of another workspace. */
  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    const john = await createAccount(admin.db, { label: 'john' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    await admin.db.update(authUsers).set({ name: 'Sarah' }).where(eq(authUsers.id, sarah.id));
    await admin.db.update(authUsers).set({ name: 'John' }).where(eq(authUsers.id, john.id));
    const johnRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: john.id,
      role: 'owner',
    });
    const sarahRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: sarah.id,
      role: 'trainer',
    });
    const mikeRole = await addTeamRole(admin.db, {
      workspaceId: other.id,
      accountId: mike.id,
      role: 'owner',
    });
    return { gym, other, john, sarah, mike, johnRole, sarahRole, mikeRole };
  }

  const list = (
    workspaceId: string,
    who: { id: string } | undefined,
    server: ReturnType<typeof api> = api(),
  ) =>
    server.request(`/v1/workspaces/${workspaceId}/team-members`, {
      headers: who ? { 'x-test-account': who.id } : {},
    });

  const remove = (
    workspaceId: string,
    teamMemberId: string,
    who: { id: string } | undefined,
    server: ReturnType<typeof api> = api(),
  ) =>
    server.request(`/v1/workspaces/${workspaceId}/team-members/${teamMemberId}`, {
      method: 'DELETE',
      headers: who ? { 'x-test-account': who.id } : {},
    });

  const teamOf = async (workspaceId: string) =>
    (
      await admin.db
        .select({ id: teamMembers.id, role: teamMembers.role })
        .from(teamMembers)
        .where(eq(teamMembers.organizationId, workspaceId))
    ).toSorted((a, b) => a.id.localeCompare(b.id));

  it('AC1: one team-member record per account and workspace (unique constraint)', async () => {
    const { gym, sarah } = await world();

    await expect(
      admin.db
        .insert(teamMembers)
        .values({ organizationId: gym.id, accountId: sarah.id, role: 'owner' }),
    ).rejects.toMatchObject({
      cause: { code: '23505', constraint: 'team_members_organization_id_account_id_unique' },
    });
    expect(await teamOf(gym.id)).toHaveLength(2);
  });

  it('AC2: Owner lists only their workspace’s team, by name, with email and role', async () => {
    const { gym, john, sarah, johnRole, sarahRole } = await world();

    const response = await list(gym.id, john);

    expect(response.status).toBe(200);
    expect((await response.json()) as TeamMemberBody[]).toEqual([
      { id: johnRole.id, name: 'John', email: john.email, role: 'owner' },
      { id: sarahRole.id, name: 'Sarah', email: sarah.email, role: 'trainer' },
    ]);
  });

  it('AC3: Trainer gets 403 on the team list and on removal, and nothing changes', async () => {
    const { gym, sarah, johnRole, sarahRole } = await world();
    const before = await teamOf(gym.id);

    const listed = await list(gym.id, sarah);
    const removedOwner = await remove(gym.id, johnRole.id, sarah);
    const removedSelf = await remove(gym.id, sarahRole.id, sarah);

    for (const response of [listed, removedOwner, removedSelf]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: 'forbidden' });
    }
    expect(await teamOf(gym.id)).toEqual(before);
  });

  it('AC4: removal deletes only the team-member record; the account and its sessions stay', async () => {
    const { gym, john, sarah, sarahRole } = await world();
    await admin.db.insert(authSessions).values({
      userId: sarah.id,
      token: `token-${sarah.marker}`,
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const response = await remove(gym.id, sarahRole.id, john);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect((await teamOf(gym.id)).map(({ role }) => role)).toEqual(['owner']);
    expect(await admin.db.select().from(authUsers).where(eq(authUsers.id, sarah.id))).toHaveLength(
      1,
    );
    expect(
      await admin.db.select().from(authSessions).where(eq(authSessions.userId, sarah.id)),
    ).toHaveLength(1);
    // She is off the list, and can still sign in: her account answers.
    const listed = (await (await list(gym.id, john)).json()) as TeamMemberBody[];
    expect(listed.map(({ email }) => email)).toEqual([john.email]);
    expect(
      (await api().request('/v1/me', { headers: { 'x-test-account': sarah.id } })).status,
    ).toBe(200);
  });

  it('AC4: a removal of a record that does not exist in the workspace answers 404', async () => {
    const { gym, other, john, mikeRole } = await world();

    const unknown = await remove(gym.id, crypto.randomUUID(), john);
    // Mike’s record belongs to another workspace: out of John’s reach, the same answer.
    const foreign = await remove(gym.id, mikeRole.id, john);

    for (const response of [unknown, foreign]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'not_found' });
    }
    expect(await teamOf(other.id)).toHaveLength(1);
  });

  it('AC5: removal keeps the person’s client record and its link', async () => {
    const { gym, john, sarah, sarahRole } = await world();
    const client = await addClient(admin.db, { workspaceId: gym.id, accountId: sarah.id });
    const before = await admin.db.select().from(clients).where(eq(clients.id, client.id));

    const response = await remove(gym.id, sarahRole.id, john);

    expect(response.status).toBe(204);
    expect(await admin.db.select().from(clients).where(eq(clients.id, client.id))).toEqual(before);
    expect(before[0]).toMatchObject({ accountId: sarah.id, organizationId: gym.id });
  });

  it('AC6: a removed trainer’s next request gets 404 on every route of the workspace', async () => {
    const { gym, john, sarah, sarahRole } = await world();
    const server = api();
    const read = () =>
      server.request(`/v1/workspaces/${gym.id}`, { headers: { 'x-test-account': sarah.id } });
    expect((await read()).status).toBe(200);

    await remove(gym.id, sarahRole.id, john, server);

    for (const response of [await read(), await list(gym.id, sarah, server)]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'not_found' });
    }
  });

  it('AC7: removing the only Owner answers 409 and changes nothing', async () => {
    const { gym, john, johnRole } = await world();
    const before = await teamOf(gym.id);

    const response = await remove(gym.id, johnRole.id, john);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'last_owner' });
    expect(await teamOf(gym.id)).toEqual(before);
  });

  it('AC7: with a second Owner, an Owner may be removed', async () => {
    const { gym, john, johnRole, sarahRole } = await world();
    await admin.db
      .update(teamMembers)
      .set({ role: 'owner' })
      .where(eq(teamMembers.id, sarahRole.id));

    const response = await remove(gym.id, johnRole.id, john);

    expect(response.status).toBe(204);
    expect(await teamOf(gym.id)).toEqual([{ id: sarahRole.id, role: 'owner' }]);
  });

  it('AC7: two Owners removing each other at once leave one Owner (committed transactions)', async () => {
    const gym = await createWorkspace(admin.db, { label: 'race' });
    const first = await createAccount(admin.db, { label: 'first' });
    const second = await createAccount(admin.db, { label: 'second' });
    const firstRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: first.id,
      role: 'owner',
    });
    const secondRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: second.id,
      role: 'owner',
    });
    const server = api();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocked = async () =>
      admin.db.$count(
        sql`pg_stat_activity`,
        sql`wait_event_type = 'Lock' and datname = current_database() and query ilike '%for update%'`,
      );

    // Both requests get past the access check (a plain read) and then wait for the Owners'
    // row lock that this transaction holds, so they really run one after the other.
    let locked: () => void = () => {};
    const hasLock = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const holder = admin.db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from team_members where organization_id = ${gym.id} for update`,
      );
      locked();
      await gate;
    });
    await hasLock;
    const requests = Promise.all([
      remove(gym.id, secondRole.id, first, server),
      remove(gym.id, firstRole.id, second, server),
    ]);
    await vi.waitFor(async () => expect(await blocked()).toBe(2), { timeout: 5000 });
    release();
    await holder;

    const statuses = (await requests).map((response) => response.status).toSorted();
    expect(statuses).toEqual([204, 409]);
    expect(await admin.db.$count(teamMembers, eq(teamMembers.organizationId, gym.id))).toBe(1);
  });

  it('AC8: another workspace’s Owner gets 404; anonymous gets 401', async () => {
    const { gym, mike, johnRole, sarahRole } = await world();
    const before = await teamOf(gym.id);
    const server = api();

    const answers = [
      await list(gym.id, mike, server),
      await remove(gym.id, sarahRole.id, mike, server),
      await remove(gym.id, johnRole.id, mike, server),
      await server.request(`/v1/workspaces/${gym.id}`, { headers: { 'x-test-account': mike.id } }),
    ];

    for (const response of answers) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'not_found' });
    }
    for (const response of [
      await list(gym.id, undefined, server),
      await remove(gym.id, sarahRole.id, undefined, server),
    ]) {
      expect(response.status).toBe(401);
    }
    expect(await teamOf(gym.id)).toEqual(before);
  });

  it('AC11: both routes are in the committed contract with their access', () => {
    const listOperation = contract.paths['/v1/workspaces/{workspaceId}/team-members'].get;
    const removeOperation =
      contract.paths['/v1/workspaces/{workspaceId}/team-members/{teamMemberId}'].delete;

    expect(listOperation.operationId).toBe('listTeamMembers');
    expect(removeOperation.operationId).toBe('removeTeamMember');
    for (const [operation, capability] of [
      [listOperation, 'team.view'],
      [removeOperation, 'team.manage'],
    ] as const) {
      expect(operation['x-access']).toEqual({
        type: 'workspace',
        capability,
        roles: ['owner'],
        client: 'none',
      });
    }
    expect(Object.keys(removeOperation.responses).toSorted()).toEqual(
      ['204', '400', '401', '403', '404', '409', '500'].toSorted(),
    );
  });

  it('AC12: team_member_removed carries the workspace ID and nothing personal', async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    const logs = (['error', 'log', 'warn', 'info'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(capture),
    );
    const posthog = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport: posthog,
      errorReporter: createErrorReporter({ env: {} }),
    });
    const { gym, john, sarah, sarahRole, johnRole } = await world();
    const server = api({ productEvents });

    // A refusal and a not-found record nothing.
    await remove(gym.id, johnRole.id, john, server);
    await remove(gym.id, crypto.randomUUID(), john, server);
    expect(posthog.events).toEqual([]);

    const response = await remove(gym.id, sarahRole.id, john, server);

    expect(response.status).toBe(204);
    expect(posthog.events.map(({ event }) => event)).toEqual(['team_member_removed']);
    expect(posthog.events[0]?.distinct_id).toBe(john.id);
    expect(posthog.events[0]?.properties).toMatchObject({ workspace_id: gym.id });
    const sent = JSON.stringify([posthog.events, lines]);
    for (const personal of [sarah.email, 'Sarah', sarah.marker, 'John', john.email]) {
      expect(sent).not.toContain(personal);
    }
    for (const log of logs) log.mockRestore();
  });

  it('keeps a client-only relationship out of the team list', async () => {
    const { gym, john } = await world();
    const client = await createAccount(admin.db, { label: 'client' });
    await addClient(admin.db, { workspaceId: gym.id, accountId: client.id });

    const listed = (await (await list(gym.id, john)).json()) as TeamMemberBody[];

    expect(listed.map(({ email }) => email)).not.toContain(client.email);
    expect(
      await admin.db.select().from(teamMembers).where(eq(teamMembers.accountId, client.id)),
    ).toEqual([]);
  });
});
