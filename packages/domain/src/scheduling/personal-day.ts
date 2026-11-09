import { addDays, localDateOf, localDayBounds } from './zoned-time.ts';

// The personal day of a trainer (F013, spec #457): everything the person is assigned to, across
// every workspace they work in, as one list for one calendar day. The API reads each workspace
// on its own (ADR-006) and hands the lists over; merging them is a rule, so it is here: pure,
// no I/O, no clock of its own ("now" is an argument), and tested at midnight and across daylight
// saving time (ADR-012). Apps show what this returns; they do not pick the next item or count.

/** The one time zone of the personal scope: every MVP workspace is Dutch (`information-architecture.md`, Q19). */
export const PERSONAL_TIME_ZONE = 'Europe/Amsterdam';

/** The week and month views ask for at most this many days at once. */
export const PERSONAL_RANGE_MAX_DAYS = 42;

/** What the merge needs of an item: the rest of it (workspace, client, location) rides along untouched. */
export interface PersonalSessionTimes {
  readonly sessionId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: 'scheduled' | 'cancelled';
  /**
   * Where the session takes place: the ID of its location. The same ID is the same place; an item
   * without one (a caller that has no places) adds nothing to `placesAhead`.
   */
  readonly placeId?: string;
}

export interface PersonalDay<T extends PersonalSessionTimes> {
  /** The day shown: `YYYY-MM-DD` in the time zone. */
  readonly date: string;
  /** The day's items in time order, cancelled ones included (they stay, struck through). */
  readonly items: T[];
  /**
   * "4 sessies · 09:00–19:00": how many items the day holds, cancelled ones counted, and from the
   * start of the first to the end of the last. Both times are `null` for an empty day.
   */
  readonly summary: {
    readonly count: number;
    /**
     * "2 klaar": the items of the day that take place and have ended (`endsAt` ≤ now). A cancelled
     * item is never done.
     */
    readonly done: number;
    readonly firstStartsAt: Date | null;
    readonly lastEndsAt: Date | null;
  };
  /**
   * *Straks* / *Nu bezig*: the first item of today that has not ended and is not cancelled.
   * `startsInMinutes` is rounded up, 0 while it runs. `null` when nothing is left today, and for
   * any day but today.
   */
  readonly next: {
    readonly sessionId: string;
    readonly state: 'upcoming' | 'in-progress';
    readonly startsInMinutes: number;
  } | null;
  /**
   * The next free gap of the *Mijn dag* card, for today only: the first stretch of at least
   * `PERSONAL_FREE_GAP_MINUTES` without a session that takes place, from `now` to the end of the
   * day's last such session. `null` when there is none (also after the last session) and for any
   * day but today. A cancelled session leaves its time free.
   */
  readonly freeGap: { readonly startsAt: Date; readonly endsAt: Date } | null;
  /**
   * *Route vandaag*, for today only: the places (`placeId`) of the sessions that take place and
   * have not ended, in time order, the same place twice in a row listed once. `[]` when nothing is
   * left, `null` for any day but today. The apps show the route only with 2 or more.
   */
  readonly placesAhead: string[] | null;
  /**
   * The footer "Morgen: 3 sessies, eerste om 07:00": the sessions of the next day that take place
   * (a cancelled one is nothing to prepare for), `null` when there are none.
   */
  readonly tomorrow: {
    readonly date: string;
    readonly count: number;
    readonly firstStartsAt: Date;
  } | null;
}

/** Time order; items that start together are ordered by end and then ID, so the order never depends on the input's. */
function byTime(a: PersonalSessionTimes, b: PersonalSessionTimes): number {
  return (
    a.startsAt.getTime() - b.startsAt.getTime() ||
    a.endsAt.getTime() - b.endsAt.getTime() ||
    a.sessionId.localeCompare(b.sessionId)
  );
}

/** The items in time order. */
export function orderPersonalSessions<T extends PersonalSessionTimes>(items: readonly T[]): T[] {
  return [...items].sort(byTime);
}

const MINUTE_MS = 60_000;

/** A free gap is worth showing from this length. */
export const PERSONAL_FREE_GAP_MINUTES = 30;

/** The first stretch of `PERSONAL_FREE_GAP_MINUTES` or more from `now` that no session in `ahead` fills. */
function firstFreeGap(
  ahead: readonly PersonalSessionTimes[],
  now: Date,
): { startsAt: Date; endsAt: Date } | null {
  let free = now;
  for (const session of ahead) {
    if (session.startsAt.getTime() - free.getTime() >= PERSONAL_FREE_GAP_MINUTES * MINUTE_MS) {
      return { startsAt: free, endsAt: session.startsAt };
    }
    if (session.endsAt > free) free = session.endsAt;
  }
  return null;
}

