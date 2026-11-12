import { InMemoryPaymentLedger } from './testing/in-memory-ledger.ts';
import { InMemoryRefundLedger } from './testing/in-memory-refund-ledger.ts';
import { refundLedgerContract } from './testing/refund-ledger-contract.ts';

refundLedgerContract('InMemoryRefundLedger', () => {
  const payments = new InMemoryPaymentLedger('workspace-a');
  return Promise.resolve({
    payments,
    refunds: new InMemoryRefundLedger(payments),
    otherRefunds: new InMemoryRefundLedger(new InMemoryPaymentLedger('workspace-b')),
    newClient: async () => 'client-a',
    newTeamMember: async () => 'team-member-john',
  });
});
