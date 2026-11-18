import { expandEach } from './expand-series.ts';
import type { SeriesFacts, SeriesOccurrence } from './series-rule.ts';

// Keeping a series' calendar filled (F022, ADR-012). Inserts only: a date that exists, whether it
// was cancelled, changed one by one or booked, is never touched, so the task that runs every day
// can run twice and the Owner's changes are safe.

export interface Materialization {
  /** The dates that do not exist yet, in date order. */
  readonly toInsert: readonly SeriesOccurrence[];
  /** Dates of the rule at a time the clocks skip: they get no class date. */
  readonly skipped: readonly string[];
}

/**
 * The dates of `series` in the horizon (`from` to `to`, local dates, both included) that are not in
 * `existing` yet. `existing` are the dates the series has, whatever their status. Never updates.
 */
export function materialize(
  series: SeriesFacts,
  existing: readonly { readonly occurrenceDate: string }[],
  horizon: { readonly from: string; readonly to: string },
): Materialization {
  const expansion = expandEach(series, horizon.from, horizon.to);
  if ('outcome' in expansion) return { toInsert: [], skipped: [] };
  const have = new Set(existing.map((date) => date.occurrenceDate));
  return {
    toInsert: expansion.occurrences.filter((o) => !have.has(o.occurrenceDate)),
    skipped: expansion.skipped.filter((date) => !have.has(date)),
  };
}
