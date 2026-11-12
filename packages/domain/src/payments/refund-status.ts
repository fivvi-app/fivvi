import type { ProviderRefundStatus } from './provider.ts';

// The status of a refund in our ledger (F060, spec #493, AC13). It only moves forward, and only
// because a status fetched from the provider says so; this file is the rule that decides whether
// a fetched status is news. The status of a refund is the last of its append-only lines.

/**
 * Where a refund stands. `requested` is what it is before the provider has seen it (our row is
 * written first). `refunded`, `failed` and `canceled` are the ends.
 */
export const REFUND_STATUSES = [
  'requested',
  'queued',
  'pending',
  'refunded',
  'failed',
  'canceled',
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

// How far a refund has come. The ends are alternatives of the same rank, never steps.
const RANK: Record<RefundStatus, number> = {
  requested: 0,
  queued: 1,
  pending: 2,
  refunded: 3,
  failed: 3,
  canceled: 3,
};

const ENDS: ReadonlySet<RefundStatus> = new Set(['refunded', 'failed', 'canceled']);

/** A refund that has not failed and has not been canceled holds its amount back from the payment. */
export function refundHoldsAmount(status: RefundStatus): boolean {
  return status !== 'failed' && status !== 'canceled';
}

/** The provider's `processing` is a refund on its way, like `pending`. */
export function refundStatusOfProvider(status: ProviderRefundStatus): RefundStatus {
  return status === 'processing' ? 'pending' : status;
}

export type RefundStatusDecision =
  | { readonly kind: 'apply'; readonly from: RefundStatus; readonly to: RefundStatus }
  | { readonly kind: 'ignore'; readonly reason: 'same' | 'stale' };

/**
 * Whether a status fetched from the provider changes a refund now at `current`. The same status
 * again, an earlier one arriving late, and anything after an end change nothing.
 */
export function decideRefundStatusChange(
  current: RefundStatus,
  fetched: RefundStatus,
): RefundStatusDecision {
  if (fetched === current) return { kind: 'ignore', reason: 'same' };
  if (ENDS.has(current)) return { kind: 'ignore', reason: 'stale' };
  if (RANK[fetched] <= RANK[current]) return { kind: 'ignore', reason: 'stale' };
  return { kind: 'apply', from: current, to: fetched };
}
