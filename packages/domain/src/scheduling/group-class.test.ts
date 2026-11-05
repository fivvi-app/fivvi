import { AMSTERDAM, dstTransitions, fixedClock, zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  decideGroupDateEdit,
  GROUP_CLASS_LIMITS,
  type GroupDateEditFacts,
  type ScheduleClassOnDateFacts,
  scheduleClassOnDate,
} from './group-class.ts';

const GYM_LOCATION = 'location-gym';
const SARAH = { teamMemberId: 'team-member-sarah', trainerProfileId: 'trainer-profile-sarah' };
const TOM = { teamMemberId: 'team-member-tom', trainerProfileId: 'trainer-profile-tom' };

// "Kracht": Sarah, 8 places, 60 minutes. Tuesday 6 October 2026, 18:00 in Amsterdam is 16:00 UTC.
const NOW = fixedClock('2026-09-28T10:00:00Z').now();

function schedule(overrides: Partial<ScheduleClassOnDateFacts> = {}): ScheduleClassOnDateFacts {
  return {
    groupClass: { capacity: 8, durationMinutes: 60, defaultTrainer: SARAH },
    localDate: '2026-10-06',
    localStart: '18:00',
    timeZone: AMSTERDAM,
    now: NOW,
    locations: [{ id: GYM_LOCATION, isDefault: true }],
    ...overrides,
  };
}

describe('F021 AC9: schedule a class on a date', () => {
  it('AC3: Kracht on Tuesday 6 October 2026 at 18:00 is 16:00 to 17:00 UTC with Sarah, 8 places, at the default location', () => {
    expect(scheduleClassOnDate(schedule())).toEqual({
      outcome: 'scheduled',
      trainer: SARAH,
      locationId: GYM_LOCATION,
      startsAt: new Date('2026-10-06T16:00:00.000Z'),
      endsAt: new Date('2026-10-06T17:00:00.000Z'),
      capacity: 8,
      past: false,
      repeatedStart: false,
    });
  });

  it('takes the default location among several', () => {
    expect(
      scheduleClassOnDate(
        schedule({
          locations: [
            { id: 'location-other', isDefault: false },
            { id: GYM_LOCATION, isDefault: true },
          ],
        }),
      ),
    ).toMatchObject({ locationId: GYM_LOCATION });
  });

  it('AC5: a class without a trainer gives a date without a trainer', () => {
    expect(
      scheduleClassOnDate(
        schedule({
          groupClass: { capacity: 8, durationMinutes: 60, defaultTrainer: null },
        }),
      ),
    ).toMatchObject({ outcome: 'scheduled', trainer: null });
  });

  it('copies the class’s defaults, and the date’s own trainer and capacity win when given', () => {
    expect(
      scheduleClassOnDate(
        schedule({ requestedTrainer: { ...TOM, trains: true }, requestedCapacity: 12 }),
      ),
    ).toMatchObject({ outcome: 'scheduled', trainer: TOM, capacity: 12 });
  });

  it('a requested trainer of null plans the date as Trainer nodig, whatever the class’s usual trainer', () => {
    expect(scheduleClassOnDate(schedule({ requestedTrainer: null }))).toMatchObject({
      outcome: 'scheduled',
      trainer: null,
    });
  });

  it('refuses a requested trainer who does not train in the workspace', () => {
    expect(scheduleClassOnDate(schedule({ requestedTrainer: { ...TOM, trains: false } }))).toEqual({
      outcome: 'refused',
      reason: 'unknown-trainer',
    });
  });

  it('refuses a capacity outside 1 to 100, and a fraction', () => {
    for (const requestedCapacity of [0, 101, -1, 2.5]) {
      expect(scheduleClassOnDate(schedule({ requestedCapacity }))).toEqual({
        outcome: 'refused',
        reason: 'invalid-capacity',
      });
    }
    for (const requestedCapacity of [1, 100]) {
      expect(scheduleClassOnDate(schedule({ requestedCapacity }))).toMatchObject({
        outcome: 'scheduled',
        capacity: requestedCapacity,
      });
    }
  });

  it('the end follows from the class’s duration', () => {
    expect(
      scheduleClassOnDate(
        schedule({
          groupClass: { capacity: 8, durationMinutes: 75, defaultTrainer: SARAH },
        }),
      ),
    ).toMatchObject({ endsAt: new Date('2026-10-06T17:15:00.000Z') });
  });

  it('refuses a date and a start that are none', () => {
    expect(scheduleClassOnDate(schedule({ localDate: '2026-02-30' }))).toEqual({
      outcome: 'refused',
      reason: 'invalid-date',
    });
    expect(scheduleClassOnDate(schedule({ localStart: '25:00' }))).toEqual({
      outcome: 'refused',
      reason: 'invalid-time',
    });
  });

  describe('AC9: the daylight saving rules of F020 apply unchanged', () => {
    it('refuses 28 March 2027 at 02:30: the time does not exist', () => {
      expect(dstTransitions(2027).springForward.date).toBe('2027-03-28');
      expect(
        scheduleClassOnDate(schedule({ localDate: '2027-03-28', localStart: '02:30' })),
      ).toEqual({ outcome: 'refused', reason: 'time-does-not-exist' });
    });

    it('25 October 2026 at 02:30 happens twice: the first (summer time) is taken and reported', () => {
      expect(
        scheduleClassOnDate(schedule({ localDate: '2026-10-25', localStart: '02:30' })),
      ).toMatchObject({
        startsAt: zonedTime('2026-10-25T02:30', { disambiguation: 'earlier' }),
        repeatedStart: true,
      });
    });

    it('the duration is elapsed time across the night the clocks go back', () => {
      // 02:00 CEST is 00:00 UTC; 90 elapsed minutes end at 01:30 UTC, which is 02:30 CET.
      expect(
        scheduleClassOnDate(
          schedule({
            localDate: '2026-10-25',
            localStart: '02:00',
            groupClass: { capacity: 8, durationMinutes: 90, defaultTrainer: SARAH },
          }),
        ),
      ).toMatchObject({
        startsAt: new Date('2026-10-25T00:00:00.000Z'),
        endsAt: new Date('2026-10-25T01:30:00.000Z'),
      });
    });

    it('a date in the past is allowed and reported', () => {
      expect(scheduleClassOnDate(schedule({ localDate: '2026-09-01' }))).toMatchObject({
        outcome: 'scheduled',
        past: true,
      });
    });
  });
});

