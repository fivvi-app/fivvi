import { createAuth } from '@fivvi/auth';
import {
  authRateLimits,
  authUsers,
  authVerifications,
  createDatabase,
  type DatabaseClient,
} from '@fivvi/database';
import { seed } from '@fivvi/database/seed';
import { createMemoryTransport, createSendEmail } from '@fivvi/email';
import { messages } from '@fivvi/i18n';
import { type Clock, freezeSystemTime, manualClock } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
const ORIGIN = 'http://localhost:3000';
/** The fixed start of the clock tests (a Tuesday, 12:00 in Amsterdam). */
const T0 = '2026-03-31T10:00:00Z';

/** The part of the `pg` pool the interleaving test wraps. */
interface PoolLike {
  query(...args: unknown[]): Promise<unknown>;
}

describe('F001 sign in with the emailed code through the API', () => {
  let database: TestDatabase;
  let client: DatabaseClient;
  const transport = createMemoryTransport();

  /** The server as apps/web wires it, with the email transport in memory. */
  function authAt(
    baseURL: string = ORIGIN,
    clock?: Clock,
    log?: (line: string) => void,
    production?: boolean,
  ) {
    return createAuth({
      db: client.db,
      secret: SECRET,
      baseURL,
      ...(clock ? { clock } : {}),
      ...(log ? { log } : {}),
      ...(production === undefined ? {} : { production }),
      sendEmail: createSendEmail({
        transport,
        sender: { email: 'noreply@fivvi.app', name: 'Fivvi' },
      }),
    });
  }

  const auth = () => authAt();

  interface PostOptions {
    headers?: Record<string, string>;
    server?: ReturnType<typeof auth>;
  }

  async function post(
    path: string,
    body: unknown,
    { headers = {}, server = auth() }: PostOptions = {},
  ) {
    return await server.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
        body: JSON.stringify(body),
      }),
    );
  }

  const requestCode = (email: string, locale?: string, options: PostOptions = {}) =>
    post('/sign-in/code/request', { email, locale }, options);
  const enterCode = (email: string, code: string, server = auth()) =>
    post('/sign-in/code/verify', { email, code }, { server });

  /** The 6-digit code and the sign-in link token in the latest email, of `count` sent so far. */
  function readEmail(count = 1) {
    expect(transport.sent).toHaveLength(count);
    const email = transport.sent.at(-1);
    if (!email) throw new Error('No email was sent.');
    const code = /\b(\d{6})\b/.exec(email.text)?.[1] ?? '';
    const link = email.links.find((href) => href.includes('/login/confirm')) ?? '';
    return { email, code, link, token: new URL(link, ORIGIN).searchParams.get('token') ?? '' };
  }

  /** A 6-digit code that is not `code`. */
  const wrongCodeFor = (code: string) => (code === '000000' ? '000001' : '000000');

  /** Status and body of a response, to compare failures: they must look the same. */
  async function outcome(response: Response) {
    return {
      status: response.status,
      body: await response.json(),
      cookies: response.headers.getSetCookie(),
    };
  }

  /** A second account, removed again when the test ends. */
  async function addTrainerAccount() {
    await client.db.insert(authUsers).values({ email: 'trainer@example.com' });
    onTestFinished(async () => {
      await client.db.delete(authUsers).where(eq(authUsers.email, 'trainer@example.com'));
    });
  }

  /** Both accounts have asked for a code; their codes, in order. */
  async function ownerAndTrainerCodes() {
    await addTrainerAccount();
    await requestCode('owner@example.com', 'en');
    const owner = readEmail().code;
    await requestCode('trainer@example.com', 'en');
    const trainer = readEmail(2).code;
    return { owner, trainer };
  }

  const verifications = () => client.db.select().from(authVerifications);

  /**
   * Runs `during` right after the verification was found and before it is consumed (Better Auth
   * then tidies up expired rows), to make another request land in between. Drizzle keeps its
   * connection pool on `$client`, which the `Database` type doesn't show.
   */
  function interleave(during: () => Promise<unknown>) {
    const pool = (client.db as unknown as { $client: PoolLike }).$client;
    const query = pool.query.bind(pool);
    let landed: Promise<unknown> | undefined;
    const spy = vi.spyOn(pool, 'query').mockImplementation((async (...args: unknown[]) => {
      const first = args[0];
      const text = typeof first === 'string' ? first : (first as { text?: string }).text;
      if (!landed && text?.includes('"expires_at" <')) {
        landed = during();
        await landed;
      }
      return await query(...args);
    }) as never);
    onTestFinished(() => {
      spy.mockRestore();
    });
    return { landed: () => landed };
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
    transport.clear();
    await client.db.delete(authVerifications);
    await client.db.delete(authRateLimits);
  });

  describe.each([
    ['nl-NL', 'Je inlogcode voor Fivvi'],
    ['en', 'Your sign-in code for Fivvi'],
  ] as const)('page language %s', (locale, subject) => {
    it('AC1: sends one sign-in email with link and code in the resolved language', async () => {
      const response = await requestCode('owner@example.com', locale);

      expect(response.status).toBe(200);
      const { email, code, link } = readEmail();
      expect(email.to.email).toBe('owner@example.com');
      expect(email.locale).toBe(locale);
      expect(email.subject).toBe(subject);
      expect(email.text).toContain(messages[locale].email.signIn.intro);
      expect(code).toMatch(/^\d{6}$/);
      // The link opens the confirm step of the sign-in page (TW-10), not a Better Auth URL.
      expect(link).toMatch(/^http:\/\/localhost:3000\/login\/confirm\?token=[\w-]{20,}$/);
    });
  });

  it('AC1: without a page language, the browser language decides', async () => {
    await requestCode('owner@example.com', undefined, {
      headers: { 'accept-language': 'nl-BE,nl;q=0.9' },
    });
    expect(readEmail().email.locale).toBe('nl-NL');
  });

  it('AC1: the address is matched without regard to case and spaces', async () => {
    await requestCode(' Owner@Example.com ', 'en');
    expect(readEmail().email.to.email).toBe('owner@example.com');
  });

  it('AC2: entering the code from the email signs this browser in', async () => {
    await requestCode('owner@example.com', 'en');
    const { code } = readEmail();

    const response = await enterCode('owner@example.com', code);

    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie().find((c) => c.includes('session_token'));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/i);
    // Not Secure on plain-http localhost; the next test covers https.
    expect(cookie).not.toMatch(/Secure/i);

    // The cookie is a sign-in session the server accepts.
    const session = await auth().handler(
      new Request(`${ORIGIN}/api/auth/get-session`, {
        headers: { cookie: (cookie ?? '').split(';')[0] ?? '' },
      }),
    );
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { email: 'owner@example.com' } });
  });

  it('AC2: the sign-in session cookie is Secure outside local (https)', async () => {
    const https = authAt('https://fivvi.example.net');
    await requestCode('owner@example.com', 'en', { server: https });
    const response = await enterCode('owner@example.com', readEmail().code, https);

    const cookie = response.headers.getSetCookie().find((c) => c.includes('session_token'));
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('AC2: a wrong code signs nobody in and says nothing about why', async () => {
    await requestCode('owner@example.com', 'en');
    const { code } = readEmail();
    const wrong = code === '000000' ? '000001' : '000000';

    const response = await enterCode('owner@example.com', wrong);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('AC4: a code works once', async () => {
    await requestCode('owner@example.com', 'en');
    const { code } = readEmail();

    expect((await enterCode('owner@example.com', code)).status).toBe(200);
    expect((await enterCode('owner@example.com', code)).status).toBe(401);
  });

  it('AC4: link and code are one single-use verification; a new request replaces it', async () => {
    await requestCode('owner@example.com', 'en');
    const first = readEmail();
    const [row] = await verifications();
    expect(await verifications()).toHaveLength(1);

    // A second request for the same address replaces the first verification: its link token and
    // its code are gone, and only the newest email works.
    await requestCode('owner@example.com', 'en');
    const second = readEmail(2);
    const [replacement, ...others] = await verifications();
    expect(others).toEqual([]);
    expect(replacement?.id).not.toBe(row?.id);
    expect(replacement?.value).not.toBe(row?.value);
    expect(replacement?.codeHash).not.toBe(row?.codeHash);
    expect(second.token).not.toBe(first.token);
    expect((await enterCode('owner@example.com', first.code)).status).toBe(401);

    // Using the code of the newest email uses up its link too: nothing is left to use.
    expect((await enterCode('owner@example.com', second.code)).status).toBe(200);
    expect(await verifications()).toEqual([]);
    expect((await enterCode('owner@example.com', second.code)).status).toBe(401);
  });

  it('AC4: using a code does not touch the verification of another address', async () => {
    const { owner, trainer } = await ownerAndTrainerCodes();

    expect((await enterCode('owner@example.com', owner)).status).toBe(200);

    expect(await verifications()).toHaveLength(1);
    expect((await enterCode('trainer@example.com', trainer)).status).toBe(200);
  });

  it('AC4: a new request that lands while the old code is checked cannot be used up by the old code', async () => {
    await requestCode('owner@example.com', 'en');
    const old = readEmail().code;

    // A second request replaces the verification with a new one while the old code is checked.
    const interleaving = interleave(() => requestCode('owner@example.com', 'en'));

    const response = await enterCode('owner@example.com', old);

    expect(interleaving.landed()).toBeDefined();
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
    // The new email still works: the old code did not void it.
    const fresh = readEmail(2).code;
    expect((await enterCode('owner@example.com', fresh)).status).toBe(200);
  });

  describe('AC5: link and code expire after 15 minutes', () => {
    // Better Auth tidies up expired rows by the system clock, which it can't take as a clock, so
    // that is frozen at the same instant as the injected one (TESTING.md §5.4).
    function startAt() {
      freezeSystemTime(T0);
      const clock = manualClock(T0);
      return { clock, server: authAt(ORIGIN, clock) };
    }

    it('a code one second short of 15 minutes still signs in', async () => {
      const { clock, server } = startAt();
      await requestCode('owner@example.com', 'en', { server });
      const { code } = readEmail();

      clock.advance({ minutes: 14, seconds: 59 });

      expect((await enterCode('owner@example.com', code, server)).status).toBe(200);
    });

    it('a code at 15 minutes is rejected like a wrong code, and sets no cookie', async () => {
      const { clock, server } = startAt();
      await requestCode('owner@example.com', 'en', { server });
      const { code } = readEmail();

      clock.advance({ minutes: 15 });
      const response = await enterCode('owner@example.com', code, server);

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
      expect(response.headers.getSetCookie()).toEqual([]);
    });

    it('link and code share one expiry: 15 minutes after the request', async () => {
      const { server } = startAt();
      await requestCode('owner@example.com', 'en', { server });

      // One row holds the link token and the code, so one `expiresAt` ends both.
      const [row, ...others] = await verifications();
      expect(others).toEqual([]);
      expect(row?.expiresAt.toISOString()).toBe('2026-03-31T10:15:00.000Z');
    });

    it('an expired code is rejected like a wrong one, and a new request starts afresh', async () => {
      const { clock, server } = startAt();
      await requestCode('owner@example.com', 'en', { server });
      const old = readEmail().code;
      clock.advance({ minutes: 16 });
      const expired = await outcome(await enterCode('owner@example.com', old, server));
      const wrong = await outcome(await enterCode('owner@example.com', wrongCodeFor(old), server));
      expect(expired).toEqual(wrong);

      await requestCode('owner@example.com', 'en', { server });
      clock.advance({ minutes: 14 });

      expect((await enterCode('owner@example.com', readEmail(2).code, server)).status).toBe(200);
    });

    it('the validity is counted from the request, not from the server start', async () => {
      const { clock, server } = startAt();
      clock.advance({ minutes: 20 });
      await requestCode('owner@example.com', 'en', { server });
      const { code } = readEmail();

      clock.advance({ minutes: 10 });

      expect((await enterCode('owner@example.com', code, server)).status).toBe(200);
    });
  });

  describe('AC6: 5 wrong codes kill the verification', () => {
    async function wrongCodes(count: number, email: string, wrongCode: string) {
      const responses: Response[] = [];
      for (let attempt = 0; attempt < count; attempt += 1) {
        responses.push(await enterCode(email, wrongCode));
      }
      return responses;
    }

    it('5 wrong codes kill the verification, even for the right code', async () => {
      await requestCode('owner@example.com', 'en');
      const { code } = readEmail();
      const wrong = wrongCodeFor(code);

      for (const response of await wrongCodes(5, 'owner@example.com', wrong)) {
        expect(response.status).toBe(401);
      }
      const right = await enterCode('owner@example.com', code);

      expect(right.status).toBe(401);
      expect(right.headers.getSetCookie()).toEqual([]);
      // The link is dead too: no verification is left that holds its token.
      expect(await verifications()).toEqual([]);
    });

    it('a new email after that works again', async () => {
      await requestCode('owner@example.com', 'en');
      await wrongCodes(5, 'owner@example.com', wrongCodeFor(readEmail().code));

      await requestCode('owner@example.com', 'en');

      expect((await enterCode('owner@example.com', readEmail(2).code)).status).toBe(200);
    });

    it('4 wrong codes do not: the right code still signs in', async () => {
      await requestCode('owner@example.com', 'en');
      const { code } = readEmail();
      await wrongCodes(4, 'owner@example.com', wrongCodeFor(code));

      expect((await enterCode('owner@example.com', code)).status).toBe(200);
    });

    it('wrong codes are counted per email', async () => {
      const { owner, trainer } = await ownerAndTrainerCodes();

      await wrongCodes(5, 'trainer@example.com', wrongCodeFor(trainer));

      expect((await enterCode('trainer@example.com', trainer)).status).toBe(401);
      expect((await enterCode('owner@example.com', owner)).status).toBe(200);
    });

    it('a verification at the limit is dead even before it is deleted', async () => {
      await requestCode('owner@example.com', 'en');
      const { code } = readEmail();
      const wrong = await outcome(await enterCode('owner@example.com', wrongCodeFor(code)));
      await client.db.update(authVerifications).set({ failedAttempts: 5 });

      const dead = await outcome(await enterCode('owner@example.com', code));

      expect(dead.status).toBe(401);
      expect(dead).toEqual(wrong);
    });

    it('a 5th wrong code that lands while the right code is checked still kills it', async () => {
      await requestCode('owner@example.com', 'en');
      const { code } = readEmail();

      // The 5th wrong code has counted itself and not yet deleted the verification when the right
      // code, which was found below the limit, is consumed.
      const interleaving = interleave(
        async () => await client.db.update(authVerifications).set({ failedAttempts: 5 }),
      );
      const response = await enterCode('owner@example.com', code);

      expect(interleaving.landed()).toBeDefined();
      expect(response.status).toBe(401);
      expect(response.headers.getSetCookie()).toEqual([]);
    });

    it('guesses made in parallel are counted too', async () => {
      await requestCode('owner@example.com', 'en');
      const { code } = readEmail();
      const wrong = wrongCodeFor(code);

      await Promise.all(Array.from({ length: 12 }, () => enterCode('owner@example.com', wrong)));

      expect((await enterCode('owner@example.com', code)).status).toBe(401);
    });
  });

  it('AC6: every code failure returns the same response', async () => {
    await requestCode('owner@example.com', 'en');
    const replaced = readEmail().code;
    await requestCode('owner@example.com', 'en');
    const { code } = readEmail(2);
    const wrong = wrongCodeFor(code);

    // The code of a replaced email, a wrong code, a malformed one, more wrong codes up to the
    // 5th, the right code after it, the same again and a code for an address with no account.
    // The replaced and the malformed code each count as a wrong code: the 3rd failure here is
    // the 3rd count, the 5th kills the verification, and the right code after it is killed.
    const failures = [
      await enterCode('owner@example.com', replaced),
      await enterCode('owner@example.com', wrong),
      await enterCode('owner@example.com', 'not-a-code'),
      await enterCode('owner@example.com', wrong),
      await enterCode('owner@example.com', wrong),
      await enterCode('owner@example.com', code),
      await enterCode('owner@example.com', code),
      await enterCode('nobody@example.com', code),
    ];
    // A used code: a new verification that signs in once and is then entered again.
    await requestCode('owner@example.com', 'en');
    const used = readEmail(3).code;
    expect((await enterCode('owner@example.com', used)).status).toBe(200);
    failures.push(await enterCode('owner@example.com', used));

    const [first, ...rest] = await Promise.all(failures.map(outcome));
    expect(first).toMatchObject({
      status: 401,
      body: { code: 'INVALID_OR_EXPIRED_CODE' },
      cookies: [],
    });
    for (const failure of rest) expect(failure).toEqual(first);
  });

  it('AC8: an unknown address gets the same answer as an account and no email', async () => {
    const known = await requestCode('owner@example.com', 'en');
    transport.clear();
    const unknown = await requestCode('nobody@example.com', 'en');

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(transport.sent).toEqual([]);
    expect(await client.db.$count(authUsers)).toBe(1);
  });

  it('AC11: only hashes are stored: no usable link token or code in auth_verifications', async () => {
    await requestCode('owner@example.com', 'en');
    const { code, token } = readEmail();
    expect(token).not.toBe('');

    const rows = await client.db.select().from(authVerifications);

    expect(rows).toHaveLength(1);
    for (const row of rows) {
      for (const [column, value] of Object.entries(row)) {
        const text = String(value);
        expect(text, `${column} holds the code`).not.toContain(code);
        expect(text, `${column} holds the link token`).not.toContain(token);
      }
    }
    // What is stored is a keyed hash of each, not the token or the code itself.
    expect(rows[0]?.value).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  describe('AC10 rate limits on sign-in requests', () => {
    /**
     * The address Railway's proxy puts in `x-real-ip` (documentation range, RFC 5737), and the
     * same server at the same frozen instant for the whole test. Better Auth tidies up expired
     * rows by the system clock, so that is frozen with the injected one (TESTING.md §5.4).
     */
    const CLIENT_A = '203.0.113.7';
    const CLIENT_B = '203.0.113.8';

    function startAt() {
      freezeSystemTime(T0);
      const clock = manualClock(T0);
      const log: string[] = [];
      return { clock, log, server: authAt(ORIGIN, clock, (line) => log.push(line)) };
    }

    const from = (ip: string, server: ReturnType<typeof auth>) => ({
      headers: { 'x-real-ip': ip },
      server,
    });

    it('AC10: rate limits per address and per IP answer neutrally', async () => {
      const { clock, server } = startAt();

      // Per address: the 3rd request in 15 minutes still sends, the 4th answers like the first
      // and sends nothing, whichever IP address it comes from.
      const first = await outcome(
        await requestCode('owner@example.com', 'en', from(CLIENT_A, server)),
      );
      await requestCode('owner@example.com', 'en', from(CLIENT_A, server));
      await requestCode('owner@example.com', 'en', from(CLIENT_B, server));
      expect(transport.sent).toHaveLength(3);
      const limited = await requestCode('owner@example.com', 'en', from(CLIENT_B, server));
      expect(await outcome(limited)).toEqual(first);
      expect(transport.sent).toHaveLength(3);

      // After the 15 minutes the address may ask again.
      clock.advance({ minutes: 15 });
      await requestCode('owner@example.com', 'en', from(CLIENT_B, server));
      expect(transport.sent).toHaveLength(4);

      // Per IP address: 20 requests in an hour, whoever they are for (an unknown address counts
      // too, so the limit can't tell who has an account). The 21st is answered the same way.
      transport.clear();
      for (let i = 0; i < 20; i++) {
        const response = await requestCode(`nobody${i}@example.com`, 'en', from(CLIENT_A, server));
        expect(response.status).toBe(200);
      }
      const ipLimited = await requestCode('owner@example.com', 'en', from(CLIENT_A, server));
      expect(await outcome(ipLimited)).toEqual(first);
      expect(transport.sent).toEqual([]);

      // Another IP address is not affected, and an hour later the first one may ask again.
      await requestCode('owner@example.com', 'en', from(CLIENT_B, server));
      expect(transport.sent).toHaveLength(1);
      clock.advance({ hours: 1 });
      await requestCode('owner@example.com', 'en', from(CLIENT_A, server));
      expect(transport.sent).toHaveLength(2);
    });

    it('AC10: an unknown address is limited like an account, so the limit reveals nothing', async () => {
      const { server } = startAt();
      const responses = [];
      for (let i = 0; i < 4; i++) {
        responses.push(await outcome(await requestCode('nobody@example.com', 'en', { server })));
      }
      for (const response of responses) expect(response).toEqual(responses[0]);
      expect(transport.sent).toEqual([]);
      expect(await client.db.$count(authRateLimits)).toBeGreaterThan(0);
    });

    it('AC10: addresses that differ in case or spaces share one limit', async () => {
      const { server } = startAt();
      for (const email of ['owner@example.com', ' Owner@Example.com', 'OWNER@EXAMPLE.COM']) {
        await requestCode(email, 'en', { server });
      }
      expect(transport.sent).toHaveLength(3);

      await requestCode(' owner@EXAMPLE.com ', 'en', { server });
      expect(transport.sent).toHaveLength(3);
    });

    it('AC10: requests made in parallel are all counted', async () => {
      const { server } = startAt();

      await Promise.all(
        Array.from({ length: 10 }, () => requestCode('owner@example.com', 'en', { server })),
      );

      expect(transport.sent).toHaveLength(3);
    });

    it('AC10: a limited request leaves the pending email working', async () => {
      const { server } = startAt();
      for (let i = 0; i < 3; i++) await requestCode('owner@example.com', 'en', { server });
      const { code } = readEmail(3);

      await requestCode('owner@example.com', 'en', { server });

      expect(transport.sent).toHaveLength(3);
      expect((await enterCode('owner@example.com', code, server)).status).toBe(200);
    });

    it('AC10: the limit survives a new app instance (it is stored in Postgres)', async () => {
      const { clock } = startAt();
      for (let i = 0; i < 3; i++) {
        await requestCode('owner@example.com', 'en', from(CLIENT_A, authAt(ORIGIN, clock)));
      }
      expect(transport.sent).toHaveLength(3);

      // A restart or a deploy: a new instance, the same database.
      const restarted = authAt(ORIGIN, clock);
      await requestCode('owner@example.com', 'en', from(CLIENT_A, restarted));
      expect(transport.sent).toHaveLength(3);

      // The per-IP half: 20 requests from one IP address, each through a new instance, then a
      // 21st for an account whose address limit is untouched.
      await addTrainerAccount();
      for (let i = 0; i < 20; i++) {
        await requestCode(`nobody${i}@example.com`, 'en', from(CLIENT_B, authAt(ORIGIN, clock)));
      }
      await requestCode('trainer@example.com', 'en', from(CLIENT_B, authAt(ORIGIN, clock)));
      expect(transport.sent).toHaveLength(3);
    });

    it('AC10: a client cannot dodge the IP limit with a forged x-forwarded-for', async () => {
      const { server } = startAt();
      for (let i = 0; i < 20; i++) {
        await requestCode(`nobody${i}@example.com`, 'en', {
          server,
          headers: { 'x-real-ip': CLIENT_A, 'x-forwarded-for': `198.51.100.${i}` },
        });
      }

      await requestCode('owner@example.com', 'en', {
        server,
        headers: { 'x-real-ip': CLIENT_A, 'x-forwarded-for': '198.51.100.200' },
      });

      expect(transport.sent).toEqual([]);
    });

    it('AC10: addresses of the same IPv6 /64 network share one IP limit', async () => {
      const { server } = startAt();
      for (let i = 0; i < 20; i++) {
        await requestCode(`nobody${i}@example.com`, 'en', from(`2001:db8:1:2::${i + 1}`, server));
      }

      await requestCode('owner@example.com', 'en', from('2001:db8:1:2:ffff::9', server));
      expect(transport.sent).toEqual([]);

      await requestCode('owner@example.com', 'en', from('2001:db8:1:3::1', server));
      expect(transport.sent).toHaveLength(1);
    });

    it('AC10: outside production, without a client IP header only the per-address limit applies', async () => {
      const { server } = startAt();
      for (let i = 0; i < 25; i++) {
        await requestCode(`nobody${i}@example.com`, 'en', { server });
      }
      await requestCode('owner@example.com', 'en', { server });

      expect(transport.sent).toHaveLength(1);
    });

    it('AC10: in production a request without the client IP header counts in one shared bucket', async () => {
      freezeSystemTime(T0);
      const server = authAt(ORIGIN, manualClock(T0), undefined, true);
      await addTrainerAccount();

      // No header at all: the shared "unknown IP" bucket, 20 requests an hour for everyone.
      for (let i = 0; i < 20; i++) await requestCode(`nobody${i}@example.com`, 'en', { server });
      await requestCode('trainer@example.com', 'en', { server });
      expect(transport.sent).toEqual([]);

      // A request that does carry an IP address has its own bucket.
      await requestCode('trainer@example.com', 'en', from(CLIENT_A, server));
      expect(transport.sent).toHaveLength(1);
    });

    it('AC10: the rate-limit hit is logged without the email address or the IP address', async () => {
      const { server, log } = startAt();
      for (let i = 0; i < 3; i++)
        await requestCode('owner@example.com', 'en', from(CLIENT_A, server));
      expect(log).toEqual([]);

      await requestCode('owner@example.com', 'en', from(CLIENT_A, server));

      expect(log).toEqual(['Sign-in request rate-limited: address']);
      for (let i = 0; i < 20; i++) {
        await requestCode(`nobody${i}@example.com`, 'en', from(CLIENT_B, server));
      }
      await requestCode('nobody-else@example.com', 'en', from(CLIENT_B, server));
      expect(log.at(-1)).toBe('Sign-in request rate-limited: ip');
      expect(log.join('\n')).not.toMatch(/example\.com|203\.0\.113/);
    });

    it('AC10: the default log is a console line without the address or the IP address', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      onTestFinished(() => {
        warn.mockRestore();
      });
      freezeSystemTime(T0);
      const server = authAt(ORIGIN, manualClock(T0));
      for (let i = 0; i < 4; i++)
        await requestCode('owner@example.com', 'en', from(CLIENT_A, server));

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toBe('Sign-in request rate-limited: address');
    });

    it('AC10: the stored limits hold neither the email address nor the IP address', async () => {
      const { server } = startAt();
      await requestCode('owner@example.com', 'en', from(CLIENT_A, server));

      const rows = await client.db.select().from(authRateLimits);

      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.key).not.toMatch(/example\.com|203\.0\.113/);
        expect(row.key).toMatch(/^[\w-]+:[0-9a-f]{64}$/);
      }
    });

    it('AC10: the request limits do not touch entering the code', async () => {
      const { server } = startAt();
      for (let i = 0; i < 4; i++) await requestCode('owner@example.com', 'en', { server });
      const { code } = readEmail(3);

      for (let i = 0; i < 5; i++) {
        expect((await enterCode('owner@example.com', code, server)).status).toBe(
          i === 0 ? 200 : 401,
        );
      }
    });
  });
});
