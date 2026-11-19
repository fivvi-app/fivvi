import { AMSTERDAM, dstTransitions, wallTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import { expandSeries } from './expand-series.ts';
import {
  horizonEnd,
  parseWeeklyRule,
  SERIES_HORIZON_WEEKS,
  type SeriesFacts,
  weekdayOf,
  weeklyRule,
} from './series-rule.ts';

// "Kracht" every Tuesday 18:00 for 60 minutes in Amsterdam, from Tuesday 6 October 2026.
const KRACHT: SeriesFacts = {
  rrule: 'FREQ=WEEKLY;BYDAY=TU',
  localStartTime: '18:00',
  durationMinutes: 60,
  timeZone: AMSTERDAM,
  startsOn: '2026-10-06',
  endsOn: null,
};

const dates = (result: ReturnType<typeof expandSeries>) =>
  result.outcome === 'expanded' ? result.occurrences.map((o) => o.occurrenceDate) : result;

describe('F022 the weekly rule', () => {
  it('reads FREQ=WEEKLY;BYDAY=XX and nothing else', () => {
    expect(parseWeeklyRule('FREQ=WEEKLY;BYDAY=TU')).toEqual({ weekday: 'TU' });
    expect(parseWeeklyRule(weeklyRule('SU'))).toEqual({ weekday: 'SU' });
    for (const other of [
      '',
      'FREQ=DAILY',
      'FREQ=WEEKLY',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
      'FREQ=WEEKLY;BYDAY=TU,TH',
      'FREQ=WEEKLY;BYDAY=TU;COUNT=4',
      'FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T000000Z',
      'FREQ=WEEKLY;BYDAY=XX',
      'freq=weekly;byday=tu',
      'FREQ=MONTHLY;BYDAY=TU',
    ]) {
      expect(parseWeeklyRule(other), other).toBeUndefined();
    }
  });

  it('names the weekday of a date, and none for a date that is none', () => {
    expect(weekdayOf('2026-10-06')).toBe('TU');
    expect(weekdayOf('2027-03-28')).toBe('SU');
    expect(weekdayOf('2026-10-05')).toBe('MO');
    expect(weekdayOf('2026-02-30')).toBeUndefined();
    expect(weekdayOf('nonsense')).toBeUndefined();
  });

  it('keeps the calendar 12 weeks ahead: a horizon from a Tuesday holds 12 Tuesdays', () => {
    expect(SERIES_HORIZON_WEEKS).toBe(12);
    expect(horizonEnd('2026-10-06')).toBe('2026-12-28');
    expect(horizonEnd('2026-10-13')).toBe('2027-01-04');
  });
});

describe('F022 AC1, AC2: expand a weekly series', () => {
  it('AC1: Kracht from Tuesday 6 October 2026 has 12 dates, 6 October to 22 December', () => {
    const result = expandSeries(KRACHT, KRACHT.startsOn, horizonEnd(KRACHT.startsOn));
    const found = dates(result);
    expect(found).toHaveLength(12);
    expect(found).toSatisfy((list: string[]) => list[0] === '2026-10-06');
    expect((found as string[])[11]).toBe('2026-12-22');
  });

  it('AC2: 18:00 in Amsterdam is 16:00 UTC before 25 October 2026 and 17:00 UTC after it', () => {
    expect(dstTransitions(2026).fallBack.date).toBe('2026-10-25');
    const result = expandSeries(KRACHT, '2026-10-06', '2026-11-03');
    if (result.outcome !== 'expanded') throw new Error('expected a series');
    expect(
      result.occurrences.map((o) => [
        o.occurrenceDate,
        o.startsAt.toISOString(),
        o.endsAt.toISOString(),
      ]),
    ).toEqual([
      ['2026-10-06', '2026-10-06T16:00:00.000Z', '2026-10-06T17:00:00.000Z'],
      ['2026-10-13', '2026-10-13T16:00:00.000Z', '2026-10-13T17:00:00.000Z'],
      ['2026-10-20', '2026-10-20T16:00:00.000Z', '2026-10-20T17:00:00.000Z'],
      ['2026-10-27', '2026-10-27T17:00:00.000Z', '2026-10-27T18:00:00.000Z'],
      ['2026-11-03', '2026-11-03T17:00:00.000Z', '2026-11-03T18:00:00.000Z'],
    ]);
  });

  it('AC2: the same across 28 March 2027: 17:00 UTC before, 16:00 UTC after, always 18:00 in Amsterdam', () => {
    expect(dstTransitions(2027).springForward.date).toBe('2027-03-28');
    const result = expandSeries({ ...KRACHT, startsOn: '2027-03-16' }, '2027-03-16', '2027-04-06');
    if (result.outcome !== 'expanded') throw new Error('expected a series');
    expect(result.occurrences.map((o) => [o.occurrenceDate, o.startsAt.toISOString()])).toEqual([
      ['2027-03-16', '2027-03-16T17:00:00.000Z'],
      ['2027-03-23', '2027-03-23T17:00:00.000Z'],
      ['2027-03-30', '2027-03-30T16:00:00.000Z'],
      ['2027-04-06', '2027-04-06T16:00:00.000Z'],
    ]);
    for (const o of result.occurrences)
      expect(wallTime(o.startsAt)).toBe(`${o.occurrenceDate}T18:00`);
  });

  it('the length is elapsed time: a class over the night the clocks change is as long as it says', () => {
    const night = {
      ...KRACHT,
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      localStartTime: '01:30',
      startsOn: '2027-03-21',
    };
    const result = expandSeries({ ...night, durationMinutes: 120 }, '2027-03-21', '2027-03-21');
    if (result.outcome !== 'expanded') throw new Error('expected a series');
    expect(result.occurrences.map((o) => o.endsAt.getTime() - o.startsAt.getTime())).toEqual([
      120 * 60_000,
    ]);
  });

  it('starts at the first matching weekday on or after the start, and stops at the end date', () => {
    const wed = { ...KRACHT, startsOn: '2026-10-01', endsOn: '2026-10-20' };
    expect(dates(expandSeries(wed, '2026-10-01', '2026-12-31'))).toEqual([
      '2026-10-06',
      '2026-10-13',
      '2026-10-20',
    ]);
  });

  it('only gives dates in the window asked for', () => {
    expect(dates(expandSeries(KRACHT, '2026-10-14', '2026-10-27'))).toEqual([
      '2026-10-20',
      '2026-10-27',
    ]);
    expect(dates(expandSeries(KRACHT, '2026-09-01', '2026-10-05'))).toEqual([]);
  });

  it('takes the first (summer time) instant for a start in the repeated hour', () => {
    const sunday = {
      ...KRACHT,
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      localStartTime: '02:30',
      startsOn: '2026-10-25',
    };
    const result = expandSeries(sunday, '2026-10-25', '2026-10-25');
    if (result.outcome !== 'expanded') throw new Error('expected a series');
    expect(result.occurrences[0]).toMatchObject({
      startsAt: new Date('2026-10-25T00:30:00.000Z'),
      repeatedStart: true,
    });
  });
});

describe('F022 AC7: a time that does not exist', () => {
  it('AC7: a weekly time in the non-existent DST hour is refused, naming the first date', () => {
    const sunday = {
      ...KRACHT,
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      localStartTime: '02:30',
      startsOn: '2027-03-14',
    };
    expect(expandSeries(sunday, '2027-03-14', horizonEnd('2027-03-14'))).toEqual({
      outcome: 'refused',
      reason: 'time-does-not-exist',
      date: '2027-03-28',
    });
  });

  it('AC7: the same time is fine in a window that holds no such date', () => {
    const sunday = {
      ...KRACHT,
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      localStartTime: '02:30',
      startsOn: '2027-03-14',
    };
    expect(dates(expandSeries(sunday, '2027-03-14', '2027-03-21'))).toEqual([
      '2027-03-14',
      '2027-03-21',
    ]);
  });

  it('refuses a rule, a time or a date that is none', () => {
    expect(
      expandSeries({ ...KRACHT, rrule: 'FREQ=DAILY' }, '2026-10-06', '2026-10-30'),
    ).toMatchObject({
      outcome: 'refused',
      reason: 'invalid-rule',
    });
    expect(
      expandSeries({ ...KRACHT, localStartTime: '25:00' }, '2026-10-06', '2026-10-30'),
    ).toMatchObject({
      outcome: 'refused',
      reason: 'invalid-time',
    });
    expect(expandSeries(KRACHT, '2026-02-30', '2026-10-30')).toMatchObject({
      outcome: 'refused',
      reason: 'invalid-date',
    });
  });
});
