import { AMSTERDAM } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  applyThisAndFollowing,
  countKeptDates,
  type SeriesDate,
  type SeriesState,
} from './apply-following.ts';
import { applyToUpcomingDates } from './apply-to-series.ts';
import { materialize } from './materialize.ts';
import { wallClockToInstant } from './zoned-time.ts';

// "Reformer Power" every Tuesday 18:00 with Sarah, 8 places, *Gevorderd*, from 6 October 2026, 12
// dates made (F067, spec #587): the level is copied from the series onto each date like the
// capacity, and a date that was given its own level keeps it (F022's changed-fields rule).
const SARAH = 'trainer-profile-sarah';
const REFORMER: SeriesState = {
  rrule: 'FREQ=WEEKLY;BYDAY=TU',
  localStartTime: '18:00',
  durationMinutes: 60,
  timeZone: AMSTERDAM,
  startsOn: '2026-10-06',
  endsOn: null,
  trainerProfileId: SARAH,
  capacity: 8,
  level: 'advanced',
  materializedUntil: '2026-12-28',
};

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

function stored(occurrenceDate: string) {
  const startsAt = wallClockToInstant(occurrenceDate, '18:00', AMSTERDAM);
  if (startsAt.outcome !== 'instant') throw new Error('fixture');
  return {
    startsAt: startsAt.instant,
    endsAt: new Date(startsAt.instant.getTime() + 3_600_000),
    trainerProfileId: SARAH as string | null,
    capacity: 8,
    level: 'advanced' as SeriesDate['level'],
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

describe('F067 AC2: this and following, skipping changed dates', () => {
  it('AC2: beginner from 13 October changes the series and every following date, not the earlier one', () => {
    const result = applyThisAndFollowing(
      REFORMER,
      '2026-10-13',
      { level: 'beginner' },
      existing(),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.split).toBe(true);
    expect(result.later).toMatchObject({ startsOn: '2026-10-13', level: 'beginner' });
    expect(result.updates.map((u) => u.occurrenceDate)).toEqual(DATES.slice(1));
    expect(result.updates.every((u) => u.level === 'beginner')).toBe(true);
    // 6 October is before the chosen date: it is not among the updates and stays advanced.
    expect(result.updates.map((u) => u.occurrenceDate)).not.toContain('2026-10-06');
    expect(result.keptDates).toBe(0);
  });

  it('AC2: a date whose level was changed on its own stays and is counted', () => {
    const result = applyThisAndFollowing(
      REFORMER,
      '2026-10-13',
      { level: 'beginner' },
      existing({ '2026-11-03': { detachedFields: ['level'], level: 'all_levels' } }),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.keptDates).toBe(1);
    expect(result.updates.map((u) => u.occurrenceDate)).not.toContain('2026-11-03');
    expect(result.updates).toHaveLength(DATES.length - 2);
    // The kept date still follows the series for later changes.
    expect(result.moves).toContain('session-2026-11-03');
  });

  it('AC2: null clears the level (Geen) from the chosen date on', () => {
    const result = applyThisAndFollowing(
      REFORMER,
      '2026-10-13',
      { level: null },
      existing(),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.later.level).toBeNull();
    expect(result.updates.every((u) => u.level === null)).toBe(true);
  });

  it('AC2: a change that leaves the level out leaves the level of every date as it is', () => {
    const result = applyThisAndFollowing(
      REFORMER,
      '2026-10-13',
      { capacity: 10 },
      existing(),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.later.level).toBe('advanced');
    expect(result.updates.every((u) => u.level === 'advanced')).toBe(true);
  });

  it('AC2: the chosen date takes the level even when it had its own, the Owner asked for it there', () => {
    const result = applyThisAndFollowing(
      REFORMER,
      '2026-10-13',
      { level: 'intermediate' },
      existing({ '2026-10-13': { detachedFields: ['level'], level: 'beginner' } }),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    const chosen = result.updates.find((u) => u.occurrenceDate === '2026-10-13');
    expect(chosen).toMatchObject({ level: 'intermediate', detachedFields: [] });
  });

  it('AC2: a whole series is edited from the first date that has not started, skipping changed dates', () => {
    const now = new Date('2026-10-14T08:00:00Z');
    const result = applyToUpcomingDates(
      REFORMER,
      { level: 'all_levels' },
      existing({ '2026-11-10': { detachedFields: ['level'], level: 'beginner' } }),
      now,
      '2026-10-14',
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    expect(result.later.level).toBe('all_levels');
    expect(result.updates.map((u) => u.occurrenceDate)).toEqual(
      DATES.slice(2).filter((d) => d !== '2026-11-10'),
    );
    expect(result.keptDates).toBe(1);
  });

  it('AC2: the same level is no change', () => {
    const now = new Date('2026-10-14T08:00:00Z');
    expect(
      applyToUpcomingDates(REFORMER, { level: 'advanced' }, existing(), now, '2026-10-14'),
    ).toMatchObject({ outcome: 'unchanged' });
  });
});

describe('F067 AC3: one date stays', () => {
  it('AC3: a date changed on its own keeps its level when the series changes another field', () => {
    const result = applyThisAndFollowing(
      REFORMER,
      '2026-10-13',
      { capacity: 10 },
      existing({ '2026-10-20': { detachedFields: ['level'], level: 'beginner' } }),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    // It is not rewritten at all: its level and its marker stay as the Owner left them.
    expect(result.updates.map((u) => u.occurrenceDate)).not.toContain('2026-10-20');
    expect(result.keptDates).toBe(1);
  });

  it('AC3: a date changed on its own is counted among those that keep their own changes', () => {
    expect(
      countKeptDates(
        existing({ '2026-11-03': { detachedFields: ['level'], level: 'beginner' } }),
        '2026-10-13',
      ),
    ).toBe(1);
  });

  it('AC3: regenerating the calendar never touches a date that exists, whatever its level', () => {
    const have = DATES.map((occurrenceDate) => ({ occurrenceDate }));
    const { toInsert } = materialize(REFORMER, have, { from: '2026-10-06', to: '2026-12-28' });
    expect(toInsert).toEqual([]);
  });

  it('AC3: the chosen date with its own level keeps it when the change does not touch the level', () => {
    const result = applyThisAndFollowing(
      REFORMER,
      '2026-10-13',
      { capacity: 10 },
      existing({ '2026-10-13': { detachedFields: ['level'], level: 'beginner' } }),
      TODAY,
    );
    if (result.outcome !== 'applied') throw new Error('expected it to apply');
    const chosen = result.updates.find((u) => u.occurrenceDate === '2026-10-13');
    expect(chosen).toMatchObject({ level: 'beginner', detachedFields: ['level'], capacity: 10 });
  });
});
