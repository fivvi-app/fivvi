import {
  type ApiDependencies,
  createApiHandler,
  INTERNAL_SERVER_ERROR,
  NO_DEPENDENCIES,
} from '@fivvi/api';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/index.ts';

const HELLO_GREETING_KEY = 'hello.title';

// The generated TypeScript client talks to the real API handler, in-process (no network),
// with a fake greeting reader instead of Postgres.
function client(
  findSystemGreeting: ApiDependencies['findSystemGreeting'] = async (slug) => ({
    slug,
    i18nKey: HELLO_GREETING_KEY,
  }),
) {
  const handle = createApiHandler({ ...NO_DEPENDENCIES, findSystemGreeting });
  return createApiClient({
    baseUrl: 'http://localhost/api',
    fetch: async (request) => await handle(request),
  });
}

// The same, signed in as a fake account (or nobody).
function meClient(account: Awaited<ReturnType<ApiDependencies['findSignedInAccount']>>) {
  const handle = createApiHandler({ ...NO_DEPENDENCIES, findSignedInAccount: async () => account });
  return createApiClient({
    baseUrl: 'http://localhost/api',
    fetch: async (request) => await handle(request),
  });
}

describe('E018 TypeScript client', () => {
  it('calls GET /v1/hello and returns the typed response', async () => {
    const { data, error, response } = await client().GET('/v1/hello', {
      params: { query: { locale: 'en' } },
    });

    expect(response.status).toBe(200);
    expect(error).toBeUndefined();
    expect(data).toEqual({ greetingKey: HELLO_GREETING_KEY, locale: 'en' });
  });

  it('returns the typed validation error', async () => {
    const { data, error, response } = await client().GET('/v1/hello', {
      // @ts-expect-error: the contract only allows 'nl-NL' | 'en'.
      params: { query: { locale: 'de-DE' } },
    });

    expect(response.status).toBe(400);
    expect(data).toBeUndefined();
    expect(error).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'locale', code: 'invalid_value' }],
    });
  });

  it('returns the documented server error when the greeting is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { data, error, response } = await client(async () => undefined).GET('/v1/hello', {
      params: { query: { locale: 'en' } },
    });

    expect(response.status).toBe(500);
    expect(data).toBeUndefined();
    expect(error).toBe(INTERNAL_SERVER_ERROR);
  });
});

describe('F001 TypeScript client: GET /v1/me', () => {
  it('calls GET /v1/me and returns the typed account, with a nullable language', async () => {
    const account = { id: '0197c0de-0000-7000-8000-000000000001', email: 'owner@example.com' };

    const withLanguage = await meClient({ ...account, preferredLocale: 'nl-NL' }).GET('/v1/me');
    expect(withLanguage.response.status).toBe(200);
    expect(withLanguage.data).toEqual({ ...account, preferredLocale: 'nl-NL' });

    const withoutLanguage = await meClient({ ...account, preferredLocale: null }).GET('/v1/me');
    expect(withoutLanguage.data?.preferredLocale).toBeNull();
  });

  it('returns the typed 401 on GET /v1/me when nobody is signed in', async () => {
    const { data, error, response } = await meClient(undefined).GET('/v1/me');

    expect(response.status).toBe(401);
    expect(data).toBeUndefined();
    expect(error).toEqual({ code: 'not_signed_in' });
  });
});

describe('F001N TypeScript client: native sign-in', () => {
  const account = {
    id: '0197c0de-0000-7000-8000-000000000001',
    email: 'owner@example.com',
    preferredLocale: null,
  } as const;

  // A fake sign-in whose token is the only way in: the dependencies the routes call.
  function signInClient() {
    const requests: unknown[] = [];
    const handle = createApiHandler({
      ...NO_DEPENDENCIES,
      requestSignIn: ({ email, locale }) => {
        requests.push({ email, locale });
        return Promise.resolve();
      },
      exchangeSignInCode: async ({ code }) => (code === '123456' ? 'token-1' : undefined),
      findSignedInAccount: async (headers) =>
        headers.get('authorization') === 'Bearer token-1' ? account : undefined,
      signOutBearer: async (headers) => headers.get('authorization') === 'Bearer token-1',
    });
    const api = createApiClient({
      baseUrl: 'http://localhost/api',
      fetch: async (request) => await handle(request),
    });
    return { api, requests };
  }

  it('requests a sign-in email with the interface language and gets an empty 202', async () => {
    const { api, requests } = signInClient();

    const { response, error } = await api.POST('/v1/sign-in/request', {
      body: { email: 'owner@example.com', locale: 'nl-NL' },
    });

    expect(response.status).toBe(202);
    expect(error).toBeUndefined();
    expect(requests).toEqual([{ email: 'owner@example.com', locale: 'nl-NL' }]);
  });

  it('exchanges the code for a token, calls /v1/me with it, signs out', async () => {
    const { api } = signInClient();

    const exchanged = await api.POST('/v1/sign-in/token', {
      body: { email: 'owner@example.com', code: '123456' },
    });
    expect(exchanged.data).toEqual({ token: 'token-1' });

    const headers = { Authorization: `Bearer ${exchanged.data?.token}` };
    expect((await api.GET('/v1/me', { headers })).data).toEqual(account);
    expect((await api.POST('/v1/sign-out', { headers })).response.status).toBe(204);
  });

  it('returns the typed neutral 401 for a wrong code and a missing token', async () => {
    const { api } = signInClient();

    const wrong = await api.POST('/v1/sign-in/token', {
      body: { email: 'owner@example.com', code: '654321' },
    });
    expect(wrong.response.status).toBe(401);
    expect(wrong.error).toEqual({ code: 'unauthorized' });
    expect((await api.POST('/v1/sign-out')).response.status).toBe(401);
  });

  it('returns the typed validation error for a code that is not 6 digits', async () => {
    const { api } = signInClient();

    const { error, response } = await api.POST('/v1/sign-in/token', {
      body: { email: 'owner@example.com', code: '12345' },
    });

    expect(response.status).toBe(400);
    expect(error).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'code', code: 'invalid_format' }],
    });
  });
});
