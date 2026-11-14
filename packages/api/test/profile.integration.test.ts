import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  teamMembers,
  trainerProfiles,
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

// F005 (spec #173): a person changes their own name with PATCH /v1/me. One name per account, so
// it shows in every workspace they are on. Synthetic people: Sarah is a Trainer of John's Gym and
// the Owner of her own workspace.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

interface TeamMemberBody {
  name: string;
  email: string;
}

describe('F005 PATCH /v1/me name', () => {
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

  const api = (overrides: Partial<ApiDependencies> = {}) =>
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
      ...overrides,
    });

  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const own = await createWorkspace(admin.db, { label: 'sarah-training' });
    const john = await createAccount(admin.db, { label: 'john' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    await admin.db.update(authUsers).set({ name: 'John' }).where(eq(authUsers.id, john.id));
    await admin.db.update(authUsers).set({ name: 'Sara' }).where(eq(authUsers.id, sarah.id));
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: own.id, accountId: sarah.id, role: 'owner' });
    return { gym, own, john, sarah };
  }

  const patch = (who: { id: string } | undefined, body: unknown, server = api()) =>
    server.request('/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(who ? { 'x-test-account': who.id } : {}) },
      body: JSON.stringify(body),
    });

  const me = async (who: { id: string }) =>
    (await (await api().request('/v1/me', { headers: { 'x-test-account': who.id } })).json()) as {
      name: string | null;
    };

  const storedName = async (id: string) =>
    (await admin.db.select().from(authUsers).where(eq(authUsers.id, id)))[0]?.name;

  it('AC1: a name change shows in me and in the team list of every workspace', async () => {
    const { gym, own, john, sarah } = await world();

    const res = await patch(sarah, { name: 'Sarah de Vries' });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { name: string }).name).toBe('Sarah de Vries');
    expect((await me(sarah)).name).toBe('Sarah de Vries');
    for (const [workspace, caller] of [
      [gym, john],
      [own, sarah],
    ] as const) {
      const listed = await api().request(`/v1/workspaces/${workspace.id}/team-members`, {
        headers: { 'x-test-account': caller.id },
      });
      const names = ((await listed.json()) as TeamMemberBody[]).map(({ name }) => name);
      expect(names).toContain('Sarah de Vries');
      expect(names).not.toContain('Sara');
    }
  });

  it('AC1: the name is trimmed and only the signed-in account changes', async () => {
    const { john, sarah } = await world();

    const res = await patch(sarah, { name: '  Sarah de Vries \n' });

    expect(res.status).toBe(200);
    expect(await storedName(sarah.id)).toBe('Sarah de Vries');
    expect(await storedName(john.id)).toBe('John');
  });

  it('AC1: name and language can change together, and a name alone leaves the language', async () => {
    const { sarah } = await world();
    await patch(sarah, { preferredLocale: 'en' });

    const named = await patch(sarah, { name: 'Sarah' });
    const both = await patch(sarah, { name: 'Sarah B', preferredLocale: 'nl-NL' });

    expect(((await named.json()) as { preferredLocale: string }).preferredLocale).toBe('en');
    expect(await both.json()).toMatchObject({ name: 'Sarah B', preferredLocale: 'nl-NL' });
  });

  it.each([
    ['empty', '', 'too_small'],
    ['blank', '   \t ', 'too_small'],
    ['over 120 characters', 'x'.repeat(121), 'too_big'],
  ])(
    'F005 AC1, F030 AC4: a name that is %s is refused with a field error and nothing is saved',
    async (_, name, code) => {
      const { sarah } = await world();

      const res = await patch(sarah, { name });

      expect(res.status).toBe(400);
      const json = (await res.json()) as { code: string; issues: { path: string; code: string }[] };
      expect(json.code).toBe('validation_failed');
      expect(json.issues).toMatchObject([{ path: 'name', code }]);
      expect(await storedName(sarah.id)).toBe('Sara');
    },
  );

  it('F030 AC4: exactly 120 characters is accepted, and the limit counts the trimmed name', async () => {
    const { sarah } = await world();

    const res = await patch(sarah, { name: `  ${'x'.repeat(120)} \n` });

    expect(res.status).toBe(200);
    expect(await storedName(sarah.id)).toBe('x'.repeat(120));
  });

  it('AC1: a name that is not text is refused', async () => {
    const { sarah } = await world();

    for (const name of [null, 7]) {
      expect((await patch(sarah, { name })).status).toBe(400);
    }
    expect(await storedName(sarah.id)).toBe('Sara');
  });

  it('@permission AC1: nobody signed in gets 401', async () => {
    const res = await patch(undefined, { name: 'Sarah' });

    expect(res.status).toBe(401);
  });

  it('F030 AC4: name is in the contract on PATCH me, 1 to 120 characters', () => {
    const { name } = contract.components.schemas.UpdateMeRequest.properties;

    expect(name).toMatchObject({ type: 'string', minLength: 1, maxLength: 120 });
  });

  it('AC11: a name change sends no product event and logs no name or email address', async () => {
    const lines: string[] = [];
    const logs = (['error', 'log', 'warn', 'info'] as const).map((level) =>
      vi
        .spyOn(console, level)
        .mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' '))),
    );
    const posthog = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport: posthog,
      errorReporter: createErrorReporter({ env: {} }),
    });
    const { sarah } = await world();

    const res = await patch(sarah, { name: 'Geheime Naam' }, api({ productEvents }));
    await patch(sarah, { name: '' }, api({ productEvents }));

    expect(res.status).toBe(200);
    expect(posthog.events).toEqual([]);
    for (const log of logs) log.mockRestore();
    expect(lines.join('\n')).not.toMatch(/Geheime Naam|example\.com/);
  });
});

