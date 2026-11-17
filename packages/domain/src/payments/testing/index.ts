// Test doubles and shared contract suites for the payment engine (E019). Test-only: import from
// `@fivvi/domain/testing`, never from feature code.
export {
  type FakeCall,
  type FakeFault,
  type FakeMethod,
  FakePaymentProvider,
} from './fake-provider.ts';
export { InMemoryPaymentLedger } from './in-memory-ledger.ts';
export { InMemoryRefundLedger } from './in-memory-refund-ledger.ts';
export { type LedgerHarness, ledgerContract, newPayment } from './ledger-contract.ts';
export {
  type ProviderContractOptions,
  type ProviderHarness,
  providerContract,
} from './provider-contract.ts';
export {
  type RefundLedgerHarness,
  refundLedgerContract,
} from './refund-ledger-contract.ts';
