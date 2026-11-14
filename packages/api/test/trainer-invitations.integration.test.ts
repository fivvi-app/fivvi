import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  organizations,
  type SignedInAccount,
  teamMembers,
  trainerInvitations,
} from '@fivvi/database';
import {
  addClient,
  addTeamRole,
  addTrainerInvitation,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import {
  createEmailContext,
  createMemoryTransport,
  createSendEmail,
  createTrainerInvitationSender,
  EmailSendError,
  emailIdempotencyKey,
} from '@fivvi/email';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { manualClock } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';
import { hashInvitationToken, invitationEmailEvent } from '../src/invitations/token.ts';

// F011 (spec #422), the first slice: the Owner invites a trainer by email, sees the pending
// invitations, sends one again or withdraws it. Synthetic people: John (Owner) and Sarah (Trainer)
// of John's Gym (default language Dutch), Lisa (no account), Mike (Owner of Fit Studio). The API
// runs as the app role, so RLS applies; EM-09 goes through the capture transport.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const BASE_URL = 'https://fivvi.example.test';
const START = '2026-11-05T10:00:00.000Z';

interface InvitationBody {
  id: string;
  name: string;
  email: string;
  emailLocale: string | null;
  sentAt: string;
  expiresAt: string;
}

describe('F011 trainer invitations', () => {
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

  /** The API with a capture transport for email and a clock the test moves. */
  function setup(overrides: Partial<ApiDependencies> = {}) {
    const transport = createMemoryTransport();
    const clock = manualClock(START);
    // A test sets `hooks.beforeSend` to look at the database at the moment the email goes out.
    const hooks: { beforeSend?: () => Promise<void> } = {};
    const sendInvitation = createTrainerInvitationSender({
      sendEmail: createSendEmail({
        transport,
        sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
        sleep: () => Promise.resolve(),
        random: () => 0,
      }),
      appBaseUrl: () => BASE_URL,
    });
    const dependencies: Partial<ApiDependencies> = {
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
      // The same sender apps/web wires, over the capture transport.
      sendTrainerInvitation: async (mail) => {
        await hooks.beforeSend?.();
        await sendInvitation(mail);
      },
      clock,
      ...overrides,
    };
    return { server: createApp({ ...NO_DEPENDENCIES, ...dependencies }), transport, clock, hooks };
  }

  /** An error reporter that keeps what it is told, for a test to look at. */
  function reporter() {
    const reported: unknown[] = [];
    const errorReporter: ApiDependencies['errorReporter'] = {
      ...createErrorReporter({ env: {} }),
      captureError: (error) => void reported.push(error),
    };
    return { reported, errorReporter };
  }

  /** John's Gym (Dutch) with John (Owner, named) and Sarah (Trainer); Fit Studio with Mike. */
  async function world(options: { defaultLocale?: 'nl-NL' | 'en' } = {}) {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    if (options.defaultLocale) {
      await admin.db
        .update(organizations)
        .set({ defaultLocale: options.defaultLocale })
        .where(eq(organizations.id, gym.id));
    }
    const john = await createAccount(admin.db, { label: 'john' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    await admin.db.update(authUsers).set({ name: 'John' }).where(eq(authUsers.id, john.id));
    const johnRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: john.id,
      role: 'owner',
    });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    const mikeRole = await addTeamRole(admin.db, {
      workspaceId: other.id,
      accountId: mike.id,
      role: 'owner',
    });
    return { gym, other, john, sarah, mike, johnRole, mikeRole };
  }

  const call = (
    server: ReturnType<typeof setup>['server'],
    method: string,
    path: string,
    who?: { id: string },
    body?: unknown,
  ) =>
    server.request(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(who ? { 'x-test-account': who.id } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const base = (workspaceId: string) => `/v1/workspaces/${workspaceId}/trainer-invitations`;
  const invite = (
    server: ReturnType<typeof setup>['server'],
    workspaceId: string,
    who: { id: string } | undefined,
    body: unknown,
  ) => call(server, 'POST', base(workspaceId), who, body);
  const list = (
    server: ReturnType<typeof setup>['server'],
    workspaceId: string,
    who?: { id: string },
  ) => call(server, 'GET', base(workspaceId), who);
  const resend = (
    server: ReturnType<typeof setup>['server'],
    workspaceId: string,
    invitationId: string,
    who?: { id: string },
  ) => call(server, 'POST', `${base(workspaceId)}/${invitationId}/resend`, who);
  const withdraw = (
    server: ReturnType<typeof setup>['server'],
    workspaceId: string,
    invitationId: string,
    who?: { id: string },
  ) => call(server, 'DELETE', `${base(workspaceId)}/${invitationId}`, who);

  const rowsOf = (workspaceId: string) =>
    admin.db
      .select()
      .from(trainerInvitations)
      .where(eq(trainerInvitations.organizationId, workspaceId))
      .orderBy(asc(trainerInvitations.createdAt), asc(trainerInvitations.id));

  /** The token in the link of an email: the last path segment of the invitation page. */
  const tokenOf = (links: readonly string[]) => {
    const link = links.find((href) => href.startsWith(`${BASE_URL}/invitations/`));
    if (!link) throw new Error('No invitation link in the email.');
    return link.slice(`${BASE_URL}/invitations/`.length);
  };

  it('AC1: John invites Lisa with the language at the default: stored lower case with a 7-day expiry, EM-09 in Dutch, listed as pending', async () => {
    const { gym, john, johnRole } = await world();
    const { server, transport } = setup();

    const response = await invite(server, gym.id, john, {
      name: '  Lisa  ',
      email: 'Lisa@Example.com',
    });

    expect(response.status).toBe(201);
    const created = (await response.json()) as InvitationBody;
    expect(created).toEqual({
      id: expect.any(String),
      name: 'Lisa',
      email: 'lisa@example.com',
      emailLocale: null,
      sentAt: START,
      expiresAt: '2026-11-12T10:00:00.000Z',
    });
    // What is stored: the lower-cased address, the inviter, the expiry and a pending status.
    const [row] = await rowsOf(gym.id);
    expect(row).toMatchObject({
      id: created.id,
      name: 'Lisa',
      email: 'lisa@example.com',
      emailLocale: null,
      inviterTeamMemberId: johnRole.id,
      status: 'pending',
      expiresAt: new Date('2026-11-12T10:00:00.000Z'),
    });
    // EM-09 went to Lisa, in Dutch, from John, with the workspace’s name and the invitation link.
    expect(transport.sent).toHaveLength(1);
    const [email] = transport.sent;
    expect(email).toMatchObject({
      to: { email: 'lisa@example.com', name: 'Lisa' },
      locale: 'nl-NL',
      template: 'trainer-invitation',
      subject: `John nodigt je uit voor ${gym.marker}`,
    });
    expect(email?.text).toContain('geldig tot donderdag 12 november 2026');
    expect(tokenOf(email?.links ?? [])).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The pending list shows it.
    const pending = await list(server, gym.id, john);
    expect(pending.status).toBe(200);
    expect(await pending.json()).toEqual([created]);
  });

  it('AC1: the inviter is the account’s name, or its address when it has none; the expiry date is in the workspace’s zone', async () => {
    const { gym, john } = await world();
    await admin.db.update(authUsers).set({ name: '' }).where(eq(authUsers.id, john.id));
    await admin.db
      .update(organizations)
      .set({ timeZone: 'Pacific/Auckland' })
      .where(eq(organizations.id, gym.id));
    const { server, transport, clock } = setup();
    // 20:00 UTC on 5 November is 09:00 on 6 November in Auckland, so the expiry is 13 November there.
    clock.set('2026-11-05T20:00:00.000Z');

    await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' });

    expect(transport.sent[0]?.subject).toBe(`${john.email} nodigt je uit voor ${gym.marker}`);
    expect(transport.sent[0]?.text).toContain('geldig tot vrijdag 13 november 2026');
  });

  it('AC2: a chosen language wins over the workspace default', async () => {
    const { gym, john } = await world({ defaultLocale: 'nl-NL' });
    const { server, transport } = setup();

    const response = await invite(server, gym.id, john, {
      name: 'Tom',
      email: 'tom@example.com',
      emailLocale: 'en',
    });

    expect(((await response.json()) as InvitationBody).emailLocale).toBe('en');
    expect(transport.sent[0]).toMatchObject({
      locale: 'en',
      subject: `John invited you to ${gym.marker}`,
    });
  });

  it('AC2: a chosen language wins over the preference of the address’s account', async () => {
    const { gym, john } = await world();
    const anna = await createAccount(admin.db, { label: 'anna' });
    await admin.db
      .update(authUsers)
      .set({ preferredLocale: 'en' })
      .where(eq(authUsers.id, anna.id));
    const { server, transport } = setup();

    await invite(server, gym.id, john, { name: 'Anna', email: anna.email, emailLocale: 'nl-NL' });

    expect(transport.sent[0]?.locale).toBe('nl-NL');
  });

  it('AC2: without a choice, the preference of the account behind the address wins over the workspace default', async () => {
    const { gym, john } = await world({ defaultLocale: 'nl-NL' });
    const anna = await createAccount(admin.db, { label: 'anna' });
    await admin.db
      .update(authUsers)
      .set({ preferredLocale: 'en' })
      .where(eq(authUsers.id, anna.id));
    const { server, transport } = setup();

    // The address is matched in any case.
    await invite(server, gym.id, john, { name: 'Anna', email: anna.email.toUpperCase() });

    expect(transport.sent[0]).toMatchObject({ locale: 'en', to: { email: anna.email } });
  });

  it('AC2: an account without a stored language, or no account at all, follows the workspace default', async () => {
    const { gym, john } = await world({ defaultLocale: 'nl-NL' });
    const anna = await createAccount(admin.db, { label: 'anna' });
    const { server, transport } = setup();

    await invite(server, gym.id, john, { name: 'Anna', email: anna.email });
    await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' });

    expect(transport.sent.map(({ locale }) => locale)).toEqual(['nl-NL', 'nl-NL']);
  });

  it('F068 AC7, AC11: the invitation names the role with the workspace’s word as it is when sent; the next one follows a change', async () => {
    const { gym, john } = await world();
    const { server, transport } = setup();
    const setWord = (trainerWord: 'trainer' | 'docent') =>
      admin.db.update(organizations).set({ trainerWord }).where(eq(organizations.id, gym.id));

    // A new workspace starts on trainer (AC2 of the spec), then John chooses docent.
    await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' });
    await setWord('docent');
    await invite(server, gym.id, john, {
      name: 'Tom',
      email: 'tom@example.com',
      emailLocale: 'en',
    });
    await invite(server, gym.id, john, { name: 'Anna', email: 'anna@example.com' });

    expect(transport.sent[0]?.text).toContain('om een trainer te worden bij');
    expect(transport.sent[1]?.text).toContain('to become a teacher at');
    expect(transport.sent[2]?.text).toContain('om een docent te worden bij');
    // What went out stays as it was.
    expect(transport.sent[0]?.text).not.toContain('docent');
  });

  it('AC2: an English workspace default reaches an address without an account in English', async () => {
    const { gym, john } = await world({ defaultLocale: 'en' });
    const { server, transport } = setup();

    await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' });

    expect(transport.sent[0]?.locale).toBe('en');
    expect(transport.sent[0]?.text).toContain('This invitation is valid until');
    expect(transport.sent[0]?.subject).toBe(
      createEmailContext({ locale: 'en' }).t('email.trainerInvitation.subject', {
        inviter: 'John',
        workspace: gym.marker,
      }),
    );
  });

  it('AC1: a blank or long name, an address that is none and a language that is not supported answer 400 and send nothing', async () => {
    const { gym, john } = await world();
    const { server, transport } = setup();
    const valid = { name: 'Lisa', email: 'lisa@example.com' };

    for (const body of [
      { ...valid, name: '   ' },
      { ...valid, name: 'x'.repeat(121) },
      { ...valid, email: 'lisa' },
      { ...valid, email: undefined },
      { ...valid, emailLocale: 'fr' },
      {},
    ]) {
      const response = await invite(server, gym.id, john, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'validation_failed' });
    }
    expect(await rowsOf(gym.id)).toEqual([]);
    expect(transport.sent).toEqual([]);
    // 120 characters and a chosen language are fine.
    expect(
      (await invite(server, gym.id, john, { ...valid, name: 'x'.repeat(120), emailLocale: 'en' }))
        .status,
    ).toBe(201);
  });

  it('F049 AC11: the idempotency key is built from EM-09 and the invitation with its token', async () => {
    const { gym, john } = await world();
    const { server, transport } = setup();
    const created = (await (
      await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })
    ).json()) as InvitationBody;
    const [row] = await rowsOf(gym.id);

    expect(transport.sent[0]?.idempotencyKey).toBe(
      emailIdempotencyKey('EM-09', invitationEmailEvent(created.id, row?.tokenHash ?? '')),
    );
  });

  it('AC7: resend sends a new link with a new expiry, and the old token stops working', async () => {
    const { gym, john } = await world();
    const { server, transport, clock } = setup();
    const created = (await (
      await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })
    ).json()) as InvitationBody;
    const oldToken = tokenOf(transport.sent[0]?.links ?? []);
    const [before] = await rowsOf(gym.id);
    clock.advance({ days: 5 });

    const response = await resend(server, gym.id, created.id, john);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...created,
      sentAt: '2026-11-10T10:00:00.000Z',
      expiresAt: '2026-11-17T10:00:00.000Z',
    });
    expect(transport.sent).toHaveLength(2);
    const newToken = tokenOf(transport.sent[1]?.links ?? []);
    expect(newToken).not.toBe(oldToken);
    expect(transport.sent[1]).toMatchObject({ to: { email: 'lisa@example.com' }, locale: 'nl-NL' });
    expect(transport.sent[1]?.text).toContain('geldig tot dinsdag 17 november 2026');
    // The stored hash is the new token's; the old token matches no invitation any more.
    const [after] = await rowsOf(gym.id);
    expect(after?.tokenHash).toBe(hashInvitationToken(newToken));
    expect(after?.tokenHash).not.toBe(before?.tokenHash);
    const hashes = (await rowsOf(gym.id)).map((row) => row.tokenHash);
    expect(hashes).not.toContain(hashInvitationToken(oldToken));
    expect(after?.expiresAt).toEqual(new Date('2026-11-17T10:00:00.000Z'));
    expect(after?.status).toBe('pending');
    // A different email message (the idempotency key follows the invitation and the token).
    expect(transport.sent[1]?.idempotencyKey).not.toBe(transport.sent[0]?.idempotencyKey);
  });

  it('AC7: resend follows the language rules again: the language chosen, else the account’s, else the workspace’s', async () => {
    const { gym, john } = await world();
    const { server, transport } = setup();
    const created = (await (
      await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })
    ).json()) as InvitationBody;
    expect(transport.sent[0]?.locale).toBe('nl-NL');
    // Lisa has made an account and chosen English since.
    const lisa = await createAccount(admin.db, { label: 'lisa' });
    await admin.db
      .update(authUsers)
      .set({ email: 'lisa@example.com', preferredLocale: 'en' })
      .where(eq(authUsers.id, lisa.id));

    await resend(server, gym.id, created.id, john);

    expect(transport.sent[1]?.locale).toBe('en');
  });

  it('AC7: withdraw voids the token and removes the invitation from the list; a withdrawn one can not be sent or withdrawn again', async () => {
    const { gym, john } = await world();
    const { server, transport } = setup();
    const created = (await (
      await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })
    ).json()) as InvitationBody;

    const response = await withdraw(server, gym.id, created.id, john);

    expect(response.status).toBe(204);
    expect(await (await list(server, gym.id, john)).json()).toEqual([]);
    // The row stays, closed: its token opens nothing (the accepting routes only open pending ones).
    expect(await rowsOf(gym.id)).toMatchObject([{ id: created.id, status: 'withdrawn' }]);
    expect((await resend(server, gym.id, created.id, john)).status).toBe(404);
    expect((await withdraw(server, gym.id, created.id, john)).status).toBe(404);
    expect(transport.sent).toHaveLength(1);
    // The address can be invited again.
    expect(
      (await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })).status,
    ).toBe(201);
  });

  it('AC7: an invitation that is not there, is closed or is another workspace’s can not be sent or withdrawn', async () => {
    const { gym, other, john, mike, mikeRole } = await world();
    const { server, transport } = setup();
    const accepted = await addTrainerInvitation(admin.db, {
      workspaceId: gym.id,
      inviterTeamMemberId:
        (await admin.db.select().from(teamMembers).where(eq(teamMembers.accountId, john.id)))[0]
          ?.id ?? '',
      status: 'accepted',
    });
    const foreign = await addTrainerInvitation(admin.db, {
      workspaceId: other.id,
      inviterTeamMemberId: mikeRole.id,
    });

    for (const id of [accepted.id, foreign.id, crypto.randomUUID()]) {
      expect((await resend(server, gym.id, id, john)).status).toBe(404);
      expect((await withdraw(server, gym.id, id, john)).status).toBe(404);
    }
    // Mike's own pending invitation is not John's to touch, and John's path does not reach it.
    expect((await rowsOf(other.id))[0]?.status).toBe('pending');
    expect(transport.sent).toEqual([]);
    expect((await resend(server, other.id, foreign.id, mike)).status).toBe(200);
  });

  it('AC8: inviting an address that is on the team answers 409 already_on_team, and nothing is sent or stored', async () => {
    const { gym, john, sarah } = await world();
    const { server, transport } = setup();

    for (const email of [sarah.email, sarah.email.toUpperCase(), john.email]) {
      const response = await invite(server, gym.id, john, { name: 'Sarah', email });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ code: 'already_on_team' });
    }
    expect(await rowsOf(gym.id)).toEqual([]);
    expect(transport.sent).toEqual([]);
  });

  it('AC8: a client of the workspace who is not on the team can be invited', async () => {
    const { gym, john } = await world();
    const tom = await createAccount(admin.db, { label: 'tom' });
    await addClient(admin.db, { workspaceId: gym.id, accountId: tom.id });
    const { server } = setup();

    const response = await invite(server, gym.id, john, { name: 'Tom', email: tom.email });

    expect(response.status).toBe(201);
  });

  it('AC8: a second invitation for an address with a pending one is not made: 409 invitation_pending names the first', async () => {
    const { gym, john } = await world();
    const { server, transport } = setup();
    const first = (await (
      await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })
    ).json()) as InvitationBody;

    const again = await invite(server, gym.id, john, { name: 'Lisa B', email: 'LISA@example.com' });

    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ code: 'invitation_pending', invitationId: first.id });
    expect(await rowsOf(gym.id)).toHaveLength(1);
    expect(transport.sent).toHaveLength(1);
  });

  it('AC8: an expired pending invitation still blocks a second one, and a resend brings it back to life', async () => {
    const { gym, john } = await world();
    const { server, clock } = setup();
    const first = (await (
      await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })
    ).json()) as InvitationBody;
    clock.advance({ days: 8 });

    const again = await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' });
    expect(again.status).toBe(409);
    // The list still shows it, with its expiry in the past, so the Owner can send it again.
    expect(((await (await list(server, gym.id, john)).json()) as InvitationBody[])[0]?.id).toBe(
      first.id,
    );
    const sentAgain = await resend(server, gym.id, first.id, john);
    expect(sentAgain.status).toBe(200);
    expect(((await sentAgain.json()) as InvitationBody).expiresAt).toBe('2026-11-20T10:00:00.000Z');
  });

  it('AC9: Sarah (Trainer) gets 403 on create, list, resend and withdraw, and nothing changes', async () => {
    const { gym, john, sarah, johnRole } = await world();
    const { server, transport } = setup();
    const existing = await addTrainerInvitation(admin.db, {
      workspaceId: gym.id,
      inviterTeamMemberId: johnRole.id,
    });

    const responses = [
      await invite(server, gym.id, sarah, { name: 'Lisa', email: 'lisa@example.com' }),
      await list(server, gym.id, sarah),
      await resend(server, gym.id, existing.id, sarah),
      await withdraw(server, gym.id, existing.id, sarah),
    ];

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: 'forbidden' });
    }
    expect(await rowsOf(gym.id)).toMatchObject([{ id: existing.id, status: 'pending' }]);
    expect(transport.sent).toEqual([]);
    // John, the Owner, may.
    expect((await list(server, gym.id, john)).status).toBe(200);
  });

  it('AC9: Mike (Owner of another workspace) gets 404 on every route of John’s Gym; anonymous gets 401', async () => {
    const { gym, mike, johnRole } = await world();
    const { server, transport } = setup();
    const existing = await addTrainerInvitation(admin.db, {
      workspaceId: gym.id,
      inviterTeamMemberId: johnRole.id,
    });

    const refused = [
      await invite(server, gym.id, mike, { name: 'Lisa', email: 'lisa@example.com' }),
      await list(server, gym.id, mike),
      await resend(server, gym.id, existing.id, mike),
      await withdraw(server, gym.id, existing.id, mike),
    ];
    for (const response of refused) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'not_found' });
    }
    const anonymous = [
      await invite(server, gym.id, undefined, { name: 'Lisa', email: 'lisa@example.com' }),
      await list(server, gym.id),
      await resend(server, gym.id, existing.id),
      await withdraw(server, gym.id, existing.id),
    ];
    for (const response of anonymous) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ code: 'not_signed_in' });
    }
    expect(await rowsOf(gym.id)).toMatchObject([{ id: existing.id, status: 'pending' }]);
    expect(transport.sent).toEqual([]);
  });

  it('AC9: the list holds the pending invitations of this workspace only, the latest first', async () => {
    const { gym, other, john, mike, johnRole, mikeRole } = await world();
    const { server, clock } = setup();
    await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' });
    clock.advance({ hours: 1 });
    await invite(server, gym.id, john, { name: 'Tom', email: 'tom@example.com' });
    await addTrainerInvitation(admin.db, {
      workspaceId: gym.id,
      inviterTeamMemberId: johnRole.id,
      status: 'declined',
    });
    await addTrainerInvitation(admin.db, {
      workspaceId: other.id,
      inviterTeamMemberId: mikeRole.id,
      email: 'someone-else@example.com',
    });

    const seen = (await (await list(server, gym.id, john)).json()) as InvitationBody[];

    expect(seen.map((invitation) => invitation.email)).toEqual([
      'tom@example.com',
      'lisa@example.com',
    ]);
    const mikes = (await (await list(server, other.id, mike)).json()) as InvitationBody[];
    expect(mikes.map((invitation) => invitation.email)).toEqual(['someone-else@example.com']);
  });

  it('AC10: only the hash of the token is stored, and the token reaches the email and nothing else', async () => {
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
    const { gym, john } = await world();
    const { server, transport } = setup({ productEvents });

    const created = (await (
      await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })
    ).json()) as InvitationBody;
    await resend(server, gym.id, created.id, john);
    await withdraw(server, gym.id, created.id, john);

    const tokens = transport.sent.map(({ links }) => tokenOf(links));
    expect(new Set(tokens).size).toBe(2);
    const stored = JSON.stringify(
      await admin.db
        .select()
        .from(trainerInvitations)
        .where(eq(trainerInvitations.organizationId, gym.id)),
    );
    const everywhere = JSON.stringify([posthog.events, lines]);
    for (const token of tokens) {
      // Not in the table, not in a response, not in the log lines or the events.
      expect(stored).not.toContain(token);
      expect(everywhere).not.toContain(token);
      expect(everywhere).not.toContain(hashInvitationToken(token));
    }
    expect(JSON.stringify(created)).not.toMatch(/token/i);
    for (const log of logs) log.mockRestore();
  });

  it('AC10: the 20th invitation of a day goes out and the 21st answers 429, and a withdrawal gives no new allowance', async () => {
    const { gym, john } = await world();
    const { server, transport, clock } = setup();
    const address = (n: number) => `invitee-${n}@example.com`;

    for (let n = 1; n <= 20; n++) {
      const response = await invite(server, gym.id, john, {
        name: `Invitee ${n}`,
        email: address(n),
      });
      expect(response.status).toBe(201);
    }
    const pending = (await (await list(server, gym.id, john)).json()) as InvitationBody[];
    await withdraw(server, gym.id, pending[0]?.id ?? '', john);
    transport.clear();

    const blocked = await invite(server, gym.id, john, { name: 'Invitee 21', email: address(21) });

    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ code: 'too_many_invitations' });
    expect(await rowsOf(gym.id)).toHaveLength(20);
    expect(transport.sent).toEqual([]);
    // Another workspace has its own allowance.
    const second = await world();
    expect(
      (await invite(setup().server, second.gym.id, second.john, { name: 'A', email: address(1) }))
        .status,
    ).toBe(201);
    // A day later the day's count has moved on.
    clock.advance({ hours: 24, minutes: 1 });
    expect(
      (await invite(server, gym.id, john, { name: 'Invitee 21', email: address(21) })).status,
    ).toBe(201);
  });

  it('AC10: invitations made at the same moment still stop at 20', async () => {
    const { gym, john } = await world();
    const { server } = setup();

    const responses = await Promise.all(
      Array.from({ length: 24 }, (_, n) =>
        invite(server, gym.id, john, { name: `Invitee ${n}`, email: `parallel-${n}@example.com` }),
      ),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(20);
    expect(statuses.filter((status) => status === 429)).toHaveLength(4);
    expect(await rowsOf(gym.id)).toHaveLength(20);
  });

  it('a duplicate is told so first, even when the day’s limit is reached', async () => {
    const { gym, john } = await world();
    const { server } = setup();
    for (let n = 1; n <= 20; n++) {
      await invite(server, gym.id, john, { name: 'Invitee', email: `invitee-${n}@example.com` });
    }

    const response = await invite(server, gym.id, john, {
      name: 'Invitee',
      email: 'invitee-3@example.com',
    });

    expect(response.status).toBe(409);
  });

  it('a failed send answers 500 and leaves nothing stored: no invitation without its email', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gym, john } = await world();
    const { reported, errorReporter } = reporter();
    const { server, transport } = setup({ errorReporter });
    transport.failNext(new EmailSendError('memory: rejected', { retryable: false }));

    const response = await invite(server, gym.id, john, {
      name: 'Lisa',
      email: 'lisa@example.com',
    });

    expect(response.status).toBe(500);
    // Only the failed send: the undo found its invitation and took it back.
    expect(reported).toHaveLength(1);
    expect(await rowsOf(gym.id)).toEqual([]);
    // The address can be invited at once; the failed try did not block it or count for the limit.
    expect(
      (await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })).status,
    ).toBe(201);
    error.mockRestore();
  });

  it('a failed resend leaves the old token working', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gym, john } = await world();
    const { server, transport } = setup();
    const created = (await (
      await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })
    ).json()) as InvitationBody;
    const [before] = await rowsOf(gym.id);
    transport.failNext(new EmailSendError('memory: rejected', { retryable: false }));

    expect((await resend(server, gym.id, created.id, john)).status).toBe(500);

    expect((await rowsOf(gym.id))[0]?.tokenHash).toBe(before?.tokenHash);
    error.mockRestore();
  });

  it('F049: the email goes out after the commit: the send sees the stored invitation', async () => {
    const { gym, john } = await world();
    const { server, transport, hooks } = setup();
    const seen: { rows: number; hash: string | undefined }[] = [];
    // `admin` is another connection: it sees the invitation only once the request committed it.
    hooks.beforeSend = async () => {
      const rows = await rowsOf(gym.id);
      seen.push({ rows: rows.length, hash: rows[0]?.tokenHash });
    };

    const response = await invite(server, gym.id, john, {
      name: 'Lisa',
      email: 'lisa@example.com',
    });

    expect(response.status).toBe(201);
    expect(transport.sent).toHaveLength(1);
    const [row] = await rowsOf(gym.id);
    expect(seen).toEqual([{ rows: 1, hash: row?.tokenHash }]);
    expect(hashInvitationToken(tokenOf(transport.sent[0]?.links ?? []))).toBe(row?.tokenHash);
  });

  it('F049: a resend is emailed after the commit: the send sees the new token stored', async () => {
    const { gym, john } = await world();
    const { server, transport, hooks } = setup();
    const created = (await (
      await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })
    ).json()) as InvitationBody;
    const [before] = await rowsOf(gym.id);
    const seen: (string | undefined)[] = [];
    hooks.beforeSend = async () => {
      seen.push((await rowsOf(gym.id))[0]?.tokenHash);
    };

    expect((await resend(server, gym.id, created.id, john)).status).toBe(200);

    const [after] = await rowsOf(gym.id);
    expect(after?.tokenHash).not.toBe(before?.tokenHash);
    expect(seen).toEqual([after?.tokenHash]);
    expect(hashInvitationToken(tokenOf(transport.sent[1]?.links ?? []))).toBe(after?.tokenHash);
  });

  it('F049: a request that rolls back sends nothing', async () => {
    const { gym, john, sarah } = await world();
    const { server, transport } = setup();
    await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' });
    transport.sent.length = 0;

    // A duplicate (409), a refusal (403), an invalid body (400) and a missing invitation (404).
    expect(
      (await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })).status,
    ).toBe(409);
    expect(
      (await invite(server, gym.id, sarah, { name: 'Tom', email: 'tom@example.com' })).status,
    ).toBe(403);
    expect(
      (await invite(server, gym.id, john, { name: '', email: 'tom@example.com' })).status,
    ).toBe(400);
    expect(
      (await resend(server, gym.id, '00000000-0000-4000-8000-000000000000', john)).status,
    ).toBe(404);

    expect(transport.sent).toEqual([]);
  });

  it('F049: a failed send undoes only that invitation, in its own workspace', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gym, other, john, mike } = await world();
    const { server, transport } = setup();
    // Mike's gym has a pending invitation for the same address and John's gym another one.
    await invite(server, other.id, mike, { name: 'Lisa', email: 'lisa@example.com' });
    await invite(server, gym.id, john, { name: 'Tom', email: 'tom@example.com' });
    transport.failNext(new EmailSendError('memory: rejected', { retryable: false }));

    const response = await invite(server, gym.id, john, {
      name: 'Lisa',
      email: 'lisa@example.com',
    });

    expect(response.status).toBe(500);
    expect((await rowsOf(gym.id)).map((row) => row.email)).toEqual(['tom@example.com']);
    expect((await rowsOf(other.id)).map((row) => row.email)).toEqual(['lisa@example.com']);
    error.mockRestore();
  });

  it('F049: a failed resend puts the old token, sending time and expiry back', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gym, john } = await world();
    const { server, transport, clock } = setup();
    const created = (await (
      await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })
    ).json()) as InvitationBody;
    const [before] = await rowsOf(gym.id);
    clock.set('2026-11-08T10:00:00.000Z');
    transport.failNext(new EmailSendError('memory: rejected', { retryable: false }));

    expect((await resend(server, gym.id, created.id, john)).status).toBe(500);

    const [after] = await rowsOf(gym.id);
    expect(after).toMatchObject({
      tokenHash: before?.tokenHash,
      sentAt: before?.sentAt,
      expiresAt: before?.expiresAt,
      status: 'pending',
    });
    error.mockRestore();
  });

  it('F049: a failed send does not delete an invitation that changed since: a newer token stays', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gym, john } = await world();
    const { reported, errorReporter } = reporter();
    const { server, transport, hooks } = setup({ errorReporter });
    // While the send is in flight another request resends the invitation: the row holds a newer token.
    hooks.beforeSend = async () => {
      await admin.db
        .update(trainerInvitations)
        .set({ tokenHash: 'newer-create-token-hash' })
        .where(eq(trainerInvitations.organizationId, gym.id));
    };
    transport.failNext(new EmailSendError('memory: rejected', { retryable: false }));

    const response = await invite(server, gym.id, john, {
      name: 'Lisa',
      email: 'lisa@example.com',
    });

    expect(response.status).toBe(500);
    const rows = await rowsOf(gym.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe('newer-create-token-hash');
    // The failed send, and the undo that found nothing of its own to take back.
    expect(reported).toHaveLength(2);
    error.mockRestore();
  });

  it('F049: a failed resend does not put the old token back over a newer one', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gym, john } = await world();
    const { reported, errorReporter } = reporter();
    const { server, transport, hooks } = setup({ errorReporter });
    const created = (await (
      await invite(server, gym.id, john, { name: 'Lisa', email: 'lisa@example.com' })
    ).json()) as InvitationBody;
    const [before] = await rowsOf(gym.id);
    hooks.beforeSend = async () => {
      await admin.db
        .update(trainerInvitations)
        .set({ tokenHash: 'newer-resend-token-hash' })
        .where(eq(trainerInvitations.organizationId, gym.id));
    };
    transport.failNext(new EmailSendError('memory: rejected', { retryable: false }));

    expect((await resend(server, gym.id, created.id, john)).status).toBe(500);

    const [after] = await rowsOf(gym.id);
    expect(after?.tokenHash).toBe('newer-resend-token-hash');
    expect(reported).toHaveLength(2);
    expect(after?.tokenHash).not.toBe(before?.tokenHash);
    error.mockRestore();
  });

  it('AC13: trainer_invited carries the workspace ID only', async () => {
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
    const { server } = setup({ productEvents });

    // A refusal, an invalid body, a duplicate and a resend record nothing.
    await invite(server, gym.id, sarah, { name: 'Lisa', email: 'lisa@example.com' });
    await invite(server, gym.id, john, { name: '', email: 'lisa@example.com' });
    await invite(server, gym.id, john, { name: 'Sarah', email: sarah.email });
    expect(posthog.events).toEqual([]);
    const created = (await (
      await invite(server, gym.id, john, {
        name: 'Geheime Naam',
        email: 'geheim@example.com',
        emailLocale: 'en',
      })
    ).json()) as InvitationBody;
    await invite(server, gym.id, john, { name: 'Geheime Naam', email: 'geheim@example.com' });
    await resend(server, gym.id, created.id, john);

    expect(posthog.events.map(({ event }) => event)).toEqual(['trainer_invited']);
    expect(
      Object.fromEntries(
        Object.entries(posthog.events[0]?.properties ?? {}).filter(([key]) => !key.startsWith('$')),
      ),
    ).toEqual({ workspace_id: gym.id });
    expect(posthog.events[0]?.distinct_id).toBe(john.id);
    const sent = JSON.stringify([posthog.events, lines]);
    for (const personal of ['Geheime Naam', 'geheim@example.com', john.email, created.id]) {
      expect(sent).not.toContain(personal);
    }
    for (const log of logs) log.mockRestore();
  });

  it('AC12: the four routes are in the committed contract with x-access for the Owner', () => {
    const collection = contract.paths['/v1/workspaces/{workspaceId}/trainer-invitations'];
    const one = contract.paths['/v1/workspaces/{workspaceId}/trainer-invitations/{invitationId}'];
    const send =
      contract.paths['/v1/workspaces/{workspaceId}/trainer-invitations/{invitationId}/resend'];

    expect(collection.post.operationId).toBe('createTrainerInvitation');
    expect(collection.get.operationId).toBe('listTrainerInvitations');
    expect(send.post.operationId).toBe('resendTrainerInvitation');
    expect(one.delete.operationId).toBe('withdrawTrainerInvitation');
    for (const operation of [collection.post, collection.get, send.post, one.delete]) {
      expect(operation['x-access']).toEqual({
        type: 'workspace',
        capability: 'team.invite',
        roles: ['owner'],
        client: 'none',
      });
    }
    expect(Object.keys(collection.post.responses)).toEqual(
      expect.arrayContaining(['201', '400', '401', '403', '404', '409', '429']),
    );
    // The token and its hash are not in any schema of the contract.
    expect(Object.keys(contract.components.schemas.TrainerInvitation.properties)).toEqual([
      'id',
      'name',
      'email',
      'emailLocale',
      'sentAt',
      'expiresAt',
    ]);
  });
});
