import { AMSTERDAM, zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import { applyThisAndFollowing, type SeriesDate, type SeriesState } from './apply-following.ts';
import {
  endSubstitution,
  isSubstitution,
  type SubstitutionDate,
  sendsSubstitutionNotice,
  substitute,
  substitutionLanguage,
} from './substitution.ts';
import { wallClockToInstant } from './zoned-time.ts';

// F024 (spec #461, ticket #552), AC1, AC2, AC5, AC6, AC8, AC12: who teaches a class date after the
// Owner substitutes a trainer for it. Synthetic people: Sarah, Mike and Lisa (trainer profiles).
// Kracht is the weekly series on Tuesday 18:00 with Sarah from 6 October 2026; "now" is Monday
// 12 October 2026.

const SARAH = 'trainer-profile-sarah';
const MIKE = 'trainer-profile-mike';
const LISA = 'trainer-profile-lisa';
const NOW = zonedTime('2026-10-12T09:00');

const KRACHT: SeriesState = {
  rrule: 'FREQ=WEEKLY;BYDAY=TU',
  localStartTime: '18:00',
  durationMinutes: 60,
  timeZone: AMSTERDAM,
  startsOn: '2026-10-06',
  endsOn: null,
  trainerProfileId: SARAH,
  capacity: 8,
  level: null,
  materializedUntil: '2026-12-28',
};

const DAYS = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03'];

function startOf(day: string): Date {
  const start = wallClockToInstant(day, '18:00', AMSTERDAM);
  if (start.outcome !== 'instant') throw new Error('fixture');
  return start.instant;
}

/** Kracht on a day: Sarah teaches it as the series says, unless the test says otherwise. */
const kracht = (
  day: string,
  overrides: Partial<SubstitutionDate> = {},
  detached: SubstitutionDate['series'] = { trainerProfileId: SARAH, detachedFields: [] },
): SubstitutionDate => ({
  type: 'group',
  status: 'scheduled',
  startsAt: startOf(day),
  trainerProfileId: SARAH,
  substituteForTrainerProfileId: null,
  series: detached,
  ...overrides,
});

describe('F024 AC1: only this date changes', () => {
  it('AC1: only this date’s trainer changes: Mike teaches 20 October, Sarah is remembered, the date is its own in the trainer', () => {
    expect(substitute(kracht('2026-10-20'), MIKE)).toEqual({
      outcome: 'applied',
      change: 'started',
      trainerProfileId: MIKE,
      substituteForTrainerProfileId: SARAH,
      detachedFields: ['trainer'],
    });
  });

  it('AC1: a date that was changed in its time keeps that and gains the trainer', () => {
    const decision = substitute(
      kracht('2026-10-20', {}, { trainerProfileId: SARAH, detachedFields: ['time', 'level'] }),
      MIKE,
    );

    expect(decision).toMatchObject({
      outcome: 'applied',
      detachedFields: ['time', 'trainer', 'level'],
    });
  });

  it('AC1: a date on its own (no series) has nothing to detach from', () => {
    expect(substitute({ ...kracht('2026-10-20'), series: undefined }, MIKE)).toMatchObject({
      outcome: 'applied',
      detachedFields: [],
      substituteForTrainerProfileId: SARAH,
    });
  });

  it('AC1: a cancelled date, a date without a trainer, the same trainer and a private session are refused', () => {
    expect(substitute(kracht('2026-10-20', { status: 'cancelled' }), MIKE)).toEqual({
      outcome: 'refused',
      reason: 'not-scheduled',
    });
    expect(substitute(kracht('2026-10-20', { trainerProfileId: null }), MIKE)).toEqual({
      outcome: 'refused',
      reason: 'no-trainer',
    });
    expect(substitute(kracht('2026-10-20'), SARAH)).toEqual({
      outcome: 'refused',
      reason: 'same-trainer',
    });
    expect(substitute(kracht('2026-10-20', { type: 'private' }), MIKE)).toEqual({
      outcome: 'refused',
      reason: 'private-session',
    });
  });
});

describe('F024 isSubstitution', () => {
  it('is a class date that has a trainer, for this date alone', () => {
    expect(isSubstitution({ type: 'group', trainerProfileId: SARAH }, 'this')).toBe(true);
    expect(isSubstitution({ type: 'group', trainerProfileId: null }, 'this')).toBe(false);
    expect(isSubstitution({ type: 'group', trainerProfileId: SARAH }, 'following')).toBe(false);
    expect(isSubstitution({ type: 'private', trainerProfileId: SARAH }, 'this')).toBe(false);
  });
});

describe('F024 AC5: replacing and ending a substitution', () => {
  const mikesDate = kracht(
    '2026-10-20',
    { trainerProfileId: MIKE, substituteForTrainerProfileId: SARAH },
    { trainerProfileId: SARAH, detachedFields: ['trainer'] },
  );

  it('AC5: back to Sarah ends it: Sarah teaches, nothing is remembered, the date follows its series again, nobody is told', () => {
    const expected = {
      outcome: 'applied',
      change: 'ended',
      trainerProfileId: SARAH,
      substituteForTrainerProfileId: null,
      detachedFields: [],
    };

    expect(substitute(mikesDate, SARAH)).toEqual(expected);
    expect(endSubstitution(mikesDate)).toEqual(expected);
  });

  it('AC5: a third trainer keeps the first original: Lisa replaces Sarah, and Lisa is told', () => {
    expect(substitute(mikesDate, LISA)).toEqual({
      outcome: 'applied',
      change: 'replaced',
      trainerProfileId: LISA,
      substituteForTrainerProfileId: SARAH,
      detachedFields: ['trainer'],
    });
  });

  it('AC5: ending a substitution of a date whose original is not the series’ trainer keeps the date’s own trainer', () => {
    const tomsOwn = kracht(
      '2026-10-20',
      { trainerProfileId: MIKE, substituteForTrainerProfileId: LISA },
      { trainerProfileId: SARAH, detachedFields: ['trainer'] },
    );

    expect(substitute(tomsOwn, LISA)).toMatchObject({
      change: 'ended',
      trainerProfileId: LISA,
      detachedFields: ['trainer'],
    });
  });

  it('AC5: a date that is no substitution has nothing to end', () => {
    expect(endSubstitution(kracht('2026-10-20'))).toEqual({
      outcome: 'refused',
      reason: 'not-a-substitution',
    });
  });
});

describe('F024 AC8: a date that has started', () => {
  it('AC8: a past date is recorded with the substitute, who is not told', () => {
    const past = kracht('2026-10-06');

    expect(substitute(past, MIKE)).toMatchObject({
      outcome: 'applied',
      change: 'started',
      trainerProfileId: MIKE,
      substituteForTrainerProfileId: SARAH,
    });
  });

  it('AC12: the substitute is told only when asked, for a substitution that is not over and a date to come', () => {
    const base = {
      notify: true,
      change: 'started',
      startsAt: startOf('2026-10-20'),
      now: NOW,
    } as const;

    expect(sendsSubstitutionNotice(base)).toBe(true);
    expect(sendsSubstitutionNotice({ ...base, notify: false })).toBe(false);
    expect(sendsSubstitutionNotice({ ...base, change: 'ended' })).toBe(false);
    expect(sendsSubstitutionNotice({ ...base, startsAt: startOf('2026-10-06') })).toBe(false);
    expect(sendsSubstitutionNotice({ ...base, startsAt: NOW })).toBe(false);
  });
});

describe('F024 AC6: a later change of the series', () => {
  it('AC6: this and following from 13 October gives Lisa the other dates and leaves 20 October with Mike', () => {
    const dates: SeriesDate[] = DAYS.map((occurrenceDate) => ({
      id: `session-${occurrenceDate}`,
      occurrenceDate,
      // The date substituted by Mike has a trainer of its own, as `substitute` writes it.
      detachedFields: occurrenceDate === '2026-10-20' ? ['trainer'] : [],
      cancelled: false,
      startsAt: startOf(occurrenceDate),
      endsAt: new Date(startOf(occurrenceDate).getTime() + 3_600_000),
      trainerProfileId: occurrenceDate === '2026-10-20' ? MIKE : SARAH,
      capacity: 8,
      level: null,
    }));

    const decision = applyThisAndFollowing(
      KRACHT,
      '2026-10-13',
      { trainerProfileId: LISA },
      dates,
      '2026-10-12',
    );

    if (decision.outcome !== 'applied') throw new Error('refused');
    const lisaDays = decision.updates
      .filter((update) => update.trainerProfileId === LISA)
      .map((update) => update.occurrenceDate);
    expect(lisaDays).toEqual(['2026-10-13', '2026-10-27', '2026-11-03']);
    expect(decision.updates.map((update) => update.occurrenceDate)).not.toContain('2026-10-20');
    expect(decision.keptDates).toBe(1);
  });
});

describe('F024 AC2: the language of EM-10', () => {
  it('AC2: the substitute’s stored language, else the workspace’s default', () => {
    expect(substitutionLanguage({ accountPreference: 'en', workspaceDefault: 'nl-NL' })).toBe('en');
    expect(substitutionLanguage({ accountPreference: null, workspaceDefault: 'nl-NL' })).toBe(
      'nl-NL',
    );
    expect(substitutionLanguage({ accountPreference: 'de', workspaceDefault: 'en' })).toBe('en');
  });
});
