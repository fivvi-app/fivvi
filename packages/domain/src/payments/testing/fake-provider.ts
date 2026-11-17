import {
  type ConnectRequest,
  type ConnectStart,
  type PaymentProvider,
  type ProviderAccess,
  type ProviderConnectionStatus,
  type ProviderCustomer,
  type ProviderCustomerRequest,
  ProviderError,
  type ProviderPayment,
  type ProviderPaymentRequest,
  type ProviderRefund,
  type ProviderRefundRequest,
  type ProviderRefundStatus,
  type ProviderSettlement,
  type ProviderSettlementLine,
} from '../provider.ts';
import type { PaymentStatus } from '../status.ts';

// An in-memory payment provider with scripted outcomes (AC16), for tests of the engine and of
// every feature on top of it. It behaves like the real thing where the engine relies on it: a
// repeated idempotency key gives the same resource, a customer's payments are listed with their
// metadata, a payment only moves when a test settles it, and a refund needs a paid payment.
// Nothing here talks to a network. Test-only.

/** The methods of the port a test can make fail. */
export type FakeMethod = keyof PaymentProvider;

/**
 * How a scripted failure plays out. `lost-response` is the one that matters most: the provider
 * did the work and the answer never came back, so the caller must look before it retries (AC6).
 */
export type FakeFault = 'before' | 'lost-response';

export interface FakeCall {
  readonly method: FakeMethod;
  readonly access: ProviderAccess | null;
  /** The request as it reached the provider; `null` for a method with only an ID. */
  readonly request: unknown;
  /** The access token generation in use (`refreshAccessToken`). */
  readonly tokenVersion: number;
}

interface WorkspaceState {
  readonly customers: Map<string, ProviderCustomer & { readonly request: ProviderCustomerRequest }>;
  readonly customerKeys: Map<string, string>;
  readonly payments: Map<string, ProviderPayment>;
  readonly paymentKeys: Map<string, string>;
  readonly refunds: Map<string, ProviderRefund>;
  readonly refundKeys: Map<string, string>;
  readonly settlements: ProviderSettlement[];
  readonly settlementLines: Map<string, ProviderSettlementLine[]>;
}

export class FakePaymentProvider implements PaymentProvider {
  /** Every call that reached the fake, in order, including the ones made to fail. */
  readonly calls: FakeCall[] = [];

  private tokenVersion = 1;
  private status: ProviderConnectionStatus = 'ready';
  private newRefundStatus: ProviderRefundStatus = 'refunded';
  private sequence = 0;
  private readonly workspaces = new Map<string, WorkspaceState>();
  private readonly faults = new Map<FakeMethod, FakeFault[]>();

  /** The connection status every workspace reports from now on; `broken` makes every call `unauthorized`. */
  setConnectionStatus(status: ProviderConnectionStatus): void {
    this.status = status;
  }

  /** The access token was refreshed: later calls carry the next version, and nothing else changes. */
  refreshAccessToken(): void {
    this.tokenVersion += 1;
  }

  /** The next call of `method` fails as scripted; call it again to queue a second failure. */
  failNext(method: FakeMethod, fault: FakeFault = 'before'): void {
    this.faults.set(method, [...(this.faults.get(method) ?? []), fault]);
  }

  /** Moves a payment to the status the client's checkout ended in. */
  settle(access: ProviderAccess, providerPaymentId: string, status: PaymentStatus): void {
    const state = this.stateOf(access);
    const payment = this.paymentOf(state, providerPaymentId);
    const mandateId =
      status === 'paid' && payment.sequenceType === 'first'
        ? (payment.mandateId ?? this.next('mdt'))
        : payment.mandateId;
    state.payments.set(payment.id, {
      ...payment,
      status,
      mandateId,
      checkoutUrl: status === 'open' ? payment.checkoutUrl : null,
    });
  }

  /** Moves a refund to the status the provider reached with it (a queued refund that is processed, a failed one). */
  settleRefund(
    access: ProviderAccess,
    providerRefundId: string,
    status: ProviderRefundStatus,
  ): void {
    const state = this.stateOf(access);
    state.refunds.set(providerRefundId, { ...this.refundOf(state, providerRefundId), status });
  }

