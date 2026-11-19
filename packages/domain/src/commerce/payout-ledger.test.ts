import { InMemoryPayoutLedger } from '../payments/testing/in-memory-payout-ledger.ts';
import { payoutLedgerContract } from '../payments/testing/payout-ledger-contract.ts';

payoutLedgerContract('InMemoryPayoutLedger', () =>
  Promise.resolve({
    payouts: new InMemoryPayoutLedger('workspace-a'),
    otherPayouts: new InMemoryPayoutLedger('workspace-b'),
  }),
);
