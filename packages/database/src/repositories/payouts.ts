import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { payoutLines, payoutStatusChanges, payouts } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';
import type { PaymentStatusSource } from './payments.ts';

// The payouts of a workspace, their lines and their status lines (F061, spec #496, ticket #1163),
// through a workspace scope. The rules (importing a settlement once, the order of the statuses)
// are in `packages/domain/commerce`, which also defines the `PayoutLedger` port the functions
// below implement; the contract suite (`@fivvi/domain/testing`) runs against `payoutLedger` from
// the integration test in `packages/domain` (this package must not depend on the domain
// package). The tables repeat what they can: one payout per settlement ID in a workspace, one line
// per identity in a payout, a fee kind for a fee and for nothing else, and no update or delete of
// a status line.

export type PayoutStatus = (typeof payouts.status.enumValues)[number];
export type PayoutLineType = (typeof payoutLines.type.enumValues)[number];
export type PayoutFeeKind = (typeof payoutLines.feeKind.enumValues)[number];

export interface PayoutRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly providerSettlementId: string;
  readonly reference: string | null;
  readonly settledAt: Date | null;
  readonly amountCents: number;
  readonly status: PayoutStatus;
  readonly fetchedAt: Date;
  readonly createdAt: Date;
}

export interface NewPayout {
  readonly providerSettlementId: string;
  readonly reference: string | null;
  readonly settledAt: Date | null;
  readonly amountCents: number;
  readonly status: PayoutStatus;
  readonly fetchedAt: Date;
  /** The first status line, `null → status`, is dated `fetchedAt` and has this source. */
  readonly source: PaymentStatusSource;
}

export interface PayoutDetails {
  readonly reference: string | null;
  readonly settledAt: Date | null;
  readonly amountCents: number;
  readonly fetchedAt: Date;
}

export interface PayoutStatusChangeRecord {
  readonly payoutId: string;
  readonly from: PayoutStatus | null;
  readonly to: PayoutStatus;
  readonly occurredAt: Date;
  readonly source: PaymentStatusSource;
}

export interface NewPayoutStatusChange {
  readonly payoutId: string;
  /** The status the payout must still have. */
  readonly from: PayoutStatus;
  readonly to: PayoutStatus;
  readonly occurredAt: Date;
  readonly source: PaymentStatusSource;
}

export interface PayoutLineRecord {
  readonly id: string;
  readonly payoutId: string;
  readonly providerLineId: string;
  readonly type: PayoutLineType;
  readonly feeKind: PayoutFeeKind | null;
  readonly amountCents: number;
  readonly description: string;
  readonly count: number | null;
  readonly matchedPaymentId: string | null;
  readonly matchedRefundId: string | null;
  readonly matchedChargebackId: string | null;
  readonly matched: boolean;
  readonly createdAt: Date;
}

export interface NewPayoutLine {
  readonly providerLineId: string;
  readonly type: PayoutLineType;
  readonly feeKind: PayoutFeeKind | null;
  readonly amountCents: number;
  readonly description: string;
  readonly count: number | null;
}

const payoutColumns = {
  id: payouts.id,
  workspaceId: payouts.organizationId,
  providerSettlementId: payouts.providerSettlementId,
  reference: payouts.reference,
  settledAt: payouts.settledAt,
  amountCents: payouts.amountCents,
  status: payouts.status,
  fetchedAt: payouts.fetchedAt,
  createdAt: payouts.createdAt,
};

const lineColumns = {
  id: payoutLines.id,
  payoutId: payoutLines.payoutId,
  providerLineId: payoutLines.providerLineId,
  type: payoutLines.type,
  feeKind: payoutLines.feeKind,
  amountCents: payoutLines.amountCents,
  description: payoutLines.description,
  count: payoutLines.feeCount,
  matchedPaymentId: payoutLines.matchedPaymentId,
  matchedRefundId: payoutLines.matchedRefundId,
  matchedChargebackId: payoutLines.matchedChargebackId,
  matched: payoutLines.matched,
  createdAt: payoutLines.createdAt,
};

/**
 * Stores a payout and its first status line (`null → status`) once per settlement ID in the
 * scope's workspace. A settlement that is already stored is returned as it is, `created` false.
 */
