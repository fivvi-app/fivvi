// Module: importing a settlement from the provider into the payouts of a workspace.
// Spec: #496 (F061), ticket #1163; AC5, and the storage half of AC1, AC2 and AC6.
//
// `importSettlement` is idempotent: the same settlement and lines imported twice store each once
// (a payout is unique on the settlement ID, a line on its identity within the payout). A
// settlement whose status moved (open → paidout) appends a status line and moves the payout, and
// never touches the lines it has: a line is only ever added. Every line is stored unmatched here;
// matching a line to Fivvi's payment, refund or reversal, and the summary of a payout, come with
// the next tickets of F061. Amounts are signed integers in euro cents.

import type { StatusSource } from '../payments/ledger.ts';
import type { ProviderSettlement, ProviderSettlementLine } from '../payments/provider.ts';
import {
  type NewPayoutLine,
  PAYOUT_FEE_KINDS,
  PAYOUT_LINE_TYPES,
  type PayoutLedger,
} from './payout-ledger.ts';
import { decidePayoutStatusChange, PAYOUT_STATUSES } from './payout-status.ts';

export type InvalidSettlementField = 'settlement' | 'line';

/** The provider's settlement or one of its lines is not something the payouts can hold; nothing was written. */
export class InvalidSettlementError extends Error {
  readonly field: InvalidSettlementField;

  constructor(field: InvalidSettlementField, message: string) {
    super(message);
    this.name = 'InvalidSettlementError';
    this.field = field;
  }
}

export interface SettlementImport {
  readonly settlement: ProviderSettlement;
  readonly lines: readonly ProviderSettlementLine[];
  /** When the settlement was fetched from the provider. */
  readonly fetchedAt: Date;
  /** Who fetched it: the daily job or the owner's refresh (`fetch`). */
  readonly source: StatusSource;
}

export interface ImportedSettlement {
  readonly payoutId: string;
  /** The payout was stored by this import. */
  readonly created: boolean;
  /** The payout moved to the settlement's status and a status line was appended. */
  readonly statusChanged: boolean;
  /** How many lines this import stored; the ones already there are not counted. */
  readonly linesAdded: number;
}

function validate(input: SettlementImport): NewPayoutLine[] {
  const { settlement } = input;
  if (settlement.id.trim() === '') {
    throw new InvalidSettlementError('settlement', 'A settlement has an ID.');
  }
  if (!Number.isInteger(settlement.amountCents)) {
    throw new InvalidSettlementError('settlement', 'A settlement amount is whole euro cents.');
  }
  if (!PAYOUT_STATUSES.includes(settlement.status)) {
    throw new InvalidSettlementError('settlement', 'A settlement has one of the known statuses.');
  }
  return input.lines.map((line) => {
    if (line.settlementId !== settlement.id) {
      throw new InvalidSettlementError(
        'line',
        'A line belongs to the settlement it is imported with.',
      );
    }
    if (line.id.trim() === '') {
      throw new InvalidSettlementError('line', 'A line has an identity.');
    }
    if (!Number.isInteger(line.amountCents)) {
      throw new InvalidSettlementError('line', 'A line amount is whole euro cents.');
    }
    if (!PAYOUT_LINE_TYPES.includes(line.type)) {
      throw new InvalidSettlementError('line', 'A line has one of the known types.');
    }
    if ((line.type === 'fee') !== (line.feeKind !== null)) {
      throw new InvalidSettlementError('line', 'A fee line, and only a fee line, has a fee kind.');
    }
    if (line.feeKind !== null && !PAYOUT_FEE_KINDS.includes(line.feeKind)) {
      throw new InvalidSettlementError('line', 'A fee line has one of the known fee kinds.');
    }
    if (line.count !== null && line.type !== 'fee') {
      throw new InvalidSettlementError('line', 'Only a fee line has a count.');
    }
    if (line.count !== null && (!Number.isInteger(line.count) || line.count < 1)) {
      throw new InvalidSettlementError('line', 'A count is a whole number above zero.');
    }
    return {
      providerLineId: line.id,
      type: line.type,
      feeKind: line.feeKind,
      amountCents: line.amountCents,
      description: line.description,
      count: line.count,
    };
  });
}

/** Stores a settlement and its lines; idempotent, see the module header. */
export async function importSettlement(
  ledger: PayoutLedger,
  input: SettlementImport,
): Promise<ImportedSettlement> {
  const lines = validate(input);
  const { settlement, fetchedAt, source } = input;

  const { payout, created } = await ledger.insertPayout({
    providerSettlementId: settlement.id,
    reference: settlement.reference,
    settledAt: settlement.settledAt,
    amountCents: settlement.amountCents,
    status: settlement.status,
    fetchedAt,
    source,
  });

  let statusChanged = false;
  if (!created) {
    const refreshed = await ledger.refreshPayout(payout.id, {
      reference: settlement.reference,
      settledAt: settlement.settledAt,
      amountCents: settlement.amountCents,
      fetchedAt,
    });
    const decision = decidePayoutStatusChange(refreshed.status, settlement.status);
    if (decision.kind === 'apply') {
      statusChanged = await ledger.recordPayoutStatusChange({
        payoutId: payout.id,
        from: decision.from,
        to: decision.to,
        occurredAt: fetchedAt,
        source,
      });
    }
  }

  const linesAdded = await ledger.insertPayoutLines(payout.id, lines);
  return { payoutId: payout.id, created, statusChanged, linesAdded };
}
