import { describe, expect, it, vi } from 'vitest';
import { postJson } from './post-json';

describe('F001 JSON post of the sign-in clients', () => {
  it('sends the body as JSON with a JSON content type', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({})));

    await postJson('/api/auth/sign-in/code/request', { email: 'owner@example.com' }, fetchFn);

    // The API takes only JSON: a form post from another site (login CSRF) gets a 415, which
    // holds only while this client does send the JSON content type.
    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'owner@example.com' });
  });
});
