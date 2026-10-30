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
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    return { gym, john, sarah, mike, anna, sarahRole };
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

  it('AC7: a role elsewhere or a client relationship gives 404; anonymous 401', async () => {
    const { gym, mike, anna, sarahRole } = await world();
    const calls = workspaceCalls(gym.id, sarahRole.id);
    expect(calls.length).toBeGreaterThan(0);

    for (const route of calls) {
      expect(await (await call(route)).status, `${route.name} anonymous`).toBe(401);
      // Mike is an Owner of Fit Studio and nothing in John's Gym.
      expect((await call(route, mike)).status, `${route.name} Mike`).toBe(404);
      // Anna is a client of John's Gym: a place without a team capability. Open question: AC7
      // says 404, E011 AC10 (the isolation suite) says 403 for a place the access doesn't allow.
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
});
