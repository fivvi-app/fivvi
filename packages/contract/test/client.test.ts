import { createApiHandler, HELLO_GREETING_KEY } from '@trainer-hub/api';
import { describe, expect, it } from 'vitest';
import { createApiClient } from '../src/index.ts';

// The generated TypeScript client talks to the real API handler, in-process (no network).
function client() {
  const handle = createApiHandler();
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
});