export async function insertPayout(
  scope: WorkspaceScope,
  input: NewPayout,
): Promise<{ payout: PayoutRecord; created: boolean }> {
  const db = executorOf(scope);
  const [inserted] = await db
    .insert(payouts)
    .values({
      organizationId: scope.workspaceId,
      providerSettlementId: input.providerSettlementId,
      reference: input.reference,
      settledAt: input.settledAt,
      amountCents: input.amountCents,
      status: input.status,
      fetchedAt: input.fetchedAt,
    })
    .onConflictDoNothing({ target: [payouts.organizationId, payouts.providerSettlementId] })
    .returning(payoutColumns);
  if (inserted) {
    await db.insert(payoutStatusChanges).values({
      organizationId: scope.workspaceId,
      payoutId: inserted.id,
      fromStatus: null,
      toStatus: input.status,
      occurredAt: input.fetchedAt,
      source: input.source,
    });
    return { payout: inserted, created: true };
  }
  const existing = await findPayoutBySettlement(scope, input.providerSettlementId);
  if (!existing) throw new Error('The payout was neither inserted nor found.');
  return { payout: existing, created: false };
}

/**
 * Updates what a later fetch may change: the reference and the settled date (kept when the fetch
 * has none), the amount and the fetch time (never moved back). Never the status, never the lines.
 */
export async function refreshPayout(
  scope: WorkspaceScope,
  payoutId: string,
  details: PayoutDetails,
): Promise<PayoutRecord> {
  const [row] = await executorOf(scope)
    .update(payouts)
    .set({
      reference: sql`coalesce(${details.reference}, ${payouts.reference})`,
      settledAt: sql`coalesce(${details.settledAt?.toISOString() ?? null}::timestamptz, ${payouts.settledAt})`,
      amountCents: details.amountCents,
      fetchedAt: sql`greatest(${payouts.fetchedAt}, ${details.fetchedAt.toISOString()}::timestamptz)`,
    })
    .where(and(eq(payouts.organizationId, scope.workspaceId), eq(payouts.id, payoutId)))
    .returning(payoutColumns);
  if (!row) throw new Error('No such payout.');
  return row;
}

/**
 * Appends a status line and moves the payout to it, in one statement: only when the payout is
 * still at `from`. `false`, with nothing written, otherwise (another request got there first, or
 * the payout is not this workspace's).
 */
export async function recordPayoutStatusChange(
  scope: WorkspaceScope,
  change: NewPayoutStatusChange,
): Promise<boolean> {
  const result = await executorOf(scope).execute(sql`
    WITH moved AS (
      UPDATE payouts
      SET status = ${change.to}::payout_status, updated_at = now()
      WHERE organization_id = ${scope.workspaceId}
        AND id = ${change.payoutId}
        AND status = ${change.from}::payout_status
        AND ${change.from}::payout_status <> ${change.to}::payout_status
      RETURNING id
    )
    INSERT INTO payout_status_changes
      (organization_id, payout_id, from_status, to_status, occurred_at, source)
    SELECT ${scope.workspaceId}, id, ${change.from}::payout_status, ${change.to}::payout_status,
      ${change.occurredAt.toISOString()}::timestamptz, ${change.source}::payment_status_source
    FROM moved
    RETURNING id
  `);
  return result.rows.length > 0;
}

/**
 * Stores the lines that the payout does not have yet, unmatched; a line with an identity the
 * payout already has is left as it is. Returns how many were stored. Throws for a payout that is
 * not the scope's workspace's.
 */
export async function insertPayoutLines(
  scope: WorkspaceScope,
  payoutId: string,
  lines: readonly NewPayoutLine[],
): Promise<number> {
  const db = executorOf(scope);
  const payout = await findPayout(scope, payoutId);
  if (!payout) throw new Error('No such payout.');
  if (lines.length === 0) return 0;
  const stored = await db
    .insert(payoutLines)
    .values(
      lines.map((line) => ({
        organizationId: scope.workspaceId,
        payoutId,
        providerLineId: line.providerLineId,
        type: line.type,
        feeKind: line.feeKind,
        amountCents: line.amountCents,
        description: line.description,
        feeCount: line.count,
      })),
    )
    .onConflictDoNothing({
      target: [payoutLines.organizationId, payoutLines.payoutId, payoutLines.providerLineId],
    })
    .returning({ id: payoutLines.id });
  return stored.length;
}

