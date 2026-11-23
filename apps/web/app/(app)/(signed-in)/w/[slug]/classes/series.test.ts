import { describe, expect, it } from 'vitest';
import {
  minutesBetween,
  orderedFields,
  referenceDay,
  seriesEnd,
  shownTrainerId,
  weekdayOf,
} from './series';

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

  it('AC1: the length of a series is the minutes from its start to its end on the wall clock', () => {
    expect(minutesBetween('18:00', '19:00')).toBe(60);
    expect(minutesBetween('18:30', '19:15')).toBe(45);
    // An end before the start is the next day's, as `seriesEnd` writes it.
    expect(minutesBetween('23:30', '00:30')).toBe(60);
    expect(minutesBetween('18:00', '18:00')).toBeNull();
    expect(minutesBetween('', '19:00')).toBeNull();
    expect(minutesBetween('18:00', '7pm')).toBeNull();
  });

  it('AC1: the trainer sent is the one the select shows, Trainer nodig when the trainer is not in the list', () => {
    const trainers = [{ id: 't1' }, { id: 't2' }];
    expect(shownTrainerId('t2', trainers)).toBe('t2');
    expect(shownTrainerId('gone', trainers)).toBe('');
    expect(shownTrainerId('', trainers)).toBe('');
    // Not loaded: the series' own trainer is the only option.
    expect(shownTrainerId('t1', null)).toBe('t1');
  });
});
