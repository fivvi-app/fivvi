// Module: Mollie settlement fixtures. Responses of Mollie's Settlements and Balances APIs as
// documented (docs.mollie.com: Get settlement, List settlement payments, List settlement refunds,
// List settlement chargebacks, List balance transactions), with invented IDs. Mollie's test mode
// has no settlements or balances (ADR-020), so every test of payouts and reconciliation (F061)
// starts from these.
// Spec: #496 (F061), ticket #1163; AC1, AC2, AC5, AC6, AC12.
//
// The fixture is the settlement of Wednesday 10 February 2027, reference `1234567.2701.01`,
// € 392,48: Anna de Vries's € 79,00 and Mark Jansen's € 260,00 direct debits, a third client's
// € 79,00 iDEAL first payment, a refund of € 20,00, the fees of € 0,32 (iDEAL), € 0,70 (2 × SEPA
// direct debit) and € 0,25 (refund), and a failed direct debit's fee of € 4,25 (a balance
// transaction). `unknownPayment` adds an iDEAL payment (`tr_unknown0001`, € 45,00) that no Fivvi
// payment has (AC2); `chargeback` adds a reversal of Anna's payment and its fee.
//
// Shapes follow the documentation: amounts are `{ value: '392.48', currency: 'EUR' }` strings, a
// list is `{ count, _embedded, _links }`, the settlement's `periods` hold `revenue` and `costs`
// per year and month, a balance transaction has `resultAmount`, `initialAmount` and `context`.
// Values differ from reality where the acceptance criteria need simple sums: a cost's
// `amountVat` is `null` and its `amountGross` is the fee. Nothing here is personal data: the
// descriptions name the offer and the month, not a client.

export const AC1_SETTLEMENT_ID = 'stl_test0001';
export const AC1_REFERENCE = '1234567.2701.01';
export const UNKNOWN_PAYMENT_ID = 'tr_unknown0001';

export type MollieSettlementStatus = 'open' | 'pending' | 'paidout' | 'failed';

export interface MollieAmount {
  value: string;
  currency: 'EUR';
}

export interface MollieSettlementEntry {
  description: string;
  method: string;
  count: number;
  amountNet: MollieAmount;
  amountVat: MollieAmount | null;
  amountGross: MollieAmount;
}

export interface MollieSettlementCost extends MollieSettlementEntry {
  rate: {
    fixed: MollieAmount | null;
    percentage: string | null;
  };
}

export interface MollieSettlementPeriod {
  revenue: MollieSettlementEntry[];
  costs: MollieSettlementCost[];
  invoiceId?: string;
  invoiceReference?: string;
}

export interface MollieSettlement {
  resource: 'settlement';
  id: string;
  reference: string | null;
  createdAt: string;
  settledAt: string | null;
  status: MollieSettlementStatus;
  amount: MollieAmount;
  balanceId: string;
  periods: Record<string, Record<string, MollieSettlementPeriod>>;
  _links: Record<string, { href: string; type: string }>;
}

export interface MolliePayment {
  resource: 'payment';
  id: string;
  mode: 'live';
  createdAt: string;
  status: 'paid';
  paidAt: string;
  amount: MollieAmount;
  description: string;
  method: 'ideal' | 'directdebit';
  sequenceType: 'first' | 'recurring';
  customerId: string;
  mandateId: string;
  settlementAmount: MollieAmount;
  settlementId: string;
  metadata: Record<string, string> | null;
  _links: Record<string, { href: string; type: string }>;
}

export interface MollieRefund {
  resource: 'refund';
  id: string;
  mode: 'live';
  description: string;
  amount: MollieAmount;
  settlementAmount: MollieAmount;
  status: 'refunded';
  paymentId: string;
  settlementId: string;
  createdAt: string;
  metadata: Record<string, string> | null;
  _links: Record<string, { href: string; type: string }>;
}

export interface MollieChargeback {
  resource: 'chargeback';
  id: string;
  amount: MollieAmount;
  settlementAmount: MollieAmount;
  createdAt: string;
  reason: { code: string; description: string } | null;
  paymentId: string;
  settlementId: string;
  _links: Record<string, { href: string; type: string }>;
}

export interface MollieBalanceTransaction {
  resource: 'balance-transaction';
  id: string;
  type: string;
  resultAmount: MollieAmount;
  initialAmount: MollieAmount;
  createdAt: string;
  context: Record<string, string>;
}

