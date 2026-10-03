import { describe, expect, it, vi } from 'vitest';
import {
  dstTransitions,
  fixedClock,
  freezeSystemTime,
  manualClock,
  wallTime,
  zonedTime,
} from './clock.ts';

describe('E010 clocks', () => {
  it('fixedClock always returns the same instant, as a fresh Date', () => {
    const clock = fixedClock('2026-09-22T16:00:00Z');

    const first = clock.now();
    first.setUTCFullYear(2000);

    expect(clock.now().toISOString()).toBe('2026-09-22T16:00:00.000Z');
  });

  it('manualClock moves only when told, a day being 24 hours across DST', () => {
    const clock = manualClock(zonedTime('2026-03-28T18:00'));

    clock.advance({ days: 1 });
    expect(wallTime(clock.now())).toBe('2026-03-29T19:00');

    clock.set('2026-10-24T16:00:00Z');
    clock.advance({ hours: 25, minutes: 30 });
    expect(clock.now().toISOString()).toBe('2026-10-25T17:30:00.000Z');
  });

  it('rejects an invalid instant', () => {
    expect(() => fixedClock('yesterday')).toThrow('Invalid instant');
  });
});

describe('E010 freezeSystemTime', () => {
  it('freezes Date for the current test', () => {
    freezeSystemTime('2026-10-25T00:59:00Z');

    expect(new Date().toISOString()).toBe('2026-10-25T00:59:00.000Z');
    expect(Date.now()).toBe(Date.parse('2026-10-25T00:59:00Z'));
  });

  // Relies on running after the previous test, which Vitest guarantees within a file.
  it('restores the real clock when the test finishes', () => {
    expect(vi.isFakeTimers()).toBe(false);
    expect(new Date().getUTCFullYear()).toBeGreaterThan(2025);
  });
});

describe('E010 Europe/Amsterdam wall-clock time', () => {
  it.each([
    ['2026-01-15T09:00', '2026-01-15T08:00:00.000Z'],
    ['2026-07-15T09:00', '2026-07-15T07:00:00.000Z'],
    ['2026-07-15T09:00:30', '2026-07-15T07:00:30.000Z'],
  ])('converts %s to %s', (local, utc) => {
    expect(zonedTime(local).toISOString()).toBe(utc);
    expect(wallTime(utc)).toBe(local);
  });

  it('keeps "every Tuesday 18:00" at 18:00 local across the March change', () => {
    const before = zonedTime('2026-03-24T18:00');
    const after = zonedTime('2026-03-31T18:00');

    expect(before.toISOString()).toBe('2026-03-24T17:00:00.000Z');
    expect(after.toISOString()).toBe('2026-03-31T16:00:00.000Z');
  });

  it('keeps "every Tuesday 18:00" at 18:00 local across the October change', () => {
    expect(zonedTime('2026-10-20T18:00').toISOString()).toBe('2026-10-20T16:00:00.000Z');
    expect(zonedTime('2026-10-27T18:00').toISOString()).toBe('2026-10-27T17:00:00.000Z');
  });

  it.each([
    ['2026-09-22T00:30', '2026-09-21T22:30:00.000Z'],
    ['2026-01-01T00:59', '2025-12-31T23:59:00.000Z'],
  ])('puts %s (after local midnight) on the previous UTC day', (local, utc) => {
    expect(zonedTime(local).toISOString()).toBe(utc);
  });

  it('rejects the skipped hour when DST starts unless told what to do', () => {
    expect(() => zonedTime('2026-03-29T02:30')).toThrow("doesn't exist");
    expect(zonedTime('2026-03-29T02:30', { disambiguation: 'compatible' }).toISOString()).toBe(
      '2026-03-29T01:30:00.000Z', // 03:30 summer time
    );
    expect(zonedTime('2026-03-29T02:30', { disambiguation: 'later' }).toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
    expect(zonedTime('2026-03-29T02:30', { disambiguation: 'earlier' }).toISOString()).toBe(
      '2026-03-29T00:30:00.000Z', // 01:30 winter time
    );
  });

  it('rejects the repeated hour when DST ends unless told which one', () => {
    expect(() => zonedTime('2026-10-25T02:30')).toThrow('happens twice');
    expect(zonedTime('2026-10-25T02:30', { disambiguation: 'earlier' }).toISOString()).toBe(
      '2026-10-25T00:30:00.000Z', // summer time
    );
    expect(zonedTime('2026-10-25T02:30', { disambiguation: 'compatible' }).toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
    expect(zonedTime('2026-10-25T02:30', { disambiguation: 'later' }).toISOString()).toBe(
      '2026-10-25T01:30:00.000Z', // winter time
    );
  });

  it('shows both passes through the repeated hour as the same wall-clock time', () => {
    expect(wallTime('2026-10-25T00:30:00Z')).toBe('2026-10-25T02:30');
    expect(wallTime('2026-10-25T01:30:00Z')).toBe('2026-10-25T02:30');
  });

  it.each([
    '2026-04-31T10:00',
    '2026-02-29T10:00',
    '2026-03-29 10:00',
    '2026-03-29T25:00',
    '10:00',
  ])('rejects the invalid local time %j', (local) => {
    expect(() => zonedTime(local)).toThrow('Invalid local time');
  });

  it('supports other time zones', () => {
    expect(zonedTime('2026-07-15T09:00', { timeZone: 'America/New_York' }).toISOString()).toBe(
      '2026-07-15T13:00:00.000Z',
    );
    expect(wallTime('2026-07-15T13:00:00Z', 'UTC')).toBe('2026-07-15T13:00');
  });
});

describe('E010 DST fixtures', () => {
  it.each([
    [2026, '2026-03-29', '2026-10-25'],
    [2027, '2027-03-28', '2027-10-31'],
  ])('finds the last Sundays of March and October %i', (year, spring, autumn) => {
    const { springForward, fallBack } = dstTransitions(year);

    expect(springForward).toEqual({
      instant: new Date(`${spring}T01:00:00Z`),
      date: spring,
      offsetBefore: '+01:00',
      offsetAfter: '+02:00',
      from: '02:00',
      to: '03:00',
    });
    expect(fallBack).toEqual({
      instant: new Date(`${autumn}T01:00:00Z`),
      date: autumn,
      offsetBefore: '+02:00',
      offsetAfter: '+01:00',
      from: '02:00',
      to: '03:00',
    });
  });

  it('matches the wall clock around the change', () => {
    const { springForward, fallBack } = dstTransitions(2026);
    const minute = 60_000;

    expect(wallTime(new Date(springForward.instant.getTime() - minute))).toBe('2026-03-29T01:59');
    expect(wallTime(springForward.instant)).toBe('2026-03-29T03:00');
    expect(wallTime(new Date(fallBack.instant.getTime() - minute))).toBe('2026-10-25T02:59');
    expect(wallTime(fallBack.instant)).toBe('2026-10-25T02:00');
  });

  it('throws for a time zone without DST', () => {
    expect(() => dstTransitions(2026, 'UTC')).toThrow('no single DST start and end');
  });
});
