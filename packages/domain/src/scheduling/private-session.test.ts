import { dstTransitions, fixedClock, zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  confirmationLanguage,
  type PlanPrivateSessionFacts,
  PRIVATE_SESSION_DURATIONS,
  planPrivateSession,
  type ReschedulePrivateSessionFacts,
  reschedulePrivateSession,
  sendsChangeNotice,
  sendsConfirmation,
} from './private-session.ts';

const GYM_LOCATION = 'location-gym';
const SARAH = 'team-member-sarah';
const TOM = 'team-member-tom';
const JOHN = 'team-member-john';

// Thursday 24 September 2026, 09:00 in Amsterdam is 07:00 UTC; "now" is the week before.
const NOW = fixedClock('2026-09-17T10:00:00Z').now();

function facts(overrides: Partial<PlanPrivateSessionFacts> = {}): PlanPrivateSessionFacts {
  return {
    actor: { role: 'trainer', teamMemberId: SARAH },
    trainerTeamMemberId: SARAH,
    trainerTrains: true,
    localDate: '2026-09-24',
    localStart: '09:00',
    durationMinutes: 60,
    timeZone: 'Europe/Amsterdam',
    now: NOW,
    locations: [{ id: GYM_LOCATION, isDefault: true }],
    ...overrides,
  };
}

