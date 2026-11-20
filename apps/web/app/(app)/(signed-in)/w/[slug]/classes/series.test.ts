import { describe, expect, it } from 'vitest';
import { orderedFields, referenceDay, seriesEnd, weekdayOf } from './series';

describe('F022 series helpers', () => {
  it('AC1: the weekday of the chosen date is the one the series repeats on', () => {
    expect(weekdayOf('2026-10-06')).toBe('TU');
    expect(weekdayOf('2026-10-11')).toBe('SU');
    expect(weekdayOf('2026-10-12')).toBe('MO');
    expect(weekdayOf('2026-02-30')).toBeNull();
    expect(weekdayOf('')).toBeNull();
  });

  it('writes a weekday on a day in a week no clocks change', () => {
    expect(referenceDay('TU').getUTCDay()).toBe(2);
    expect(referenceDay('SU').getUTCDay()).toBe(0);
  });

  it('adds the length to the wall-clock start', () => {
    expect(seriesEnd('18:00', 60)).toBe('19:00');
    expect(seriesEnd('18:30', 45)).toBe('19:15');
    expect(seriesEnd('23:30', 60)).toBe('00:30');
  });

  it('AC4: names what differs in a fixed order', () => {
    expect(orderedFields(['capacity', 'time'])).toEqual(['time', 'capacity']);
    expect(orderedFields([])).toEqual([]);
  });
});
