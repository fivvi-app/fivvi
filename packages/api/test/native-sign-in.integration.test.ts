import { createAuth, parseSignUpAllowlist } from '@fivvi/auth';
import {
  authRateLimits,
  authSessions,
  authUsers,
  authVerifications,
  createDatabase,
  type DatabaseClient,
} from '@fivvi/database';
import { seed } from '@fivvi/database/seed';
import { createMemoryTransport, createSendEmail, type SendEmail } from '@fivvi/email';
import { type Locale, messages } from '@fivvi/i18n';
import { createCaptureTransport, createErrorReporter } from '@fivvi/observability';
import { freezeSystemTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, ne } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
const ORIGIN = 'http://localhost:3000';
const T0 = '2026-03-31T10:00:00Z';
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const UNAUTHORIZED = { code: 'unauthorized' };

/** A code that is not `code`, for a wrong attempt. */
const wrongCodeFor = (code: string) => (code === '000000' ? '000001' : '000000');

/** What an app or an attacker sees of an answer: status, body and every header (cookies too). */
const answer = async (response: Response) => ({
  status: response.status,
  body: await response.text(),
  headers: [...response.headers.entries()].sort(),
});

// The native sign-in routes of the contract (spec #168, AC3, AC4, AC16) against the real Better
// Auth on a real Postgres, with the email in memory: the same verification, rules and sessions as
// the web, answered to an app that holds a bearer token instead of a cookie.
describe('F001N native sign-in through the API', () => {
  let database: TestDatabase;
  let client: DatabaseClient;
  const transport = createMemoryTransport();
  /** The work a sign-in request does after its answer; `requestSignIn` waits for it. */
  const pending: Promise<void>[] = [];
  let allowlist = parseSignUpAllowlist(undefined);

  /** The API as apps/web wires it: every sign-in dependency is `packages/auth`'s. */
  function api(
    overrides: {
      sendEmail?: SendEmail;
      reportError?: (error: unknown) => void;
      dependencies?: Partial<ApiDependencies>;
    } = {},
  ) {
    const auth = createAuth({
      db: client.db,
      secret: SECRET,
      baseURL: ORIGIN,
      signUpAllowlist: allowlist,
      runInBackground: (task) => pending.push(task),
      sendEmail:
        overrides.sendEmail ??
        createSendEmail({
          transport,
          sender: { email: 'noreply@fivvi.app', name: 'Fivvi' },
        }),
      ...(overrides.reportError && { reportError: overrides.reportError }),
    });
    const dependencies: ApiDependencies = {
      ...NO_DEPENDENCIES,
      findSignedInAccount: (headers) => auth.findAccount(headers),
      requestSignIn: (input) => auth.requestSignIn(input),
      exchangeSignInCode: (input) => auth.exchangeSignInCode(input),
      signOutBearer: (headers) => auth.signOutBearer(headers),
      ...overrides.dependencies,
    };
    return { app: createApp(dependencies), auth };
  }

  /** A JSON POST, as an app sends it. */
  const jsonPost = (body: unknown, headers: Record<string, string> = {}) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    api().app.request(path, jsonPost(body, headers));

  /** Asks for a sign-in email through the contract route and waits for it to be sent. */
  async function requestSignIn(
    email: string,
    locale: Locale = 'en',
    headers: Record<string, string> = {},
  ) {
    const response = await post('/v1/sign-in/request', { email, locale }, headers);
    await Promise.all(pending.splice(0));
    return response;
  }

  const exchange = (email: string, code: string, headers: Record<string, string> = {}) =>
    post('/v1/sign-in/token', { email, code }, headers);

  const codeOf = (count = 1) => {
    expect(transport.sent).toHaveLength(count);
    return /\b(\d{6})\b/.exec(transport.sent.at(-1)?.text ?? '')?.[1] ?? '';
  };

  /** The token of the link in the last email sent, as the confirm page would read it. */
  const linkTokenOf = () => {
    const link = transport.sent.at(-1)?.links.find((href) => href.includes('/login/confirm'));
    return new URL(link ?? '', ORIGIN).searchParams.get('token');
  };

  /** Moves the frozen clock to `ms` after `T0`. */
  const passTime = (ms: number) => vi.setSystemTime(new Date(new Date(T0).getTime() + ms));

  /** Signs `email` in through the native routes and returns the bearer token. */
  async function signInWithToken(email = 'owner@example.com'): Promise<string> {
    transport.clear();
    await requestSignIn(email);
    const response = await exchange(email, codeOf());
    expect(response.status).toBe(200);
    const { token } = (await response.json()) as { token: string };
    return token;
  }

  const me = (headers: Record<string, string>) => api().app.request('/v1/me', { headers });
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const signOut = (headers: Record<string, string>) =>
    api().app.request('/v1/sign-out', { method: 'POST', headers });

  /** A request of the web's sign-in page to Better Auth's endpoints, as `fetch` in a browser sends it. */
  const webPost = (path: string, body: unknown) =>
    api().auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify(body),
      }),
    );

  /** Asks the web's sign-in page for a code and waits for the email to be sent. */
  async function webRequestSignIn(email = 'owner@example.com', locale: Locale = 'en') {
    const response = await webPost('/sign-in/code/request', { email, locale });
    await Promise.all(pending.splice(0));
    return response;
  }

  /** The account of `email`, if it has one. */
  const accountOf = async (email: string) =>
    (await client.db.select().from(authUsers).where(eq(authUsers.email, email)))[0];

  /** `count` wrong attempts at the code step, from the app or from the web: each is a 401. */
  async function wrongCodes(count: number, email: string, wrong: string, from = 'app') {
    for (let i = 0; i < count; i++) {
      const response =
        from === 'web'
          ? await webPost('/sign-in/code/verify', { email, code: wrong })
          : await exchange(email, wrong);
      expect(response.status).toBe(401);
    }
  }

  /** Signs the web in with the code and returns the response of the code step. */
  async function webSignIn(email = 'owner@example.com'): Promise<Response> {
    transport.clear();
    await webRequestSignIn(email);
    const response = await webPost('/sign-in/code/verify', { email, code: codeOf() });
    expect(response.status).toBe(200);
    return response;
  }

  /** Signs the web in with the code and returns the cookie header the browser would send. */
  async function webCookie(email = 'owner@example.com'): Promise<string> {
    const response = await webSignIn(email);
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  }

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    client = createDatabase({ url: database.url, maxConnections: 4 });
    await seed(client.db);
  });

  afterAll(async () => {
    await client?.close();
    await database?.drop();
  });

  beforeEach(async () => {
    // Every test runs at T0, so no result depends on the real clock; `passTime` moves it.
    freezeSystemTime(T0);
    transport.clear();
    pending.length = 0;
    allowlist = parseSignUpAllowlist(undefined);
    await client.db.delete(authVerifications);
    await client.db.delete(authRateLimits);
    await client.db.delete(authSessions);
    await client.db.delete(authUsers).where(ne(authUsers.email, 'owner@example.com'));
  });

  describe.each(['nl-NL', 'en'] as const)('interface language %s', (locale) => {
    it('AC1: a request is a 202 without a body and sends one email with link and code', async () => {
      // A new account has no stored language yet, so the interface language decides (ADR-019).
      allowlist = parseSignUpAllowlist('newcomer@example.com');

      const response = await requestSignIn('newcomer@example.com', locale);

      expect(response.status).toBe(202);
      expect(await response.text()).toBe('');
      expect(transport.sent).toHaveLength(1);
      const [email] = transport.sent;
      expect(email?.to.email).toBe('newcomer@example.com');
      expect(email?.locale).toBe(locale);
      expect(email?.subject).toBe(messages[locale].email.signIn.subject);
      expect(email?.text).toContain(messages[locale].email.signIn.intro);
      expect(codeOf()).toMatch(/^\d{6}$/);
      expect(email?.links.some((href) => href.includes('/login/confirm?token='))).toBe(true);
    });

    it('AC3: code for a token sets no cookie', async () => {
      await requestSignIn('owner@example.com', locale);

      const response = await exchange('owner@example.com', codeOf());

      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(response.headers.get('set-cookie')).toBeNull();
      const body = (await response.json()) as { token: string };
      expect(Object.keys(body)).toEqual(['token']);
      expect(body.token).toEqual(expect.any(String));
      expect(body.token.length).toBeGreaterThan(20);
    });
  });

  it('AC3: the token is a sign-in session of the account', async () => {
    const token = await signInWithToken();

    const [session] = await client.db
      .select({ email: authUsers.email, expiresAt: authSessions.expiresAt })
      .from(authSessions)
      .innerJoin(authUsers, eq(authUsers.id, authSessions.userId));
    expect(session?.email).toBe('owner@example.com');
    expect(session?.expiresAt).toEqual(new Date(new Date(T0).getTime() + 30 * DAY_MS));
    expect(token).not.toContain(' ');
  });

  describe("AC7: allowlisted first sign-in creates the account with the app's language", () => {
    describe.each(['nl-NL', 'en'] as const)('interface language %s', (locale) => {
      it('the first sign-in of an allowed address creates the account in that language', async () => {
        allowlist = parseSignUpAllowlist('newcomer@example.com');
        await requestSignIn('newcomer@example.com', locale);
        expect(await accountOf('newcomer@example.com')).toBeUndefined();

        const response = await exchange('newcomer@example.com', codeOf());

        expect(response.status).toBe(200);
        const { token } = (await response.json()) as { token: string };
        const account = await me(bearer(token));
        expect(await account.json()).toMatchObject({
          email: 'newcomer@example.com',
          preferredLocale: locale,
        });
        expect(await accountOf('newcomer@example.com')).toMatchObject({
          emailVerified: true,
          preferredLocale: locale,
        });
      });

      it('a later sign-in with the other language neither changes it nor the language of the email', async () => {
        allowlist = parseSignUpAllowlist('newcomer@example.com');
        await requestSignIn('newcomer@example.com', locale);
        expect((await exchange('newcomer@example.com', codeOf())).status).toBe(200);
        const other = locale === 'en' ? 'nl-NL' : 'en';
        transport.clear();

        await requestSignIn('newcomer@example.com', other);
        expect((await exchange('newcomer@example.com', codeOf())).status).toBe(200);

        // ADR-019: the stored language comes before the language of the screen.
        expect(transport.sent[0]?.locale).toBe(locale);
        expect(await accountOf('newcomer@example.com')).toMatchObject({ preferredLocale: locale });
      });
    });

    it('the sign-in of an address without an account that is not allowed creates none', async () => {
      allowlist = parseSignUpAllowlist('someone-else@example.com');
      await requestSignIn('nobody@example.com', 'en');

      // Not even a code that guesses right: there is no verification, so no account.
      const response = await exchange('nobody@example.com', '123456');

      expect(response.status).toBe(401);
      expect(await accountOf('nobody@example.com')).toBeUndefined();
    });
  });

  describe('AC4: authenticated call with a bearer token', () => {
    it('GET /v1/me answers 200 with the account for a valid bearer token', async () => {
      const token = await signInWithToken();

      const response = await me(bearer(token));

      expect(response.status).toBe(200);
      const row = await accountOf('owner@example.com');
      expect(await response.json()).toEqual({
        id: row?.id,
        email: 'owner@example.com',
        preferredLocale: 'nl-NL',
      });
    });

    it('answers 401 without a token, with an unknown one and with a malformed header', async () => {
      const token = await signInWithToken();
      const headers: Record<string, string>[] = [
        {},
        bearer('not-a-real-token'),
        bearer(`${token}x`),
        bearer(token.slice(0, -2)),
        { authorization: 'Bearer' },
        { authorization: 'Bearer ' },
        { authorization: token },
        { authorization: `Basic ${token}` },
      ];

      for (const header of headers) {
        const response = await me(header);
        expect(response.status, JSON.stringify(header)).toBe(401);
        expect(await response.json()).toEqual(UNAUTHORIZED);
      }
    });

    it('an invalid bearer token is a 401 even with a valid cookie, and a cookie alone still works', async () => {
      const cookie = await webCookie();

      const withCookie = await me({ cookie });
      expect(withCookie.status).toBe(200);

      for (const authorization of ['Bearer not-a-real-token', 'Bearer', 'Basic abc']) {
        const withBoth = await me({ cookie, authorization });
        expect(withBoth.status, authorization).toBe(401);
        expect(await withBoth.json()).toEqual(UNAUTHORIZED);
      }
    });

    it('a valid bearer token wins over an invalid cookie', async () => {
      const token = await signInWithToken();

      const response = await me({
        ...bearer(token),
        cookie: 'better-auth.session_token=not-a-real-session',
      });

      expect(response.status).toBe(200);
    });

    it('the web route guard reads cookies only: a bearer token alone is no session there', async () => {
      const token = await signInWithToken();
      const cookie = await webCookie();
      const { auth } = api();

      expect((await auth.readSession(new Headers(bearer(token)))).account).toBeUndefined();
      expect(
        (await auth.readSession(new Headers({ ...bearer('not-a-real-token'), cookie }))).account,
      ).toMatchObject({ email: 'owner@example.com' });
    });

    it('answers 401 for an expired sign-in session', async () => {
      const token = await signInWithToken();
      await client.db
        .update(authSessions)
        .set({ expiresAt: new Date(new Date(T0).getTime() - 1000) });

      expect((await me(bearer(token))).status).toBe(401);
    });
  });

  describe('AC8: bearer sign-in session lasts 30 days and renews on use', () => {
    it('the token lasts 30 days after its last use and each use renews it', async () => {
      const token = await signInWithToken();
      const at = (days: number) => passTime(days * DAY_MS);

      at(20);
      expect((await me(bearer(token))).status).toBe(200);
      // 20 + 29 days: more than 30 days after the sign-in, 29 after the last use.
      at(49);
      expect((await me(bearer(token))).status).toBe(200);
      at(49 + 31);
      expect((await me(bearer(token))).status).toBe(401);
    });

    it('a token that is not used for 30 days no longer works', async () => {
      const token = await signInWithToken();

      passTime(31 * DAY_MS);

      expect((await me(bearer(token))).status).toBe(401);
    });
  });

  describe('AC10: sign-out ends this sign-in session only', () => {
    it('answers 204 and the token is a 401 afterwards', async () => {
      const token = await signInWithToken();

      const response = await signOut(bearer(token));

      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect((await me(bearer(token))).status).toBe(401);
      expect(await client.db.select().from(authSessions)).toEqual([]);
    });

    it('keeps the other phones and browsers of the account signed in', async () => {
      const first = await signInWithToken();
      const second = await signInWithToken();
      const cookie = await webCookie();

      expect((await signOut(bearer(first))).status).toBe(204);

      expect((await me(bearer(first))).status).toBe(401);
      expect((await me(bearer(second))).status).toBe(200);
      expect((await me({ cookie })).status).toBe(200);
    });

    it('needs a valid bearer token: none, an unknown one or a cookie alone get 401', async () => {
      const cookie = await webCookie();

      // An unknown bearer next to a valid cookie must not fall back to the cookie either.
      const attempts: Record<string, string>[] = [
        {},
        bearer('not-a-real-token'),
        { cookie },
        { cookie, ...bearer('not-a-real-token') },
      ];
      for (const headers of attempts) {
        const response = await signOut(headers);
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual(UNAUTHORIZED);
      }
      // The browser's session was not ended by any of them.
      expect((await me({ cookie })).status).toBe(200);
    });
  });

  // The web keeps cookies only (spec #168, Out of Scope): the session of a browser must stay
  // out of reach of page script (HttpOnly), and no credential that script can read may work
  // as a bearer token.
  describe('the web gets no bearer token', () => {
    const exposes = (response: Response) =>
      (response.headers.get('access-control-expose-headers') ?? '').toLowerCase();

    it('the code step of the sign-in page sets the cookie and nothing script can read', async () => {
      const response = await webSignIn();

      expect(response.headers.getSetCookie().join('; ')).toContain('HttpOnly');
      expect(response.headers.get('set-auth-token')).toBeNull();
      expect(exposes(response)).not.toContain('set-auth-token');
    });

    it('the link step of the confirm page sets the cookie and nothing script can read', async () => {
      await requestSignIn('owner@example.com');

      const response = await webPost('/sign-in/link/confirm', { token: linkTokenOf() });

      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie().join('; ')).toContain('HttpOnly');
      expect(response.headers.get('set-auth-token')).toBeNull();
      expect(exposes(response)).not.toContain('set-auth-token');
    });

    it('the session token that get-session and list-sessions show to script is no bearer token', async () => {
      const cookie = await webCookie();
      const read = (path: string) =>
        api().auth.handler(new Request(`${ORIGIN}/api/auth${path}`, { headers: { cookie } }));
      const shown = [
        ((await (await read('/get-session')).json()) as { session: { token: string } }).session
          .token,
        ((await (await read('/list-sessions')).json()) as { token: string }[])[0]?.token ?? '',
      ];
      const [stored] = await client.db.select().from(authSessions);

      for (const token of [...shown, stored?.token ?? '']) {
        expect(token.length).toBeGreaterThan(10);
        const response = await me(bearer(token));
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual(UNAUTHORIZED);
        expect((await signOut(bearer(token))).status).toBe(401);
      }
      expect((await me({ cookie })).status).toBe(200);
    });

    it('the bearer token is the browser session cookie value, so a stolen cookie is the same credential either way', async () => {
      // The token is the signed value of the session cookie, which is all a thief of the cookie
      // has too: the cookie works as a cookie as well, so a bearer request gives no more power.
      // The HttpOnly cookie is what keeps it out of page script.
      const cookie = await webCookie();
      const value = decodeURIComponent(cookie.split('=').slice(1).join('='));

      expect((await me(bearer(value))).status).toBe(200);
    });
  });

  describe('the token route counts per client IP', () => {
    const IP = { 'x-real-ip': '203.0.113.9' };

    it('answers the neutral 401 over the limit, even for the right code, and keeps the code', async () => {
      await requestSignIn('owner@example.com');
      const code = codeOf();
      for (let i = 0; i < 30; i++) {
        expect((await exchange(`nobody${i}@example.com`, '000000', IP)).status).toBe(401);
      }

      const limited = await exchange('owner@example.com', code, IP);

      expect(limited.status).toBe(401);
      expect(await limited.json()).toEqual(UNAUTHORIZED);
      expect(limited.headers.getSetCookie()).toEqual([]);
      // The limited attempt did not count as a wrong code (5 of them kill the verification).
      const [verification] = await client.db.select().from(authVerifications);
      expect(verification?.failedAttempts).toBe(0);
      // Another network is not limited.
      expect(
        (await exchange('owner@example.com', code, { 'x-real-ip': '203.0.113.10' })).status,
      ).toBe(200);
    });

    it('starts again after the window', async () => {
      await requestSignIn('owner@example.com');
      for (let i = 0; i < 30; i++) await exchange(`nobody${i}@example.com`, '000000', IP);
      // The code lasts 15 minutes, as long as the window: ask again once the window is over.
      passTime(16 * MINUTE_MS);
      transport.clear();
      await requestSignIn('owner@example.com');

      expect((await exchange('owner@example.com', codeOf(), IP)).status).toBe(200);
    });
  });

  describe('AC16: contract routes and 400s', () => {
    const validation = (path: string, code: string) => ({
      code: 'validation_failed',
      issues: [{ path, code }],
    });

    it.each([
      ['no address', { locale: 'en' }, validation('email', 'invalid_type')],
      [
        'not an address',
        { email: 'not-an-email', locale: 'en' },
        validation('email', 'invalid_format'),
      ],
      ['no language', { email: 'owner@example.com' }, validation('locale', 'invalid_value')],
      [
        'an unsupported language',
        { email: 'owner@example.com', locale: 'de' },
        validation('locale', 'invalid_value'),
      ],
    ])(
      'POST /v1/sign-in/request with %s is a 400 with the validation error',
      async (_name, body, expected) => {
        const response = await post('/v1/sign-in/request', body);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual(expected);
        expect(transport.sent).toEqual([]);
      },
    );

    const withCode = (code: string) => ({ email: 'owner@example.com', code });

    it.each([
      ['no address', { code: '123456' }, validation('email', 'invalid_type')],
      [
        'not an address',
        { email: 'not-an-email', code: '123456' },
        validation('email', 'invalid_format'),
      ],
      ['no code', { email: 'owner@example.com' }, validation('code', 'invalid_type')],
      ['five digits', withCode('12345'), validation('code', 'invalid_format')],
      ['seven digits', withCode('1234567'), validation('code', 'invalid_format')],
      ['letters', withCode('abcdef'), validation('code', 'invalid_format')],
      ['spaces', withCode('123 456'), validation('code', 'invalid_format')],
      ['an empty code', withCode(''), validation('code', 'invalid_format')],
    ])(
      'POST /v1/sign-in/token with %s is a 400 with the validation error',
      async (_name, body, expected) => {
        const response = await post('/v1/sign-in/token', body);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual(expected);
      },
    );
  });

  describe('AC2: unknown address and rate limit get the same 202 and no email', () => {
    it.each(['nl-NL', 'en'] as const)(
      'an address with an account, an allowed one, one that is not allowed and one over the limit answer alike (%s)',
      async (locale) => {
        allowlist = parseSignUpAllowlist('newcomer@example.com');
        const account = await answer(await requestSignIn('owner@example.com', locale));
        const allowed = await answer(await requestSignIn('newcomer@example.com', locale));
        expect(transport.sent).toHaveLength(2);
        transport.clear();

        const notAllowed = await answer(await requestSignIn('stranger@example.com', locale));
        expect(transport.sent).toEqual([]);
        // The web's limit is 3 requests per address in 15 minutes; the first one is above.
        await requestSignIn('owner@example.com', locale);
        await requestSignIn('owner@example.com', locale);
        expect(transport.sent).toHaveLength(2);
        transport.clear();
        const overLimit = await answer(await requestSignIn('owner@example.com', locale));
        expect(transport.sent).toEqual([]);

        expect(account.status).toBe(202);
        expect(account.body).toBe('');
        expect(notAllowed).toEqual(account);
        expect(allowed).toEqual(account);
        expect(overLimit).toEqual(account);
      },
    );

    it('creates no account and no verification for an address that is not allowed', async () => {
      await requestSignIn('stranger@example.com');

      expect(transport.sent).toEqual([]);
      expect(await accountOf('stranger@example.com')).toBeUndefined();
      expect(await client.db.select().from(authVerifications)).toEqual([]);
    });

    it('a request over the limit sends nothing and creates no account, also for an allowed address', async () => {
      allowlist = parseSignUpAllowlist('newcomer@example.com');
      for (let i = 0; i < 3; i++) await requestSignIn('newcomer@example.com');
      transport.clear();
      const [before] = await client.db.select().from(authVerifications);
      expect(before).toBeDefined();

      const limited = await requestSignIn('newcomer@example.com');

      expect(limited.status).toBe(202);
      expect(transport.sent).toEqual([]);
      // Requesting is not signing in: no account yet, and the limited request changed nothing.
      expect(await accountOf('newcomer@example.com')).toBeUndefined();
      const [after] = await client.db.select().from(authVerifications);
      expect(after?.id).toBe(before?.id);
    });

    it('the address limit counts the address without regard to case, and ends after 15 minutes', async () => {
      await requestSignIn('owner@example.com');
      await requestSignIn('OWNER@example.com');
      await requestSignIn('owner@example.com');
      transport.clear();

      await requestSignIn('Owner@Example.com');
      expect(transport.sent).toEqual([]);

      passTime(15 * MINUTE_MS);
      await requestSignIn('owner@example.com');
      expect(transport.sent).toHaveLength(1);
    });

    it('the client IP the proxy sets counts for the IP limit', async () => {
      for (let i = 0; i < 20; i++) {
        await requestSignIn(`nobody${i}@example.com`, 'en', { 'x-real-ip': '203.0.113.7' });
      }

      const limited = await requestSignIn('owner@example.com', 'en', {
        'x-real-ip': '203.0.113.7',
      });

      expect(limited.status).toBe(202);
      expect(transport.sent).toEqual([]);
    });
  });

  describe("AC5: native code is the web's single verification: link use, replacement, 15 minutes, 5 wrong codes, hashes", () => {
    it('using the link makes the app code fail, and the code in the app uses up the link', async () => {
      await requestSignIn('owner@example.com');
      const code = codeOf();
      const confirm = await webPost('/sign-in/link/confirm', { token: linkTokenOf() });
      expect(confirm.status).toBe(200);

      expect((await exchange('owner@example.com', code)).status).toBe(401);

      // And the other way round: the code in the app uses up the link.
      transport.clear();
      await requestSignIn('owner@example.com');
      const second = codeOf();
      const secondToken = linkTokenOf();
      expect((await exchange('owner@example.com', second)).status).toBe(200);
      const again = await webPost('/sign-in/link/confirm', { token: secondToken });
      expect(again.status).toBe(401);
    });

    describe('expires after 15 minutes (frozen system time, moved by the test)', () => {
      it('the code works one second short of 15 minutes', async () => {
        await requestSignIn('owner@example.com');
        const code = codeOf();

        passTime(15 * MINUTE_MS - 1000);

        expect((await exchange('owner@example.com', code)).status).toBe(200);
      });

      it('the code at 15 minutes is the same 401 as a wrong code, and the link is dead too', async () => {
        await requestSignIn('owner@example.com');
        const code = codeOf();
        const token = linkTokenOf();
        const wrong = await answer(await exchange('owner@example.com', wrongCodeFor(code)));

        passTime(15 * MINUTE_MS);
        const expired = await answer(await exchange('owner@example.com', code));

        expect(expired.status).toBe(401);
        expect(expired).toEqual(wrong);
        expect((await webPost('/sign-in/link/confirm', { token })).status).toBe(401);
      });

      it('a new request after the expiry starts a new 15 minutes', async () => {
        await requestSignIn('owner@example.com');
        const old = codeOf();
        passTime(20 * MINUTE_MS);
        transport.clear();

        await requestSignIn('owner@example.com');
        const fresh = codeOf();
        passTime(34 * MINUTE_MS);

        expect((await exchange('owner@example.com', old)).status).toBe(401);
        expect((await exchange('owner@example.com', fresh)).status).toBe(200);
      });
    });

    describe('5 wrong codes kill it', () => {
      it('the right code after 5 wrong ones is the same 401, and the link is dead too', async () => {
        await requestSignIn('owner@example.com');
        const code = codeOf();
        const token = linkTokenOf();
        const wrong = wrongCodeFor(code);
        const single = await answer(await exchange('owner@example.com', wrong));
        await wrongCodes(4, 'owner@example.com', wrong);

        const killed = await answer(await exchange('owner@example.com', code));

        expect(killed.status).toBe(401);
        expect(killed).toEqual(single);
        expect((await webPost('/sign-in/link/confirm', { token })).status).toBe(401);
        expect(await client.db.select().from(authSessions)).toEqual([]);
      });

      it('4 wrong ones do not: the right code still gives a token', async () => {
        await requestSignIn('owner@example.com');
        const code = codeOf();
        await wrongCodes(4, 'owner@example.com', wrongCodeFor(code));

        expect((await exchange('owner@example.com', code)).status).toBe(200);
      });

      it('wrong codes of the web count too, and a new email starts again', async () => {
        await requestSignIn('owner@example.com');
        const code = codeOf();
        await wrongCodes(5, 'owner@example.com', wrongCodeFor(code), 'web');
        expect((await exchange('owner@example.com', code)).status).toBe(401);

        transport.clear();
        await requestSignIn('owner@example.com');
        expect((await exchange('owner@example.com', codeOf())).status).toBe(200);
      });
    });

    describe('a newer request replaces it', () => {
      it('a newer request from the app: the old code and the old link stop working', async () => {
        await requestSignIn('owner@example.com');
        const old = codeOf();
        const oldToken = linkTokenOf();
        transport.clear();
        await requestSignIn('owner@example.com');
        const fresh = codeOf();
        const freshToken = linkTokenOf();

        expect((await exchange('owner@example.com', old)).status).toBe(401);
        expect((await webPost('/sign-in/link/confirm', { token: oldToken })).status).toBe(401);
        // The old attempts did not use up the new verification.
        expect((await exchange('owner@example.com', fresh)).status).toBe(200);
        expect(freshToken).not.toBe(oldToken);
      });

      it('a newer request from the web: the code of the app fails, the new code works in the app', async () => {
        await requestSignIn('owner@example.com');
        const old = codeOf();
        transport.clear();
        await webRequestSignIn();
        const fresh = codeOf();

        expect((await exchange('owner@example.com', old)).status).toBe(401);
        expect((await exchange('owner@example.com', fresh)).status).toBe(200);
      });

      it('a newer request from the app: the code and link of the web request stop working', async () => {
        transport.clear();
        await webRequestSignIn();
        const webCode = codeOf();
        const webToken = linkTokenOf();
        transport.clear();
        await requestSignIn('owner@example.com');
        const fresh = codeOf();

        const byCode = await webPost('/sign-in/code/verify', {
          email: 'owner@example.com',
          code: webCode,
        });
        const byLink = await webPost('/sign-in/link/confirm', { token: webToken });

        expect(byCode.status).toBe(401);
        expect(byLink.status).toBe(401);
        expect((await exchange('owner@example.com', fresh)).status).toBe(200);
      });

      it('a code of the web signs the web in once, and then fails in the app', async () => {
        transport.clear();
        await webRequestSignIn();
        const code = codeOf();

        const web = await webPost('/sign-in/code/verify', { email: 'owner@example.com', code });

        expect(web.status).toBe(200);
        expect((await exchange('owner@example.com', code)).status).toBe(401);
      });
    });

    it('the address is matched without regard to case', async () => {
      await requestSignIn('Owner@Example.com');

      const response = await exchange('OWNER@example.com', codeOf());

      expect(response.status).toBe(200);
    });

    it('a request of the app stores only hashes: no usable link token or code', async () => {
      await requestSignIn('owner@example.com');
      const code = codeOf();
      const token = linkTokenOf() ?? '';
      expect(token).not.toBe('');

      const rows = await client.db.select().from(authVerifications);

      expect(rows).toHaveLength(1);
      for (const [column, value] of Object.entries(rows[0] ?? {})) {
        const text = String(value);
        expect(text, `${column} holds the code`).not.toContain(code);
        expect(text, `${column} holds the link token`).not.toContain(token);
      }
      expect(rows[0]?.value).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]?.codeHash).toMatch(/^[0-9a-f]{64}$/);
      // Presenting the stored hash as a link token is no sign-in.
      expect((await webPost('/sign-in/link/confirm', { token: rows[0]?.value })).status).toBe(401);
    });
  });

  describe('AC6: every failure is one neutral 401', () => {
    it('wrong, never asked, used, replaced, expired and killed codes get the same status, body and headers', async () => {
      const answers: Awaited<ReturnType<typeof answer>>[] = [];
      const record = async (response: Response) => answers.push(await answer(response));

      // Wrong.
      await requestSignIn('owner@example.com');
      const code = codeOf();
      await record(await exchange('owner@example.com', wrongCodeFor(code)));
      // Never asked: an address that requested no code.
      await record(await exchange('nobody@example.com', code));
      // Used.
      expect((await exchange('owner@example.com', code)).status).toBe(200);
      await record(await exchange('owner@example.com', code));
      // Replaced.
      transport.clear();
      await requestSignIn('owner@example.com');
      const replaced = codeOf();
      await requestSignIn('owner@example.com');
      await record(await exchange('owner@example.com', replaced));
      // Expired. (3 requests per address in 15 minutes: the earlier ones are out of the window.)
      passTime(16 * MINUTE_MS);
      transport.clear();
      await requestSignIn('owner@example.com');
      const expiring = codeOf();
      passTime(31 * MINUTE_MS);
      await record(await exchange('owner@example.com', expiring));
      // Killed by 5 wrong codes.
      passTime(47 * MINUTE_MS);
      transport.clear();
      await requestSignIn('owner@example.com');
      const killed = codeOf();
      await wrongCodes(5, 'owner@example.com', wrongCodeFor(killed));
      await record(await exchange('owner@example.com', killed));

      expect(answers).toHaveLength(6);
      for (const failure of answers) {
        expect(failure.status).toBe(401);
        expect(JSON.parse(failure.body)).toEqual(UNAUTHORIZED);
        expect(failure.headers.map(([name]) => name)).not.toContain('set-cookie');
      }
      for (const failure of answers) expect(failure).toEqual(answers[0]);
    });
  });

  describe('AC12: events carry no personal data; token and code not logged', () => {
    const EMAIL = 'owner@example.com';
    const CONSOLE_LEVELS = ['debug', 'error', 'info', 'log', 'warn'] as const;
    const SENTRY = {
      SENTRY_DSN: 'https://public@o0.ingest.de.sentry.io/1',
      RAILWAY_ENVIRONMENT_NAME: 'production',
    };

    function captureConsole() {
      const spies = CONSOLE_LEVELS.map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {}),
      );
      return () =>
        spies
          .flatMap((spy) => spy.mock.calls)
          .map((args) => args.map(String).join(' '))
          .join('\n');
    }

    it('a sign-in through the native routes, with failures and a limit, logs no address, code or token', async () => {
      const output = captureConsole();
      const failing = api({
        // The provider's error quotes the recipient, as Brevo's would.
        sendEmail: () => Promise.reject(new Error(`Brevo rejected ${EMAIL}`)),
      });
      await failing.app.request('/v1/sign-in/request', jsonPost({ email: EMAIL, locale: 'en' }));
      await Promise.all(pending.splice(0));

      const token = await signInWithToken(EMAIL);
      const code = codeOf();
      const linkToken = linkTokenOf() ?? '';
      // Wrong, repeated and rate-limited attempts, an authenticated call and a sign-out.
      for (let i = 0; i < 3; i++) await requestSignIn(EMAIL);
      await exchange(EMAIL, wrongCodeFor(code));
      await me(bearer(token));
      await signOut(bearer(token));
      await me(bearer(token));

      const logged = output();
      for (const secret of [EMAIL, 'example.com', code, linkToken, token]) {
        expect(secret).not.toBe('');
        expect(logged).not.toContain(secret);
      }
    });

    it('an error in a native route reaches Sentry without the Authorization header, token, code or address', async () => {
      const output = captureConsole();
      const transportOfSentry = createCaptureTransport();
      const errorReporter = createErrorReporter({ env: SENTRY, transport: transportOfSentry });
      const token = await signInWithToken(EMAIL);
      const failing = (dependencies: Partial<ApiDependencies>) =>
        api({ dependencies: { errorReporter, ...dependencies } }).app;
      const boom = () => Promise.reject(new Error(`Database failed for ${EMAIL}`));
      const json = (body: unknown) => jsonPost(body, { ...bearer(token), cookie: 'a=b' });

      const responses = [
        await failing({ exchangeSignInCode: boom }).request(
          '/v1/sign-in/token',
          json({ email: EMAIL, code: '482915' }),
        ),
        await failing({ requestSignIn: boom }).request(
          '/v1/sign-in/request',
          json({ email: EMAIL, locale: 'en' }),
        ),
        await failing({ signOutBearer: boom }).request('/v1/sign-out', json({})),
        await failing({ findSignedInAccount: boom }).request('/v1/me', {
          headers: { ...bearer(token), cookie: 'a=b' },
        }),
      ];
      await errorReporter.flush();

      for (const response of responses) {
        expect(response.status).toBe(500);
        expect(await response.text()).toBe('Internal Server Error');
      }
      expect(transportOfSentry.events).toHaveLength(4);
      const sent = JSON.stringify(transportOfSentry.events);
      for (const secret of [EMAIL, token, '482915', 'Bearer ', 'a=b']) {
        expect(sent).not.toContain(secret);
      }
      expect(sent.toLowerCase()).not.toContain('authorization');
      // The server log of an unhandled error names the error, not what it quotes.
      const logged = output();
      expect(logged).toContain('Unhandled API error');
      for (const secret of [EMAIL, 'example.com', token, '482915', 'Bearer ']) {
        expect(logged).not.toContain(secret);
      }
    });

    it('a failed sign-in email reported through the shared reporter has the address masked', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const transportOfSentry = createCaptureTransport();
      const errorReporter = createErrorReporter({ env: SENTRY, transport: transportOfSentry });
      const server = api({
        sendEmail: () => Promise.reject(new Error(`Brevo rejected ${EMAIL}`)),
        // As apps/web wires it.
        reportError: (error) => errorReporter.captureError(error),
      });

      const response = await server.app.request(
        '/v1/sign-in/request',
        jsonPost({ email: EMAIL, locale: 'nl-NL' }),
      );
      await Promise.all(pending.splice(0));
      await errorReporter.flush();

      expect(response.status).toBe(202);
      expect(transportOfSentry.events).toHaveLength(1);
      expect(JSON.stringify(transportOfSentry.events)).not.toContain(EMAIL);
    });

    // `sign_in_requested` and `signed_in` are recorded by #138 (PR #208), which is not on main
    // yet: this branch has an empty product event catalog. Their assertions for native
    // sign-ins land with that change.
  });
});
