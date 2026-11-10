import { and, asc, eq, sql } from 'drizzle-orm';
import {
  type PaymentSuppliedSnapshot,
  paymentCustomers,
  paymentStatusChanges,
  payments,
} from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The payment ledger of a workspace (E019, spec #466, ticket #727), through a workspace scope. The
// rules (the status order, creating a payment once, the retry) are in `packages/domain/payments`,
// which also defines the `PaymentLedger` port these functions implement; the ledger contract
// suite (`@fivvi/domain/testing`) runs against `paymentLedger` below. The tables repeat what they
// can: an amount above zero, one payment per business key, one status line per status, and no
// update or delete of a status line.

export type PaymentKind = (typeof payments.kind.enumValues)[number];
export type PaymentPurpose = (typeof payments.purpose.enumValues)[number];
export type PaymentStatus = (typeof payments.status.enumValues)[number];
export type PaymentStatusSource = (typeof paymentStatusChanges.source.enumValues)[number];

export interface PaymentRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly clientId: string;
  readonly kind: PaymentKind;
  readonly purpose: PaymentPurpose;
  readonly purposeReferenceId: string | null;
  readonly businessKey: string;
  readonly amountCents: number;
  readonly currency: 'EUR';
  readonly description: string;
  readonly supplied: PaymentSuppliedSnapshot;
  readonly providerPaymentId: string | null;
  readonly providerMandateId: string | null;
  readonly status: PaymentStatus;
  readonly testmode: boolean;
  readonly createdAt: Date;
}

export interface NewPayment {
  readonly clientId: string;
  readonly kind: PaymentKind;
  readonly purpose: PaymentPurpose;
  readonly purposeReferenceId: string | null;
  /** Unique per workspace. */
  readonly businessKey: string;
  readonly amountCents: number;
  readonly description: string;
  readonly supplied: PaymentSuppliedSnapshot;
  readonly testmode: boolean;
  /** The first status line, `open`, is dated with it. */
  readonly occurredAt: Date;
}

export interface StatusChangeRecord {
  readonly paymentId: string;
  readonly from: PaymentStatus | null;
  readonly to: PaymentStatus;
  readonly occurredAt: Date;
  readonly source: PaymentStatusSource;
  readonly providerEventId: string | null;
}

export interface NewStatusChange {
  readonly paymentId: string;
  /** The status the payment must still have. */
  readonly from: PaymentStatus;
  readonly to: PaymentStatus;
  readonly occurredAt: Date;
  readonly source: PaymentStatusSource;
  readonly providerEventId?: string | null;
}

const paymentColumns = {
  id: payments.id,
  workspaceId: payments.organizationId,
  clientId: payments.clientId,
  kind: payments.kind,
  purpose: payments.purpose,
  purposeReferenceId: payments.purposeReferenceId,
  businessKey: payments.businessKey,
  amountCents: payments.amountCents,
  currency: payments.currency,
  description: payments.description,
  supplied: payments.supplied,
  providerPaymentId: payments.providerPaymentId,
  providerMandateId: payments.providerMandateId,
  status: payments.status,
  testmode: payments.testmode,
  createdAt: payments.createdAt,
};

// The check on the table keeps `currency` at EUR; the type says so.
const asRecord = (row: Omit<PaymentRecord, 'currency'> & { currency: string }): PaymentRecord => ({
  ...row,
  currency: 'EUR',
});

/**
 * Inserts the payment and its first status line (`null → open`), or returns the workspace's
 * payment with this business key untouched. `created` says which. Two requests for one business
 * key at once: the second waits for the first's commit and gets its payment.
 */
export async function insertPayment(
  scope: WorkspaceScope,
  input: NewPayment,
): Promise<{ payment: PaymentRecord; created: boolean }> {
  const db = executorOf(scope);
  const [inserted] = await db
    .insert(payments)
    .values({
      organizationId: scope.workspaceId,
      clientId: input.clientId,
      kind: input.kind,
      purpose: input.purpose,
      purposeReferenceId: input.purposeReferenceId,
      businessKey: input.businessKey,
      amountCents: input.amountCents,
      description: input.description,
      supplied: input.supplied,
      testmode: input.testmode,
      status: 'open',
      createdAt: input.occurredAt,
    })
    .onConflictDoNothing({ target: [payments.organizationId, payments.businessKey] })
    .returning(paymentColumns);
  if (inserted) {
    await db.insert(paymentStatusChanges).values({
      organizationId: scope.workspaceId,
      paymentId: inserted.id,
      clientId: inserted.clientId,
      fromStatus: null,
      toStatus: 'open',
      occurredAt: input.occurredAt,
      source: 'job',
      createdAt: input.occurredAt,
    });
    return { payment: asRecord(inserted), created: true };
  }
  const [existing] = await db
    .select(paymentColumns)
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, scope.workspaceId),
        eq(payments.businessKey, input.businessKey),
      ),
    );
  if (!existing) throw new Error('The payment was neither inserted nor found.');
  return { payment: asRecord(existing), created: false };
}

/** One payment of the scope's workspace; `undefined` when it is not there or is another workspace's. */
export async function findPayment(
  scope: WorkspaceScope,
  paymentId: string,
): Promise<PaymentRecord | undefined> {
  const [row] = await executorOf(scope)
    .select(paymentColumns)
    .from(payments)
    .where(and(eq(payments.organizationId, scope.workspaceId), eq(payments.id, paymentId)));
  return row ? asRecord(row) : undefined;
}

