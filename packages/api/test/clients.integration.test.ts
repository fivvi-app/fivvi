import { readFileSync } from 'node:fs';
import {
  authUsers,
  authVerifications,
  clients,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { createMemoryTransport } from '@fivvi/email';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F006 (spec #174), the first slice: owners and trainers add clients and list and search them
// through the API. The API runs as the app role, so RLS applies; the data is read back through the
// privileged connection. Synthetic people: John (Owner) and Sarah (Trainer) of John's Gym, Mike
// (Owner) of Fit Studio, Anna (a client of John's Gym with an account, no team role).

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

interface ClientBody {
  id: string;
  name: string;
  email: string | null;
  emailLocale: string | null;
}

interface ClientListBody {
  items: ClientBody[];
  total: number;
}

describe('F006 add and list clients', () => {
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

  /** John's Gym with John (Owner) and Sarah (Trainer); Fit Studio with Mike; Anna, a client of the gym. */
  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    const john = await createAccount(admin.db, { label: 'john' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    const annaAccount = await createAccount(admin.db, { label: 'anna' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: other.id, accountId: mike.id, role: 'owner' });
    await addClient(admin.db, {
      workspaceId: gym.id,
      accountId: annaAccount.id,
      name: 'Anna Account',
    });
    return { gym, other, john, sarah, mike, annaAccount };
  }

  const post = (
    workspaceId: string,
    body: unknown,
    who: { id: string } | undefined,
    server: ReturnType<typeof api> = api(),
    headers: Record<string, string> = {},
  ) =>
    server.request(`/v1/workspaces/${workspaceId}/clients`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(who ? { 'x-test-account': who.id } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
    });

  const list = (
    workspaceId: string,
    who: { id: string } | undefined,
    query = '',
    server: ReturnType<typeof api> = api(),
  ) =>
    server.request(`/v1/workspaces/${workspaceId}/clients${query}`, {
      headers: who ? { 'x-test-account': who.id } : {},
    });

  const stored = (workspaceId: string) =>
    admin.db.select().from(clients).where(eq(clients.organizationId, workspaceId));

  it('AC1: Owner and Trainer add a client with a name only; no language for emails is set', async () => {
    const { gym, john, sarah } = await world();
    const before = (await stored(gym.id)).length;

    const byJohn = await post(gym.id, { name: 'Mark Jansen' }, john);
    const bySarah = await post(gym.id, { name: 'Mark Jansen' }, sarah);

    expect(byJohn.status).toBe(201);
    expect(await byJohn.json()).toEqual({
      id: expect.any(String),
      name: 'Mark Jansen',
      email: null,
      emailLocale: null,
    });
    // Two clients without an email address may share a name (AC3).
    expect(bySarah.status).toBe(201);
    const marks = (await stored(gym.id)).filter(({ name }) => name === 'Mark Jansen');
    expect(marks).toHaveLength(2);
    expect(
      marks.every(({ email, emailLocale, accountId }) => !email && !emailLocale && !accountId),
    ).toBe(true);
    expect(marks.every(({ organizationId }) => organizationId === gym.id)).toBe(true);
    expect((await stored(gym.id)).length).toBe(before + 2);
  });

  it('AC2: email lowercased, language stored, name trimmed, invalid input refused', async () => {
    const { gym, john } = await world();

    const added = await post(
      gym.id,
      { name: '  Anna de Vries ', email: 'Anna@Example.com', emailLocale: 'en' },
      john,
    );

    expect(added.status).toBe(201);
    expect(await added.json()).toEqual({
      id: expect.any(String),
      name: 'Anna de Vries',
      email: 'anna@example.com',
      emailLocale: 'en',
    });
    const [row] = (await stored(gym.id)).filter(({ name }) => name === 'Anna de Vries');
    expect(row).toMatchObject({ email: 'anna@example.com', emailLocale: 'en' });

    const before = (await stored(gym.id)).length;
    const refusals: [unknown, string][] = [
      [{ name: '' }, 'name'],
      [{ name: '   ' }, 'name'],
      [{ name: 'x'.repeat(121) }, 'name'],
      [{}, 'name'],
      [{ name: 'Bram', email: 'not-an-address' }, 'email'],
      [{ name: 'Bram', email: 'bram@' }, 'email'],
      [{ name: 'Bram', emailLocale: 'de' }, 'emailLocale'],
      [{ name: 'Bram', emailLocale: 'en-GB' }, 'emailLocale'],
    ];
    for (const [body, field] of refusals) {
      const response = await post(gym.id, body, john);
      expect(response.status, JSON.stringify(body)).toBe(400);
      const problem = (await response.json()) as { code: string; issues: { path: string }[] };
      expect(problem.code).toBe('validation_failed');
      expect(
        problem.issues.map(({ path }) => path),
        JSON.stringify(body),
      ).toContain(field);
    }
    // Nothing was saved by any refusal, and a name of exactly 120 characters is fine.
    expect((await stored(gym.id)).length).toBe(before);
    expect((await post(gym.id, { name: 'x'.repeat(120) }, john)).status).toBe(201);
  });

  it('AC3: the same email in the workspace gives 409 with the existing client', async () => {
    const { gym, john, sarah } = await world();
    const anna = (await (
      await post(gym.id, { name: 'Anna de Vries', email: 'anna@example.com' }, john)
    ).json()) as ClientBody;
    const before = (await stored(gym.id)).length;

    for (const email of ['anna@example.com', 'Anna@Example.com', 'ANNA@EXAMPLE.COM']) {
      const again = await post(gym.id, { name: 'Anna', email }, sarah);
      expect(again.status, email).toBe(409);
      expect(await again.json()).toEqual({ code: 'client_exists', clientId: anna.id });
    }

    expect((await stored(gym.id)).length).toBe(before);
  });

  it('AC3: the same address is a client of another workspace, not a duplicate', async () => {
    const { gym, other, john, mike } = await world();
    await post(other.id, { name: 'Anna de Vries', email: 'anna@example.com' }, mike);

    const added = await post(gym.id, { name: 'Anna de Vries', email: 'anna@example.com' }, john);

    expect(added.status).toBe(201);
  });

  it('AC3: two parallel requests with one email add one client and answer one 409', async () => {
    const { gym, john, sarah } = await world();
    const server = api();

    const answers = await Promise.all([
      post(gym.id, { name: 'Anna', email: 'anna@example.com' }, john, server),
      post(gym.id, { name: 'Anna', email: 'anna@example.com' }, sarah, server),
    ]);

    expect(answers.map(({ status }) => status).toSorted()).toEqual([201, 409]);
    expect((await stored(gym.id)).filter(({ email }) => email === 'anna@example.com')).toHaveLength(
      1,
    );
  });

  it('AC4: links an existing account without revealing it', async () => {
    const { gym, other, john, mike } = await world();
    // Anna has an account and is a client of Fit Studio.
    const anna = await createAccount(admin.db, { label: 'anna-elsewhere' });
    await addClient(admin.db, {
      workspaceId: other.id,
      accountId: anna.id,
      name: 'Anna elsewhere',
      email: anna.email,
    });
    const stranger = await createAccount(admin.db, { label: 'stranger' });

    const linked = await post(gym.id, { name: 'Anna de Vries', email: anna.email }, john);
    const unlinked = await post(
      gym.id,
      { name: 'Anna de Vries', email: 'nobody@example.com' },
      john,
    );

    expect(linked.status).toBe(201);
    expect(unlinked.status).toBe(201);
    // The new client is linked to the account...
    const [row] = (await stored(gym.id)).filter(({ email }) => email === anna.email);
    expect(row?.accountId).toBe(anna.id);
    expect(
      (await stored(gym.id)).find(({ email }) => email === 'nobody@example.com')?.accountId,
    ).toBe(null);
    // ...and nothing in the answer shows it: the same fields, no account ID, nothing of Fit Studio.
    const body = (await linked.json()) as ClientBody;
    expect(Object.keys(body).toSorted()).toEqual(
      Object.keys((await unlinked.json()) as ClientBody).toSorted(),
    );
    expect(JSON.stringify(body)).not.toContain(anna.id);
    expect(JSON.stringify(body)).not.toContain('Anna elsewhere');
    expect(JSON.stringify(body)).not.toContain(other.id);
    // The listing shows no more.
    const listed = JSON.stringify(await (await list(gym.id, john)).json());
    expect(listed).not.toContain(anna.id);
    expect(listed).not.toContain('Anna elsewhere');
    // Fit Studio's client is unchanged, and nobody in Fit Studio sees John's Gym's.
    expect((await (await list(other.id, mike)).json()) as ClientListBody).toMatchObject({
      total: 1,
      items: [{ name: 'Anna elsewhere' }],
    });
    // A third account with no client record stays out of it.
    expect((await stored(gym.id)).some(({ accountId }) => accountId === stranger.id)).toBe(false);
  });

  it('AC4: an account already linked to a client of the workspace is that client, not a second one', async () => {
    const { gym, john, annaAccount } = await world();
    const existing = (await stored(gym.id)).find(({ accountId }) => accountId === annaAccount.id);

    const again = await post(gym.id, { name: 'Anna', email: annaAccount.email }, john);

    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ code: 'client_exists', clientId: existing?.id });
  });

  it('AC5: no email is sent and no account is created, with or without an address', async () => {
    const { gym, john } = await world();
    const mail = createMemoryTransport();
    const requestSignIn = vi.fn(async () => {
      await mail.send({ to: 'x@example.com', subject: 'x', html: '', text: '' } as never);
    });
    const server = api({ requestSignIn });
    const accounts = (await admin.db.select({ id: authUsers.id }).from(authUsers)).length;
    const verifications = (await admin.db.select().from(authVerifications)).length;

    await post(gym.id, { name: 'Mark Jansen' }, john, server);
    await post(gym.id, { name: 'Bram', email: 'bram@example.com' }, john, server);
    await post(gym.id, { name: 'Bram', email: 'bram@example.com' }, john, server);

    expect(mail.sent).toEqual([]);
    expect(requestSignIn).not.toHaveBeenCalled();
    expect((await admin.db.select({ id: authUsers.id }).from(authUsers)).length).toBe(accounts);
    expect((await admin.db.select().from(authVerifications)).length).toBe(verifications);
  });

  it('AC6: Owner and Trainer list and search the whole workspace', async () => {
    const { gym, john, sarah } = await world();
    await post(gym.id, { name: 'Anna de Vries', email: 'anna@example.com' }, john);
    await post(gym.id, { name: 'Mark Jansen' }, john);
    await post(gym.id, { name: 'Zoë Émile', email: 'zoe.emile@example.com' }, sarah);

    for (const who of [john, sarah]) {
      const all = (await (await list(gym.id, who)).json()) as ClientListBody;
      expect(all.total).toBe(4);
      expect(all.items.map(({ name }) => name)).toEqual([
        'Anna Account',
        'Anna de Vries',
        'Mark Jansen',
        'Zoë Émile',
      ]);

      const found = (await (await list(gym.id, who, '?search=vrie')).json()) as ClientListBody;
      expect(found.items.map(({ name }) => name)).toEqual(['Anna de Vries']);
      expect(found.total).toBe(1);
    }
  });

  it('AC6: search ignores case and accents and matches the email address too', async () => {
    const { gym, john } = await world();
    await post(gym.id, { name: 'Zoë Émile', email: 'zoe.emile@example.com' }, john);
    await post(gym.id, { name: 'Mark Jansen' }, john);
    const names = async (query: string) =>
      ((await (await list(gym.id, john, query)).json()) as ClientListBody).items.map(
        ({ name }) => name,
      );

    expect(await names('?search=ZOE')).toEqual(['Zoë Émile']);
    expect(await names('?search=zoë')).toEqual(['Zoë Émile']);
    expect(await names(`?search=${encodeURIComponent('émile')}`)).toEqual(['Zoë Émile']);
    expect(await names('?search=EMILE%40EXAMPLE')).toEqual(['Zoë Émile']);
    expect(await names('?search=jansen')).toEqual(['Mark Jansen']);
    expect(await names('?search=nobody')).toEqual([]);
    // A blank search is no search; `%` and `_` are text, not wildcards.
    expect((await names('?search=%20%20')).length).toBe(3);
    expect(await names('?search=%25')).toEqual([]);
    expect(await names('?search=_')).toEqual([]);
  });

  it('AC6: the list is paginated, in the same order', async () => {
    const { gym, john } = await world();
    for (const name of ['Bram', 'Carla', 'Dirk', 'Els']) await post(gym.id, { name }, john);

    const first = (await (await list(gym.id, john, '?pageSize=2')).json()) as ClientListBody;
    const second = (await (
      await list(gym.id, john, '?pageSize=2&page=2')
    ).json()) as ClientListBody;
    const beyond = (await (
      await list(gym.id, john, '?pageSize=2&page=50')
    ).json()) as ClientListBody;

    expect(first.total).toBe(5);
    expect(first.items.map(({ name }) => name)).toEqual(['Anna Account', 'Bram']);
    expect(second.items.map(({ name }) => name)).toEqual(['Carla', 'Dirk']);
    expect(beyond).toEqual({ items: [], total: 5 });
    for (const query of ['?pageSize=0', '?pageSize=101', '?pageSize=x', '?page=0', '?page=-1']) {
      expect((await list(gym.id, john, query)).status, query).toBe(400);
    }
  });

  it('AC9: a team member’s own address makes a separate client record linked to her account', async () => {
    const { gym, john, sarah } = await world();

    const added = await post(gym.id, { name: 'Sarah as a client', email: sarah.email }, john);

    expect(added.status).toBe(201);
    const record = (await stored(gym.id)).find(({ accountId }) => accountId === sarah.id);
    expect(record).toMatchObject({ name: 'Sarah as a client', email: sarah.email });
    // Her team role is as it was: still a Trainer, and she still lists and adds as one.
    expect((await list(gym.id, sarah)).status).toBe(200);
    expect((await post(gym.id, { name: 'Another' }, sarah)).status).toBe(201);
    // The client record gives her no extra rights: a Trainer still can't use an Owner route.
    const team = await api().request(`/v1/workspaces/${gym.id}/team-members`, {
      headers: { 'x-test-account': sarah.id },
    });
    expect(team.status).toBe(403);
  });

  it('AC10: another workspace, a client-only account and anonymous are denied', async () => {
    const { gym, mike, annaAccount } = await world();
    const before = (await stored(gym.id)).length;
    const asks = async (who?: { id: string }) => [
      (await list(gym.id, who)).status,
      (await post(gym.id, { name: 'Intruder' }, who)).status,
    ];

    // Mike: an Owner elsewhere has no place in John's Gym.
    expect(await asks(mike)).toEqual([404, 404]);
    // Anna has a place (a client) but no team capability: 403 (E011 AC10, F004 AC7).
    expect(await asks(annaAccount)).toEqual([403, 403]);
    expect(await asks()).toEqual([401, 401]);
    expect((await stored(gym.id)).length).toBe(before);
    // A workspace that doesn't exist, or is no ID, answers like one the caller has no place in.
    expect((await list(crypto.randomUUID(), mike)).status).toBe(404);
    expect((await list('not-an-id', mike)).status).toBe(404);
  });

  it('AC10: the clients table has organization_id and forced row-level security', async () => {
    const { rows } = await admin.db.execute(
      sql`select c.relrowsecurity as rls, c.relforcerowsecurity as forced,
              exists (select 1 from information_schema.columns
                       where table_name = 'clients' and column_name = 'organization_id') as scoped
         from pg_class c where c.relname = 'clients' and c.relkind = 'r'`,
    );

    expect(rows).toEqual([{ rls: true, forced: true, scoped: true }]);
  });

  it('AC13: both routes are in the committed contract with their capability', () => {
    const listOperation = contract.paths['/v1/workspaces/{workspaceId}/clients'].get;
    const addOperation = contract.paths['/v1/workspaces/{workspaceId}/clients'].post;

    expect(listOperation.operationId).toBe('listClients');
    expect(addOperation.operationId).toBe('addClient');
    for (const [operation, capability] of [
      [listOperation, 'clients.view'],
      [addOperation, 'clients.manage'],
    ] as const) {
      expect(operation['x-access']).toEqual({
        type: 'workspace',
        capability,
        roles: ['owner', 'trainer'],
        client: 'none',
      });
    }
    expect(Object.keys(addOperation.responses).toSorted()).toEqual(
      ['201', '400', '401', '403', '404', '409', '500'].toSorted(),
    );
  });

  it('AC14: client_added carries the workspace ID and the surface only', async () => {
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
    const { gym, john } = await world();
    const server = api({ productEvents });

    // A refusal, a duplicate and a validation error record nothing.
    await post(gym.id, { name: '' }, john, server);
    await post(gym.id, { name: 'Anna', email: 'anna@example.com' }, john, server);
    const afterFirst = posthog.events.length;
    await post(gym.id, { name: 'Anna', email: 'anna@example.com' }, john, server);
    expect(posthog.events.length).toBe(afterFirst);
    posthog.events.length = 0;

    // The web has no Authorization header; an app names its surface.
    await post(
      gym.id,
      { name: 'Zoë Émile', email: 'zoe@example.com', emailLocale: 'en' },
      john,
      server,
    );
    await post(gym.id, { name: 'Bram Visser' }, john, server, {
      authorization: 'Bearer token',
    });
    await post(gym.id, { name: 'Carla Smit', surface: 'ios' }, john, server, {
      authorization: 'Bearer token',
    });

    expect(posthog.events.map(({ event }) => event)).toEqual(['client_added', 'client_added']);
    expect(posthog.events[0]?.distinct_id).toBe(john.id);
    expect(posthog.events.map(({ properties }) => properties)).toEqual([
      expect.objectContaining({ workspace_id: gym.id, surface: 'web' }),
      expect.objectContaining({ workspace_id: gym.id, surface: 'ios' }),
    ]);
    const sent = JSON.stringify([posthog.events, lines]);
    for (const personal of ['Zoë', 'Émile', 'zoe@example.com', 'Bram', 'Carla', 'Visser', 'Smit']) {
      expect(sent).not.toContain(personal);
    }
    for (const log of logs) log.mockRestore();
  });
});
