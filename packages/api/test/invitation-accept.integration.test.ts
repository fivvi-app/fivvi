import { readFileSync } from 'node:fs';
import { createAuth, parseSignUpAllowlist } from '@fivvi/auth';
import {
  authUsers,
  clients,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  hasPendingInvitation,
  type SignedInAccount,
  teamMembers,
  trainerInvitations,
  trainerProfiles,
} from '@fivvi/database';
import {
  addClient,
  addTeamRole,
  addTrainerInvitation,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import { createMemoryTransport, createSendEmail } from '@fivvi/email';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { fixedClock, freezeSystemTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';
import { createInvitationToken } from '../src/invitations/token.ts';

// F011 (spec #422), the second slice: the invited person reads the link, signs in with the
// emailed code (also with sign-up closed), and accepts or declines. Synthetic people: John (Owner
// of John's Gym), Sarah (Trainer there), Lisa (no account), Tom (a client of John's Gym with an
// account), Mike (Owner of Fit Studio). The API runs as the app role, so RLS applies.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
const ORIGIN = 'http://localhost:3000';
const NOT_FOUND = { code: 'not_found' };
const NOT_SIGNED_IN = { code: 'not_signed_in' };
const FORBIDDEN = { code: 'forbidden' };
// "Now" of every request, and the instants invitations are made relative to.
const NOW = new Date('2026-11-05T10:00:00.000Z');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const clock = fixedClock(NOW);

describe('F011 answering a trainer invitation', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;
  const transport = createMemoryTransport();
  const pending: Promise<void>[] = [];

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

  /** The API with the account of `x-test-account` signed in; `overrides` for a test's own sign-in. */
  function setup(overrides: Partial<ApiDependencies> = {}) {
    return createApp({
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
      clock,
      ...overrides,
    });
  }

  /** The API with the real sign-in: Better Auth with sign-up closed, as `apps/web` wires it. */
  function realSignIn() {
    // Better Auth tidies up expired rows by the system clock, which it can't take as a clock, so
    // that is frozen at the same instant as the injected one (TESTING.md §5.4).
    freezeSystemTime(NOW);
    const auth = createAuth({
      db: app.db,
      secret: SECRET,
      baseURL: ORIGIN,
      clock,
      signUpAllowlist: parseSignUpAllowlist(undefined),
      isInvitedEmail: (email, now) => hasPendingInvitation(app.db, email, now),
      runInBackground: (task) => pending.push(task),
      sendEmail: createSendEmail({
        transport,
        sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
      }),
    });
    const server = setup({
      findSignedInAccount: (headers) => auth.findAccount(headers),
      requestSignIn: (input) => auth.requestSignIn(input),
      exchangeSignInCode: (input) => auth.exchangeSignInCode(input),
    });
    return { server };
  }

  /** John's Gym with John (Owner, named) and Sarah (Trainer); Fit Studio with Mike. */
  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    const john = await createAccount(admin.db, { label: 'john' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    await admin.db.update(authUsers).set({ name: 'John' }).where(eq(authUsers.id, john.id));
    const johnRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: john.id,
      role: 'owner',
    });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id });
    await addTeamRole(admin.db, { workspaceId: other.id, accountId: mike.id, role: 'owner' });
    return { gym, other, john, sarah, mike, johnRole };
  }

  /** A pending invitation of John's Gym to `email` with a real token, which the test holds. */
  async function invitation(
    w: Awaited<ReturnType<typeof world>>,
    options: {
      name?: string;
      email?: string;
      status?: 'pending' | 'accepted' | 'declined' | 'withdrawn';
      expiresAt?: Date;
    } = {},
  ) {
    const token = createInvitationToken();
    const { id } = await addTrainerInvitation(admin.db, {
      workspaceId: w.gym.id,
      inviterTeamMemberId: w.johnRole.id,
      name: options.name ?? 'Lisa',
      email: options.email ?? 'lisa@example.com',
      tokenHash: token.hash,
      ...(options.status ? { status: options.status } : {}),
      expiresAt: options.expiresAt ?? new Date(NOW.getTime() + WEEK_MS),
    });
    return { id, token: token.token, hash: token.hash };
  }

  const request = (
    server: ReturnType<typeof setup>,
    method: string,
    path: string,
    headers: Record<string, string> = {},
  ) => server.request(path, { method, headers });
  const as = (who?: { id: string }): Record<string, string> =>
    who ? { 'x-test-account': who.id } : {};
  const read = (server: ReturnType<typeof setup>, token: string, who?: { id: string }) =>
    request(server, 'GET', `/v1/invitations/${token}`, as(who));
  const accept = (server: ReturnType<typeof setup>, token: string, who?: { id: string }) =>
    request(server, 'POST', `/v1/invitations/${token}/accept`, as(who));
  const decline = (server: ReturnType<typeof setup>, token: string, who?: { id: string }) =>
    request(server, 'POST', `/v1/invitations/${token}/decline`, as(who));

  const statusOf = async (id: string) =>
    (
      await admin.db
        .select({ status: trainerInvitations.status })
        .from(trainerInvitations)
        .where(eq(trainerInvitations.id, id))
    )[0]?.status;
  const teamRolesOf = (accountId: string) =>
    admin.db.select().from(teamMembers).where(eq(teamMembers.accountId, accountId));
  const accountCount = async () => (await admin.db.select({ n: count() }).from(authUsers))[0]?.n;

  const codeOfLastEmail = () => /\b(\d{6})\b/.exec(transport.sent.at(-1)?.text ?? '')?.[1] ?? '';

  /** Asks for a sign-in email through the contract route and waits for the work after its answer. */
  async function requestSignIn(server: ReturnType<typeof setup>, email: string) {
    transport.clear();
    const response = await server.request('/v1/sign-in/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, locale: 'nl-NL' }),
    });
    await Promise.all(pending.splice(0));
    expect(response.status).toBe(202);
  }

  const exchange = (server: ReturnType<typeof setup>, email: string, code: string) =>
    server.request('/v1/sign-in/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });

  it('AC3: Lisa, with no account and sign-up closed, signs in with the code, accepts and is a Trainer with a profile', async () => {
    const w = await world();
    const { server } = realSignIn();
    const lisa = await invitation(w, { name: 'Lisa', email: 'lisa@example.com' });
    const accountsBefore = await accountCount();

    // The invited address gets the sign-in email although sign-up is closed.
    await requestSignIn(server, 'lisa@example.com');
    expect(transport.sent).toHaveLength(1);
    const signedIn = await exchange(server, 'lisa@example.com', codeOfLastEmail());
    expect(signedIn.status).toBe(200);
    const { token: bearer } = (await signedIn.json()) as { token: string };
    expect(await accountCount()).toBe((accountsBefore ?? 0) + 1);

    const authorized = { authorization: `Bearer ${bearer}` };
    // The link shows the workspace, the inviter and the masked address.
    const preview = await request(server, 'GET', `/v1/invitations/${lisa.token}`, authorized);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toEqual({
      workspaceName: w.gym.marker,
      inviterName: 'John',
      maskedEmail: 'l***@example.com',
    });

    const response = await request(
      server,
      'POST',
      `/v1/invitations/${lisa.token}/accept`,
      authorized,
    );

    expect(response.status).toBe(200);
    const [account] = await admin.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, 'lisa@example.com'));
    expect(account?.name).toBe('Lisa');
    const [role] = await teamRolesOf(account?.id ?? '');
    expect(role).toMatchObject({ organizationId: w.gym.id, role: 'trainer' });
    const profiles = await admin.db
      .select()
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, role?.id ?? ''));
    expect(profiles).toHaveLength(1);
    expect(await statusOf(lisa.id)).toBe('accepted');
    // The answer is the workspace as the apps list it: what she lands in.
    expect(await response.json()).toEqual({
      workspaceId: w.gym.id,
      name: w.gym.marker,
      slug: w.gym.marker,
      trainerWord: 'trainer',
      role: 'trainer',
      capabilities: expect.arrayContaining(['clients.view']),
      trainsHere: true,
    });
    // And the apps' own list now shows it.
    const mine = await request(server, 'GET', '/v1/me/workspaces', authorized);
    expect(((await mine.json()) as { workspaceId: string }[]).map((x) => x.workspaceId)).toEqual([
      w.gym.id,
    ]);
  });

  it('a sign-in request for an address with no invitation and not on the allowlist gets the same answer and no email', async () => {
    const w = await world();
    const { server } = realSignIn();
    // An invitation for someone else, one withdrawn, one expired and one used do not open the gate.
    await invitation(w, { email: 'other@example.com' });
    await invitation(w, { email: 'withdrawn@example.com', status: 'withdrawn' });
    await invitation(w, { email: 'used@example.com', status: 'accepted' });
    await invitation(w, {
      email: 'expired@example.com',
      expiresAt: new Date(NOW.getTime() - 1000),
    });
    const accountsBefore = await accountCount();

    for (const email of [
      'nobody@example.com',
      'withdrawn@example.com',
      'used@example.com',
      'expired@example.com',
    ]) {
      await requestSignIn(server, email);
      expect(transport.sent, email).toHaveLength(0);
    }
    expect(await accountCount()).toBe(accountsBefore);
  });

  it('an invitation withdrawn after the sign-in email went out no longer lets the address create an account', async () => {
    const w = await world();
    const { server } = realSignIn();
    const lisa = await invitation(w, { email: 'lisa.late@example.com' });
    await requestSignIn(server, 'lisa.late@example.com');
    const code = codeOfLastEmail();
    const accountsBefore = await accountCount();
    await admin.db
      .update(trainerInvitations)
      .set({ status: 'withdrawn' })
      .where(eq(trainerInvitations.id, lisa.id));

    const response = await exchange(server, 'lisa.late@example.com', code);

    expect(response.status).toBe(401);
    expect(await accountCount()).toBe(accountsBefore);
  });

  it('AC4: Tom, a client of John’s Gym, accepts on his existing account; his client record is unchanged', async () => {
    const w = await world();
    const server = setup();
    const tom = await createAccount(admin.db, { label: 'tom' });
    const record = await addClient(admin.db, {
      workspaceId: w.gym.id,
      accountId: tom.id,
      name: 'Tom Client',
      email: tom.email,
    });
    const [clientBefore] = await admin.db.select().from(clients).where(eq(clients.id, record.id));
    const accountsBefore = await accountCount();
    const invite = await invitation(w, { name: 'Tom Trainer', email: tom.email });

    const response = await accept(server, invite.token, tom);

    expect(response.status).toBe(200);
    // No second account; the role is on the account he has, beside the client relationship.
    expect(await accountCount()).toBe(accountsBefore);
    expect(await teamRolesOf(tom.id)).toEqual([
      expect.objectContaining({ organizationId: w.gym.id, role: 'trainer' }),
    ]);
    const [clientAfter] = await admin.db.select().from(clients).where(eq(clients.id, record.id));
    expect(clientAfter).toEqual(clientBefore);
    // His own name stays: the invitation's name only fills an empty one.
    const [account] = await admin.db.select().from(authUsers).where(eq(authUsers.id, tom.id));
    expect(account?.name).toBe(tom.marker);
  });

  it('AC5: Lisa declines: no role, the invitation is closed and leaves John’s list, and it cannot be answered again', async () => {
    const w = await world();
    const server = setup();
    const lisaAccount = await createAccount(admin.db, { label: 'lisa' });
    const lisa = await invitation(w, { email: lisaAccount.email });

    const response = await decline(server, lisa.token, lisaAccount);

    expect(response.status).toBe(204);
    expect(await teamRolesOf(lisaAccount.id)).toEqual([]);
    expect(await statusOf(lisa.id)).toBe('declined');
    const listed = await request(
      server,
      'GET',
      `/v1/workspaces/${w.gym.id}/trainer-invitations`,
      as(w.john),
    );
    expect(await listed.json()).toEqual([]);
    expect((await decline(server, lisa.token, lisaAccount)).status).toBe(404);
    expect((await accept(server, lisa.token, lisaAccount)).status).toBe(404);
    expect(await teamRolesOf(lisaAccount.id)).toEqual([]);
  });

  describe('AC6: an invitation that is not valid, and one for another address', () => {
    it('expired, withdrawn, used and unknown tokens get the same neutral answer everywhere and change nothing', async () => {
      const w = await world();
      const server = setup();
      const lisaAccount = await createAccount(admin.db, { label: 'lisa' });
      const email = lisaAccount.email;
      const tokens = {
        expired: await invitation(w, { email, expiresAt: new Date(NOW.getTime() - 1000) }),
        withdrawn: await invitation(w, { email, status: 'withdrawn' }),
        used: await invitation(w, { email, status: 'accepted' }),
        declined: await invitation(w, { email, status: 'declined' }),
        unknown: { id: '', token: createInvitationToken().token, hash: '' },
      };

      for (const [kind, { token, id }] of Object.entries(tokens)) {
        for (const call of [read, accept, decline]) {
          const response = await call(server, token, lisaAccount);
          expect(response.status, `${kind} ${call.name}`).toBe(404);
          expect(await response.json()).toEqual(NOT_FOUND);
        }
        // Not even the anonymous read tells them apart.
        expect(await (await read(server, token)).json()).toEqual(NOT_FOUND);
        if (id) {
          // Nothing moved: an expired invitation is still pending, a closed one as closed.
          const unchanged = {
            expired: 'pending',
            withdrawn: 'withdrawn',
            used: 'accepted',
            declined: 'declined',
          };
          expect(await statusOf(id), kind).toBe(unchanged[kind as keyof typeof unchanged]);
        }
      }
      expect(await teamRolesOf(lisaAccount.id)).toEqual([]);
    });

    it('@permission an account with another address cannot accept or decline (403) and nothing changes; the read shows the masked address', async () => {
      const w = await world();
      const server = setup();
      const lisa = await invitation(w, { email: 'lisa@example.com' });
      const tom = await createAccount(admin.db, { label: 'tom' });

      expect(await (await accept(server, lisa.token, tom)).json()).toEqual(FORBIDDEN);
      expect((await accept(server, lisa.token, tom)).status).toBe(403);
      expect((await decline(server, lisa.token, tom)).status).toBe(403);

      expect(await statusOf(lisa.id)).toBe('pending');
      expect(await teamRolesOf(tom.id)).toEqual([]);
      const preview = await read(server, lisa.token, tom);
      expect(await preview.json()).toMatchObject({ maskedEmail: 'l***@example.com' });
    });

    it('an address that is not verified is not the invited one', async () => {
      const w = await world();
      const server = setup();
      const lisaAccount = await createAccount(admin.db, { label: 'lisa-unverified' });
      await admin.db
        .update(authUsers)
        .set({ emailVerified: false })
        .where(eq(authUsers.id, lisaAccount.id));
      const lisa = await invitation(w, { email: lisaAccount.email });

      expect((await accept(server, lisa.token, lisaAccount)).status).toBe(403);
      expect(await statusOf(lisa.id)).toBe('pending');
    });

    it('Mike, Owner of another gym, sees an invitation of John’s Gym only as its link allows', async () => {
      const w = await world();
      const server = setup();
      const lisa = await invitation(w, { email: 'lisa@example.com' });

      expect((await accept(server, lisa.token, w.mike)).status).toBe(403);
      expect(await teamRolesOf(w.mike.id)).toHaveLength(1);
    });
  });

  describe('AC9: the read is anonymous and minimal; answering needs a session', () => {
    it('shows only the workspace name, the inviter’s name and the masked address', async () => {
      const w = await world();
      const server = setup();
      const lisa = await invitation(w, { name: 'Lisa Geheim', email: 'lisa@example.com' });

      const response = await read(server, lisa.token);

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['inviterName', 'maskedEmail', 'workspaceName']);
      const text = JSON.stringify(body);
      for (const secret of [
        w.gym.id,
        lisa.id,
        lisa.hash,
        'lisa@example.com',
        'Lisa Geheim',
        w.john.email,
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it('says null for an inviter who has no name yet, never the address', async () => {
      const w = await world();
      await admin.db.update(authUsers).set({ name: '' }).where(eq(authUsers.id, w.john.id));
      const lisa = await invitation(w);

      const response = await read(setup(), lisa.token);

      expect(await response.json()).toMatchObject({ inviterName: null });
    });

    it('@permission answers accept and decline 401 without a session, for a valid, a used and an unknown token alike', async () => {
      const w = await world();
      const server = setup();
      const valid = await invitation(w);
      const used = await invitation(w, { email: 'used@example.com', status: 'accepted' });

      for (const token of [valid.token, used.token, createInvitationToken().token]) {
        for (const call of [accept, decline]) {
          const response = await call(server, token);
          expect(response.status).toBe(401);
          expect(await response.json()).toEqual(NOT_SIGNED_IN);
        }
      }
      expect(await statusOf(valid.id)).toBe('pending');
    });
  });

  it('@concurrency AC11: two parallel accepts of one invitation create one team-member record', async () => {
    const w = await world();
    const server = setup();
    const tom = await createAccount(admin.db, { label: 'tom' });
    const invite = await invitation(w, { email: tom.email });

    const answers = await Promise.all(
      Array.from({ length: 4 }, () => accept(server, invite.token, tom)),
    );

    expect(answers.map((response) => response.status).sort()).toEqual([200, 404, 404, 404]);
    const roles = await admin.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.accountId, tom.id), eq(teamMembers.organizationId, w.gym.id)));
    expect(roles).toHaveLength(1);
    expect(await statusOf(invite.id)).toBe('accepted');
  });

  it('someone already on the team just gets the workspace back, with the role they have, and the invitation is used', async () => {
    const w = await world();
    const server = setup();
    const forSarah = await invitation(w, { email: w.sarah.email });
    const forJohn = await invitation(w, { email: w.john.email });
    const rolesBefore = await admin.db.select({ n: count() }).from(teamMembers);

    const sarah = await accept(server, forSarah.token, w.sarah);
    const john = await accept(server, forJohn.token, w.john);

    expect(await sarah.json()).toMatchObject({ workspaceId: w.gym.id, role: 'trainer' });
    // An Owner stays an Owner: accepting never lowers a role.
    expect(await john.json()).toMatchObject({ workspaceId: w.gym.id, role: 'owner' });
    expect(await admin.db.select({ n: count() }).from(teamMembers)).toEqual(rolesBefore);
    expect(await statusOf(forSarah.id)).toBe('accepted');
    expect(await statusOf(forJohn.id)).toBe('accepted');
    // The Owner did not get a trainer profile by accepting.
    const johnRole = (await teamRolesOf(w.john.id))[0];
    expect(
      await admin.db
        .select()
        .from(trainerProfiles)
        .where(eq(trainerProfiles.teamMemberId, johnRole?.id ?? '')),
    ).toEqual([]);
  });

  it('AC13: the accepted and declined events carry the workspace ID only', async () => {
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
    const w = await world();
    const server = setup({ productEvents });
    const geheim = await createAccount(admin.db, { label: 'geheim' });
    const other = await createAccount(admin.db, { label: 'other' });
    const toAccept = await invitation(w, { name: 'Geheime Naam', email: geheim.email });
    const toDecline = await invitation(w, { name: 'Andere Naam', email: other.email });

    // Refusals and an anonymous call record nothing.
    await accept(server, toAccept.token);
    await accept(server, toAccept.token, other);
    await read(server, toAccept.token);
    expect(posthog.events).toEqual([]);
    await accept(server, toAccept.token, geheim);
    await decline(server, toDecline.token, other);
    await accept(server, toAccept.token, geheim);

    expect(posthog.events.map(({ event }) => event)).toEqual([
      'trainer_invitation_accepted',
      'trainer_invitation_declined',
    ]);
    for (const event of posthog.events) {
      expect(
        Object.fromEntries(
          Object.entries(event.properties ?? {}).filter(([key]) => !key.startsWith('$')),
        ),
      ).toEqual({ workspace_id: w.gym.id });
    }
    expect(posthog.events.map((event) => event.distinct_id)).toEqual([geheim.id, other.id]);
    const sent = JSON.stringify([posthog.events, lines]);
    for (const personal of [
      'Geheime Naam',
      'Andere Naam',
      geheim.email,
      other.email,
      toAccept.token,
      toAccept.hash,
      toAccept.id,
    ]) {
      expect(sent).not.toContain(personal);
    }
    for (const log of logs) log.mockRestore();
  });

  it('AC12: the three routes are in the committed contract, public in x-access, with their refusals', () => {
    const one = contract.paths['/v1/invitations/{token}'];
    const accepts = contract.paths['/v1/invitations/{token}/accept'];
    const declines = contract.paths['/v1/invitations/{token}/decline'];

    expect(one.get.operationId).toBe('getInvitation');
    expect(accepts.post.operationId).toBe('acceptInvitation');
    expect(declines.post.operationId).toBe('declineInvitation');
    for (const operation of [one.get, accepts.post, declines.post]) {
      expect(operation['x-access']).toEqual({ type: 'public' });
    }
    expect(Object.keys(accepts.post.responses)).toEqual(
      expect.arrayContaining(['200', '401', '403', '404']),
    );
    expect(Object.keys(declines.post.responses)).toEqual(
      expect.arrayContaining(['204', '401', '403', '404']),
    );
    expect(Object.keys(contract.components.schemas.InvitationPreview.properties)).toEqual([
      'workspaceName',
      'inviterName',
      'maskedEmail',
    ]);
  });
});
