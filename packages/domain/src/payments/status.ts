// The status of a payment in our ledger (E019, spec #466, AC7). It only ever moves forward, and
// only because a status fetched from the provider says so (`applyProviderStatus`); this file is
// the rule that decides whether a fetched status is news.

/**
 * Where a payment stands. `open` is also what a payment is before the provider has seen it: it
 * cannot be paid yet. `refunded` and `charged_back` come later (F060); they are listed so the
 * ledger and the webhook path need no change then.
 */
export const PAYMENT_STATUSES = [
  'open',
  'pending',
  'paid',
  'failed',
  'canceled',
  'expired',
  'refunded',
  'charged_back',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// How far a payment has come. Equal ranks are alternatives (a payment ends paid, failed, canceled
// or expired), never steps; only a higher rank is news.
const RANK: Record<PaymentStatus, number> = {
  open: 0,
  pending: 1,
  paid: 2,
  failed: 2,
  canceled: 2,
  expired: 2,
  refunded: 3,
  charged_back: 4,
};

// The ends of a payment that was never paid: nothing follows them.
const FINAL: ReadonlySet<PaymentStatus> = new Set(['failed', 'canceled', 'expired']);

// What only a paid payment can become.
const AFTER_PAID: ReadonlySet<PaymentStatus> = new Set(['refunded', 'charged_back']);

export type StatusChangeDecision =
  | { readonly kind: 'apply'; readonly from: PaymentStatus; readonly to: PaymentStatus }
  | { readonly kind: 'ignore'; readonly reason: 'same' | 'stale' };

/**
 * Whether a status fetched from the provider changes a payment now at `current`. The same status
 * again, an earlier one arriving late, and anything after a final status change nothing.
 */
export function decideStatusChange(
  current: PaymentStatus,
  fetched: PaymentStatus,
): StatusChangeDecision {
  if (fetched === current) return { kind: 'ignore', reason: 'same' };
  if (FINAL.has(current)) return { kind: 'ignore', reason: 'stale' };
  if (RANK[fetched] <= RANK[current]) return { kind: 'ignore', reason: 'stale' };
  if (AFTER_PAID.has(fetched) && RANK[current] < RANK.paid) {
    return { kind: 'ignore', reason: 'stale' };
  }
  return { kind: 'apply', from: current, to: fetched };
}