// The date as stored: Tuesday 6 October 2026, 16:00 to 17:00 UTC, 8 places.
function edit(overrides: Partial<GroupDateEditFacts> = {}): GroupDateEditFacts {
  return {
    current: {
      startsAt: new Date('2026-10-06T16:00:00.000Z'),
      endsAt: new Date('2026-10-06T17:00:00.000Z'),
      capacity: 8,
    },
    requested: {},
    timeZone: AMSTERDAM,
    ...overrides,
  };
}

describe('F021 AC4: edit one date', () => {
  it('a new start and capacity: 18:30 keeps the end at 19:00 and capacity 10 replaces 8', () => {
    expect(decideGroupDateEdit(edit({ requested: { localStart: '18:30', capacity: 10 } }))).toEqual(
      {
        outcome: 'edited',
        startsAt: new Date('2026-10-06T16:30:00.000Z'),
        endsAt: new Date('2026-10-06T17:00:00.000Z'),
        capacity: 10,
      },
    );
  });

  it('a new end alone keeps the start and the capacity', () => {
    expect(decideGroupDateEdit(edit({ requested: { localEnd: '19:30' } }))).toEqual({
      outcome: 'edited',
      startsAt: new Date('2026-10-06T16:00:00.000Z'),
      endsAt: new Date('2026-10-06T17:30:00.000Z'),
      capacity: 8,
    });
  });

  it('refuses an end before the start, or equal to it', () => {
    expect(decideGroupDateEdit(edit({ requested: { localEnd: '17:30' } }))).toEqual({
      outcome: 'refused',
      reason: 'end-before-start',
    });
    expect(decideGroupDateEdit(edit({ requested: { localEnd: '18:00' } }))).toEqual({
      outcome: 'refused',
      reason: 'end-before-start',
    });
    // A start after the unchanged end is an end before the start too.
    expect(decideGroupDateEdit(edit({ requested: { localStart: '19:30' } }))).toEqual({
      outcome: 'refused',
      reason: 'end-before-start',
    });
  });

  it('refuses a capacity outside 1 to 100', () => {
    for (const capacity of [0, 101]) {
      expect(decideGroupDateEdit(edit({ requested: { capacity } }))).toEqual({
        outcome: 'refused',
        reason: 'invalid-capacity',
      });
    }
  });

  it('refuses a start and an end that are none, naming which', () => {
    expect(decideGroupDateEdit(edit({ requested: { localStart: '9am' } }))).toEqual({
      outcome: 'refused',
      reason: 'invalid-time',
    });
    expect(decideGroupDateEdit(edit({ requested: { localEnd: '24:00' } }))).toEqual({
      outcome: 'refused',
      reason: 'invalid-end-time',
    });
  });

  it('refuses a start or an end the clocks skip, naming which', () => {
    const springForward = {
      current: {
        startsAt: new Date('2027-03-28T00:00:00.000Z'),
        endsAt: new Date('2027-03-28T05:00:00.000Z'),
        capacity: 8,
      },
    };
    expect(
      decideGroupDateEdit(edit({ ...springForward, requested: { localStart: '02:30' } })),
    ).toEqual({ outcome: 'refused', reason: 'time-does-not-exist' });
    expect(
      decideGroupDateEdit(edit({ ...springForward, requested: { localEnd: '02:30' } })),
    ).toEqual({ outcome: 'refused', reason: 'end-time-does-not-exist' });
  });

  it('takes the first instant of a repeated start, as scheduling does', () => {
    const goingBack = {
      current: {
        startsAt: new Date('2026-10-25T08:00:00.000Z'),
        endsAt: new Date('2026-10-25T09:00:00.000Z'),
        capacity: 8,
      },
    };
    expect(
      decideGroupDateEdit(
        edit({ ...goingBack, requested: { localStart: '02:30', localEnd: '04:00' } }),
      ),
    ).toMatchObject({ outcome: 'edited', startsAt: new Date('2026-10-25T00:30:00.000Z') });
  });

  it('reads the date and times of day in the workspace’s zone, not UTC', () => {
    // 23:30 local on 6 October is 21:30 UTC; moving only the capacity must not move the date.
    expect(
      decideGroupDateEdit(
        edit({
          current: {
            startsAt: new Date('2026-10-06T21:30:00.000Z'),
            endsAt: new Date('2026-10-06T21:50:00.000Z'),
            capacity: 8,
          },
          requested: { localStart: '23:35', localEnd: '23:55' },
        }),
      ),
    ).toMatchObject({
      startsAt: new Date('2026-10-06T21:35:00.000Z'),
      endsAt: new Date('2026-10-06T21:55:00.000Z'),
    });
  });

  it('a capacity alone leaves the instants as stored, also for a date that ends after midnight', () => {
    const current = {
      startsAt: new Date('2026-09-24T21:30:00.000Z'),
      endsAt: new Date('2026-09-24T23:00:00.000Z'),
      capacity: 8,
    };
    expect(decideGroupDateEdit(edit({ current, requested: { capacity: 9 } }))).toEqual({
      outcome: 'edited',
      startsAt: current.startsAt,
      endsAt: current.endsAt,
      capacity: 9,
    });
  });

  it('a request that changes nothing is refused', () => {
    expect(decideGroupDateEdit(edit())).toEqual({
      outcome: 'refused',
      reason: 'nothing-to-change',
    });
  });
});

describe('F021 the limits of a class', () => {
  it('are the ones of the spec', () => {
    expect(GROUP_CLASS_LIMITS).toEqual({
      nameMaxLength: 80,
      descriptionMaxLength: 500,
      capacity: { min: 1, max: 100 },
      duration: { min: 15, max: 240, step: 5 },
    });
  });
});