describe('F020 plan a private session', () => {
  it('AC1: Sarah plans Thursday 24 September 2026 at 09:00 for 60 minutes: 07:00 to 08:00 UTC at the default location', () => {
    expect(planPrivateSession(facts())).toEqual({
      outcome: 'planned',
      trainerTeamMemberId: SARAH,
      locationId: GYM_LOCATION,
      startsAt: new Date('2026-09-24T07:00:00.000Z'),
      endsAt: new Date('2026-09-24T08:00:00.000Z'),
      capacity: 1,
      past: false,
      repeatedStart: false,
    });
  });

  it('takes the default location of the workspace among several', () => {
    const planned = planPrivateSession(
      facts({
        locations: [
          { id: 'location-other', isDefault: false },
          { id: GYM_LOCATION, isDefault: true },
        ],
      }),
    );
    expect(planned).toMatchObject({ locationId: GYM_LOCATION });
  });

  describe('AC2: who may plan for whom', () => {
    it('the Owner plans for any trainer of the workspace', () => {
      const owner = { role: 'owner', teamMemberId: JOHN } as const;
      for (const trainer of [JOHN, SARAH, TOM]) {
        expect(
          planPrivateSession(facts({ actor: owner, trainerTeamMemberId: trainer })),
        ).toMatchObject({ outcome: 'planned', trainerTeamMemberId: trainer });
      }
    });

    it('a Trainer plans for themself', () => {
      expect(
        planPrivateSession(
          facts({ actor: { role: 'trainer', teamMemberId: TOM }, trainerTeamMemberId: TOM }),
        ),
      ).toMatchObject({ outcome: 'planned', trainerTeamMemberId: TOM });
    });

    it('a Trainer planning for another trainer is refused, however valid the rest', () => {
      expect(planPrivateSession(facts({ trainerTeamMemberId: TOM }))).toEqual({
        outcome: 'refused',
        reason: 'not-allowed',
      });
    });

    it('answers "not allowed" before it looks at the rest of the input', () => {
      expect(
        planPrivateSession(
          facts({ trainerTeamMemberId: TOM, localStart: 'x', durationMinutes: 7 }),
        ),
      ).toEqual({ outcome: 'refused', reason: 'not-allowed' });
    });

    it('the Owner can not plan for a team member who does not train', () => {
      expect(
        planPrivateSession(
          facts({
            actor: { role: 'owner', teamMemberId: JOHN },
            trainerTeamMemberId: 'team-member-who-does-not-train',
            trainerTrains: false,
          }),
        ),
      ).toEqual({ outcome: 'refused', reason: 'unknown-trainer' });
    });
  });

  describe('AC4: daylight saving time', () => {
    it('refuses 28 March 2027 at 02:30: the time does not exist', () => {
      expect(dstTransitions(2027).springForward.date).toBe('2027-03-28');
      expect(planPrivateSession(facts({ localDate: '2027-03-28', localStart: '02:30' }))).toEqual({
        outcome: 'refused',
        reason: 'time-does-not-exist',
      });
    });

    it('25 October 2026 at 02:30 happens twice: the session starts at the first, 00:30 UTC, and says so', () => {
      const planned = planPrivateSession(facts({ localDate: '2026-10-25', localStart: '02:30' }));
      expect(planned).toMatchObject({
        outcome: 'planned',
        startsAt: zonedTime('2026-10-25T02:30', { disambiguation: 'earlier' }),
        repeatedStart: true,
      });
      expect(planned).toMatchObject({ startsAt: new Date('2026-10-25T00:30:00.000Z') });
    });

    it('23:30 for 90 minutes ends at 01:00 the next day', () => {
      const planned = planPrivateSession(
        facts({ localStart: '23:30', durationMinutes: 90, now: new Date('2026-09-01T00:00:00Z') }),
      );
      expect(planned).toMatchObject({
        startsAt: zonedTime('2026-09-24T23:30'),
        endsAt: zonedTime('2026-09-25T01:00'),
      });
    });

    it('the duration is elapsed time: 02:00 (the first) for 90 minutes on the night the clocks go back ends at 02:30 by the clock', () => {
      // 02:00 CEST is 00:00 UTC; the clocks go back at 01:00 UTC, so 90 elapsed minutes end at 01:30 UTC,
      // which is 02:30 CET. Wall-clock arithmetic (02:00 + 90 minutes = 03:30) would end at 02:30 UTC.
      const planned = planPrivateSession(
        facts({ localDate: '2026-10-25', localStart: '02:00', durationMinutes: 90 }),
      );
      expect(planned).toMatchObject({
        startsAt: new Date('2026-10-25T00:00:00.000Z'),
        endsAt: new Date('2026-10-25T01:30:00.000Z'),
      });
    });

    it('the duration is elapsed time: 00:30 for 90 minutes the night the clocks go back ends at 02:00 CEST, before the change', () => {
      // 00:30 CEST is 22:30 UTC; 90 minutes later is 00:00 UTC, still before the change at 01:00 UTC.
      const planned = planPrivateSession(
        facts({ localDate: '2026-10-25', localStart: '00:30', durationMinutes: 90 }),
      );
      expect(planned).toMatchObject({ endsAt: new Date('2026-10-25T00:00:00.000Z') });
    });
  });

  describe('AC5: the past', () => {
    it('a session yesterday is planned and marked as past', () => {
      const planned = planPrivateSession(facts({ localDate: '2026-09-16' }));
      expect(planned).toMatchObject({ outcome: 'planned', past: true });
    });

    it('a session that starts at this very moment is not past', () => {
      const planned = planPrivateSession(facts({ now: new Date('2026-09-24T07:00:00.000Z') }));
      expect(planned).toMatchObject({ past: false });
    });
  });

  describe('durations', () => {
    it('are 15 to 240 minutes in steps of 5', () => {
      expect(PRIVATE_SESSION_DURATIONS.min).toBe(15);
      expect(PRIVATE_SESSION_DURATIONS.max).toBe(240);
      expect(PRIVATE_SESSION_DURATIONS.step).toBe(5);
    });

    it.each([15, 45, 60, 90, 95, 240])('accepts %i minutes', (durationMinutes) => {
      expect(planPrivateSession(facts({ durationMinutes }))).toMatchObject({ outcome: 'planned' });
    });

    it.each([0, 10, 14, 16, 61, 241, 245, -5, 60.5, Number.NaN])(
      'refuses %s minutes',
      (durationMinutes) => {
        expect(planPrivateSession(facts({ durationMinutes }))).toEqual({
          outcome: 'refused',
          reason: 'invalid-duration',
        });
      },
    );
  });

  it('refuses a date that is none, and a start that is none, and says which', () => {
    expect(planPrivateSession(facts({ localDate: '2026-02-30' }))).toEqual({
      outcome: 'refused',
      reason: 'invalid-date',
    });
    expect(planPrivateSession(facts({ localStart: '25:00' }))).toEqual({
      outcome: 'refused',
      reason: 'invalid-time',
    });
  });

  it('renders the time in the zone of the workspace, not Amsterdam', () => {
    expect(planPrivateSession(facts({ timeZone: 'UTC' }))).toMatchObject({
      startsAt: new Date('2026-09-24T09:00:00.000Z'),
    });
  });

  it('throws when the workspace has no single default location: a broken workspace', () => {
    expect(() => planPrivateSession(facts({ locations: [] }))).toThrow(/default location/);
  });
});

