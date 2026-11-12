import type { PaymentEngine } from './create-payment.ts';
import type { StatusSource } from './ledger.ts';
import type { ProviderAccess, ProviderRefund, ProviderRefundStatus } from './provider.ts';
import type {
  ChargebackRecord,
  NewChargeback,
  RefundLedger,
  RefundRecord,
} from './refund-ledger.ts';
import { decideRefundStatusChange, refundStatusOfProvider } from './refund-status.ts';
import { refundableAmount } from './refundable.ts';

// Refunds and reversals (F060, spec #493, ticket #1141; AC9, AC10, AC13, ADR-020). A refund is
// bounded by the refundable amount of its payment, our row is written first, and our row's ID is
// the idempotency key and in the provider's metadata; a retry looks the refund up among the
// payment's refunds by that metadata before it creates one, so the money never moves twice,
// whatever fails. A status update is applied once, as an append-only line. The payment row is
// never edited by any of it.

/** What the refund rules run in: the payment engine and the refund ledger of its workspace. */
export interface RefundEngine extends PaymentEngine {
  readonly refunds: RefundLedger;
}

/** The longest internal reason; the same limit the table checks. */
export const REFUND_REASON_MAX_LENGTH = 500;

export type InvalidRefundField = 'amountCents' | 'reason' | 'providerChargebackId' | 'refund';

export class InvalidRefundError extends Error {
  readonly field: InvalidRefundField;

  constructor(field: InvalidRefundField, message: string) {
    super(message);
    this.name = 'InvalidRefundError';
    this.field = field;
  }
}

function validAmount(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents < 1) {
    throw new InvalidRefundError('amountCents', 'An amount is a whole number of cents above zero.');
  }
}

/** The text of a field that may be left empty: trimmed, `null` when nothing is left. */
function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export interface RefundRequest {
  readonly paymentId: string;
  readonly amountCents: number;
  /** Internal, for the Owner only (optional). Never sent to the provider. */
  readonly reason?: string | null;
  /** The Owner's choice to take back the credits of the payment. */
  readonly revokeCredits: boolean;
  /** The team member who asked. */
  readonly requestedByTeamMemberId: string;
}

export type RequestedRefund =
  | { readonly kind: 'requested'; readonly refund: RefundRecord }
  | {
      readonly kind: 'refused';
      /** `refund_exceeds_payment`: more than the refundable amount (a payment never paid has none). */
      readonly code: 'refund_exceeds_payment';
      readonly refundableCents: number;
    }
  | { readonly kind: 'refused'; readonly code: 'payment_not_found' };

const accessOf = (engine: RefundEngine): ProviderAccess => ({
  workspaceId: engine.workspaceId,
  testmode: engine.environment.testmode,
});

/** What can still be refunded of a payment, in cents; `undefined` for a payment that is not this workspace's. */
export async function refundableOf(
  engine: Pick<RefundEngine, 'refunds'>,
  paymentId: string,
): Promise<number | undefined> {
  const basis = await engine.refunds.refundBasis(paymentId);
  return basis ? refundableAmount(basis) : undefined;
}

/**
 * Asks for a refund. Bounded by the refundable amount: more is refused with
 * `refund_exceeds_payment` and nothing is written. Otherwise our row is written first (the check
 * and the write happen under one lock, so two requests at once cannot both pass), and then the
 * provider is asked once. Throws what the provider throws (`ProviderError`); the row stays, and
 * `submitRefund` picks up where this stopped.
 */
export async function requestRefund(
  engine: RefundEngine,
  request: RefundRequest,
): Promise<RequestedRefund> {
  validAmount(request.amountCents);
  const reason = optionalText(request.reason);
  if (reason !== null && reason.length > REFUND_REASON_MAX_LENGTH) {
    throw new InvalidRefundError(
      'reason',
      `A reason is at most ${REFUND_REASON_MAX_LENGTH} characters.`,
    );
  }

  const inserted = await engine.refunds.insertRefund(
    {
      paymentId: request.paymentId,
      amountCents: request.amountCents,
      reason,
      revokeCredits: request.revokeCredits,
      requestedByTeamMemberId: request.requestedByTeamMemberId,
      occurredAt: engine.now(),
    },
    (basis) => request.amountCents <= refundableAmount(basis),
  );
  if (inserted.kind === 'no_payment') return { kind: 'refused', code: 'payment_not_found' };
  if (inserted.kind === 'refused') {
    return {
      kind: 'refused',
      code: 'refund_exceeds_payment',
      refundableCents: refundableAmount(inserted.basis),
    };
  }
  // A row that was just written cannot be at the provider yet: no lookup on the first try.
  const refund = await send(engine, inserted.refund, false);
  return { kind: 'requested', refund };
}

