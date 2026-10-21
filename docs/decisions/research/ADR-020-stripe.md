# Stripe Connect for Fivvi: research notes

> Source notes for [ADR-020](../ADR-020-payment-provider.md), gathered by a research agent from primary sources on 19–20 October 2026. Provider terms and prices change; re-check before relying on a figure.

Accessed 2026-10-19 and 2026-10-20. Primary sources only (docs.stripe.com, stripe.com, support.stripe.com). Quotes are short excerpts. Some stripe.com pages were served in Dutch (geo-redirect); Dutch quotes are translated where useful. "NOT CONFIRMED" marks items I could not verify. The web tools hit a session limit before the last few fetches (privacy policy, Connected Account Agreement, platform activation). Those items are listed at the end.

## Summary of findings (the decision is in ADR-020, not here)

- If Stripe were chosen, the fitting set-up is an **Accounts v2 `Account` with the `merchant` configuration**: `dashboard: "full"`, `defaults.responsibilities.fees_collector: "stripe"`, `defaults.responsibilities.losses_collector: "stripe"`. In v1 controller terms this is `fees.payer=account`, `losses.payments=stripe`, `requirement_collection=stripe`, `stripe_dashboard.type=full`, the old "Standard" equivalent.
- Use **direct charges** (`Stripe-Account: acct_…` header). Funds land in the gym's balance and never in the platform's. The gym is merchant of record, its SEPA creditor ID and name are used, and Stripe fees, refunds and disputes are debited from the gym.
- **Connect fees for the platform: none** in this configuration.
- Recurring billing: either (a) an iDEAL | Wero SetupIntent or PaymentIntent with `setup_future_usage=off_session`, which generates a `sepa_debit` PaymentMethod and mandate, followed by off-session PaymentIntents from our cron (no Billing fee), or (b) Stripe Billing subscriptions on the connected account (0.7% Billing fee, paid by the gym when fees_collector=stripe).
- **Weekly payouts** on a full-Dashboard account need the platform to use **platform controls**. Otherwise the gym sets its own schedule.

---

## 1. Connected account configurations

**Legacy types are deprecated for new platforms.**
- "The information on this page applies only to platforms that already use legacy connected account types (Standard, Express, or Custom accounts)." Stripe recommends Accounts v2, or Accounts v1 with controller properties. Source: https://docs.stripe.com/connect/accounts
- Legacy table: Standard has "Full Dashboard". Its fraud and dispute liability falls on the "Connected account for direct charges", and its supported charge types are "Direct only". The same page notes "There's an additional cost for using Express or Custom connected accounts." https://docs.stripe.com/connect/accounts

**Accounts v1 controller properties.** Source: https://docs.stripe.com/connect/migrate-to-controller-properties
- `controller.fees.payer`: `account` means "The connected account pays all Stripe fees directly to Stripe, inclusive of payment processing fees"; `application` means "The Connect platform pays all Stripe fees".
- `controller.losses.payments`: `stripe` means "Stripe is liable when this account can't pay back negative balances resulting from payments"; `application` means the platform is responsible.
- `controller.requirement_collection`: `stripe` or `application`.
- `controller.stripe_dashboard.type`: `full`, `express` or `none`.
- The Standard mapping is "`losses.payments`: `stripe`, `fees.payer`: `account`, `requirement_collection`: `stripe`, `stripe_dashboard.type`: `full`". These are also the defaults: "If you create an account without specifying any controller properties, the default values match the behavior of a Standard account."
- Constraint: "`controller.stripe_dashboard.type` = `full` isn't compatible with" `losses.payments=application`, `fees.payer=application` or `requirement_collection=application`. A full Dashboard therefore forces connected-account fees and Stripe loss liability.
- "You can't change the `controller.stripe_dashboard.type` of an existing connected account."

