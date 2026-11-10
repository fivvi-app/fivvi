// The arithmetic of an invoice (F059, spec #474): prices are stored including VAT, so the amount
// excluding VAT is derived, rounded half up, and the VAT is the difference. Integers in cents and
// rates in basis points only (2100 is 21 %); pure rules, no I/O.

/** The amount of a line split into the amount excluding VAT, the VAT and the amount including VAT. */
export interface VatSplit {
  readonly exclCents: number;
  readonly vatCents: number;
  readonly inclCents: number;
}

/** A line with a VAT rate. */
export interface VatLine extends VatSplit {
  readonly vatExempt: false;
  readonly rateBp: number;
}

/** A line of a workspace that charges no VAT (*Ik reken geen btw*): no rate, no VAT, only the amount. */
export interface ExemptLine {
  readonly vatExempt: true;
  readonly inclCents: number;
}

export type InvoiceLine = VatLine | ExemptLine;

export type InvoiceTotals =
  | {
      readonly vatExempt: false;
      readonly exclCents: number;
      readonly vatCents: number;
      readonly inclCents: number;
    }
  | { readonly vatExempt: true; readonly inclCents: number };

// Keeps amount × 10000 an exact integer.
const MAX_AMOUNT_CENTS = Math.floor(Number.MAX_SAFE_INTEGER / 20000);

function assertAmount(inclCents: number): void {
  if (!Number.isInteger(inclCents) || Math.abs(inclCents) > MAX_AMOUNT_CENTS) {
    throw new RangeError('An invoice amount is a whole number of cents');
  }
}

/**
 * Splits `inclCents` (negative for a credit note) at `rateBp` basis points: the amount excluding
 * VAT is `incl × 10000 / (10000 + rate)` rounded half up, the VAT is the rest. A negative amount
 * mirrors the positive one exactly (the tie goes away from zero), so a credit note of an invoice's
 * full amount cancels it to the cent.
 */
export function splitVat(inclCents: number, rateBp: number): VatSplit {
  assertAmount(inclCents);
  if (!Number.isInteger(rateBp) || rateBp < 0) {
    throw new RangeError('A VAT rate is a whole number of basis points');
  }
  const sign = inclCents < 0 ? -1 : 1;
  const numerator = Math.abs(inclCents) * 10000;
  const divisor = 10000 + rateBp;
  // `+ 0` keeps a rounded-away amount at 0, not -0.
  const exclCents = sign * Math.floor((2 * numerator + divisor) / (2 * divisor)) + 0;
  return { exclCents, vatCents: inclCents - exclCents, inclCents };
}

/** A line of `inclCents` at `rateBp`, or without a rate or VAT when `rateBp` is `null`. */
export function invoiceLine(inclCents: number, rateBp: number | null): InvoiceLine {
  if (rateBp === null) {
    assertAmount(inclCents);
    return { vatExempt: true, inclCents };
  }
  return { vatExempt: false, rateBp, ...splitVat(inclCents, rateBp) };
}

/** The totals of an invoice: the sums of its lines; without VAT only the amount. */
export function invoiceTotals(lines: readonly InvoiceLine[]): InvoiceTotals {
  if (lines.length === 0) throw new RangeError('An invoice has at least one line');
  const exempt = lines.filter((line) => line.vatExempt).length;
  if (exempt !== 0 && exempt !== lines.length) {
    throw new RangeError('An invoice has lines either all with or all without VAT');
  }
  const inclCents = lines.reduce((sum, line) => sum + line.inclCents, 0);
  if (exempt > 0) return { vatExempt: true, inclCents };
  let exclCents = 0;
  let vatCents = 0;
  for (const line of lines) {
    if (line.vatExempt) continue;
    exclCents += line.exclCents;
    vatCents += line.vatCents;
  }
  return { vatExempt: false, exclCents, vatCents, inclCents };
}
