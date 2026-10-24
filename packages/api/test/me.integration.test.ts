import { readFileSync } from 'node:fs';
import { createAuth } from '@fivvi/auth';
import { authUsers, createDatabase, type Database, type DatabaseClient } from '@fivvi/database';
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

/**
 * The 200 response of GET /v1/me as the committed contract (packages/contract/openapi.json)
 * describes it, the way a generated client reads it: a body the contract rejects breaks them.
 */
const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);
const ContractMeResponse = z.fromJSONSchema(
  JSON.parse(
    JSON.stringify({
      $defs: contract.components.schemas,
      $ref: contract.paths['/v1/me'].get.responses['200'].content['application/json'].schema.$ref,
    }).replaceAll('#/components/schemas/', '#/$defs/'),
  ),
);

describe('F001 GET /v1/me', () => {
  let database: TestDatabase;
  let client: DatabaseClient;
  const transport = createMemoryTransport();

  /** Sign-in as apps/web wires it: the real Better Auth on the test database. */
  const auth = (db: Database) =>
    createAuth({
      db,
      secret: SECRET,
      baseURL: ORIGIN,
      sendEmail: createSendEmail({
        transport,
        sender: { email: 'noreply@fivvi.app', name: 'Fivvi' },
      }),
    });

  /** The API as apps/web wires it: the signed-in account comes from the sign-in session. */
  function api(db: Database) {
    const signIn = auth(db);
    const dependencies: ApiDependencies = {
      ...NO_DEPENDENCIES,
      findSignedInAccount: (headers) => signIn.findAccount(headers),
    };
    return createApp(dependencies);
  }

  /** Signs `email` in with the emailed code; returns the cookie header the browser would send. */
  async function signIn(db: Database, email: string): Promise<string> {
    const server = auth(db);
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

  it('AC14: 401 anonymous, 200 signed in, matches the schema and the contract', async () => {
    const anonymous = await api(client.db).request('/v1/me');
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ code: 'unauthorized' });

    const cookie = await signIn(client.db, 'owner@example.com');
    const signedIn = await api(client.db).request('/v1/me', { headers: { cookie } });

    expect(signedIn.status).toBe(200);
    const json = await signedIn.json();
    const body = StrictMeResponse.parse(json);
    expect(ContractMeResponse.parse(json)).toEqual(body);
    // The seed holds the one account.
    const [row] = await client.db.select().from(authUsers);
    expect(body).toEqual({
      id: row?.id,
      email: 'owner@example.com',
      preferredLocale: 'nl-NL',
    });
  });

  it('AC14: an account without a stored language has none, and the contract allows it', async () => {
    // Changing the account commits, so this test has a database of its own.
    const own = await cloneTemplateDatabase();
    const ownClient = createDatabase({ url: own.url, maxConnections: 4 });
    try {
      await seed(ownClient.db);
      const cookie = await signIn(ownClient.db, 'owner@example.com');
      await ownClient.db.update(authUsers).set({ preferredLocale: null });

      const res = await api(ownClient.db).request('/v1/me', { headers: { cookie } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(StrictMeResponse.parse(json).preferredLocale).toBeNull();
      expect(ContractMeResponse.parse(json)).toMatchObject({ preferredLocale: null });
    } finally {
      await ownClient.close();
      await own.drop();
    }
  });

  it('AC14: a cookie that is not a sign-in session is anonymous', async () => {
    const res = await api(client.db).request('/v1/me', {
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
