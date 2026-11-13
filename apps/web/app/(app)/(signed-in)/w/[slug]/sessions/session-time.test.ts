import { PRIVATE_SESSION_DURATIONS } from '@fivvi/domain/private-session-durations';
import { describe, expect, it } from 'vitest';
import { DURATIONS, previewTimes, wallClockOf } from './session-time';

const AMSTERDAM = 'Europe/Amsterdam';
const NOW = new Date('2026-09-01T10:00:00Z');
const preview = (localDate: string, localStart: string, durationMinutes = 60) =>
  previewTimes({ localDate, localStart, durationMinutes, timeZone: AMSTERDAM, now: NOW });

describe('F020 PS-01 session time: what the form shows before saving', () => {
  it('AC1: 09:00 for 60 minutes ends at 10:00 the same day', () => {
    expect(preview('2026-09-24', '09:00')).toEqual({
      status: 'placed',
      endTime: '10:00',
      endsNextDay: false,
      repeatedStart: false,
      past: false,
    });
  });

  it('AC4: 23:30 for 90 minutes ends at 01:00 the next day', () => {
    expect(preview('2026-09-24', '23:30', 90)).toMatchObject({
      status: 'placed',
      endTime: '01:00',
      endsNextDay: true,
    });
  });

  it('AC4: 02:30 on 28 March 2027 does not exist in Amsterdam', () => {
    expect(preview('2027-03-28', '02:30')).toEqual({ status: 'does-not-exist' });
  });

  it('AC4: 02:30 on 25 October 2026 happens twice and the first one is taken', () => {
    expect(preview('2026-10-25', '02:30')).toMatchObject({ status: 'placed', repeatedStart: true });
  });

  it('a duration is elapsed time: 01:30 for 90 minutes over the night the clocks go back ends at 02:00', () => {
    expect(preview('2026-10-25', '01:30', 90)).toMatchObject({
      endTime: '02:00',
      endsNextDay: false,
    });
  });

  it('AC5: a start before now is in the past', () => {
    expect(preview('2026-08-31', '09:00')).toMatchObject({ status: 'placed', past: true });
    expect(preview('2026-09-01', '12:00')).toMatchObject({ past: false });
  });

  it('an empty or half-typed date or start is incomplete, not an error', () => {
    expect(preview('', '09:00')).toEqual({ status: 'incomplete' });
    expect(preview('2026-09-24', '')).toEqual({ status: 'incomplete' });
    expect(preview('2026-02-30', '09:00')).toEqual({ status: 'incomplete' });
  });
});

describe('F020 PS-05 session time: the values a stored session fills the form with', () => {
  it('reads the wall clock date, start and duration of a stored session in its time zone', () => {
    expect(
      wallClockOf(
        { startsAt: '2026-09-24T07:00:00.000Z', endsAt: '2026-09-24T08:00:00.000Z' },
        AMSTERDAM,
      ),
    ).toEqual({ localDate: '2026-09-24', localStart: '09:00', durationMinutes: 60 });
  });
});

describe('F020 durations', () => {
  it("lists every length the API accepts: the domain's range, minimum to maximum in steps", () => {
    const { min, max, step } = PRIVATE_SESSION_DURATIONS;
    const accepted: number[] = [];
    for (let minutes = min; minutes <= max; minutes += step) accepted.push(minutes);
    expect(DURATIONS).toEqual(accepted);
  });
});
