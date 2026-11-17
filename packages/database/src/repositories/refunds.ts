import { and, asc, eq, sql } from 'drizzle-orm';
import {
  paymentChargebacks,
  paymentRefundStatusChanges,
  paymentRefunds,
  payments,
} from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';
import type { PaymentStatus, PaymentStatusSource } from './payments.ts';

// Refunds and reversals of a workspace's payments (F060, spec #493, ticket #1141), through a
// workspace scope. The rules (the refundable amount, asking once, the lookup before a retry, the
// status order) are in `packages/domain/payments`, which also defines the `RefundLedger` port
// the functions below implement; the contract suite (`@fivvi/domain/testing`) runs against
// `refundLedger` from the integration test in `packages/domain` (this package must not depend on
// the domain package). The tables repeat what they can: an amount above zero, one status line per
// status, one reversal per provider chargeback ID, and no update or delete of a status line.

export type RefundStatus = (typeof paymentRefunds.status.enumValues)[number];

export interface RefundRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly paymentId: string;
  readonly clientId: string;
  readonly amountCents: number;
  readonly reason: string | null;
  readonly revokeCredits: boolean;
  readonly providerRefundId: string | null;
  readonly requestedByTeamMemberId: string | null;
  readonly status: RefundStatus;
  readonly createdAt: Date;
}

export interface NewRefund {
  readonly paymentId: string;
  readonly amountCents: number;
  readonly reason: string | null;
  readonly revokeCredits: boolean;
  readonly requestedByTeamMemberId: string;
  /** The first status line, `requested`, is dated with it. */
  readonly occurredAt: Date;
}

/** What the refundable amount is worked out from (`RefundBasis` of the domain). */
export interface RefundFacts {
  readonly paymentStatus: PaymentStatus;
  readonly paymentAmountCents: number;
  readonly refunds: readonly { readonly amountCents: number; readonly status: RefundStatus }[];
  readonly chargebacks: readonly { readonly amountCents: number }[];
}

export type InsertRefundResult =
  | { readonly kind: 'inserted'; readonly refund: RefundRecord }
  | { readonly kind: 'refused'; readonly basis: RefundFacts }
  | { readonly kind: 'no_payment' };

export interface RefundStatusChangeRecord {
  readonly refundId: string;
  readonly from: RefundStatus | null;
  readonly to: RefundStatus;
  readonly occurredAt: Date;
  readonly source: PaymentStatusSource;
  readonly providerEventId: string | null;
}

export interface NewRefundStatusChange {
  readonly refundId: string;
  /** The status the refund must still have. */
  readonly from: RefundStatus;
  readonly to: RefundStatus;
  readonly occurredAt: Date;
  readonly source: PaymentStatusSource;
  readonly providerEventId?: string | null;
}

export interface ChargebackRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly paymentId: string;
  readonly clientId: string;
  readonly providerChargebackId: string;
  readonly amountCents: number;
  readonly bankReason: string | null;
  readonly receivedAt: Date;
  readonly createdAt: Date;
}

export interface NewChargeback {
  readonly paymentId: string;
  readonly providerChargebackId: string;
  readonly amountCents: number;
  readonly bankReason: string | null;
  readonly receivedAt: Date;
}

const refundColumns = {
  id: paymentRefunds.id,
  workspaceId: paymentRefunds.organizationId,
  paymentId: paymentRefunds.paymentId,
  clientId: paymentRefunds.clientId,
  amountCents: paymentRefunds.amountCents,
  reason: paymentRefunds.reason,
  revokeCredits: paymentRefunds.revokeCredits,
  providerRefundId: paymentRefunds.providerRefundId,
  requestedByTeamMemberId: paymentRefunds.requestedByTeamMemberId,
  status: paymentRefunds.status,
  createdAt: paymentRefunds.createdAt,
};