**Accounts v2.** Sources: https://docs.stripe.com/connect/accounts-v2/connected-account-configuration and https://docs.stripe.com/connect/accounts-v2
- `defaults.responsibilities.fees_collector`: `stripe` means "Stripe collects payment fees directly from the connected account"; `application` means the platform collects them.
- `defaults.responsibilities.losses_collector`: `stripe` means "Stripe is liable for the connected account's negative balances. Your platform is still liable for negative balances on your platform account."
- Responsibilities must be set when the Merchant configuration is added: "You can't update their values later."
- `dashboard`: `full`, `express` or `none`. With `full`, the connected account can access "the full Stripe Dashboard".
- KYC: "In most configurations, Stripe is responsible for collecting KYC requirements … Your platform is responsible only when you set `losses_collector` to `application` and `dashboard` to `none`."
- Stripe recommends v2 for new platforms: "We recommend using Accounts v2 for all new platforms" (https://docs.stripe.com/connect/accounts-v2/saas-platform-payments-billing). The v2 Accounts API is "generally available for Connect users" (https://docs.stripe.com/payments/ideal/set-up-payment?payment-ui=elements). The doc example uses header `Stripe-Version: 2026-09-30.preview`.
- **v2 limitations.** "You must use Accounts v1" for "Using OAuth to authenticate connected accounts", for the recipient service agreement, for treasury and issuing, and for "certain payment methods in public or private preview". https://docs.stripe.com/connect/accounts-v2
- One v2 `Account` can also take a `customer` configuration, so the platform can bill the gym for its own SaaS subscription without a separate `Customer` object. https://docs.stripe.com/connect/accounts-v2/saas-platform-payments-billing

**Answer.** The gym becomes merchant of record with direct charges, pays its own Stripe fees, carries its own losses (Stripe backstops), and gets the full Dashboard under: v2 `dashboard=full`, `fees_collector=stripe`, `losses_collector=stripe` (v1 equivalent: the defaults / Standard).

## 2. Charge types, platform fees, Connect fees

Source for the comparison: https://docs.stripe.com/connect/charges
- **Direct charges**: "the payment appears in the connected account's balance, not in your platform's balance". "Refunds and chargebacks reduce the connected account's balance." Stripe calls this the best fit "for platforms that provide software as a service".
- **Destination charges**: "the payment appears in your platform's balance", and "Refunds and chargebacks reduce your platform's balance." Only direct charges keep the money out of the platform balance.
- **Separate charges and transfers**: "Your account balance is debited for the cost of the Stripe fees, refunds, and chargebacks."
- SEPA creditor ID follows the charge type: Direct uses the "Connected Account"; Destination uses the "Platform". https://docs.stripe.com/payments/sepa-debit
- Stripe recommends "direct charges for connected accounts that have access to the full Stripe Dashboard." https://docs.stripe.com/connect/direct-charges?platform=web&ui=elements

**Mechanics of direct charges.** Source: https://docs.stripe.com/connect/direct-charges?platform=web&ui=elements
- Server side: `-H "Stripe-Account: {{CONNECTEDACCOUNT_ID}}"` with optional `application_fee_amount`. Client side: `Stripe(pk, { stripeAccount: '{{CONNECTED_ACCOUNT_ID}}' })`.
- PaymentIntents and Charges "exist on the connected account, not on the platform". To read them you must "query the Stripe API using the connected account ID in the Stripe-Account header."
- Application fee: "must be positive and less than the amount of the charge". "There are no additional Stripe fees on the application fee itself." Stripe creates an `ApplicationFee` object and emits the `application_fee.created` event.
- Refunds: "Application fees aren't automatically refunded". Pass `refund_application_fee=true`.
- With fees_collector=stripe, "set the application fee amount to include only your fee" (https://docs.stripe.com/connect/direct-charges-fee-payer-behavior).
- **Platform Pricing Tool**: "currently only available for platforms responsible for paying Stripe fees" (https://docs.stripe.com/connect/direct-charges?platform=web&ui=elements). It does not apply to our configuration, so we set `application_fee_amount` ourselves if we want a cut.

**Connect fees.** Source: https://stripe.com/connect/pricing (served in Dutch)
- "Stripe handles pricing" (connected accounts pay fees): "Geen kosten voor je platform" (no costs for your platform). No charges for accounts, volume or payouts.
- "Platform handles pricing": €2 per active account per month ("active in elke maand waarin uitbetalingen … zijn gestuurd", that is, active in any month with payouts), plus 0.25% + €0.10 per payout. The page also lists "0.25% of payout volume" for platform management and payment instructions, and 1.4% for deducting fees from the user's balance.
- Confirmation from the docs: with fees payer `stripe` (v2) or `account` (v1), "We don't charge any Connect fees to it or to your platform." https://docs.stripe.com/connect/direct-charges-fee-payer-behavior
- In that configuration the fee table assigns processing fees, dispute fees, "LPM Payment Failure Fees" and "Invoicing and Subscriptions" to the **Connected Account**. https://docs.stripe.com/connect/direct-charges-fee-payer-behavior

## 3. Onboarding and KYC for a Dutch gym

- **Hosted onboarding (Account Links)**: `POST /v1/account_links` with `type=account_onboarding`, `refresh_url`, `return_url` and `collection_options[fields]=eventually_due` (upfront) or `currently_due` (incremental). Links are single use and short lived: "a few minutes went by since the link was created". Don't send links outside the app. "Stripe-hosted onboarding is only supported in web browsers. You can't use it in embedded web views". Return URL ≠ complete: listen to `account.updated` and check `requirements`. Source: https://docs.stripe.com/connect/hosted-onboarding
- `account_update` links can't be created for accounts with a Stripe-hosted Dashboard. Full-Dashboard gyms update their details in their own Dashboard. https://docs.stripe.com/connect/hosted-onboarding
- **Embedded onboarding**: Account Session with `components[account_onboarding][enabled]=true`, rendered via Connect.js `account-onboarding`. There are iOS and Android SDKs. Stripe user authentication is on by default. https://docs.stripe.com/connect/embedded-onboarding
- **OAuth** (connecting an existing Stripe account) is still documented. It requires Accounts v1 ("You must use Accounts v1 … Using OAuth", https://docs.stripe.com/connect/accounts-v2), and "Platforms using OAuth with `read_write` scope won't be able to connect to accounts that are controlled by another platform." https://docs.stripe.com/connect/oauth-reference
- **What an NL company provides** (v1, NL platform, NL account, full Dashboard, full ToS, company, card_payments plus transfers). Source: https://docs.stripe.com/_endpoint/get-requirements-for-setups?account-setup-A[apiVersion]=v1&account-setup-A[platformCountry]=NL&account-setup-A[accountCountry]=NL&account-setup-A[dashboardType]=full&account-setup-A[tosType]=full&account-setup-A[legalEntityType]=company&account-setup-A[capabilities][0]=card_payments&account-setup-A[capabilities][1]=transfers
  - Company: name, address, `company.tax_id`, which maps to v2 `identity.business_details.id_numbers.nl_kvk` (the **KvK number**), phone, `owners_provided`.
  - Business profile: MCC, URL (or product description), support phone.
  - Representative: name, address, DOB, phone, email, job title.
  - Owners (UBOs): name, address, email, DOB. Directors: name, address, email, DOB, title.
  - Alternative document paths: `documents.proof_of_registration`, `documents.proof_of_ultimate_beneficial_ownership`.
  - ToS acceptance and an `external_account` (IBAN) for payouts.
  - Tags show EU ORR (EU 2025 requirements) identity/relationship verification.
- **iDEAL-specific**: an NL merchant's website must "clearly display your KVK (company registration) number". With Connect, "the connected account's name must map to its actual business, not to the platform." https://docs.stripe.com/payments/ideal
- **SEPA DD** "requires you to complete additional identity verification steps", and Connect accounts need the `sepa_debit_payments` capability. https://docs.stripe.com/payments/sepa-debit
- Typical onboarding time: NOT CONFIRMED (no primary-source figure found).

## 4. iDEAL | Wero to SEPA DD, recurring, Billing, Wero migration

**iDEAL (now branded "iDEAL | Wero").** Source: https://docs.stripe.com/payments/ideal
- Immediate notification; "Recurring payments: with SEPA Direct Debit"; Connect support "Yes"; "Dispute support: No".

**SetupIntent route.** Source: https://docs.stripe.com/payments/ideal/set-up-payment?payment-ui=elements
- "Stripe charges your customer 0.01 EUR through iDEAL | Wero to collect their bank details … Stripe refunds the payment and stores your customer's IBAN in a SEPA Direct Debit payment method."
- Expand `latest_attempt`, then read `payment_method_details.ideal.generated_sepa_debit` (pm_…) and `generated_sepa_debit_mandate`.
- SEPA DD must be activated, and the business must comply with the iDEAL and SEPA DD terms.

**PaymentIntent route (first amount plus mandate).** Source: https://docs.stripe.com/payments/ideal/save-during-payment?payment-ui=elements
- Use `setup_future_usage=off_session` with `currency=eur` and `customer`.
- Afterwards, expand `latest_charge` and "Store both the `generated_sepa_debit` PaymentMethod ID and the `generated_sepa_debit_mandate` for future off-session payments".
- "The original iDEAL payment method is single-use and can't be charged again."
- Later charges: a new PaymentIntent with `payment_method=<sepa pm>`, `customer`, `confirm=true` (the doc example also passes `return_url`). On Connect, all of this is created with the `Stripe-Account` header so that PM, mandate and customer live on the gym's account.

**SEPA DD behaviour.** Source: https://docs.stripe.com/payments/sepa-debit
- Delayed notification, "Payout timing: 6 business days". Settlement: "Standard Settlement T+6 at 00:00 UTC" with "Cutoff time 10:30 CET". "Wait at least 6 business days before considering a SEPA Direct Debit payment as successful." `expected_debit_date` appears in `charge.*` events.
- Limits: "10,000 EUR each. For new users, there's an additional weekly limit of 10,000 EUR".
- Disputes: "no questions asked" up to eight weeks; "After eight weeks and up to 13 months" only if unauthorized. Stripe sends `charge.dispute.created` and "deducts the dispute amount and fee". "SEPA Direct Debit disputes are final and there is no process for appeal." A dispute may deactivate the multi-use mandate.
- Failure codes: `refer_to_customer`, `insufficient_funds`, `debit_disputed`, `authorization_revoked`, `debit_not_authorized`, `account_closed`, `bank_account_restricted`, `debit_authorization_not_match`, `recipient_deceased`, `branch_does_not_exist`, `incorrect_account_holder_name`, `invalid_account_number`, `generic_could_not_process`. "Stripe immediately removes funds from your Stripe balance after failures."
- Mandate cancellation: "Stripe only learns about a canceled SEPA mandate when a payment attempt fails", then emits `mandate.updated`.
- Pre-notification: Stripe emails the debtor by default. The Stripe mandate allows notice "up to two calendar days in advance".
- Smart Retries (Billing only): "a maximum of 2 times, no more than 30 days after the original payment attempt"; "Debit failure fees aren't charged for retry attempts that we initiate automatically."
- Events on the PaymentIntent: `payment_intent.processing`, then `payment_intent.succeeded` or `payment_intent.payment_failed` (https://docs.stripe.com/testing?payment-method=sepa-direct-debit). Charge-level events are `charge.failed` and `charge.dispute.created` (https://docs.stripe.com/payments/sepa-debit).

**Stripe Billing on connected accounts.** Source: https://docs.stripe.com/connect/subscriptions
- Create the subscription with the `Stripe-Account` header. The Price and Customer live on the connected account. Optionally pass `application_fee_percent`, which must be a percentage ("You can't set a subscription's recurring application fee as a flat amount"; use `application_fee_amount` per invoice instead).
- "Only connected accounts with access to the full Stripe Dashboard can manage their customers' subscriptions."
- Stripe's own gym example appears on this page: "a gym management software platform".
- Billing price: "0.7% of Billing volume", which "Excludes one-off invoices" (https://stripe.com/en-nl/billing/pricing). With fees_collector=stripe, "Invoicing and Subscriptions" fees are billed to the connected account (https://docs.stripe.com/connect/direct-charges-fee-payer-behavior).
- Comparison: our own cron-created PaymentIntents avoid the 0.7% but give up Smart Retries, hosted invoices and the customer portal.

**iDEAL to Wero migration.**
- Docs: rebrand to "iDEAL | Wero" "in the first quarter of 2026"; "Switch to Wero in the course of 2026 and 2027". https://docs.stripe.com/payments/ideal
- Support article: "Co-branding must be complete by March 31, 2026 and no earlier than January 29, 2026". Phase 2, "Starting Q4 2026", is Wero for Dutch buyers. The iDEAL shutdown is "estimated 2027–2028". Subscriptions started with iDEAL that run on SEPA "will not be affected if you deactivate iDEAL in your checkout". "Wero will have a different subscriptions mechanism, launching in 2027." https://support.stripe.com/questions/ideal-to-wero-migration
- Stripe-hosted UIs (Payment Element, Checkout) handle the co-branding automatically. Custom UIs must update the logo and text. Same source.
- Wero today: "Customer locations: Belgium, France, Germany, Luxembourg"; "Recurring payments: No"; "Not supported when using Checkout in subscription mode or setup mode." https://docs.stripe.com/payments/wero
- **Implication**: keep iDEAL | Wero for the first payment and mandate. Plan an alternative mandate path for after the iDEAL shutdown (direct IBAN entry with SEPA DD, or Wero recurring when it launches). The generated SEPA mandates themselves run on SEPA rails.

## 5. Refunds and dispute fees

- **SEPA DD refunds**: up to 180 days. "Refunds are free of charge but the processing fees for the original payment are non-refundable." They take 3–4 business days to process. Watch for double credit: a refund does not block a later dispute. New accounts may have refunds disabled for "up to 2 business days". https://docs.stripe.com/payments/sepa-debit
- **iDEAL refunds**: "up to 180 days after the original payment". A refund can stay pending for up to 7 days. Customers can't dispute iDEAL payments. https://docs.stripe.com/payments/ideal
- **Direct charges**: a refund debits the connected account. If the balance is insufficient the refund is `pending` until funds arrive. https://docs.stripe.com/connect/charges
- **Dispute fee payer**: the connected account when fees_collector=`stripe` or fees.payer=`account`. https://docs.stripe.com/connect/direct-charges-fee-payer-behavior
- **Fees**: SEPA DD failed payment €3.50 and disputed payment €15.00 (https://stripe.com/en-nl/pricing/local-payment-methods). Card chargeback €20.00 (https://stripe.com/nl/pricing). Refund fees: the NL pricing page says refund fees may apply only for bank transfers, and none for other methods (https://stripe.com/nl/pricing).

## 6. Idempotency and webhooks

- **Idempotency**: `Idempotency-Key` header, "up to 255 characters". v1 keys may be pruned "after they're at least 24 hours old". A key reused with different params returns an error. "All POST requests accept idempotency keys"; don't send them on GET or DELETE. API v2 retries "don't repeat successful operations". Avoid PII in keys. https://docs.stripe.com/api/idempotent_requests
- **Connect webhooks**: scope is "Your account" or "Connected accounts". Via the API this is `connect=true` on webhook_endpoints, or `events_from=["@accounts"]` on v2 event destinations. "Each event for a connected account contains a top-level `account` property". Direct-charge events arrive in the Connected accounts scope. "For events triggered by connected accounts, v2 Events use the Your account scope, while v1 Events use the Connected accounts scope". Production Connect endpoints "receive both live and test webhooks", so check `livemode`. "You must define separate webhook endpoints for your sandbox accounts". https://docs.stripe.com/connect/webhooks and https://docs.stripe.com/webhooks
- **Signature**: `Stripe-Signature` header, HMAC-SHA256, scheme `v1`, raw body required. Libraries default to "a tolerance of 5 minutes". Secret rolling allows two secrets for up to 24h. https://docs.stripe.com/webhooks
- **Retries**: "for up to three days with an exponential back off in live mode". Sandbox: "three times over the course of a few hours". Manual resend works 15 days in the Dashboard and 30 days via the CLI. https://docs.stripe.com/webhooks
- **Ordering**: "Stripe doesn't guarantee the delivery of events in the order that they're generated". Don't use `created` for ordering. Dedupe on event ID, and in some cases on `data.object` ID plus type. https://docs.stripe.com/webhooks
- **Thin vs snapshot events**: Workbench offers "Thin (recommended) or Snapshot". Thin events need a separate endpoint and use `fetchRelatedObject()`. Event destinations are created via `/v2/core/event_destinations`. https://docs.stripe.com/webhooks
- **Endpoint limit**: "You can register up to 16 event destinations with Stripe." https://docs.stripe.com/webhooks
- Payout events are v1 only: "payouts trigger only the v1 events described here." https://docs.stripe.com/connect/payouts-connected-accounts

## 7. Testing, sandboxes and preview URLs

- **Sandboxes**: "For new integrations, use general sandboxes instead of your test mode sandbox." Up to five general sandboxes; the test mode sandbox doesn't count. General sandboxes support API v1 and v2, while the test mode sandbox only "partially supports V2". https://docs.stripe.com/testing-use-cases and https://docs.stripe.com/sandboxes
- Sandbox limitation: "You can't create connections between a Connect platform's sandbox and connected account sandboxes." Connected accounts must be created inside the platform sandbox. https://docs.stripe.com/sandboxes
- Connect accounts in sandboxes "don't return sensitive fields". https://docs.stripe.com/testing-use-cases
- **Test connected accounts**: SMS code `000-000`; DOB `1901-01-01` matches; address `address_full_match`; ID `000000000`. NL payout IBAN `NL39RABO0300065264` succeeds and `NL91ABNA0417164300` fails with `no_account`. https://docs.stripe.com/connect/testing
- **iDEAL test**: the redirect page offers "Authorize test payment" and "Fail test payment". Generated-SEPA scenarios work via billing email (e.g. `generatedSepaDebitIntentsSucceedDisputed@example.com`, `generatedSepaDebitIntentsFailsDueToInsufficientFunds@example.com`) or via PaymentMethods `pm_ideal_generatedSepaDebitIntents{Succeed,SucceedDelayed,Fail,FailDelayed,SucceedDisputed,FailsDueToInsufficientFunds}`. https://docs.stripe.com/payments/ideal/set-up-payment?payment-ui=elements
- **NL SEPA test IBANs** (https://docs.stripe.com/testing?payment-method=sepa-direct-debit):
  - `NL39RABO0300065264`: success
  - `NL55RABO0300065267`: success after 3 minutes
  - `NL91ABNA0417164300`: fail
  - `NL28RABO0300065268`: fail after 3 minutes
  - `NL46RABO0000454545`: `debit_not_authorized`, mandate inactive
  - `NL82RABO0300065266`: success, then immediate dispute
  - `NL27RABO0002222227`: `insufficient_funds`
  - `NL27RABO0000343434` and `NL86RABO0000121212`: weekly limits
  - `NL77RABO0000066666`: `bank_account_unusable`
  - Tokens: `pm_sepaDebit_*_nl`.
- **Local forwarding**: `stripe listen --forward-connect-to localhost:PORT/path` for snapshot events, `--forward-thin-connect-to` for thin events; `stripe trigger --stripe-account acct_… <event>`. https://docs.stripe.com/connect/webhooks and https://docs.stripe.com/webhooks
- **Ephemeral preview URLs**: 16 event destinations per account is the hard cap, so a per-preview endpoint will not scale. Options are one stable staging endpoint that fans out, or one sandbox per long-lived env (max 5). This is an inference from the limits above.

## 8. Payouts and reconciliation

- **Default**: "any charge … accumulates in the connected account's balance and is paid out on a daily rolling basis". https://docs.stripe.com/connect/payouts-connected-accounts
- **NL settlement**: the table row reads "Netherlands | 7 calendar days | 3 business days" (initial vs default). Minimum payout "NL | 1 EUR". https://docs.stripe.com/payouts
- **Who controls payouts**: "To schedule automatic payouts or perform manual payouts for an account that has access to the full Stripe Dashboard, the platform must configure Platform controls." https://docs.stripe.com/connect/payouts-connected-accounts
  - In platform settings, the platform can decide "whether connected accounts can manage their own payout schedules". https://docs.stripe.com/connect/platform-controls-for-stripe-dashboard-accounts
  - Removing an account "permanently resets all platform controls … such as payout timing". Same source.
- **Weekly parameters**:
  - v1: `settings.payouts.schedule.interval=weekly` plus `weekly_anchor` (e.g. `monday`) or `weekly_payout_days[]`. `delay_days` defaults to `minimum`. https://docs.stripe.com/api/accounts/update?query=settings.payouts.schedule
  - v2 uses the Balance Settings API: `payments.payouts.schedule.interval=weekly` with `weekly_payout_days`. "Platforms that manage fraud and dispute liability, or have platform controls, can adjust the payout interval." https://docs.stripe.com/connect/manage-payout-schedule
  - `delay_days` is editable only where the platform owns liability; for Stripe-liability accounts it defaults to the lowest permitted value. Same source.
- **Reconciliation**:
  - `GET /v1/balance_transactions?payout=po_…` with the `Stripe-Account` header. The `payout` filter is "For automatic Stripe payouts only". https://docs.stripe.com/api/balance_transactions/list
  - The Payout reconciliation report (`payout_reconciliation.itemized.7`) is available to "a platform on manual payouts whose Connected Accounts have automatic payouts enabled". Its columns include `connected_account_id`, `payment_intent_id`, `payment_metadata[key]`, `reporting_category` and `automatic_payout_id`. https://docs.stripe.com/reports/payout-reconciliation
  - Payout lifecycle events: `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`. https://docs.stripe.com/connect/payouts-connected-accounts

## 9. Pricing (NL, EUR)

All prices accessed 2026-10-19.

| Item | Price | Source |
|---|---|---|
| iDEAL \| Wero | €0.29 per payment (no %) | https://stripe.com/en-nl/pricing/local-payment-methods and https://stripe.com/nl/pricing |
| SEPA Direct Debit | €0.35 per successful payment, **no cap listed** | https://stripe.com/en-nl/pricing/local-payment-methods |
| SEPA DD failed payment | €3.50 | same |
| SEPA DD disputed payment | €15.00 | same |
| Card chargeback | €20.00 (contest fee €20.00, refunded if won) | https://stripe.com/nl/pricing |
| Refunds | No fee except possibly bank transfers; for SEPA DD the original fee isn't returned | https://stripe.com/nl/pricing and https://docs.stripe.com/payments/sepa-debit |
| Billing | 0.7% of Billing volume (pay-as-you-go), or from €500/month on a 1-year contract | https://stripe.com/en-nl/billing/pricing |
| Connect, "Stripe handles pricing" (our configuration) | €0 for the platform | https://stripe.com/connect/pricing |
| Connect, "platform handles pricing" | €2 per active account per month, plus 0.25% + €0.10 per payout | https://stripe.com/connect/pricing |
| iDEAL mandate setup via SetupIntent | €0.01 charged and refunded; whether an iDEAL fee applies to it is NOT CONFIRMED | https://docs.stripe.com/payments/ideal/set-up-payment |

Note: the stripe.com/nl/pricing summary also mentioned a "0.25%" Connect line for platforms that set their own payment prices. This matches the platform-pricing model and does not apply to fees_collector=stripe.

## 10. Data protection

- **DPA** (https://stripe.com/legal/dpa, served in Dutch, "Laatst bijgewerkt: 28 september 2026"):
  - Stripe acts as a **processor** for the user (the controller) when providing the services.
  - Stripe acts as an **independent controller** for its own purposes: fraud monitoring, financial-crime/AML compliance, legal compliance, and product improvement.
  - Transfers go to Stripe, LLC (US) under a Data Transfer Addendum using the EU-US Data Privacy Framework "indien van toepassing" (where applicable), EEA SCCs (Decision 2021/914, Modules 1–3), and the UK addendum.
  - Sub-processor changes get "ten minste 30 dagen" (at least 30 days) notice for subscribed users, with a 30-day objection right.
- **Sub-processors**: https://stripe.com/legal/service-providers (last updated September 27, 2026). Stripe lists affiliates including Ireland, and most providers are in the US.
- **Implications** (inference): the gym holds its own Stripe agreement and DPA as merchant. Fivvi, as platform, accesses gym data via the `Stripe-Account` header and needs its own DPA with each gym. The data sent to Stripe (member names, emails, IBANs) should be minimal and include no health notes. The Stripe DPA does not address Connect platform-to-account roles.
- The EEA contracting entity (expected: Stripe Payments Europe, Limited, Ireland) is NOT CONFIRMED: the DPA page only says "de Stripe-entiteit die in de overeenkomst vermeld staat" (the Stripe entity named in the agreement), and the privacy policy fetch failed.

## 11. Restrictions and platform prerequisites

- **Restricted businesses** (https://stripe.com/legal/restricted-businesses, last updated 2026-09-22): gyms and fitness are **not** listed.
  - Relevant prohibition: "Negatieve-optiemarketing, negatieve-optie lidmaatschapsclubs en proefverkoopprijzen met onduidelijke of verborgen prijzen" (negative-option marketing, negative-option membership clubs, and trial pricing with unclear or hidden prices). Memberships must have transparent pricing and cancellation.
  - Prepaid credits are a restricted area: "Vooraf geladen betaalkaarten, cadeaubonnen, virtuele tegoeden" (prepaid cards, gift cards, virtual credits). This is relevant if we sell class-credit bundles.
- **iDEAL | Wero and Wero**: extra prohibited categories (adult, cannabis, payment facilitators, P2P, and so on). Gyms are not among them. https://docs.stripe.com/payments/ideal
- **Platform account activation**: whether the platform needs a live, KYC'd Stripe account before creating live connected accounts is NOT CONFIRMED (the fetch failed at the session limit). Related: the platform must "enable SEPA Direct Debit on your platform and request the `sepa_debit_payments` capability" (https://docs.stripe.com/payments/sepa-debit), and hosted onboarding requires the platform's brand name, colour and icon to be set (https://docs.stripe.com/connect/hosted-onboarding).

## Not confirmed / open

1. The platform's own account must be activated (live KYC) before it can create live connected accounts: not verified.
2. The Stripe EEA contracting entity and controller for end-customer data (Stripe Payments Europe, Limited, Ireland): not verified (privacy policy fetch failed). The Connected Account Agreement's data-sharing clauses were not read.
3. Typical KYC/onboarding duration for a Dutch company: no primary source found.
4. Whether the €0.01 iDEAL mandate charge (SetupIntent route) incurs the €0.29 iDEAL fee.
5. Default NL payout delay unit: the payouts page says EU uses calendar-day delays, yet the NL row lists "3 business days". Exact semantics are unclear.
6. What happens to generated SEPA mandates when iDEAL shuts down (2027–2028). The support article only says iDEAL-started subscriptions on SEPA rails are unaffected. Wero recurring is due in 2027; details are unknown.
7. Whether the Accounts v2 Merchant configuration supports every capability we need (`sepa_debit_payments`, `ideal_payments`) without preview flags. The v2 docs say some preview payment methods need v1. Not checked per capability.
8. Whether the "0.25%" Connect line on stripe.com/nl/pricing differs from the €2 + 0.25% + €0.10 model on the Connect pricing page.
9. Thin events for v1 resources (payment_intent.*) on Connect destinations: the docs imply connected-account thin events are limited. Exact coverage was not verified.
