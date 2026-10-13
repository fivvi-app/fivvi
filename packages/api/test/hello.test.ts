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
  it('returns the greeting key in Dutch by default', async () => {
    const res = await createApp().request('/v1/hello');

    expect(res.status).toBe(200);
    expect(StrictHelloResponse.parse(await res.json())).toEqual({
      greetingKey: HELLO_GREETING_KEY,
      locale: 'nl-NL',
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
    ['de-DE', 'nl-NL'],
  ])('negotiates Accept-Language %s to %s', async (acceptLanguage, locale) => {
    const res = await createApp().request('/v1/hello', {
      headers: { 'Accept-Language': acceptLanguage },
    });

    expect(res.status).toBe(200);
    expect(StrictHelloResponse.parse(await res.json())).toEqual({
      greetingKey: HELLO_GREETING_KEY,
      locale,
    });
  });

  it('prefers the locale query parameter over Accept-Language', async () => {
    const res = await createApp().request('/v1/hello?locale=nl-NL', {
      headers: { 'Accept-Language': 'en' },
    });

    expect(StrictHelloResponse.parse(await res.json())).toMatchObject({ locale: 'nl-NL' });
  });

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
