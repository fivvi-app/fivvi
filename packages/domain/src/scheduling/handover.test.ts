import { AMSTERDAM } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  countFutureSessions,
  type HandoverSession,
  handoverWindowEnd,
  hasFutureSessions,
  planHandover,
} from './handover.ts';
import { wallClockToInstant } from './zoned-time.ts';

// F023 (spec #459, ticket #537), AC9, AC9a, AC11 and AC18: what happens to a removed trainer's
// future sessions. Synthetic people: Sarah (leaving), Tom (takes over). "Now" is Monday
// 28 September 2026 10:00 in Amsterdam; the next 2 weeks end on Monday 12 October 10:00.

const TOM = 'trainer-profile-tom';
const at = (date: string, time: string) => {
  const found = wallClockToInstant(date, time, AMSTERDAM);
  if (found.outcome !== 'instant') throw new Error('fixture');
  return found.instant;
};
const NOW = at('2026-09-28', '10:00');

let counter = 0;
const session = (
  type: HandoverSession['type'],
  date: string,
  options: Partial<HandoverSession> = {},
): HandoverSession => {
  counter += 1;
  return {
    id: `session-${counter}`,
    type,
    startsAt: at(date, '18:00'),
    version: 1,
    inSeries: false,
    detachedFields: [],
    ...options,
  };
};

/** Sarah's future: 3 private and 4 Kracht dates in the next 2 weeks, 2 private and 6 Kracht dates later. */
function sarahsFuture(): HandoverSession[] {
  const kracht = (date: string) => session('group', date, { inSeries: true });
  return [
    session('private', '2026-09-29'),
    session('private', '2026-10-01'),
    session('private', '2026-10-08'),
    kracht('2026-09-29'),
    kracht('2026-10-06'),
    kracht('2026-10-07'),
    kracht('2026-10-09'),
    session('private', '2026-10-14'),
    session('private', '2026-11-03'),
    ...['2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17'].map(
      kracht,
    ),
  ];
}

describe('F023 handoverWindowEnd', () => {
  it('is 14 days on the workspace’s wall clock from now', () => {
    expect(handoverWindowEnd(NOW, AMSTERDAM)).toEqual(at('2026-10-12', '10:00'));
  });

  it('keeps the wall-clock time across the clocks going back (25 October 2026)', () => {
    // 20 October 10:00 + 14 days = 3 November 10:00, an hour later in UTC than 14 × 24 hours.
    const start = at('2026-10-20', '10:00');
    expect(handoverWindowEnd(start, AMSTERDAM)).toEqual(at('2026-11-03', '10:00'));
    expect(handoverWindowEnd(start, AMSTERDAM).getTime() - start.getTime()).toBe(
      14 * 86_400_000 + 3_600_000,
    );
  });

  it('falls on a time the clocks skip: the next 14 × 24 hours', () => {
    // 14 March 2027 02:30 does not exist in Amsterdam: 28 March 02:30 is skipped.
    const start = at('2027-03-14', '02:30');
    expect(handoverWindowEnd(start, AMSTERDAM).getTime()).toBe(start.getTime() + 14 * 86_400_000);
  });
});

describe('F023 countFutureSessions', () => {
  it('AC11: counts the private sessions and class dates of the next 2 weeks and of later', () => {
    const counts = countFutureSessions({
      sessions: sarahsFuture(),
      regularTrainerOfSeries: true,
      now: NOW,
      timeZone: AMSTERDAM,
    });

    expect(counts).toEqual({
      nextTwoWeeks: { privateSessions: 3, classDates: 4 },
      later: { privateSessions: 2, classDates: 6 },
      regularTrainerOfSeries: true,
    });
  });

  it('does not count a session that has started, and one exactly at the end of the window is later', () => {
    const counts = countFutureSessions({
      sessions: [
        session('private', '2026-09-28', { startsAt: new Date(NOW.getTime() - 1) }),
        session('private', '2026-09-28', { startsAt: NOW }),
        session('private', '2026-10-12', { startsAt: handoverWindowEnd(NOW, AMSTERDAM) }),
        session('private', '2026-10-12', {
          startsAt: new Date(handoverWindowEnd(NOW, AMSTERDAM).getTime() - 1),
        }),
      ],
      regularTrainerOfSeries: false,
      now: NOW,
      timeZone: AMSTERDAM,
    });

    expect(counts.nextTwoWeeks).toEqual({ privateSessions: 1, classDates: 0 });
    expect(counts.later).toEqual({ privateSessions: 1, classDates: 0 });
  });
});

describe('F023 hasFutureSessions', () => {
  const none = {
    nextTwoWeeks: { privateSessions: 0, classDates: 0 },
    later: { privateSessions: 0, classDates: 0 },
  };

  it('is false for nothing to hand over', () => {
    expect(hasFutureSessions({ ...none, regularTrainerOfSeries: false })).toBe(false);
  });

  it('is true for a session in either window, or a series with no date left to count', () => {
    expect(
      hasFutureSessions({
        ...none,
        nextTwoWeeks: { privateSessions: 1, classDates: 0 },
        regularTrainerOfSeries: false,
      }),
    ).toBe(true);
    expect(
      hasFutureSessions({
        ...none,
        later: { privateSessions: 0, classDates: 1 },
        regularTrainerOfSeries: false,
      }),
    ).toBe(true);
    expect(hasFutureSessions({ ...none, regularTrainerOfSeries: true })).toBe(true);
  });
});

