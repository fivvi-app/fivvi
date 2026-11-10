import { describe, expect, it } from 'vitest';
import { type CountComparison, compareCounts, countsPass, formatCounts } from './restore.ts';

describe('E016 comparing row counts', () => {
  const count = (table: string, rows: number, changedAfter = 0) => ({ table, rows, changedAfter });

  it('AC2: equal counts match', () => {
    const result = compareCounts([count('public.clients', 3)], [count('public.clients', 3)]);

    expect(result.map((entry) => entry.status)).toEqual(['match']);
    expect(countsPass(result)).toBe(true);
  });

  it('AC2: allows the difference of the rows changed after the point, and no more', () => {
    const source = [count('public.sessions', 10, 2), count('public.clients', 10, 2)];
    const restored = [count('public.sessions', 8), count('public.clients', 7)];

    const result = compareCounts(source, restored);

    expect(result.map((entry) => [entry.table, entry.status])).toEqual([
      ['public.clients', 'differs'],
      ['public.sessions', 'within-changes'],
    ]);
    expect(countsPass(result)).toBe(false);
  });

  it('AC2: a table in one database only is a difference', () => {
    const result = compareCounts([count('public.a', 1)], [count('public.b', 1)]);

    expect(result.map((entry) => [entry.table, entry.status])).toEqual([
      ['public.a', 'missing-in-restored'],
      ['public.b', 'missing-in-source'],
    ]);
    expect(countsPass(result)).toBe(false);
  });

  it('AC4: prints table names and numbers only', () => {
    const lines = formatCounts(compareCounts([count('public.a', 4, 1)], [count('public.a', 3)]), {
      source: 'production',
      restored: 'postgres-drill',
    });

    expect(lines).toEqual([
      'table | production | postgres-drill | changed after the point | result',
      'public.a | 4 | 3 | 1 | within-changes',
    ]);
  });

  it('prints a dash for a missing count', () => {
    const missing: CountComparison[] = [
      {
        table: 'public.a',
        source: 1,
        restored: undefined,
        changedAfter: 0,
        status: 'missing-in-restored',
      },
    ];

    expect(formatCounts(missing, { source: 's', restored: 'r' })[1]).toBe(
      'public.a | 1 | - | 0 | missing-in-restored',
    );
  });
});
