import { zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  type CancellableClassDate,
  type CancellablePrivateSession,
  cancelClassDate,
  cancelPrivateSession,
  type LaterSeriesDate,
  previewClassCancellation,
} from './cancel.ts';

// Synthetic people as in F026's spec: Sarah and Tom (Trainers of John's Gym), John (Owner), Anna and
// Mark (clients). Thursday 24 September 2026, Europe/Amsterdam (summer time): Sarah's private
// session with Anna 09:00-10:00, cancelled on Tuesday 22 September.

const SARAH = 'team-member-sarah';
const TOM = 'team-member-tom';
const JOHN = 'team-member-john';
const ANNA = 'client-anna';
const MARK = 'client-mark';

const sarah = { role: 'trainer', teamMemberId: SARAH } as const;
const tom = { role: 'trainer', teamMemberId: TOM } as const;
const john = { role: 'owner', teamMemberId: JOHN } as const;

const NOW = zonedTime('2026-09-22T11:30');

const session = (
  overrides: Partial<CancellablePrivateSession> = {},
): CancellablePrivateSession => ({
  status: 'scheduled',
  version: 3,
  startsAt: zonedTime('2026-09-24T09:00'),
  trainerTeamMemberId: SARAH,
  participants: [{ clientId: ANNA, status: 'booked' }],
  ...overrides,
});