describe('F020 the confirmation email (EM-11)', () => {
  it('AC3: goes out when asked for and the session is not in the past', () => {
    expect(sendsConfirmation({ notify: true, past: false })).toBe(true);
    expect(sendsConfirmation({ notify: false, past: false })).toBe(false);
  });

  it('AC5: never goes out for a session in the past, even when asked for', () => {
    expect(sendsConfirmation({ notify: true, past: true })).toBe(false);
    expect(sendsConfirmation({ notify: false, past: true })).toBe(false);
  });

  it('AC1, AC3: follows the client’s email language, then the workspace default', () => {
    expect(confirmationLanguage({ clientEmailLocale: 'en', workspaceDefault: 'nl-NL' })).toBe('en');
    expect(confirmationLanguage({ clientEmailLocale: 'nl-NL', workspaceDefault: 'en' })).toBe(
      'nl-NL',
    );
    expect(confirmationLanguage({ clientEmailLocale: null, workspaceDefault: 'nl-NL' })).toBe(
      'nl-NL',
    );
    expect(confirmationLanguage({ clientEmailLocale: null, workspaceDefault: 'en' })).toBe('en');
  });

  it('F049 AC4: the linked account’s own preference comes before the client’s email language', () => {
    // Mark Jansen prefers English; John's Gym defaults to Dutch.
    expect(
      confirmationLanguage({
        accountPreference: 'en',
        clientEmailLocale: null,
        workspaceDefault: 'nl-NL',
      }),
    ).toBe('en');
    expect(
      confirmationLanguage({
        accountPreference: 'en',
        clientEmailLocale: 'nl-NL',
        workspaceDefault: 'nl-NL',
      }),
    ).toBe('en');
    // Anna de Vries has no preference and no language for emails: the workspace default.
    expect(
      confirmationLanguage({
        accountPreference: null,
        clientEmailLocale: null,
        workspaceDefault: 'nl-NL',
      }),
    ).toBe('nl-NL');
  });

  it('skips a language that is no catalog language', () => {
    expect(confirmationLanguage({ clientEmailLocale: 'fr', workspaceDefault: 'en' })).toBe('en');
  });
});

// Rescheduling (#443): Sarah's session with Anna is on Thursday 24 September 2026 at 09:00 for 60 minutes.
function rescheduleFacts(
  overrides: Partial<ReschedulePrivateSessionFacts> = {},
): ReschedulePrivateSessionFacts {
  return {
    actor: { role: 'trainer', teamMemberId: SARAH },
    session: {
      trainerTeamMemberId: SARAH,
      status: 'scheduled',
      version: 1,
    },
    expectedVersion: 1,
    // Friday 25 September 2026, 10:00.
    localDate: '2026-09-25',
    localStart: '10:00',
    durationMinutes: 60,
    timeZone: 'Europe/Amsterdam',
    now: NOW,
    ...overrides,
  };
}

