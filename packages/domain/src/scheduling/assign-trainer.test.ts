import { AMSTERDAM, zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import type { SeriesDate, SeriesState } from './apply-following.ts';
import {
  type AssignTrainerFacts,
  assignTrainer,
  sendsTrainerChangeNotice,
} from './assign-trainer.ts';
import { wallClockToInstant } from './zoned-time.ts';

// F023 (spec #459), AC1, AC2, AC8 and AC17: who teaches what after the Owner assigns a trainer.
// Synthetic people: Sarah, Tom and Mike (trainer profiles). Kracht is the weekly series on Tuesday
// 18:00 with Sarah from 6 October 2026; Boxing is a one-off class on Thursday 24 September 2026
// with *Trainer nodig*. "Today" is Monday 28 September 2026 for Boxing, Monday 5 October for Kracht.

const SARAH = 'trainer-profile-sarah';
const TOM = 'trainer-profile-tom';
const MIKE = 'trainer-profile-mike';

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

const DATES = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];

function stored(occurrenceDate: string) {
  const startsAt = wallClockToInstant(occurrenceDate, '18:00', AMSTERDAM);
  if (startsAt.outcome !== 'instant') throw new Error('fixture');
  return {
    startsAt: startsAt.instant,
    endsAt: new Date(startsAt.instant.getTime() + 3_600_000),
    trainerProfileId: SARAH as string | null,
    capacity: 8,
    level: null as SeriesDate['level'],
  };
}

function datesOfKracht(overrides: Record<string, Partial<SeriesDate>> = {}): SeriesDate[] {
  return DATES.map((occurrenceDate) => ({
    id: `session-${occurrenceDate}`,
    occurrenceDate,
    detachedFields: [],
    cancelled: false,
    ...stored(occurrenceDate),
    ...overrides[occurrenceDate],
  }));
}

const BOXING = {
  id: 'boxing',
  type: 'group' as const,
  status: 'scheduled' as const,
  startsAt: zonedTime('2026-09-24T19:15'),
  trainerProfileId: null,
  series: undefined,
};

const krachtOn = (occurrenceDate: string, trainerProfileId: string | null = SARAH) => ({
  id: `session-${occurrenceDate}`,
  type: 'group' as const,
  status: 'scheduled' as const,
  startsAt: stored(occurrenceDate).startsAt,
  trainerProfileId,
  series: {
    state: KRACHT,
    occurrenceDate,
    detachedFields: [] as const,
    dates: datesOfKracht(),
  },
});

const boxing = (overrides: Partial<AssignTrainerFacts> = {}): AssignTrainerFacts => ({
  session: BOXING,
  trainerProfileId: TOM,
  scope: 'this',
  today: '2026-09-23',
  ...overrides,
});

describe('F023 AC1: this date, a class that has no trainer', () => {
  it('AC1: Tom teaches Boxing on 24 September; a date on its own has nothing to detach from', () => {
    expect(assignTrainer(boxing())).toEqual({
      outcome: 'applied',
      kind: 'date',
      trainerProfileId: TOM,
      detachedFields: [],
    });
  });

  it('AC1: a date of a series that had *Trainer nodig* is marked as having its own trainer', () => {
    const session = {
      ...krachtOn('2026-10-13', null),
      series: {
        state: KRACHT,
        occurrenceDate: '2026-10-13',
        detachedFields: ['time'] as const,
        dates: datesOfKracht(),
      },
    };

    expect(
      assignTrainer({ session, trainerProfileId: TOM, scope: 'this', today: '2026-10-05' }),
    ).toEqual({
      outcome: 'applied',
      kind: 'date',
      trainerProfileId: TOM,
      detachedFields: ['time', 'trainer'],
    });
  });

  it('AC1: a date that already has a trainer is refused until F024 builds the substitution', () => {
    expect(
      assignTrainer({
        session: krachtOn('2026-10-13'),
        trainerProfileId: TOM,
        scope: 'this',
        today: '2026-10-05',
      }),
    ).toEqual({ outcome: 'refused', reason: 'has-trainer' });
    expect(assignTrainer(boxing({ session: { ...BOXING, trainerProfileId: SARAH } }))).toEqual({
      outcome: 'refused',
      reason: 'has-trainer',
    });
  });
});

