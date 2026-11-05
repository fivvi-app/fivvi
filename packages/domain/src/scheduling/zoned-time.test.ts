import { AMSTERDAM, dstTransitions, zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  instantToWallClock,
  localDateOf,
  localDayBounds,
  wallClockToInstant,
} from './zoned-time.ts';

describe('ADR-012 wall-clock time to an instant', () => {
  it('reads a summer time in Amsterdam as UTC+2', () => {
    expect(wallClockToInstant('2026-09-24', '09:00', AMSTERDAM)).toEqual({
      outcome: 'instant',
      instant: new Date('2026-09-24T07:00:00.000Z'),
      repeated: false,
    });
  });

  it('reads a winter time in Amsterdam as UTC+1', () => {
    expect(wallClockToInstant('2026-12-01', '09:00', AMSTERDAM)).toEqual({
      outcome: 'instant',
      instant: new Date('2026-12-01T08:00:00.000Z'),
      repeated: false,
    });
  });

  it('follows the zone it is given, not the machine', () => {
    expect(wallClockToInstant('2026-09-24', '09:00', 'UTC')).toMatchObject({
      instant: new Date('2026-09-24T09:00:00.000Z'),
    });
    expect(wallClockToInstant('2026-01-15', '09:00', 'America/New_York')).toMatchObject({
      instant: new Date('2026-01-15T14:00:00.000Z'),
    });
  });

  it('refuses a time that does not exist when the clocks go forward', () => {
    const { springForward } = dstTransitions(2027);
    expect(springForward.date).toBe('2027-03-28');
    expect(wallClockToInstant('2027-03-28', '02:30', AMSTERDAM)).toEqual({
      outcome: 'does-not-exist',
    });
    // The edges: 01:59 exists, 02:00 is already skipped, 03:00 exists.
    expect(wallClockToInstant('2027-03-28', '01:59', AMSTERDAM).outcome).toBe('instant');
    expect(wallClockToInstant('2027-03-28', '02:00', AMSTERDAM).outcome).toBe('does-not-exist');
    expect(wallClockToInstant('2027-03-28', '03:00', AMSTERDAM)).toMatchObject({
      outcome: 'instant',
      instant: zonedTime('2027-03-28T03:00'),
    });
  });

  it('takes the earlier instant (summer time) of a time that happens twice, and says so', () => {
    const { fallBack } = dstTransitions(2026);
    expect(fallBack.date).toBe('2026-10-25');
    expect(wallClockToInstant('2026-10-25', '02:30', AMSTERDAM)).toEqual({
      outcome: 'instant',
      instant: new Date('2026-10-25T00:30:00.000Z'),
      repeated: true,
    });
    // Outside the repeated hour nothing is repeated.
    expect(wallClockToInstant('2026-10-25', '01:59', AMSTERDAM)).toMatchObject({ repeated: false });
    expect(wallClockToInstant('2026-10-25', '03:00', AMSTERDAM)).toMatchObject({
      instant: new Date('2026-10-25T02:00:00.000Z'),
      repeated: false,
    });
  });

  it.each([
    ['2026-02-30', '09:00', 'date'],
    ['2026-13-01', '09:00', 'date'],
    ['2026-00-10', '09:00', 'date'],
    ['24-09-2026', '09:00', 'date'],
    ['', '', 'date'],
    ['2026-09-24', '24:00', 'time'],
    ['2026-09-24', '9:00', 'time'],
    ['2026-09-24', '09:60', 'time'],
    ['2026-09-24', '', 'time'],
  ])('says the input is invalid for %s %s: the %s', (date, time, field) => {
    expect(wallClockToInstant(date, time, AMSTERDAM)).toEqual({ outcome: 'invalid', field });
  });
});

describe('ADR-012 an instant to the wall clock', () => {
  it('reads a summer instant in Amsterdam as UTC+2 and a winter instant as UTC+1', () => {
    expect(instantToWallClock(new Date('2026-10-06T16:30:00.000Z'), AMSTERDAM)).toEqual({
      date: '2026-10-06',
      time: '18:30',
    });
    expect(instantToWallClock(new Date('2026-12-01T08:00:00.000Z'), AMSTERDAM)).toEqual({
      date: '2026-12-01',
      time: '09:00',
    });
  });

  it('moves to the next local day past midnight', () => {
    expect(instantToWallClock(new Date('2026-09-24T22:30:00.000Z'), AMSTERDAM)).toEqual({
      date: '2026-09-25',
      time: '00:30',
    });
  });

  it('gives back what wallClockToInstant took, also in the repeated hour', () => {
    for (const [date, time] of [
      ['2026-09-24', '09:00'],
      ['2026-10-25', '02:30'],
      ['2027-03-28', '03:00'],
    ] as const) {
      const result = wallClockToInstant(date, time, AMSTERDAM);
      if (result.outcome !== 'instant') throw new Error('the time exists');
      expect(instantToWallClock(result.instant, AMSTERDAM)).toEqual({ date, time });
    }
  });
});

describe('F013 calendar days in a time zone', () => {
  it('names the local date of an instant, also just before and after midnight', () => {
    // 22 September 2026 is summer time: 21:59 UTC is 23:59 in Amsterdam, 22:00 UTC is midnight.
    expect(localDateOf(new Date('2026-09-22T21:59:59.999Z'), AMSTERDAM)).toBe('2026-09-22');
    expect(localDateOf(new Date('2026-09-22T22:00:00.000Z'), AMSTERDAM)).toBe('2026-09-23');
    expect(localDateOf(new Date('2026-09-22T22:00:00.000Z'), 'UTC')).toBe('2026-09-22');
  });

  it('adds days to a date across month and year ends and a leap day', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('bounds an ordinary day from local midnight to the next', () => {
    expect(localDayBounds('2026-09-22', AMSTERDAM)).toEqual({
      start: new Date('2026-09-21T22:00:00.000Z'),
      end: new Date('2026-09-22T22:00:00.000Z'),
    });
  });

  it('bounds the 25-hour day when the clocks go back and the 23-hour day when they go forward', () => {
    const { fallBack, springForward } = dstTransitions(2026);
    const back = localDayBounds(fallBack.date, AMSTERDAM);
    const forward = localDayBounds(springForward.date, AMSTERDAM);

    expect(back).toEqual({
      start: new Date('2026-10-24T22:00:00.000Z'),
      end: new Date('2026-10-25T23:00:00.000Z'),
    });
    expect(back && (back.end.getTime() - back.start.getTime()) / 3_600_000).toBe(25);
    expect(forward && (forward.end.getTime() - forward.start.getTime()) / 3_600_000).toBe(23);
  });

  it('has no bounds for something that is not a date', () => {
    expect(localDayBounds('2026-02-30', AMSTERDAM)).toBeUndefined();
    expect(localDayBounds('22-09-2026', AMSTERDAM)).toBeUndefined();
  });
});
