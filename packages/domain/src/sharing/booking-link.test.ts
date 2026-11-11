import { describe, expect, it } from 'vitest';
import {
  BOOKING_LINK_CODE_ALPHABET,
  BOOKING_LINK_CODE_LENGTH,
  BOOKING_LINK_LANGUAGES,
  BOOKING_LINK_SCOPES,
  type BookingLink,
  bookingLinkUrl,
  checkBookingLinkRequest,
  decideBookingLinkCreate,
  decideBookingLinkSession,
  resolveBookingLink,
  STANDING_BOOKING_LINKS,
  sortBookingLinks,
} from './booking-link.ts';

const SESSION = '2c1e2b6c-0d4e-4d86-8f55-3a9c4b1f7a10';
const CLASS = '9a4f0a52-6d6f-4a4b-b6b4-5e7c2d3f8e11';

describe('F037 booking link codes and URLs', () => {
  it('a code is 8 characters of the 32 symbols of Crockford’s base32, lower case, without i, l, o and u', () => {
    expect(BOOKING_LINK_CODE_LENGTH).toBe(8);
    const digits = Array.from({ length: 10 }, (_, digit) => String(digit));
    const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index));
    const symbols = [...digits, ...letters.filter((letter) => !'ilou'.includes(letter))];
    expect(symbols).toHaveLength(32);
    expect([...BOOKING_LINK_CODE_ALPHABET]).toEqual(symbols);
  });

  it('AC1: the short URL is the app address, /l/ and the code', () => {
    expect(bookingLinkUrl('https://fivvi.app', 'k7m2q9xa')).toBe('https://fivvi.app/l/k7m2q9xa');
    expect(bookingLinkUrl('https://fivvi.app/', 'k7m2q9xa')).toBe('https://fivvi.app/l/k7m2q9xa');
  });

  it('the scopes are all, group, class and session, and the languages visitor, nl and en (Open Gym is out)', () => {
    expect(BOOKING_LINK_SCOPES).toEqual(['all', 'group', 'class', 'session']);
    expect(BOOKING_LINK_LANGUAGES).toEqual(['visitor', 'nl', 'en']);
    expect(STANDING_BOOKING_LINKS).toEqual([
      { scope: 'all', language: 'visitor' },
      { scope: 'group', language: 'visitor' },
    ]);
  });
});

describe('F037 what a request for a link must name', () => {
  it('an all or group link names no target', () => {
    expect(checkBookingLinkRequest({ scope: 'all', language: 'visitor' })).toEqual({
      outcome: 'ok',
      target: { groupClassId: null, sessionId: null },
    });
    expect(checkBookingLinkRequest({ scope: 'group', language: 'nl' })).toEqual({
      outcome: 'ok',
      target: { groupClassId: null, sessionId: null },
    });
    expect(checkBookingLinkRequest({ scope: 'all', language: 'nl', groupClassId: CLASS })).toEqual({
      outcome: 'refused',
      issues: [{ path: 'groupClassId', code: 'not_allowed' }],
    });
    expect(checkBookingLinkRequest({ scope: 'group', language: 'nl', sessionId: SESSION })).toEqual(
      { outcome: 'refused', issues: [{ path: 'sessionId', code: 'not_allowed' }] },
    );
  });

  it('a class link names its class and no date; a date link its date and no class', () => {
    expect(
      checkBookingLinkRequest({ scope: 'class', language: 'en', groupClassId: CLASS }),
    ).toEqual({ outcome: 'ok', target: { groupClassId: CLASS, sessionId: null } });
    expect(checkBookingLinkRequest({ scope: 'class', language: 'en' })).toEqual({
      outcome: 'refused',
      issues: [{ path: 'groupClassId', code: 'required' }],
    });
    expect(
      checkBookingLinkRequest({
        scope: 'class',
        language: 'en',
        groupClassId: CLASS,
        sessionId: SESSION,
      }),
    ).toEqual({ outcome: 'refused', issues: [{ path: 'sessionId', code: 'not_allowed' }] });
    expect(
      checkBookingLinkRequest({ scope: 'session', language: 'visitor', sessionId: SESSION }),
    ).toEqual({ outcome: 'ok', target: { groupClassId: null, sessionId: SESSION } });
    expect(checkBookingLinkRequest({ scope: 'session', language: 'visitor' })).toEqual({
      outcome: 'refused',
      issues: [{ path: 'sessionId', code: 'required' }],
    });
    expect(
      checkBookingLinkRequest({
        scope: 'session',
        language: 'visitor',
        sessionId: SESSION,
        groupClassId: CLASS,
      }),
    ).toEqual({ outcome: 'refused', issues: [{ path: 'groupClassId', code: 'not_allowed' }] });
  });
});

describe('F037 who may make which link', () => {
  const dateLink = { scope: 'session', language: 'visitor' } as const;

  it('AC9: the Owner makes any link', () => {
    for (const scope of BOOKING_LINK_SCOPES) {
      for (const language of BOOKING_LINK_LANGUAGES) {
        expect(decideBookingLinkCreate('owner', { scope, language })).toBe('allowed');
      }
    }
  });

  it('AC9: a Trainer makes only the link of a class date with the visitor’s language', () => {
    expect(decideBookingLinkCreate('trainer', dateLink)).toBe('allowed');
    expect(decideBookingLinkCreate('trainer', { scope: 'session', language: 'en' })).toBe(
      'forbidden',
    );
    expect(decideBookingLinkCreate('trainer', { scope: 'session', language: 'nl' })).toBe(
      'forbidden',
    );
    expect(decideBookingLinkCreate('trainer', { scope: 'class', language: 'visitor' })).toBe(
      'forbidden',
    );
    expect(decideBookingLinkCreate('trainer', { scope: 'all', language: 'visitor' })).toBe(
      'forbidden',
    );
    expect(decideBookingLinkCreate('trainer', { scope: 'group', language: 'visitor' })).toBe(
      'forbidden',
    );
  });
});

