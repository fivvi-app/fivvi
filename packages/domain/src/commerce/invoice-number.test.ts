import { describe, expect, it } from 'vitest';
import { formatInvoiceNumber, invoiceYear, nextInvoiceNumber } from './invoice-number.ts';

describe('F059 invoice number', () => {
  it('formats the year and the number padded to four digits', () => {
    expect(formatInvoiceNumber(2027, 1)).toBe('2027-0001');
    expect(formatInvoiceNumber(2028, 1)).toBe('2028-0001');
    expect(formatInvoiceNumber(2027, 42)).toBe('2027-0042');
    expect(formatInvoiceNumber(2027, 9999)).toBe('2027-9999');
  });

  it('keeps every digit of a number past 9999', () => {
    expect(formatInvoiceNumber(2027, 10000)).toBe('2027-10000');
  });

  it('refuses a number that is no positive whole number', () => {
    expect(() => formatInvoiceNumber(2027, 0)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(2027, -1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(2027, 1.5)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(27, 1)).toThrow(RangeError);
  });

  it('AC8: 31 December 2027 23:59 and 1 January 2028 00:01 (Europe/Amsterdam) are in 2027 and 2028', () => {
    // 23:59 CET is 22:59 UTC; 00:01 CET is 23:01 UTC the evening before.
    const lastMinute = new Date('2027-12-31T22:59:00Z');
    const firstMinute = new Date('2027-12-31T23:01:00Z');
    expect(invoiceYear(lastMinute, 'Europe/Amsterdam')).toBe(2027);
    expect(invoiceYear(firstMinute, 'Europe/Amsterdam')).toBe(2028);
    expect(formatInvoiceNumber(invoiceYear(firstMinute, 'Europe/Amsterdam'), 1)).toBe('2028-0001');
  });

  it('AC8: the year follows the workspace time zone, Europe/Amsterdam by default', () => {
    const instant = new Date('2027-12-31T23:01:00Z');
    expect(invoiceYear(instant)).toBe(2028);
    expect(invoiceYear(instant, 'UTC')).toBe(2027);
    expect(invoiceYear(instant, 'America/New_York')).toBe(2027);
    expect(invoiceYear(new Date('2027-12-31T23:01:00Z'), 'Pacific/Auckland')).toBe(2028);
  });

  it('refuses an invalid date', () => {
    expect(() => invoiceYear(new Date(Number.NaN))).toThrow(RangeError);
  });

  it('AC8: the first invoice of a year is number 1, the next one follows the last', () => {
    const first = new Date('2027-12-31T22:59:00Z');
    expect(nextInvoiceNumber({ issuedAt: first, lastSequence: null })).toEqual({
      year: 2027,
      sequence: 1,
      number: '2027-0001',
    });
    expect(nextInvoiceNumber({ issuedAt: first, lastSequence: 41 })).toEqual({
      year: 2027,
      sequence: 42,
      number: '2027-0042',
    });
  });

  it('AC8: after the last invoice of 2027 the first of 2028 restarts at 1', () => {
    // lastSequence is that of the invoice's own year: the series of 2028 has none yet.
    expect(
      nextInvoiceNumber({ issuedAt: new Date('2027-12-31T23:01:00Z'), lastSequence: null }),
    ).toEqual({ year: 2028, sequence: 1, number: '2028-0001' });
  });

  it('refuses a last number that is no whole number from 0', () => {
    const issuedAt = new Date('2027-02-01T09:00:00Z');
    expect(() => nextInvoiceNumber({ issuedAt, lastSequence: -1 })).toThrow(RangeError);
    expect(() => nextInvoiceNumber({ issuedAt, lastSequence: 1.5 })).toThrow(RangeError);
  });
});
