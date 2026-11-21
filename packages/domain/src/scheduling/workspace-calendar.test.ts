import { zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  ATTENTION_DAYS,
  attentionWindow,
  classDatesWithoutTrainer,
  filterWorkspaceCalendar,
  sessionsOfDay,
  type WorkspaceCalendarSession,
} from './workspace-calendar.ts';

// F014 (spec #458, ticket #528): the rules of the workspace calendar behind its read routes: the
// filters of the week, the rows of one day and the open item "a class date without a trainer".
// Pure, in the wall clock of the workspace's zone (ADR-012).

const ZONE = 'Europe/Amsterdam';

function session(
  id: string,
  local: string,
  options: Partial<Omit<WorkspaceCalendarSession, 'sessionId' | 'startsAt' | 'endsAt'>> = {},
): WorkspaceCalendarSession {
  const startsAt = zonedTime(local);
  return {
    sessionId: id,
    type: 'private',
    status: 'scheduled',
    trainerId: 'sarah',
    startsAt,
    endsAt: new Date(startsAt.getTime() + 3_600_000),
    ...options,
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

describe('F014 AC10 (API): class dates without a trainer, the next 14 days', () => {
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
      classDatesWithoutTrainer([later, boxing, session('kracht', '2026-09-22T10:00')], now, ZONE),
    ).toEqual([boxing, later]);
  });

  it('leaves out dates with a trainer, private sessions, cancelled dates and what has begun', () => {
    expect(
      classDatesWithoutTrainer(
        [
          session('kracht', '2026-09-24T10:00', { type: 'group' }),
          session('private', '2026-09-24T11:00', { trainerId: null }),
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
    expect(classDatesWithoutTrainer([outside, inside], now, ZONE)).toEqual([inside]);
  });

  it('takes the wall-clock day of the zone, not UTC', () => {
    // 23:30 Amsterdam on 22 September is 21:30 UTC; the clock of "now" is Amsterdam's.
    const lateNow = zonedTime('2026-09-22T23:30');
    const nextDay = session('next', '2026-09-23T00:30', { type: 'group', trainerId: null });
    expect(classDatesWithoutTrainer([nextDay], lateNow, ZONE)).toEqual([nextDay]);
  });
});
