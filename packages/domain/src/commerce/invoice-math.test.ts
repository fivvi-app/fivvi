import { describe, expect, it } from 'vitest';
import { invoiceLine, invoiceTotals, splitVat } from './invoice-math.ts';

describe('F059 invoice VAT arithmetic', () => {
  it('AC3: € 79,00 at 21 % is € 65,29 excluding VAT and € 13,71 VAT', () => {
    expect(splitVat(7900, 2100)).toEqual({ exclCents: 6529, vatCents: 1371, inclCents: 7900 });
  });

  it.each([
    [7900, 2100, 6529, 1371],
    [7900, 900, 7248, 652],
    [1, 2100, 1, 0],
    [100, 2100, 83, 17],
    [10000, 2100, 8264, 1736],
    [10000, 900, 9174, 826],
    [4950, 2100, 4091, 859],
    [0, 2100, 0, 0],
    [7900, 0, 7900, 0],
  ])('AC3: %i cents at %i basis points is %i excluding VAT and %i VAT', (incl, rate, excl, vat) => {
    expect(splitVat(incl, rate)).toEqual({ exclCents: excl, vatCents: vat, inclCents: incl });
  });

  it.each([2100, 900])(
    'AC3: at %i basis points every amount rounds to the nearest cent',
    (rate) => {
      const divisor = 10000 + rate;
      const wrong: number[] = [];
      for (let incl = 0; incl <= 25000; incl += 1) {
        const { exclCents, vatCents } = splitVat(incl, rate);
        // exclCents is the nearest whole cent to incl × 10000 / divisor; a tie goes up.
        const twiceError = 2 * (exclCents * divisor - incl * 10000);
        if (exclCents + vatCents !== incl || twiceError > divisor || twiceError <= -divisor) {
          wrong.push(incl);
        }
      }
      expect(wrong).toEqual([]);
    },
  );

  it('rounds half up: one cent at 100 % is one cent excluding VAT', () => {
    expect(splitVat(1, 10000)).toEqual({ exclCents: 1, vatCents: 0, inclCents: 1 });
    expect(splitVat(3, 10000)).toEqual({ exclCents: 2, vatCents: 1, inclCents: 3 });
  });

  it('AC9: a credit note of € 20,00 at 21 % is − € 16,53 excluding VAT and − € 3,47 VAT', () => {
    expect(splitVat(-2000, 2100)).toEqual({ exclCents: -1653, vatCents: -347, inclCents: -2000 });
  });

  it('AC9: a credit note mirrors the invoice amount exactly, ties included', () => {
    const wrong: string[] = [];
    for (const rate of [2100, 900, 10000, 30000]) {
      for (let incl = 1; incl <= 3000; incl += 1) {
        const invoice = splitVat(incl, rate);
        const credit = splitVat(-incl, rate);
        if (
          credit.exclCents !== 0 - invoice.exclCents ||
          credit.vatCents !== 0 - invoice.vatCents ||
          credit.inclCents !== -incl
        ) {
          wrong.push(`${incl} at ${rate}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('refuses amounts and rates that are no whole numbers', () => {
    expect(() => splitVat(79.5, 2100)).toThrow(RangeError);
    expect(() => splitVat(Number.NaN, 2100)).toThrow(RangeError);
    expect(() => splitVat(7900, 21.5)).toThrow(RangeError);
    expect(() => splitVat(7900, -100)).toThrow(RangeError);
    expect(() => splitVat(Number.MAX_SAFE_INTEGER, 2100)).toThrow(RangeError);
  });
});

describe('F059 invoice lines and totals', () => {
  it('AC3: a line with a rate carries the rate, the amount excluding VAT, the VAT and the total', () => {
    expect(invoiceLine(7900, 2100)).toEqual({
      vatExempt: false,
      rateBp: 2100,
      exclCents: 6529,
      vatCents: 1371,
      inclCents: 7900,
    });
  });

  it('AC3: the totals are the sums of the lines', () => {
    const lines = [
      invoiceLine(7900, 2100),
      invoiceLine(4950, 900),
      invoiceLine(100, 2100),
      invoiceLine(333, 900),
    ];
    const totals = invoiceTotals(lines);
    expect(totals).toEqual({
      vatExempt: false,
      exclCents: lines.reduce((sum, line) => sum + (line.vatExempt ? 0 : line.exclCents), 0),
      vatCents: lines.reduce((sum, line) => sum + (line.vatExempt ? 0 : line.vatCents), 0),
      inclCents: 7900 + 4950 + 100 + 333,
    });
    if (totals.vatExempt) throw new Error('expected a VAT total');
    expect(totals.exclCents + totals.vatCents).toBe(totals.inclCents);
  });

  it('AC9: the totals of a credit note line are negative', () => {
    expect(invoiceTotals([invoiceLine(-2000, 2100)])).toEqual({
      vatExempt: false,
      exclCents: -1653,
      vatCents: -347,
      inclCents: -2000,
    });
  });

  it('without VAT a line has no rate and no VAT, only the amount', () => {
    expect(invoiceLine(7900, null)).toEqual({ vatExempt: true, inclCents: 7900 });
    expect(invoiceLine(-2000, null)).toEqual({ vatExempt: true, inclCents: -2000 });
  });

  it('without VAT the totals show only the amount, marked VAT exempt', () => {
    expect(invoiceTotals([invoiceLine(7900, null), invoiceLine(2500, null)])).toEqual({
      vatExempt: true,
      inclCents: 10400,
    });
  });

  it('refuses a invoice with no lines or lines with and without VAT', () => {
    expect(() => invoiceTotals([])).toThrow(RangeError);
    expect(() => invoiceTotals([invoiceLine(7900, 2100), invoiceLine(2500, null)])).toThrow(
      RangeError,
    );
  });
});
