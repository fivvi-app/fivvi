const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_HOUR_UTC = 3;

/**
 * Whether a daily task is due (ADR-027): its last success is more than 24 hours old and it is
 * 03:00 UTC or later. A task that never succeeded is due from 03:00 UTC on. There is no catch-up:
 * after days of downtime it is due once, and that run is the new last success.
 *
 * Everything is UTC (`getUTCHours`), never the machine's or the workspace's time zone, so a
 * change between summer and winter time cannot move a run.
 */
export function isDailyTaskDue(lastSuccess: Date | undefined, now: Date): boolean {
  if (now.getUTCHours() < FIRST_HOUR_UTC) return false;
  return lastSuccess === undefined || now.getTime() - lastSuccess.getTime() > DAY_MS;
}