describe('F020 reschedule a private session', () => {
  it('AC6: Sarah moves her session to Friday 10:00: 08:00 to 09:00 UTC', () => {
    expect(reschedulePrivateSession(rescheduleFacts())).toEqual({
      outcome: 'rescheduled',
      startsAt: new Date('2026-09-25T08:00:00.000Z'),
      endsAt: new Date('2026-09-25T09:00:00.000Z'),
      past: false,
      repeatedStart: false,
    });
  });

  describe('AC7: who may reschedule', () => {
    it('Sarah (Trainer) reschedules her own session', () => {
      expect(reschedulePrivateSession(rescheduleFacts())).toMatchObject({
        outcome: 'rescheduled',
      });
    });

    it('Tom (Trainer) cannot reschedule Sarah’s session', () => {
      expect(
        reschedulePrivateSession(
          rescheduleFacts({ actor: { role: 'trainer', teamMemberId: TOM } }),
        ),
      ).toEqual({ outcome: 'refused', reason: 'not-allowed' });
    });

    it('John (Owner) reschedules a session of any trainer, and one without a trainer', () => {
      const owner = { role: 'owner', teamMemberId: JOHN } as const;
      expect(reschedulePrivateSession(rescheduleFacts({ actor: owner }))).toMatchObject({
        outcome: 'rescheduled',
      });
      const session = { ...rescheduleFacts().session, trainerTeamMemberId: null };
      expect(reschedulePrivateSession(rescheduleFacts({ actor: owner, session }))).toMatchObject({
        outcome: 'rescheduled',
      });
    });

    it('a Trainer cannot reschedule a session that has no trainer', () => {
      const session = { ...rescheduleFacts().session, trainerTeamMemberId: null };
      expect(reschedulePrivateSession(rescheduleFacts({ session }))).toEqual({
        outcome: 'refused',
        reason: 'not-allowed',
      });
    });

    it('answers "not allowed" before it looks at the rest, the version included', () => {
      expect(
        reschedulePrivateSession(
          rescheduleFacts({
            actor: { role: 'trainer', teamMemberId: TOM },
            expectedVersion: 99,
            localStart: 'x',
          }),
        ),
      ).toEqual({ outcome: 'refused', reason: 'not-allowed' });
    });
  });

  describe('AC8: the version', () => {
    it('a version other than the current one is stale', () => {
      for (const expectedVersion of [0, 2, 7]) {
        expect(reschedulePrivateSession(rescheduleFacts({ expectedVersion }))).toEqual({
          outcome: 'refused',
          reason: 'stale-version',
        });
      }
    });

    it('is checked against the version the session has now', () => {
      const session = { ...rescheduleFacts().session, version: 4 };
      expect(
        reschedulePrivateSession(rescheduleFacts({ session, expectedVersion: 4 })),
      ).toMatchObject({ outcome: 'rescheduled' });
      expect(reschedulePrivateSession(rescheduleFacts({ session, expectedVersion: 1 }))).toEqual({
        outcome: 'refused',
        reason: 'stale-version',
      });
    });
  });

  it('a cancelled session is not rescheduled', () => {
    const session = { ...rescheduleFacts().session, status: 'cancelled' as const };
    expect(reschedulePrivateSession(rescheduleFacts({ session }))).toEqual({
      outcome: 'refused',
      reason: 'not-scheduled',
    });
  });

  describe('the same rules as planning', () => {
    it('AC4: refuses 28 March 2027 at 02:30, takes the first 02:30 on 25 October 2026, ends past midnight', () => {
      expect(
        reschedulePrivateSession(rescheduleFacts({ localDate: '2027-03-28', localStart: '02:30' })),
      ).toEqual({ outcome: 'refused', reason: 'time-does-not-exist' });
      expect(
        reschedulePrivateSession(rescheduleFacts({ localDate: '2026-10-25', localStart: '02:30' })),
      ).toMatchObject({
        startsAt: new Date('2026-10-25T00:30:00.000Z'),
        repeatedStart: true,
      });
      expect(
        reschedulePrivateSession(rescheduleFacts({ localStart: '23:30', durationMinutes: 90 })),
      ).toMatchObject({
        startsAt: zonedTime('2026-09-25T23:30'),
        endsAt: zonedTime('2026-09-26T01:00'),
      });
    });

    it('refuses a duration outside 15 to 240 in steps of 5, a date and a time that are none', () => {
      expect(reschedulePrivateSession(rescheduleFacts({ durationMinutes: 7 }))).toEqual({
        outcome: 'refused',
        reason: 'invalid-duration',
      });
      expect(reschedulePrivateSession(rescheduleFacts({ localDate: '2026-02-30' }))).toEqual({
        outcome: 'refused',
        reason: 'invalid-date',
      });
      expect(reschedulePrivateSession(rescheduleFacts({ localStart: '25:00' }))).toEqual({
        outcome: 'refused',
        reason: 'invalid-time',
      });
    });

    it('AC5 (reschedule): a new time in the past is allowed and marked as past', () => {
      expect(reschedulePrivateSession(rescheduleFacts({ localDate: '2026-09-16' }))).toMatchObject({
        outcome: 'rescheduled',
        past: true,
      });
    });
  });
});

describe('F020 the change email (EM-04)', () => {
  it('AC6: goes out when asked for and the new time is in the future', () => {
    expect(sendsChangeNotice({ notify: true, past: false })).toBe(true);
    expect(sendsChangeNotice({ notify: false, past: false })).toBe(false);
  });

  it('never goes out for a new time in the past, even when asked for', () => {
    expect(sendsChangeNotice({ notify: true, past: true })).toBe(false);
  });
});
