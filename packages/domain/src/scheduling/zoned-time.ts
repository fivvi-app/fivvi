// Wall-clock time in a time zone to an instant (ADR-012). Pure: it uses the time zone database
// of the runtime through `Intl`, and no clock. Stored instants are UTC; people type local times.

export type WallClockInstant =
  /** The time exists. `repeated`: it happens twice (the clocks went back); the earlier instant is taken. */
  | { readonly outcome: 'instant'; readonly instant: Date; readonly repeated: boolean }
  /** The time is skipped when the clocks go forward (02:30 on 28 March 2027 in Amsterdam). */
  | { readonly outcome: 'does-not-exist' }
  /** The date is no calendar date (`YYYY-MM-DD`), or the time no time of day (`HH:mm`); `field` says which. */
  | { readonly outcome: 'invalid'; readonly field: 'date' | 'time' };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;
const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, format);
  }
  return format;
}

/** The wall-clock fields of `time` in `timeZone`, read as if they were UTC (milliseconds dropped). */
function wallAsUtc(time: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatterFor(timeZone).formatToParts(time)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = parts;
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/** The UTC offset of `timeZone` at `time`, in milliseconds (Amsterdam summer time: +7_200_000). */
function offsetAt(time: number, timeZone: string): number {
  const whole = time - (((time % 1000) + 1000) % 1000);
  return wallAsUtc(whole, timeZone) - whole;
}

/**
 * The instant at which the wall clock in `timeZone` reads `date` (`YYYY-MM-DD`) at `time`
 * (`HH:mm`, 24 hours). A time the clocks skip does not exist; a time they repeat takes the earlier
 * instant (summer time in Amsterdam) and is reported as `repeated`, so the person can be told.
 */
export function wallClockToInstant(date: string, time: string, timeZone: string): WallClockInstant {
  const day = DATE.exec(date);
  if (!day) return { outcome: 'invalid', field: 'date' };
  const [year, month, dayOfMonth] = [Number(day[1]), Number(day[2]), Number(day[3])];
  // `Date.UTC` rolls 30 February over to March; the round trip catches it.
  const rolled = new Date(Date.UTC(year, month - 1, dayOfMonth));
  if (
    rolled.getUTCFullYear() !== year ||
    rolled.getUTCMonth() !== month - 1 ||
    rolled.getUTCDate() !== dayOfMonth
  ) {
    return { outcome: 'invalid', field: 'date' };
  }
  const clock = TIME.exec(time);
  const [hour, minute] = [Number(clock?.[1]), Number(clock?.[2])];
  if (!clock || hour > 23 || minute > 59) return { outcome: 'invalid', field: 'time' };
  const asUtc = Date.UTC(year, month - 1, dayOfMonth, hour, minute);

  // The offsets a day either side cover any single transition near this time.
  const offsets = [
    ...new Set([offsetAt(asUtc - DAY_MS, timeZone), offsetAt(asUtc + DAY_MS, timeZone)]),
  ];
  const matches = offsets
    .map((offset) => asUtc - offset)
    .filter((candidate) => wallAsUtc(candidate, timeZone) === asUtc)
    .sort((a, b) => a - b);
  const [earlier] = matches;
  if (earlier === undefined) return { outcome: 'does-not-exist' };
  return { outcome: 'instant', instant: new Date(earlier), repeated: matches.length > 1 };
}

/**
 * The wall clock of `instant` in `timeZone`: the date (`YYYY-MM-DD`) and the time of day
 * (`HH:mm`, 24 hours), the form `wallClockToInstant` takes. A repeated time (the clocks went back)
 * reads the same for both instants, so for the later one it does not round-trip; stored sessions
 * start at the earlier one.
 */
export function instantToWallClock(
  instant: Date,
  timeZone: string,
): { readonly date: string; readonly time: string } {
  const wall = new Date(wallAsUtc(instant.getTime(), timeZone));
  const [date = '', time = ''] = wall.toISOString().split(/[T]/);
  return { date, time: time.slice(0, 5) };
}

/** The calendar date (`YYYY-MM-DD`) on the wall clock of `timeZone` at `instant`. */
export function localDateOf(instant: Date, timeZone: string): string {
  return new Date(wallAsUtc(instant.getTime(), timeZone)).toISOString().slice(0, 10);
}

/** The date `days` after `date` (before, when negative); a calendar date, so DST does not matter. */
export function addDays(date: string, days: number): string {
  const day = DATE.exec(date);
  if (!day) throw new RangeError(`Not a date: ${date}`);
  const shifted = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]) + days);
  return new Date(shifted).toISOString().slice(0, 10);
}

/** The first instant of `date` in `timeZone`; a zone that skips midnight starts the day at the first hour that exists. */
function startOfDay(date: string, timeZone: string): Date | undefined {
  for (const hour of ['00', '01', '02', '03']) {
    const found = wallClockToInstant(date, `${hour}:00`, timeZone);
    if (found.outcome === 'invalid') return undefined;
    if (found.outcome === 'instant') return found.instant;
  }
  return undefined;
}

/**
 * The day `date` (`YYYY-MM-DD`) on the wall clock of `timeZone`, from its first instant up to, not
 * including, the first instant of the next day: 23 hours when the clocks go forward, 25 when they
 * go back. `undefined` when `date` is no calendar date.
 */
export function localDayBounds(
  date: string,
  timeZone: string,
): { readonly start: Date; readonly end: Date } | undefined {
  const start = startOfDay(date, timeZone);
  if (!start) return undefined;
  const end = startOfDay(addDays(date, 1), timeZone);
  return end ? { start, end } : undefined;
}
