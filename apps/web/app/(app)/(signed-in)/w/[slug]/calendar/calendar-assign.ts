import { assignKind } from '../sessions/trainer-dialog-model';
import { NO_TRAINER } from './calendar-filters';
import type { CalendarItem } from './quick-view';

/**
 * WC-03 (F023): the trainer a drop asks for. Dragging a block to another trainer's column of the
 * day view asks to assign that trainer: CO-02 with them chosen (a class date), or *Trainer
 * wijzigen* (a private session). Only the Owner (`session.assign`) does it, only onto a trainer of
 * the workspace (not *Geen trainer*, not a trainer who was removed), only to another column, and
 * only for a block the dialog is offered for (`assignKind`). The week view's columns are days: a
 * drop there is a move (WC-07), not an assignment. Nothing is decided here beyond that: the
 * dialog asks the API, which checks every rule.
 */
export function assignTargetOf({
  view,
  item,
  fromColumnKey,
  toColumnKey,
  trainers,
  canAssign,
}: {
  view: string;
  item: Pick<CalendarItem, 'type' | 'status' | 'trainer' | 'series'>;
  fromColumnKey: string;
  toColumnKey: string;
  /** The workspace's trainers: the columns that can take a block. */
  trainers: readonly { id: string }[];
  canAssign: boolean;
}): string | undefined {
  if (!canAssign || view !== 'day') return undefined;
  if (toColumnKey === fromColumnKey || toColumnKey === NO_TRAINER) return undefined;
  if (!trainers.some(({ id }) => id === toColumnKey)) return undefined;
  return assignKind(item) ? toColumnKey : undefined;
}
