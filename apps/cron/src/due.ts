const FIRST_HOUR_UTC = 3;

/**
 * Whether a daily task is due (ADR-027): it is 03:00 UTC or later and the task's last success is
 * from before today's 03:00 UTC boundary (or it never succeeded). So a success at 03:05 does not
 * run again that day, and the first run at or after 03:00 UTC the next day runs it, however early
 * that run comes: the daily slot is anchored to the boundary and does not drift later with the
 * jitter of a run. After days of downtime it is due once, and that run is the new last success
 * (no catch-up).
 *
 * Everything is UTC (`getUTC*`, `Date.UTC`), never the machine's or the workspace's time zone, so
 * a change between summer and winter time cannot move a run.
 */
export function isDailyTaskDue(lastSuccess: Date | undefined, now: Date): boolean {
  if (now.getUTCHours() < FIRST_HOUR_UTC) return false;
  const boundary = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    FIRST_HOUR_UTC,
  );
  return lastSuccess === undefined || lastSuccess.getTime() < boundary;
}
