import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  organizations,
  type SignedInAccount,
  teamMembers,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { capabilitiesOf, ROLES } from '@fivvi/domain';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';
import { describeOperations } from './isolation/coverage.ts';

// F004 (spec #172): the answers of every workspace route to the people around John's Gym.
// Synthetic people: John (Owner) and Sarah (Trainer) of John's Gym, Mike (Owner of Fit Studio),
// Anna (a client of John's Gym with an account, no team role). The routes come from the committed
// contract, so a new workspace route is covered the day it is added.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const ANY_ID = '0197c0de-0000-7000-8000-0000000000e1';

describe('F004 roles on every workspace route', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 4 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  const server = () =>
    createApp({
      ...NO_DEPENDENCIES,
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
    });

  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    const john = await createAccount(admin.db, { label: 'john' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    const anna = await createAccount(admin.db, { label: 'anna' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
    const sarahRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: sarah.id,
      role: 'trainer',
    });
    await addTeamRole(admin.db, { workspaceId: other.id, accountId: mike.id, role: 'owner' });
    await addClient(admin.db, { workspaceId: gym.id, accountId: anna.id });
    return { gym, other, john, sarah, mike, anna, sarahRole };
  }

  /** Every workspace operation of the contract, with a path that names John's Gym. */
  function workspaceCalls(workspaceId: string, teamMemberId: string) {
    return describeOperations(contract)
      .filter(({ access }) => access?.type === 'workspace')
      .map(({ name, method, path, access }) => ({
        name,
        method,
        access,
        url: path
          .replace('{workspaceId}', workspaceId)
          .replace('{teamMemberId}', teamMemberId)
          .replace(/\{[^}]+\}/g, ANY_ID),
      }));
  }

  const call = ({ method, url }: { method: string; url: string }, who?: { id: string }) =>
    server().request(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(who ? { 'x-test-account': who.id } : {}),
      },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({ name: 'x' }),
    });

  it('AC7: a role elsewhere gives 404, a client relationship 403; anonymous 401', async () => {
    const { gym, mike, anna, sarahRole } = await world();
    const calls = workspaceCalls(gym.id, sarahRole.id);
    expect(calls.length).toBeGreaterThan(0);

    for (const route of calls) {
      expect(await (await call(route)).status, `${route.name} anonymous`).toBe(401);
      // Mike is an Owner of Fit Studio and nothing in John's Gym.
      expect((await call(route, mike)).status, `${route.name} Mike`).toBe(404);
      // Anna is a client of John's Gym: she has a place in the workspace but no team capability,
      // so 403 (E011 AC10). 404 is only for no place at all (Mike).
      expect((await call(route, anna)).status, `${route.name} Anna`).toBe(403);
    }
  });

  it('AC3: Trainer gets 403 on owner routes and nothing changes', async () => {
    const { gym, sarah, sarahRole } = await world();
    const ownerRoutes = workspaceCalls(gym.id, sarahRole.id).filter(
      ({ access }) =>
        access?.type === 'workspace' && !(access.roles as readonly string[]).includes('trainer'),
    );
    expect(ownerRoutes.map(({ name }) => name).sort()).toEqual([
      'changeTeamMemberRole',
      'listTeamMembers',
      'removeTeamMember',
      'renameWorkspace',
    ]);

    for (const route of ownerRoutes) {
      expect((await call(route, sarah)).status, route.name).toBe(403);
    }

    const [workspace] = await admin.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, gym.id));
    expect(workspace?.name).toBe(gym.marker);
    expect(
      await admin.db.select().from(teamMembers).where(eq(teamMembers.organizationId, gym.id)),
    ).toHaveLength(2);
  });

  it('AC3: Trainer may call the routes the matrix gives a Trainer', async () => {
    const { gym, sarah, sarahRole } = await world();
    const trainerRoutes = workspaceCalls(gym.id, sarahRole.id).filter(
      ({ access }) =>
        access?.type === 'workspace' && (access.roles as readonly string[]).includes('trainer'),
    );

    expect(trainerRoutes.map(({ name }) => name)).toEqual(['getWorkspace']);
    expect((await call(trainerRoutes[0] as never, sarah)).status).toBe(200);
  });

  it('AC3: Owner is admitted to every workspace route', async () => {
    const { gym, john, sarahRole } = await world();
    for (const route of workspaceCalls(gym.id, sarahRole.id)) {
      // 400 for the body the probe sends is fine: the Owner got past the access check.
      expect([200, 204, 400], route.name).toContain((await call(route, john)).status);
    }
  });

  // The role change (#316): PATCH /v1/workspaces/{workspaceId}/team-members/{teamMemberId}.
  const changeRole = (
    workspaceId: string,
    teamMemberId: string,
    who: { id: string } | undefined,
    role: unknown,
    request: (path: string, init: RequestInit) => Response | Promise<Response> = (path, init) =>
      server().request(path, init),
  ) =>
    request(`/v1/workspaces/${workspaceId}/team-members/${teamMemberId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(who ? { 'x-test-account': who.id } : {}),
      },
      body: JSON.stringify({ role }),
    });

  const rolesOf = async (workspaceId: string) =>
    (
      await admin.db
        .select({ id: teamMembers.id, accountId: teamMembers.accountId, role: teamMembers.role })
        .from(teamMembers)
        .where(eq(teamMembers.organizationId, workspaceId))
    ).toSorted((a, b) => a.id.localeCompare(b.id));

  const recordOf = async (workspaceId: string, accountId: string) => {
    const record = (await rolesOf(workspaceId)).find((row) => row.accountId === accountId);
    if (!record) throw new Error('no such team member');
    return record;
  };

  const myWorkspaces = async (who: { id: string }, workspaceId: string) => {
    const response = await server().request('/v1/me/workspaces', {
      headers: { 'x-test-account': who.id },
    });
    expect(response.status).toBe(200);
    const all = (await response.json()) as {
      workspaceId: string;
      role: string;
      capabilities: string[];
    }[];
    return all.find((workspace) => workspace.workspaceId === workspaceId);
  };

  const listTeam = (workspaceId: string, who: { id: string }) =>
    server().request(`/v1/workspaces/${workspaceId}/team-members`, {
      headers: { 'x-test-account': who.id },
    });

  it('AC4: role change takes effect on the next request', async () => {
    const { gym, john, sarah, sarahRole } = await world();
    expect((await listTeam(gym.id, sarah)).status).toBe(403);
    expect((await myWorkspaces(sarah, gym.id))?.capabilities).toEqual(capabilitiesOf('trainer'));

    const promoted = await changeRole(gym.id, sarahRole.id, john, 'owner');

    expect(promoted.status).toBe(200);
    expect(await promoted.json()).toMatchObject({ id: sarahRole.id, role: 'owner' });
    // Her next request: every Owner capability, and the owner routes open.
    const asOwner = await myWorkspaces(sarah, gym.id);
    expect(asOwner?.role).toBe('owner');
    expect(asOwner?.capabilities).toEqual(capabilitiesOf('owner'));
    expect((await listTeam(gym.id, sarah)).status).toBe(200);

    const demoted = await changeRole(gym.id, sarahRole.id, john, 'trainer');

    expect(demoted.status).toBe(200);
    const asTrainer = await myWorkspaces(sarah, gym.id);
    expect(asTrainer?.role).toBe('trainer');
    expect(asTrainer?.capabilities).toEqual(capabilitiesOf('trainer'));
    expect((await listTeam(gym.id, sarah)).status).toBe(403);
  });

  it('AC4: the role is owner or trainer; admin and anything else answers 400', async () => {
    const { gym, john, sarahRole } = await world();
    const before = await rolesOf(gym.id);

    expect(ROLES).toEqual(['owner', 'trainer']);
    for (const role of ['admin', 'Owner', '', 1, null, undefined]) {
      const response = await changeRole(gym.id, sarahRole.id, john, role);
      expect(response.status, String(role)).toBe(400);
    }
    expect(await rolesOf(gym.id)).toEqual(before);
  });

  it('AC4: a team member of another workspace or none answers 404 and nothing changes', async () => {
    const { gym, other, john } = await world();
    const [foreign] = await rolesOf(other.id);
    const before = await rolesOf(other.id);

    for (const id of [foreign?.id ?? '', crypto.randomUUID()]) {
      const response = await changeRole(gym.id, id, john, 'trainer');
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'not_found' });
    }
    expect(await rolesOf(other.id)).toEqual(before);
  });

  it('AC5: the only Owner making himself Trainer gets 409 and nothing changes', async () => {
    const { gym, john } = await world();
    const johnRole = await recordOf(gym.id, john.id);
    const before = await rolesOf(gym.id);

    const response = await changeRole(gym.id, johnRole.id, john, 'trainer');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'last_owner' });
    expect(await rolesOf(gym.id)).toEqual(before);
    expect((await myWorkspaces(john, gym.id))?.role).toBe('owner');
  });

  it('AC5: with a second Owner, an Owner may become a Trainer', async () => {
    const { gym, john, sarahRole } = await world();
    await changeRole(gym.id, sarahRole.id, john, 'owner');
    const johnRole = await recordOf(gym.id, john.id);

    const response = await changeRole(gym.id, johnRole.id, john, 'trainer');

    expect(response.status).toBe(200);
    expect((await rolesOf(gym.id)).map(({ role }) => role).toSorted()).toEqual([
      'owner',
      'trainer',
    ]);
  });

  it('AC5: racing demotions keep an Owner (own database, committed transactions)', async () => {
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
    const app = server();
    const send = (path: string, init: RequestInit) => app.request(path, init);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocked = async () =>
      admin.db.$count(
        sql`pg_stat_activity`,
        sql`wait_event_type = 'Lock' and datname = current_database() and query ilike '%for update%'`,
      );

    // Both requests get past the access check (a plain read) and then wait for the Owners' row
    // lock that this transaction holds, so they really run one after the other.
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
      changeRole(gym.id, secondRole.id, first, 'trainer', send),
      changeRole(gym.id, firstRole.id, second, 'trainer', send),
    ]);
    await vi.waitFor(async () => expect(await blocked()).toBe(2), { timeout: 5000 });
    release();
    await holder;

    const statuses = (await requests).map((response) => response.status).toSorted();
    expect(statuses).toEqual([200, 409]);
    expect((await rolesOf(gym.id)).map(({ role }) => role).toSorted()).toEqual([
      'owner',
      'trainer',
    ]);
  });

  it('AC6: Trainer can’t change roles; one role per team member', async () => {
    const { gym, sarah, john, sarahRole } = await world();
    const johnRole = await recordOf(gym.id, john.id);
    const before = await rolesOf(gym.id);

    for (const id of [sarahRole.id, johnRole.id]) {
      const response = await changeRole(gym.id, id, sarah, 'owner');
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: 'forbidden' });
    }
    expect(await rolesOf(gym.id)).toEqual(before);

    // The Owner's change replaces the role on the same record: still two records, same ids.
    await changeRole(gym.id, sarahRole.id, john, 'owner');
    const after = await rolesOf(gym.id);
    expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
    expect(after.filter(({ accountId }) => accountId === sarah.id)).toHaveLength(1);
  });

  it('AC9: the PATCH route is in the contract with its capability', () => {
    const operation =
      contract.paths['/v1/workspaces/{workspaceId}/team-members/{teamMemberId}'].patch;

    expect(operation.operationId).toBe('changeTeamMemberRole');
    expect(operation['x-access']).toEqual({
      type: 'workspace',
      capability: 'team.manage',
      roles: ['owner'],
      client: 'none',
    });
  });
});