  /** The refunds the fake holds for a workspace, in creation order. */
  refundsOf(access: ProviderAccess): ProviderRefund[] {
    return [...this.stateOf(access).refunds.values()];
  }

  /** The status a refund has when it is created from now on; the default is `refunded` (a queued one is `queued`). */
  createRefundsAs(status: ProviderRefundStatus): void {
    this.newRefundStatus = status;
  }

  /** The client paid. */
  pay(access: ProviderAccess, providerPaymentId: string): void {
    this.settle(access, providerPaymentId, 'paid');
  }

  /** The payments the fake holds for a workspace, in creation order. */
  paymentsOf(access: ProviderAccess): ProviderPayment[] {
    return [...this.stateOf(access).payments.values()];
  }

  /** The customers the fake holds for a workspace, with what was sent to create them. */
  customersOf(access: ProviderAccess): ProviderCustomerRequest[] {
    return [...this.stateOf(access).customers.values()].map((customer) => customer.request);
  }

  /** Puts a settlement and its lines in the fake, for the code that reads them. */
  addSettlement(
    access: ProviderAccess,
    settlement: ProviderSettlement,
    lines: readonly ProviderSettlementLine[],
  ): void {
    const state = this.stateOf(access);
    state.settlements.push(settlement);
    state.settlementLines.set(settlement.id, [...lines]);
  }

  connect(request: ConnectRequest): Promise<ConnectStart> {
    return this.run('connect', null, request, () => ({
      url: `https://fake-provider.example.com/${request.hasProviderAccount ? 'authorize' : 'onboarding'}?state=${encodeURIComponent(request.state)}`,
    }));
  }

  connectionStatus(access: ProviderAccess): Promise<ProviderConnectionStatus> {
    return this.run('connectionStatus', access, null, () => this.status);
  }

  createCustomer(
    access: ProviderAccess,
    request: ProviderCustomerRequest,
  ): Promise<ProviderCustomer> {
    return this.run('createCustomer', access, request, () => {
      const state = this.stateOf(access);
      const existing = state.customerKeys.get(request.idempotencyKey);
      if (existing) return { id: existing };
      const id = this.next('cst');
      state.customers.set(id, { id, request });
      state.customerKeys.set(request.idempotencyKey, id);
      return { id };
    });
  }

  createPayment(access: ProviderAccess, request: ProviderPaymentRequest): Promise<ProviderPayment> {
    return this.run('createPayment', access, request, () => {
      const state = this.stateOf(access);
      const existing = state.paymentKeys.get(request.idempotencyKey);
      if (existing) return this.paymentOf(state, existing);
      if (!Number.isInteger(request.amountCents) || request.amountCents < 1) {
        throw new ProviderError('rejected', 'The amount is not a positive number of cents.');
      }
      if (!state.customers.has(request.customerId)) {
        throw new ProviderError('not_found', 'No such customer.');
      }
      const id = this.next('tr');
      const payment: ProviderPayment = {
        id,
        status: 'open',
        amountCents: request.amountCents,
        currency: request.currency,
        description: request.description,
        customerId: request.customerId,
        sequenceType: request.sequenceType,
        metadata: { ...request.metadata },
        checkoutUrl: `https://fake-provider.example.com/checkout/${id}`,
        mandateId: null,
        testmode: access.testmode,
      };
      state.payments.set(id, payment);
      state.paymentKeys.set(request.idempotencyKey, id);
      return payment;
    });
  }

  getPayment(access: ProviderAccess, paymentId: string): Promise<ProviderPayment> {
    return this.run('getPayment', access, paymentId, () =>
      this.paymentOf(this.stateOf(access), paymentId),
    );
  }

  listCustomerPayments(access: ProviderAccess, customerId: string): Promise<ProviderPayment[]> {
    return this.run('listCustomerPayments', access, customerId, () =>
      [...this.stateOf(access).payments.values()].filter(
        (payment) => payment.customerId === customerId,
      ),
    );
  }

