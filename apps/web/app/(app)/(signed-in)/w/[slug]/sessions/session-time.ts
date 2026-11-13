import { instantToWallClock, wallClockToInstant } from '@fivvi/domain/zoned-time';

// What the session forms (PS-01, PS-05) tell before anything is saved: where the session ends, and
// whether its start is skipped, repeated or in the past. The rules are the domain's
// (`wallClockToInstant`, ADR-012), the one the API applies when it saves; nothing is decided here.
// The API still has the last word and its refusals are shown too (`sessions-client.ts`).

/** The lengths a private session can have, in minutes: 15 to 240 in steps of 5 (`PRIVATE_SESSION_DURATIONS`). */
export const DURATIONS: readonly number[] = Array.from({ length: 46 }, (_, i) => 15 + i * 5);

/** The chips of the form; any other length is chosen from the list. */
export const DURATION_CHIPS = [45, 60, 90] as const;

const MINUTE_MS = 60_000;

export type SessionTimePreview =
  /** The date or the start is not filled in (yet), or is no date or time. */
  | { status: 'incomplete' }
  /** The start is skipped when the clocks go forward. */
  | { status: 'does-not-exist' }
  | {
      status: 'placed';
      /** The wall-clock end, `HH:mm`. */
      endTime: string;
      /** The end is on another day than the start (*(volgende dag)*). */
      endsNextDay: boolean;
      /** The start happens twice because the clocks go back; the first one is taken. */
      repeatedStart: boolean;
      /** The start is before `now`: it is saved, with a warning, and never emailed. */
      past: boolean;
    };

/** Places a typed local date, start and length in the workspace's time zone. */
export function previewTimes({
  localDate,
  localStart,
  durationMinutes,
  timeZone,
  now,
}: {
  localDate: string;
  localStart: string;
  durationMinutes: number;
  timeZone: string;
  now: Date;
}): SessionTimePreview {
  const start = wallClockToInstant(localDate, localStart, timeZone);
  if (start.outcome === 'invalid') return { status: 'incomplete' };
  if (start.outcome === 'does-not-exist') return { status: 'does-not-exist' };
  const end = instantToWallClock(
    new Date(start.instant.getTime() + durationMinutes * MINUTE_MS),
    timeZone,
  );
  return {
    status: 'placed',
    endTime: end.time,
    endsNextDay: end.date !== localDate,
    repeatedStart: start.repeated,
    past: start.instant.getTime() < now.getTime(),
  };
}

/** The date, start and length of a stored session as the form types them, in its time zone. */
export function wallClockOf(
  session: { startsAt: string; endsAt: string },
  timeZone: string,
): { localDate: string; localStart: string; durationMinutes: number } {
  const start = new Date(session.startsAt);
  const { date, time } = instantToWallClock(start, timeZone);
  return {
    localDate: date,
    localStart: time,
    durationMinutes: Math.round((new Date(session.endsAt).getTime() - start.getTime()) / MINUTE_MS),
  };
}
