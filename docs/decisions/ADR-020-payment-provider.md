# ADR-020: Payment provider and merchant model

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-20 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §2.8, §53, §90–§97; ROADMAP.md M11, §4.4, §7, §12, §13 (R17, R19, R20), §14 decision 14; ADR-004, ADR-006, ADR-010, ADR-011, ADR-012; E019, F052–F061; open questions QC05, QC06, QC09, QC12, QC13, QC16 |

## Context

The pilot gym won't switch without commerce, so memberships, session packs, recurring payments and invoices ship before go-live in M11 (ROADMAP decision 9). The commerce requirements (`PRODUCT.md §90–§97`) and the decisions behind them are in PR #141, which this ADR builds on. Decision 14 (the payment provider, Mollie or Stripe, and the merchant model) is the M11 opening spike (E019): no money code is written before the owner decides it.

What the product needs from a provider (`PRODUCT.md §94–§97`):

- **The gym is the merchant.** Client money goes from the provider to the gym's bank account and never through an account of Trainer Hub (R19).
- **First payment by iDEAL** when a client confirms a membership or pack, which also gives the **SEPA Direct Debit mandate** (QC06).
- **Recurring payments:** on each due date Trainer Hub asks the provider to collect the amount under the mandate. The payment schedule belongs to the agreement, not to the class times (ADR-012).
- **Exactly once:** a due amount is charged once, even when a job retries or the provider sends the same event twice (R17).
- **Failed payments, refunds and reversed debits** reach the owner and the client, and get credit notes (QC05, §96).
- **Weekly payouts**, and per payout the payments, refunds, reversals and fees in it (§97).
- **Test mode in every Railway PR preview** (ADR-011): no real money before G4.
- **One cutover, no parallel run** (ROADMAP §7): at the cutover every client gets a first-payment link that creates the new mandate (QC09), so the first-payment flow carries the whole switch-over.
- Only the **Owner** handles money (decision 13); the trainer and client apps never take payments (QC16).

Both candidates were researched against their primary sources on 19–20 October 2026. The findings, with a source per claim, are in [`research/ADR-020-mollie.md`](research/ADR-020-mollie.md) and [`research/ADR-020-stripe.md`](research/ADR-020-stripe.md). Both can do everything above; they differ in how well they fit our previews, the Dutch gym and our data-protection paperwork.

### Comparison

