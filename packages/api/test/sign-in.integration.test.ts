import { createAuth } from '@fivvi/auth';
import { authUsers, authVerifications, createDatabase, type DatabaseClient } from '@fivvi/database';
import { seed } from '@fivvi/database/seed';
import { createMemoryTransport, createSendEmail } from '@fivvi/email';
import { messages } from '@fivvi/i18n';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
const ORIGIN = 'http://localhost:3000';

describe('F001 sign in with the emailed code through the API', () => {
  let database: TestDatabase;
  let client: DatabaseClient;
  const transport = createMemoryTransport();

  /** The server as apps/web wires it, with the email transport in memory. */
  function authAt(baseURL: string = ORIGIN) {
    return createAuth({
      db: client.db,
      secret: SECRET,
      baseURL,
      sendEmail: createSendEmail({
        transport,
        sender: { email: 'noreply@fivvi.app', name: 'Fivvi' },
      }),
    });
  }

  const auth = () => authAt();

  async function post(
    path: string,
    body: unknown,
    {
      headers = {},
      server = auth(),
    }: { headers?: Record<string, string>; server?: ReturnType<typeof auth> } = {},
  ) {
    return await server.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
        body: JSON.stringify(body),
      }),
    );
  }

  const requestCode = (email: string, locale?: string, headers: Record<string, string> = {}) =>
    post('/sign-in/code/request', { email, locale }, { headers });
  const enterCode = (email: string, code: string, server = auth()) =>
    post('/sign-in/code/verify', { email, code }, { server });

  /** The 6-digit code and the sign-in link token in the one email that was sent. */
  function readEmail() {
    expect(transport.sent).toHaveLength(1);
    const [email] = transport.sent;
    if (!email) throw new Error('No email was sent.');
    const code = /\b(\d{6})\b/.exec(email.text)?.[1] ?? '';
    const link = email.links.find((href) => href.includes('/login/confirm')) ?? '';
    return { email, code, link, token: new URL(link, ORIGIN).searchParams.get('token') ?? '' };
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
    await requestCode('owner@example.com', undefined, { 'accept-language': 'nl-BE,nl;q=0.9' });
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
    await post(
      '/sign-in/code/request',
      { email: 'owner@example.com', locale: 'en' },
      { server: https },
    );
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
});
