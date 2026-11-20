import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  FILTERS_KEY,
  parseFilters,
  readFilters,
  writeFilters,
} from './calendar-filters';

// F013 AC10: the filters of *Mijn agenda* are remembered per browser.
describe('F013 the filters a browser remembers', () => {
  it('starts with nothing switched off and the cancelled shown', () => {
    expect(parseFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(DEFAULT_FILTERS.showCancelled).toBe(true);
  });

  it('reads back what it wrote', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const filters = {
      hiddenTypes: ['private' as const],
      hiddenWorkspaceIds: ['gym'],
      showCancelled: false,
    };

    writeFilters(storage, filters);

    expect(store.has(FILTERS_KEY)).toBe(true);
    expect(readFilters(storage)).toEqual(filters);
  });

  it('takes the default for anything it did not write', () => {
    expect(parseFilters('not json')).toEqual(DEFAULT_FILTERS);
    expect(parseFilters('42')).toEqual(DEFAULT_FILTERS);
    expect(parseFilters('{"hiddenTypes":"private","showCancelled":"no"}')).toEqual(DEFAULT_FILTERS);
  });

  it('drops a type it does not know (Open Gym comes later) and keeps the rest', () => {
    expect(
      parseFilters(
        '{"hiddenTypes":["open_gym","group"],"hiddenWorkspaceIds":["a",3],"showCancelled":false}',
      ),
    ).toEqual({ hiddenTypes: ['group'], hiddenWorkspaceIds: ['a'], showCancelled: false });
  });

  it('reads and writes nothing, quietly, where the browser has no storage or refuses it', () => {
    expect(readFilters(undefined)).toEqual(DEFAULT_FILTERS);
    expect(
      readFilters({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toEqual(DEFAULT_FILTERS);
    expect(() =>
      writeFilters(
        {
          setItem: () => {
            throw new Error('full');
          },
        },
        DEFAULT_FILTERS,
      ),
    ).not.toThrow();
  });
});
