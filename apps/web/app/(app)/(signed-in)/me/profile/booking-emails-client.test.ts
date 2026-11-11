import { describe, expect, it, vi } from 'vitest';
import { saveBookingEmails } from './booking-emails-client';

const reply = (status: number) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json({}, { status })));

describe('F050 TW-09 booking emails client', () => {
  it.each([true, false])(
    'AC6: sets bookingEmails to %s on the account with PATCH /api/v1/me',
    async (on) => {
      const fetchFn = reply(200);

      expect(await saveBookingEmails(on, fetchFn)).toEqual({ ok: true });

      const [url, init] = fetchFn.mock.calls[0] ?? [];
      expect(url).toBe('/api/v1/me');
      expect(init?.method).toBe('PATCH');
      expect(JSON.parse(String(init?.body))).toEqual({ bookingEmails: on });
    },
  );

  it('a 401 means the sign-in ended', async () => {
    expect(await saveBookingEmails(false, reply(401))).toEqual({
      ok: false,
      reason: 'signedOut',
    });
  });

  it.each([400, 500])('a %s is a failure the page words', async (status) => {
    expect(await saveBookingEmails(false, reply(status))).toEqual({
      ok: false,
      reason: 'generic',
    });
  });

  it('a request that cannot reach the server is no connection', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await saveBookingEmails(false, fetchFn)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});
