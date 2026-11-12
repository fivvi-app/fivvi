import { AMSTERDAM } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import { applyThisAndFollowing, type SeriesDate, type SeriesState } from './apply-following.ts';
import { wallClockToInstant } from './zoned-time.ts';

// Kracht every Tuesday 18:00 with Sarah, 8 places, from 6 October 2026, 12 dates made.
const SARAH = 'trainer-profile-sarah';
const KRACHT: SeriesState = {
  rrule: 'FREQ=WEEKLY;BYDAY=TU',
  localStartTime: '18:00',
  durationMinutes: 60,
  timeZone: AMSTERDAM,
  startsOn: '2026-10-06',
  endsOn: null,
  trainerProfileId: SARAH,
  capacity: 8,
  materializedUntil: '2026-12-28',
};

/** Monday 5 October 2026: the day before the first date. */
const TODAY = '2026-10-05';

const DATES = [
  '2026-10-06',
  '2026-10-13',
  '2026-10-20',
  '2026-10-27',
  '2026-11-03',
  '2026-11-10',
  '2026-11-17',
  '2026-11-24',
  '2026-12-01',
  '2026-12-08',
  '2026-12-15',
  '2026-12-22',
];

/** A date as stored: 18:00 Amsterdam time for an hour, Sarah, 8 places. */
function stored(occurrenceDate: string) {
  const startsAt = wallClockToInstant(occurrenceDate, '18:00', AMSTERDAM);
  if (startsAt.outcome !== 'instant') throw new Error('fixture');
  return {
    startsAt: startsAt.instant,
    endsAt: new Date(startsAt.instant.getTime() + 3_600_000),
    trainerProfileId: SARAH as string | null,
    capacity: 8,
  };
}

function existing(overrides: Record<string, Partial<SeriesDate>> = {}): SeriesDate[] {
  return DATES.map((occurrenceDate) => ({
    id: `session-${occurrenceDate}`,
    occurrenceDate,
    detachedFields: [],
    cancelled: false,
    ...stored(occurrenceDate),
    ...overrides[occurrenceDate],
  }));
}