const chargebackColumns = {
  id: paymentChargebacks.id,
  workspaceId: paymentChargebacks.organizationId,
  paymentId: paymentChargebacks.paymentId,
  clientId: paymentChargebacks.clientId,
  providerChargebackId: paymentChargebacks.providerChargebackId,
  amountCents: paymentChargebacks.amountCents,
  bankReason: paymentChargebacks.bankReason,
  receivedAt: paymentChargebacks.receivedAt,
  createdAt: paymentChargebacks.createdAt,
};

/** The facts of a payment of the scope's workspace; `undefined` when it is not there or is another workspace's. */
export async function findRefundFacts(
  scope: WorkspaceScope,
  paymentId: string,
): Promise<RefundFacts | undefined> {
  const [payment] = await executorOf(scope)
    .select({ status: payments.status, amountCents: payments.amountCents })
    .from(payments)
    .where(and(eq(payments.organizationId, scope.workspaceId), eq(payments.id, paymentId)));
  return payment ? factsOf(scope, paymentId, payment) : undefined;
}

async function factsOf(
  scope: WorkspaceScope,
  paymentId: string,
  payment: { status: PaymentStatus; amountCents: number },
): Promise<RefundFacts> {
  const db = executorOf(scope);
  const refunds = await db
    .select({ amountCents: paymentRefunds.amountCents, status: paymentRefunds.status })
    .from(paymentRefunds)
    .where(
      and(
        eq(paymentRefunds.organizationId, scope.workspaceId),
        eq(paymentRefunds.paymentId, paymentId),
      ),
    )
    .orderBy(asc(paymentRefunds.createdAt));
  const chargebacks = await db
    .select({ amountCents: paymentChargebacks.amountCents })
    .from(paymentChargebacks)
    .where(
      and(
        eq(paymentChargebacks.organizationId, scope.workspaceId),
        eq(paymentChargebacks.paymentId, paymentId),
      ),
    )
    .orderBy(asc(paymentChargebacks.receivedAt));
  return {
    paymentStatus: payment.status,
    paymentAmountCents: payment.amountCents,
    refunds,
    chargebacks,
  };
}

/**
 * Inserts the refund and its first status line (`null → requested`) when `admit` accepts the
 * payment's facts. The payment row is locked first (`FOR UPDATE`), and the facts are read and the
 * refund written under that lock, so two requests at once cannot both pass a bound only one fits
 * within: the second waits for the first's commit and then sees its refund. The payment row is
 * not changed.
 */
export async function insertRefund(
  scope: WorkspaceScope,
  input: NewRefund,
  admit: (facts: RefundFacts) => boolean,
): Promise<InsertRefundResult> {
  const db = executorOf(scope);
  const [payment] = await db
    .select({
      id: payments.id,
      clientId: payments.clientId,
      status: payments.status,
      amountCents: payments.amountCents,
    })
    .from(payments)
    .where(and(eq(payments.organizationId, scope.workspaceId), eq(payments.id, input.paymentId)))
    .for('update');
  if (!payment) return { kind: 'no_payment' };
  const facts = await factsOf(scope, payment.id, payment);
  if (!admit(facts)) return { kind: 'refused', basis: facts };

  const [inserted] = await db
    .insert(paymentRefunds)
    .values({
      organizationId: scope.workspaceId,
      paymentId: payment.id,
      clientId: payment.clientId,
      amountCents: input.amountCents,
      reason: input.reason,
      revokeCredits: input.revokeCredits,
      requestedByTeamMemberId: input.requestedByTeamMemberId,
      status: 'requested',
      createdAt: input.occurredAt,
    })
    .returning(refundColumns);
  if (!inserted) throw new Error('The refund was not inserted.');
  await db.insert(paymentRefundStatusChanges).values({
    organizationId: scope.workspaceId,
    refundId: inserted.id,
    clientId: inserted.clientId,
    fromStatus: null,
    toStatus: 'requested',
    occurredAt: input.occurredAt,
    source: 'job',
  });
  return { kind: 'inserted', refund: inserted };
}

