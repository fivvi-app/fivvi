import { describe, expect, it, vi } from 'vitest';
import {
  createBookingLink,
  deactivateBookingLink,
  listBookingLinks,
  listClassDates,
} from './booking-links-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const link = {
  id: 'l1',
  url: 'https://fivvi.app/l/k7p2m9xa',
  scope: 'class',
  language: 'en',
  active: true,
  deactivatedAt: null,
  createdAt: '2026-11-10T09:00:00.000Z',
  groupClass: { id: 'c1', nameNl: 'Kracht', nameEn: 'Strength' },
  date: null,
};

describe('F037 TW-07 booking links client', () => {
  describe('listBookingLinks', () => {
    it('AC1: reads the links of the workspace', async () => {
      const fetchFn = reply(200, { links: [link] });

      const result = await listBookingLinks('w1', fetchFn);

      expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/v1/workspaces/w1/booking-links');
      expect(result).toEqual({ ok: true, links: [link] });
    });

    it('answers "home" for 401, "forbidden" for 403, "generic" for the rest and "noConnection" without a network', async () => {
      expect(await listBookingLinks('w1', reply(401))).toEqual({ ok: false, reason: 'home' });
      expect(await listBookingLinks('w1', reply(403))).toEqual({ ok: false, reason: 'forbidden' });
      expect(await listBookingLinks('w1', reply(500))).toEqual({ ok: false, reason: 'generic' });
      const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
      expect(await listBookingLinks('w1', offline)).toEqual({
        ok: false,
        reason: 'noConnection',
      });
    });
  });

  describe('createBookingLink', () => {
    it('AC2: posts the scope, language and class, and says whether the link is new (201) or the one that existed (200)', async () => {
      const made = reply(201, link);
      const result = await createBookingLink(
        'w1',
        { scope: 'class', language: 'en', groupClassId: 'c1' },
        made,
      );

      const [url, init] = made.mock.calls[0] ?? [];
      expect(url).toBe('/api/v1/workspaces/w1/booking-links');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        scope: 'class',
        language: 'en',
        groupClassId: 'c1',
      });
      expect(result).toEqual({ ok: true, link, created: true });
      expect(
        await createBookingLink('w1', { scope: 'all', language: 'visitor' }, reply(200, link)),
      ).toEqual({ ok: true, link, created: false });
    });

    it('AC9: a 403 is "forbidden"', async () => {
      expect(
        await createBookingLink('w1', { scope: 'all', language: 'visitor' }, reply(403)),
      ).toEqual({ ok: false, reason: 'forbidden' });
    });
  });

  describe('deactivateBookingLink', () => {
    it('AC7: posts to the link and returns the deactivated link', async () => {
      const stopped = { ...link, active: false, deactivatedAt: '2026-11-12T09:00:00.000Z' };
      const fetchFn = reply(200, stopped);

      const result = await deactivateBookingLink('w1', 'l1', fetchFn);

      const [url, init] = fetchFn.mock.calls[0] ?? [];
      expect(url).toBe('/api/v1/workspaces/w1/booking-links/l1/deactivate');
      expect(init?.method).toBe('POST');
      expect(result).toEqual({ ok: true, link: stopped });
    });

    it('AC9: a 403 is "forbidden"', async () => {
      expect(await deactivateBookingLink('w1', 'l1', reply(403))).toEqual({
        ok: false,
        reason: 'forbidden',
      });
    });
  });

  describe('listClassDates', () => {
    // Tuesday 10 November 2026, 12:00 in Amsterdam: the Tuesday 18:00 date of this day still lies ahead.
    const now = new Date('2026-11-10T11:00:00.000Z');
    const item = (id: string, startsAt: string, status = 'scheduled') => ({
      id,
      type: 'group',
      status,
      startsAt,
      endsAt: startsAt,
      timeZone: 'Europe/Amsterdam',
    });
    const answers = (...windows: unknown[][]) => {
      const queue = [...windows];
      return vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ items: queue.shift() ?? [] }, { status: 200 })),
      );
    };

    it('AC2: asks the calendar for this class’s dates that are not cancelled, from today on the workspace’s clock, in two windows of at most 42 days', async () => {
      const fetchFn = answers([], []);

      await listClassDates('w1', 'c1', 'Europe/Amsterdam', fetchFn, now);

      const urls = fetchFn.mock.calls.map(([url]) => String(url));
      expect(urls).toEqual([
        '/api/v1/workspaces/w1/calendar?from=2026-11-10&to=2026-12-21&groupClassId=c1&includeCancelled=false',
        '/api/v1/workspaces/w1/calendar?from=2026-12-22&to=2027-02-01&groupClassId=c1&includeCancelled=false',
      ]);
    });

    it('AC2: takes “today” on the workspace’s wall clock, not the browser’s', async () => {
      const fetchFn = answers([], []);
      // 23:30 UTC on the 10th is already the 11th in Amsterdam.
      await listClassDates(
        'w1',
        'c1',
        'Europe/Amsterdam',
        fetchFn,
        new Date('2026-11-10T23:30:00Z'),
      );
      expect(String(fetchFn.mock.calls[0]?.[0])).toContain('from=2026-11-11&');
    });

    it('AC2: lists the dates that lie ahead in time order and leaves out a date that has begun or is cancelled', async () => {
      const result = await listClassDates(
        'w1',
        'c1',
        'Europe/Amsterdam',
        answers(
          [
            item('begun', '2026-11-10T10:00:00.000Z'),
            item('cancelled', '2026-11-10T17:00:00.000Z', 'cancelled'),
            item('tuesday', '2026-11-17T17:00:00.000Z'),
          ],
          [item('later', '2026-12-29T17:00:00.000Z')],
        ),
        now,
      );

      expect(result).toEqual({
        ok: true,
        dates: [
          { id: 'tuesday', startsAt: '2026-11-17T17:00:00.000Z', timeZone: 'Europe/Amsterdam' },
          { id: 'later', startsAt: '2026-12-29T17:00:00.000Z', timeZone: 'Europe/Amsterdam' },
        ],
      });
    });

    it('answers "forbidden", "home", "generic" or "noConnection" when a window is refused or the network is down', async () => {
      expect(await listClassDates('w1', 'c1', 'Europe/Amsterdam', reply(403), now)).toEqual({
        ok: false,
        reason: 'forbidden',
      });
      expect(await listClassDates('w1', 'c1', 'Europe/Amsterdam', reply(401), now)).toEqual({
        ok: false,
        reason: 'home',
      });
      expect(await listClassDates('w1', 'c1', 'Europe/Amsterdam', reply(500), now)).toEqual({
        ok: false,
        reason: 'generic',
      });
      const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
      expect(await listClassDates('w1', 'c1', 'Europe/Amsterdam', offline, now)).toEqual({
        ok: false,
        reason: 'noConnection',
      });
    });
  });
});