| Need | Mollie Connect for Platforms | Stripe Connect (direct charges, full-Dashboard accounts) |
|---|---|---|
| Gym as merchant, money never with us | Yes: the gym's own Mollie organisation, connected by OAuth; payments created with its token are its own, with its name on the bank statement and its liability | Yes: an account with full Dashboard and Stripe-collected fees (v1 "Standard" defaults, or Accounts v2 `merchant`), direct charges with the `Stripe-Account` header |
| Platform prerequisite | A Mollie partner account (Trainer Hub's own Mollie organisation, KYC'd) | A Stripe platform account; whether it must be live and verified before live connected accounts: not confirmed |
| Gym onboarding (KYC) | Client Links: we pre-fill the gym, the gym finishes Mollie's onboarding in Dutch (KvK, legal representative, UBO, ID, a bank verification payment, website). SEPA Direct Debit is reviewed separately, "within 3 business days" | Stripe-hosted Account Links or embedded onboarding (KvK, representative, owners, directors, IBAN). SEPA Direct Debit needs extra verification and the `sepa_debit_payments` capability |
| iDEAL first payment → SEPA mandate | `sequenceType=first` with `method=ideal` creates a `directdebit` mandate; the first payment can be the real first amount | iDEAL PaymentIntent with `setup_future_usage=off_session` yields a generated `sepa_debit` payment method and mandate |
| Recurring collection on our due date | `sequenceType=recurring` payment with the mandate, created by our cron; no subscription needed | Off-session PaymentIntent with the SEPA payment method, created by our cron; no Billing needed (Billing would add 0.7%) |
| SEPA timing | Paid after 1 business day, can still fail for 5 working days; in the gym's balance after 9 business days | Pending, final after about 6 business days |
| Reversals | Chargeback object with the bank's reason code, via the payment's webhook; 8 weeks no questions, 13 months if unauthorised; the gym can't dispute | `charge.dispute.created`; same SEPA windows; final, no appeal |
| Idempotency | `Idempotency-Key` on every POST, kept **one hour**, tied to the credential (an OAuth token lives one hour) | `Idempotency-Key` on every POST, kept at least **24 hours** |
| Webhooks | Classic: `webhookUrl` **per payment**, body is only the id (no signature; we fetch the resource), 10 retries over 26 hours. Signed next-gen webhooks exist but allow 2 subscriptions per organisation in test mode | Signed (HMAC-SHA256) per endpoint, retries for 3 days, no ordering; **16 endpoints per account**, Connect events need a Connect endpoint |
| Test mode in PR previews | `testmode` with the gym's OAuth token; iDEAL test checkout, recurring payments set to paid or failed, refunds and chargebacks. Each payment carries the preview's own webhook URL, so **every preview works without a relay**. Settlements and balances can't be tested | Sandboxes with test connected accounts, test IBANs for every SEPA outcome, simulated disputes. Webhook endpoints are per account (max 16), so previews need **one stable endpoint that relays to each preview**, or the Stripe CLI |
| Weekly payouts | Weekly on Wednesdays is Mollie's default; the gym sets it in its own dashboard; up to 5 payouts a month free (below €500,000 a year) | Daily by default; weekly is set through the API only if the platform takes platform controls, otherwise by the gym in its Dashboard; free |
| Reconciliation | Settlements API: per payout (its T-reference on the bank statement) the payments, refunds and chargebacks; Balances API: a ledger with fees and failed-payment fees | Balance transactions per payout with the `Stripe-Account` header; payout reconciliation report |
| Platform fee later | `applicationFee` per payment (documented for OAuth payments and subscriptions), moved to our balance on success, not refunded; we invoice it with VAT | `application_fee_amount` per direct charge, no Stripe fee on it; not refunded unless asked |
| Data protection | Mollie B.V., Amsterdam, DNB-licensed (F0038). Mollie is an **independent controller** for payment data and offers no DPA for payments; transfers outside the EEA under SCCs; no public data-location statement or sub-processor list | Stripe is the gym's **processor** under its DPA (independent controller for fraud, AML and its own purposes); data goes to Stripe, LLC in the US under the DPF and SCCs; public sub-processor list |
| SDK | `mollie-api-typescript` (OAuth, test mode, idempotency, signature checks); the legacy Node SDK goes into maintenance on 17 November 2026 | `stripe` Node SDK; Accounts v2 still sends preview API versions in places |

### Fees per payment (public list prices, Netherlands, 20 October 2026)

Paid by the gym as the merchant in both models, so Trainer Hub pays no per-payment or per-account fee. These are the public list prices; the comparison with what the pilot pays today stays in the owner's private notes (QC13).