/** One refund of the scope's workspace; `undefined` when it is not there or is another workspace's. */
export async function findRefund(
  scope: WorkspaceScope,
  refundId: string,
): Promise<RefundRecord | undefined> {
  const [row] = await executorOf(scope)
    .select(refundColumns)
    .from(paymentRefunds)
    .where(
      and(eq(paymentRefunds.organizationId, scope.workspaceId), eq(paymentRefunds.id, refundId)),
    );
  return row;
}

/** The refunds of a payment of the scope's workspace, oldest first. */
export function listRefundsOfPayment(
  scope: WorkspaceScope,
  paymentId: string,
): Promise<RefundRecord[]> {
  return executorOf(scope)
    .select(refundColumns)
    .from(paymentRefunds)
    .where(
      and(
        eq(paymentRefunds.organizationId, scope.workspaceId),
        eq(paymentRefunds.paymentId, paymentId),
      ),
    )
    .orderBy(asc(paymentRefunds.createdAt), asc(paymentRefunds.id));
}

/** Links a refund to the provider's refund once; a refund that is linked keeps its link. */
export async function linkProviderRefund(
  scope: WorkspaceScope,
  refundId: string,
  providerRefundId: string,
): Promise<RefundRecord> {
  await executorOf(scope)
    .update(paymentRefunds)
    .set({ providerRefundId })
    .where(
      and(
        eq(paymentRefunds.organizationId, scope.workspaceId),
        eq(paymentRefunds.id, refundId),
        sql`${paymentRefunds.providerRefundId} IS NULL`,
      ),
    );
  const refund = await findRefund(scope, refundId);
  if (!refund) throw new Error('No such refund.');
  return refund;
}

/**
 * Appends a status line and moves the refund to it, in one statement: only when the refund is
 * still at `from` and has no line for `to` yet. `false`, with nothing written, otherwise (another
 * request got there first, or the refund is not this workspace's).
 */
export async function recordRefundStatusChange(
  scope: WorkspaceScope,
  change: NewRefundStatusChange,
): Promise<boolean> {
  const result = await executorOf(scope).execute(sql`
    WITH moved AS (
      UPDATE payment_refunds
      SET status = ${change.to}::payment_refund_status, updated_at = now()
      WHERE organization_id = ${scope.workspaceId}
        AND id = ${change.refundId}
        AND status = ${change.from}::payment_refund_status
        AND NOT EXISTS (
          SELECT 1 FROM payment_refund_status_changes
          WHERE refund_id = ${change.refundId} AND to_status = ${change.to}::payment_refund_status
        )
      RETURNING id, client_id
    )
    INSERT INTO payment_refund_status_changes
      (organization_id, refund_id, client_id, from_status, to_status, occurred_at, source, provider_event_id)
    SELECT ${scope.workspaceId}, id, client_id, ${change.from}::payment_refund_status,
      ${change.to}::payment_refund_status, ${change.occurredAt.toISOString()}::timestamptz,
      ${change.source}::payment_status_source, ${change.providerEventId ?? null}
    FROM moved
    RETURNING id
  `);
  return result.rows.length > 0;
}

/** The status lines of a refund of the scope's workspace, oldest first. */
export function listRefundStatusChanges(
  scope: WorkspaceScope,
  refundId: string,
): Promise<RefundStatusChangeRecord[]> {
  return executorOf(scope)
    .select({
      refundId: paymentRefundStatusChanges.refundId,
      from: paymentRefundStatusChanges.fromStatus,
      to: paymentRefundStatusChanges.toStatus,
      occurredAt: paymentRefundStatusChanges.occurredAt,
      source: paymentRefundStatusChanges.source,
      providerEventId: paymentRefundStatusChanges.providerEventId,
    })
    .from(paymentRefundStatusChanges)
    .where(
      and(
        eq(paymentRefundStatusChanges.organizationId, scope.workspaceId),
        eq(paymentRefundStatusChanges.refundId, refundId),
      ),
    )
    .orderBy(asc(paymentRefundStatusChanges.occurredAt), asc(paymentRefundStatusChanges.createdAt));
}