/** The provider's customer ID of a client, if one was linked. */
export async function findProviderCustomerId(
  scope: WorkspaceScope,
  clientId: string,
): Promise<string | undefined> {
  const [row] = await executorOf(scope)
    .select({ id: paymentCustomers.providerCustomerId })
    .from(paymentCustomers)
    .where(
      and(
        eq(paymentCustomers.organizationId, scope.workspaceId),
        eq(paymentCustomers.clientId, clientId),
      ),
    );
  return row?.id;
}

/** Links a client to the provider's customer; the first link wins and is returned. */
export async function linkProviderCustomer(
  scope: WorkspaceScope,
  clientId: string,
  providerCustomerId: string,
): Promise<string> {
  await executorOf(scope)
    .insert(paymentCustomers)
    .values({ organizationId: scope.workspaceId, clientId, providerCustomerId })
    .onConflictDoNothing({ target: [paymentCustomers.organizationId, paymentCustomers.clientId] });
  const linked = await findProviderCustomerId(scope, clientId);
  if (!linked) throw new Error('The provider customer was neither linked nor found.');
  return linked;
}

/** Links a payment to the provider's payment (and mandate) once; a payment that is linked keeps its link. */
export async function linkProviderPayment(
  scope: WorkspaceScope,
  paymentId: string,
  link: { providerPaymentId: string; providerMandateId: string | null },
): Promise<PaymentRecord> {
  await executorOf(scope)
    .update(payments)
    .set({
      providerPaymentId: link.providerPaymentId,
      providerMandateId: link.providerMandateId,
    })
    .where(
      and(
        eq(payments.organizationId, scope.workspaceId),
        eq(payments.id, paymentId),
        sql`${payments.providerPaymentId} IS NULL`,
      ),
    );
  const payment = await findPayment(scope, paymentId);
  if (!payment) throw new Error('No such payment.');
  return payment;
}

/**
 * Appends a status line and moves the payment to it, in one statement: only when the payment is
 * still at `from` and has no line for `to` yet. `false`, with nothing written, otherwise (another
 * request got there first, or the payment is not this workspace's).
 */
export async function recordStatusChange(
  scope: WorkspaceScope,
  change: NewStatusChange,
): Promise<boolean> {
  const result = await executorOf(scope).execute(sql`
    WITH moved AS (
      UPDATE payments
      SET status = ${change.to}::payment_status, updated_at = now()
      WHERE organization_id = ${scope.workspaceId}
        AND id = ${change.paymentId}
        AND status = ${change.from}::payment_status
        AND NOT EXISTS (
          SELECT 1 FROM payment_status_changes
          WHERE payment_id = ${change.paymentId} AND to_status = ${change.to}::payment_status
        )
      RETURNING id, client_id
    )
    INSERT INTO payment_status_changes
      (organization_id, payment_id, client_id, from_status, to_status, occurred_at, source, provider_event_id)
    SELECT ${scope.workspaceId}, id, client_id, ${change.from}::payment_status,
      ${change.to}::payment_status, ${change.occurredAt.toISOString()}::timestamptz,
      ${change.source}::payment_status_source, ${change.providerEventId ?? null}
    FROM moved
    RETURNING id
  `);
  return result.rows.length > 0;
}

/** The status lines of a payment of the scope's workspace, oldest first. */
export function listStatusChanges(
  scope: WorkspaceScope,
  paymentId: string,
): Promise<StatusChangeRecord[]> {
  return executorOf(scope)
    .select({
      paymentId: paymentStatusChanges.paymentId,
      from: paymentStatusChanges.fromStatus,
      to: paymentStatusChanges.toStatus,
      occurredAt: paymentStatusChanges.occurredAt,
      source: paymentStatusChanges.source,
      providerEventId: paymentStatusChanges.providerEventId,
    })
    .from(paymentStatusChanges)
    .where(
      and(
        eq(paymentStatusChanges.organizationId, scope.workspaceId),
        eq(paymentStatusChanges.paymentId, paymentId),
      ),
    )
    .orderBy(asc(paymentStatusChanges.createdAt), asc(paymentStatusChanges.occurredAt));
}

/**
 * Opens a transaction in the workspace's scope, commits it when `run` returns and rolls it back
 * when `run` throws; `createTenantScopes(...).inWorkspaceScope` bound to the caller's account.
 */
export type InPaymentScope = <T>(run: (scope: WorkspaceScope) => Promise<T>) => Promise<T>;

/**
 * The payment ledger of one workspace as the domain's `PaymentLedger` port. Every call runs in a
 * transaction of its own, so a row the engine inserted is committed before the provider is called
 * (`createPayment`: our row first) and stays when the provider fails.
 */
export function paymentLedger(inScope: InPaymentScope) {
  return {
    insertPayment: (input: NewPayment) => inScope((scope) => insertPayment(scope, input)),
    findPayment: (paymentId: string) => inScope((scope) => findPayment(scope, paymentId)),
    findProviderCustomerId: (clientId: string) =>
      inScope((scope) => findProviderCustomerId(scope, clientId)),
    linkProviderCustomer: (clientId: string, providerCustomerId: string) =>
      inScope((scope) => linkProviderCustomer(scope, clientId, providerCustomerId)),
    linkProviderPayment: (
      paymentId: string,
      link: { providerPaymentId: string; providerMandateId: string | null },
    ) => inScope((scope) => linkProviderPayment(scope, paymentId, link)),
    recordStatusChange: (change: NewStatusChange) =>
      inScope((scope) => recordStatusChange(scope, change)),
    listStatusChanges: (paymentId: string) =>
      inScope((scope) => listStatusChanges(scope, paymentId)),
  };
}
