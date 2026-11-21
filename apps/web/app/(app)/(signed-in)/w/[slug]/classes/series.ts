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

/** What differs on a date, in the order CO-01 names it: time, trainer, capacity, location. */
const FIELD_ORDER: readonly ChangedField[] = ['time', 'trainer', 'capacity', 'location'];

export function orderedFields(fields: readonly ChangedField[]): ChangedField[] {
  return FIELD_ORDER.filter((field) => fields.includes(field));
}
