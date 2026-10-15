import { z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import {
  createApiHandler,
  createApp,
  HELLO_GREETING_KEY,
  HelloResponseSchema,
  ValidationErrorSchema,
} from '../src/index.ts';

// Strict copies: the response may not carry fields the contract doesn't declare.
const StrictHelloResponse = z.strictObject(HelloResponseSchema.shape);
const StrictValidationError = z.strictObject(ValidationErrorSchema.shape);

describe('E018 GET /v1/hello', () => {
  it('E008 AC3: returns the greeting key in English without a locale or Accept-Language', async () => {
    const res = await createApp().request('/v1/hello');

    expect(res.status).toBe(200);
    expect(StrictHelloResponse.parse(await res.json())).toEqual({
      greetingKey: HELLO_GREETING_KEY,
      locale: 'en',
    });
  });

  it.each(['nl-NL', 'en'] as const)('returns the requested locale %s', async (locale) => {
    const res = await createApp().request(`/v1/hello?locale=${locale}`);

    expect(res.status).toBe(200);
    expect(StrictHelloResponse.parse(await res.json())).toEqual({
      greetingKey: HELLO_GREETING_KEY,
      locale,
    });
  });

  it.each([
    ['en-US,en;q=0.9', 'en'],
    ['nl-BE', 'nl-NL'],
    ['fr-FR,nl-BE;q=0.9', 'nl-NL'],
    ['de-DE,en-GB;q=0.9,nl-NL;q=0.8', 'en'],
    ['de-DE', 'en'],
    ['de-DE,fr-FR;q=0.9', 'en'],
  ])('E008 AC3: negotiates Accept-Language %s to %s', async (acceptLanguage, locale) => {
    const res = await createApp().request('/v1/hello', {
      headers: { 'Accept-Language': acceptLanguage },
    });

    expect(res.status).toBe(200);
    expect(StrictHelloResponse.parse(await res.json())).toEqual({
      greetingKey: HELLO_GREETING_KEY,
      locale,
    });
  });

  it.each([
    ['nl-NL', 'en'],
    ['nl-NL', 'de-DE'],
    ['en', 'nl-NL'],
  ] as const)(
    'E008 AC3: prefers the locale query %s over Accept-Language %s',
    async (locale, acceptLanguage) => {
      const res = await createApp().request(`/v1/hello?locale=${locale}`, {
        headers: { 'Accept-Language': acceptLanguage },
      });

      expect(StrictHelloResponse.parse(await res.json())).toMatchObject({ locale });
    },
  );

  it('rejects an unsupported locale with a validation error', async () => {
    const res = await createApp().request('/v1/hello?locale=de-DE');

    expect(res.status).toBe(400);
    expect(StrictValidationError.parse(await res.json())).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'locale', code: 'invalid_value' }],
    });
  });

  it('is served under /api by the mounted handler', async () => {
    const handle = createApiHandler();

    const res = await handle(new Request('http://localhost/api/v1/hello?locale=en'));

    expect(res.status).toBe(200);
    expect(StrictHelloResponse.parse(await res.json())).toEqual({
      greetingKey: HELLO_GREETING_KEY,
      locale: 'en',
    });
  });

  it('does not serve the API outside the base path', async () => {
    const handle = createApiHandler();

    const res = await handle(new Request('http://localhost/v1/hello'));

    expect(res.status).toBe(404);
  });
});