describe('F022 AC5: this and following', () => {
  it('AC5: capacity 10 from 13 October splits the series and updates every unchanged date from 13 October', () => {
    const result = applyThisAndFollowing(KRACHT, '2026-10-13', { capacity: 10 }, existing(), TODAY);
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.split).toBe(true);
    // The earlier series ends on 6 October, the new one starts on 13 October.
    expect(result.earlierEndsOn).toBe('2026-10-06');
    expect(result.later).toMatchObject({
      startsOn: '2026-10-13',
      endsOn: null,
      capacity: 10,
      trainerProfileId: SARAH,
    });
    expect(result.updates.map((u) => u.occurrenceDate)).toEqual(DATES.slice(1));
    expect(result.updates.every((u) => u.capacity === 10)).toBe(true);
    expect(result.moves).toEqual(DATES.slice(1).map((d) => `session-${d}`));
    expect(result.keptDates).toBe(0);
  });

  it('AC5: 20 October was changed on its own: it keeps its own changes and is counted', () => {
    const result = applyThisAndFollowing(
      KRACHT,
      '2026-10-13',
      { capacity: 10 },
      existing({ '2026-10-20': { detachedFields: ['time'] } }),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.keptDates).toBe(1);
    expect(result.updates.map((u) => u.occurrenceDate)).not.toContain('2026-10-20');
    expect(result.updates).toHaveLength(DATES.length - 2);
    // The kept date still belongs to the series from now on, so later changes reach it again.
    expect(result.moves).toContain('session-2026-10-20');
  });

  it('a cancelled date is not updated and not counted as changed by hand', () => {
    const result = applyThisAndFollowing(
      KRACHT,
      '2026-10-13',
      { capacity: 10 },
      existing({ '2026-11-03': { cancelled: true } }),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.updates.map((u) => u.occurrenceDate)).not.toContain('2026-11-03');
    expect(result.keptDates).toBe(0);
  });

  it('dates before the chosen one are not touched', () => {
    const result = applyThisAndFollowing(KRACHT, '2026-11-03', { capacity: 10 }, existing(), TODAY);
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.earlierEndsOn).toBe('2026-10-27');
    expect(result.updates.map((u) => u.occurrenceDate)).toEqual(DATES.slice(4));
    expect(result.moves).toEqual(DATES.slice(4).map((d) => `session-${d}`));
  });

  it('a new start time moves the unchanged dates to it, across the clock change, in UTC', () => {
    const result = applyThisAndFollowing(
      KRACHT,
      '2026-10-13',
      { localStartTime: '18:30' },
      existing(),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    const by = Object.fromEntries(
      result.updates.map((u) => [u.occurrenceDate, u.startsAt.toISOString()]),
    );
    expect(by['2026-10-13']).toBe('2026-10-13T16:30:00.000Z');
    expect(by['2026-10-27']).toBe('2026-10-27T17:30:00.000Z');
    expect(result.updates[0]?.endsAt.toISOString()).toBe('2026-10-13T17:30:00.000Z');
    expect(result.later.localStartTime).toBe('18:30');
  });

  it('the chosen date takes the change even when it was changed on its own, and is aligned again', () => {
    const result = applyThisAndFollowing(
      KRACHT,
      '2026-10-13',
      { capacity: 10 },
      existing({ '2026-10-13': { detachedFields: ['capacity'] } }),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.keptDates).toBe(0);
    expect(result.updates[0]).toMatchObject({
      occurrenceDate: '2026-10-13',
      capacity: 10,
      detachedFields: [],
    });
  });

  it('the chosen date keeps a field of its own that the change does not touch, and drops one it does', () => {
    const own = {
      detachedFields: ['time', 'capacity'] as SeriesDate['detachedFields'],
      capacity: 5,
    };
    const result = applyThisAndFollowing(
      KRACHT,
      '2026-10-13',
      { capacity: 10 },
      existing({ '2026-10-13': own }),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    // Capacity was touched: back to the series (10). Time was not: still its own, still marked.
    expect(result.updates[0]).toMatchObject({ capacity: 10, detachedFields: ['time'] });
    expect(result.updates[0]?.startsAt).toEqual(stored('2026-10-13').startsAt);
  });

  it('from the first date of the series nothing is split: the series itself changes', () => {
    const result = applyThisAndFollowing(KRACHT, '2026-10-06', { capacity: 10 }, existing(), TODAY);
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.split).toBe(false);
    expect(result.earlierEndsOn).toBeNull();
    expect(result.later).toMatchObject({ startsOn: '2026-10-06', capacity: 10 });
    expect(result.updates).toHaveLength(12);
  });

  it('a trainer of null makes the later dates Trainer nodig', () => {
    const result = applyThisAndFollowing(
      KRACHT,
      '2026-10-13',
      { trainerProfileId: null },
      existing(),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.later.trainerProfileId).toBeNull();
    expect(result.updates.every((u) => u.trainerProfileId === null)).toBe(true);
  });

  it('keeps an end date of the series on the new one', () => {
    const result = applyThisAndFollowing(
      { ...KRACHT, endsOn: '2026-12-22' },
      '2026-10-13',
      { capacity: 10 },
      existing(),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.later.endsOn).toBe('2026-12-22');
  });

  it('refuses a new time that does not exist on one of the dates, and changes nothing', () => {
    const sunday: SeriesState = {
      ...KRACHT,
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      localStartTime: '10:00',
      startsOn: '2027-03-14',
      materializedUntil: '2027-05-30',
    };
    const dates = ['2027-03-14', '2027-03-21', '2027-03-28', '2027-04-04'].map(
      (occurrenceDate) => ({
        id: occurrenceDate,
        occurrenceDate,
        detachedFields: [] as SeriesDate['detachedFields'],
        cancelled: false,
        ...stored(occurrenceDate),
      }),
    );
    expect(
      applyThisAndFollowing(sunday, '2027-03-21', { localStartTime: '02:30' }, dates, TODAY),
    ).toEqual({
      outcome: 'refused',
      reason: 'time-does-not-exist',
      date: '2027-03-28',
    });
  });

  it('refuses a start the clocks skip on a date beyond the stored end, up to 12 weeks from today', () => {
    // Sundays from 25 October 2026, filled to 16 January 2027; today is 10 January, so the 12 weeks
    // ahead reach 3 April and 28 March 2027 (clocks forward at 02:00) is one of the dates.
    const sunday: SeriesState = {
      ...KRACHT,
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      localStartTime: '10:00',
      startsOn: '2026-10-25',
      materializedUntil: '2027-01-16',
    };
    const dates = ['2027-01-03', '2027-01-10'].map((occurrenceDate) => ({
      id: occurrenceDate,
      occurrenceDate,
      detachedFields: [] as SeriesDate['detachedFields'],
      cancelled: false,
      ...stored(occurrenceDate),
    }));
    expect(
      applyThisAndFollowing(sunday, '2027-01-10', { localStartTime: '02:30' }, dates, '2027-01-10'),
    ).toEqual({ outcome: 'refused', reason: 'time-does-not-exist', date: '2027-03-28' });
  });

  it('answers the day the calendar is filled to: the later of the stored end and 12 weeks from today', () => {
    const result = applyThisAndFollowing(KRACHT, '2026-10-13', { capacity: 10 }, existing(), TODAY);
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.materializedUntil).toBe('2026-12-28');
    const later = applyThisAndFollowing(
      { ...KRACHT, materializedUntil: '2026-10-27' },
      '2026-10-13',
      { capacity: 10 },
      existing(),
      TODAY,
    );
    if (later.outcome !== 'applied') throw new Error('expected it to apply');
    // 5 October + 83 days.
    expect(later.materializedUntil).toBe('2026-12-27');
  });

  it('refuses a chosen date before today: past dates of a series are not changed', () => {
    expect(
      applyThisAndFollowing(KRACHT, '2026-10-13', { capacity: 10 }, existing(), '2026-10-14'),
    ).toEqual({ outcome: 'refused', reason: 'date-in-past' });
    // Today itself is fine.
    expect(
      applyThisAndFollowing(KRACHT, '2026-10-13', { capacity: 10 }, existing(), '2026-10-13')
        .outcome,
    ).toBe('applied');
  });

  it.each([14, 241, 62, 60.5])(
    'refuses a length of %s minutes: 15 to 240 in whole steps of 5',
    (durationMinutes) => {
      expect(
        applyThisAndFollowing(KRACHT, '2026-10-13', { durationMinutes }, existing(), TODAY),
      ).toEqual({ outcome: 'refused', reason: 'invalid-duration' });
    },
  );
});