describe('F023 planHandover', () => {
  const plan = (privateTo: string | null, classesTo: string | null) =>
    planHandover({
      sessions: sarahsFuture(),
      now: NOW,
      timeZone: AMSTERDAM,
      privateTo,
      classesTo,
    });

  it('AC9: private sessions go to Tom, the next 2 weeks’ dates get Trainer nodig, later ones Trainer nodig, none cancelled', () => {
    const decided = plan(TOM, null);

    expect(decided.summary).toEqual({
      nextTwoWeeks: {
        privateHandedOver: 3,
        privateCancelled: 0,
        classesHandedOver: 0,
        classesTrainerNeeded: 4,
      },
      later: { privateTrainerNeeded: 2, classesTrainerNeeded: 6 },
    });
    expect(decided.changes.filter((change) => change.action.kind === 'cancel')).toEqual([]);
    expect(
      decided.changes
        .filter((change) => change.type === 'private' && change.action.kind === 'hand-over')
        .map((change) => change.action),
    ).toEqual(Array(3).fill({ kind: 'hand-over', trainerProfileId: TOM, detachedFields: [] }));
  });

  it('AC9a: with nobody for the private sessions the next 2 weeks’ are cancelled and the later ones need a trainer', () => {
    const decided = plan(null, null);

    expect(decided.summary.nextTwoWeeks).toMatchObject({
      privateHandedOver: 0,
      privateCancelled: 3,
    });
    expect(decided.summary.later.privateTrainerNeeded).toBe(2);
    expect(
      decided.changes.filter((change) => change.action.kind === 'cancel').map((c) => c.type),
    ).toEqual(['private', 'private', 'private']);
    // The later private sessions are never cancelled.
    const laterPrivate = decided.changes.filter(
      (change) => change.type === 'private' && change.action.kind === 'trainer-needed',
    );
    expect(laterPrivate).toHaveLength(2);
  });

  it('hands the next 2 weeks’ class dates to a trainer, marking a date of a series as having its own trainer', () => {
    const decided = plan(TOM, TOM);

    expect(decided.summary.nextTwoWeeks).toMatchObject({
      classesHandedOver: 4,
      classesTrainerNeeded: 0,
    });
    const handed = decided.changes.filter(
      (change) => change.type === 'group' && change.action.kind === 'hand-over',
    );
    expect(handed).toHaveLength(4);
    for (const change of handed) {
      expect(change.action).toEqual({
        kind: 'hand-over',
        trainerProfileId: TOM,
        detachedFields: ['trainer'],
      });
    }
    // The later dates still get Trainer nodig, whatever the body says.
    expect(decided.summary.later.classesTrainerNeeded).toBe(6);
  });

  it('keeps what a date already has of its own when it goes to a trainer', () => {
    const own = session('group', '2026-10-06', { inSeries: true, detachedFields: ['time'] });
    const decided = planHandover({
      sessions: [own],
      now: NOW,
      timeZone: AMSTERDAM,
      privateTo: TOM,
      classesTo: TOM,
    });

    expect(decided.changes[0]?.action).toEqual({
      kind: 'hand-over',
      trainerProfileId: TOM,
      detachedFields: ['time', 'trainer'],
    });
  });

  it('a class date on its own has no field to mark', () => {
    const alone = session('group', '2026-10-06');
    const decided = planHandover({
      sessions: [alone],
      now: NOW,
      timeZone: AMSTERDAM,
      privateTo: TOM,
      classesTo: TOM,
    });

    expect(decided.changes[0]?.action).toEqual({
      kind: 'hand-over',
      trainerProfileId: TOM,
      detachedFields: [],
    });
  });

  it('lists the changes soonest first and carries the version each session was read at', () => {
    const late = session('private', '2026-10-30', { version: 4 });
    const early = session('private', '2026-09-30', { version: 2 });
    const decided = planHandover({
      sessions: [late, early],
      now: NOW,
      timeZone: AMSTERDAM,
      privateTo: TOM,
      classesTo: null,
    });

    expect(decided.changes.map(({ sessionId, version }) => [sessionId, version])).toEqual([
      [early.id, 2],
      [late.id, 4],
    ]);
  });

  it('plans nothing for a session that has started', () => {
    const started = session('private', '2026-09-28', {
      startsAt: new Date(NOW.getTime() - 60_000),
    });
    const decided = planHandover({
      sessions: [started],
      now: NOW,
      timeZone: AMSTERDAM,
      privateTo: TOM,
      classesTo: TOM,
    });

    expect(decided.changes).toEqual([]);
    expect(decided.summary).toEqual({
      nextTwoWeeks: {
        privateHandedOver: 0,
        privateCancelled: 0,
        classesHandedOver: 0,
        classesTrainerNeeded: 0,
      },
      later: { privateTrainerNeeded: 0, classesTrainerNeeded: 0 },
    });
  });
});
