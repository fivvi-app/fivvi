import { AMSTERDAM, dstTransitions, zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import { wallClockToInstant } from './zoned-time.ts';

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
    ['2026-02-30', '09:00'],
    ['2026-13-01', '09:00'],
    ['24-09-2026', '09:00'],
    ['2026-09-24', '24:00'],
    ['2026-09-24', '9:00'],
    ['2026-09-24', '09:60'],
    ['', ''],
  ])('says the input is invalid for %s %s', (date, time) => {
    expect(wallClockToInstant(date, time, AMSTERDAM)).toEqual({ outcome: 'invalid' });
  });
});
