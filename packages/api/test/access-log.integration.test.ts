import { readFileSync } from 'node:fs';
import {
  authUsers,
  clients,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
} from '@fivvi/database';
import {
  addAccessLogEntry,
  addClient,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// E014 (spec #477, ticket #1173): the Owner reads the access log of the workspace. The API runs as
// the app role, so RLS applies; the log is seeded through the privileged connection. Synthetic
// people: John (Owner) and Sarah (Trainer) of John's Gym, Mike (Owner) of Fit Studio, Anna de
// Vries and Mark Jansen (clients of John's Gym; Mark is also a client of Fit Studio).

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

interface LogItem {
  id: string;
  occurredAt: string;
  action: string;
  actorTeamMemberId: string | null;
  actorName: string | null;
  clientId: string | null;
  clientName: string | null;
  clientRemoved: boolean;
  objectId: string | null;
}

interface LogBody {
  items: LogItem[];
  total: number;
}

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 9, 0, 0));

describe('E014 the Owner reads the access log', () => {
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

  /** John's Gym with John (Owner) and Sarah (Trainer), Anna and Mark; Fit Studio with Mike and Mark. */
  async function world(johnLocale: 'nl-NL' | 'en' | null = 'nl-NL') {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const studio = await createWorkspace(admin.db, { label: 'fit-studio' });
    const john = await createAccount(admin.db, { label: 'john', name: 'John' });
    const sarah = await createAccount(admin.db, { label: 'sarah', name: 'Sarah' });
    const mike = await createAccount(admin.db, { label: 'mike', name: 'Mike' });
    const annaAccount = await createAccount(admin.db, { label: 'anna' });
    await admin.db
      .update(authUsers)
      .set({ preferredLocale: johnLocale })
      .where(eq(authUsers.id, john.id));
    const johnMember = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: john.id,
      role: 'owner',
    });
    const sarahMember = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: sarah.id,
      role: 'trainer',
    });
    const mikeMember = await addTeamRole(admin.db, {
      workspaceId: studio.id,
      accountId: mike.id,
      role: 'owner',
    });
    const anna = await addClient(admin.db, {
      workspaceId: gym.id,
      accountId: annaAccount.id,
      name: 'Anna de Vries',
      email: 'anna@example.com',
      emailLocale: 'nl-NL',
    });
    const mark = await addClient(admin.db, {
      workspaceId: gym.id,
      name: 'Mark Jansen',
      email: 'mark@example.com',
      emailLocale: 'en',
    });
    const marksOtherClient = await addClient(admin.db, {
      workspaceId: studio.id,
      name: 'Mark Jansen',
      email: 'mark@example.com',
      emailLocale: 'en',
    });
    return {
      gym,
      studio,
      john,
      sarah,
      mike,
      annaAccount,
      johnMember,
      sarahMember,
      mikeMember,
      anna,
      mark,
      marksOtherClient,
    };
  }

  const read = (
    workspaceId: string,
    who: { id: string } | undefined,
    query = '',
    headers: Record<string, string> = {},
    server: ReturnType<typeof api> = api(),
  ) =>
    server.request(`/v1/workspaces/${workspaceId}/access-log${query}`, {
      headers: { ...(who ? { 'x-test-account': who.id } : {}), ...headers },
    });

  it('AC22: Owner reads this workspace’s log; names resolved; no note text', async () => {
    const w = await world();
    await addAccessLogEntry(admin.db, {
      workspaceId: w.gym.id,
      action: 'client.exported',
      actorTeamMemberId: w.johnMember.id,
      subjectClientId: w.anna.id,
      occurredAt: day(1),
    });
    await addAccessLogEntry(admin.db, {
      workspaceId: w.gym.id,
      action: 'client.trashed',
      actorTeamMemberId: w.sarahMember.id,
      subjectClientId: w.mark.id,
      occurredAt: day(3),
    });
    await addAccessLogEntry(admin.db, {
      workspaceId: w.gym.id,
      action: 'workspace.exported',
      actorTeamMemberId: w.johnMember.id,
      occurredAt: day(2),
    });
    await addAccessLogEntry(admin.db, {
      workspaceId: w.studio.id,
      action: 'client.exported',
      actorTeamMemberId: w.mikeMember.id,
      subjectClientId: w.marksOtherClient.id,
      occurredAt: day(4),
    });

    const response = await read(w.gym.id, w.john);
    const body = (await response.json()) as LogBody;

    expect(response.status).toBe(200);
    expect(body.total).toBe(3);
    expect(
      body.items.map((item) => [item.action, item.actorName, item.clientName, item.clientRemoved]),
    ).toEqual([
      ['client.trashed', 'Sarah', 'Mark Jansen', false],
      ['workspace.exported', 'John', null, false],
      ['client.exported', 'John', 'Anna de Vries', false],
    ]);
    expect(body.items.map((item) => item.occurredAt)).toEqual([
      day(3).toISOString(),
      day(2).toISOString(),
      day(1).toISOString(),
    ]);
    // Nothing of Fit Studio: not Mike, not Mark’s record there.
    const text = JSON.stringify(body);
    expect(text).not.toContain(w.marksOtherClient.id);
    expect(text).not.toContain(w.mikeMember.id);
    expect(text).not.toContain('Mike');
  });

  it('AC22: filters by client and by action, and combines them', async () => {
    const w = await world();
    for (const [action, client, n] of [
      ['client.exported', w.anna, 1],
      ['client.trashed', w.anna, 2],
      ['client.exported', w.mark, 3],
    ] as const) {
      await addAccessLogEntry(admin.db, {
        workspaceId: w.gym.id,
        action,
        actorTeamMemberId: w.johnMember.id,
        subjectClientId: client.id,
        occurredAt: day(n),
      });
    }

    const ofAnna = (await (
      await read(w.gym.id, w.john, `?clientId=${w.anna.id}`)
    ).json()) as LogBody;
    const exports = (await (
      await read(w.gym.id, w.john, '?action=client.exported')
    ).json()) as LogBody;
    const annaExports = (await (
      await read(w.gym.id, w.john, `?clientId=${w.anna.id}&action=client.exported`)
    ).json()) as LogBody;

    expect(ofAnna.items.map((item) => item.action)).toEqual(['client.trashed', 'client.exported']);
    expect(exports.items.map((item) => item.clientName)).toEqual(['Mark Jansen', 'Anna de Vries']);
    expect(annaExports.total).toBe(1);
  });

  it('@isolation AC22: filtering by a client of another workspace finds nothing of it', async () => {
    const w = await world();
    await addAccessLogEntry(admin.db, {
      workspaceId: w.studio.id,
      actorTeamMemberId: w.mikeMember.id,
      subjectClientId: w.marksOtherClient.id,
    });

    const response = await read(w.gym.id, w.john, `?clientId=${w.marksOtherClient.id}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], total: 0 });
  });

  it('AC22: pages the list', async () => {
    const w = await world();
    for (let n = 1; n <= 5; n += 1) {
      await addAccessLogEntry(admin.db, {
        workspaceId: w.gym.id,
        actorTeamMemberId: w.johnMember.id,
        subjectClientId: w.anna.id,
        occurredAt: day(n),
      });
    }

    const body = (await (await read(w.gym.id, w.john, '?pageSize=2&page=2')).json()) as LogBody;

    expect(body.total).toBe(5);
    expect(body.items.map((item) => item.occurredAt)).toEqual([
      day(3).toISOString(),
      day(2).toISOString(),
    ]);
  });

  it('AC22 (NL): a removed client reads as Verwijderde klant in John’s language, and keeps its ID', async () => {
    const w = await world('nl-NL');
    await addAccessLogEntry(admin.db, {
      workspaceId: w.gym.id,
      action: 'client.purged',
      actorTeamMemberId: w.johnMember.id,
      subjectClientId: w.anna.id,
    });
    await admin.db.delete(clients).where(eq(clients.id, w.anna.id));

    const body = (await (await read(w.gym.id, w.john)).json()) as LogBody;

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      clientId: w.anna.id,
      clientName: 'Verwijderde klant',
      clientRemoved: true,
    });
    expect(JSON.stringify(body)).not.toContain('Anna');
    expect(JSON.stringify(body)).not.toContain('anna@example.com');
  });

  it('AC22 (EN): a removed client reads as Deleted client in John’s language', async () => {
    const w = await world('en');
    await addAccessLogEntry(admin.db, {
      workspaceId: w.gym.id,
      action: 'client.purged',
      actorTeamMemberId: w.johnMember.id,
      subjectClientId: w.mark.id,
    });
    await admin.db.delete(clients).where(eq(clients.id, w.mark.id));

    const body = (await (await read(w.gym.id, w.john)).json()) as LogBody;

    expect(body.items[0]).toMatchObject({ clientName: 'Deleted client', clientRemoved: true });
  });

  it('AC22: without a stored language the Accept-Language of the request decides, else English', async () => {
    const w = await world(null);
    await addAccessLogEntry(admin.db, {
      workspaceId: w.gym.id,
      action: 'client.purged',
      actorTeamMemberId: w.johnMember.id,
      subjectClientId: w.anna.id,
    });
    await admin.db.delete(clients).where(eq(clients.id, w.anna.id));

    const nl = (await (
      await read(w.gym.id, w.john, '', { 'accept-language': 'nl-NL,nl;q=0.9' })
    ).json()) as LogBody;
    const none = (await (await read(w.gym.id, w.john)).json()) as LogBody;

    expect(nl.items[0]?.clientName).toBe('Verwijderde klant');
    expect(none.items[0]?.clientName).toBe('Deleted client');
  });

  it('AC22: a note entry carries the note ID and no text; an entry of the daily cleanup has no actor', async () => {
    const w = await world();
    const noteId = '88888888-8888-4888-8888-888888888888';
    await addAccessLogEntry(admin.db, {
      workspaceId: w.gym.id,
      action: 'note.viewed',
      actorTeamMemberId: w.sarahMember.id,
      subjectClientId: w.anna.id,
      objectId: noteId,
      occurredAt: day(2),
    });
    await addAccessLogEntry(admin.db, {
      workspaceId: w.gym.id,
      action: 'client.trashed',
      actorTeamMemberId: null,
      subjectClientId: w.mark.id,
      occurredAt: day(1),
    });

    const body = (await (await read(w.gym.id, w.john)).json()) as LogBody;

    expect(body.items[0]).toMatchObject({ action: 'note.viewed', objectId: noteId });
    expect(Object.keys(body.items[0] ?? {}).sort()).toEqual([
      'action',
      'actorName',
      'actorTeamMemberId',
      'clientId',
      'clientName',
      'clientRemoved',
      'id',
      'objectId',
      'occurredAt',
    ]);
    expect(body.items[1]).toMatchObject({
      action: 'client.trashed',
      actorTeamMemberId: null,
      actorName: null,
    });
  });

  it('@isolation @permission AC6: Sarah gets 403, Mike gets 404 for John’s Gym, a client of the gym gets 403, anonymous gets 401', async () => {
    const w = await world();
    await addAccessLogEntry(admin.db, {
      workspaceId: w.gym.id,
      actorTeamMemberId: w.johnMember.id,
      subjectClientId: w.anna.id,
    });

    const refusals = {
      sarah: await read(w.gym.id, w.sarah),
      mike: await read(w.gym.id, w.mike),
      anna: await read(w.gym.id, w.annaAccount),
      anonymous: await read(w.gym.id, undefined),
    };
    const bodies = Object.fromEntries(
      await Promise.all(
        Object.entries(refusals).map(async ([who, response]) => [who, await response.text()]),
      ),
    ) as Record<keyof typeof refusals, string>;

    expect(refusals.sarah.status).toBe(403);
    expect(JSON.parse(bodies.sarah)).toEqual({ code: 'forbidden' });
    expect(refusals.mike.status).toBe(404);
    expect(refusals.anna.status).toBe(403);
    expect(refusals.anonymous.status).toBe(401);
    // A refusal says nothing of the log: no ID, no name, no entry.
    for (const [who, body] of Object.entries(bodies)) {
      for (const secret of [w.anna.id, w.johnMember.id, 'Anna', 'John', 'items']) {
        expect(body, who).not.toContain(secret);
      }
    }
  });

  it('refuses a query that does not match the contract with 400 and the field', async () => {
    const w = await world();

    for (const [query, field] of [
      ['?clientId=anna', 'clientId'],
      ['?action=client.deleted', 'action'],
      ['?pageSize=0', 'pageSize'],
      ['?pageSize=101', 'pageSize'],
      ['?page=0', 'page'],
    ] as const) {
      const response = await read(w.gym.id, w.john, query);
      expect(response.status, query).toBe(400);
      const body = (await response.json()) as { code: string; issues: { path: string }[] };
      expect(body.code, query).toBe('validation_failed');
      expect(
        body.issues.map((issue) => issue.path),
        query,
      ).toEqual([field]);
    }
  });

  it('AC23: the route is in the committed contract with its capability, Owner only', () => {
    const operation = contract.paths['/v1/workspaces/{workspaceId}/access-log'].get;

    expect(operation.operationId).toBe('listAccessLog');
    expect(operation['x-access']).toEqual({
      type: 'workspace',
      capability: 'access_log.read',
      roles: ['owner'],
      client: 'none',
    });
    expect(Object.keys(operation.responses).toSorted()).toEqual(
      ['200', '400', '401', '403', '404', '500'].toSorted(),
    );
  });
});
