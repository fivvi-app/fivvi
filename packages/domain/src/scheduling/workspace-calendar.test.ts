import { zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  ATTENTION_DAYS,
  attentionWindow,
  busiestMoment,
  filterWorkspaceCalendar,
  sessionsOfDay,
  sessionsWithoutTrainer,
  type WorkspaceCalendarSession,
} from './workspace-calendar.ts';

// F014 (spec #458, ticket #528): the rules of the workspace calendar behind its read routes: the
// filters of the week, the rows of one day and the open item "a session without a trainer".
// Pure, in the wall clock of the workspace's zone (ADR-012).

const ZONE = 'Europe/Amsterdam';

function session(
  id: string,
  local: string,
  options: Partial<Omit<WorkspaceCalendarSession, 'sessionId' | 'startsAt'>> & {
    minutes?: number;
  } = {},
): WorkspaceCalendarSession {
  const { minutes = 60, ...rest } = options;
  const startsAt = zonedTime(local);
  return {
    sessionId: id,
    type: 'private',
    status: 'scheduled',
    trainerId: 'sarah',
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * 60_000),
    ...rest,
  };
}

describe('F014 AC3 (API): the filters of the workspace calendar', () => {
  const items = [
    session('mark', '2026-09-22T07:00', { trainerId: 'sarah' }),
    session('lisa', '2026-09-22T11:00', { trainerId: 'tom' }),
    session('kracht', '2026-09-22T10:00', { type: 'group', trainerId: 'sarah' }),
    session('boxing', '2026-09-24T19:15', { type: 'group', trainerId: null }),
    session('cancelled', '2026-09-22T18:00', { type: 'group', status: 'cancelled' }),
  ];
  const ids = (list: readonly WorkspaceCalendarSession[]) => list.map((item) => item.sessionId);

  it('leaves everything without a filter, cancelled dates included', () => {
    expect(ids(filterWorkspaceCalendar(items, {}))).toEqual(ids(items));
  });

  it('narrows to the trainers named; a date without a trainer is nobody’s', () => {
    expect(ids(filterWorkspaceCalendar(items, { trainerIds: ['tom'] }))).toEqual(['lisa']);
    expect(ids(filterWorkspaceCalendar(items, { trainerIds: ['sarah', 'tom'] }))).toEqual([
      'mark',
      'lisa',
      'kracht',
      'cancelled',
    ]);
  });

  it('narrows to the types named', () => {
    expect(ids(filterWorkspaceCalendar(items, { types: ['group'] }))).toEqual([
      'kracht',
      'boxing',
      'cancelled',
    ]);
    expect(ids(filterWorkspaceCalendar(items, { types: ['private'] }))).toEqual(['mark', 'lisa']);
  });

  it('hides cancelled sessions when asked, and combines the filters', () => {
    expect(
      ids(filterWorkspaceCalendar(items, { types: ['group'], includeCancelled: false })),
    ).toEqual(['kracht', 'boxing']);
    expect(
      ids(filterWorkspaceCalendar(items, { trainerIds: ['sarah'], types: ['group'] })),
    ).toEqual(['kracht', 'cancelled']);
  });

  it('an empty list of trainers or types is no filter', () => {
    expect(ids(filterWorkspaceCalendar(items, { trainerIds: [], types: [] }))).toEqual(ids(items));
  });
});

describe('F014 AC10 (API): the rows of one day', () => {
  it('lists the sessions that start on the day on the workspace wall clock, in time order', () => {
    const rows = sessionsOfDay(
      [
        session('late', '2026-09-22T18:00', { status: 'cancelled' }),
        session('next-day', '2026-09-23T00:30'),
        session('kracht', '2026-09-22T10:00'),
        session('mark', '2026-09-22T07:00'),
        session('before', '2026-09-21T23:30'),
      ],
      '2026-09-22',
      ZONE,
    );
    expect(rows?.map((row) => row.sessionId)).toEqual(['mark', 'kracht', 'late']);
  });

  it('says no for a date that is none', () => {
    expect(sessionsOfDay([], '2026-02-30', ZONE)).toBeUndefined();
  });

  it('keeps the whole 25-hour day of the clock change', () => {
    const rows = sessionsOfDay(
      [session('early', '2026-10-25T00:30'), session('night', '2026-10-25T23:30')],
      '2026-10-25',
      ZONE,
    );
    expect(rows?.map((row) => row.sessionId)).toEqual(['early', 'night']);
  });
});

