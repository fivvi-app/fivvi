import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  filterItems,
  filtersKey,
  NO_TRAINER,
  readFilters,
  writeFilters,
} from './calendar-filters';

// F014 AC3 (spec #458, ticket #529): the filters of the workspace calendar are kept in this
// browser, per account and workspace, and are read defensively.
const item = (
  type: 'private' | 'group',
  trainerId?: string,
  status: 'scheduled' | 'cancelled' = 'scheduled',
) => ({
  type,
  status,
  ...(trainerId ? { trainer: { id: trainerId, name: trainerId } } : {}),
});

describe('F014 AC3: the filters of the workspace calendar', () => {
  const lisa = item('private', 'tom');
  const mark = item('private', 'sarah');
  const kracht = item('group', 'sarah');
  const boxing = item('group');
  const cancelled = item('group', 'sarah', 'cancelled');
  const all = [mark, kracht, boxing, lisa, cancelled];

  it('shows everything by default', () => {
    expect(filterItems(all, DEFAULT_FILTERS)).toEqual(all);
  });

  it('with Tom alone only Lisa remains: a session with no trainer matches no trainer', () => {
    const only = { ...DEFAULT_FILTERS, hiddenTrainerIds: ['sarah', NO_TRAINER] };
    expect(filterItems(all, only)).toEqual([lisa]);
  });

  it('with only Groepsles the class dates remain, and Geannuleerde tonen off hides the cancelled one', () => {
    const groups = { ...DEFAULT_FILTERS, hiddenTypes: ['private' as const] };
    expect(filterItems(all, groups)).toEqual([kracht, boxing, cancelled]);
    expect(filterItems(all, { ...groups, showCancelled: false })).toEqual([kracht, boxing]);
  });

  it('is remembered per account and workspace, and anything else is the default', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const mine = filtersKey('account-1', 'workspace-1');
    const filters = {
      hiddenTrainerIds: ['tom'],
      hiddenTypes: ['group' as const],
      showCancelled: false,
    };
    writeFilters(storage, mine, filters);
    expect(readFilters(storage, mine)).toEqual(filters);
    expect(readFilters(storage, filtersKey('account-2', 'workspace-1'))).toEqual(DEFAULT_FILTERS);
    expect(readFilters(storage, filtersKey('account-1', 'workspace-2'))).toEqual(DEFAULT_FILTERS);
    store.set(mine, '{"hiddenTypes":["open_gym",3],"showCancelled":"no"}');
    expect(readFilters(storage, mine)).toEqual(DEFAULT_FILTERS);
    store.set(mine, 'not json');
    expect(readFilters(storage, mine)).toEqual(DEFAULT_FILTERS);
  });
});
