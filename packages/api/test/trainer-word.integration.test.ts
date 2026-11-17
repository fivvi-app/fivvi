import { readFileSync } from 'node:fs';
import { parseSignUpAllowlist } from '@fivvi/auth';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  organizations,
  type SignedInAccount,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { capabilitiesOf } from '@fivvi/domain';
import { TRAINER_WORDS } from '@fivvi/i18n';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F068 (spec #588, ticket #739): the workspace's word for its trainers through the API, stored on
// the workspace, changed by the Owner on PATCH /v1/workspaces/{workspaceId} and carried by every
// read that gives a screen its workspace. Synthetic people: John (Owner of John's Gym), Sarah
// (Trainer of John's Gym), Mike (Owner of Fit Studio), Anna (a client of John's Gym).

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

describe('F068 the workspace’s word for its trainers', () => {
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
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: other.id, accountId: mike.id, role: 'owner' });
    await addClient(admin.db, { workspaceId: gym.id, accountId: anna.id });
    return { gym, other, john, sarah, mike, anna };
  }

  const as = (who?: { id: string }) => (who ? { 'x-test-account': who.id } : {});

  const read = (workspaceId: string, who?: { id: string }) =>
    api().request(`/v1/workspaces/${workspaceId}`, { headers: as(who) });

  const setWord = (workspaceId: string, body: unknown, who?: { id: string }) =>
    api().request(`/v1/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...as(who) },
      body: JSON.stringify(body),
    });

  const storedWord = async (workspaceId: string) => {
    const [row] = await admin.db
      .select({ word: organizations.trainerWord })
      .from(organizations)
      .where(eq(organizations.id, workspaceId));
    return row?.word;
  };

  const mine = async (who: { id: string }) =>
    (await (await api().request('/v1/me/workspaces', { headers: as(who) })).json()) as {
      workspaceId: string;
      trainerWord: string;
    }[];

  const me = async (who: { id: string }) =>
    (await (await api().request('/v1/me', { headers: as(who) })).json()) as {
      workspaces: { id: string; trainerWord: string }[];
      clientWorkspaces: { id: string; trainerWord: string }[];
    };

  it('AC2: a new workspace starts on trainer, and creating one doesn’t ask', async () => {
    const creator = await createAccount(admin.db, { label: 'pilot' });
    const server = createApp({
      ...NO_DEPENDENCIES,
      findSignedInAccount: async () => ({
        id: creator.id,
        email: creator.email,
        name: 'Creator',
        preferredLocale: null,
      }),
      signUpAllowlist: parseSignUpAllowlist('@example.com'),
      tenantScopes: createTenantScopes(() => app.db),
    });

    const response = await server.request('/v1/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Pilates Pilot' }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; trainerWord: string };
    expect(body.trainerWord).toBe('trainer');
    expect(await storedWord(body.id)).toBe('trainer');
    const request = contract.components.schemas.CreateWorkspaceRequest;
    expect(Object.keys(request.properties)).not.toContain('trainerWord');
  });

  it('AC1: John sets instructeur; the workspace, me and the apps’ list carry it at once', async () => {
    const { gym, john, sarah, anna } = await world();

    const response = await setWord(gym.id, { trainerWord: 'instructeur' }, john);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: gym.id, trainerWord: 'instructeur' });
    expect(await storedWord(gym.id)).toBe('instructeur');
    expect(await (await read(gym.id, sarah)).json()).toMatchObject({ trainerWord: 'instructeur' });
    expect((await mine(john)).map((w) => w.trainerWord)).toEqual(['instructeur']);
    expect((await me(sarah)).workspaces.map((w) => w.trainerWord)).toEqual(['instructeur']);
    expect((await me(anna)).clientWorkspaces.map((w) => w.trainerWord)).toEqual(['instructeur']);
  });

  it('AC1: every one of the four choices can be set, also again, and the name stays', async () => {
    const { gym, john } = await world();

    for (const word of [...TRAINER_WORDS, 'instructeur', 'trainer']) {
      const response = await setWord(gym.id, { trainerWord: word }, john);
      expect(response.status).toBe(200);
      expect(await storedWord(gym.id)).toBe(word);
    }
    expect(await (await read(gym.id, john)).json()).toMatchObject({ name: gym.marker });
  });

  it('AC1: the word can be sent with the name and the language in one request', async () => {
    const { gym, john } = await world();

    const response = await setWord(
      gym.id,
      { name: 'Pilates Studio', defaultLocale: 'en', trainerWord: 'docent' },
      john,
    );

    expect(await response.json()).toMatchObject({
      name: 'Pilates Studio',
      defaultLocale: 'en',
      trainerWord: 'docent',
      slug: gym.marker,
    });
  });

  it('AC9: roles and rights don’t change: Sarah is a Trainer with the same capabilities before and after', async () => {
    const { gym, john, sarah } = await world();
    const before = await me(sarah);
    const beforeFull = (await (
      await api().request('/v1/me/workspaces', { headers: as(sarah) })
    ).json()) as { role: string; capabilities: string[] }[];

    await setWord(gym.id, { trainerWord: 'coach' }, john);

    const afterFull = (await (
      await api().request('/v1/me/workspaces', { headers: as(sarah) })
    ).json()) as { role: string; capabilities: string[] }[];
    expect(afterFull.map(({ role, capabilities }) => ({ role, capabilities }))).toEqual(
      beforeFull.map(({ role, capabilities }) => ({ role, capabilities })),
    );
    expect(afterFull[0]).toMatchObject({
      role: 'trainer',
      capabilities: capabilitiesOf('trainer'),
    });
    expect(before.workspaces).toHaveLength(1);
    // The Trainer still can't change the word: the rights are the matrix's alone.
    expect((await setWord(gym.id, { trainerWord: 'docent' }, sarah)).status).toBe(403);
  });

  it('AC10: Sarah reads the word but gets 403 when she changes it, and nothing changes', async () => {
    const { gym, sarah } = await world();

    const read200 = await read(gym.id, sarah);
    const refused = await setWord(gym.id, { trainerWord: 'coach' }, sarah);

    expect(read200.status).toBe(200);
    expect(await read200.json()).toMatchObject({ trainerWord: 'trainer' });
    expect(refused.status).toBe(403);
    expect(await storedWord(gym.id)).toBe('trainer');
  });

  it('AC10: Mike gets 404 on John’s Gym, anonymous gets 401, and nothing changes', async () => {
    const { gym, mike } = await world();

    const statuses = [
      (await setWord(gym.id, { trainerWord: 'coach' }, mike)).status,
      (await setWord(gym.id, { trainerWord: 'coach' })).status,
      (await read(gym.id, mike)).status,
      (await read(gym.id)).status,
    ];

    expect(statuses).toEqual([404, 401, 404, 401]);
    expect(await storedWord(gym.id)).toBe('trainer');
  });

  it('AC10: a value outside the four choices is refused with the validation error and nothing changes', async () => {
    const { gym, john } = await world();
    await setWord(gym.id, { trainerWord: 'docent' }, john);

    for (const bad of ['teacher', 'instructor', 'Trainer', '', 7, null]) {
      const response = await setWord(gym.id, { trainerWord: bad }, john);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'validation_failed',
        issues: [{ path: 'trainerWord' }],
      });
    }
    expect(await storedWord(gym.id)).toBe('docent');
  });

  it('AC10: a request with no field at all is still refused', async () => {
    const { gym, john } = await world();

    expect((await setWord(gym.id, {}, john)).status).toBe(400);
  });

  it('AC1: changing John’s Gym touches no other workspace', async () => {
    const { gym, other, john } = await world();

    await setWord(gym.id, { trainerWord: 'coach' }, john);

    expect(await storedWord(other.id)).toBe('trainer');
  });

  it('AC13: the contract has the word on every workspace shape, and the four choices on the change', () => {
    const schemas = contract.components.schemas;
    for (const name of ['Workspace', 'MeWorkspace', 'MeClientWorkspace', 'MyWorkspace']) {
      expect(schemas[name].properties.trainerWord, name).toBeDefined();
      expect(schemas[name].required, name).toContain('trainerWord');
      expect(schemas[name].properties.trainerWord.$ref, name).toBe(
        '#/components/schemas/TrainerWord',
      );
    }
    expect(schemas.UpdateWorkspaceRequest.properties.trainerWord.$ref).toBe(
      '#/components/schemas/TrainerWord',
    );
    expect(schemas.TrainerWord.enum).toEqual([...TRAINER_WORDS]);
    expect(schemas.UpdateWorkspaceRequest.required ?? []).not.toContain('trainerWord');
    const patch = contract.paths['/v1/workspaces/{workspaceId}'].patch;
    expect(patch['x-access']).toMatchObject({ capability: 'workspace.manage', roles: ['owner'] });
    expect(['200', '400', '401', '403', '404'].every((s) => s in patch.responses)).toBe(true);
  });
});