| Event | Mollie | Stripe |
|---|---|---|
| iDEAL \| Wero (first payment) | €0.32 | €0.29 |
| SEPA Direct Debit (each recurring payment) | €0.35 | €0.35 |
| Refund | €0.25 (help centre) | €0 (the original fee isn't returned) |
| Failed direct debit | Per merchant since 2022, shown in the gym's dashboard: not confirmed | €3.50 |
| Reversed direct debit (storno) | €10, banks may add €4.50 (help centre; per merchant since 2022: not confirmed) | €15 |
| Payout | Weekly is free (5 a month) | Free |
| Monthly or platform fee | None for online payments; Connect terms for the platform: not confirmed | None ("Stripe handles pricing") |

A monthly membership therefore costs the gym €0.32 + €0.35 a month with Mollie and €0.29 + €0.35 with Stripe: a difference of three cents per client, once. The exceptions (refunds, failures, reversals) go both ways. **Fees don't decide this.**

### What both share

- **Wero.** iDEAL is moving onto Wero: Dutch banks connect in October 2026 and iDEAL is gone by the end of 2027 (EPI). Neither provider supports a Wero payment that creates a mandate today; Wero recurring is planned for 2027. Whether an iDEAL payment that runs on Wero rails still creates a SEPA mandate is documented by neither. Mandates already given keep working, because they run on SEPA. The fallback is the same with both: the client enters their IBAN and accepts the mandate on our page, and we create the mandate through the provider (Mollie: Mandates API; Stripe: a SEPA Direct Debit payment method with mandate acceptance), with the first amount paid separately or collected by direct debit.
- **Failed recurring payments are ours.** Neither provider retries a payment we create ourselves (Mollie's and Stripe's retries belong to their subscription products). So the retry and access rules of QC05 are Trainer Hub's, and a failure is only final after the debit's rejection window.
- **Reconciliation runs on our ledger.** Both report per payout what it contains; we match each line to our own payment, refund or reversal (§97).

## Decision

**Proposed: Mollie Connect for Platforms, with each gym as the merchant on its own Mollie account.** Trainer Hub never holds client money, takes no application fee on client payments in the MVP (Mollie's `applicationFee` stays the option for later; how Trainer Hub bills gyms is still open, ROADMAP decision 16), and keeps the provider behind one interface so Stripe stays a documented fallback.

Why Mollie over Stripe:

1. **Previews work as they are.** Each payment carries its own `webhookUrl` and `redirectUrl`, so every Railway PR environment receives its own test webhooks with no relay service and no endpoint per preview. With Stripe, previews need a relay or the CLI, because an account has at most 16 webhook endpoints.
2. **It fits a small Dutch gym.** Dutch onboarding and dashboard, a Dutch company with a Dutch (DNB) licence, and weekly payouts as the default, chosen by the gym itself. With Stripe, weekly payouts on a full-Dashboard account need either platform controls or the gym's own setting.
3. **Connect for Platforms is exactly our model**: the merchant owns the payment, its refunds and its chargebacks; Mollie verifies the merchant and carries the loss protection. Stripe needs the right combination of controller properties or v2 responsibilities, some still on preview API versions.
4. Stripe's strengths (signed webhooks, 24-hour idempotency, more test scenarios, faster SEPA settlement) are conveniences our own design needs anyway: we store events, fetch the resource and keep our own ledger and keys.

### Rules that follow

**Connection (E019)**

- The **Owner** connects the workspace's Mollie account in the web app with OAuth (decision 13): through a Client Link for a gym without Mollie, or the authorise URL for a gym that has one. One connection per workspace, with the gym's profile id.
- The scopes are fixed before go-live, because adding scopes later makes every gym authorise again: payments, refunds, customers and mandates (read and write), settlements, balances, invoices, organisations and profiles (read), onboarding (read and write). No subscriptions scope: we don't use Mollie Subscriptions.
- The refresh token is a secret of the workspace: stored encrypted, tenant-scoped (ADR-006), never logged or sent to Sentry. Access tokens (one hour) are refreshed before they expire, and always before a batch of collections.
- Payments are only offered while Mollie reports the gym can receive payments (Capabilities API, `payments` enabled) and SEPA Direct Debit is active on its profile.

**Payments**

- **First payment:** a Mollie customer per client and workspace, then an iDEAL payment with `sequenceType=first` for the first real amount; Mollie's hosted checkout on the web (QC16). The resulting `directdebit` mandate is stored with the agreement.
- **Recurring payments:** on the due date the daily cron (ADR-010) creates a `sequenceType=recurring` payment under the mandate. **We don't use the Mollie Subscriptions API**: the agreement's payment schedule is ours (a separate clock, ADR-012) and the product needs pausing, pro-rating and our own failed-payment rules (QC05).
- **Single class:** a one-off iDEAL payment (`sequenceType=oneoff`); the spot is held while the client pays (§95, QC16), at least as long as the checkout can stay open.
- Amounts in euro cents, as integers; VAT per offer (§90).

**Exactly once (R17)**

- Before calling Mollie we insert our own payment row, unique on (agreement, due date) for recurring payments, and send its id as the `Idempotency-Key` and in the payment's `metadata`.
- Mollie keeps a key for only one hour and per credential (a refreshed token is a new credential). So after a lost response, a retry first looks the payment up by our metadata among the customer's payments, and only creates it when it isn't there. Tests cover the retried job, the refreshed token and the duplicate webhook.
- **Webhooks:** each payment's `webhookUrl` points to the environment that created it. The handler stores the notification, fetches the payment with the workspace's token (the id alone proves nothing, so a forged call changes nothing), and applies the state change once; replaying it does nothing. Classic webhooks only; Mollie's signed next-gen webhooks can follow when Mollie calls them ready for payments, as a second, not a replacement, signal.
- A recurring payment is **paid** for the client when Mollie says so, but stays reversible: a rejection within 5 working days or a reversal within 8 weeks (13 months if unauthorised) becomes a reversal line with a credit note (§96), never an edit of the payment.

**Refunds and reversals**

- Only the Owner refunds (QC12, decision 13), fully or in part, through the Refunds API with an idempotency key. The UI warns that refunding a direct debit the client may still reverse can pay them twice.
- Reversals and failed debits arrive as the payment's chargeback or failure, with the bank's reason code. The owner and the client get an email (§94); what happens to booking access is the offer's setting (QC05).

**Payouts and reconciliation (§97)**

- Mollie pays the gym out weekly; the gym chooses the day in its own Mollie dashboard (Mollie has no documented API for the schedule). The web app shows the gym how.
- Per settlement (the T-reference on the gym's bank statement) Trainer Hub lists its payments, refunds, chargebacks and fees from the Settlements and Balances APIs, and shows every line it can't match. Mollie's test mode has no settlements or balances, so reconciliation is tested with fixtures built from Mollie's documented responses, and checked live on the pilot's first payout.

**Environments (ADR-011)**

- Production holds Trainer Hub's live OAuth app credentials; `development` and every PR environment only test-mode values, never live ones (`ENVIRONMENTS.md §7`). Every API call outside production sends `testmode=true`.
- A PR environment can't run the OAuth connection itself (the app's redirect URL is fixed), so it starts with a connected test workspace: the seed connects it with a test refresh token kept in `development`. The connection flow itself is tested on `development`'s stable domain.
- A preview that is deleted stops answering webhooks; that only affects test payments.

**Data protection (for the owner and `docs/legal`)**

- The gym contracts Mollie directly. Mollie sees itself as an **independent controller** for the payment data, not as Trainer Hub's sub-processor. Trainer Hub, acting for the gym through OAuth, processes the client's payment data (name, email, mandate and payment status, the masked IBAN) as the gym's **processor**. This changes the role mapping, the DPIA (which today says no payments), the processor agreement, the privacy texts and the retention policy for invoices. Those documents stay the owner's.
- Trainer Hub sends Mollie only what a payment needs: name, email, amounts, a description without health or note content, and our ids. It doesn't keep full IBANs.

## Consequences

- **Positive:** the gym is the merchant and Mollie the licensed party: Trainer Hub never holds client money (R19).
- **Positive:** previews test the full flow, from the iDEAL checkout to the mandate, recurring payments, failures, refunds and reversals, each preview with its own webhooks.
- **Positive:** a Dutch gym gets Dutch onboarding, support and weekly payouts by default.
- **Positive:** our own schedule, ledger and idempotency keep a later provider switch possible: the provider sits behind one interface in the domain.
- **Negative:** Mollie's one-hour, per-token idempotency is weaker than Stripe's; the lookup by metadata before a retry is required, not optional.
- **Negative:** classic webhooks are unsigned; safety rests on fetching every resource ourselves.
- **Negative:** reconciliation can't be tested end to end before real money; the first live payout of the pilot is its real test.
- **Negative:** a direct debit reaches the gym's balance after 9 business days; with weekly payouts the money of a debit arrives up to two weeks later. Stripe is a few days faster.
- **Negative:** Mollie offers no DPA for payment data; the legal documents describe it as an independent controller, which the owner must confirm.
- **Follow-ups:** E019 builds the connection, the provider interface and the webhook handling first; F057–F061 build on it. Trainer Hub's Mollie partner account is opened by the owner. The questions below are asked of Mollie before E019 starts. The ROADMAP §4.4 legal checklist gets the role changes above.

## Open questions for the owner

1. **Accept Mollie Connect for Platforms**, or prefer Stripe Connect (the alternative below)?
2. **Wero and the cutover mandates (QC06, QC09).** Ask Mollie whether an iDEAL | Wero first payment still creates a SEPA mandate once it runs on Wero rails, and until when. If it doesn't by the cutover, the first-payment link becomes "enter your IBAN and accept the mandate" (the fallback above). Should E019 build that fallback from the start, so the cutover doesn't depend on the answer?
3. **Moving existing mandates (QC09).** Mollie's Mandates API can create a mandate from an IBAN, the signature date and a mandate reference. Whether the pilot's current mandates may legally move to the gym's Mollie account depends on the old provider and the creditor identifier; the decided plan stays a new mandate for every client. Ask the old provider and Mollie only if the owner wants to avoid the first-payment links.
4. **Fees (QC13).** Compare the list prices above with what the pilot pays today, and record only the outcome (cheaper, similar or more expensive per payment). Ask Mollie for the gym's failed-debit and storno fees.
5. **Mollie partner terms.** Trainer Hub needs a Mollie partner account for Connect and Client Links. Ask Mollie for the Connect product-specific terms and any platform cost.
6. **Failed payments (QC05).** Mollie doesn't retry our payments. Proposal to confirm in the F060 spec: no automatic retry in the MVP; the client gets a link to pay the open amount by iDEAL, and the offer's setting decides how long they keep booking.
7. **Data protection.** Confirm the roles above (Mollie as the gym's independent controller, Trainer Hub as the gym's processor for payment data) when the legal documents are updated for M11.
8. **Test connection.** Ask Mollie whether a connected test organisation can take test payments before its verification is complete, so `development` and the previews can use one without a real KYC.

## Alternatives considered

| Option | Why not (now) |
|---|---|
| **Stripe Connect** (direct charges, full-Dashboard accounts paying their own fees; v1 defaults or Accounts v2 `merchant`) | Fully capable, with signed webhooks, 24-hour idempotency, rich SEPA test IBANs and a DPA. But each account has at most 16 webhook endpoints, so per-PR previews need a relay; weekly payouts need platform controls or the gym's own setting; data goes to the US under the DPF and SCCs; Accounts v2 still uses preview API versions in places. **The fallback** if Mollie can't answer the Wero or partner questions |
| **Trainer Hub as the merchant** (Mollie for Marketplaces, Stripe destination charges or separate transfers) | Client money passes through Trainer Hub's balance, with refunds and chargebacks on our account, and brings payment regulation to Trainer Hub (R19). It also makes us the creditor of every mandate |
| **Mollie Subscriptions API** or **Stripe Billing** for recurring payments | The provider would own the payment schedule and its retries, a second clock next to the agreement (ADR-012); pausing and pro-rating fight it; Mollie cancels a subscription and can revoke the mandate after failures; Stripe Billing costs 0.7% of volume |
| **Signed next-gen webhooks only** (Mollie) | Mollie still advises classic webhooks for payments, and test mode allows two subscriptions per organisation, too few for previews |
| **IBAN entry and mandate on our page as the default** | It needs our own mandate screen and doesn't take the first amount; iDEAL does both in one step the clients know. It is the fallback for Wero (open question 2) |
| **The gym's current provider and app** | The goal is to cancel the old app (`PRODUCT.md §2.8`); its mandates and payments can't be driven from Trainer Hub |

## References

- Research notes with a source per claim: [`research/ADR-020-mollie.md`](research/ADR-020-mollie.md), [`research/ADR-020-stripe.md`](research/ADR-020-stripe.md) (accessed 19–20 October 2026)
- Mollie: [Connect overview](https://docs.mollie.com/docs/connect-overview), [recurring payments](https://docs.mollie.com/docs/recurring-payments), [API idempotency](https://docs.mollie.com/reference/api-idempotency), [webhooks](https://docs.mollie.com/reference/webhooks), [testing](https://docs.mollie.com/reference/testing), [payouts](https://docs.mollie.com/docs/payouts), [pricing](https://www.mollie.com/nl/pricing), [data processing](https://help.mollie.com/hc/en-us/articles/360002761193-Do-I-have-to-sign-a-data-processing-agreement-with-Mollie)
- Stripe: [charge types](https://docs.stripe.com/connect/charges), [iDEAL with saved SEPA](https://docs.stripe.com/payments/ideal/save-during-payment), [SEPA Direct Debit](https://docs.stripe.com/payments/sepa-debit), [webhooks](https://docs.stripe.com/webhooks), [Connect pricing](https://stripe.com/connect/pricing), [DPA](https://stripe.com/legal/dpa)
- iDEAL to Wero: [ideal.nl](https://ideal.nl/en/naar-wero), [EPI, 16 July 2026](https://epicompany.eu/media-insights/successful-first-phase-marks-major-next-steps-in-ideal-to-wero-migration/)
- `PRODUCT.md §90–§97` and `docs/design/open-questions.md` QC01–QC16, as in PR #141