/**
 * Sends a refund whose row exists to the provider, once: a retry after a lost response, a failure
 * or a token refresh. It first looks the refund up among the payment's refunds at the provider by
 * our metadata and creates one only when there is none. A refund that is linked is left alone.
 */
export async function submitRefund(engine: RefundEngine, refundId: string): Promise<RefundRecord> {
  const refund = await engine.refunds.findRefund(refundId);
  if (!refund) throw new InvalidRefundError('refund', 'No such refund.');
  return send(engine, refund, true);
}

async function send(
  engine: RefundEngine,
  refund: RefundRecord,
  lookUp: boolean,
): Promise<RefundRecord> {
  if (refund.providerRefundId) return refund;
  const access = accessOf(engine);
  const payment = await engine.ledger.findPayment(refund.paymentId);
  if (!payment?.providerPaymentId) {
    throw new InvalidRefundError('refund', 'The payment of this refund is not at the provider.');
  }

  const found = lookUp
    ? await findAtProvider(engine, access, payment.providerPaymentId, refund.id)
    : undefined;
  const providerRefund =
    found ??
    (await engine.provider.createRefund(access, {
      paymentId: payment.providerPaymentId,
      amountCents: refund.amountCents,
      // What the client sees on the statement is what the payment said; the reason stays ours.
      description: payment.description,
      idempotencyKey: refund.id,
      metadata: {
        refundId: refund.id,
        paymentId: payment.id,
        workspaceId: engine.workspaceId,
      },
    }));

  await engine.refunds.linkProviderRefund(refund.id, providerRefund.id);
  const { refund: current } = await applyProviderRefundStatus(
    engine.refunds,
    refund.id,
    providerRefund.status,
    { source: 'fetch', occurredAt: engine.now() },
  );
  return current;
}

async function findAtProvider(
  engine: RefundEngine,
  access: ProviderAccess,
  providerPaymentId: string,
  refundId: string,
): Promise<ProviderRefund | undefined> {
  const found = await engine.provider.listRefunds(access, providerPaymentId);
  return found.find(
    (candidate) =>
      candidate.metadata.refundId === refundId &&
      candidate.metadata.workspaceId === engine.workspaceId,
  );
}

export interface ApplyRefundStatusOptions {
  readonly source: StatusSource;
  /** When the status was fetched: the caller's injected clock. */
  readonly occurredAt: Date;
  /** The provider's ID for the event that brought it, when it has one. */
  readonly providerEventId?: string | null;
}

export interface AppliedRefundStatus {
  /** True when this call wrote the status line. */
  readonly applied: boolean;
  /** The refund as it is now. */
  readonly refund: RefundRecord;
}

// A change can lose the race to a parallel one; looking again settles it.
const ATTEMPTS = 3;

/**
 * Applies a status fetched from the provider to a refund, once, as an append-only line. The same
 * status again, one that arrives out of order and anything after an end change nothing.
 */
export async function applyProviderRefundStatus(
  refunds: RefundLedger,
  refundId: string,
  fetched: ProviderRefundStatus,
  options: ApplyRefundStatusOptions,
): Promise<AppliedRefundStatus> {
  const target = refundStatusOfProvider(fetched);
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const refund = await refunds.findRefund(refundId);
    if (!refund) throw new Error('No such refund.');
    const decision = decideRefundStatusChange(refund.status, target);
    if (decision.kind === 'ignore') return { applied: false, refund };
    const recorded = await refunds.recordRefundStatusChange({
      refundId,
      from: decision.from,
      to: decision.to,
      occurredAt: options.occurredAt,
      source: options.source,
      providerEventId: options.providerEventId ?? null,
    });
    if (recorded) {
      const current = await refunds.findRefund(refundId);
      if (!current) throw new Error('No such refund.');
      return { applied: true, refund: current };
    }
  }
  throw new Error('The refund kept changing under this call.');
}

/**
 * Stores a reversal (*terugboeking*, the provider's chargeback) of a payment once per provider
 * chargeback ID. The payment row is not edited.
 */
export async function recordReversal(
  refunds: RefundLedger,
  reversal: NewChargeback,
): Promise<{ chargeback: ChargebackRecord; created: boolean }> {
  validAmount(reversal.amountCents);
  const providerChargebackId = reversal.providerChargebackId.trim();
  if (providerChargebackId === '') {
    throw new InvalidRefundError('providerChargebackId', 'A reversal needs the provider’s ID.');
  }
  return await refunds.recordChargeback({
    ...reversal,
    providerChargebackId,
    bankReason: optionalText(reversal.bankReason),
  });
}
