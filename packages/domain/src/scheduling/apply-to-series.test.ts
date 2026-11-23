import { AMSTERDAM } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import type { SeriesDate, SeriesState } from './apply-following.ts';
import { applyToUpcomingDates } from './apply-to-series.ts';
import { wallClockToInstant } from './zoned-time.ts';

// Kracht every Tuesday 18:00 with Sarah, 8 places, from 6 October 2026, 12 dates made.
const SARAH = 'trainer-profile-sarah';
const TOM = 'trainer-profile-tom';
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

/** Wednesday 14 October 2026, 10:00 in Amsterdam: the 6th and the 13th have started. */
const NOW = new Date('2026-10-14T08:00:00Z');
const TODAY = '2026-10-14';
const WHOLE = {
  localStartTime: '19:00',
  durationMinutes: 60,
  capacity: 10,
  trainerProfileId: TOM,
};

describe('F022 AC5: a whole series, from the first date that has not started', () => {
  it('AC5: changes every upcoming date from 20 October and leaves the two that have started', () => {
    const result = applyToUpcomingDates(KRACHT, WHOLE, existing(), NOW, TODAY);
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.split).toBe(true);
    expect(result.earlierEndsOn).toBe('2026-10-13');
    expect(result.later).toMatchObject({
      startsOn: '2026-10-20',
      localStartTime: '19:00',
      capacity: 10,
      trainerProfileId: TOM,
    });
    expect(result.updates.map((u) => u.occurrenceDate)).toEqual(DATES.slice(2));
    expect(result.updates.every((u) => u.capacity === 10 && u.trainerProfileId === TOM)).toBe(true);
    expect(result.updates[0]?.startsAt.toISOString()).toBe('2026-10-20T17:00:00.000Z');
    expect(result.keptDates).toBe(0);
  });

  it('a date that starts later today is the first one that has not started', () => {
    const morning = new Date('2026-10-13T08:00:00Z');
    const result = applyToUpcomingDates(KRACHT, WHOLE, existing(), morning, '2026-10-13');
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.updates.map((u) => u.occurrenceDate)).toEqual(DATES.slice(1));
    expect(result.earlierEndsOn).toBe('2026-10-06');
  });

  it('a date that is running (started, not ended) has started and is not changed', () => {
    const running = new Date('2026-10-20T16:30:00Z');
    const result = applyToUpcomingDates(KRACHT, WHOLE, existing(), running, '2026-10-20');
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.updates.map((u) => u.occurrenceDate)).toEqual(DATES.slice(3));
  });

  it('the first date does not split the series when none has started', () => {
    const before = new Date('2026-10-01T08:00:00Z');
    const result = applyToUpcomingDates(KRACHT, WHOLE, existing(), before, '2026-10-01');
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.split).toBe(false);
    expect(result.updates).toHaveLength(DATES.length);
  });

  it('dates with their own changes keep them, the first upcoming one too, and are counted', () => {
    const result = applyToUpcomingDates(
      KRACHT,
      WHOLE,
      existing({
        '2026-10-20': { detachedFields: ['time'] },
        '2026-11-10': { detachedFields: ['capacity'] },
      }),
      NOW,
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.keptDates).toBe(2);
    const changed = result.updates.map((u) => u.occurrenceDate);
    expect(changed).not.toContain('2026-10-20');
    expect(changed).not.toContain('2026-11-10');
    expect(changed).toHaveLength(DATES.length - 2 - 2);
    // They still belong to the series that now runs.
    expect(result.moves).toContain('session-2026-10-20');
  });

  it('a cancelled date is skipped: the series changes from the next date that has not started', () => {
    const result = applyToUpcomingDates(
      KRACHT,
      WHOLE,
      existing({ '2026-10-20': { cancelled: true } }),
      NOW,
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.earlierEndsOn).toBe('2026-10-20');
    expect(result.updates.map((u) => u.occurrenceDate)).toEqual(DATES.slice(3));
  });

  it('trainerProfileId null makes the dates Trainer nodig', () => {
    const result = applyToUpcomingDates(KRACHT, { trainerProfileId: null }, existing(), NOW, TODAY);
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.later.trainerProfileId).toBeNull();
    expect(result.updates.every((u) => u.trainerProfileId === null)).toBe(true);
  });

  it('refuses when no date has started yet to change: all started or cancelled', () => {
    const late = new Date('2027-01-05T08:00:00Z');
    expect(applyToUpcomingDates(KRACHT, WHOLE, existing(), late, '2027-01-05')).toEqual({
      outcome: 'refused',
      reason: 'no-upcoming-dates',
    });
    const cancelled = Object.fromEntries(DATES.map((d) => [d, { cancelled: true }]));
    expect(applyToUpcomingDates(KRACHT, WHOLE, existing(cancelled), NOW, TODAY)).toEqual({
      outcome: 'refused',
      reason: 'no-upcoming-dates',
    });
  });

  it('a change that leaves the series as it is changes nothing and counts the dates that keep their own', () => {
    const result = applyToUpcomingDates(
      KRACHT,
      { localStartTime: '18:00', capacity: 8, trainerProfileId: SARAH },
      existing({ '2026-10-27': { detachedFields: ['trainer'] } }),
      NOW,
      TODAY,
    );
    expect(result).toEqual({ outcome: 'unchanged', keptDates: 1 });
  });

  it('passes on the refusals of the date edit: a length that is no step', () => {
    expect(applyToUpcomingDates(KRACHT, { durationMinutes: 62 }, existing(), NOW, TODAY)).toEqual({
      outcome: 'refused',
      reason: 'invalid-duration',
    });
  });

  it('refuses a start the clocks skip, with the date', () => {
    const sunday: SeriesState = {
      ...KRACHT,
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      localStartTime: '10:00',
      startsOn: '2027-03-07',
      materializedUntil: '2027-05-23',
    };
    const dates = ['2027-03-07', '2027-03-14', '2027-03-21', '2027-03-28'].map((day) => ({
      id: day,
      occurrenceDate: day,
      detachedFields: [] as SeriesDate['detachedFields'],
      cancelled: false,
      ...stored(day),
    }));
    expect(
      applyToUpcomingDates(
        sunday,
        { localStartTime: '02:30' },
        dates,
        new Date('2027-03-10T08:00:00Z'),
        '2027-03-10',
      ),
    ).toEqual({ outcome: 'refused', reason: 'time-does-not-exist', date: '2027-03-28' });
  });
});
