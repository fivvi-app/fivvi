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