describe('F026 cancel a private session', () => {
  it('AC1: a client-initiated cancel records the time, the team member and the initiator, and cancels the place', () => {
    const decision = cancelPrivateSession(
      session(),
      sarah,
      { initiator: 'client', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toEqual({
      outcome: 'cancelled',
      cancelledAt: NOW,
      cancelledByTeamMemberId: SARAH,
      initiator: 'client',
      participantChanges: [{ clientId: ANNA, from: 'booked', to: 'cancelled' }],
      notifyClientIds: [],
    });
  });

  it('AC2: a workspace cancel with notify asks for an email to the client; without it, none', () => {
    const asked = cancelPrivateSession(
      session({ trainerTeamMemberId: TOM, participants: [{ clientId: MARK, status: 'booked' }] }),
      john,
      { initiator: 'workspace', notify: true, expectedVersion: 3 },
      NOW,
    );
    expect(asked).toMatchObject({
      outcome: 'cancelled',
      initiator: 'workspace',
      cancelledByTeamMemberId: JOHN,
      notifyClientIds: [MARK],
    });
    const silent = cancelPrivateSession(
      session(),
      john,
      { initiator: 'workspace', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(silent).toMatchObject({ outcome: 'cancelled', notifyClientIds: [] });
  });

  it('AC5: a Trainer cancels their own session, not another Trainer’s; the Owner cancels any', () => {
    const request = { initiator: 'client', notify: false, expectedVersion: 3 } as const;
    expect(cancelPrivateSession(session(), sarah, request, NOW).outcome).toBe('cancelled');
    expect(cancelPrivateSession(session(), tom, request, NOW)).toEqual({
      outcome: 'refused',
      reason: 'not-allowed',
    });
    expect(cancelPrivateSession(session(), john, request, NOW).outcome).toBe('cancelled');
  });

  it('AC5: a session whose trainer ended can be cancelled by the Owner only', () => {
    const request = { initiator: 'workspace', notify: false, expectedVersion: 3 } as const;
    const orphan = session({ trainerTeamMemberId: null });
    expect(cancelPrivateSession(orphan, sarah, request, NOW)).toEqual({
      outcome: 'refused',
      reason: 'not-allowed',
    });
    expect(cancelPrivateSession(orphan, john, request, NOW).outcome).toBe('cancelled');
  });

  it('AC10: a second cancel is refused as not scheduled, before the version is compared', () => {
    const decision = cancelPrivateSession(
      session({ status: 'cancelled', version: 4 }),
      sarah,
      { initiator: 'client', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toEqual({ outcome: 'refused', reason: 'not-scheduled' });
  });

  it('AC10: who may comes before the state, so a stranger learns nothing about a cancelled session', () => {
    const decision = cancelPrivateSession(
      session({ status: 'cancelled' }),
      tom,
      { initiator: 'client', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toEqual({ outcome: 'refused', reason: 'not-allowed' });
  });

  it('AC11: a stale version is refused', () => {
    const decision = cancelPrivateSession(
      session({ version: 4 }),
      sarah,
      { initiator: 'client', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toEqual({ outcome: 'refused', reason: 'stale-version' });
  });

  it('a caller that holds the session itself (the handover) leaves the version out', () => {
    const decision = cancelPrivateSession(
      session({ version: 9 }),
      john,
      { initiator: 'workspace', notify: true },
      NOW,
    );
    expect(decision.outcome).toBe('cancelled');
  });

  it('AC9: a session that has started is recorded and nobody is emailed, whatever notify says', () => {
    const decision = cancelPrivateSession(
      session({ startsAt: zonedTime('2026-09-22T11:00') }),
      john,
      { initiator: 'workspace', notify: true, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toMatchObject({ outcome: 'cancelled', notifyClientIds: [] });
  });

  it('AC9: a session that starts this very instant has started', () => {
    const decision = cancelPrivateSession(
      session({ startsAt: NOW }),
      john,
      { initiator: 'workspace', notify: true, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toMatchObject({ outcome: 'cancelled', notifyClientIds: [] });
  });

  it('a duo: both places are cancelled and each client is emailed once', () => {
    const decision = cancelPrivateSession(
      session({
        participants: [
          { clientId: ANNA, status: 'booked' },
          { clientId: MARK, status: 'booked' },
        ],
      }),
      john,
      { initiator: 'workspace', notify: true, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toMatchObject({
      outcome: 'cancelled',
      participantChanges: [
        { clientId: ANNA, from: 'booked', to: 'cancelled' },
        { clientId: MARK, from: 'booked', to: 'cancelled' },
      ],
      notifyClientIds: [ANNA, MARK],
    });
  });

  it('a place that was cancelled already stays as it is and is not emailed again', () => {
    const decision = cancelPrivateSession(
      session({
        participants: [
          { clientId: ANNA, status: 'cancelled' },
          { clientId: MARK, status: 'booked' },
        ],
      }),
      john,
      { initiator: 'workspace', notify: true, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toMatchObject({
      outcome: 'cancelled',
      participantChanges: [{ clientId: MARK, from: 'booked', to: 'cancelled' }],
      notifyClientIds: [MARK],
    });
  });

  it('a place that was marked attended or no-show is cancelled too, with its own from', () => {
    const decision = cancelPrivateSession(
      session({
        startsAt: zonedTime('2026-09-22T09:00'),
        participants: [{ clientId: ANNA, status: 'no_show' }],
      }),
      john,
      { initiator: 'client', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toMatchObject({
      participantChanges: [{ clientId: ANNA, from: 'no_show', to: 'cancelled' }],
    });
  });
});

// Class dates (ticket #558): John (Owner) cancels one date of "Kracht", weekly on Tuesday at 18:00
// from 6 October to 22 December 2026, or the rest of the series from a date. Anna, Mark and Sophie
// are booked on 20 October. "Now" is Wednesday 14 October 2026, 10:00, so 13 October has passed.

const SOPHIE = 'client-sophie';
const NOW_CLASS = zonedTime('2026-10-14T10:00');
const BOOKED = (clientId: string) => ({ clientId, status: 'booked' as const });

const classDate = (overrides: Partial<CancellableClassDate> = {}): CancellableClassDate => ({
  id: 'date-chosen',
  status: 'scheduled',
  version: 2,
  startsAt: zonedTime('2026-10-20T18:00'),
  series: { occurrenceDate: '2026-10-20', startsOn: '2026-10-06', endsOn: null },
  participants: [BOOKED(ANNA), BOOKED(MARK), BOOKED(SOPHIE)],
  ...overrides,
});

/** A later date of the series on `occurrenceDate` (a Tuesday), at 18:00, with nothing of its own. */
const later = (
  occurrenceDate: string,
  overrides: Partial<LaterSeriesDate> = {},
): LaterSeriesDate => ({
  id: `date-${occurrenceDate}`,
  occurrenceDate,
  status: 'scheduled',
  version: 1,
  startsAt: zonedTime(`${occurrenceDate}T18:00`),
  detachedFields: [],
  participants: [],
  referenced: false,
  ...overrides,
});

const NOVEMBER = [
  later('2026-11-10'),
  later('2026-11-17', { participants: [BOOKED(ANNA), BOOKED(MARK)] }),
  later('2026-11-24', { detachedFields: ['trainer'] }),
  later('2026-12-01'),
];

describe('F026 cancel a class date', () => {
  it('AC6: only this date: the date and every place are cancelled by the workspace, each participant is emailed with the message as typed', () => {
    const decision = cancelClassDate(
      classDate(),
      NOVEMBER,
      john,
      { scope: 'this', message: 'Sarah is ziek, sorry!', expectedVersion: 2 },
      NOW_CLASS,
    );
    expect(decision).toEqual({
      outcome: 'cancelled',
      cancelledAt: NOW_CLASS,
      cancelledByTeamMemberId: JOHN,
      initiator: 'workspace',
      dates: [
        {
          sessionId: 'date-chosen',
          expectedVersion: 2,
          occurrenceDate: '2026-10-20',
          participantChanges: [
            { clientId: ANNA, from: 'booked', to: 'cancelled' },
            { clientId: MARK, from: 'booked', to: 'cancelled' },
            { clientId: SOPHIE, from: 'booked', to: 'cancelled' },
          ],
          notifyClientIds: [ANNA, MARK, SOPHIE],
          message: 'Sarah is ziek, sorry!',
        },
      ],
      removedSessionIds: [],
      seriesEndsOn: null,
    });
  });

  it('the message is kept exactly as typed, a blank one is none', () => {
    const typed = '  <b>Hallo</b> & welkom\nTot snel  ';
    const withMessage = cancelClassDate(
      classDate(),
      [],
      john,
      { scope: 'this', message: typed },
      NOW_CLASS,
    );
    expect(withMessage).toMatchObject({ dates: [{ message: typed }] });
    for (const blank of ['', '   ', undefined]) {
      const decision = cancelClassDate(
        classDate(),
        [],
        john,
        { scope: 'this', ...(blank === undefined ? {} : { message: blank }) },
        NOW_CLASS,
      );
      expect(decision).toMatchObject({ dates: [{ message: null }] });
    }
  });

  it('AC5: a Trainer may not cancel a class date; the Owner may', () => {
    const request = { scope: 'this', expectedVersion: 2 } as const;
    expect(cancelClassDate(classDate(), [], sarah, request, NOW_CLASS)).toEqual({
      outcome: 'refused',
      reason: 'not-allowed',
    });
    expect(cancelClassDate(classDate(), [], john, request, NOW_CLASS).outcome).toBe('cancelled');
  });

  it('AC7: this and following from 3 November: this date and the later ones with participants or their own changes are cancelled, the others removed, the series ends on 2 November', () => {
    const decision = cancelClassDate(
      classDate({
        startsAt: zonedTime('2026-11-03T18:00'),
        series: { occurrenceDate: '2026-11-03', startsOn: '2026-10-06', endsOn: null },
        participants: [BOOKED(SOPHIE)],
      }),
      NOVEMBER,
      john,
      { scope: 'following', message: 'Het seizoen is voorbij', expectedVersion: 2 },
      NOW_CLASS,
    );
    expect(decision).toMatchObject({
      outcome: 'cancelled',
      seriesEndsOn: '2026-11-02',
      removedSessionIds: ['date-2026-11-10', 'date-2026-12-01'],
    });
    if (decision.outcome !== 'cancelled') throw new Error('expected a cancellation');
    expect(
      decision.dates.map(({ sessionId, occurrenceDate, notifyClientIds, message }) => ({
        sessionId,
        occurrenceDate,
        notifyClientIds,
        message,
      })),
    ).toEqual([
      {
        sessionId: 'date-chosen',
        occurrenceDate: '2026-11-03',
        notifyClientIds: [SOPHIE],
        message: 'Het seizoen is voorbij',
      },
      {
        sessionId: 'date-2026-11-17',
        occurrenceDate: '2026-11-17',
        notifyClientIds: [ANNA, MARK],
        message: 'Het seizoen is voorbij',
      },
      {
        // Its own changes keep it; nobody is booked, so nobody is emailed and no message is kept.
        sessionId: 'date-2026-11-24',
        occurrenceDate: '2026-11-24',
        notifyClientIds: [],
        message: null,
      },
    ]);
  });

  it('AC7: a later date that something else points at (a booking link) is cancelled, not removed', () => {
    const decision = cancelClassDate(
      classDate({ series: { occurrenceDate: '2026-10-20', startsOn: '2026-10-06', endsOn: null } }),
      [later('2026-10-27', { referenced: true }), later('2026-11-03')],
      john,
      { scope: 'following' },
      NOW_CLASS,
    );
    expect(decision).toMatchObject({
      removedSessionIds: ['date-2026-11-03'],
      dates: [{ occurrenceDate: '2026-10-20' }, { sessionId: 'date-2026-10-27' }],
    });
  });

  it('AC7: a later date that was cancelled already is left alone, a date whose places all cancelled still has participants and is cancelled', () => {
    const decision = cancelClassDate(
      classDate(),
      [
        later('2026-10-27', { status: 'cancelled', version: 3 }),
        later('2026-11-03', { participants: [{ clientId: ANNA, status: 'cancelled' }] }),
      ],
      john,
      { scope: 'following' },
      NOW_CLASS,
    );
    expect(decision).toMatchObject({ outcome: 'cancelled', removedSessionIds: [] });
    if (decision.outcome !== 'cancelled') throw new Error('expected a cancellation');
    expect(decision.dates.map((date) => date.occurrenceDate)).toEqual(['2026-10-20', '2026-11-03']);
    // Her place was cancelled already: nothing changes there, nobody is emailed again.
    expect(decision.dates[1]).toMatchObject({ participantChanges: [], notifyClientIds: [] });
  });

  it('AC7: the first date of a series: the end is its own day (the series has no day before it), the date stays', () => {
    const decision = cancelClassDate(
      classDate({
        startsAt: zonedTime('2026-10-06T18:00'),
        series: { occurrenceDate: '2026-10-06', startsOn: '2026-10-06', endsOn: null },
        participants: [],
      }),
      [later('2026-10-13'), later('2026-10-20')],
      john,
      { scope: 'following' },
      zonedTime('2026-10-01T10:00'),
    );
    expect(decision).toMatchObject({
      seriesEndsOn: '2026-10-06',
      removedSessionIds: ['date-2026-10-13', 'date-2026-10-20'],
    });
  });

  it('AC7: a series that ends earlier already keeps its end', () => {
    const decision = cancelClassDate(
      classDate({
        series: { occurrenceDate: '2026-10-20', startsOn: '2026-10-06', endsOn: '2026-10-14' },
      }),
      [],
      john,
      { scope: 'following' },
      NOW_CLASS,
    );
    expect(decision).toMatchObject({ seriesEndsOn: '2026-10-14' });
  });

  it('AC7: following needs a series', () => {
    const decision = cancelClassDate(
      classDate({ series: null }),
      [],
      john,
      { scope: 'following' },
      NOW_CLASS,
    );
    expect(decision).toEqual({ outcome: 'refused', reason: 'not-in-series' });
  });

  it('AC8: a date without participants cancels without an email', () => {
    const decision = cancelClassDate(
      classDate({ participants: [] }),
      [],
      john,
      { scope: 'this', message: 'Wegens ziekte' },
      NOW_CLASS,
    );
    expect(decision).toMatchObject({
      outcome: 'cancelled',
      dates: [{ participantChanges: [], notifyClientIds: [], message: null }],
    });
  });

  it('AC9: a date that has passed (or started) is recorded for the record: places cancel, nobody is emailed and no message is kept', () => {
    for (const startsAt of [zonedTime('2026-10-13T18:00'), NOW_CLASS]) {
      const decision = cancelClassDate(
        classDate({
          startsAt,
          series: { occurrenceDate: '2026-10-13', startsOn: '2026-10-06', endsOn: null },
        }),
        [],
        john,
        { scope: 'this', message: 'Te laat' },
        NOW_CLASS,
      );
      expect(decision).toMatchObject({
        outcome: 'cancelled',
        dates: [
          {
            participantChanges: [
              { clientId: ANNA, from: 'booked', to: 'cancelled' },
              { clientId: MARK, from: 'booked', to: 'cancelled' },
              { clientId: SOPHIE, from: 'booked', to: 'cancelled' },
            ],
            notifyClientIds: [],
            message: null,
          },
        ],
      });
    }
  });

  it('AC9: following from a date that has passed emails the later dates that have not started', () => {
    const decision = cancelClassDate(
      classDate({
        startsAt: zonedTime('2026-10-13T18:00'),
        series: { occurrenceDate: '2026-10-13', startsOn: '2026-10-06', endsOn: null },
      }),
      [later('2026-10-20', { participants: [BOOKED(ANNA)] })],
      john,
      { scope: 'following', message: 'Einde seizoen' },
      NOW_CLASS,
    );
    if (decision.outcome !== 'cancelled') throw new Error('expected a cancellation');
    expect(decision.dates.map((date) => date.notifyClientIds)).toEqual([[], [ANNA]]);
    expect(decision.dates.map((date) => date.message)).toEqual([null, 'Einde seizoen']);
  });

  it('AC10: a second cancel is refused as not scheduled before the version, who may comes first', () => {
    const cancelled = classDate({ status: 'cancelled', version: 3 });
    expect(
      cancelClassDate(cancelled, [], john, { scope: 'this', expectedVersion: 2 }, NOW_CLASS),
    ).toEqual({ outcome: 'refused', reason: 'not-scheduled' });
    expect(
      cancelClassDate(cancelled, [], sarah, { scope: 'this', expectedVersion: 2 }, NOW_CLASS),
    ).toEqual({ outcome: 'refused', reason: 'not-allowed' });
  });

  it('AC11: a stale version is refused; a caller that holds the date itself leaves it out', () => {
    expect(
      cancelClassDate(
        classDate({ version: 5 }),
        [],
        john,
        { scope: 'this', expectedVersion: 2 },
        NOW_CLASS,
      ),
    ).toEqual({ outcome: 'refused', reason: 'stale-version' });
    expect(
      cancelClassDate(classDate({ version: 5 }), [], john, { scope: 'this' }, NOW_CLASS).outcome,
    ).toBe('cancelled');
  });

  it('a place that attended or was marked no-show is cancelled with its own from', () => {
    const decision = cancelClassDate(
      classDate({
        startsAt: zonedTime('2026-10-14T09:00'),
        participants: [
          { clientId: ANNA, status: 'attended' },
          { clientId: MARK, status: 'no_show' },
          { clientId: SOPHIE, status: 'cancelled' },
        ],
      }),
      [],
      john,
      { scope: 'this' },
      NOW_CLASS,
    );
    expect(decision).toMatchObject({
      dates: [
        {
          participantChanges: [
            { clientId: ANNA, from: 'attended', to: 'cancelled' },
            { clientId: MARK, from: 'no_show', to: 'cancelled' },
          ],
        },
      ],
    });
  });

  it('DST: the series end is a calendar day, whatever the clocks do', () => {
    // The clocks went back on 25 October 2026.
    const decision = cancelClassDate(
      classDate({
        startsAt: zonedTime('2026-10-27T18:00'),
        series: { occurrenceDate: '2026-10-27', startsOn: '2026-10-06', endsOn: null },
      }),
      [],
      john,
      { scope: 'following' },
      NOW_CLASS,
    );
    expect(decision).toMatchObject({ seriesEndsOn: '2026-10-26' });
  });
});

describe('F026 preview of a class cancellation (CO-03)', () => {
  it('AC6: this date: three participants get an email', () => {
    expect(previewClassCancellation(classDate(), NOVEMBER, NOW_CLASS)).toMatchObject({
      started: false,
      inSeries: true,
      thisDate: {
        datesCancelled: 1,
        datesRemoved: 0,
        datesWithEmails: 1,
        participants: 3,
        emails: 3,
      },
    });
  });

  it('AC7: following from 3 November counts the dates cancelled and removed and the people emailed', () => {
    const preview = previewClassCancellation(
      classDate({
        startsAt: zonedTime('2026-11-03T18:00'),
        series: { occurrenceDate: '2026-11-03', startsOn: '2026-10-06', endsOn: null },
        participants: [BOOKED(SOPHIE)],
      }),
      NOVEMBER,
      NOW_CLASS,
    );
    expect(preview.following).toEqual({
      datesCancelled: 3,
      datesRemoved: 2,
      // 3 November (Sophie) and 17 November (Anna and Mark).
      datesWithEmails: 2,
      participants: 3,
      emails: 3,
    });
  });

  it('counts a client booked on two dates once as a participant and twice as emails', () => {
    const preview = previewClassCancellation(
      classDate(),
      [later('2026-10-27', { participants: [BOOKED(ANNA)] })],
      NOW_CLASS,
    );
    expect(preview.following).toMatchObject({ participants: 3, emails: 4, datesWithEmails: 2 });
  });

  it('AC8: no participants: nobody gets an email', () => {
    const preview = previewClassCancellation(classDate({ participants: [] }), [], NOW_CLASS);
    expect(preview.thisDate).toMatchObject({ participants: 0, emails: 0, datesWithEmails: 0 });
  });

  it('AC9: a date that has started: recorded for the record, no emails; no series: no following', () => {
    const preview = previewClassCancellation(
      classDate({ startsAt: zonedTime('2026-10-13T18:00'), series: null }),
      [],
      NOW_CLASS,
    );
    expect(preview).toMatchObject({
      started: true,
      inSeries: false,
      thisDate: { participants: 0, emails: 0 },
      following: null,
    });
  });
});