describe('F023 AC8: a private session', () => {
  const MARKS = {
    id: 'marks-session',
    type: 'private' as const,
    status: 'scheduled' as const,
    startsAt: zonedTime('2026-09-24T09:00'),
    trainerProfileId: SARAH,
    series: undefined,
  };

  it('AC8: the Owner changes Sarah to Tom, and the scope is ignored', () => {
    for (const scope of ['this', 'following'] as const) {
      expect(
        assignTrainer({ session: MARKS, trainerProfileId: TOM, scope, today: '2026-09-17' }),
      ).toEqual({
        outcome: 'applied',
        kind: 'date',
        trainerProfileId: TOM,
        detachedFields: [],
      });
    }
  });

  it('AC8: a private session whose trainer ended takes one', () => {
    expect(
      assignTrainer({
        session: { ...MARKS, trainerProfileId: null },
        trainerProfileId: TOM,
        scope: 'this',
        today: '2026-09-17',
      }),
    ).toMatchObject({ outcome: 'applied', trainerProfileId: TOM });
  });

  it('AC8: the same trainer again is refused, and so is a cancelled session', () => {
    expect(
      assignTrainer({
        session: MARKS,
        trainerProfileId: SARAH,
        scope: 'this',
        today: '2026-09-17',
      }),
    ).toEqual({ outcome: 'refused', reason: 'same-trainer' });
    expect(
      assignTrainer({
        session: { ...MARKS, status: 'cancelled' },
        trainerProfileId: TOM,
        scope: 'this',
        today: '2026-09-17',
      }),
    ).toEqual({ outcome: 'refused', reason: 'not-scheduled' });
  });
});

describe('F023 AC2: this and following', () => {
  it('AC2: Mike is the regular trainer from 6 October; the series is the first one, so nothing splits', () => {
    const result = assignTrainer({
      session: krachtOn('2026-10-06'),
      trainerProfileId: MIKE,
      scope: 'following',
      today: '2026-10-05',
    });

    if (result.outcome !== 'applied' || result.kind !== 'series')
      throw new Error('expected series');
    expect(result.change.split).toBe(false);
    expect(result.change.later.trainerProfileId).toBe(MIKE);
    expect(result.change.updates.map((u) => [u.occurrenceDate, u.trainerProfileId])).toEqual(
      DATES.map((date) => [date, MIKE]),
    );
  });

  it('AC2: from 13 October the earlier date keeps Sarah, a date with its own trainer keeps its own, the others get Mike', () => {
    const own = datesOfKracht({
      '2026-10-27': { detachedFields: ['trainer'], trainerProfileId: TOM },
    });
    const session = {
      ...krachtOn('2026-10-13'),
      series: {
        state: KRACHT,
        occurrenceDate: '2026-10-13',
        detachedFields: [] as const,
        dates: own,
      },
    };

    const result = assignTrainer({
      session,
      trainerProfileId: MIKE,
      scope: 'following',
      today: '2026-10-05',
    });

    if (result.outcome !== 'applied' || result.kind !== 'series')
      throw new Error('expected series');
    expect(result.change.split).toBe(true);
    expect(result.change.earlierEndsOn).toBe('2026-10-06');
    expect(result.change.later).toMatchObject({ startsOn: '2026-10-13', trainerProfileId: MIKE });
    expect(result.change.updates.map((u) => [u.occurrenceDate, u.trainerProfileId])).toEqual([
      ['2026-10-13', MIKE],
      ['2026-10-20', MIKE],
      ['2026-11-03', MIKE],
      ['2026-11-10', MIKE],
    ]);
    expect(result.change.keptDates).toBe(1);
  });

  it('AC2: a date that is in no series has nothing to hand on', () => {
    expect(assignTrainer(boxing({ scope: 'following' }))).toEqual({
      outcome: 'refused',
      reason: 'not-in-series',
    });
  });

  it('AC2: a date before today is refused, as F022 refuses it', () => {
    expect(
      assignTrainer({
        session: krachtOn('2026-10-06'),
        trainerProfileId: MIKE,
        scope: 'following',
        today: '2026-10-07',
      }),
    ).toEqual({ outcome: 'refused', reason: 'date-in-past' });
  });

  it('AC2: the regular trainer already is the date’s trainer', () => {
    expect(
      assignTrainer({
        session: krachtOn('2026-10-13'),
        trainerProfileId: SARAH,
        scope: 'following',
        today: '2026-10-05',
      }),
    ).toEqual({ outcome: 'refused', reason: 'same-trainer' });
  });

  it('AC2: *Deze en alle volgende lessen* also gives a date without a trainer its first one', () => {
    const result = assignTrainer({
      session: krachtOn('2026-10-13', null),
      trainerProfileId: MIKE,
      scope: 'following',
      today: '2026-10-05',
    });

    expect(result).toMatchObject({ outcome: 'applied', kind: 'series' });
  });
});

describe('F023 AC8 and AC17: whether the clients are emailed', () => {
  const start = zonedTime('2026-09-24T09:00');

  it('AC8: only when asked for and the session has not started', () => {
    const before = new Date(start.getTime() - 60_000);
    expect(sendsTrainerChangeNotice({ notify: true, startsAt: start, now: before })).toBe(true);
    expect(sendsTrainerChangeNotice({ notify: false, startsAt: start, now: before })).toBe(false);
  });

  it('AC8: never for a session that has started, not even at the start itself', () => {
    expect(sendsTrainerChangeNotice({ notify: true, startsAt: start, now: start })).toBe(false);
    expect(
      sendsTrainerChangeNotice({
        notify: true,
        startsAt: start,
        now: new Date(start.getTime() + 60_000),
      }),
    ).toBe(false);
  });
});
