// Module: the status of a payout (a Mollie settlement) in our records.
// Spec: #496 (F061), ticket #1163; AC5.
//
// A payout's status is what Mollie reports, and the last of its append-only status lines. It
// moves forward only because a status fetched from Mollie says so; this file is the rule that
// decides whether a fetched status is news.

/** Where a payout stands, as Mollie reports a settlement. */
export const PAYOUT_STATUSES = ['open', 'pending', 'paidout', 'failed'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

// How far a payout has come. `paidout` and `failed` are alternatives of the same rank: Mollie can
// pay a failed settlement out later (or report a paid one failed), and each is news.
const RANK: Record<PayoutStatus, number> = {
  open: 0,
  pending: 1,
  paidout: 2,
  failed: 2,
};

export type PayoutStatusDecision =
  | { readonly kind: 'apply'; readonly from: PayoutStatus; readonly to: PayoutStatus }
  | { readonly kind: 'ignore'; readonly reason: 'same' | 'stale' };

/** Whether a status fetched from Mollie changes a payout now at `current`: the same one again and an earlier one arriving late do not. */
export function decidePayoutStatusChange(
  current: PayoutStatus,
  fetched: PayoutStatus,
): PayoutStatusDecision {
  if (fetched === current) return { kind: 'ignore', reason: 'same' };
  if (RANK[fetched] < RANK[current]) return { kind: 'ignore', reason: 'stale' };
  return { kind: 'apply', from: current, to: fetched };
}
