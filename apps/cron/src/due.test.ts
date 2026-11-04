import { dstTransitions, zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import { isDailyTaskDue } from './due.ts';

const at = (instant: string) => new Date(instant);

describe('E012 isDailyTaskDue', () => {
  it('AC3: a daily task runs once per day after 03:00 UTC, no catch-up', () => {
    const lastSuccess = at('2026-11-03T03:05:00Z');

    // The same day: never again.
    expect(isDailyTaskDue(lastSuccess, at('2026-11-03T03:10:00Z'))).toBe(false);
    expect(isDailyTaskDue(lastSuccess, at('2026-11-03T09:00:00Z'))).toBe(false);
    expect(isDailyTaskDue(lastSuccess, at('2026-11-03T23:55:00Z'))).toBe(false);
    // Before 03:00 UTC the next day: not yet.
    expect(isDailyTaskDue(lastSuccess, at('2026-11-04T00:00:00Z'))).toBe(false);
    expect(isDailyTaskDue(lastSuccess, at('2026-11-04T02:59:59.999Z'))).toBe(false);
    // The next day: the first run at or after 03:00 UTC runs it, however early it comes.
    expect(isDailyTaskDue(lastSuccess, at('2026-11-04T03:00:00Z'))).toBe(true);
    expect(isDailyTaskDue(lastSuccess, at('2026-11-04T03:00:30Z'))).toBe(true);
    expect(isDailyTaskDue(lastSuccess, at('2026-11-04T03:05:00Z'))).toBe(true);
    expect(isDailyTaskDue(lastSuccess, at('2026-11-04T03:10:00Z'))).toBe(true);
  });

  it('AC3: the daily slot does not drift later with the jitter of a run', () => {
    // A success at 03:55 (a late run) is still before tomorrow's 03:00 boundary.
    const late = at('2026-11-03T03:55:00Z');
    expect(isDailyTaskDue(late, at('2026-11-04T03:00:00Z'))).toBe(true);
    // A success exactly on the boundary belongs to that day.
    const onBoundary = at('2026-11-04T03:00:00Z');
    expect(isDailyTaskDue(onBoundary, at('2026-11-04T03:05:00Z'))).toBe(false);
    expect(isDailyTaskDue(onBoundary, at('2026-11-04T23:55:00Z'))).toBe(false);
    expect(isDailyTaskDue(onBoundary, at('2026-11-05T03:00:00Z'))).toBe(true);
    // A success before 03:00 UTC (not produced by the runner, but harmless) is from the day before.
    expect(isDailyTaskDue(at('2026-11-04T02:59:00Z'), at('2026-11-04T03:00:00Z'))).toBe(true);
  });

  it('AC3: after a day of downtime it is due on the first run, and that run is the only one', () => {
    const lastSuccess = at('2026-11-02T03:05:00Z');

    expect(isDailyTaskDue(lastSuccess, at('2026-11-04T03:00:00Z'))).toBe(true);
    // Once it ran, that run is the last success: no second run, none for the missed day.
    expect(isDailyTaskDue(at('2026-11-04T03:00:00Z'), at('2026-11-04T03:05:00Z'))).toBe(false);
  });

  it('is never due before 03:00 UTC, however old the last success is', () => {
    const lastSuccess = at('2026-10-01T03:05:00Z');

    expect(isDailyTaskDue(lastSuccess, at('2026-11-04T00:00:00Z'))).toBe(false);
    expect(isDailyTaskDue(lastSuccess, at('2026-11-04T02:59:59.999Z'))).toBe(false);
    expect(isDailyTaskDue(lastSuccess, at('2026-11-04T03:00:00.000Z'))).toBe(true);
  });

  it('is due on the first run after 03:00 UTC when it never succeeded', () => {
    expect(isDailyTaskDue(undefined, at('2026-11-04T02:55:00Z'))).toBe(false);
    expect(isDailyTaskDue(undefined, at('2026-11-04T03:00:00Z'))).toBe(true);
    expect(isDailyTaskDue(undefined, at('2026-11-04T17:00:00Z'))).toBe(true);
  });

  it('AC3: is the same on both sides of every Amsterdam clock change (UTC only)', () => {
    const { springForward, fallBack } = dstTransitions(2026);
    for (const change of [springForward, fallBack]) {
      const day = change.instant.toISOString().slice(0, 10);
      const next = new Date(change.instant.getTime() + 24 * 3_600_000).toISOString().slice(0, 10);
      const lastSuccess = at(`${day}T03:05:00Z`);

      expect(isDailyTaskDue(lastSuccess, at(`${day}T23:55:00Z`))).toBe(false);
      expect(isDailyTaskDue(lastSuccess, at(`${next}T02:59:00Z`))).toBe(false);
      expect(isDailyTaskDue(lastSuccess, at(`${next}T03:00:30Z`))).toBe(true);
      expect(isDailyTaskDue(lastSuccess, at(`${next}T03:06:00Z`))).toBe(true);
    }
    // 03:00 UTC is 04:00 or 05:00 in Amsterdam depending on the date: local time is never read.
    const winter = zonedTime('2026-11-04T04:00');
    const summer = zonedTime('2026-07-04T05:00');
    expect(winter.toISOString().slice(11, 16)).toBe('03:00');
    expect(summer.toISOString().slice(11, 16)).toBe('03:00');
    expect(isDailyTaskDue(undefined, winter)).toBe(true);
    expect(isDailyTaskDue(undefined, summer)).toBe(true);
    expect(isDailyTaskDue(undefined, new Date(winter.getTime() - 1))).toBe(false);
  });
});
