import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  organizations,
  type SignedInAccount,
} from '@fivvi/database';
import { addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@fivvi/domain';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F029 (spec #484, ticket #898): the join link of a workspace through the API,
// GET /v1/workspaces/{workspaceId}/join-link and POST …/join-link/renew. Synthetic people: John
// (Owner of John's Gym), Sarah (Trainer of John's Gym), Mike (Owner of Fit Studio), Anna (an
// account with no place in John's Gym).

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const APP_BASE_URL = 'https://fivvi.example.test';
const CODE = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_LENGTH}}$`);
const NOW = new Date('2026-11-10T10:00:00.000Z');

interface JoinLinkBody {
  url: string;
  renewedAt: string | null;
}

describe('F029 the join link of a workspace', () => {
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
      appBaseUrl: () => APP_BASE_URL,
      clock: { now: () => NOW },
      ...overrides,
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
    return { gym, other, john, sarah, mike, anna };
  }

  async function storedCode(workspaceId: string) {
    const [row] = await admin.db
      .select({ code: organizations.joinCode, renewedAt: organizations.joinLinkRenewedAt })
      .from(organizations)
      .where(eq(organizations.id, workspaceId));
    if (!row) throw new Error('no such workspace');
    return row;
  }

  function holdersOf(code: string) {
    return admin.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.joinCode, code));
  }

  const read = (workspaceId: string, who?: { id: string }, server = api()) =>
    server.request(`/v1/workspaces/${workspaceId}/join-link`, {
      headers: who ? { 'x-test-account': who.id } : {},
    });

  const renew = (
    workspaceId: string,
    who?: { id: string },
    server = api(),
    options: { body?: unknown; headers?: Record<string, string> } = {},
  ) =>
    server.request(`/v1/workspaces/${workspaceId}/join-link/renew`, {
      method: 'POST',
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(who ? { 'x-test-account': who.id } : {}),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

  it('the read route answers the full URL of the workspace’s code, not renewed yet', async () => {
    const { gym, john } = await world();
    const { code } = await storedCode(gym.id);

    const response = await read(gym.id, john);

    expect(response.status).toBe(200);
    expect(code).toMatch(CODE);
    expect(await response.json()).toEqual({ url: `${APP_BASE_URL}/j/${code}`, renewedAt: null });
  });

  // The old link "anonymous": no public route resolves a code yet (the next ticket's), so the proof is
  // that no workspace holds the old code any more.
  it('AC6: renew replaces the code; old link anonymous', async () => {
    const { gym, other, john } = await world();
    const before = await storedCode(gym.id);
    const otherBefore = await storedCode(other.id);

    const renewed = await renew(gym.id, john);

    expect(renewed.status).toBe(200);
    const body = (await renewed.json()) as JoinLinkBody;
    const after = await storedCode(gym.id);
    expect(after.code).toMatch(CODE);
    expect(after.code).not.toBe(before.code);
    expect(after.renewedAt).toEqual(NOW);
    expect(body).toEqual({ url: `${APP_BASE_URL}/j/${after.code}`, renewedAt: NOW.toISOString() });
    expect(await (await read(gym.id, john)).json()).toEqual(body);
    // The old code stops resolving at once: nothing holds it any more.
    expect(await holdersOf(before.code)).toEqual([]);
    expect(await holdersOf(after.code)).toEqual([{ id: gym.id }]);
    // Fit Studio's link is untouched.
    expect(await storedCode(other.id)).toEqual(otherBefore);
  });

  it('AC6: renewing twice makes a new code each time and keeps the last renewal time', async () => {
    const { gym, john } = await world();
    const later = new Date('2026-11-11T08:30:00.000Z');

    const first = (await (await renew(gym.id, john)).json()) as JoinLinkBody;
    const second = (await (
      await renew(gym.id, john, api({ clock: { now: () => later } }))
    ).json()) as JoinLinkBody;

    expect(second.url).not.toBe(first.url);
    expect(second.renewedAt).toBe(later.toISOString());
    expect((await storedCode(gym.id)).renewedAt).toEqual(later);
  });

  it('AC7: Trainer copies, Owner renews and decides', async () => {
    const { gym, john, sarah } = await world();
    const before = await storedCode(gym.id);

    const sarahReads = await read(gym.id, sarah);
    const sarahRenews = await renew(gym.id, sarah);
    const johnReads = await read(gym.id, john);
    const johnRenews = await renew(gym.id, john);

    expect([sarahReads.status, sarahRenews.status, johnReads.status, johnRenews.status]).toEqual([
      200, 403, 200, 200,
    ]);
    const expected = { url: `${APP_BASE_URL}/j/${before.code}`, renewedAt: null };
    expect(await sarahReads.json()).toEqual(expected);
    expect(await johnReads.json()).toEqual(expected);
    expect((await storedCode(gym.id)).code).not.toBe(before.code);
  });

  it('AC7: a refused renew by Sarah leaves the code and the time as they were', async () => {
    const { gym, sarah } = await world();
    const before = await storedCode(gym.id);

    await renew(gym.id, sarah);

    expect(await storedCode(gym.id)).toEqual(before);
  });

  it('AC8: Mike (Owner of Fit Studio) gets 404 on both of John’s Gym routes; anonymous calls get 401; an account with no place in John’s Gym gets 404', async () => {
    const { gym, mike, anna } = await world();
    const before = await storedCode(gym.id);

    const statuses = [
      (await read(gym.id, mike)).status,
      (await renew(gym.id, mike)).status,
      (await read(gym.id)).status,
      (await renew(gym.id)).status,
      (await read(gym.id, anna)).status,
      (await renew(gym.id, anna)).status,
    ];

    expect(statuses).toEqual([404, 404, 401, 401, 404, 404]);
    expect(await storedCode(gym.id)).toEqual(before);
  });

  it('AC8: a refusal says nothing of the link: no URL, no code', async () => {
    const { gym, mike } = await world();
    const { code } = await storedCode(gym.id);

    const bodies = [
      await (await read(gym.id, mike)).text(),
      await (await renew(gym.id, mike)).text(),
      await (await read(gym.id)).text(),
    ];

    for (const body of bodies) expect(body).not.toContain(code);
  });

  it('AC14: join_link_renewed carries the workspace ID and the surface only', async () => {
    const { posthog, lines, productEvents, restore } = capture();
    const { gym, john } = await world();
    const server = api({ productEvents });

    const fromWeb = await renew(gym.id, john, server);
    const fromIos = await renew(gym.id, john, server, {
      body: { surface: 'ios' },
      headers: { authorization: 'Bearer token' },
    });
    const fromAndroid = await renew(gym.id, john, server, {
      body: { surface: 'android' },
      headers: { authorization: 'Bearer token' },
    });
    const { code } = await storedCode(gym.id);

    expect([fromWeb.status, fromIos.status, fromAndroid.status]).toEqual([200, 200, 200]);
    expect(posthog.events.map(({ event }) => event)).toEqual([
      'join_link_renewed',
      'join_link_renewed',
      'join_link_renewed',
    ]);
    expect(posthog.events.map(({ properties }) => properties)).toEqual([
      expect.objectContaining({ workspace_id: gym.id, surface: 'web' }),
      expect.objectContaining({ workspace_id: gym.id, surface: 'ios' }),
      expect.objectContaining({ workspace_id: gym.id, surface: 'android' }),
    ]);
    for (const event of posthog.events) {
      const keys = Object.keys(event.properties ?? {}).filter((key) => !key.startsWith('$'));
      expect(keys.toSorted()).toEqual(['surface', 'workspace_id']);
      expect(event.distinct_id).toBe(john.id);
    }
    // No code, URL, name or address reaches PostHog or the logs.
    const sent = JSON.stringify([posthog.events, lines]);
    for (const personal of [john.email, gym.marker, code, 'fivvi.example.test']) {
      expect(sent).not.toContain(personal);
    }
    restore();
  });

  it('AC14: reading records nothing, and neither does a refusal, a bad surface or an app that names no surface', async () => {
    const { posthog, productEvents, restore } = capture();
    const { gym, john, sarah, mike } = await world();
    const server = api({ productEvents });

    const statuses = [
      (await read(gym.id, john, server)).status,
      (await renew(gym.id, sarah, server)).status,
      (await renew(gym.id, mike, server)).status,
      (await renew(gym.id, undefined, server)).status,
      (await renew(gym.id, john, server, { body: { surface: 'watch' } })).status,
      (await renew(gym.id, john, server, { headers: { authorization: 'Bearer token' } })).status,
    ];

    expect(statuses).toEqual([200, 403, 404, 401, 400, 200]);
    expect(posthog.events).toEqual([]);
    restore();
  });

  it('AC13: both routes are in the committed contract with x-access, and there is no way to set a code', () => {
    const readOperation = contract.paths['/v1/workspaces/{workspaceId}/join-link'];
    const renewOperation = contract.paths['/v1/workspaces/{workspaceId}/join-link/renew'];

    expect(Object.keys(readOperation)).toEqual(['get']);
    expect(Object.keys(renewOperation)).toEqual(['post']);
    expect(readOperation.get.operationId).toBe('getJoinLink');
    expect(readOperation.get['x-access']).toEqual({
      type: 'workspace',
      capability: 'join_link.view',
      roles: ['owner', 'trainer'],
      client: 'none',
    });
    expect(renewOperation.post.operationId).toBe('renewJoinLink');
    expect(renewOperation.post['x-access']).toEqual({
      type: 'workspace',
      capability: 'join_link.renew',
      roles: ['owner'],
      client: 'none',
    });
    for (const operation of [readOperation.get, renewOperation.post]) {
      expect(['200', '401', '403', '404'].every((status) => status in operation.responses)).toBe(
        true,
      );
    }
  });
});
