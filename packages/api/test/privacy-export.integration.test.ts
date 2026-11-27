import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  accessLog,
  authUsers,
  clients,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  sessions,
} from '@fivvi/database';
import {
  addClient,
  addParticipantStatusChange,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { count, eq } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// E014 (spec #477, tickets #1177 and #1178): the Owner exports what the workspace holds about one
// client, or the whole workspace, as a ZIP. The API runs as the app role, so RLS applies; the data
// is seeded through the privileged connection. Synthetic people: John (Owner) and Sarah (Trainer) of
// John's Gym, Mike (Owner) of Fit Studio, Anna de Vries and Mark Jansen (clients of John's Gym; Mark
// is also a client of Fit Studio). Workspace time zone Europe/Amsterdam.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

/** The files of a ZIP response as text, by name; the bytes of a CSV keep their byte order mark. */
async function unpack(response: Response): Promise<Record<string, string>> {
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  return Object.fromEntries(
    Object.entries(files).map(([name, data]) => [name, decoder.decode(data)]),
  );
}

describe('E014 the Owner exports data', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 4 });
    app = createDatabase({ url: database.appUrl, maxConnections: 8 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  function events() {
    const transport = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport,
      errorReporter: createErrorReporter({ env: {} }),
    });
    return { transport, productEvents };
  }

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

  /** John's Gym (John Owner, Sarah Trainer, Anna, Mark) and Fit Studio (Mike, Mark). */
  async function world(johnLocale: 'nl-NL' | 'en' | null = 'nl-NL') {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const studio = await createWorkspace(admin.db, { label: 'fit-studio' });
    const john = await createAccount(admin.db, { label: 'john', name: 'John' });
    const sarah = await createAccount(admin.db, { label: 'sarah', name: 'Sarah' });
    const mike = await createAccount(admin.db, { label: 'mike', name: 'Mike' });
    await admin.db
      .update(authUsers)
      .set({ preferredLocale: johnLocale })
      .where(eq(authUsers.id, john.id));
    const johnMember = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: john.id,
      role: 'owner',
    });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: studio.id, accountId: mike.id, role: 'owner' });
    const anna = await addClient(admin.db, {
      workspaceId: gym.id,
      name: 'Anna de Vries',
      email: 'anna@example.com',
      emailLocale: 'nl-NL',
    });
    const mark = await addClient(admin.db, {
      workspaceId: gym.id,
      name: 'José Müller-Jansen',
      email: 'mark@example.com',
      emailLocale: 'en',
    });
    const marksOther = await addClient(admin.db, {
      workspaceId: studio.id,
      name: 'Mark at Fit Studio',
      email: 'mark@example.com',
      emailLocale: 'en',
    });
    // Mark's sessions in John's Gym: one in winter time, one in summer time, and Anna's.
    const winter = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: mark.id,
      startsAt: new Date('2026-01-15T10:00:00.000Z'),
    });
    const summer = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: mark.id,
      startsAt: new Date('2026-07-15T10:00:00.000Z'),
    });
    const annas = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: anna.id,
      startsAt: new Date('2026-03-01T10:00:00.000Z'),
    });
    const studios = await addSession(admin.db, {
      workspaceId: studio.id,
      clientId: marksOther.id,
      startsAt: new Date('2026-02-01T10:00:00.000Z'),
    });
    return {
      gym,
      studio,
      john,
      sarah,
      mike,
      johnMember,
      anna,
      mark,
      marksOther,
      winter,
      summer,
      annas,
      studios,
    };
  }

  const exportClient = (
    workspaceId: string,
    clientId: string,
    who: { id: string } | undefined,
    options: {
      query?: string;
      headers?: Record<string, string>;
      server?: ReturnType<typeof api>;
    } = {},
  ) =>
    (options.server ?? api()).request(
      `/v1/workspaces/${workspaceId}/clients/${clientId}/export${options.query ?? ''}`,
      { headers: { ...(who ? { 'x-test-account': who.id } : {}), ...options.headers } },
    );

  const exportWorkspace = (
    workspaceId: string,
    who: { id: string } | undefined,
    options: {
      query?: string;
      headers?: Record<string, string>;
      server?: ReturnType<typeof api>;
    } = {},
  ) =>
    (options.server ?? api()).request(
      `/v1/workspaces/${workspaceId}/export${options.query ?? ''}`,
      {
        headers: { ...(who ? { 'x-test-account': who.id } : {}), ...options.headers },
      },
    );

  function logOf(workspaceId: string) {
    return admin.db.select().from(accessLog).where(eq(accessLog.organizationId, workspaceId));
  }

  it('AC8: client export holds her records of this workspace only, in JSON and CSV', async () => {
    const w = await world('nl-NL');

    const response = await exportClient(w.gym.id, w.mark.id, w.john);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toMatch(
      new RegExp(
        `^attachment; filename="fivvi-[a-z0-9-]+-${w.mark.id}-\\d{4}-\\d{2}-\\d{2}\\.zip"$`,
      ),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    const files = await unpack(response);

    // README.txt in John's language, data.json, and a CSV for the profile and for her spots in sessions.
    expect(Object.keys(files).sort()).toEqual(
      ['README.txt', 'clients.csv', 'data.json', 'session_participants.csv', 'sessions.csv'].sort(),
    );
    expect(files['README.txt']).toContain('Gegevens exporteren');
    expect(files['README.txt']).toContain('sessions.csv');
    expect(files['README.txt']).not.toContain('Export data');

    // Her profile; no other client of the workspace, nothing of Fit Studio.
    const profile = files['clients.csv'] as string;
    expect(profile).toContain('mark@example.com');
    expect(profile).not.toContain('anna@example.com');
    expect(profile).not.toContain(w.marksOther.id);

    // Her sessions, with attendance: both of hers, not Anna's, not Fit Studio's.
    const participations = files['session_participants.csv'] as string;
    expect(participations).toContain(w.winter.id);
    expect(participations).toContain(w.summer.id);
    expect(participations).not.toContain(w.annas.id);
    expect(participations).toContain('attendance_status');
    const sessionsCsv = files['sessions.csv'] as string;
    expect(sessionsCsv).toContain(w.winter.id);
    expect(sessionsCsv).toContain(w.summer.id);
    expect(sessionsCsv).not.toContain(w.annas.id);
    expect(sessionsCsv).not.toContain(w.studios.id);

    // Every time in UTC and in the workspace time zone, with the zone's offset: winter and summer.
    const rows = (sessionsCsv.split('\r\n')[1] ?? '') + (sessionsCsv.split('\r\n')[2] ?? '');
    expect(sessionsCsv).toContain('starts_at,starts_at_local');
    expect(rows).toContain('2026-01-15T10:00:00.000Z,2026-01-15T11:00:00.000+01:00');
    expect(rows).toContain('2026-07-15T10:00:00.000Z,2026-07-15T12:00:00.000+02:00');

    // The JSON holds the same, and no other workspace.
    const json = JSON.parse(files['data.json'] as string) as {
      kind: string;
      clientId: string;
      workspace: { id: string; timeZone: string };
      tables: Record<string, Record<string, unknown>[]>;
    };
    expect(json.kind).toBe('client');
    expect(json.clientId).toBe(w.mark.id);
    expect(json.workspace).toMatchObject({ id: w.gym.id, timeZone: 'Europe/Amsterdam' });
    expect(Object.keys(json.tables)).toEqual(['clients', 'session_participants', 'sessions']);
    expect(json.tables.clients).toHaveLength(1);
    expect(json.tables.clients?.[0]).toMatchObject({ id: w.mark.id, email: 'mark@example.com' });
    expect(json.tables.sessions?.map((row) => row.id).sort()).toEqual(
      [w.winter.id, w.summer.id].sort(),
    );
    expect(JSON.stringify(json)).not.toContain(w.marksOther.id);
    expect(JSON.stringify(json)).not.toContain(w.studios.id);
    // No staff links, no Owner's words in a client's export.
    expect(sessionsCsv).not.toContain('cancellation_message');
    expect(sessionsCsv).not.toContain('created_by_team_member_id');
  });

  it('holds the history of her attendance, and only a kind of record she has', async () => {
    const w = await world();
    await addParticipantStatusChange(admin.db, {
      workspaceId: w.gym.id,
      sessionId: w.winter.id,
      clientId: w.mark.id,
      to: 'attended',
    });

    const files = await unpack(await exportClient(w.gym.id, w.mark.id, w.john));

    expect(Object.keys(files)).toContain('session_participant_status_changes.csv');
    expect(files['session_participant_status_changes.csv']).toContain('attended');
    // She has no payments, so no file of payments (a kind of record she does not have).
    expect(Object.keys(files).some((name) => name.startsWith('payment'))).toBe(false);
    // The staff who acted are the staff's own data.
    expect(files['session_participant_status_changes.csv']).not.toContain('actor_team_member_id');
  });

  it('an English-speaking Owner gets the read-me in English; the CSVs open in Excel with accents intact', async () => {
    const w = await world('en');

    const response = await exportClient(w.gym.id, w.mark.id, w.john);
    const raw = new Uint8Array(await response.arrayBuffer());
    const bytes = unzipSync(raw);
    const files = await unpack(
      new Response(raw.slice().buffer as ArrayBuffer, { headers: response.headers }),
    );

    expect(files['README.txt']).toContain('Export data');
    expect(files['README.txt']).not.toContain('Gegevens exporteren');
    expect(files['README.txt']).toContain('starts_at_local');
    // UTF-8 with a byte order mark (EF BB BF), and the accents are the same characters as stored.
    const profile = bytes['clients.csv'] as Uint8Array;
    expect([...profile.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(strFromU8(profile.slice(3))).toContain('José Müller-Jansen');
    expect(files['clients.csv']).toContain('José Müller-Jansen');
    expect(JSON.parse(files['data.json'] as string).tables.clients[0].name).toBe(
      'José Müller-Jansen',
    );
  });

  it('AC9: a Dutch Owner gets the workspace export’s read-me in Dutch', async () => {
    const w = await world('nl-NL');

    const response = await exportWorkspace(w.gym.id, w.john);
    const files = await unpack(response);

    expect(response.status).toBe(200);
    expect(files['README.txt']).toContain('Gegevens exporteren');
    expect(files['README.txt']).toContain('Deze ZIP bevat alle gegevens van de werkruimte');
    expect(files['README.txt']).toContain('plekken in sessies');
    expect(files['README.txt']).not.toContain('Export data');
    expect(files['README.txt']).not.toContain('This ZIP holds');
  });

  it('a spreadsheet does not run a client name as a formula', async () => {
    const w = await world();
    const sneaky = await addClient(admin.db, {
      workspaceId: w.gym.id,
      name: '=HYPERLINK("https://example.com")',
      email: 'sneaky@example.com',
    });

    const files = await unpack(await exportClient(w.gym.id, sneaky.id, w.john));

    expect(files['clients.csv']).toContain(`"'=HYPERLINK(""https://example.com"")"`);
    // JSON keeps the name as it is.
    expect(JSON.parse(files['data.json'] as string).tables.clients[0].name).toBe(
      '=HYPERLINK("https://example.com")',
    );
  });

  it('AC10: exports write one access-log entry each and leave no file on the server', async () => {
    const w = await world();
    // The server's temp directory is a fresh, empty one for this test: other test files (and other processes) write
    // to the shared one while this runs, so comparing that listing would flake.
    const sharedTmp = process.env.TMPDIR;
    const privateTmp = mkdtempSync(join(tmpdir(), 'privacy-export-tmp-'));
    process.env.TMPDIR = privateTmp;
    let afterClient: Awaited<ReturnType<typeof logOf>>;
    let afterWorkspace: Awaited<ReturnType<typeof logOf>>;
    let leftOnDisk: string[];
    try {
      await unpack(await exportClient(w.gym.id, w.mark.id, w.john));
      afterClient = await logOf(w.gym.id);
      await unpack(await exportWorkspace(w.gym.id, w.john));
      afterWorkspace = await logOf(w.gym.id);
      leftOnDisk = readdirSync(privateTmp);
    } finally {
      if (sharedTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = sharedTmp;
      rmSync(privateTmp, { recursive: true, force: true });
    }

    expect(afterClient).toHaveLength(1);
    expect(afterClient[0]).toMatchObject({
      action: 'client.exported',
      actorTeamMemberId: w.johnMember.id,
      subjectClientId: w.mark.id,
      objectId: null,
    });
    expect(afterWorkspace).toHaveLength(2);
    const workspaceEntry = afterWorkspace.find((entry) => entry.action === 'workspace.exported');
    expect(workspaceEntry).toMatchObject({
      actorTeamMemberId: w.johnMember.id,
      subjectClientId: null,
    });
    // Fit Studio's log is untouched.
    expect(await logOf(w.studio.id)).toHaveLength(0);
    // The ZIP is built for the response: nothing was written to the server's disk.
    expect(leftOnDisk).toEqual([]);
  });

  it('AC6: Sarah 403, Mike 404, anonymous 401, a client of another workspace 404; nothing is logged', async () => {
    const w = await world();
    const asks = {
      sarah: await exportClient(w.gym.id, w.mark.id, w.sarah),
      mike: await exportClient(w.gym.id, w.mark.id, w.mike),
      anonymous: await exportClient(w.gym.id, w.mark.id, undefined),
      // John names Mark's record at Fit Studio in his own workspace's path.
      otherWorkspacesClient: await exportClient(w.gym.id, w.marksOther.id, w.john),
      unknown: await exportClient(w.gym.id, crypto.randomUUID(), w.john),
    };
    const bodies = Object.fromEntries(
      await Promise.all(Object.entries(asks).map(async ([who, r]) => [who, await r.text()])),
    ) as Record<keyof typeof asks, string>;

    expect(asks.sarah.status).toBe(403);
    expect(JSON.parse(bodies.sarah)).toEqual({ code: 'forbidden' });
    expect(asks.mike.status).toBe(404);
    expect(asks.anonymous.status).toBe(401);
    expect(asks.otherWorkspacesClient.status).toBe(404);
    expect(asks.unknown.status).toBe(404);
    for (const [who, body] of Object.entries(bodies)) {
      for (const secret of ['mark@example.com', 'José', 'PK']) {
        expect(body, who).not.toContain(secret);
      }
    }
    expect(await logOf(w.gym.id)).toHaveLength(0);

    // The same three answers for the whole workspace.
    expect((await exportWorkspace(w.gym.id, w.sarah)).status).toBe(403);
    expect((await exportWorkspace(w.gym.id, w.mike)).status).toBe(404);
    expect((await exportWorkspace(w.gym.id, undefined)).status).toBe(401);
    expect(await logOf(w.gym.id)).toHaveLength(0);
  });

  it('AC24: data_exported carries the workspace ID, the kind and the platform only', async () => {
    const w = await world();
    const { transport, productEvents } = events();
    const server = api({ productEvents });

    await unpack(await exportClient(w.gym.id, w.mark.id, w.john, { server }));
    await unpack(await exportWorkspace(w.gym.id, w.john, { server }));
    // An app names its platform; one that names none records nothing.
    await unpack(
      await exportWorkspace(w.gym.id, w.john, {
        server,
        query: '?surface=ios',
        headers: { authorization: 'Bearer token' },
      }),
    );
    await unpack(
      await exportWorkspace(w.gym.id, w.john, {
        server,
        headers: { authorization: 'Bearer token' },
      }),
    );
    // A refusal records nothing.
    await exportWorkspace(w.gym.id, w.sarah, { server });
    await productEvents.flush();

    const sent = transport.events.filter((event) => event.event === 'data_exported');
    expect(sent.map((event) => event.properties)).toEqual([
      expect.objectContaining({ workspace_id: w.gym.id, kind: 'client', platform: 'web' }),
      expect.objectContaining({ workspace_id: w.gym.id, kind: 'workspace', platform: 'web' }),
      expect.objectContaining({ workspace_id: w.gym.id, kind: 'workspace', platform: 'ios' }),
    ]);
    // Nothing of the data: no client ID, name or email address.
    const text = JSON.stringify(transport.events);
    for (const secret of [w.mark.id, w.anna.id, 'mark@example.com', 'Müller', 'Anna']) {
      expect(text).not.toContain(secret);
    }
    for (const event of sent) {
      expect(
        Object.keys(event.properties)
          .filter((key) => !key.startsWith('$'))
          .sort(),
      ).toEqual(['kind', 'platform', 'workspace_id'].sort());
    }
  });

  it('AC9: workspace export is complete, isolated and under 30 s for 300 clients', async () => {
    const gym = await createWorkspace(admin.db, { label: 'big-gym' });
    const other = await createWorkspace(admin.db, { label: 'other-gym' });
    const owner = await createAccount(admin.db, { label: 'owner' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: owner.id, role: 'owner' });
    const people = [];
    for (let i = 0; i < 300; i += 1) {
      people.push(
        await addClient(admin.db, {
          workspaceId: gym.id,
          name: `Klant ${i}`,
          email: `klant${i}@example.com`,
        }),
      );
    }
    const strangers = await addClient(admin.db, {
      workspaceId: other.id,
      name: 'Vreemde klant',
      email: 'vreemd@example.com',
    });
    await addSession(admin.db, { workspaceId: other.id, clientId: strangers.id });
    // A year of sessions: three a day, each with one client; more than one batch of rows.
    const year = new Date('2026-01-01T07:00:00.000Z').getTime();
    let n = 0;
    for (let day = 0; day < 365; day += 1) {
      for (let slot = 0; slot < 3; slot += 1) {
        await addSession(admin.db, {
          workspaceId: gym.id,
          clientId: (people[n % people.length] as { id: string }).id,
          startsAt: new Date(year + day * 86_400_000 + slot * 3_600_000),
        });
        n += 1;
      }
    }

    const started = Date.now();
    const response = await exportWorkspace(gym.id, owner);
    const files = await unpack(response);
    const elapsed = Date.now() - started;

    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(30_000);
    // Complete: the same number of rows as the database holds for this workspace.
    const [{ n: clientCount } = { n: 0 }] = await admin.db
      .select({ n: count() })
      .from(clients)
      .where(eq(clients.organizationId, gym.id));
    const [{ n: sessionCount } = { n: 0 }] = await admin.db
      .select({ n: count() })
      .from(sessions)
      .where(eq(sessions.organizationId, gym.id));
    expect(clientCount).toBe(300);
    expect(sessionCount).toBe(1095);
    const json = JSON.parse(files['data.json'] as string) as {
      tables: Record<string, { id: string }[]>;
    };
    expect(json.tables.clients).toHaveLength(300);
    expect(json.tables.sessions).toHaveLength(1095);
    expect(json.tables.session_participants).toHaveLength(1095);
    expect(new Set(json.tables.sessions?.map((row) => row.id)).size).toBe(1095);
    // The CSV holds the same: a header and a line per record, and the registry's tables are all there.
    expect((files['sessions.csv'] as string).trim().split('\r\n')).toHaveLength(1096);
    expect((files['clients.csv'] as string).trim().split('\r\n')).toHaveLength(301);
    expect(Object.keys(json.tables)).toEqual(
      expect.arrayContaining(['organizations', 'team_members', 'clients', 'sessions', 'locations']),
    );
    expect(json.tables.organizations).toHaveLength(1);
    expect(files['README.txt']).toContain('Export data');
    // Isolated: nothing of the other workspace.
    const text = Object.values(files).join('\n');
    expect(text).not.toContain(strangers.id);
    expect(text).not.toContain('Vreemde klant');
    expect(text).not.toContain(other.id);
  }, 120_000);

  it('AC23: both routes are in the committed contract with their capability, and the clients are regenerated', () => {
    const client = contract.paths['/v1/workspaces/{workspaceId}/clients/{clientId}/export'].get;
    const workspace = contract.paths['/v1/workspaces/{workspaceId}/export'].get;

    expect(client.operationId).toBe('exportClient');
    expect(client['x-access']).toEqual({
      type: 'workspace',
      capability: 'client.export',
      roles: ['owner'],
      client: 'none',
    });
    expect(workspace.operationId).toBe('exportWorkspace');
    expect(workspace['x-access']).toEqual({
      type: 'workspace',
      capability: 'workspace.export',
      roles: ['owner'],
      client: 'none',
    });
    for (const operation of [client, workspace]) {
      expect(Object.keys(operation.responses).sort()).toEqual(
        ['200', '400', '401', '403', '404', '500'].sort(),
      );
      expect(Object.keys(operation.responses['200'].content)).toEqual(['application/zip']);
    }
    // The TS, Swift and Kotlin clients were generated from it.
    const root = new URL('../../contract/', import.meta.url);
    expect(readFileSync(new URL('src/generated/schema.ts', root), 'utf8')).toContain(
      'exportClient',
    );
    expect(
      readFileSync(new URL('swift/Sources/FivviAPI/Generated/Client.swift', root), 'utf8'),
    ).toContain('exportWorkspace');
    expect(
      readFileSync(new URL('kotlin/generated/app/fivvi/api/apis/PrivacyApi.kt', root), 'utf8'),
    ).toContain('exportClient');
  });
});
