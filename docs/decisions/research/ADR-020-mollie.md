# Mollie for Trainer Hub: Connect, recurring SEPA, testing, pricing, data protection

> Source notes for [ADR-020](../ADR-020-payment-provider.md), gathered by a research agent from primary sources on 19–20 October 2026. Provider terms and prices change; re-check before relying on a figure.

Research date: 2026-10-19/20 (all pages accessed then). Primary sources only: docs.mollie.com (the `.md` versions listed in https://docs.mollie.com/llms.txt, with `updatedAt` noted where it matters), mollie.com, help.mollie.com (Mollie's own help centre), the EPI / iDEAL / Wero sites, the DNB register and Mollie's GitHub SDKs. Quotes are short and exact. Items marked **[NOT CONFIRMED]** are inferences or gaps.

Model in scope: Trainer Hub = platform, each gym = its own Mollie organisation (merchant of record), connected through OAuth. Mollie calls this **Connect for Platforms**.

---

## 1. Mollie Connect for Platforms: OAuth, scopes, tokens, testmode, onboarding/KYC

**Product fit**
- Mollie has two Connect models. "Connect for Platforms is for SaaS businesses where each merchant runs their own payment operation"; merchants "handle their own refunds and disputes"; payment owner and first-line chargeback liability = merchant; "Single payout to the merchant". Connect for Marketplaces (platform owns the payment, split/routing) is the other model. https://docs.mollie.com/docs/connect-overview (updated 2026-08-26)
- For Platforms, Mollie "verifies your merchants, manages risk and provides loss protection". Same URL.
- Prerequisite: "You will also need to have a **Mollie partner account** to start using Connect". https://docs.mollie.com/docs/connect-getting-started

**OAuth app**
- Register once in the Web App: **Developers → Your apps → Create application**, with name and redirect URL, plus optional co-branded onboarding (logo, brand colour, return URL). https://docs.mollie.com/docs/authentication-via-oauth
- Authorize endpoint: `GET https://my.mollie.com/oauth2/authorize` with `client_id` (`app_…`), `state` (required, CSRF), `scope` (space-separated), `response_type=code`, optional `redirect_uri` ("must match the URL you set when registering your app"), `approval_prompt=force` (revokes earlier authorizations), `locale` (incl. `nl_NL`), `landing_page` (login/signup). https://docs.mollie.com/reference/oauth-authorize
- **Implication for per-PR previews:** the OAuth `redirect_uri` must match the registered app URL, so the "Connect with Mollie" callback needs a fixed domain (or a separate test app), not a per-PR preview domain. Whether one app can register several redirect URIs **[NOT CONFIRMED]**: the docs speak of one "redirect URL".

**Tokens**
- The authorization code "expires after **30 seconds**". The `access_token` is "valid for **60 minutes**"; the `refresh_token` is "persistent; store it encrypted". https://docs.mollie.com/docs/connect-onboard-merchants
- Token endpoint: `expires_in` example 3600; "The refresh token does not expire"; grants `authorization_code` / `refresh_token`; Basic auth with client id and secret. https://docs.mollie.com/reference/oauth-generate-tokens
- Revoking a refresh token "revokes all access tokens that were created using the same authorization". https://docs.mollie.com/reference/oauth-revoke-tokens (index summary in llms.txt)
- Whether a refresh returns a new (rotated) refresh token: **[NOT CONFIRMED]**.

**Scopes** (full list at https://docs.mollie.com/docs/permissions)
- Scopes exist for `payments`, `refunds`, `customers`, `mandates`, `subscriptions` (each `.read`/`.write`), plus `settlements.read`, `balances.read`, `invoices.read`, `onboarding.read/.write`, `organizations.read/.write`, `profiles.read/.write`, `payouts.read/.write`, `webhooks.read/.write`, `balance-transfers.read/.write` and `persons.read/.write`. `payments.read` also covers chargebacks.
- Mollie's recommended sets: subscriptions and recurring = `payments.* customers.* mandates.* subscriptions.*`; bookkeeping = `payments.read invoices.read settlements.read balances.read`; onboarding = `organizations.read organizations.write onboarding.read profiles.read profiles.write`. https://docs.mollie.com/docs/authentication-via-oauth
- Suggested scope set for Trainer Hub (derived): `payments.read payments.write refunds.read refunds.write customers.read customers.write mandates.read mandates.write subscriptions.read subscriptions.write settlements.read balances.read invoices.read onboarding.read onboarding.write organizations.read profiles.read profiles.write`. Add `webhooks.read/.write` only if next-gen webhooks are used, and `payouts.read` for payout events.
- "Adding scopes after you go-live **requires your merchants to re-authorize the app.**" https://docs.mollie.com/docs/authentication-via-oauth
- The Get balance report endpoint lists a `balance-reports.read` scope that the Permissions page does not show. https://docs.mollie.com/reference/get-balance-report **[NOT CONFIRMED which is right]**

**Acting on behalf of the gym**
- "Connect for Platforms: payments are owned by the connected merchant … Create the payment using the connected merchant's `access_token` as the Bearer token. The payment appears on their account, their name goes on the buyer's bank statement and they carry the liability." https://docs.mollie.com/docs/connect-process-payments
- "Always include the `profileId` when creating payments on behalf of a connected merchant." For new merchants, Mollie advises creating a profile for them right away (Create profile) and enabling methods. https://docs.mollie.com/docs/connect-onboard-merchants
- Payments, refunds, customers, mandates, subscriptions, settlements and balances all accept "OAuth access with …" (see the 🔑 lines on each reference page, e.g. https://docs.mollie.com/reference/create-payment, https://docs.mollie.com/reference/create-subscription, https://docs.mollie.com/reference/get-settlement).
- Create payout lists only API key and advanced access token with `payouts.write`, not OAuth. https://docs.mollie.com/reference/create-payout **[NOT CONFIRMED whether OAuth works]**

**`testmode` with OAuth**
- "For organization-level credentials such as OAuth access tokens, you can enable test mode by setting `testmode` to `true`." (create-payment `testmode` field) https://docs.mollie.com/reference/create-payment
- "if you are using advanced access tokens or app tokens, by providing the `testmode` parameter in your API request." https://docs.mollie.com/reference/testing
- Mollie's TypeScript SDK can set `profileId` and `testmode` once for OAuth clients. https://github.com/mollie/mollie-api-typescript (README, "Add Profile ID and Testmode to Client")

**Client Links (the current onboarding product)**
- `POST https://api.mollie.com/v2/client-links`, "Access with Advanced access token with **clients.write**" (the platform's own token, not the gym's OAuth token). Body: `owner` (email, givenName, familyName, locale), `name`, `address` (country required), `registrationNumber`, `vatNumber`, `legalEntity`. The response has a `clientLink`. Append `client_id`, `state`, `scope` (recommended at least `onboarding.read onboarding.write`) and optional `approval_prompt`, then redirect. "A client link must be used within 30 days of creation." https://docs.mollie.com/reference/create-client-link
- The Client Links API is for a "registered Mollie partner"; created organisations are "automatically connected to your partner account". https://docs.mollie.com/reference/client-links-api
- "Client Links is the recommended way to onboard your merchants and create new organizations for your customers." The plain authorize URL is "not recommended". https://docs.mollie.com/docs/authentication-via-oauth, https://docs.mollie.com/docs/connect-onboard-merchants
- The Submit onboarding data endpoint is no longer recommended in favour of Client Links. https://docs.mollie.com/reference/submit-onboarding-data (index summary)
- The `clients.write` scope is not on the public Permissions page. It is probably granted with the partner account. **[NOT CONFIRMED]**

**Onboarding status and KYB**
- Capabilities API (beta): `GET /v2/capabilities` with `onboarding.read`. Capabilities `payments` and `settlements` have status `unrequested|pending|enabled|disabled`. "A merchant can have `payments` enabled while `settlements` is still `pending`." https://docs.mollie.com/docs/connect-onboard-merchants, https://docs.mollie.com/reference/list-capabilities
- Legacy onboarding status values: `needs-data`, `in-review`, `completed`, with `canReceivePayments` and `canReceiveSettlements`. https://docs.mollie.com/reference/get-onboarding-status
- The partner dashboard checklist groups steps into "stakeholders, business activity" and "business registration, ID verification, bank account". https://docs.mollie.com/docs/connect-onboard-merchants
- What the gym provides: legal representative and UBO details; an ID copy (passport, ID card, residence permit or driving licence); bank account details with a "verification payment"; and a live website, or failing that a description of products and services. https://help.mollie.com/hc/en-us/articles/25897821634322-What-does-Mollie-need-to-verify-my-account. Company details should match the trade register (KvK number). https://help.mollie.com/hc/en-us/articles/115000481665
- SEPA Direct Debit must be activated separately and is reviewed: "We aim to inform you if you can use SEPA Direct Debit within 3 business days." https://help.mollie.com/hc/en-us/articles/360014304619-How-do-I-activate-SEPA-Direct-Debit-as-a-payment-method
- Typical total KYB duration: **[NOT CONFIRMED]**. No Mollie page states one.

## 2. Application fees, routing, revenue models

- Platforms can monetise with **Application Fees** (per payment, via the API) or **Resell Pricing** (Mollie charges your merchants your resell rate; "you absorb the cost of processing payments"). "You cannot apply both to the same payment." https://docs.mollie.com/docs/connect-monetize-payments
- Who pays Mollie: with application fees, "your connected account still pays the Mollie transaction fee directly: it is **charged against their account**, **not yours**." Same URL.
- `applicationFee` on create payment: "If you use OAuth to create payments on a connected merchant's account, you can charge a fee using this `applicationFee` parameter. If the payment succeeds, the fee will be deducted from the merchant's balance and sent to your own account balance." https://docs.mollie.com/reference/create-payment
- **Recurring and subscriptions:** the application fee can go on Create payment or Create subscription. https://docs.mollie.com/docs/application-fees. On a subscription: "Setting an application fee on the subscription will ensure this fee is charged on each individual payment." https://docs.mollie.com/reference/create-subscription. On a payment, no `sequenceType` restriction is stated for `applicationFee`, so it should work on `sequenceType=recurring` payments the cron creates. **[NOT CONFIRMED explicitly for on-demand recurring payments]**
- Limits: "Max fee = payment amount − (€0.35 + 6% × payment amount)", minimum €0.01. A buy-rate arrangement raises the cap. https://docs.mollie.com/docs/application-fees
- Refunds: "Application Fees are **non-refundable**". The full refund comes out of the gym's balance. Same URL and https://docs.mollie.com/docs/connect-process-payments
- Invoicing and VAT: "You are responsible for invoicing your connected accounts for the Application Fees you charge and for handling VAT correctly on those fees." https://docs.mollie.com/docs/application-fees. **Connect Billing** (beta) can send these invoices monthly on the 2nd on the platform's behalf. https://docs.mollie.com/docs/connect-billing (updated 2026-10-01)
- Testing: "Test payments do not trigger any balance movement: no Application Fee is transferred". Verify with a small live payment. https://docs.mollie.com/docs/application-fees
- Routing and split payments: these are Marketplace-only features (delayed routing up to 90 days, `reverseRouting` "only available to marketplace operators"), so they don't apply to Trainer Hub's model. https://docs.mollie.com/docs/connect-overview, https://docs.mollie.com/reference/create-refund
- Availability in NL: Connect payments are "available across Europe". No NL restriction on application fees is stated. https://docs.mollie.com/docs/connect-overview
- Partner programme or revenue share outside Resell Pricing: not covered in the docs. The NL pricing page only says "Neem contact op met het partnerschipsteam". https://www.mollie.com/nl/pricing **[NOT CONFIRMED: terms]**

## 3. First payment, mandate, recurring

- Flow: create a Customer (`customers.write` under Connect), then a payment with `customerId` and `sequenceType=first`, then redirect to `_links.checkout.href`. "Once completed there will be a customer mandate". https://docs.mollie.com/docs/recurring-payments (updated 2026-05-18)
- Method to mandate mapping: `ideal` → `directdebit` (also bancontact, belfius, eps, kbc, paybybank). "If you want to use a payment method that creates a `directdebit` mandate, make sure to also enable the **SEPA Direct Debit** payment method in your Mollie profile." Same URL.
- First-payment methods for SEPA DD: "Bancontact, Belfius, EPS, iDEAL, KBC Payment Button, MyBank, Pay by Bank". **Wero is not listed.** https://docs.mollie.com/docs/sepa-direct-debit, https://help.mollie.com/hc/en-us/articles/35188469623442-How-does-SEPA-Direct-Debit-work
- A zero-amount first payment is only mentioned for credit card and PayPal. Mollie's iDEAL example uses €0.01. For a gym, the first iDEAL payment can be the real first amount. https://docs.mollie.com/docs/recurring-payments
- On-demand recurring (cron-driven): `sequenceType=recurring` plus `customerId` (required) and `mandateId`, no `redirectUrl` needed, and "it gets executed immediately". https://docs.mollie.com/docs/recurring-payments, https://docs.mollie.com/reference/create-payment, https://docs.mollie.com/reference/api-idempotency
- Subscriptions API: `amount`, `interval`, `times`, `startDate`, `webhookUrl`, `applicationFee`. A subscription needs a `pending` or `valid` mandate. Mollie spawns payments, and the webhook gets payment ids you have never seen, carrying `subscriptionId`. "We do not provide webhooks specifically for status changes of a Subscription itself." Monthly on the 29th–31st charges on the last day of short months. https://docs.mollie.com/docs/recurring-payments, https://docs.mollie.com/reference/create-subscription
- Subscription failures: Mollie retries "up to 5 times (once a day), depending on the failure reason", then cancels the subscription. Reason codes AC01/AC04/AC06/MD07 cancel it immediately; MD01/MD06/MS02/MS03/SL01 cancel it "After 3 times". If the subscription has a fixed `mandateId`, cancellation "will also revoke the mandate". https://docs.mollie.com/docs/recurring-payments
- Trade-off (derived): on-demand recurring payments give Trainer Hub full control (pro-rating, pauses, variable amounts, own retry policy) but need idempotency (§6) and our own retries. Subscriptions are fixed amount and interval with Mollie-run retries and cancellations we must mirror.
- Mandates live on the customer inside the gym's organisation (`/v2/customers/{id}/mandates`, OAuth `mandates.*`). Use a unique `mandateReference`: "Some banks will decline Direct Debit payments if the mandate reference is not unique." https://docs.mollie.com/reference/create-mandate. Revoking a mandate cancels connected subscriptions. https://docs.mollie.com/reference/revoke-mandate (index summary)
- SEPA DD default max is "1,000.00 EUR (Default Limit)" per transaction. https://docs.mollie.com/docs/sepa-direct-debit

## 4. SEPA Direct Debit timing, reversals, failures

- Status: "After 1 business day, the payment has the status Paid, but can still fail up to 5 days from the day of the direct debit." https://help.mollie.com/hc/en-us/articles/115001007289-How-can-I-cancel-a-SEPA-Direct-Debit-payment
- "A direct debit transaction can be rejected up to 5 working days after the direct debit date." https://help.mollie.com/hc/en-us/articles/115000309865-Why-did-my-SEPA-direct-debit-payment-fail
- Settlement delay: "SEPA Direct Debit | `directdebit` | 9 business days (T+9)". https://docs.mollie.com/docs/balance (also "9 business days" in https://docs.mollie.com/docs/sepa-direct-debit)
- Chargeback window: "Within 8 weeks. If this period is over, the customer can choose to do an unauthorized Direct debit report with the bank within 13 months of payment." https://docs.mollie.com/docs/sepa-direct-debit. "Once a customer requests a chargeback, you cannot dispute it." https://help.mollie.com/hc/en-us/articles/115000796469-What-is-a-SEPA-Direct-Debit-chargeback
- How a storno arrives: a classic payment webhook fires when "A chargeback is received on the payment". https://docs.mollie.com/reference/webhooks. A Chargeback object (`chb_…`) has `reason.code` / `reason.description`, "Only available for chargebacks of SEPA Direct Debit payments" (e.g. AC01). https://docs.mollie.com/reference/get-chargeback. Next-gen events `chargeback.received` and `chargeback.reversed` are in beta. https://docs.mollie.com/reference/chargebacks-api-webhooks
- Failure reason codes (AC01, AC04, AC06, AG02, AM04, MD01, MD06, MD07, MS02, MS03, SL01) are listed with advice. MD01 includes "The mandate expired after 36 months" (of non-use). https://help.mollie.com/hc/en-us/articles/115000309865
- Balance transaction types include `failed-payment`, `failed-payment-fee`, `chargeback`, `chargeback-reversal` and `unauthorized-direct-debit`, so a reversal after "paid" shows up as its own ledger line. https://docs.mollie.com/reference/list-balance-transactions
- Retry rules for on-demand recurring payments: none documented. Mollie's automatic retries apply to subscriptions only (§3). **[NOT CONFIRMED]**
- Exact collection date (D+? between creating a recurring payment and the debit on the consumer's account): **[NOT CONFIRMED]**. Only the "paid after 1 business day" statement exists.

## 5. Refunds and chargebacks

- Refunds API (OAuth `refunds.write`): full and partial, "You can create multiple partial refunds". Statuses are `queued` (insufficient balance), `pending`, `processing`, `refunded`, `failed` and `canceled`. Only `processing`, `refunded` and `failed` trigger the payment webhook. https://docs.mollie.com/docs/refunds, https://docs.mollie.com/reference/create-refund
- "Refunds will be executed with a delay of two hours"; they can be canceled while `queued` or `pending`. https://docs.mollie.com/reference/cancel-refund
- Duplicate protection: a refund that is "a duplicate (of the same amount in the last hour)" errors. On a client timeout, "you should **not retry automatically**". Check the list of refunds instead, or use an Idempotency-Key (§6). https://docs.mollie.com/docs/refunds
- Refund validity: iDEAL 365 days; SEPA DD 365 days. https://docs.mollie.com/docs/ideal, https://docs.mollie.com/docs/sepa-direct-debit
- SEPA DD gotcha: refunding a DD that the customer also charges back pays them twice. https://help.mollie.com/hc/en-us/articles/115001007289
- Chargebacks API: list/get per payment or overall, `payments.read`. https://docs.mollie.com/reference/chargebacks-api
- Fees: see §9 (refund €0.25; SEPA DD chargeback €10 per help article, possibly superseded).

## 6. Idempotency and webhooks

**Idempotency**
- "All `POST` endpoints accept idempotency keys" via `Idempotency-Key`. A repeat "within one hour" returns the cached response with `Idempotent-Replayed: true`. Same key with different parameters gives `400`; a concurrent duplicate gives `409`. https://docs.mollie.com/reference/api-idempotency (updated 2026-10-13)
- Mollie names the risky calls: recurring payments, subscriptions and partial refunds.
- **OAuth caveat:** "idempotency keys are tied to the API credential", and since "access tokens expire within one hour", Mollie recommends "cycling the access token a few minutes earlier than usual". Same URL. Implication: the cron should refresh the gym's token before a batch, and fall back to listing payments (by our own metadata) after a lost response.
- The TypeScript SDK supports `idempotencyKey`. https://github.com/mollie/mollie-api-typescript

**Classic webhooks (per resource, `webhookUrl`)**
- Body: "a single POST-parameter called `id`". Fetch the resource. There is no signature: "fake calls to your webhook will never result in orders being processed". https://docs.mollie.com/reference/webhooks
- Retries: 10 attempts over 26 h (0, 1 m, 2 m, 4 m, 8 m, 16 m, 29 m, 1 h, 2 h, 22 h), 15 s timeout, only `200` counts. Mollie recommends against IP allow-listing. A `301/302` drops the POST body (use 307/308). Webhooks cannot be retriggered yourself. Same URL.
- Payment webhooks fire on `paid/authorized/expired/failed/canceled`, on refunds reaching `processing/refunded/failed`, and on received chargebacks. Same URL.

**Next-gen webhooks (event subscriptions)**
- Configured via Dashboard or Webhooks API (`webhooks.write`, OAuth supported). The payload is an event (full snapshot via API), signed: "`X-Mollie-Signature` … HMAC of the webhook request body, using the SHA-256". Secret rotation has a 24 h dual-signature period. A Webhook Events API lets you check events. https://docs.mollie.com/reference/webhooks-new (updated 2026-09-16), https://docs.mollie.com/reference/webhooks-best-practices
- Events include `payment.paid/failed/expired/canceled/pending/authorized`, `payout.*`, `balance-transaction.created` and `sales-invoice.*`. `chargeback.*` and `refund.*` are beta. Same URL.
- Mollie still advises: "We recommend using classic webhooks for payment-related updates (until we make these event types available for Next-gen webhooks)". This conflicts with `payment.*` appearing in its global-events table. **[NOT CONFIRMED which is current]**
- Limits: active subscriptions per organisation "Test mode 2 / Live mode Up to 3". So next-gen subscriptions cannot be created per PR preview.
- "Live mode requires HTTPS"; "There are no security requirements for `test` mode". A webhook that keeps failing for 24 h is `blocked` and must be reactivated in the Web App. Same URL.
- **Ordering guarantees:** none documented, for either system. Mollie says to "check against your records" and fetch the latest state. **[NOT CONFIRMED: assume no ordering]**

## 7. Test mode and per-PR previews

- Test mode is reached with a test API key or, for OAuth and advanced tokens, the `testmode` parameter. Data is "completely isolated from your live mode data". https://docs.mollie.com/reference/testing (updated 2026-07-13)
- Recurring in test mode: "the resource will not contain a `checkout` URL … Instead, a `changePaymentState` URL is added, which allows you to set the final payment state". Paid test payments also get `changePaymentState` "to test refund and chargeback functionality". The webhook is called as in live mode. Same URL, and https://docs.mollie.com/docs/recurring-payments
- So an iDEAL first payment through the test checkout, then the mandate, a recurring DD payment, failure or paid, and refund or chargeback can all be simulated. A specific SEPA failure reason code (AM04, etc.) cannot: magic amounts exist only for card failure reasons. **[NOT CONFIRMED for DD reason codes]**
- "In test mode, payment methods are activated immediately even when they show as pending." https://docs.mollie.com/reference/testing
- Connected gyms: Mollie's go-live checklist says create the first test payment once `canReceivePayments` is `true`. https://docs.mollie.com/docs/connect-go-live. Whether test mode works for a connected organisation that has not finished KYB: **[NOT CONFIRMED]**. The Demo Accounts mentioned in https://docs.mollie.com/reference/testing are "early access".
- Not testable in test mode: "All Business Operations endpoints (except Payouts API) do not support the `testmode`". That covers settlements, balances and invoices, so reconciliation can only be tested against live data or fixtures. https://docs.mollie.com/reference/balances-api, https://docs.mollie.com/reference/settlements-api. Application fees are not moved in test mode (§2).
- **Per-PR preview domains:** `webhookUrl` and `redirectUrl` are set per payment (and per subscription), so each Railway preview can pass its own public HTTPS URLs. Constraint: "The webhookUrl must be reachable from Mollie's point of view, so you cannot use `localhost`" (use ngrok locally). https://docs.mollie.com/reference/create-payment, https://docs.mollie.com/reference/webhooks. Caveats: a subscription's payments keep calling the preview URL stored on it after the preview is gone; the OAuth `redirect_uri` is fixed per app (§1); next-gen webhooks are capped at 2 in test mode (§6).
- Node SDK: the legacy `mollie-api-node` README says to migrate to `mollie-api-typescript` "by **17 November 2026**, after which the legacy SDK will enter maintenance mode". https://github.com/mollie/mollie-api-node. The new SDK has OAuth, `testmode`/`profileId` defaults, idempotency and "Webhook Signature Validation". https://github.com/mollie/mollie-api-typescript

## 8. Payouts, settlements, balances

- "By default, Mollie pays out weekly on Wednesdays." Options: every business day, weekly ("on a chosen business day"), monthly, Revenue Day Payouts, manual (and daily only for Business Account users). "Payout frequency is configured per balance … under **Settings** > **Balance**" in the gym's Web App. https://docs.mollie.com/docs/payouts (updated 2026-08-04)
- No API to set the schedule is documented. Note: "Creating a payout via the API automatically sets the balance's `transferFrequency` to `never`". https://docs.mollie.com/reference/create-payout
- Minimum: "€5 by default". Below that the payout is skipped and rolls over. https://docs.mollie.com/docs/payouts
- Payout reference: bank statement "reference identifier starting with T … This reference matches the settlement ID". Same URL.
- Settlements API (OAuth `settlements.read`): list, get (also by bank reference), open, next, plus `/payments`, `/refunds`, `/chargebacks`, `/captures` per settlement (`/payments` also needs `payments.read`). The settlement report groups Revenue, Deductions and Costs (payment method fees, chargeback fees, refund fees, …). "Costs and rolling reserves data will be aggregated per settlement." https://docs.mollie.com/docs/settlement-report, https://docs.mollie.com/reference/list-settlement-payments
- Balances API (OAuth `balances.read`): primary balance with `pendingAmount` and `availableAmount`, balance transactions (types include `payment`, `refund`, `chargeback`, `failed-payment-fee`, `application-fee`, `outgoing-transfer`, …), and the balance report. Mollie says it "will give you the most complete and real-time overview". Data before 1 July 2022 is not available. https://docs.mollie.com/reference/balances-api, https://docs.mollie.com/reference/list-balance-transactions
- Each payment carries `settlementId` once settled. https://docs.mollie.com/reference/get-payment
- Rolling reserves and risk-based longer delays can be applied by Mollie per organisation. https://docs.mollie.com/docs/balance
- Reconciliation design (derived): use the balance-transactions stream as the ledger and settlements (T-reference) to match bank payouts. Neither works in test mode (§7).

## 9. Pricing (public NL page)

Source: https://www.mollie.com/nl/pricing, accessed 2026-10-20 ("Transactietarieven per betaalmethode in Nederland").

| Item | Price |
|---|---|
| iDEAL \| Wero (incl. as first payment) | **€ 0,32** per transaction (Wero NL domestic € 0,32; BE € 0,39) |
| SEPA-incasso (each recurring debit) | **€ 0,35** |
| SEPA-overboeking | € 0,25 |
| Monthly fee, online payments | "Pay as you go … Geen vaste maandkosten … € 0 /maand" |
| Payouts (under €500,000/year processed) | "Tot 5 uitbetalingen per maand: Gratis"; "Na 5 uitbetalingen per maand: € 0,25 per extra uitbetaling"; foreign currency payouts 1% |

- Weekly payouts (about 4–5 a month) therefore stay inside the free 5. The page notes "Er gelden uitzonderingen".
- Refund fee: "Mollie charges a fee of €0,25 for each refund." This is not on the NL pricing page. https://help.mollie.com/hc/en-us/articles/115000014489-How-do-I-refund-a-payment (updated 2026-02-23)
- SEPA DD chargeback (storno): "There is a fee of €10,- for each chargeback. Some banks also charge extra fees of €4,50 for chargebacks or failed transactions." https://help.mollie.com/hc/en-us/articles/115000796469 (updated 2026-02-23). Mollie changed "Chargeback and failed transaction fees for SEPA Direct Debit" from 1 Sep 2022 and emails each merchant its specific fees; current fees are under Dashboard → Settings → Profile → Payment methods → "Pricing & info". https://help.mollie.com/hc/en-us/articles/6589405541906-Pricing-changes-for-some-of-our-fees. **[NOT CONFIRMED: current chargeback fee and failed-DD fee amounts]**
- Mollie Connect or platform fees: not listed. The pricing page points platforms to the partnership team. Resell Pricing and buy-rate deals are negotiated. **[NOT CONFIRMED]**
- Volume discounts start above €100,000 a month; a startup programme waives fees up to €1,000,000 depending on funding. https://www.mollie.com/nl/pricing

## 10. Data protection and licensing

- Mollie's role: "Mollie is of the opinion that the processing of data in the context of the User Agreement with our merchants does not qualify as a controller-processor relationship … both independent controllers". https://help.mollie.com/hc/en-us/articles/360002761193-Do-I-have-to-sign-a-data-processing-agreement-with-Mollie
- A DPA exists only for the Invoice product: "The scope of the DPA is limited to the Invoice product only." Mollie is controller for payment data, to execute the agreement, for fraud monitoring, AML/KYC and product improvement. https://help.mollie.com/hc/en-us/articles/14826542080786-What-is-the-Data-Processing-Agreement
- Privacy Statement (dated 18 July 2026): Mollie is a controller; some data is processed by third parties "outside the European Economic Area" under "EU Standard Contract Clauses". There is no sub-processor list and no data-location statement. https://www.mollie.com/privacy. **[NOT CONFIRMED: data residency (EU/NL) and sub-processor list URL]**
- Licence: DNB register lists Mollie B.V. (relation number F0038) as an electronic money institution, which also covers payment services such as direct debits. https://www.dnb.nl/en/public-register/information-detail/?registerCode=WFTEG&relationNumber=F0038. Mollie's impressum says the same. https://www.mollie.com/legal/impressum
- User Agreement 2026 (in force 7 Sep 2026 for new, 7 Oct 2026 for existing customers) moves Mollie Connect terms to separate "Product Specific Terms". https://help.mollie.com/hc/en-us/articles/38518105024146-Updating-our-User-Agreement-2026
- Implications (my interpretation, not from Mollie):
  - The gym contracts directly with Mollie as an independent controller, so Mollie is not Trainer Hub's sub-processor.
  - Trainer Hub, acting for the gym through OAuth, processes payer data (name, IBAN in mandate details, payment history) as the gym's processor. That belongs in Trainer Hub's DPA with the gym.
  - Trainer Hub should store only what it needs (Mollie ids, status, amounts; avoid copying IBAN beyond display).
  - Our privacy notice should name Mollie as a separate controller.
  - Get the Connect Product Specific Terms reviewed. **[NOT CONFIRMED: content of those terms]**

## 11. 2025–2027 changes: iDEAL 2.0, iDEAL | Wero, Wero

- iDEAL 2.0: migration by 1 March 2025. Mollie Checkout users were migrated in July 2024; custom integrations must drop the issuer (bank) selection. https://help.mollie.com/hc/en-us/articles/19100313768338-iDEAL-2-0
- iDEAL → Wero:
  - From early 2026 iDEAL is co-branded "iDEAL | Wero", and merchants need no changes in phase 1. "By the end of 2027 at the latest, all iDEAL merchants will have transitioned to Wero." https://ideal.nl/en/naar-wero
  - EPI (16 July 2026): "All Dutch issuing banks will be connected to Wero in October 2026"; from then "iDEAL payments will gradually transition to the Wero infrastructure". The goal is to "complete the migration from iDEAL to Wero by 31 December 2027". Scheme pricing stays "broadly aligned with the current iDEAL | Wero pricing level until 31 December 2028". Purchase Protection gets "full coverage by 1 January of 2028". https://epicompany.eu/media-insights/successful-first-phase-marks-major-next-steps-in-ideal-to-wero-migration/
- Mollie on Wero (docs updated 2026-09-23):
  - "This payment method is in beta". NL is expected "October '26". Method `wero`, key info "**Recurring** No", settlement T+0.
  - Wero is "**non-guaranteed**": shoppers can dispute "for up to **120 days**".
  - Activation is by review (MCC) and access request.
  - https://docs.mollie.com/docs/wero. Dispute process details: https://help.mollie.com/hc/en-us/articles/34859733855250-What-are-the-risks-of-Wero-Payments
- Mollie's Wero guide: "the initial launch focuses on single payments". Recurring and subscriptions are on the Wero roadmap; in phase 2 "pricing structures, technical setups, and business contracts may change". https://www.mollie.com/growth/wero-payment-guide
- **Impact on our flow (iDEAL first payment that creates a SEPA DD mandate):**
  - Today `method=ideal` + `sequenceType=first` → `directdebit` mandate is documented. Wero is absent from every list of SEPA DD first-payment methods, and its key info says Recurring "No". https://docs.mollie.com/docs/recurring-payments, https://docs.mollie.com/docs/sepa-direct-debit, https://docs.mollie.com/docs/wero
  - **[NOT CONFIRMED, the key open question]** Whether an `ideal` first payment still yields a SEPA DD mandate once that iDEAL transaction runs on Wero rails (gradually from Oct 2026, fully by 31 Dec 2027). Also whether a `wero` payment will ever create one. Neither Mollie, ideal.nl nor EPI documents this. Ask Mollie before building.
  - Fallbacks Mollie documents today:
    - Create a `directdebit` mandate directly via the Mandates API ("SEPA Direct Debit and PayPal mandates can be created directly"; needs `consumerName`, `consumerAccount`, `signatureDate`, `mandateReference`; this needs our own mandate-signing flow). https://docs.mollie.com/reference/create-mandate
    - Use "Pay by Bank" (`paybybank`), also a first-payment method that creates a `directdebit` mandate. https://docs.mollie.com/docs/recurring-payments
    - Use a card first payment (card mandate).
  - Mollie's iDEAL page (updated 2025-05-20) still says iDEAL has "Chargeback risk: No". Once payments run on Wero, the 120-day dispute window may apply. **[NOT CONFIRMED]** https://docs.mollie.com/docs/ideal

---

## Not confirmed / open questions for Mollie

1. **Wero and mandates:** does an iDEAL | Wero first payment (on Wero rails, Oct 2026 → end 2027) still create a `directdebit` mandate? Will a `wero` first payment ever create one? What is the timeline for Wero recurring?
2. Exact current fees for a SEPA DD chargeback/storno (help article says €10; a 2022 change notice says per-merchant) and for a failed or rejected DD. These are not on the public NL pricing page.
3. Mollie Connect commercial terms: partner account requirements, Resell Pricing or buy-rate, any platform fee, and the Connect Product Specific Terms (User Agreement 2026).
4. Whether test mode works for a connected gym organisation before KYB completes. Whether a separate test OAuth app or Demo Account is needed.
5. Whether an OAuth app may register several redirect URIs (for staging/preview), and whether refresh tokens rotate.
6. `applicationFee` on on-demand `sequenceType=recurring` payments. It is documented for subscriptions and generally for OAuth payments, but not explicitly for recurring.
7. Whether `POST /v2/payouts` and payout schedules can be managed with OAuth. The docs list only API key and advanced token, and set the schedule in the Dashboard.
8. Exact DD collection date after creating a recurring payment. Retry behaviour for on-demand (non-subscription) recurring payments.
9. Simulating specific SEPA DD reason codes in test mode.
10. Webhook delivery ordering, and whether `payment.*` next-gen events are production-ready (docs conflict).
11. Typical KYB/onboarding duration for a Dutch gym (only "within 3 business days" for SEPA DD activation is stated).
12. Data residency (EU/NL) and a public sub-processor list. The `balance-reports.read` vs `balances.read` scope mismatch.