describe('F037 resolving a link', () => {
  const base: BookingLink = {
    code: 'k7m2q9xa',
    scope: 'all',
    groupClassId: null,
    sessionId: null,
    language: 'visitor',
    deactivatedAt: null,
  };

  it('an unknown code resolves to nothing about any workspace', () => {
    expect(resolveBookingLink(undefined)).toEqual({ outcome: 'unknown' });
  });

  it('an active link resolves to the timetable path of its scope and its language', () => {
    const resolve = (link: Partial<BookingLink>) =>
      resolveBookingLink({ link: { ...base, ...link }, workspaceSlug: 'johns-gym' });
    expect(resolve({})).toEqual({
      outcome: 'active',
      workspaceSlug: 'johns-gym',
      path: '/book/johns-gym',
      language: 'visitor',
    });
    expect(resolve({ scope: 'group' })).toMatchObject({ path: '/book/johns-gym/classes' });
    expect(resolve({ scope: 'class', groupClassId: CLASS, language: 'en' })).toMatchObject({
      path: `/book/johns-gym/classes/${CLASS}`,
      language: 'en',
    });
    expect(resolve({ scope: 'session', sessionId: SESSION, language: 'nl' })).toMatchObject({
      path: `/book/johns-gym/s/${SESSION}`,
      language: 'nl',
    });
  });

  it('AC7: a deactivated link resolves as inactive, naming its workspace', () => {
    expect(
      resolveBookingLink({
        link: { ...base, deactivatedAt: new Date('2026-11-12T09:00:00Z') },
        workspaceSlug: 'johns-gym',
      }),
    ).toEqual({ outcome: 'inactive', workspaceSlug: 'johns-gym' });
  });

  it('AC11: a link’s target never changes; cancelled dates still resolve', () => {
    // The link holds the date's ID and nothing of the date's status: a link whose date has been
    // cancelled since (the status is not part of `BookingLink`, so it rides along as an extra
    // field) resolves to the same path as before, and the timetable says it does not take place.
    const link: BookingLink = { ...base, scope: 'session', sessionId: SESSION };
    const withCancelledDate = { ...link, sessionStatus: 'cancelled' } satisfies BookingLink & {
      sessionStatus: string;
    };
    const resolved = resolveBookingLink({ link: withCancelledDate, workspaceSlug: 'johns-gym' });
    expect(resolved).toEqual({
      outcome: 'active',
      workspaceSlug: 'johns-gym',
      path: `/book/johns-gym/s/${SESSION}`,
      language: 'visitor',
    });
    expect(resolveBookingLink({ link, workspaceSlug: 'johns-gym' })).toEqual(resolved);
    // Resolving never changes the link it was given.
    const frozen = Object.freeze({ ...link });
    resolveBookingLink({ link: frozen, workspaceSlug: 'johns-gym' });
    expect(frozen).toEqual(link);
  });
});

describe('F037 the order of a workspace’s links', () => {
  const link = (code: string, scope: BookingLink['scope'], deactivated: boolean, at: string) => ({
    code,
    scope,
    language: 'visitor' as const,
    deactivatedAt: deactivated ? new Date(at) : null,
    createdAt: new Date(at),
  });

  it('lists the standing links first (all, then group), then the other active links by creation, then the deactivated ones', () => {
    const links = [
      link('d', 'class', true, '2026-11-02T10:00:00Z'),
      link('c', 'session', false, '2026-11-03T10:00:00Z'),
      link('b', 'group', false, '2026-11-01T10:00:00Z'),
      link('e', 'class', false, '2026-11-02T10:00:00Z'),
      link('a', 'all', false, '2026-11-01T10:00:00Z'),
      { ...link('f', 'all', false, '2026-11-01T09:00:00Z'), language: 'en' as const },
    ];
    // `f` is an all-bookings link in English, so not a standing one: it goes by creation time.
    expect(sortBookingLinks(links).map((entry) => entry.code)).toEqual([
      'a',
      'b',
      'f',
      'e',
      'c',
      'd',
    ]);
  });
});

describe('F037 which class dates may have a link', () => {
  const now = new Date('2026-11-11T10:00:00Z');
  const later = new Date('2026-11-17T17:00:00Z');

  it('AC2: an upcoming class date may', () => {
    expect(decideBookingLinkSession({ type: 'group', startsAt: later }, now)).toBe('ok');
  });

  it('a private session or an Open Gym slot never has a booking link', () => {
    expect(decideBookingLinkSession({ type: 'private', startsAt: later }, now)).toBe(
      'not-a-class-date',
    );
    expect(decideBookingLinkSession({ type: 'open_gym', startsAt: later }, now)).toBe(
      'not-a-class-date',
    );
  });

  it('a class date that has started or passed may not (the start itself is too late)', () => {
    expect(decideBookingLinkSession({ type: 'group', startsAt: now }, now)).toBe('passed');
    expect(
      decideBookingLinkSession({ type: 'group', startsAt: new Date('2026-11-10T18:00:00Z') }, now),
    ).toBe('passed');
  });
});