/**
 * Stores a reversal of a payment once per provider chargeback ID; the same ID again returns the
 * stored one untouched. Throws for a payment that is not the scope's workspace's. The payment row
 * is not changed.
 */
export async function recordChargeback(
  scope: WorkspaceScope,
  input: NewChargeback,
): Promise<{ chargeback: ChargebackRecord; created: boolean }> {
  const db = executorOf(scope);
  const [payment] = await db
    .select({ id: payments.id, clientId: payments.clientId })
    .from(payments)
    .where(and(eq(payments.organizationId, scope.workspaceId), eq(payments.id, input.paymentId)));
  if (!payment) throw new Error('No such payment.');
  const [inserted] = await db
    .insert(paymentChargebacks)
    .values({
      organizationId: scope.workspaceId,
      paymentId: payment.id,
      clientId: payment.clientId,
      providerChargebackId: input.providerChargebackId,
      amountCents: input.amountCents,
      bankReason: input.bankReason,
      receivedAt: input.receivedAt,
    })
    .onConflictDoNothing({ target: [paymentChargebacks.providerChargebackId] })
    .returning(chargebackColumns);
  if (inserted) return { chargeback: inserted, created: true };
  const [existing] = await db
    .select(chargebackColumns)
    .from(paymentChargebacks)
    .where(
      and(
        eq(paymentChargebacks.organizationId, scope.workspaceId),
        eq(paymentChargebacks.providerChargebackId, input.providerChargebackId),
      ),
    );
  if (!existing) throw new Error('The reversal was neither inserted nor found.');
  return { chargeback: existing, created: false };
}

/** The reversals of a payment of the scope's workspace, oldest first. */
export function listChargebacksOfPayment(
  scope: WorkspaceScope,
  paymentId: string,
): Promise<ChargebackRecord[]> {
  return executorOf(scope)
    .select(chargebackColumns)
    .from(paymentChargebacks)
    .where(
      and(
        eq(paymentChargebacks.organizationId, scope.workspaceId),
        eq(paymentChargebacks.paymentId, paymentId),
      ),
    )
    .orderBy(asc(paymentChargebacks.receivedAt), asc(paymentChargebacks.id));
}

/** Opens a transaction in the workspace's scope; see `InPaymentScope`, which has the same shape. */
export type InRefundScope = <T>(run: (scope: WorkspaceScope) => Promise<T>) => Promise<T>;

/**
 * The refund ledger of one workspace as the domain's `RefundLedger` port. Every call runs in a
 * transaction of its own, so a refund row is committed before the provider is called (`our row
 * first`) and stays when the provider fails.
 */
export function refundLedger(inScope: InRefundScope) {
  return {
    insertRefund: (input: NewRefund, admit: (facts: RefundFacts) => boolean) =>
      inScope((scope) => insertRefund(scope, input, admit)),
    findRefund: (refundId: string) => inScope((scope) => findRefund(scope, refundId)),
    listRefundsOfPayment: (paymentId: string) =>
      inScope((scope) => listRefundsOfPayment(scope, paymentId)),
    refundBasis: (paymentId: string) => inScope((scope) => findRefundFacts(scope, paymentId)),
    linkProviderRefund: (refundId: string, providerRefundId: string) =>
      inScope((scope) => linkProviderRefund(scope, refundId, providerRefundId)),
    recordRefundStatusChange: (change: NewRefundStatusChange) =>
      inScope((scope) => recordRefundStatusChange(scope, change)),
    listRefundStatusChanges: (refundId: string) =>
      inScope((scope) => listRefundStatusChanges(scope, refundId)),
    recordChargeback: (input: NewChargeback) => inScope((scope) => recordChargeback(scope, input)),
    listChargebacksOfPayment: (paymentId: string) =>
      inScope((scope) => listChargebacksOfPayment(scope, paymentId)),
  };
}