describe('F005 PUT and DELETE /v1/workspaces/{workspaceId}/trainer-profile', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 8 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  const api = (overrides: Partial<ApiDependencies> = {}) =>
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
      ...overrides,
    });

  /** John's Gym: John (Owner, trains), Sarah (Trainer), Tom (Owner, does not train). Sarah also owns her workspace. */
  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const own = await createWorkspace(admin.db, { label: 'sarah-training' });
    const john = await createAccount(admin.db, { label: 'john' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const tom = await createAccount(admin.db, { label: 'tom' });
    await admin.db.update(authUsers).set({ name: 'John' }).where(eq(authUsers.id, john.id));
    await admin.db.update(authUsers).set({ name: 'Sarah' }).where(eq(authUsers.id, sarah.id));
    await admin.db.update(authUsers).set({ name: 'Tom' }).where(eq(authUsers.id, tom.id));
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
    const tomRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: tom.id,
      role: 'owner',
    });
    const sarahOwn = await addTeamRole(admin.db, {
      workspaceId: own.id,
      accountId: sarah.id,
      role: 'owner',
    });
    return { gym, own, john, sarah, tom, johnRole, sarahRole, tomRole, sarahOwn };
  }

  const call = (
    method: 'PUT' | 'DELETE',
    workspaceId: string,
    who: { id: string } | undefined,
    server = api(),
    body?: unknown,
  ) =>
    server.request(`/v1/workspaces/${workspaceId}/trainer-profile`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(who ? { 'x-test-account': who.id } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const trainersOf = async (workspaceId: string, who: { id: string }) =>
    (
      (await (
        await api().request(`/v1/workspaces/${workspaceId}/trainers`, {
          headers: { 'x-test-account': who.id },
        })
      ).json()) as { id: string; name: string }[]
    ).map(({ name }) => name);

  const profileIds = async (workspaceId: string) =>
    (
      await admin.db
        .select({ teamMemberId: trainerProfiles.teamMemberId })
        .from(trainerProfiles)
        .where(eq(trainerProfiles.organizationId, workspaceId))
    )
      .map(({ teamMemberId }) => teamMemberId)
      .toSorted();

  const changeRole = (
    workspaceId: string,
    teamMemberId: string,
    role: 'owner' | 'trainer',
    who: { id: string },
  ) =>
    api().request(`/v1/workspaces/${workspaceId}/team-members/${teamMemberId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-account': who.id },
      body: JSON.stringify({ role }),
    });

  it('AC2: a Trainer has a trainer profile and DELETE for it is refused', async () => {
    const { gym, sarah, sarahRole } = await world();

    for (const method of ['DELETE', 'PUT'] as const) {
      const response = await call(method, gym.id, sarah);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: 'forbidden' });
    }

    expect(await profileIds(gym.id)).toContain(sarahRole.id);
    expect(await trainersOf(gym.id, sarah)).toContain('Sarah');
  });

  it('AC2: becoming Trainer creates the trainer profile; becoming Owner keeps what the person had', async () => {
    const { gym, john, tomRole, sarahRole } = await world();
    expect(await profileIds(gym.id)).not.toContain(tomRole.id);

    // Tom (Owner who does not train) becomes Trainer: he trains from now on.
    expect((await changeRole(gym.id, tomRole.id, 'trainer', john)).status).toBe(200);
    expect(await profileIds(gym.id)).toContain(tomRole.id);
    // And stays a trainer when he becomes Owner again.
    expect((await changeRole(gym.id, tomRole.id, 'owner', john)).status).toBe(200);
    expect(await profileIds(gym.id)).toContain(tomRole.id);
    // Sarah becomes Owner and keeps hers; a Trainer who stays Trainer has still one profile.
    expect((await changeRole(gym.id, sarahRole.id, 'owner', john)).status).toBe(200);
    expect((await changeRole(gym.id, sarahRole.id, 'trainer', john)).status).toBe(200);
    expect(
      (await profileIds(gym.id)).filter((teamMemberId) => teamMemberId === sarahRole.id),
    ).toHaveLength(1);
  });

  it('AC4: John switches training off and on; it applies from his next request and to the trainers list; nothing else changes', async () => {
    const { gym, john, johnRole } = await world();
    const before = (
      await admin.db.select().from(teamMembers).where(eq(teamMembers.id, johnRole.id))
    )[0];
    const meBefore = await api().request('/v1/me/workspaces', {
      headers: { 'x-test-account': john.id },
    });
    expect(await trainersOf(gym.id, john)).toEqual(['John', 'Sarah']);

    const off = await call('DELETE', gym.id, john);

    expect(off.status).toBe(204);
    expect(await trainersOf(gym.id, john)).toEqual(['Sarah']);
    const meOff = (await (
      await api().request('/v1/me/workspaces', { headers: { 'x-test-account': john.id } })
    ).json()) as { workspaceId: string; trainsHere: boolean; role: string }[];
    expect(meOff.find((w) => w.workspaceId === gym.id)).toMatchObject({
      role: 'owner',
      trainsHere: false,
    });
    // Nothing else about John changes: the team-member record, and he still owns the gym.
    expect(
      (await admin.db.select().from(teamMembers).where(eq(teamMembers.id, johnRole.id)))[0],
    ).toEqual(before);
    expect((await call('DELETE', gym.id, john)).status).toBe(204);

    const on = await call('PUT', gym.id, john);

    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ teamMemberId: johnRole.id, trainsHere: true });
    expect(await trainersOf(gym.id, john)).toEqual(['John', 'Sarah']);
    expect(
      (await admin.db.select().from(teamMembers).where(eq(teamMembers.id, johnRole.id)))[0],
    ).toEqual(before);
    expect(await meBefore.clone().json()).toEqual(
      await (
        await api().request('/v1/me/workspaces', { headers: { 'x-test-account': john.id } })
      ).json(),
    );
    // Switching on twice keeps one profile.
    expect((await call('PUT', gym.id, john)).status).toBe(200);
    expect(
      (await profileIds(gym.id)).filter((teamMemberId) => teamMemberId === johnRole.id),
    ).toHaveLength(1);
  });

  it('@permission AC5: Sarah, Trainer of John’s Gym, gets 403 there; in her own workspace, where she is Owner, it works', async () => {
    const { gym, own, sarah, sarahOwn, sarahRole } = await world();
    expect(await profileIds(own.id)).not.toContain(sarahOwn.id);

    const refused = await call('PUT', gym.id, sarah);
    const switchedOn = await call('PUT', own.id, sarah);

    expect(refused.status).toBe(403);
    expect(switchedOn.status).toBe(200);
    expect(await switchedOn.json()).toEqual({ teamMemberId: sarahOwn.id, trainsHere: true });
    expect(await profileIds(own.id)).toEqual([sarahOwn.id]);
    expect(await profileIds(gym.id)).toContain(sarahRole.id);
    expect((await call('DELETE', own.id, sarah)).status).toBe(204);
    expect(await profileIds(own.id)).toEqual([]);
    expect(await profileIds(gym.id)).toContain(sarahRole.id);
  });

  it('AC5: nobody outside the team and nobody signed out can reach it', async () => {
    const { gym } = await world();
    const mike = await createAccount(admin.db, { label: 'mike' });
    const anna = await createAccount(admin.db, { label: 'anna' });
    await addClient(admin.db, { workspaceId: gym.id, accountId: anna.id });

    expect((await call('PUT', gym.id, mike)).status).toBe(404);
    expect((await call('DELETE', gym.id, anna)).status).toBe(403);
    expect((await call('PUT', gym.id, undefined)).status).toBe(401);
    expect((await call('DELETE', gym.id, undefined)).status).toBe(401);
  });

  it('AC6: the route only ever changes the caller’s own trainer profile', async () => {
    const { gym, john, tom, tomRole, sarahRole, johnRole } = await world();

    // A body naming another team member is ignored: the route has no way to name one.
    const named = await call('DELETE', gym.id, john, api(), { teamMemberId: sarahRole.id });
    expect(named.status).toBe(204);
    expect(await profileIds(gym.id)).toEqual([sarahRole.id]);

    const tomOn = await call('PUT', gym.id, tom, api(), { teamMemberId: johnRole.id });
    expect(tomOn.status).toBe(200);
    expect(await tomOn.json()).toEqual({ teamMemberId: tomRole.id, trainsHere: true });
    expect(await profileIds(gym.id)).toEqual([sarahRole.id, tomRole.id].toSorted());
  });

  it('AC6: no route in the contract names another team member’s trainer profile', () => {
    const paths = Object.keys(contract.paths).filter((path) => path.includes('trainer-profile'));

    expect(paths).toEqual(['/v1/workspaces/{workspaceId}/trainer-profile']);
    for (const operation of Object.values(contract.paths[paths[0] as string]) as {
      parameters: { name: string }[];
      requestBody?: unknown;
    }[]) {
      expect(operation.parameters.map(({ name }) => name)).toEqual(['workspaceId']);
      expect(operation.requestBody).toBeUndefined();
    }
  });

  it('AC9: removing a team member deletes the trainer profile and keeps the account and its name', async () => {
    const { gym, john, sarah, sarahRole } = await world();
    expect(await profileIds(gym.id)).toContain(sarahRole.id);

    const removed = await api().request(`/v1/workspaces/${gym.id}/team-members/${sarahRole.id}`, {
      method: 'DELETE',
      headers: { 'x-test-account': john.id },
    });

    expect(removed.status).toBe(204);
    expect(await profileIds(gym.id)).not.toContain(sarahRole.id);
    const [account] = await admin.db.select().from(authUsers).where(eq(authUsers.id, sarah.id));
    expect(account).toMatchObject({ id: sarah.id, name: 'Sarah' });
    expect(await trainersOf(gym.id, john)).toEqual(['John']);
  });

  it('AC9: RLS covers trainer_profiles: the app role sees the profiles of the workspaces in its context only', async () => {
    const { gym, own, johnRole } = await world();
    const seenWith = (workspaceIds: string) =>
      app.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.account_id', ${crypto.randomUUID()}, true), set_config('app.workspace_ids', ${workspaceIds}, true)`,
        );
        return tx
          .select({ teamMemberId: trainerProfiles.teamMemberId })
          .from(trainerProfiles)
          .where(eq(trainerProfiles.teamMemberId, johnRole.id));
      });

    expect(await app.db.select().from(trainerProfiles)).toEqual([]);
    expect(await seenWith(own.id)).toEqual([]);
    expect(await seenWith(gym.id)).toEqual([{ teamMemberId: johnRole.id }]);
  });

  it('AC10: both operations are in the committed contract, Owner only', () => {
    const item = contract.paths['/v1/workspaces/{workspaceId}/trainer-profile'];

    expect(item.put.operationId).toBe('putTrainerProfile');
    expect(item.delete.operationId).toBe('deleteTrainerProfile');
    for (const operation of [item.put, item.delete]) {
      expect(operation['x-access']).toEqual({
        type: 'workspace',
        capability: 'team.manage',
        roles: ['owner'],
        client: 'none',
      });
    }
    expect(item.put.responses['200']).toBeDefined();
    expect(item.delete.responses['204']).toBeDefined();
  });

  it('AC11: trainer_profile_changed carries the workspace ID and on/off only; no name or email address anywhere', async () => {
    const lines: string[] = [];
    const logs = (['error', 'log', 'warn', 'info'] as const).map((level) =>
      vi
        .spyOn(console, level)
        .mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' '))),
    );
    const posthog = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport: posthog,
      errorReporter: createErrorReporter({ env: {} }),
    });
    const { gym, john, sarah } = await world();
    const server = api({ productEvents });

    // A refusal and a call that changes nothing record nothing.
    await call('DELETE', gym.id, sarah, server);
    await call('PUT', gym.id, john, server);
    expect(posthog.events).toEqual([]);

    expect((await call('DELETE', gym.id, john, server)).status).toBe(204);
    expect((await call('PUT', gym.id, john, server)).status).toBe(200);

    expect(posthog.events.map(({ event }) => event)).toEqual([
      'trainer_profile_changed',
      'trainer_profile_changed',
    ]);
    // The SDK adds its own `$…` properties; ours are exactly these two.
    expect(
      posthog.events.map(({ properties }) =>
        Object.fromEntries(
          Object.entries(properties ?? {}).filter(([key]) => !key.startsWith('$')),
        ),
      ),
    ).toEqual([
      { workspace_id: gym.id, trains_here: false },
      { workspace_id: gym.id, trains_here: true },
    ]);
    expect(posthog.events.every(({ distinct_id }) => distinct_id === john.id)).toBe(true);
    const sent = JSON.stringify([posthog.events, lines]);
    for (const personal of [john.email, sarah.email, 'John', 'Sarah', john.marker, sarah.marker]) {
      expect(sent).not.toContain(personal);
    }
    for (const log of logs) log.mockRestore();
  });
});
