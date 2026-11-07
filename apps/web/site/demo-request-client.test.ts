import { describe, expect, it, vi } from 'vitest';
import { type DemoRequestInput, sendDemoRequest } from './demo-request-client';

const input: DemoRequestInput = {
  name: 'Anna de Vries',
  email: 'anna@example.com',
  businessKind: 'studio',
  trainerCount: 'two-to-four',
  message: 'Ik wil de roosters zien.',
  locale: 'nl-NL',
  website: '',
};

const reply = (status: number, body?: unknown) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(
      body === undefined ? new Response(null, { status }) : Response.json(body, { status }),
    ),
  );

const validation = (...issues: { path: string; code: string }[]) => ({
  code: 'validation_failed',
  issues,
});

describe('F064 AC5 the demo request client', () => {
  it('posts the answers as JSON to the API of this site, with the honeypot as it is', async () => {
    const fetchFn = reply(202);

    const result = await sendDemoRequest({ ...input, website: 'x' }, fetchFn);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/demo-requests');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ ...input, website: 'x' });
  });

  it('trims the name, the email address and the message before they are sent', async () => {
    const fetchFn = reply(202);

    await sendDemoRequest(
      { ...input, name: ' Anna ', email: ' anna@example.com ', message: ' hi ' },
      fetchFn,
    );

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      name: 'Anna',
      email: 'anna@example.com',
      message: 'hi',
    });
  });
});

describe('F064 AC6 what the API refuses is worded under the field', () => {
  it.each([
    ['too_small', 'nameRequired'],
    ['invalid_type', 'nameRequired'],
    ['invalid_format', 'nameRequired'],
    ['too_big', 'nameTooLong'],
  ])('a name refused with %s is %s', async (code, error) => {
    const result = await sendDemoRequest(input, reply(400, validation({ path: 'name', code })));

    expect(result).toEqual({ ok: false, reason: 'fields', errors: { name: error } });
  });

  it.each(['invalid_format', 'invalid_type', 'too_big', 'too_small'])(
    'an email address refused with %s is invalid',
    async (code) => {
      const result = await sendDemoRequest(input, reply(400, validation({ path: 'email', code })));

      expect(result).toEqual({ ok: false, reason: 'fields', errors: { email: 'emailInvalid' } });
    },
  );

  it('a message that is too long, and several fields at once', async () => {
    const result = await sendDemoRequest(
      input,
      reply(
        400,
        validation(
          { path: 'name', code: 'too_small' },
          { path: 'email', code: 'invalid_format' },
          { path: 'message', code: 'too_big' },
        ),
      ),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'fields',
      errors: { name: 'nameRequired', email: 'emailInvalid', message: 'messageTooLong' },
    });
  });

  it('a refusal that names no field of the form is a failure, not a silent one', async () => {
    expect(
      await sendDemoRequest(
        input,
        reply(400, validation({ path: 'locale', code: 'invalid_value' })),
      ),
    ).toEqual({ ok: false, reason: 'failed' });
    expect(await sendDemoRequest(input, reply(400, {}))).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('F064 AC5 when the request is not sent the visitor is told', () => {
  it('a 429 is rate limited', async () => {
    expect(await sendDemoRequest(input, reply(429, { code: 'rate_limited' }))).toEqual({
      ok: false,
      reason: 'rateLimited',
    });
  });

  it.each([503, 500, 502])('a %i is a failure', async (status) => {
    expect(await sendDemoRequest(input, reply(status))).toEqual({ ok: false, reason: 'failed' });
  });

  it('a request that cannot reach the server is no connection', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await sendDemoRequest(input, fetchFn)).toEqual({ ok: false, reason: 'noConnection' });
  });
});
