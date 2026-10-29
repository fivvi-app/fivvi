import { readFileSync } from 'node:fs';
import { parseSignUpAllowlist } from '@fivvi/auth';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  organizations,
  type SignedInAccount,
  teamMembers,
} from '@fivvi/database';
import { addClient, addTeamRole } from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
  type ProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// POST /v1/workspaces (F002, #277): an allowlisted account with no team role creates its
// workspace and becomes its Owner. The API runs as the app role, so RLS applies; the data is
// read back through the privileged connection.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);
const operation = contract.paths['/v1/workspaces'].post;
const ContractWorkspace = z.fromJSONSchema(
  JSON.parse(
    JSON.stringify({
      $defs: contract.components.schemas,
      $ref: operation.responses['201'].content['application/json'].schema.$ref,
    }).replaceAll('#/components/schemas/', '#/$defs/'),
  ),
);

interface WorkspaceBody {
  id: string;
  name: string;
  slug: string;
  defaultLocale: string;
  timeZone: string;
}

describe('F002 POST /v1/workspaces', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;
  let counter = 0;

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

  /** On the sign-up allowlist of the API under test: `@pilot.example.com`. */
  async function account(options: { allowed?: boolean; name?: string } = {}) {
    counter += 1;
    const email = `person-${counter}@${options.allowed === false ? 'client' : 'pilot'}.example.com`;
    const [row] = await admin.db
      .insert(authUsers)
      .values({ email, name: options.name ?? '', emailVerified: true })
      .returning({ id: authUsers.id });
    if (!row) throw new Error('account not created');
    return { id: row.id, email };
  }

  function api(overrides: Partial<ApiDependencies> = {}) {
    const dependencies: ApiDependencies = {
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
      signUpAllowlist: parseSignUpAllowlist('@pilot.example.com'),
      tenantScopes: createTenantScopes(() => app.db),
      ...overrides,
    };
    return createApp(dependencies);
  }

  const create = (
    who: { id: string } | undefined,
    body: unknown,
    server: ReturnType<typeof api> = api(),
  ) =>
    server.request('/v1/workspaces', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(who ? { 'x-test-account': who.id } : {}),
      },
      body: JSON.stringify(body),
    });

  const counts = async () => ({
    workspaces: await admin.db.$count(organizations),
    roles: await admin.db.$count(teamMembers),
  });

  const nameOf = async (accountId: string) =>
    (await admin.db.select().from(authUsers).where(eq(authUsers.id, accountId)))[0]?.name;

  it('AC1: creates the workspace, makes the account its Owner and sets its name, in one transaction', async () => {
    const sarah = await account();

    const response = await create(sarah, { name: "John's Gym", personName: 'Sarah' });

    expect(response.status).toBe(201);
    const body = (await response.json()) as WorkspaceBody;
    expect(ContractWorkspace.parse(body)).toEqual(body);
    expect(body).toMatchObject({ id: expect.any(String), name: "John's Gym", slug: 'johns-gym' });
    const [workspace] = await admin.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, body.id));
    expect(workspace).toMatchObject({ name: "John's Gym", slug: 'johns-gym' });
    expect(
      await admin.db.select().from(teamMembers).where(eq(teamMembers.accountId, sarah.id)),
    ).toEqual([expect.objectContaining({ organizationId: body.id, role: 'owner' })]);
    expect(await nameOf(sarah.id)).toBe('Sarah');
  });

  it('AC2: defaults nl-NL and Europe/Amsterdam', async () => {
    const response = await create(await account(), { name: "John's Gym" });

    expect(response.status).toBe(201);
    const body = (await response.json()) as WorkspaceBody;
    expect(body).toMatchObject({ defaultLocale: 'nl-NL', timeZone: 'Europe/Amsterdam' });
    const [workspace] = await admin.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, body.id));
    expect(workspace).toMatchObject({ defaultLocale: 'nl-NL', timeZone: 'Europe/Amsterdam' });
  });

  it('AC1: a failure in the request leaves nothing behind: no workspace, no role, no name', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unlucky = await account({ name: 'Before' });
    const before = await counts();
    const failing: ProductEvents = {
      enabled: true,
      track: () => {
        throw new Error('the event failed');
      },
      flush: () => Promise.resolve(),
    };

    const response = await create(
      unlucky,
      { name: 'Unlucky Gym', personName: 'After' },
      api({ productEvents: failing }),
    );

    expect(response.status).toBe(500);
    expect(await counts()).toEqual(before);
    expect(await nameOf(unlucky.id)).toBe('Before');
  });

  it('AC1: the account’s name is optional and left alone when not given', async () => {
    const named = await account({ name: 'Already Named' });

    const response = await create(named, { name: 'Keep Gym' });

    expect(response.status).toBe(201);
    expect(await nameOf(named.id)).toBe('Already Named');
  });

  it('AC2: a second “John’s Gym” gets johns-gym-2, the next one -3', async () => {
    const [first, second, third] = [await account(), await account(), await account()];
    // The first `johns-gym` of this database is taken by the test above; use a name of our own.
    const slugs: string[] = [];
    for (const who of [first, second, third]) {
      const response = await create(who, { name: 'Gym Twin' });
      expect(response.status).toBe(201);
      slugs.push(((await response.json()) as { slug: string }).slug);
    }

    expect(slugs).toEqual(['gym-twin', 'gym-twin-2', 'gym-twin-3']);
  });

  it('AC2: reserved words are skipped and the slug is made of the name alone', async () => {
    const who = await account();

    const response = await create(who, { name: 'API' });

    expect(((await response.json()) as { slug: string }).slug).toBe('api-2');
  });

  it('AC3: rejects empty, blank and too long names with a field error, and creates nothing', async () => {
    const who = await account();
    const before = await counts();

    const cases: [unknown, string][] = [
      [{ name: '' }, 'name'],
      [{ name: '   \t ' }, 'name'],
      [{ name: 'x'.repeat(81) }, 'name'],
      [{ name: 'Fine Gym', personName: '' }, 'personName'],
      [{ name: 'Fine Gym', personName: '  ' }, 'personName'],
      [{ name: 'Fine Gym', personName: 'y'.repeat(81) }, 'personName'],
      [{}, 'name'],
      [{ name: 42 }, 'name'],
    ];
    for (const [body, field] of cases) {
      const response = await create(who, body);

      expect(response.status, JSON.stringify(body)).toBe(400);
      const error = (await response.json()) as { code: string; issues: { path: string }[] };
      expect(error.code).toBe('validation_failed');
      expect(error.issues.map((issue) => issue.path)).toEqual([field]);
    }

    expect(await counts()).toEqual(before);
    expect(await nameOf(who.id)).toBe('');
  });

  it('AC3: names are trimmed, and 80 characters are allowed', async () => {
    const who = await account();

    const response = await create(who, {
      name: `  ${'z'.repeat(80)}  `,
      personName: '  Sarah de Vries ',
    });

    expect(response.status).toBe(201);
    expect(((await response.json()) as { name: string }).name).toBe('z'.repeat(80));
    expect(await nameOf(who.id)).toBe('Sarah de Vries');
  });

  it('AC4: an account that already has a workspace gets 403 and nothing is created', async () => {
    const owner = await account();
    expect((await create(owner, { name: 'First Gym' })).status).toBe(201);
    const before = await counts();

    const response = await create(owner, { name: 'Second Gym', personName: 'Changed' });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'forbidden' });
    expect(await counts()).toEqual(before);
    expect(await nameOf(owner.id)).not.toBe('Changed');
  });

  it('AC4: an account with a team role as a Trainer gets 403 too', async () => {
    const trainer = await account();
    const someoneElses = await create(await account(), { name: 'Trainers Gym' });
    const workspaceId = ((await someoneElses.json()) as { id: string }).id;
    await addTeamRole(admin.db, { workspaceId, accountId: trainer.id });
    const before = await counts();

    const response = await create(trainer, { name: 'Own Gym' });

    expect(response.status).toBe(403);
    expect(await counts()).toEqual(before);
  });

  it('AC4: being a client of a workspace is not a team role', async () => {
    const client = await account();
    const someoneElses = await create(await account(), { name: 'Clients Gym' });
    const workspaceId = ((await someoneElses.json()) as { id: string }).id;
    await addClient(admin.db, { workspaceId, accountId: client.id });

    const response = await create(client, { name: 'Own Gym Of A Client' });

    expect(response.status).toBe(201);
  });

  it('AC4: two requests of one account at once create one workspace', async () => {
    const eager = await account();
    const before = await counts();

    const responses = await Promise.all([
      create(eager, { name: 'Double One' }),
      create(eager, { name: 'Double Two' }),
    ]);

    expect(responses.map((response) => response.status).toSorted()).toEqual([201, 403]);
    expect(await counts()).toEqual({ workspaces: before.workspaces + 1, roles: before.roles + 1 });
  });

  it('AC5: an account that is not on the allowlist gets 403, before its body is looked at', async () => {
    const client = await account({ allowed: false });
    const before = await counts();

    const valid = await create(client, { name: 'Not Allowed Gym', personName: 'Nope' });
    const invalid = await create(client, { name: '' });

    expect(valid.status).toBe(403);
    expect(await valid.json()).toEqual({ code: 'forbidden' });
    expect(invalid.status).toBe(403);
    expect(await counts()).toEqual(before);
    expect(await nameOf(client.id)).not.toBe('Nope');
  });

  it('AC5: with sign-up closed nobody may', async () => {
    const who = await account();

    const response = await create(
      who,
      { name: 'Closed Gym' },
      api({ signUpAllowlist: { allows: () => false } }),
    );

    expect(response.status).toBe(403);
  });

  it('AC9: anonymous gets 401 and nothing is created', async () => {
    const before = await counts();

    const response = await create(undefined, { name: 'Anonymous Gym' });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: 'not_signed_in' });
    expect(await counts()).toEqual(before);
  });

  it('AC11: the route is in the committed contract with its access', () => {
    expect(operation.operationId).toBe('createWorkspace');
    expect(operation['x-access']).toEqual({ type: 'account', workspaces: 'team' });
    expect(Object.keys(operation.responses).toSorted()).toEqual(
      ['201', '400', '401', '403', '500'].toSorted(),
    );
  });

  it('AC12: workspace_created carries the workspace ID and nothing personal', async () => {
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
    const who = await account();

    const response = await create(
      who,
      { name: 'Secret Studio Naam', personName: 'Geheime Persoon' },
      api({ productEvents }),
    );

    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    expect(posthog.events.map(({ event }) => event)).toEqual(['workspace_created']);
    expect(posthog.events[0]?.distinct_id).toBe(who.id);
    expect(posthog.events[0]?.properties).toMatchObject({ workspace_id: id });
    const sent = JSON.stringify([posthog.events, lines]);
    for (const personal of ['Secret Studio', 'secret-studio', 'Geheime', who.email]) {
      expect(sent).not.toContain(personal);
    }
    for (const log of logs) log.mockRestore();
  });

  it('records no event for a refusal or a validation error', async () => {
    const posthog = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport: posthog,
      errorReporter: createErrorReporter({ env: {} }),
    });
    const server = api({ productEvents });
    const refused = await account({ allowed: false });
    const invalid = await account();

    await create(refused, { name: 'No Event' }, server);
    await create(invalid, { name: '' }, server);
    await create(undefined, { name: 'No Event' }, server);

    expect(posthog.events).toEqual([]);
  });

  describe('GET and PATCH /v1/workspaces/{workspaceId}', () => {
    /** A workspace made through the API, its Owner, and a Trainer of it. */
    async function gym(name = "John's Gym") {
      const owner = await account();
      const created = await create(owner, { name });
      const workspace = (await created.json()) as WorkspaceBody;
      const trainer = await account();
      await addTeamRole(admin.db, { workspaceId: workspace.id, accountId: trainer.id });
      return { owner, trainer, workspace };
    }

    const call = (
      method: 'GET' | 'PATCH',
      workspaceId: string,
      who: { id: string } | undefined,
      body?: unknown,
    ) =>
      api().request(`/v1/workspaces/${workspaceId}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(who ? { 'x-test-account': who.id } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    const storedName = async (id: string) =>
      (await admin.db.select().from(organizations).where(eq(organizations.id, id)))[0]?.name;

    it('AC6: the Owner and a Trainer read the workspace', async () => {
      const { owner, trainer, workspace } = await gym();

      for (const who of [owner, trainer]) {
        const response = await call('GET', workspace.id, who);

        expect(response.status).toBe(200);
        const body = (await response.json()) as WorkspaceBody;
        expect(ContractWorkspace.parse(body)).toEqual(body);
        expect(body).toEqual(workspace);
      }
    });

    it('AC6: the Owner renames the workspace and the slug stays', async () => {
      const { owner, workspace } = await gym();

      const response = await call('PATCH', workspace.id, owner, {
        name: "  John's Gym Utrecht ",
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as WorkspaceBody;
      expect(ContractWorkspace.parse(body)).toEqual(body);
      expect(body).toEqual({ ...workspace, name: "John's Gym Utrecht" });
      expect(await storedName(workspace.id)).toBe("John's Gym Utrecht");
      // Every page reads it: the next read, and the account's list in /me.
      const read = await call('GET', workspace.id, owner);
      expect(((await read.json()) as WorkspaceBody).name).toBe("John's Gym Utrecht");
      const me = await api().request('/v1/me', { headers: { 'x-test-account': owner.id } });
      expect(((await me.json()) as { workspaces: unknown[] }).workspaces).toEqual([
        { id: workspace.id, name: "John's Gym Utrecht", slug: workspace.slug, role: 'owner' },
      ]);
    });

    it('AC7: a Trainer gets 403 on a rename, and the name stays', async () => {
      const { trainer, workspace } = await gym();

      const response = await call('PATCH', workspace.id, trainer, { name: 'Hijacked' });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: 'forbidden' });
      expect(await storedName(workspace.id)).toBe(workspace.name);
    });

    it('AC8: an Owner of another workspace gets 404 and no data, on read and on rename', async () => {
      const { workspace } = await gym('Gym Alpha');
      const other = await gym('Gym Beta');

      for (const response of [
        await call('GET', workspace.id, other.owner),
        await call('PATCH', workspace.id, other.owner, { name: 'Taken Over' }),
        await call('GET', '00000000-0000-4000-8000-000000000000', other.owner),
        await call('GET', 'not-an-id', other.owner),
      ]) {
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: 'not_found' });
      }
      expect(await storedName(workspace.id)).toBe('Gym Alpha');
    });

    it('AC9: anonymous gets 401 on read and on rename', async () => {
      const { workspace } = await gym();

      for (const response of [
        await call('GET', workspace.id, undefined),
        await call('PATCH', workspace.id, undefined, { name: 'Nope' }),
      ]) {
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ code: 'not_signed_in' });
      }
      expect(await storedName(workspace.id)).toBe(workspace.name);
    });

    it('AC3: a blank, too long or missing name is refused with a field error', async () => {
      const { owner, workspace } = await gym();

      for (const body of [
        { name: '' },
        { name: '   ' },
        { name: 'x'.repeat(81) },
        {},
        { name: 7 },
      ]) {
        const response = await call('PATCH', workspace.id, owner, body);

        expect(response.status, JSON.stringify(body)).toBe(400);
        const error = (await response.json()) as { code: string; issues: { path: string }[] };
        expect(error.code).toBe('validation_failed');
        expect(error.issues.map((issue) => issue.path)).toEqual(['name']);
      }
      expect(await storedName(workspace.id)).toBe(workspace.name);
      // Exactly 80 characters is fine.
      const longest = await call('PATCH', workspace.id, owner, { name: 'y'.repeat(80) });
      expect(longest.status).toBe(200);
    });

    it('AC6: only the name changes; other fields in the body are ignored', async () => {
      const { owner, workspace } = await gym();

      const response = await call('PATCH', workspace.id, owner, {
        name: 'Renamed Gym',
        slug: 'new-slug',
        timeZone: 'Asia/Tokyo',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...workspace, name: 'Renamed Gym' });
    });

    it('AC11: both routes are in the committed contract with their access', () => {
      const item = contract.paths['/v1/workspaces/{workspaceId}'];
      expect(item.get.operationId).toBe('getWorkspace');
      expect(item.get['x-access']).toEqual({
        type: 'workspace',
        roles: ['owner', 'trainer'],
        client: 'none',
      });
      expect(item.patch.operationId).toBe('renameWorkspace');
      expect(item.patch['x-access']).toEqual({
        type: 'workspace',
        roles: ['owner'],
        client: 'none',
      });
    });
  });
});