  createRefund(access: ProviderAccess, request: ProviderRefundRequest): Promise<ProviderRefund> {
    return this.run('createRefund', access, request, () => {
      const state = this.stateOf(access);
      const existing = state.refundKeys.get(request.idempotencyKey);
      if (existing) return this.refundOf(state, existing);
      const payment = this.paymentOf(state, request.paymentId);
      if (payment.status !== 'paid') {
        throw new ProviderError('rejected', 'Only a paid payment can be refunded.');
      }
      const refunded = [...state.refunds.values()]
        .filter(
          (refund) =>
            refund.paymentId === payment.id &&
            refund.status !== 'failed' &&
            refund.status !== 'canceled',
        )
        .reduce((sum, refund) => sum + refund.amountCents, 0);
      if (
        !Number.isInteger(request.amountCents) ||
        request.amountCents < 1 ||
        refunded + request.amountCents > payment.amountCents
      ) {
        throw new ProviderError('rejected', 'The refund is not within what was paid.');
      }
      const id = this.next('re');
      const refund: ProviderRefund = {
        id,
        paymentId: payment.id,
        amountCents: request.amountCents,
        status: this.newRefundStatus,
        metadata: { ...request.metadata },
      };
      state.refunds.set(id, refund);
      state.refundKeys.set(request.idempotencyKey, id);
      return refund;
    });
  }

  getRefund(access: ProviderAccess, paymentId: string, refundId: string): Promise<ProviderRefund> {
    return this.run('getRefund', access, { paymentId, refundId }, () => {
      const refund = this.refundOf(this.stateOf(access), refundId);
      if (refund.paymentId !== paymentId) throw new ProviderError('not_found', 'No such refund.');
      return refund;
    });
  }

  listRefunds(access: ProviderAccess, paymentId: string): Promise<ProviderRefund[]> {
    return this.run('listRefunds', access, paymentId, () => {
      const state = this.stateOf(access);
      this.paymentOf(state, paymentId);
      return [...state.refunds.values()].filter((refund) => refund.paymentId === paymentId);
    });
  }

  listSettlements(access: ProviderAccess): Promise<ProviderSettlement[]> {
    return this.run('listSettlements', access, null, () => [...this.stateOf(access).settlements]);
  }

  listSettlementLines(
    access: ProviderAccess,
    settlementId: string,
  ): Promise<ProviderSettlementLine[]> {
    return this.run('listSettlementLines', access, settlementId, () => {
      const lines = this.stateOf(access).settlementLines.get(settlementId);
      if (!lines) throw new ProviderError('not_found', 'No such settlement.');
      return [...lines];
    });
  }

  private run<T>(
    method: FakeMethod,
    access: ProviderAccess | null,
    request: unknown,
    work: () => T,
  ): Promise<T> {
    this.calls.push({ method, access, request, tokenVersion: this.tokenVersion });
    const fault = this.faults.get(method)?.shift();
    return new Promise<T>((resolve, reject) => {
      try {
        if (fault === 'before') {
          throw new ProviderError('unavailable', 'The provider did not answer.');
        }
        if (access && this.status === 'broken') {
          throw new ProviderError('unauthorized', 'The connection no longer works.');
        }
        const result = work();
        if (fault === 'lost-response') {
          throw new ProviderError('unavailable', 'The provider did not answer.');
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  private stateOf(access: ProviderAccess): WorkspaceState {
    const key = `${access.workspaceId}:${access.testmode}`;
    let state = this.workspaces.get(key);
    if (!state) {
      state = {
        customers: new Map(),
        customerKeys: new Map(),
        payments: new Map(),
        paymentKeys: new Map(),
        refunds: new Map(),
        refundKeys: new Map(),
        settlements: [],
        settlementLines: new Map(),
      };
      this.workspaces.set(key, state);
    }
    return state;
  }

  private paymentOf(state: WorkspaceState, id: string): ProviderPayment {
    const payment = state.payments.get(id);
    if (!payment) throw new ProviderError('not_found', 'No such payment.');
    return payment;
  }

  private refundOf(state: WorkspaceState, id: string): ProviderRefund {
    const refund = state.refunds.get(id);
    if (!refund) throw new ProviderError('not_found', 'No such refund.');
    return refund;
  }

  private next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_fake${this.sequence}`;
  }
}
