import {
  type NewPayout,
  type NewPayoutLine,
  PAYOUT_LINE_TYPES,
  type PayoutDetails,
  type PayoutLedger,
  type PayoutLineRecord,
  type PayoutRecord,
  type PayoutStatusChange,
  type RecordPayoutStatusChange,
} from '../../commerce/payout-ledger.ts';

// An in-memory payout ledger of one workspace, for tests of the reconciliation rules and of the
// features on top of them. `packages/database` has the real one; the payout ledger contract suite
// keeps them alike. Test-only.

export class InMemoryPayoutLedger implements PayoutLedger {
  private readonly payouts = new Map<string, PayoutRecord>();
  private readonly lines = new Map<string, PayoutLineRecord[]>();
  private readonly changes = new Map<string, PayoutStatusChange[]>();
  private sequence = 0;
  readonly workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  insertPayout(payout: NewPayout): Promise<{ payout: PayoutRecord; created: boolean }> {
    const existing = [...this.payouts.values()].find(
      (stored) => stored.providerSettlementId === payout.providerSettlementId,
    );
    if (existing) return Promise.resolve({ payout: existing, created: false });
    this.sequence += 1;
    const record: PayoutRecord = {
      id: `${this.workspaceId}-payout-${this.sequence}`,
      workspaceId: this.workspaceId,
      providerSettlementId: payout.providerSettlementId,
      reference: payout.reference,
      settledAt: payout.settledAt,
      amountCents: payout.amountCents,
      status: payout.status,
      fetchedAt: payout.fetchedAt,
      createdAt: payout.fetchedAt,
    };
    this.payouts.set(record.id, record);
    this.lines.set(record.id, []);
    this.changes.set(record.id, [
      {
        payoutId: record.id,
        from: null,
        to: payout.status,
        occurredAt: payout.fetchedAt,
        source: payout.source,
      },
    ]);
    return Promise.resolve({ payout: record, created: true });
  }

  refreshPayout(payoutId: string, details: PayoutDetails): Promise<PayoutRecord> {
    const payout = this.payouts.get(payoutId);
    if (!payout) return Promise.reject(new Error('No such payout.'));
    const refreshed: PayoutRecord = {
      ...payout,
      reference: details.reference ?? payout.reference,
      settledAt: details.settledAt ?? payout.settledAt,
      // Only a fetch as new as the stored one says what the amount is now.
      amountCents: details.fetchedAt >= payout.fetchedAt ? details.amountCents : payout.amountCents,
      fetchedAt: details.fetchedAt > payout.fetchedAt ? details.fetchedAt : payout.fetchedAt,
    };
    this.payouts.set(payoutId, refreshed);
    return Promise.resolve(refreshed);
  }

  recordPayoutStatusChange(change: RecordPayoutStatusChange): Promise<boolean> {
    const payout = this.payouts.get(change.payoutId);
    const lines = this.changes.get(change.payoutId);
    if (!payout || !lines || payout.status !== change.from || change.from === change.to) {
      return Promise.resolve(false);
    }
    lines.push({
      payoutId: change.payoutId,
      from: change.from,
      to: change.to,
      occurredAt: change.occurredAt,
      source: change.source,
    });
    this.payouts.set(change.payoutId, { ...payout, status: change.to });
    return Promise.resolve(true);
  }

  insertPayoutLines(payoutId: string, lines: readonly NewPayoutLine[]): Promise<number> {
    const stored = this.lines.get(payoutId);
    const payout = this.payouts.get(payoutId);
    if (!stored || !payout) return Promise.reject(new Error('No such payout.'));
    let added = 0;
    for (const line of lines) {
      if (stored.some((existing) => existing.providerLineId === line.providerLineId)) continue;
      this.sequence += 1;
      stored.push({
        id: `${this.workspaceId}-payout-line-${this.sequence}`,
        payoutId,
        providerLineId: line.providerLineId,
        type: line.type,
        feeKind: line.feeKind,
        amountCents: line.amountCents,
        description: line.description,
        count: line.count,
        matchedPaymentId: null,
        matchedRefundId: null,
        matchedChargebackId: null,
        matched: false,
        createdAt: payout.fetchedAt,
      });
      added += 1;
    }
    return Promise.resolve(added);
  }

  findPayout(payoutId: string): Promise<PayoutRecord | undefined> {
    return Promise.resolve(this.payouts.get(payoutId));
  }

  findPayoutBySettlement(providerSettlementId: string): Promise<PayoutRecord | undefined> {
    return Promise.resolve(
      [...this.payouts.values()].find((p) => p.providerSettlementId === providerSettlementId),
    );
  }

  listPayouts(): Promise<PayoutRecord[]> {
    // As the database orders them: not settled yet first, then the newest settled; ties by the
    // time they were stored (newest first), then by ID.
    const time = (payout: PayoutRecord) => payout.settledAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const byIdentity = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const order = (a: PayoutRecord, b: PayoutRecord) => {
      const [x, y] = [time(a), time(b)];
      if (x !== y) return x < y ? 1 : -1;
      return b.createdAt.getTime() - a.createdAt.getTime() || byIdentity(a.id, b.id);
    };
    return Promise.resolve([...this.payouts.values()].sort(order));
  }

  listPayoutLines(payoutId: string): Promise<PayoutLineRecord[]> {
    const rank = (line: PayoutLineRecord) => PAYOUT_LINE_TYPES.indexOf(line.type);
    const byIdentity = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    return Promise.resolve(
      [...(this.lines.get(payoutId) ?? [])].sort(
        (a, b) => rank(a) - rank(b) || byIdentity(a.providerLineId, b.providerLineId),
      ),
    );
  }

  listPayoutStatusChanges(payoutId: string): Promise<PayoutStatusChange[]> {
    return Promise.resolve([...(this.changes.get(payoutId) ?? [])]);
  }
}