/** The places in order, each once in a row; an item without a place adds none. */
function routeOf(ahead: readonly PersonalSessionTimes[]): string[] {
  const places: string[] = [];
  for (const { placeId } of ahead) {
    if (placeId !== undefined && places[places.length - 1] !== placeId) places.push(placeId);
  }
  return places;
}

/**
 * Merges the items of a trainer's workspaces into the personal day. `itemsPerWorkspace` may hold
 * more than the day (the API reads today and tomorrow in one query per workspace): an item belongs
 * to the day it starts on, on the wall clock of `timeZone`, so a session that crosses midnight is
 * the day it began. The day is the one `now` falls in, unless `options.date` names another.
 *
 * @throws RangeError when `options.date` is no calendar date; the caller has checked it.
 */
export function mergePersonalDay<T extends PersonalSessionTimes>(
  itemsPerWorkspace: readonly (readonly T[])[],
  now: Date,
  timeZone: string,
  options: { readonly date?: string } = {},
): PersonalDay<T> {
  const today = localDateOf(now, timeZone);
  const date = options.date ?? today;
  const day = localDayBounds(date, timeZone);
  if (!day) throw new RangeError(`Not a date: ${date}`);
  const nextDate = addDays(date, 1);
  const nextDay = localDayBounds(nextDate, timeZone);
  if (!nextDay) throw new RangeError(`Not a date: ${nextDate}`);

  const all = itemsPerWorkspace.flat();
  const within = (bounds: { start: Date; end: Date }) => (item: T) =>
    item.startsAt >= bounds.start && item.startsAt < bounds.end;
  const items = orderPersonalSessions(all.filter(within(day)));
  const tomorrowItems = orderPersonalSessions(
    all.filter(within(nextDay)).filter((item) => item.status === 'scheduled'),
  );

  const first = items[0];
  const lastEndsAt = items.reduce<Date | null>(
    (latest, item) => (latest === null || item.endsAt > latest ? item.endsAt : latest),
    null,
  );
  const upcoming =
    date === today
      ? items.find((item) => item.status === 'scheduled' && item.endsAt > now)
      : undefined;
  const tomorrowFirst = tomorrowItems[0];
  // The sessions that take place and have not ended: the ones the rest of today is made of.
  const ahead = items.filter((item) => item.status === 'scheduled' && item.endsAt > now);

  return {
    date,
    items,
    summary: {
      count: items.length,
      done: items.filter((item) => item.status === 'scheduled' && item.endsAt <= now).length,
      firstStartsAt: first?.startsAt ?? null,
      lastEndsAt,
    },
    next: upcoming
      ? {
          sessionId: upcoming.sessionId,
          state: upcoming.startsAt <= now ? 'in-progress' : 'upcoming',
          startsInMinutes:
            upcoming.startsAt <= now
              ? 0
              : Math.ceil((upcoming.startsAt.getTime() - now.getTime()) / MINUTE_MS),
        }
      : null,
    freeGap: date === today ? firstFreeGap(ahead, now) : null,
    placesAhead: date === today ? routeOf(ahead) : null,
    tomorrow: tomorrowFirst
      ? { date: nextDate, count: tomorrowItems.length, firstStartsAt: tomorrowFirst.startsAt }
      : null,
  };
}

export type PersonalRangeDecision =
  | {
      readonly outcome: 'range';
      /** The first instant of the first day. */
      readonly start: Date;
      /** The first instant after the last day. */
      readonly end: Date;
      /** The number of calendar days, 1 to `PERSONAL_RANGE_MAX_DAYS`. */
      readonly days: number;
    }
  | {
      readonly outcome: 'refused';
      readonly reason: 'invalid-from' | 'invalid-to' | 'to-before-from' | 'too-long';
    };

const DAY_MS = 86_400_000;

/**
 * The days from `from` to `to`, both included (`YYYY-MM-DD`), as the instants the week and month
 * views read between: at most `PERSONAL_RANGE_MAX_DAYS` days, the last day ending at its own
 * midnight, so a 25-hour day in October is whole.
 */
export function decidePersonalRange(
  from: string,
  to: string,
  timeZone: string,
): PersonalRangeDecision {
  const first = localDayBounds(from, timeZone);
  if (!first) return { outcome: 'refused', reason: 'invalid-from' };
  const last = localDayBounds(to, timeZone);
  if (!last) return { outcome: 'refused', reason: 'invalid-to' };
  // Both are calendar dates: the difference in days is exact in UTC.
  const days =
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  if (days < 1) return { outcome: 'refused', reason: 'to-before-from' };
  if (days > PERSONAL_RANGE_MAX_DAYS) return { outcome: 'refused', reason: 'too-long' };
  return { outcome: 'range', start: first.start, end: last.end, days };
}