/** A Mollie list response: `count`, the embedded items and the links. */
export interface MollieList<Key extends string, Item> {
  count: number;
  _embedded: Record<Key, Item[]>;
  _links: Record<string, { href: string; type: string } | null>;
}

export interface MollieSettlementFixture {
  /** `GET /v2/settlements/{id}` */
  settlement: MollieSettlement;
  /** `GET /v2/settlements/{id}/payments` */
  payments: MollieList<'payments', MolliePayment>;
  /** `GET /v2/settlements/{id}/refunds` */
  refunds: MollieList<'refunds', MollieRefund>;
  /** `GET /v2/settlements/{id}/chargebacks` */
  chargebacks: MollieList<'chargebacks', MollieChargeback>;
  /** `GET /v2/balances/{balanceId}/transactions` (the transactions of the settlement's period) */
  balanceTransactions: MollieList<'balance_transactions', MollieBalanceTransaction>;
}

export interface MollieSettlementOptions {
  /** `paidout` unless said otherwise; an `open` settlement has no reference and no settled date yet. */
  status?: MollieSettlementStatus;
  /** Adds an iDEAL payment (`UNKNOWN_PAYMENT_ID`) that no Fivvi payment has (AC2). */
  unknownPayment?: boolean;
  /** Adds a reversal of Anna's payment and the fee Mollie charges for it. */
  chargeback?: boolean;
}

const eur = (cents: number): MollieAmount => ({
  value: `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`,
  currency: 'EUR',
});

const link = (href: string) => ({ href, type: 'application/hal+json' });
const SETTLED_AT = '2027-02-10T05:30:12+00:00';

function payment(
  id: string,
  cents: number,
  method: 'ideal' | 'directdebit',
  sequenceType: 'first' | 'recurring',
  customer: string,
  paidAt: string,
): MolliePayment {
  return {
    resource: 'payment',
    id,
    mode: 'live',
    createdAt: paidAt,
    status: 'paid',
    paidAt,
    amount: eur(cents),
    description: 'Membership, February 2027',
    method,
    sequenceType,
    customerId: customer,
    mandateId: `mdt_${customer.slice(4)}`,
    settlementAmount: eur(cents),
    settlementId: AC1_SETTLEMENT_ID,
    metadata: null,
    _links: { self: link(`https://api.mollie.com/v2/payments/${id}`) },
  };
}

function cost(
  description: string,
  method: string,
  count: number,
  fixedCents: number,
): MollieSettlementCost {
  return {
    description,
    method,
    count,
    rate: { fixed: eur(fixedCents), percentage: null },
    amountNet: eur(count * fixedCents),
    amountVat: null,
    amountGross: eur(count * fixedCents),
  };
}

function revenue(
  description: string,
  method: string,
  count: number,
  cents: number,
): MollieSettlementEntry {
  return {
    description,
    method,
    count,
    amountNet: eur(cents),
    amountVat: null,
    amountGross: eur(cents),
  };
}

function list<Key extends string, Item>(key: Key, items: Item[]): MollieList<Key, Item> {
  return {
    count: items.length,
    _embedded: { [key]: items } as Record<Key, Item[]>,
    _links: { self: link('https://api.mollie.com/v2/settlements'), previous: null, next: null },
  };
}

