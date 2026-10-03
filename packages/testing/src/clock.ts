import { onTestFinished, vi } from 'vitest';

/**
 * Time helpers for tests (TESTING.md §4.3, §5.4). Domain code gets "now" from an injected
 * clock; these helpers build clocks and turn Europe/Amsterdam wall-clock times into
 * instants, so DST cases are written the way people read them:
 *
 * ```ts
 * const { springForward } = dstTransitions(2026);                    // 29 March 2026
 * const clock = fixedClock(zonedTime('2026-03-28T18:00'));           // Saturday 18:00 local
 * clock.now().toISOString();                                         // '2026-03-28T17:00:00.000Z'
 * wallTime(new Date('2026-03-31T16:00:00Z'));                       // '2026-03-31T18:00'
 * ```
 *
 * Local times are ISO strings without an offset: `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss`.
 */

/** The shape `packages/domain` injects. Structural, so these clocks fit any `{ now(): Date }`. */
export interface Clock {
  now(): Date;
}

export interface ManualClock extends Clock {
  /** Moves the clock to `instant`. */
  set(instant: Date | string): void;
  /** Moves the clock forward by elapsed time. A day is 24 hours, also across DST. */
  advance(duration: Duration): void;
}

export interface Duration {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

/** Workspace default time zone (ADR-012). */
export const AMSTERDAM = 'Europe/Amsterdam';

function toInstant(value: Date | string): Date {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error(`Invalid instant: ${String(value)}`);
  return instant;
}

/** A clock that always returns the same instant. Every call returns a new `Date`. */
export function fixedClock(instant: Date | string): Clock {
  const time = toInstant(instant).getTime();
  return { now: () => new Date(time) };
}

/** A clock that only moves when the test moves it. */
export function manualClock(start: Date | string): ManualClock {
  let time = toInstant(start).getTime();
  return {
    now: () => new Date(time),
    set: (instant) => {
      time = toInstant(instant).getTime();
    },
    advance: ({ days = 0, hours = 0, minutes = 0, seconds = 0, milliseconds = 0 }) => {
      time += (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
    },
  };
}

/**
 * Freezes `Date` (and `Date.now()`) at `instant` for the rest of the current test, for code
 * that can't take an injected clock, such as third-party libraries. Timers keep running.
 * Must be called inside a test; it restores the real clock when the test finishes.
 */
export function freezeSystemTime(instant: Date | string): void {
  vi.useFakeTimers({ now: toInstant(instant), toFake: ['Date'] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
}

// --- Wall-clock time in a time zone ---------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, format);
  }
  return format;
}

/** Wall-clock fields of `time` in `timeZone`, as if they were UTC (milliseconds dropped). */
function wallAsUtc(time: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatter(timeZone).formatToParts(time)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = parts;
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/** UTC offset of `timeZone` at `time`, in milliseconds (Amsterdam summer time: +7_200_000). */
function offsetAt(time: number, timeZone: string): number {
  return wallAsUtc(time, timeZone) - (time - (((time % 1000) + 1000) % 1000));
}

function formatLocal(asUtc: number): string {
  const iso = new Date(asUtc).toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
  const seconds = iso.slice(17, 19);
  return seconds === '00' ? iso.slice(0, 16) : iso.slice(0, 19);
}

/** The wall-clock time of `instant` in `timeZone`: `YYYY-MM-DDTHH:mm` (`:ss` when not zero). */
export function wallTime(instant: Date | string, timeZone: string = AMSTERDAM): string {
  return formatLocal(wallAsUtc(toInstant(instant).getTime(), timeZone));
}

/**
 * What to do with a wall-clock time that happens twice (the repeated hour when DST ends)
 * or never (the skipped hour when DST starts). Same meaning as in Temporal:
 * - `reject` (default): throw, so a test never picks one by accident;
 * - `earlier` / `later`: the earlier or later of the two instants; for a skipped time,
 *   the instant that reads the given time with the offset from after / before the change;
 * - `compatible`: `earlier` for a repeated time, `later` for a skipped one.
 */
export type Disambiguation = 'reject' | 'earlier' | 'later' | 'compatible';

const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const DAY = 86_400_000;

/** The instant at which the wall clock in `timeZone` (default Europe/Amsterdam) reads `local`. */
export function zonedTime(
  local: string,
  {
    timeZone = AMSTERDAM,
    disambiguation = 'reject',
  }: { timeZone?: string; disambiguation?: Disambiguation } = {},
): Date {
  const fields = LOCAL_TIME.exec(local)
    ?.slice(1)
    .map((field) => Number(field ?? 0));
  const [year = Number.NaN, month = 1, day = 1, hour = 0, minute = 0, second = 0] = fields ?? [];
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Date.UTC rolls over (31 April → 1 May); the round trip catches that.
  if (Number.isNaN(asUtc) || formatLocal(asUtc) !== local.replace(/(T\d\d:\d\d):00$/, '$1')) {
    throw new Error(`Invalid local time ${JSON.stringify(local)}; expected YYYY-MM-DDTHH:mm[:ss].`);
  }

  // Offsets a day either side cover any single transition near this time.
  const before = offsetAt(asUtc - DAY, timeZone);
  const after = offsetAt(asUtc + DAY, timeZone);
  const matches = [...new Set([before, after])]
    .map((offset) => asUtc - offset)
    .filter((time) => wallAsUtc(time, timeZone) === asUtc)
    .sort((a, b) => a - b);

  const [earlier, later] = matches;
  if (earlier !== undefined && later === undefined) return new Date(earlier);
  if (earlier !== undefined && later !== undefined) {
    if (disambiguation === 'reject') {
      throw new Error(`${local} happens twice in ${timeZone} (DST ends); pass a disambiguation.`);
    }
    return new Date(disambiguation === 'later' ? later : earlier);
  }
  if (disambiguation === 'reject') {
    throw new Error(`${local} doesn't exist in ${timeZone} (DST starts); pass a disambiguation.`);
  }
  return new Date(disambiguation === 'earlier' ? asUtc - after : asUtc - before);
}

// --- DST fixtures ---------------------------------------------------------------------

export interface DstTransition {
  /** The instant the offset changes. */
  instant: Date;
  /** Local date of the change, `YYYY-MM-DD`. */
  date: string;
  /** UTC offsets before and after, e.g. `+01:00` → `+02:00`. */
  offsetBefore: string;
  offsetAfter: string;
  /**
   * The local hour that is skipped (spring) or repeated (autumn), as `HH:mm` bounds:
   * `02:00`–`03:00` in Europe/Amsterdam.
   */
  from: string;
  to: string;
}

function formatOffset(offset: number): string {
  const minutes = Math.abs(offset) / 60_000;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${offset < 0 ? '-' : '+'}${hh}:${mm}`;
}

/**
 * When DST starts (`springForward`) and ends (`fallBack`) in `year`. In Europe/Amsterdam
 * that is the last Sunday of March and of October at 01:00 UTC. Found from the time
 * zone database rather than hard-coded, so the fixtures stay right if the rules change.
 */
export function dstTransitions(
  year: number,
  timeZone: string = AMSTERDAM,
): { springForward: DstTransition; fallBack: DstTransition } {
  const transitions: (DstTransition & { forward: boolean })[] = [];
  const end = Date.UTC(year + 1, 0, 1);
  for (let day = Date.UTC(year, 0, 1); day < end; day += DAY) {
    const offsetBefore = offsetAt(day, timeZone);
    const offsetAfter = offsetAt(day + DAY, timeZone);
    if (offsetBefore === offsetAfter) continue;

    // Binary search for the first minute with the new offset.
    let low = day;
    let high = day + DAY;
    while (high - low > 60_000) {
      const mid = low + Math.floor((high - low) / 120_000) * 60_000;
      if (offsetAt(mid, timeZone) === offsetBefore) low = mid;
      else high = mid;
    }
    const localBefore = formatLocal(high + offsetBefore);
    const localAfter = formatLocal(high + offsetAfter);
    const [first = '', last = ''] = [localBefore, localAfter].sort();
    transitions.push({
      forward: offsetAfter > offsetBefore,
      instant: new Date(high),
      date: localAfter.slice(0, 10),
      offsetBefore: formatOffset(offsetBefore),
      offsetAfter: formatOffset(offsetAfter),
      from: first.slice(11, 16),
      to: last.slice(11, 16),
    });
  }

  const only = (forward: boolean): DstTransition => {
    const found = transitions.filter((transition) => transition.forward === forward);
    if (found.length !== 1 || !found[0]) {
      throw new Error(`${timeZone} has no single DST start and end in ${year}.`);
    }
    const { forward: _, ...transition } = found[0];
    return transition;
  };
  const springForward = only(true);
  const fallBack = only(false);
  return { springForward, fallBack };
}
