import type { Schemas } from '@fivvi/contract';

type Item = Schemas['WorkspaceCalendarSession'];

/** What the calendar's filters switch off, so a trainer who joins later is shown (F014, AC3). */
export interface WorkspaceFilters {
  /** Team-member IDs of the trainers switched off, and `NO_TRAINER` for *Geen trainer*. */
  readonly hiddenTrainerIds: readonly string[];
  readonly hiddenTypes: readonly ('private' | 'group')[];
  /** *Geannuleerde tonen*: on by default. */
  readonly showCancelled: boolean;
}

/** The entry of *Trainers* for sessions without a trainer (*Trainer nodig*). */
export const NO_TRAINER = 'none';

export const DEFAULT_FILTERS: WorkspaceFilters = {
  hiddenTrainerIds: [],
  hiddenTypes: [],
  showCancelled: true,
};

/** Where this browser remembers the filters: per account and workspace (spec #458, Filters). */
export const filtersKey = (accountId: string, workspaceId: string) =>
  `fivvi.calendar.filters.${accountId}.${workspaceId}`;

/** The sessions the filters leave, in their order. Open Gym comes later, so it is never shown. */
export function filterItems<
  T extends Pick<Item, 'status'> & { type: string; trainer?: { id: string } },
>(items: readonly T[], filters: WorkspaceFilters): T[] {
  return items.filter(
    (item) =>
      (item.type === 'private' || item.type === 'group') &&
      !filters.hiddenTypes.includes(item.type) &&
      !filters.hiddenTrainerIds.includes(item.trainer?.id ?? NO_TRAINER) &&
      (filters.showCancelled || item.status !== 'cancelled'),
  );
}

/** The filters a browser stored, read defensively: anything but what `writeFilters` wrote is the default. */
export function readFilters(
  storage: Pick<Storage, 'getItem'> | undefined,
  key: string,
): WorkspaceFilters {
  try {
    const value = JSON.parse(storage?.getItem(key) ?? 'null') as Partial<
      Record<keyof WorkspaceFilters, unknown>
    > | null;
    if (!value || typeof value !== 'object') return DEFAULT_FILTERS;
    const list = (raw: unknown): string[] | undefined =>
      Array.isArray(raw) && raw.every((entry) => typeof entry === 'string') ? raw : undefined;
    const types = list(value.hiddenTypes);
    const trainers = list(value.hiddenTrainerIds);
    if (
      !types?.every((type) => type === 'private' || type === 'group') ||
      !trainers ||
      typeof value.showCancelled !== 'boolean'
    ) {
      return DEFAULT_FILTERS;
    }
    return {
      hiddenTrainerIds: trainers,
      hiddenTypes: types as WorkspaceFilters['hiddenTypes'],
      showCancelled: value.showCancelled,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

/** Remembers the filters; a browser that refuses (storage full or blocked) simply forgets. */
export function writeFilters(
  storage: Pick<Storage, 'setItem'> | undefined,
  key: string,
  filters: WorkspaceFilters,
): void {
  try {
    storage?.setItem(key, JSON.stringify(filters));
  } catch {
    // Remembering is a courtesy.
  }
}