/** The AC1 settlement as Mollie reports it, with the variants of `options`. */
export function mollieSettlementFixture(
  options: MollieSettlementOptions = {},
): MollieSettlementFixture {
  const status = options.status ?? 'paidout';

  const payments = [
    payment(
      'tr_test0001',
      7900,
      'directdebit',
      'recurring',
      'cst_test0001',
      '2027-01-29T08:00:00+00:00',
    ),
    payment(
      'tr_test0002',
      26000,
      'directdebit',
      'recurring',
      'cst_test0002',
      '2027-01-29T08:00:00+00:00',
    ),
    payment('tr_test0003', 7900, 'ideal', 'first', 'cst_test0003', '2027-02-08T10:15:00+00:00'),
  ];
  if (options.unknownPayment) {
    payments.push(
      payment(
        UNKNOWN_PAYMENT_ID,
        4500,
        'ideal',
        'first',
        'cst_unknown01',
        '2027-02-08T11:00:00+00:00',
      ),
    );
  }

  const refunds: MollieRefund[] = [
    {
      resource: 'refund',
      id: 're_test0001',
      mode: 'live',
      description: 'Refund, February 2027',
      amount: eur(2000),
      settlementAmount: eur(-2000),
      status: 'refunded',
      paymentId: 'tr_test0001',
      settlementId: AC1_SETTLEMENT_ID,
      createdAt: '2027-02-04T09:00:00+00:00',
      metadata: null,
      _links: { self: link('https://api.mollie.com/v2/payments/tr_test0001/refunds/re_test0001') },
    },
  ];

  const chargebacks: MollieChargeback[] = options.chargeback
    ? [
        {
          resource: 'chargeback',
          id: 'chb_test0001',
          amount: eur(7900),
          settlementAmount: eur(-7900),
          createdAt: '2027-02-05T07:00:00+00:00',
          reason: { code: 'AC04', description: 'Account closed' },
          paymentId: 'tr_test0001',
          settlementId: AC1_SETTLEMENT_ID,
          _links: {
            self: link('https://api.mollie.com/v2/payments/tr_test0001/chargebacks/chb_test0001'),
          },
        },
      ]
    : [];

  const idealCount = options.unknownPayment ? 2 : 1;
  const costs = [
    cost('iDEAL', 'ideal', idealCount, 32),
    cost('SEPA Direct Debit', 'directdebit', 2, 35),
    cost('Refunds', 'refund', 1, 25),
    ...(options.chargeback ? [cost('Chargebacks', 'chargeback', 1, 1000)] : []),
  ];

  const balanceTransactions: MollieBalanceTransaction[] = [
    {
      resource: 'balance-transaction',
      id: 'baltr_test0001',
      type: 'failed-payment-fee',
      resultAmount: eur(-425),
      initialAmount: eur(-425),
      createdAt: '2027-02-03T08:00:00+00:00',
      context: { paymentId: 'tr_test0004', paymentDescription: 'Membership, February 2027' },
    },
  ];

  const total =
    payments.reduce((sum, p) => sum + toCents(p.settlementAmount), 0) +
    refunds.reduce((sum, r) => sum + toCents(r.settlementAmount), 0) +
    chargebacks.reduce((sum, c) => sum + toCents(c.settlementAmount), 0) -
    costs.reduce((sum, c) => sum + toCents(c.amountGross), 0) +
    balanceTransactions.reduce((sum, t) => sum + toCents(t.resultAmount), 0);

  const settlement: MollieSettlement = {
    resource: 'settlement',
    id: AC1_SETTLEMENT_ID,
    reference: status === 'open' ? null : AC1_REFERENCE,
    createdAt: '2027-02-10T05:30:12+00:00',
    settledAt: status === 'open' ? null : SETTLED_AT,
    status,
    amount: eur(total),
    balanceId: 'bal_test0001',
    periods: {
      '2027': {
        '02': {
          revenue: [
            revenue('iDEAL', 'ideal', idealCount, 7900 + (options.unknownPayment ? 4500 : 0)),
            revenue('SEPA Direct Debit', 'directdebit', 2, 33900),
            revenue('Refunds', 'refund', 1, -2000),
            ...(options.chargeback ? [revenue('Chargebacks', 'chargeback', 1, -7900)] : []),
          ],
          costs,
          invoiceId: 'inv_test0001',
          invoiceReference: 'MOL-2027-0001',
        },
      },
    },
    _links: {
      self: link(`https://api.mollie.com/v2/settlements/${AC1_SETTLEMENT_ID}`),
      payments: link(`https://api.mollie.com/v2/settlements/${AC1_SETTLEMENT_ID}/payments`),
      refunds: link(`https://api.mollie.com/v2/settlements/${AC1_SETTLEMENT_ID}/refunds`),
      chargebacks: link(`https://api.mollie.com/v2/settlements/${AC1_SETTLEMENT_ID}/chargebacks`),
    },
  };

  return {
    settlement,
    payments: list('payments', payments),
    refunds: list('refunds', refunds),
    chargebacks: list('chargebacks', chargebacks),
    balanceTransactions: list('balance_transactions', balanceTransactions),
  };
}

function toCents(amount: MollieAmount): number {
  return Math.round(Number(amount.value) * 100);
}
