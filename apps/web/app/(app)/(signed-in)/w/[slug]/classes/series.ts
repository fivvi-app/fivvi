import type { Schemas } from '@fivvi/contract';

export type Weekday = Schemas['ClassSeries']['weekday'];
export type ChangedField = Schemas['SessionSeries']['changedFields'][number];

/** The weekdays as the API writes them (two letters), Monday first (`Date.getUTCDay()` is 0 for Sunday). */
const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/**
 * The weekday of a typed local date (`YYYY-MM-DD`), as the API writes it, or `null` for text that is
 * no date. A calendar date has the same weekday in every time zone.
 */
export function weekdayOf(localDate: string): Weekday | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  const day = new Date(`${localDate}T12:00:00Z`);
  // 30 February would roll over to March: only a date that reads back as typed counts.
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== localDate) return null;
  return WEEKDAYS[(day.getUTCDay() + 6) % 7] ?? null;
}

/** A date that falls on the weekday, in a week no clocks change: for writing the weekday's name. */
export function referenceDay(weekday: Weekday): Date {
  // 1 January 2024 is a Monday.
  return new Date(Date.UTC(2024, 0, 1 + WEEKDAYS.indexOf(weekday), 12));
}

/** The end of a series' dates on the wall clock: the start plus the length, as `HH:mm`. */
export function seriesEnd(localStartTime: string, durationMinutes: number): string {
  const [hours = 0, minutes = 0] = localStartTime.split(':').map(Number);
  const end = (hours * 60 + minutes + durationMinutes) % (24 * 60);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
}

/**
 * The length in minutes from a start to an end typed on the wall clock (`HH:mm`), or `null` when
 * either is no time or the end is the start. An end before the start is the next day's (the way
 * `seriesEnd` writes a series that runs past midnight); whether that length is allowed is the API's.
 */
export function minutesBetween(localStart: string, localEnd: string): number | null {
  const clock = /^(\d{2}):(\d{2})$/;
  const from = clock.exec(localStart);
  const to = clock.exec(localEnd);
  if (!from || !to) return null;
  const minutes = (match: RegExpExecArray) => Number(match[1]) * 60 + Number(match[2]);
  const length = (minutes(to) - minutes(from) + 24 * 60) % (24 * 60);
  return length === 0 ? null : length;
}

/** What differs on a date, in the order CO-01 names it: time, trainer, capacity, location, level (F067). */
const FIELD_ORDER: readonly ChangedField[] = ['time', 'trainer', 'capacity', 'location', 'level'];

export function orderedFields(fields: readonly ChangedField[]): ChangedField[] {
  return FIELD_ORDER.filter((field) => fields.includes(field));
}

/**
 * The trainer the series dialog's select shows: the chosen one when the loaded trainers have them,
 * *Trainer nodig* (`''`) when they don't (a trainer who left the workspace). While the trainers
 * aren't loaded (`null`) the series' own trainer is the only option, so the choice stands.
 */
export function shownTrainerId(trainerId: string, trainers: readonly { id: string }[] | null) {
  if (trainers === null || trainers.some(({ id }) => id === trainerId)) return trainerId;
  return '';
}

/**
 * The first day a series no longer has dates, for *Gestopt vanaf {date}* on TW-03 (F026 AC7), or
 * `null` for a series that is not stopped: one that runs until it is stopped, and one that ended
 * because a later series of the class took over from a date on (F022: it ends the day before that
 * one starts). `all` are the class's series as `GET …/series` lists them. Cancelling the rest of a
 * series ends it the day before the chosen date; from its first date the end is that date's own
 * day, because an end can't fall before the start, and so it is also the first day without dates.
 */
export function stoppedFrom(
  series: Pick<Schemas['ClassSeries'], 'startsOn' | 'endsOn'>,
  all: readonly Pick<Schemas['ClassSeries'], 'startsOn'>[],
): string | null {
  const { startsOn, endsOn } = series;
  if (!endsOn || all.some((other) => other.startsOn > endsOn)) return null;
  if (endsOn === startsOn) return endsOn;
  const next = new Date(`${endsOn}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
