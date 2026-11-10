// The number of an invoice or credit note (F059, spec #474, open question 1): `{year}-{number}`,
// e.g. `2027-0001`, one series per workspace restarting at 1 each calendar year. The format is a
// proposal the owner may change: it lives in `formatInvoiceNumber` alone.

import { localDateOf } from '../scheduling/zoned-time.ts';
import { WORKSPACE_DEFAULTS } from '../workspaces/defaults.ts';

const NUMBER_DIGITS = 4;

/** The number as printed: the year, a hyphen and the sequence padded to four digits. */
export function formatInvoiceNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError('An invoice year has four digits');
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError('An invoice sequence is a whole number from 1');
  }
  return `${year}-${String(sequence).padStart(NUMBER_DIGITS, '0')}`;
}

/** The calendar year of `issuedAt` on the wall clock of the workspace's time zone. */
export function invoiceYear(
  issuedAt: Date,
  timeZone: string = WORKSPACE_DEFAULTS.timeZone,
): number {
  if (Number.isNaN(issuedAt.getTime())) throw new RangeError('The invoice date is not a date');
  return Number(localDateOf(issuedAt, timeZone).slice(0, 4));
}

export interface NextInvoiceNumberFacts {
  /** The moment the invoice is issued (the paid date for an invoice). */
  readonly issuedAt: Date;
  /** The workspace's IANA time zone; Europe/Amsterdam by default. */
  readonly timeZone?: string;
  /** The last sequence taken in the series of the invoice's year, or `null` when it has none yet. */
  readonly lastSequence: number | null;
}

/**
 * The number after the last one of the invoice's year: the year follows the invoice date in the
 * workspace's time zone, and a year without an invoice starts at 1. The caller reads
 * `lastSequence` from the year's series row it holds locked in the transaction that stores the
 * invoice, so numbers never skip or repeat.
 */
export function nextInvoiceNumber(facts: NextInvoiceNumberFacts): {
  readonly year: number;
  readonly sequence: number;
  readonly number: string;
} {
  const { lastSequence } = facts;
  if (lastSequence !== null && (!Number.isInteger(lastSequence) || lastSequence < 0)) {
    throw new RangeError('The last invoice sequence is a whole number from 0');
  }
  const year = invoiceYear(facts.issuedAt, facts.timeZone);
  const sequence = (lastSequence ?? 0) + 1;
  return { year, sequence, number: formatInvoiceNumber(year, sequence) };
}
