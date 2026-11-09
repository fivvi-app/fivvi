import { describe, expect, it } from 'vitest';
import {
  type BudgetRow,
  budgetFailures,
  budgetsTarget,
  MAX_CLS,
  MAX_LCP_MS,
  summarizeBudgets,
} from './budgets';

const row = (overrides: Partial<BudgetRow> = {}): BudgetRow => ({
  locale: 'en',
  scheme: 'light',
  path: '/en',
  lcpMs: 1800,
  cls: 0,
  seo: 1,
  accessibility: 1,
  imageFindings: [],
  attempts: 1,
  runsLcpMs: [1800],
  benchmarkIndex: 2265,
  cpuSlowdownMultiplier: 7.1,
  ...overrides,
});

// F064 AC15: the budgets run against the local build or against a deployed preview, and the result
// is a short table to paste on the PR.
describe('F064 budgetsTarget', () => {
  it('runs against the local servers when no address is given', () => {
    expect(budgetsTarget(undefined)).toBeUndefined();
    expect(budgetsTarget('')).toBeUndefined();
    expect(budgetsTarget('   ')).toBeUndefined();
  });

  it('takes the origin of the address, whatever follows it', () => {
    expect(budgetsTarget('https://web-fivvi-pr-663.up.railway.app')).toBe(
      'https://web-fivvi-pr-663.up.railway.app',
    );
    expect(budgetsTarget(' https://web-fivvi-pr-663.up.railway.app/en/gyms?x=1 ')).toBe(
      'https://web-fivvi-pr-663.up.railway.app',
    );
    expect(budgetsTarget('http://localhost:3880/')).toBe('http://localhost:3880');
  });

  it.each(['web-fivvi-pr-663.up.railway.app', 'ftp://example.com', 'not a url'])(
    'refuses %s, so a typo does not become a local run',
    (value) => {
      expect(() => budgetsTarget(value)).toThrow(/BUDGETS_BASE_URL/);
    },
  );
});

describe('F064 budgetFailures', () => {
  it('passes a page inside every budget', () => {
    expect(budgetFailures(row())).toEqual([]);
  });

  it('keeps the budgets of AC15: LCP under 2.5 s, CLS under 0.1, SEO and accessibility 100', () => {
    expect(MAX_LCP_MS).toBe(2500);
    expect(MAX_CLS).toBe(0.1);
    expect(budgetFailures(row({ lcpMs: 2499 }))).toEqual([]);
    expect(budgetFailures(row({ lcpMs: 2500 }))).toEqual(['LCP']);
    expect(budgetFailures(row({ cls: 0.1 }))).toEqual(['CLS']);
    expect(budgetFailures(row({ seo: 0.92 }))).toEqual(['SEO']);
    expect(budgetFailures(row({ accessibility: 0.98 }))).toEqual(['accessibility']);
    expect(budgetFailures(row({ imageFindings: ['unsized-images'] }))).toEqual(['images']);
  });

  it('names every budget that is over', () => {
    expect(budgetFailures(row({ lcpMs: 3000, seo: 0.9 }))).toEqual(['LCP', 'SEO']);
  });

  it('fails a page whose numbers are missing, never passes it', () => {
    expect(budgetFailures(row({ lcpMs: Number.NaN, cls: Number.NaN }))).toEqual(['LCP', 'CLS']);
  });
});

describe('F064 summarizeBudgets', () => {
  const rows = [
    row({ path: '/en', lcpMs: 1801.4 }),
    row({ path: '/en', scheme: 'dark', lcpMs: 2650, attempts: 3, runsLcpMs: [2800, 2650, 2700] }),
    row({ path: '/en/gyms', cls: 0.0123, seo: 0.9 }),
  ];
  const summary = summarizeBudgets({
    target: 'https://web-fivvi-pr-663.up.railway.app',
    rows,
  });

  it('says what it measured and against what', () => {
    expect(summary).toContain('https://web-fivvi-pr-663.up.railway.app');
    expect(summary).toContain('LCP < 2.5 s');
    expect(summary).toContain('CLS < 0.1');
  });

  it('has one line per page and scheme, with its numbers and its verdict', () => {
    const lines = summary.split('\n').filter((line) => line.startsWith('| /'));
    expect(lines).toEqual([
      '| /en | light | 1801 ms | 0.000 | 100 | 100 | pass |',
      '| /en | dark | 2650 ms (best of 3) | 0.000 | 100 | 100 | fail (LCP) |',
      '| /en/gyms | light | 1800 ms | 0.012 | 90 | 100 | fail (SEO) |',
    ]);
  });

  it('gives the benchmarkIndex and the multiplier of the host, as the range of the runs', () => {
    expect(summary).toContain('benchmarkIndex 2265');
    expect(summary).toContain('cpuSlowdownMultiplier 7.1');
    const mixed = summarizeBudgets({
      target: undefined,
      rows: [row({ benchmarkIndex: 1578, cpuSlowdownMultiplier: 4.2 }), row()],
    });
    expect(mixed).toContain('benchmarkIndex 1578 to 2265');
    expect(mixed).toContain('cpuSlowdownMultiplier 4.2 to 7.1');
  });

  it('counts the pages over budget, and says when none is', () => {
    expect(summary).toContain('2 of 3 over budget');
    expect(summarizeBudgets({ target: undefined, rows: [row()] })).toContain('all 1 within budget');
  });

  it('names the local build when there is no address', () => {
    expect(summarizeBudgets({ target: undefined, rows: [row()] })).toContain('the local build');
  });
});
