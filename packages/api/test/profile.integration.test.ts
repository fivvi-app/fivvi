import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
} from '@fivvi/database';
import { addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
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
    ['over 80 characters', 'x'.repeat(81), 'too_big'],
  ])(
    'AC1: a name that is %s is refused with a field error and nothing is saved',
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

  it('AC1: exactly 80 characters is accepted', async () => {
    const { sarah } = await world();

    const res = await patch(sarah, { name: 'x'.repeat(80) });

    expect(res.status).toBe(200);
  });

  it('AC1: a name that is not text is refused', async () => {
    const { sarah } = await world();

    for (const name of [null, 7]) {
      expect((await patch(sarah, { name })).status).toBe(400);
    }
    expect(await storedName(sarah.id)).toBe('Sara');
  });

  it('AC1: nobody signed in gets 401', async () => {
    const res = await patch(undefined, { name: 'Sarah' });

    expect(res.status).toBe(401);
  });

  it('AC10: name is in the contract on PATCH me, 1 to 80 characters', () => {
    const { name } = contract.components.schemas.UpdateMeRequest.properties;

    expect(name).toMatchObject({ type: 'string', minLength: 1, maxLength: 80 });
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
