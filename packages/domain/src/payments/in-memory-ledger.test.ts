import { InMemoryPaymentLedger } from './testing/in-memory-ledger.ts';
import { ledgerContract } from './testing/ledger-contract.ts';

ledgerContract('InMemoryPaymentLedger', async () => ({
  ledger: new InMemoryPaymentLedger('workspace-a'),
  otherLedger: new InMemoryPaymentLedger('workspace-b'),
  newClient: async () => 'client-a',
  newOtherClient: async () => 'client-b',
}));
