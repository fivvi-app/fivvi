import type { CalendarFilters } from '@fivvi/domain/calendar-grid';

/** Where this browser remembers the filters of *Mijn agenda* (F013: "remembered per browser"). */
export const FILTERS_KEY = 'fivvi.my-calendar.filters';

/** Nothing switched off, the cancelled ones shown. */
export const DEFAULT_FILTERS: CalendarFilters = {
  hiddenTypes: [],
  hiddenWorkspaceIds: [],
  showCancelled: true,
};

const TYPES = ['private', 'group'] as const;

/**
 * The filters a browser stored, read defensively: anything that is not what `writeFilters` wrote
 * (another version, a hand-edited value, nothing) is the default.
 */
export function parseFilters(raw: string | null): CalendarFilters {
  if (!raw) return DEFAULT_FILTERS;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof CalendarFilters, unknown>> | null;
    if (!value || typeof value !== 'object') return DEFAULT_FILTERS;
    const strings = (list: unknown): string[] =>
      Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
    return {
      hiddenTypes: strings(value.hiddenTypes).filter((type): type is (typeof TYPES)[number] =>
        (TYPES as readonly string[]).includes(type),
      ),
      hiddenWorkspaceIds: strings(value.hiddenWorkspaceIds),
      showCancelled: value.showCancelled !== false,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

/** Reads the stored filters; the default when the browser has none or won't say (private mode). */
export function readFilters(storage: Pick<Storage, 'getItem'> | undefined): CalendarFilters {
  try {
    return parseFilters(storage?.getItem(FILTERS_KEY) ?? null);
  } catch {
    return DEFAULT_FILTERS;
  }
}

/** Remembers the filters; a browser that refuses (storage full or blocked) simply forgets. */
export function writeFilters(
  storage: Pick<Storage, 'setItem'> | undefined,
  filters: CalendarFilters,
): void {
  try {
    storage?.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // Remembering is a courtesy.
  }
}
