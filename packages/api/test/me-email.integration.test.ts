import { readFileSync } from 'node:fs';
import { createAuth, parseSignUpAllowlist } from '@fivvi/auth';
import {
  authSessions,
  authUsers,
  authVerifications,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
} from '@fivvi/database';
import { addTeamRole, createWorkspace } from '@fivvi/database/testing';
import { createMemoryTransport, createSendEmail, type MemoryTransport } from '@fivvi/email';
import { messages } from '@fivvi/i18n';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { type Clock, freezeSystemTime, manualClock } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F005 / spec #610, ticket #698: a trainer or owner changes their own email address with a code.
// Each test goes through the change as Sarah, then tries to sign in with each address.

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
const ORIGIN = 'http://localhost:3000';
const T0 = '2026-11-10T09:00:00Z';

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const INVALID_CODE = { code: 'invalid_or_expired_code' };

describe('F005 change your own email address', () => {
  let database: TestDatabase;
  let client: DatabaseClient;
  let clock = manualClock(T0);
  const memory = createMemoryTransport();
  // A runner under load sends an email late (#1269). A test closes the gate; a send to an address
  // that starts with `late-` waits at it until any other email has been sent (or `openGate` runs).
  let openGate = () => {};
  let gate = Promise.resolve();
  const closeGate = () => {
    gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
  };
  const transport: MemoryTransport = {
    ...memory,
    send: async (email) => {
      const late = email.to.email.startsWith('late-');
      if (late) await gate;
      const sent = await memory.send(email);
      if (!late) openGate();
      return sent;
    },
  };
  const pending: Promise<void>[] = [];
  const posthog = createProductEventCaptureTransport();
  const productEvents = createProductEvents({
    env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
    transport: posthog,
    errorReporter: createErrorReporter({ env: {} }),
  });
  /** Everything the server writes to the console while a test runs (AC13). */
  const logged: string[] = [];

  /** Sign-in as apps/web wires it: the real Better Auth on the test database. */
  const authAt = (at: Clock) =>
    createAuth({
      db: client.db,
      secret: SECRET,
      baseURL: ORIGIN,
      clock: at,
      signUpAllowlist: parseSignUpAllowlist(undefined),
      sendEmail: createSendEmail({
        transport,
        sender: { email: 'noreply@fivvi.app', name: 'Fivvi' },
      }),
      runInBackground: (task) => pending.push(task),
      productEvents,
    });

  /** The API as apps/web wires it, including the two email-change routes. */
  function api() {
    const signIn = authAt(clock);
    const dependencies: ApiDependencies = {
      ...NO_DEPENDENCIES,
      findSignedInAccount: (headers) => signIn.findAccount(headers),
      requestEmailChange: (input) => signIn.requestEmailChange(input),
      confirmEmailChange: (input) => signIn.confirmEmailChange(input),
      tenantScopes: createTenantScopes(() => client.db),
      clock,
      productEvents,
    };
    return createApp(dependencies);
  }

  const settle = async () => {
    await Promise.all(pending.splice(0));
  };

  const unique = (label: string) => `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;

  async function signInWith(email: string): Promise<string> {
    const server = authAt(clock);
    const post = (path: string, body: unknown) =>
      server.handler(
        new Request(`${ORIGIN}/api/auth${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: JSON.stringify(body),
        }),
      );
    await post('/sign-in/code/request', { email, locale: 'en' });
    await settle();
    const code = /\b(\d{6})\b/.exec(transport.sent.at(-1)?.text ?? '')?.[1] ?? '';
    const response = await post('/sign-in/code/verify', { email, code });
    expect(response.status).toBe(200);
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  }

  /** Whether a sign-in code requested for `email` arrives, and signs in with that code. */
  async function signInOutcome(email: string): Promise<'signed-in' | 'no-email' | 'rejected'> {
    transport.clear();
    const server = authAt(clock);
    const post = (path: string, body: unknown) =>
      server.handler(
        new Request(`${ORIGIN}/api/auth${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: JSON.stringify(body),
        }),
      );
    await post('/sign-in/code/request', { email, locale: 'en' });
    await settle();
    const sent = transport.sent.at(-1);
    if (!sent) return 'no-email';
    expect(sent.to.email).toBe(email);
    const code = /\b(\d{6})\b/.exec(sent.text)?.[1] ?? '';
    const response = await post('/sign-in/code/verify', { email, code });
    return response.status === 200 ? 'signed-in' : 'rejected';
  }

  /** An account of `email` (with a name, a language) and the cookie of its sign-in. */
  async function account(
    email: string,
    { name = 'Sarah', locale = 'en' }: { name?: string; locale?: 'en' | 'nl-NL' } = {},
  ) {
    const [row] = await client.db
      .insert(authUsers)
      .values({ email, name, emailVerified: true, preferredLocale: locale })
      .returning({ id: authUsers.id });
    const cookie = await signInWith(email);
    const token = decodeURIComponent(/session_token=([^;]+)/.exec(cookie)?.[1] ?? '');
    return { id: row?.id ?? '', email, cookie, token };
  }

  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
    server = api(),
  ) =>
    server.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  const requestChange = (cookie: string | undefined, newEmail: string, extra = {}) =>
    post('/v1/me/email/change', { newEmail }, { ...(cookie ? { cookie } : {}), ...extra });
  const confirmChange = (cookie: string | undefined, code: string, body = {}, extra = {}) =>
    post('/v1/me/email/confirm', { code, ...body }, { ...(cookie ? { cookie } : {}), ...extra });

  /** Asks for a code, waits for the email and returns its code and where it went. */
  async function askForCode(cookie: string, newEmail: string, extra = {}) {
    transport.clear();
    const response = await requestChange(cookie, newEmail, extra);
    expect(response.status).toBe(202);
    await settle();
    const email = transport.sent.at(-1);
    return { email, code: /\b(\d{6})\b/.exec(email?.text ?? '')?.[1] ?? '' };
  }

  const wrongCodeFor = (code: string) => (code === '000000' ? '000001' : '000000');

  const meOf = async (headers: Record<string, string>) => {
    const response = await api().request('/v1/me', { headers });
    expect(response.status).toBe(200);
    return (await response.json()) as { email: string; name: string | null };
  };

  const storedEmail = async (id: string) =>
    (await client.db.select().from(authUsers).where(eq(authUsers.id, id)))[0]?.email;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    client = createDatabase({ url: database.url, maxConnections: 4 });
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await client?.close();
    await database?.drop();
  });

  beforeEach(async () => {
    // An email that a request sends after its answer outlives a test that does not wait for it
    // (`answers 202`). On a loaded runner it then lands in the next test, whose `sent.at(-1)` is the
    // wrong email: the sign-in code of the account step is wrong and the sign-in answers 401 (#1269).
    openGate();
    await settle();
    clock = manualClock(T0);
    // Better Auth deletes expired verification rows by the real clock, so the system time must
    // stand at T0 too; otherwise the codes vanish once the real time passes T0 + 15 minutes (#1260).
    freezeSystemTime(T0);
    transport.clear();
    posthog.events.length = 0;
    logged.length = 0;
  });

  // Guard for #1260: Better Auth deletes expired verification rows by the real clock, so a fixed
  // T0 only works while the system time stands at T0 too. If this fails, the freeze is gone.
  it('the system time stands at T0, so no code expires by the real clock', () => {
    expect(new Date().toISOString()).toBe(new Date(T0).toISOString());
  });

  // Guard for #1269: a test that leaves a slow email in flight must not disturb the next one. The
  // first test leaves one; the second must start clean and sign in as usual.
  describe('no email outlives its test', () => {
    it('leaves a slow code email in flight', async () => {
      const sarah = await account(unique('sarah'));
      closeGate();

      const response = await requestChange(sarah.cookie, unique('late'));

      expect(response.status).toBe(202);
    });

    it('the next test starts without it and signs in with its own code', async () => {
      expect(pending).toHaveLength(0);
      expect(transport.sent).toHaveLength(0);

      const sarah = await account(unique('sarah'));

      expect(sarah.cookie).toContain('session_token=');
      expect(transport.sent).toHaveLength(1);
    });
  });

  describe('AC1: a code to the new address, nothing changed yet', () => {
    it.each(['en', 'nl-NL'] as const)(
      '(%s) the code email goes to the new address in her language',
      async (locale) => {
        const sarah = await account(unique('sarah'), { locale });
        const newEmail = unique('sarah.jansen');

        const { email, code } = await askForCode(sarah.cookie, newEmail);

        expect(email?.to.email).toBe(newEmail);
        expect(transport.sent).toHaveLength(1);
        expect(email?.locale).toBe(locale);
        expect(email?.subject).toBe(messages[locale].email.emailChangeCode.subject);
        expect(code).toMatch(/^\d{6}$/);
        // Her address is still the old one: on the profile and in the account.
        expect((await meOf({ cookie: sarah.cookie })).email).toBe(sarah.email);
        expect(await storedEmail(sarah.id)).toBe(sarah.email);
        // The old address got nothing.
        expect(transport.sent.some((sent) => sent.to.email === sarah.email)).toBe(false);
      },
    );

    it('answers 202 with an empty body', async () => {
      const sarah = await account(unique('sarah'));

      const response = await requestChange(sarah.cookie, unique('new'));

      expect(response.status).toBe(202);
      expect(await response.text()).toBe('');
    });

    it('a new request replaces the code of the earlier one', async () => {
      const sarah = await account(unique('sarah'));
      const first = await askForCode(sarah.cookie, unique('first'));
      const second = await askForCode(sarah.cookie, unique('second'));
      // One in a million: the same random code twice.
      expect(first.code).not.toBe(second.code);

      expect((await confirmChange(sarah.cookie, first.code)).status).toBe(422);
      expect((await confirmChange(sarah.cookie, second.code)).status).toBe(200);
      expect(await storedEmail(sarah.id)).toBe(second.email?.to.email);
    });
  });

  describe('AC2: changed everywhere', () => {
    it('after the code, her address is the new one on the profile and on every workspace she is on', async () => {
      const db = client.db;
      const john = await account(unique('john'), { name: 'John', locale: 'nl-NL' });
      const mike = await account(unique('mike'), { name: 'Mike' });
      const sarah = await account(unique('sarah'));
      const johnsGym = await createWorkspace(db, { label: 'johns-gym' });
      const yogaLoft = await createWorkspace(db, { label: 'yoga-loft' });
      await addTeamRole(db, { workspaceId: johnsGym.id, accountId: john.id, role: 'owner' });
      await addTeamRole(db, { workspaceId: johnsGym.id, accountId: sarah.id });
      await addTeamRole(db, { workspaceId: yogaLoft.id, accountId: mike.id, role: 'owner' });
      await addTeamRole(db, { workspaceId: yogaLoft.id, accountId: sarah.id });
      const newEmail = unique('sarah.jansen');
      const { code } = await askForCode(sarah.cookie, newEmail);

      const response = await confirmChange(sarah.cookie, code);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ id: sarah.id, email: newEmail, name: 'Sarah' });
      // The profile read returns it at once.
      expect((await meOf({ cookie: sarah.cookie })).email).toBe(newEmail);
      // Trainers in both workspaces list her with the new address, with no step by an owner.
      for (const [workspace, owner] of [
        [johnsGym, john],
        [yogaLoft, mike],
      ] as const) {
        const team = await api().request(`/v1/workspaces/${workspace.id}/team-members`, {
          headers: { cookie: owner.cookie },
        });
        const members = (await team.json()) as { email: string; name: string }[];
        expect(members.filter((member) => member.name === 'Sarah')).toEqual([
          expect.objectContaining({ email: newEmail }),
        ]);
        expect(JSON.stringify(members)).not.toContain(sarah.email);
      }
    });

    it('keeps the account: the same ID, name and a verified address', async () => {
      const sarah = await account(unique('sarah'));
      const { code } = await askForCode(sarah.cookie, unique('new'));

      await confirmChange(sarah.cookie, code);

      const [row] = await client.db.select().from(authUsers).where(eq(authUsers.id, sarah.id));
      expect(row).toMatchObject({ name: 'Sarah', emailVerified: true });
    });

    it('a code works once', async () => {
      const sarah = await account(unique('sarah'));
      const { code } = await askForCode(sarah.cookie, unique('new'));
      expect((await confirmChange(sarah.cookie, code)).status).toBe(200);

      const again = await confirmChange(sarah.cookie, code);

      expect(again.status).toBe(422);
      expect(await again.json()).toEqual(INVALID_CODE);
    });
  });

  describe('AC4: the old address no longer signs in', () => {
    it('signs in with the new address, not with the old one, and the old codes and links die', async () => {
      const sarah = await account(unique('sarah'));
      // A sign-in email asked for at the old address before the change: a code and a link.
      transport.clear();
      const post0 = (path: string, body: unknown) =>
        authAt(clock).handler(
          new Request(`${ORIGIN}/api/auth${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: ORIGIN },
            body: JSON.stringify(body),
          }),
        );
      await post0('/sign-in/code/request', { email: sarah.email, locale: 'en' });
      await settle();
      const oldMail = transport.sent.at(-1);
      const oldCode = /\b(\d{6})\b/.exec(oldMail?.text ?? '')?.[1] ?? '';
      const oldLink = oldMail?.links.find((href) => href.includes('/login/confirm')) ?? '';
      const oldToken = new URL(oldLink, ORIGIN).searchParams.get('token') ?? '';
      expect(oldToken).not.toBe('');

      const newEmail = unique('sarah.jansen');
      const { code } = await askForCode(sarah.cookie, newEmail);
      expect((await confirmChange(sarah.cookie, code)).status).toBe(200);

      expect(await signInOutcome(newEmail)).toBe('signed-in');
      expect(await signInOutcome(sarah.email)).toBe('no-email');
      expect(
        (await post0('/sign-in/code/verify', { email: sarah.email, code: oldCode })).status,
      ).toBe(401);
      expect((await post0('/sign-in/link/confirm', { token: oldToken })).status).toBe(401);
      expect((await post0('/sign-in/link/preview', { token: oldToken })).status).toBe(401);
      // Signing in with the new address is the same account.
      const cookie = await signInWith(newEmail);
      expect(((await meOf({ cookie })) as { id?: string }).id).toBe(sarah.id);
    });
  });

  describe('AC5: sessions stay', () => {
    it('her web cookie and her app bearer token stay signed in and show the new address', async () => {
      const sarah = await account(unique('sarah'));
      const sessions = (await client.db.select().from(authSessions)).length;
      const newEmail = unique('sarah.jansen');
      const { code } = await askForCode(sarah.cookie, newEmail);

      await confirmChange(sarah.cookie, code);

      expect((await meOf({ cookie: sarah.cookie })).email).toBe(newEmail);
      expect((await meOf({ authorization: `Bearer ${sarah.token}` })).email).toBe(newEmail);
      expect((await client.db.select().from(authSessions)).length).toBe(sessions);
    });
  });

  describe('AC6: wrong code, expired code, limits', () => {
    it.each([['en'], ['nl-NL']] as const)(
      '(%s) a wrong code answers that it is wrong or expired, and nothing changes',
      async (locale) => {
        const sarah = await account(unique('sarah'), { locale });
        const { code } = await askForCode(sarah.cookie, unique('new'));

        const response = await confirmChange(sarah.cookie, wrongCodeFor(code));

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual(INVALID_CODE);
        expect(await storedEmail(sarah.id)).toBe(sarah.email);
      },
    );

    it('an expired code answers the same and nothing changes', async () => {
      const sarah = await account(unique('sarah'));
      const { code } = await askForCode(sarah.cookie, unique('new'));

      clock.advance({ minutes: 15 });
      const response = await confirmChange(sarah.cookie, code);

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual(INVALID_CODE);
      expect(await storedEmail(sarah.id)).toBe(sarah.email);
    });

    it('a code works until just before it expires', async () => {
      const sarah = await account(unique('sarah'));
      const { code } = await askForCode(sarah.cookie, unique('new'));

      clock.advance({ minutes: 14, seconds: 59 });

      expect((await confirmChange(sarah.cookie, code)).status).toBe(200);
    });

    it('without a requested code nothing can be confirmed', async () => {
      const sarah = await account(unique('sarah'));

      const response = await confirmChange(sarah.cookie, '123456');

      expect(response.status).toBe(422);
      expect(await storedEmail(sarah.id)).toBe(sarah.email);
    });

    it('five wrong codes kill the code, the right one included', async () => {
      const sarah = await account(unique('sarah'));
      const { code } = await askForCode(sarah.cookie, unique('new'));

      for (let attempt = 0; attempt < 5; attempt++) {
        expect((await confirmChange(sarah.cookie, wrongCodeFor(code))).status).toBe(422);
      }
      const response = await confirmChange(sarah.cookie, code);

      expect(response.status).toBe(422);
      expect(await storedEmail(sarah.id)).toBe(sarah.email);
    });

    it('a request over the limit gets the usual answer and sends nothing', async () => {
      const sarah = await account(unique('sarah'));

      for (let attempt = 0; attempt < 3; attempt++) {
        expect((await askForCode(sarah.cookie, unique('new'))).email).toBeDefined();
      }
      const { email } = await askForCode(sarah.cookie, unique('new'));

      expect(email).toBeUndefined();
      expect(transport.sent).toHaveLength(0);
    });

    it('the limit is gone after its window', async () => {
      const sarah = await account(unique('sarah'));
      for (let attempt = 0; attempt < 4; attempt++) await askForCode(sarah.cookie, unique('new'));

      clock.advance({ minutes: 15 });

      expect((await askForCode(sarah.cookie, unique('new'))).email).toBeDefined();
    });

    it('requests for one address are limited whoever asks', async () => {
      const target = unique('target');
      const sent: boolean[] = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        const someone = await account(unique('someone'));
        sent.push((await askForCode(someone.cookie, target)).email !== undefined);
      }

      expect(sent).toEqual([true, true, true, false]);
    });

    it('a limited request replaces nothing: the code before it still works', async () => {
      const sarah = await account(unique('sarah'));
      await askForCode(sarah.cookie, unique('first'));
      await askForCode(sarah.cookie, unique('second'));
      const third = await askForCode(sarah.cookie, unique('third'));
      expect((await askForCode(sarah.cookie, unique('fourth'))).email).toBeUndefined();

      expect((await confirmChange(sarah.cookie, third.code)).status).toBe(200);
      expect(await storedEmail(sarah.id)).toBe(third.email?.to.email);
    });
  });

  describe('AC6: limits per client IP address', () => {
    const IP = { 'x-real-ip': '203.0.113.9' };

    it('over the IP limit a change request answers 202 and sends nothing', async () => {
      // Seven accounts at three requests each (the per-account limit is 3): the first 20 requests
      // are within the IP limit.
      const accounts = [];
      for (let i = 0; i < 7; i++) accounts.push(await account(unique(`ip${i}`)));
      const fresh = await account(unique('fresh'));
      transport.clear();
      for (let n = 0; n < 20; n++) {
        const sarah = accounts[Math.floor(n / 3)];
        expect((await requestChange(sarah?.cookie, unique('new'), IP)).status).toBe(202);
      }
      await settle();
      expect(transport.sent).toHaveLength(20);

      transport.clear();
      const limited = await requestChange(fresh.cookie, unique('new'), IP);
      await settle();

      expect(limited.status).toBe(202);
      expect(transport.sent).toEqual([]);
      // Another network is not limited.
      const other = await requestChange(fresh.cookie, unique('new'), {
        'x-real-ip': '203.0.113.10',
      });
      await settle();
      expect(other.status).toBe(202);
      expect(transport.sent).toHaveLength(1);
    });

    it('over the IP limit a confirm answers 422 and leaves the code alone', async () => {
      const sarah = await account(unique('sarah'));
      const newEmail = unique('sarah.jansen');
      const { code } = await askForCode(sarah.cookie, newEmail);
      const wrong = wrongCodeFor(code);
      // 30 tries from one network are within the limit. They are of an account with no pending
      // change, so none of them counts against Sarah's code.
      const other = await account(unique('other'), { name: 'Other' });
      for (let i = 0; i < 30; i++) {
        expect((await confirmChange(other.cookie, wrong, {}, IP)).status).toBe(422);
      }

      const limited = await confirmChange(sarah.cookie, code, {}, IP);

      expect(limited.status).toBe(422);
      expect(await limited.json()).toEqual(INVALID_CODE);
      expect(await storedEmail(sarah.id)).toBe(sarah.email);
      // The limited try did not count as a wrong code, and the right code works from elsewhere.
      const [verification] = await client.db
        .select()
        .from(authVerifications)
        .where(like(authVerifications.identifier, `change-email:${sarah.id}`));
      expect(verification?.failedAttempts).toBe(0);
      const elsewhere = await confirmChange(
        sarah.cookie,
        code,
        {},
        { 'x-real-ip': '203.0.113.10' },
      );
      expect(elsewhere.status).toBe(200);
      expect(await storedEmail(sarah.id)).toBe(newEmail);
    });
  });

  describe('AC7: invalid or same address', () => {
    it.each([
      ['not an address', 'not-an-address'],
      ['empty', ''],
      ['blank', '   '],
      ['no domain', 'sarah@'],
    ])('%s answers a field error and sends nothing', async (_, typed) => {
      const sarah = await account(unique('sarah'));

      transport.clear();
      const response = await requestChange(sarah.cookie, typed);
      await settle();

      expect(response.status).toBe(400);
      const json = (await response.json()) as { code: string; issues: { path: string }[] };
      expect(json.code).toBe('validation_failed');
      expect(json.issues.map((issue) => issue.path)).toEqual(['newEmail']);
      expect(transport.sent).toHaveLength(0);
    });

    it.each([
      ['as it is', (email: string) => email],
      ['in capitals', (email: string) => email.toUpperCase()],
      ['with spaces around it', (email: string) => `  ${email} `],
    ])('her own current address %s answers a field error and sends nothing', async (_, write) => {
      const sarah = await account(unique('sarah'));

      transport.clear();
      const response = await requestChange(sarah.cookie, write(sarah.email));
      await settle();

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'newEmail', code: 'same_as_current' }],
      });
      expect(transport.sent).toHaveLength(0);
    });

    it('a new address in capitals is stored in lower case', async () => {
      const sarah = await account(unique('sarah'));
      const newEmail = unique('sarah.jansen');

      const { email, code } = await askForCode(sarah.cookie, newEmail.toUpperCase());
      await confirmChange(sarah.cookie, code);

      expect(email?.to.email).toBe(newEmail);
      expect(await storedEmail(sarah.id)).toBe(newEmail);
    });

    it('a body without the address answers 400', async () => {
      const sarah = await account(unique('sarah'));

      const response = await post('/v1/me/email/change', {}, { cookie: sarah.cookie });

      expect(response.status).toBe(400);
    });
  });

  describe('AC8: an address that already has an account reveals nothing and merges nothing', () => {
    it('answers as for a free address, sends no code, and no code can change her address to it', async () => {
      const sarah = await account(unique('sarah'));
      const mike = await account(unique('mike'), { name: 'Mike' });
      const free = await requestChange(sarah.cookie, unique('free'));
      await settle();
      const forFree = { status: free.status, body: await free.text() };
      transport.clear();
      const accounts = (await client.db.select().from(authUsers)).length;

      const taken = await requestChange(sarah.cookie, mike.email);
      await settle();

      expect({ status: taken.status, body: await taken.text() }).toEqual(forFree);
      expect(transport.sent).toHaveLength(0);
      for (const guess of ['000000', '123456', '999999']) {
        const response = await confirmChange(sarah.cookie, guess);
        expect(response.status).toBe(422);
      }
      expect(await storedEmail(sarah.id)).toBe(sarah.email);
      expect(await storedEmail(mike.id)).toBe(mike.email);
      expect((await client.db.select().from(authUsers)).length).toBe(accounts);
      // Nothing signs anyone into Mike's account.
      expect(((await meOf({ cookie: mike.cookie })) as { id?: string }).id).toBe(mike.id);
      expect(((await meOf({ cookie: sarah.cookie })) as { id?: string }).id).toBe(sarah.id);
    });

    it('asking for a taken address replaces the code asked for before, as asking for a free one does', async () => {
      const sarah = await account(unique('sarah'));
      const mike = await account(unique('mike'), { name: 'Mike' });
      const { code } = await askForCode(sarah.cookie, unique('free'));

      await requestChange(sarah.cookie, mike.email);
      await settle();

      expect((await confirmChange(sarah.cookie, code)).status).toBe(422);
    });

    it('an address that got an account after the code was sent can not be confirmed', async () => {
      const sarah = await account(unique('sarah'));
      const target = unique('late');
      const { code } = await askForCode(sarah.cookie, target);
      const late = await account(target, { name: 'Late' });

      const response = await confirmChange(sarah.cookie, code);

      expect(response.status).toBe(422);
      expect(await storedEmail(sarah.id)).toBe(sarah.email);
      expect(await storedEmail(late.id)).toBe(target);
    });
  });

  describe('AC9: no owner route or button', () => {
    it('no workspace route changes the name or the email of a team member, and an invitation can not be edited', () => {
      const offenders: string[] = [];
      const bodyOf = (operation: {
        requestBody?: { content?: { 'application/json'?: { schema?: { $ref?: string } } } };
      }) => {
        const ref = operation.requestBody?.content?.['application/json']?.schema?.$ref;
        return ref ? contract.components.schemas[ref.split('/').at(-1) ?? ''] : undefined;
      };
      for (const [path, item] of Object.entries(contract.paths as Record<string, object>)) {
        if (
          !/^\/v1\/workspaces\/\{workspaceId\}\/(team-members|trainers|trainer-profile|trainer-invitations)/.test(
            path,
          )
        ) {
          continue;
        }
        for (const [method, operation] of Object.entries(item as Record<string, never>)) {
          if (!['post', 'put', 'patch'].includes(method)) continue;
          const properties = Object.keys(bodyOf(operation)?.properties ?? {});
          const isInvitation = path.includes('trainer-invitations');
          // Inviting writes a new invitation (a name and an address); nothing edits one.
          const creates = isInvitation && method === 'post' && !path.includes('{invitationId}');
          if (!creates && properties.some((name) => ['name', 'email', 'newEmail'].includes(name))) {
            offenders.push(`${method} ${path} takes ${properties.join(', ')}`);
          }
          if (isInvitation && ['put', 'patch'].includes(method)) {
            offenders.push(`${method} ${path} edits an invitation`);
          }
        }
      }
      expect(offenders).toEqual([]);
      // The only routes that take an address for an account act on the signed-in one.
      for (const path of ['/v1/me/email/change', '/v1/me/email/confirm']) {
        expect(contract.paths[path].post['x-access']).toEqual({
          type: 'account',
          workspaces: 'team',
        });
      }
    });

    it('John can not change Sarah’s name or email by any team route', async () => {
      const db = client.db;
      const john = await account(unique('john'), { name: 'John', locale: 'nl-NL' });
      const sarah = await account(unique('sarah'));
      const gym = await createWorkspace(db, { label: 'johns-gym' });
      await addTeamRole(db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
      const { id: memberId } = await addTeamRole(db, { workspaceId: gym.id, accountId: sarah.id });
      const newEmail = unique('sarah.jansen');

      for (const method of ['PATCH', 'PUT', 'POST']) {
        const response = await api().request(`/v1/workspaces/${gym.id}/team-members/${memberId}`, {
          method,
          headers: { 'content-type': 'application/json', cookie: john.cookie },
          body: JSON.stringify({ name: 'Changed', email: newEmail, newEmail, role: 'trainer' }),
        });
        expect(response.status, method).not.toBe(500);
      }
      // John calling Sarah's change route acts on John's own account, never on hers.
      const own = await requestChange(john.cookie, newEmail);
      expect(own.status).toBe(202);

      expect(await storedEmail(sarah.id)).toBe(sarah.email);
      const [row] = await client.db.select().from(authUsers).where(eq(authUsers.id, sarah.id));
      expect(row?.name).toBe('Sarah');
    });
  });

  describe('AC10: own account only; anonymous 401', () => {
    it('answers 401 without a session on both routes', async () => {
      for (const response of [
        await requestChange(undefined, unique('new')),
        await confirmChange(undefined, '123456'),
      ]) {
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ code: 'not_signed_in' });
      }
      expect(transport.sent).toHaveLength(0);
    });

    it('answers 401 for a bearer token that is no session', async () => {
      const response = await requestChange(undefined, unique('new'), {
        authorization: 'Bearer not-a-real-token',
      });

      expect(response.status).toBe(401);
    });

    it('a code asked for by one account can not be confirmed by another', async () => {
      const sarah = await account(unique('sarah'));
      const other = await account(unique('other'), { name: 'Other' });
      const { code } = await askForCode(sarah.cookie, unique('new'));

      const response = await confirmChange(other.cookie, code);

      expect(response.status).toBe(422);
      expect(await storedEmail(other.id)).toBe(other.email);
      // Hers still works, and the other account's wrong try did not count against it.
      expect((await confirmChange(sarah.cookie, code)).status).toBe(200);
    });

    it('the plugin endpoints are not served under /api/auth, whatever the body says', async () => {
      const sarah = await account(unique('sarah'));
      const victim = await account(unique('victim'), { name: 'Victim' });
      const attackerNew = unique('taken-over');
      const { code } = await askForCode(victim.cookie, unique('victim.new'));
      transport.clear();
      const server = authAt(clock);
      const direct = (path: string, body: unknown) =>
        server.handler(
          new Request(`${ORIGIN}/api/auth${path}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              origin: ORIGIN,
              cookie: sarah.cookie,
            },
            body: JSON.stringify(body),
          }),
        );

      const request = await direct('/change-email/code/request', {
        userId: victim.id,
        newEmail: attackerNew,
      });
      const confirm = await direct('/change-email/code/confirm', { userId: victim.id, code });
      await settle();

      expect(request.status).toBe(404);
      expect(confirm.status).toBe(404);
      expect(transport.sent).toEqual([]);
      expect(await storedEmail(victim.id)).toBe(victim.email);
      expect(await storedEmail(sarah.id)).toBe(sarah.email);
      // Her own pending change was not replaced by the forged request.
      expect((await confirmChange(victim.cookie, code)).status).toBe(200);
    });

    it('works with a bearer token, as the apps send it', async () => {
      const sarah = await account(unique('sarah'));
      const newEmail = unique('sarah.jansen');
      const bearer = { authorization: `Bearer ${sarah.token}` };
      transport.clear();
      expect((await requestChange(undefined, newEmail, bearer)).status).toBe(202);
      await settle();
      const code = /\b(\d{6})\b/.exec(transport.sent.at(-1)?.text ?? '')?.[1] ?? '';

      const response = await confirmChange(undefined, code, {}, bearer);

      expect(response.status).toBe(200);
      expect(await storedEmail(sarah.id)).toBe(newEmail);
    });
  });

  describe('AC13: nothing personal in events or logs', () => {
    it('records email_changed with the platform only, and no address, code or name', async () => {
      const sarah = await account(unique('sarah'), { name: 'Sarah Synthetic' });
      const newEmail = unique('sarah.jansen');
      const { code } = await askForCode(sarah.cookie, newEmail);
      posthog.events.length = 0;

      await confirmChange(sarah.cookie, code);
      await productEvents.flush();

      const changed = posthog.events.filter((event) => event.event === 'email_changed');
      expect(changed).toHaveLength(1);
      expect(changed[0]?.properties).toMatchObject({ surface: 'web' });
      const { $lib, $lib_version, token, distinct_id, ...rest } = changed[0]?.properties ?? {};
      void [$lib, $lib_version, token, distinct_id];
      expect(Object.keys(rest).filter((key) => !key.startsWith('$'))).toEqual(['surface']);
      const everything = JSON.stringify(posthog.events) + logged.join('\n');
      for (const secret of [newEmail, sarah.email, code, 'Sarah Synthetic']) {
        expect(everything).not.toContain(secret);
      }
    });

    it('an app names its surface; one that names none records nothing', async () => {
      const ios = await account(unique('ios'));
      const bare = await account(unique('bare'));
      for (const [who, body] of [
        [ios, { surface: 'ios' }],
        [bare, {}],
      ] as const) {
        const { code } = await askForCode(who.cookie, unique('new'));
        await confirmChange(undefined, code, body, { authorization: `Bearer ${who.token}` });
      }
      await productEvents.flush();

      const changed = posthog.events.filter((event) => event.event === 'email_changed');
      expect(changed.map((event) => event.properties.surface)).toEqual(['ios']);
    });

    it('a refused confirmation records nothing', async () => {
      const sarah = await account(unique('sarah'));
      const { code } = await askForCode(sarah.cookie, unique('new'));
      posthog.events.length = 0;

      await confirmChange(sarah.cookie, wrongCodeFor(code));
      await productEvents.flush();

      expect(posthog.events.filter((event) => event.event === 'email_changed')).toEqual([]);
    });

    it('stores no code: only the keyed hash', async () => {
      const sarah = await account(unique('sarah'));
      const { code } = await askForCode(sarah.cookie, unique('new'));

      const rows = await client.db.select().from(authVerifications);

      expect(JSON.stringify(rows)).not.toContain(`"${code}"`);
      expect(rows.some((row) => row.identifier.includes(sarah.id))).toBe(true);
    });
  });

  describe('AC14: the routes are in the contract', () => {
    it('declares both operations for the signed-in account', () => {
      const change = contract.paths['/v1/me/email/change'].post;
      const confirm = contract.paths['/v1/me/email/confirm'].post;

      expect(change.operationId).toBe('requestEmailChange');
      expect(confirm.operationId).toBe('confirmEmailChange');
      for (const operation of [change, confirm]) {
        expect(operation['x-access']).toEqual({ type: 'account', workspaces: 'team' });
        expect(operation.security).toEqual([{ cookieAuth: [] }, { bearerAuth: [] }]);
        expect(operation.responses['401']).toBeDefined();
      }
      expect(Object.keys(change.responses).toSorted()).toEqual(['202', '400', '401', '500']);
      expect(Object.keys(confirm.responses).toSorted()).toEqual([
        '200',
        '400',
        '401',
        '422',
        '500',
      ]);
    });

    it('keeps PATCH /v1/me to the name, the language and the booking emails', () => {
      const schema = contract.components.schemas.UpdateMeRequest;

      expect(Object.keys(schema.properties).toSorted()).toEqual([
        'bookingEmails',
        'name',
        'preferredLocale',
        'surface',
      ]);
    });
  });
});
