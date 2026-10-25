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
import { createMemoryTransport, createSendEmail } from '@fivvi/email';
import { type Locale, messages } from '@fivvi/i18n';
import { freezeSystemTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, ne } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
const ORIGIN = 'http://localhost:3000';
const T0 = '2026-03-31T10:00:00Z';
const DAY_MS = 24 * 60 * 60 * 1000;
const UNAUTHORIZED = { code: 'unauthorized' };

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
  function api() {
    const auth = createAuth({
      db: client.db,
      secret: SECRET,
      baseURL: ORIGIN,
      signUpAllowlist: allowlist,
      runInBackground: (task) => pending.push(task),
      sendEmail: createSendEmail({
        transport,
        sender: { email: 'noreply@fivvi.app', name: 'Fivvi' },
      }),
    });
    const dependencies: ApiDependencies = {
      ...NO_DEPENDENCIES,
      findSignedInAccount: (headers) => auth.findAccount(headers),
      requestSignIn: (input) => auth.requestSignIn(input),
      exchangeSignInCode: (input) => auth.exchangeSignInCode(input),
      signOutBearer: (headers) => auth.signOutBearer(headers),
    };
    return { app: createApp(dependencies), auth };
  }

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    api().app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

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

  /** Signs the web in with the code and returns the response of the code step. */
  async function webSignIn(email = 'owner@example.com'): Promise<Response> {
    transport.clear();
    await webPost('/sign-in/code/request', { email, locale: 'en' });
    await Promise.all(pending.splice(0));
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

  it('AC2: an address without an account and a request over the limit get the same 202 and no email', async () => {
    const known = await requestSignIn('owner@example.com');
    expect(transport.sent).toHaveLength(1);
    transport.clear();

    const unknown = await requestSignIn('nobody@example.com');
    expect(unknown.status).toBe(known.status);
    expect(await unknown.text()).toBe(await known.text());
    expect(transport.sent).toEqual([]);

    // The limits of the web (3 requests per address in 15 minutes) count native requests too.
    await requestSignIn('owner@example.com');
    await requestSignIn('owner@example.com');
    transport.clear();
    const limited = await requestSignIn('owner@example.com');
    expect(limited.status).toBe(202);
    expect(await limited.text()).toBe('');
    expect(transport.sent).toEqual([]);
  });

  it('AC2: the client IP the proxy sets counts for the IP limit', async () => {
    for (let i = 0; i < 20; i++) {
      await requestSignIn(`nobody${i}@example.com`, 'en', { 'x-real-ip': '203.0.113.7' });
    }

    const limited = await requestSignIn('owner@example.com', 'en', { 'x-real-ip': '203.0.113.7' });

    expect(limited.status).toBe(202);
    expect(transport.sent).toEqual([]);
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

  it('AC6: every failure is the same neutral 401, and sets no cookie', async () => {
    await requestSignIn('owner@example.com');
    const code = codeOf();
    const wrong = code === '000000' ? '000001' : '000000';

    const failures = [
      await exchange('owner@example.com', wrong),
      // Never asked for a code.
      await exchange('nobody@example.com', code),
    ];
    // Used: the second use of the right code.
    expect((await exchange('owner@example.com', code)).status).toBe(200);
    failures.push(await exchange('owner@example.com', code));
    // Replaced: the code of an older email, after a newer request.
    transport.clear();
    await requestSignIn('owner@example.com');
    const older = codeOf();
    await requestSignIn('owner@example.com');
    failures.push(await exchange('owner@example.com', older));

    for (const response of failures) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(UNAUTHORIZED);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  });

  it('AC5: the code is the web verification: using the link makes the app code fail, and back', async () => {
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

  it('AC7: the first sign-in of an allowed address creates the account in the interface language', async () => {
    allowlist = parseSignUpAllowlist('newcomer@example.com');
    await requestSignIn('newcomer@example.com', 'nl-NL');

    const response = await exchange('newcomer@example.com', codeOf());

    expect(response.status).toBe(200);
    const { token } = (await response.json()) as { token: string };
    const account = await me(bearer(token));
    expect(await account.json()).toMatchObject({
      email: 'newcomer@example.com',
      preferredLocale: 'nl-NL',
    });
  });

  describe('AC4: authenticated call with a bearer token', () => {
    it('GET /v1/me answers 200 with the account for a valid bearer token', async () => {
      const token = await signInWithToken();

      const response = await me(bearer(token));

      expect(response.status).toBe(200);
      const [row] = await client.db
        .select()
        .from(authUsers)
        .where(eq(authUsers.email, 'owner@example.com'));
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

  it('AC8: the token lasts 30 days after its last use and each use renews it', async () => {
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

  it('AC8: a token that is not used for 30 days no longer works', async () => {
    const token = await signInWithToken();

    passTime(31 * DAY_MS);

    expect((await me(bearer(token))).status).toBe(401);
  });

  describe('AC10: sign out ends this sign-in session only', () => {
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
      passTime(16 * 60 * 1000);
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
});
