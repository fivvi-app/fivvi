import { NO_TRAINER } from './calendar-filters';

/**
 * The trainer an empty-slot click prefills in PS-01: in the day view the column's trainer; the
 * *Geen trainer* column and a former trainer's (who cannot be picked) have none to fill in, and in
 * the week a column is a day.
 */
export function slotTrainerId({
  view,
  columnKey,
  former,
}: {
  view: string;
  columnKey: string;
  former: ReadonlyArray<{ id: string }>;
}): string | undefined {
  if (view !== 'day' || columnKey === NO_TRAINER) return undefined;
  return former.some(({ id }) => id === columnKey) ? undefined : columnKey;
}