describe('F014 AC10 (API): sessions without a trainer, the next 14 days', () => {
  const now = zonedTime('2026-09-22T08:00');
  const boxing = session('boxing', '2026-09-24T19:15', { type: 'group', trainerId: null });

  it('names the horizon', () => {
    expect(ATTENTION_DAYS).toBe(14);
  });

  it('looks from now to the end of the 14th day on the wall clock', () => {
    expect(attentionWindow(now, ZONE)).toEqual({ from: now, to: zonedTime('2026-10-06T00:00') });
  });

  it('finds a class date with no trainer in time order', () => {
    const later = session('later', '2026-10-01T10:00', { type: 'group', trainerId: null });
    expect(
      sessionsWithoutTrainer([later, boxing, session('kracht', '2026-09-22T10:00')], now, ZONE),
    ).toEqual([boxing, later]);
  });

  it('finds a private session with no trainer, next to a class date, in time order (#1537)', () => {
    const removed = session('removed', '2026-09-23T09:00', { trainerId: null });
    const eveningPrivate = session('evening', '2026-09-24T20:00', { trainerId: null });
    expect(
      sessionsWithoutTrainer(
        [eveningPrivate, boxing, removed, session('with-trainer', '2026-09-23T10:00')],
        now,
        ZONE,
      ),
    ).toEqual([removed, boxing, eveningPrivate]);
  });

  it('leaves out private sessions outside the window or that have begun, cancelled or with a trainer', () => {
    expect(
      sessionsWithoutTrainer(
        [
          session('private-trainer', '2026-09-24T11:00'),
          session('private-cancelled', '2026-09-24T11:30', {
            trainerId: null,
            status: 'cancelled',
          }),
          session('private-began', '2026-09-22T07:00', { trainerId: null }),
          session('private-far', '2026-10-06T00:00', { trainerId: null }),
        ],
        now,
        ZONE,
      ),
    ).toEqual([]);
  });

  it('leaves out an Open Gym session with no trainer', () => {
    expect(
      sessionsWithoutTrainer(
        [session('open', '2026-09-24T11:00', { type: 'open_gym', trainerId: null })],
        now,
        ZONE,
      ),
    ).toEqual([]);
  });

  it('leaves out dates with a trainer, cancelled dates and what has begun', () => {
    expect(
      sessionsWithoutTrainer(
        [
          session('kracht', '2026-09-24T10:00', { type: 'group' }),
          session('cancelled', '2026-09-24T12:00', {
            type: 'group',
            trainerId: null,
            status: 'cancelled',
          }),
          session('began', '2026-09-22T07:00', { type: 'group', trainerId: null }),
        ],
        now,
        ZONE,
      ),
    ).toEqual([]);
  });

  it('counts today and the 13 days after it: the 14th day ahead is out', () => {
    const inside = session('inside', '2026-10-05T23:30', { type: 'group', trainerId: null });
    const outside = session('outside', '2026-10-06T00:00', { type: 'group', trainerId: null });
    expect(sessionsWithoutTrainer([outside, inside], now, ZONE)).toEqual([inside]);
  });

  it('takes the wall-clock day of the zone, not UTC', () => {
    // 00:30 on 23 September in Amsterdam is still 22:30 on 22 September in UTC. The 14th day
    // counting today is 6 October on the wall clock (the window ends at 7 October 00:00), but would
    // be 5 October reading the UTC date (ending 6 October 02:00 Amsterdam time).
    const afterMidnight = zonedTime('2026-09-23T00:30');
    expect(attentionWindow(afterMidnight, ZONE)).toEqual({
      from: afterMidnight,
      to: zonedTime('2026-10-07T00:00'),
    });
    const lastDay = session('last-day', '2026-10-06T23:30', { type: 'group', trainerId: null });
    const afterWindow = session('after', '2026-10-07T00:30', { type: 'group', trainerId: null });
    expect(sessionsWithoutTrainer([afterWindow, lastDay], afterMidnight, ZONE)).toEqual([lastDay]);
  });

  it('counts the 14 days on the wall clock across the clock change of 25 October', () => {
    // Summer time ends on the way: 14 days of 24 hours would end an hour early, at 23:00 on 2 November.
    const crossing = zonedTime('2026-10-20T08:00');
    expect(attentionWindow(crossing, ZONE)).toEqual({
      from: crossing,
      to: zonedTime('2026-11-03T00:00'),
    });
    const lastDay = session('last-day', '2026-11-02T23:30', { type: 'group', trainerId: null });
    const after = session('after', '2026-11-03T00:00', { type: 'group', trainerId: null });
    expect(sessionsWithoutTrainer([after, lastDay], crossing, ZONE)).toEqual([lastDay]);
  });
});

