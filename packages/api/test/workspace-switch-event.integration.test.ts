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
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F012 (spec #423, ticket #432): choosing another workspace is recorded as `workspace_switched`,
// with the workspace ID and the surface only. Synthetic people: Sarah is a Trainer of John's Gym
// and the Owner of Sarah Personal Training; Mike owns Fit Studio and is not on either team.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

describe('F012 workspace_switched', () => {
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

  function capture() {
    const lines: string[] = [];
    const log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    const spies = (['error', 'log', 'warn', 'info'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(log),
    );
    const posthog = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport: posthog,
      errorReporter: createErrorReporter({ env: {} }),
    });
    return {
      posthog,
      lines,
      productEvents,
      restore: () => {
        for (const spy of spies) spy.mockRestore();
      },
    };
  }

  function api(productEvents = capture().productEvents) {
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
      productEvents,
    });
  }

  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const own = await createWorkspace(admin.db, { label: 'sarah-personal-training' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: own.id, accountId: sarah.id, role: 'owner' });
    await addTeamRole(admin.db, { workspaceId: other.id, accountId: mike.id, role: 'owner' });
    return { gym, own, other, sarah, mike };
  }

  const switched = (
    server: ReturnType<typeof api>,
    workspaceId: string,
    who: { id: string } | undefined,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    server.request(`/v1/workspaces/${workspaceId}/switched`, {
      method: 'POST',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(who ? { 'x-test-account': who.id } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  it('AC12: workspace_switched carries the workspace ID and the surface only', async () => {
    const { posthog, lines, productEvents, restore } = capture();
    const { gym, own, sarah } = await world();
    const server = api(productEvents);

    // The web has no Authorization header and no body; an app names its surface.
    const fromWeb = await switched(server, gym.id, sarah);
    const fromIos = await switched(
      server,
      own.id,
      sarah,
      { surface: 'ios' },
      {
        authorization: 'Bearer token',
      },
    );
    const fromAndroid = await switched(
      server,
      gym.id,
      sarah,
      { surface: 'android' },
      {
        authorization: 'Bearer token',
      },
    );

    expect([fromWeb.status, fromIos.status, fromAndroid.status]).toEqual([204, 204, 204]);
    expect(await fromWeb.text()).toBe('');
    expect(posthog.events.map(({ event }) => event)).toEqual([
      'workspace_switched',
      'workspace_switched',
      'workspace_switched',
    ]);
    expect(posthog.events.map(({ properties }) => properties)).toEqual([
      expect.objectContaining({ workspace_id: gym.id, surface: 'web' }),
      expect.objectContaining({ workspace_id: own.id, surface: 'ios' }),
      expect.objectContaining({ workspace_id: gym.id, surface: 'android' }),
    ]);
    // Only these two properties, and the account's UUID as the pseudonymous ID: no name, no
    // address, no role, no slug.
    for (const event of posthog.events) {
      const keys = Object.keys(event.properties ?? {}).filter((key) => !key.startsWith('$'));
      expect(keys.toSorted()).toEqual(['surface', 'workspace_id']);
      expect(event.distinct_id).toBe(sarah.id);
    }
    const sent = JSON.stringify([posthog.events, lines]);
    for (const personal of [sarah.email, gym.marker, own.marker]) {
      expect(sent).not.toContain(personal);
    }
    restore();
  });

  it('AC12: a request with a bearer token that names no surface records nothing, as the API does not guess', async () => {
    const { posthog, productEvents, restore } = capture();
    const { gym, sarah } = await world();

    const response = await switched(api(productEvents), gym.id, sarah, undefined, {
      authorization: 'Bearer token',
    });

    expect(response.status).toBe(204);
    expect(posthog.events).toEqual([]);
    restore();
  });

  it('AC12: a refusal records nothing: another workspace is 404, anonymous 401, a bad surface 400', async () => {
    const { posthog, productEvents, restore } = capture();
    const { gym, other, sarah } = await world();
    const server = api(productEvents);

    const notMine = await switched(server, other.id, sarah);
    const anonymous = await switched(server, gym.id, undefined);
    const badSurface = await switched(server, gym.id, sarah, { surface: 'watch' });

    expect([notMine.status, anonymous.status, badSurface.status]).toEqual([404, 401, 400]);
    expect(posthog.events).toEqual([]);
    restore();
  });

  it('AC12: the route is in the committed contract, open to any team member of the workspace', () => {
    const operation = contract.paths['/v1/workspaces/{workspaceId}/switched'].post;

    expect(operation.operationId).toBe('recordWorkspaceSwitch');
    expect(operation['x-access']).toMatchObject({
      type: 'workspace',
      roles: ['owner', 'trainer'],
      client: 'none',
    });
    expect(Object.keys(operation.responses).toSorted()).toEqual(
      ['204', '400', '401', '403', '404', '500'].toSorted(),
    );
  });
});
