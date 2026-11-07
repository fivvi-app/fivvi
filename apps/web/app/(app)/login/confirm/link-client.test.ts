import { describe, expect, it, vi } from 'vitest';
import { confirmLink, previewLink } from './link-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

describe('F001 sign-in link client of the confirm step (TW-10)', () => {
  it('posts the token to ask whose address the link signs in, and returns the masked address', async () => {
    const fetchFn = reply(200, { email: 'o***@example.com' });

    expect(await previewLink('abc', fetchFn)).toEqual({ ok: true, email: 'o***@example.com' });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/sign-in/link/preview');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ token: 'abc' });
  });

  it('posts the token to sign in', async () => {
    const fetchFn = reply(200, { status: true });

    expect(await confirmLink('abc', fetchFn)).toEqual({ ok: true });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/sign-in/link/confirm');
    expect(JSON.parse(String(init?.body))).toEqual({ token: 'abc' });
  });

  it('words a link that no longer works the same for every reason, from the error code', async () => {
    const refused = reply(401, {
      code: 'INVALID_OR_EXPIRED_LINK',
      message: 'The link no longer works.',
    });

    expect(await previewLink('abc', refused)).toEqual({ ok: false, error: 'linkInvalid' });
    expect(await confirmLink('abc', refused)).toEqual({ ok: false, error: 'linkInvalid' });
  });

  it('treats a malformed token like a link that no longer works', async () => {
    const fetchFn = reply(400, { code: 'VALIDATION_ERROR', message: 'Too big' });

    expect(await confirmLink('x'.repeat(600), fetchFn)).toEqual({
      ok: false,
      error: 'linkInvalid',
    });
  });

  it('answers with the generic error for any other failure', async () => {
    expect(await previewLink('abc', reply(500, 'oops'))).toEqual({ ok: false, error: 'generic' });
    expect(await confirmLink('abc', reply(429, {}))).toEqual({ ok: false, error: 'generic' });
  });

  it('does not take a preview without an address for a success', async () => {
    expect(await previewLink('abc', reply(200, {}))).toEqual({ ok: false, error: 'generic' });
  });

  it('reports no connection when the request cannot reach the server', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(await confirmLink('abc', fetchFn)).toEqual({ ok: false, error: 'noConnection' });
  });
});