describe('F014 #1538: the busiest moment of a day', () => {
  const span = (from: string, to: string, atOnce: number) => ({
    startsAt: zonedTime(from),
    endsAt: zonedTime(to),
    atOnce,
  });

  it('names the hour two sessions share, with how many are at once', () => {
    expect(
      busiestMoment([
        session('sven', '2026-09-22T18:00', { trainerId: 'sven', type: 'group' }),
        session('noor', '2026-09-22T18:00', { trainerId: 'noor', type: 'group' }),
      ]),
    ).toEqual(span('2026-09-22T18:00', '2026-09-22T19:00', 2));
  });

  it('names only the part that overlaps, not the whole of either session', () => {
    expect(
      busiestMoment([
        session('a', '2026-09-22T17:00', { minutes: 120 }),
        session('b', '2026-09-22T18:00', { minutes: 120 }),
      ]),
    ).toEqual(span('2026-09-22T18:00', '2026-09-22T19:00', 2));
  });

  it('names nothing without an overlap: one session, none, or back to back', () => {
    expect(busiestMoment([])).toBeUndefined();
    expect(busiestMoment([session('a', '2026-09-22T18:00')])).toBeUndefined();
    expect(
      busiestMoment([session('a', '2026-09-22T18:00'), session('b', '2026-09-22T19:00')]),
    ).toBeUndefined();
  });

  it('does not count a cancelled session', () => {
    expect(
      busiestMoment([
        session('a', '2026-09-22T18:00'),
        session('b', '2026-09-22T18:00', { status: 'cancelled' }),
      ]),
    ).toBeUndefined();
  });

  it('counts every kind of session, Open Gym and class dates too, and one with no trainer', () => {
    expect(
      busiestMoment([
        session('open', '2026-09-22T18:00', { type: 'open_gym', trainerId: null }),
        session('class', '2026-09-22T18:30', { type: 'group', trainerId: null }),
      ]),
    ).toEqual(span('2026-09-22T18:30', '2026-09-22T19:00', 2));
  });

  it('names the most sessions at once when the day has several overlaps', () => {
    expect(
      busiestMoment([
        session('a', '2026-09-22T07:00', { minutes: 120 }),
        session('b', '2026-09-22T08:00'),
        session('c', '2026-09-22T17:00', { minutes: 180 }),
        session('d', '2026-09-22T18:00', { minutes: 90 }),
        session('e', '2026-09-22T18:30', { minutes: 30 }),
      ]),
    ).toEqual(span('2026-09-22T18:30', '2026-09-22T19:00', 3));
  });

  it('names the first of equally busy moments', () => {
    expect(
      busiestMoment([
        session('late-a', '2026-09-22T19:00'),
        session('late-b', '2026-09-22T19:00'),
        session('early-a', '2026-09-22T09:00'),
        session('early-b', '2026-09-22T09:00'),
      ]),
    ).toEqual(span('2026-09-22T09:00', '2026-09-22T10:00', 2));
  });

  it('ends the moment where the number at once changes, as the prototype does', () => {
    // 18:00-20:00 always has two sessions running, but the moment is the stretch in which the
    // peak is first reached: it ends at 19:00, where one session ends and the next begins.
    expect(
      busiestMoment([
        session('long', '2026-09-22T18:00', { minutes: 120 }),
        session('first', '2026-09-22T18:00'),
        session('second', '2026-09-22T19:00'),
      ]),
    ).toEqual(span('2026-09-22T18:00', '2026-09-22T19:00', 2));
  });

  it('ends the moment at the gap before the next session', () => {
    expect(
      busiestMoment([
        session('long', '2026-09-22T18:00', { minutes: 180 }),
        session('first', '2026-09-22T18:00'),
        session('second', '2026-09-22T20:00'),
      ]),
    ).toEqual(span('2026-09-22T18:00', '2026-09-22T19:00', 2));
  });

  it('is asked in time order or not: the order of the sessions does not matter', () => {
    const a = session('a', '2026-09-22T18:00');
    const b = session('b', '2026-09-22T18:30');
    expect(busiestMoment([b, a])).toEqual(busiestMoment([a, b]));
  });

  it('works in UTC instants: it holds across the clock change of 29 March', () => {
    // Winter time becomes summer time at 01:00 UTC: on the wall clock 01:30 + 1h30 ends at 04:00,
    // but the overlap is the hour between 01:00 and 02:00 UTC.
    const instants = (id: string, from: string, to: string): WorkspaceCalendarSession => ({
      sessionId: id,
      type: 'private',
      status: 'scheduled',
      trainerId: null,
      startsAt: new Date(from),
      endsAt: new Date(to),
    });
    expect(
      busiestMoment([
        instants('a', '2026-03-29T00:30:00Z', '2026-03-29T02:00:00Z'),
        instants('b', '2026-03-29T01:00:00Z', '2026-03-29T03:00:00Z'),
      ]),
    ).toEqual({
      startsAt: new Date('2026-03-29T01:00:00Z'),
      endsAt: new Date('2026-03-29T02:00:00Z'),
      atOnce: 2,
    });
  });

  it('ignores a session that ends when it begins or before', () => {
    expect(
      busiestMoment([
        session('a', '2026-09-22T18:00'),
        session('empty', '2026-09-22T18:00', { minutes: 0 }),
      ]),
    ).toBeUndefined();
  });
});
