import { createAuth } from '@fivvi/auth';
import { authUsers, createDatabase, type DatabaseClient } from '@fivvi/database';
import { seed } from '@fivvi/database/seed';
import { createMemoryTransport, createSendEmail } from '@fivvi/email';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { z } from '@hono/zod-openapi';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type ApiDependencies,
  createApp,
  MeResponseSchema,
  NO_DEPENDENCIES,
} from '../src/index.ts';

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
const ORIGIN = 'http://localhost:3000';
const StrictMeResponse = z.strictObject(MeResponseSchema.shape);

describe('F001 GET /v1/me', () => {
  let database: TestDatabase;
  let client: DatabaseClient;
  const transport = createMemoryTransport();

  /** Sign-in as apps/web wires it: the real Better Auth on the test database. */
  const auth = () =>
    createAuth({
      db: client.db,
      secret: SECRET,
      baseURL: ORIGIN,
      sendEmail: createSendEmail({
        transport,
        sender: { email: 'noreply@fivvi.app', name: 'Fivvi' },
      }),
    });

  /** The API as apps/web wires it: the signed-in account comes from the sign-in session. */
  function api() {
    const signIn = auth();
    const dependencies: ApiDependencies = {
      ...NO_DEPENDENCIES,
      findSignedInAccount: (headers) => signIn.findAccount(headers),
    };
    return createApp(dependencies);
  }

  /** Signs `email` in with the emailed code; returns the cookie header the browser would send. */
  async function signIn(email: string): Promise<string> {
    const server = auth();
    const post = (path: string, body: unknown) =>
      server.handler(
        new Request(`${ORIGIN}/api/auth${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: JSON.stringify(body),
        }),
      );
    await post('/sign-in/code/request', { email, locale: 'en' });
    const code = /\b(\d{6})\b/.exec(transport.sent.at(-1)?.text ?? '')?.[1] ?? '';
    const response = await post('/sign-in/code/verify', { email, code });
    expect(response.status).toBe(200);
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

  beforeEach(() => {
    transport.clear();
  });

  it('AC14: 401 anonymous, 200 signed in, matches the schema', async () => {
    const anonymous = await api().request('/v1/me');
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ code: 'unauthorized' });

    const cookie = await signIn('owner@example.com');
    const signedIn = await api().request('/v1/me', { headers: { cookie } });

    expect(signedIn.status).toBe(200);
    const body = StrictMeResponse.parse(await signedIn.json());
    // The seed holds the one account.
    const [row] = await client.db.select().from(authUsers);
    expect(body).toEqual({
      id: row?.id,
      email: 'owner@example.com',
      preferredLocale: 'nl-NL',
    });
  });

  it('AC14: an account without a stored language has none', async () => {
    const cookie = await signIn('owner@example.com');
    await client.db.update(authUsers).set({ preferredLocale: null });
    try {
      const res = await api().request('/v1/me', { headers: { cookie } });

      expect(res.status).toBe(200);
      expect(StrictMeResponse.parse(await res.json()).preferredLocale).toBeNull();
    } finally {
      await client.db.update(authUsers).set({ preferredLocale: 'nl-NL' });
    }
  });

  it('AC14: a cookie that is not a sign-in session is anonymous', async () => {
    const res = await api().request('/v1/me', {
      headers: { cookie: 'better-auth.session_token=not-a-real-session' },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'unauthorized' });
  });

  it('AC14: without sign-in wired in, nobody is signed in', async () => {
    const res = await createApp().request('/v1/me');

    expect(res.status).toBe(401);
  });
});
