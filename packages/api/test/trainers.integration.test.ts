import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  trainerProfiles,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F005 (spec #173): GET /v1/workspaces/{workspaceId}/trainers lists the team members with a
// trainer profile, with their names. Synthetic people: John (Owner, trains) and Sarah (Trainer) of
// John's Gym, Mike (Owner of Fit Studio), Anna (a client of John's Gym with no team role).

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

interface TrainerBody {
  id: string;
  name: string;
}

describe('F005 GET /v1/workspaces/{workspaceId}/trainers', () => {
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

  const api = () =>
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
    await admin.db.update(authUsers).set({ name: 'John' }).where(eq(authUsers.id, john.id));
    await admin.db.update(authUsers).set({ name: 'Sarah' }).where(eq(authUsers.id, sarah.id));
    const johnRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: john.id,
      role: 'owner',
      trainsHere: true,
    });
    const sarahRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: sarah.id,
      role: 'trainer',
    });
    await addTeamRole(admin.db, {
      workspaceId: other.id,
      accountId: mike.id,
      role: 'owner',
      trainsHere: true,
    });
    await addClient(admin.db, { workspaceId: gym.id, accountId: anna.id });
    return { gym, other, john, sarah, mike, anna, johnRole, sarahRole };
  }

  const trainers = (workspaceId: string, who?: { id: string }) =>
    api().request(`/v1/workspaces/${workspaceId}/trainers`, {
      headers: who ? { 'x-test-account': who.id } : {},
    });

  it('AC7: John’s Gym’s trainers are John and Sarah with their names; with John’s switch off, only Sarah', async () => {
    const { gym, john, sarah, johnRole, sarahRole } = await world();

    const response = await trainers(gym.id, john);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: johnRole.id, name: 'John' },
      { id: sarahRole.id, name: 'Sarah' },
    ]);
    // A Trainer sees the same list (trainers.view is both roles').
    expect(await (await trainers(gym.id, sarah)).json()).toEqual([
      { id: johnRole.id, name: 'John' },
      { id: sarahRole.id, name: 'Sarah' },
    ]);

    await admin.db.delete(trainerProfiles).where(eq(trainerProfiles.teamMemberId, johnRole.id));

    expect(await (await trainers(gym.id, john)).json()).toEqual([
      { id: sarahRole.id, name: 'Sarah' },
    ]);
  });

  it('AC7: an Owner who does not train is not listed, a Trainer always is', async () => {
    const { gym, john } = await world();
    const lena = await createAccount(admin.db, { label: 'lena' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: lena.id, role: 'owner' });

    const names = ((await (await trainers(gym.id, john)).json()) as TrainerBody[]).map(
      ({ name }) => name,
    );

    expect(names).toEqual(['John', 'Sarah']);
    expect(names).not.toContain(lena.marker);
  });

  it('AC8: Mike (another workspace) gets 404, Anna (client only) 403, anonymous 401', async () => {
    const { gym, mike, anna, john } = await world();

    const fromMike = await trainers(gym.id, mike);
    const fromAnna = await trainers(gym.id, anna);
    const anonymous = await trainers(gym.id);

    expect(fromMike.status).toBe(404);
    expect(await fromMike.clone().json()).toEqual({ code: 'not_found' });
    // Anna has a place in the workspace but no team capability: 403 (E011 AC10; 404 is for no
    // place at all), the decision of the owner on #172.
    expect(fromAnna.status).toBe(403);
    expect(await fromAnna.clone().json()).toEqual({ code: 'forbidden' });
    expect(anonymous.status).toBe(401);
    // Nobody learns who trains.
    for (const refused of [fromMike, fromAnna, anonymous]) {
      expect(JSON.stringify(await refused.json())).not.toContain(john.marker);
    }
  });

  it('AC8: a workspace that does not exist or a malformed ID gets 404 like another’s', async () => {
    const { john } = await world();

    expect((await trainers(crypto.randomUUID(), john)).status).toBe(404);
    expect((await trainers('not-a-uuid', john)).status).toBe(404);
  });

  it('AC10: the route is in the committed contract with trainers.view for both roles', () => {
    const operation = contract.paths['/v1/workspaces/{workspaceId}/trainers'].get;

    expect(operation.operationId).toBe('listTrainers');
    expect(operation['x-access']).toEqual({
      type: 'workspace',
      capability: 'trainers.view',
      roles: ['owner', 'trainer'],
      client: 'none',
    });
    expect(Object.keys(operation.responses).toSorted().map(Number)).toEqual([
      200, 400, 401, 403, 404, 500,
    ]);
  });
});