/** One payout of the scope's workspace; `undefined` when it is not there or is another workspace's. */
export async function findPayout(
  scope: WorkspaceScope,
  payoutId: string,
): Promise<PayoutRecord | undefined> {
  const [row] = await executorOf(scope)
    .select(payoutColumns)
    .from(payouts)
    .where(and(eq(payouts.organizationId, scope.workspaceId), eq(payouts.id, payoutId)));
  return row;
}

/** The payout of a settlement of the scope's workspace. */
export async function findPayoutBySettlement(
  scope: WorkspaceScope,
  providerSettlementId: string,
): Promise<PayoutRecord | undefined> {
  const [row] = await executorOf(scope)
    .select(payoutColumns)
    .from(payouts)
    .where(
      and(
        eq(payouts.organizationId, scope.workspaceId),
        eq(payouts.providerSettlementId, providerSettlementId),
      ),
    );
  return row;
}

/** The payouts of the scope's workspace, newest first; one without a settled date (still open) comes first. */
export function listPayouts(scope: WorkspaceScope): Promise<PayoutRecord[]> {
  return executorOf(scope)
    .select(payoutColumns)
    .from(payouts)
    .where(eq(payouts.organizationId, scope.workspaceId))
    .orderBy(sql`${payouts.settledAt} DESC NULLS FIRST`, desc(payouts.createdAt), asc(payouts.id));
}

/**
 * The lines of a payout of the scope's workspace: payments, refunds, reversals, fees and the rest
 * (the order of `PAYOUT_LINE_TYPES`), then by identity.
 */
export function listPayoutLines(
  scope: WorkspaceScope,
  payoutId: string,
): Promise<PayoutLineRecord[]> {
  return executorOf(scope)
    .select(lineColumns)
    .from(payoutLines)
    .where(
      and(eq(payoutLines.organizationId, scope.workspaceId), eq(payoutLines.payoutId, payoutId)),
    )
    .orderBy(asc(payoutLines.type), sql`${payoutLines.providerLineId} COLLATE "C"`);
}

/** The status lines of a payout of the scope's workspace, oldest first. */
export function listPayoutStatusChanges(
  scope: WorkspaceScope,
  payoutId: string,
): Promise<PayoutStatusChangeRecord[]> {
  return executorOf(scope)
    .select({
      payoutId: payoutStatusChanges.payoutId,
      from: payoutStatusChanges.fromStatus,
      to: payoutStatusChanges.toStatus,
      occurredAt: payoutStatusChanges.occurredAt,
      source: payoutStatusChanges.source,
    })
    .from(payoutStatusChanges)
    .where(
      and(
        eq(payoutStatusChanges.organizationId, scope.workspaceId),
        eq(payoutStatusChanges.payoutId, payoutId),
      ),
    )
    .orderBy(asc(payoutStatusChanges.occurredAt), asc(payoutStatusChanges.createdAt));
}

/** Opens a transaction in the workspace's scope; see `InRefundScope`, which has the same shape. */
export type InPayoutScope = <T>(run: (scope: WorkspaceScope) => Promise<T>) => Promise<T>;

/**
 * The payout ledger of one workspace as the domain's `PayoutLedger` port. Every call runs in a
 * transaction of its own, so an import that stops half way leaves a payout without some of its
 * lines, which the next import completes.
 */
export function payoutLedger(inScope: InPayoutScope) {
  return {
    insertPayout: (input: NewPayout) => inScope((scope) => insertPayout(scope, input)),
    refreshPayout: (payoutId: string, details: PayoutDetails) =>
      inScope((scope) => refreshPayout(scope, payoutId, details)),
    recordPayoutStatusChange: (change: NewPayoutStatusChange) =>
      inScope((scope) => recordPayoutStatusChange(scope, change)),
    insertPayoutLines: (payoutId: string, lines: readonly NewPayoutLine[]) =>
      inScope((scope) => insertPayoutLines(scope, payoutId, lines)),
    findPayout: (payoutId: string) => inScope((scope) => findPayout(scope, payoutId)),
    findPayoutBySettlement: (providerSettlementId: string) =>
      inScope((scope) => findPayoutBySettlement(scope, providerSettlementId)),
    listPayouts: () => inScope((scope) => listPayouts(scope)),
    listPayoutLines: (payoutId: string) => inScope((scope) => listPayoutLines(scope, payoutId)),
    listPayoutStatusChanges: (payoutId: string) =>
      inScope((scope) => listPayoutStatusChanges(scope, payoutId)),
  };
}
