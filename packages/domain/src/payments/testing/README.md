# `src/payments/testing/`

Module: Test-only (`@fivvi/domain/testing`): `FakePaymentProvider` (in-memory, scripted outcomes: `failNext(method, 'before' | 'lost-response')`, `settle`, `pay`, `refreshAccessToken`, `setConnectionStatus`, `createRefundsAs`, `settleRefund`), `InMemoryPaymentLedger`, `InMemoryRefundLedger`, and the shared contract suites `providerContract`, `ledgerContract` and `refundLedgerContract` that every implementation must pass
Spec: E019 AC16
