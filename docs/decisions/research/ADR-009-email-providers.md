# Transactional email providers for Fivvi: tracking, unsubscribe, EU residency, DPA, pricing

> Source notes for [ADR-009](../ADR-009-transactional-email.md), gathered by a research agent from primary sources on 1 November 2026. Provider terms and prices change; re-check before relying on a figure.

Research date: 2026-11-01 (all pages accessed then). Primary sources only: each provider's own pricing pages, docs, API references, help centres, legal pages (DPA, sub-processors) and the npm registry for SDK packages. Comparison blogs were used only to find candidates. Quotes are short and exact. Items marked **[NOT CONFIRMED]** are inferences or gaps. Some sites block automated reading (Scaleway's website, Brevo's help centre, parts of Mailjet's help centre); where that happened, the note says which source was used instead. Prices exclude VAT unless stated.

---

## 1. Requirements

From the ADR-009 context. Fivvi sends transactional email only: sign-in emails with a single-use magic link (token in the URL) plus a 6-digit code, and booking confirmations and changes. Sender `noreply@fivvi.app`, SPF/DKIM/DMARC in place. Sending sits behind a small TypeScript `sendEmail` interface (Node, Next.js on Railway EU West, Amsterdam), so a swap is one HTTPS call per email.

Volume: about 1,000–3,000 emails/month at pilot, 10,000–50,000/month after launch.

**Hard requirements**
- **H1 Tracking fully off** on a plan we would actually use: no link rewriting and no open pixel, so the sign-in token never passes through a provider redirect.
- **H2 EU processing and storage** of email content, recipients and logs.
- **H3 DPA** that is part of the terms or signable, with a published sub-processor list.
- **H4 Unsubscribe never blocks sign-in:** the provider must not add `List-Unsubscribe` to transactional mail on its own (or we must be able to omit it), so a header click cannot suppress sign-in codes.

**Soft requirements**
- Free or near-free at pilot volume; reasonable cost at 10k–50k/month (paid plans need owner approval).
- Official Node/TS SDK, or a plain REST API that is easy to call.
- Idempotency keys on send.
- Webhooks for delivery, bounce and complaint events.
- Suppressions listable and removable by API.
- Transactional-only or clearly separated transactional streams/IPs.
- EU company, and no support access from outside the EU.

---

## 2. Providers

### 2.1 Brevo (baseline, current provider)

1. **Tracking.** Brevo tracks by default: "By default, we track the opens and clicks for each recipient". The self-serve option is anonymisation, not removal: opens and clicks "are tracked but not linked to specific contacts". https://help.brevo.com/hc/en-us/articles/11643306229906-Can-I-anonymize-the-tracking-of-opens-and-clicks-for-my-emails (updated 2026-10-31). Brevo support told the owner that fully disabling tracking (no link rewriting, no pixel) needs Professional or Enterprise. That statement is from the owner's support ticket, not from a public page **[NOT CONFIRMED on a public page]**.
   - **New option (found today):** Brevo added "per-contact pixel tracking consent" after the CNIL recommendation of 14 April 2026. On the API, each recipient can carry `contactPixelTrackingConsent: false`, and then "Brevo does not track opens or clicks for this email." The setting applies to "transactional emails sent through SMTP or the API." https://help.brevo.com/hc/en-us/articles/37114679474706-About-email-tracking-pixels-and-the-CNIL-recommendation-in-Brevo (updated 2026-11-01). Whether links are still rewritten when consent is `false`, and which plans have the feature, is **[NOT CONFIRMED]**. Worth one support question before migrating.
2. **List-Unsubscribe.** Brevo adds a mandatory `List-Unsubscribe` header to campaigns and transactional email. Replacing it with `List-Help` is "only available with an Enterprise plan", for recipient-triggered transactional mail, on request to support. https://help.brevo.com/hc/en-us/articles/19100260472850-FAQs-About-list-unsubscribe-and-list-help-headers-in-emails (read via search snippets; the page blocks automated reading). The owner's ticket confirms a header unsubscribe blocklists the address for transactional email from that sender. Blocklist types (unsubscribes, complaints, hard bounces): https://help.brevo.com/hc/en-us/articles/5311015528594-View-your-blocklisted-contacts-unsubscriptions-complaints-hard-bounces **[content NOT CONFIRMED, page blocked]**.
3. **EU residency.** Brevo help article "Data storage location" says database servers are in the EU (own servers in France/Germany via OVH, Google Cloud in Belgium). https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location (read via search snippets) **[NOT CONFIRMED verbatim]**. Brevo is a French company.
4. **DPA.** Not re-checked in this round; Fivvi already uses Brevo under its terms **[NOT CONFIRMED]**.
5. **Pricing.** Free: "up to 300 emails per day" after account approval. Plan prices from the pricing page's structured data: Starter €7/month, Standard €15/month, **Professional €499/month**, Enterprise "Custom Price". Professional is "From 150,000 emails per month" and the button is "Talk to sales". All plans include transactional email ("All Brevo plans give you access to transactional email features"). Dedicated IP is listed under Enterprise. https://www.brevo.com/pricing/
6. **API.** REST API and SDKs; no idempotency key on the send page; custom headers via `headers`. https://developers.brevo.com/docs/send-a-transactional-email
7. **Deliverability.** Mixed marketing and transactional platform. A help article covers separating routing of transactional and marketing mail: https://help.brevo.com/hc/en-us/articles/11036762967954-Separate-the-routing-of-your-transactional-and-marketing-emails **[content NOT CONFIRMED]**.

### 2.2 Postmark (ActiveCampaign)

1. **Tracking.** Link tracking is off by default: "This is the default setting for all messages and new and existing servers." It can be set per server or per message (`TrackLinks`: `None`, `HtmlAndText`, `HtmlOnly`, `TextOnly`). https://postmarkapp.com/developer/user-guide/tracking-links. Open tracking is a per-server or per-message boolean `TrackOpens`. https://postmarkapp.com/developer/api/email-api. Open tracking default off **[NOT CONFIRMED explicitly]**; the opens guide implies it must be turned on. https://postmarkapp.com/developer/user-guide/tracking-opens
2. **List-Unsubscribe.** Not added on transactional streams: headers are "not required for your one-off messages sent through Transactional Message Streams", and "If you add Unsubscribe headers to transactional messages, Postmark will include them". Broadcast streams get them automatically. https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header. Stream `UnsubscribeHandlingType` "For Inbound and Transactional Streams default is `none`." https://postmarkapp.com/developer/api/message-streams-api. Suppressions are per message stream; reasons `HardBounce`, `SpamComplaint`, `ManualSuppression`; list (dump), create and delete by API; "`SpamComplaint` suppressions cannot be deleted." https://postmarkapp.com/developer/api/suppressions-api
3. **EU residency. Fails.** Data is hosted at Deft (Chicago area) and AWS. "We currently don't have plans to add servers in the EU." https://postmarkapp.com/eu-privacy. "we also store our data in the US"; "All sub-processors we use (as per 2021), are based in the US." https://postmarkapp.com/support/article/1218-gdpr-faq
4. **DPA.** DPA with SCCs: https://postmarkapp.com/dpa and https://postmarkapp.com/eu-privacy#dpa. Sub-processors: https://postmarkapp.com/eu-privacy#sub-processors. Retention: 45 days default, configurable "up to 365 days" on Pro and up. https://postmarkapp.com/pricing
5. **Pricing.** Free "100 emails/month", "No overages allowed", "it doesn't expire". Basic $15/month for 10k ($1.80/1k extra), Pro $16.50 ($1.30/1k), Platform $18 ($1.20/1k). 50k derived: Basic $87, Pro $68.50, Platform $66. https://postmarkapp.com/pricing
6. **API.** REST; official Node SDK `postmark` (repo ActiveCampaign/postmark.js, npm registry). No idempotency header on `/email`. https://postmarkapp.com/developer/api/email-api
7. **Deliverability.** Separate transactional and broadcast message streams (see 2 above).

### 2.3 Resend

1. **Tracking.** "Open and click tracking is disabled by default for all domains." Per-domain only, no per-email flag. https://resend.com/docs/dashboard/domains/tracking. Available on all plans: "Open and click tracking is a per-domain setting available on every plan, including Free." https://resend.com/pricing
2. **List-Unsubscribe.** Not added to API sends; "Resend doesn't manage contact lists for transactional emails". https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails. Suppressions (bounce, complaint, manual) "apply to your entire team" and skip transactional and Broadcast sends; list and remove via dashboard and API. https://resend.com/docs/dashboard/emails/email-suppressions
3. **EU residency. Fails.** Sending region can be Ireland (`eu-west-1`), but "All account data, including email metadata, logs, and API records, is stored in the United States" "regardless of the sending region you select." https://resend.com/docs/dashboard/domains/regions. All sub-processors are listed as USA (AWS, PlanetScale, Supabase, Vercel, Tinybird, and others). https://resend.com/legal/subprocessors
4. **DPA.** Part of the terms; EU SCCs; DPF; "Company's primary processing operations take place in the United States." Entity Plus Five Five, Inc., San Francisco. https://resend.com/legal/dpa
5. **Pricing.** Free 3,000/month but "limited to 100 emails per day"; Pro $20/month for 50k ($0.90/1k extra); Scale from $90. Retention 30 days on all plans. https://resend.com/pricing
6. **API.** Official Node SDK `resend`. `Idempotency-Key` header, kept 24 hours. https://resend.com/docs/dashboard/emails/idempotency-keys. Default rate limit "10 requests per second per team". https://resend.com/docs/api-reference/introduction
7. **Deliverability.** Dedicated IP only as Scale add-on. https://resend.com/pricing

### 2.4 Amazon SES (EU regions)

1. **Tracking.** Opens and clicks are tracked only when you send with a configuration set that publishes open/click events. To omit the pixel: "send the email without specifying a configuration set", or use one "not configured to publish data about open events". Click tracking can be off for a whole configuration set, or per link with `ses:no-track`. https://docs.aws.amazon.com/ses/latest/dg/faqs-metrics.html. The v2 `SendEmail` call also has a per-message `ConfigurationOverrides.Tracking` with `ClickTrackingEnabled` and `OpenTrackingEnabled`. https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html. So tracking is off unless you build it; available at the base price.
2. **List-Unsubscribe.** SES only adds unsubscribe headers when you pass `ListManagementOptions` (contact list and topic). "For transactional emails where you don't want contacts to be able to unsubscribe, you can omit the `ListManagementOptions` field". https://docs.aws.amazon.com/ses/latest/dg/sending-email-subscription-management.html. Account-level suppression list per region for `BOUNCE` and/or `COMPLAINT` (you choose the reasons), with per-configuration-set overrides. List with `ListSuppressedDestinations`, remove with `DeleteSuppressedDestination`. "Gmail doesn't provide complaint data to SES." https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list.html
3. **EU residency.** SES API endpoints exist in Frankfurt (`eu-central-1`), Ireland (`eu-west-1`), Milan, Paris, Stockholm, Zurich and London. https://docs.aws.amazon.com/general/latest/gr/ses.html. Sandbox and quotas are "unique per each AWS Region". https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html. Customers "Determine where their customer data will be stored". https://aws.amazon.com/compliance/gdpr-center/. AWS is a US company (US jurisdiction). Whether AWS support or engineering can access SES data from outside the EU **[NOT CONFIRMED]**. An AWS European Sovereign Cloud is referenced on the SES pricing page. https://aws.amazon.com/ses/pricing/
4. **DPA.** The AWS GDPR DPA is part of the AWS Service Terms and applies automatically; "The AWS Service Terms include the SCCs". https://aws.amazon.com/compliance/gdpr-center/ and https://aws.amazon.com/compliance/faq/ (read via search snippets). DPF status of AWS **[NOT CONFIRMED]**.
5. **Pricing.** "$0.10 / 1,000 emails" à la carte, attachments "$0.12 per GB". No region surcharge is published. New AWS customers get "up to $200 in AWS Free Tier credits"; "The free plan will be available for 6 months after account creation." https://aws.amazon.com/ses/pricing/. Cost: ~3k ≈ $0.30, ~10k ≈ $1, ~50k ≈ $5 per month.
6. **API.** REST (SES API v2); official SDK `@aws-sdk/client-sesv2` (npm registry). No idempotency parameter on `SendEmail` (request body has none). https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html. Events go to SNS, EventBridge, Firehose or CloudWatch via configuration sets **[NOT CONFIRMED in detail]**. New accounts start in a sandbox: verified recipients only, "200 messages per 24-hour period", "1 message per second". https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
7. **Deliverability.** Shared AWS IPs, mixed customers. Production access needs a request (choose "Transactional"); AWS gives "an initial response to your request within 96 hours." https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html. Setup effort (IAM, config sets, SNS for webhooks) is higher than with the others.

### 2.5 Mailgun (Sinch), EU region

1. **Tracking.** "Event tracking is automatically enabled, with the exception for Unsubscribes, Opens, and Clicks." Opens and clicks can be set per domain and per message. https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/tracking-messages. Per-message override (`o:tracking`) **[NOT CONFIRMED from the page]**.
2. **List-Unsubscribe.** Unsubscribe handling works only "when you enable the Unsubscribe functionality"; then recipients "will be blocked from receiving future emails from that domain or message tag." Automatic `List-Unsubscribe` header behaviour is not stated **[NOT CONFIRMED]**. https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/tracking-unsubscribes. Suppressions (bounces, complaints, unsubscribes) are per domain, with delete endpoints such as `DELETE /v3/{domain}/bounces/{address}`. https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/bounces/delete-v3--domainid--bounces--address-
3. **EU residency.** EU base URL `api.eu.mailgun.net`. "message data never leaves the region in which it is processed." Global (not regional): account information, users, billing, API keys, domain names. Region-bound: messages, event logs, suppressions, statistics and more. https://documentation.mailgun.com/docs/mailgun/api-reference/api-overview. Sinch sub-processors include Mailgun Technologies, Inc. (USA) and Atlassian for support "USA & EU". https://sinch.com/legal/data-protection-agreement-sub-processors/ (read via search snippets). Whether the EU region is on the Free plan **[NOT CONFIRMED]**; the pricing page says US or EU from one account without tying it to a plan. https://www.mailgun.com/pricing/
4. **DPA.** Sinch Email DPA with EU SCCs (2021/914), CNIL as SCC authority; current version on sinch.com. https://www.mailgun.com/legal/dpa/ and https://sinch.com/legal/terms-and-conditions/other-sinch-terms-conditions/data-processing-agreement/. Mailgun Technologies is DPF-certified per Sinch's privacy notice. https://sinch.com/legal/privacy-notice/ (search snippet).
5. **Pricing.** Free "100 emails/day included", 1 day log retention. Basic from $15/month for 10k (from $1.80/1k extra). Foundation $35 for 50k. Scale $90 for 100k. https://www.mailgun.com/pricing/. Cost: ~3k Free (if under 100/day) or $15; ~10k $15; ~50k $35.
6. **API.** REST; official Node SDK `mailgun.js` (npm registry). Rate-limit headers `X-RateLimit-*`; no idempotency on the overview page. https://documentation.mailgun.com/docs/mailgun/api-reference/api-overview
7. **Deliverability.** Mixed senders on shared pools; dedicated IP pools on Scale. https://www.mailgun.com/pricing/

### 2.6 Twilio SendGrid

1. **Tracking.** Account settings toggle each tracking type; per request `tracking_settings` has `click_tracking`, `open_tracking`, `subscription_tracking` with `enable`. https://www.twilio.com/docs/sendgrid/ui/account-and-settings/tracking and https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send. Defaults for click tracking **[NOT CONFIRMED]**.
2. **List-Unsubscribe.** Subscription tracking "adds subscription management links". Whether a `List-Unsubscribe` header is added by default **[NOT CONFIRMED]**.
3. **EU residency.** Only through an EU subuser, and "Shared IP customers will need to upgrade a Pro or Premier package". Event data and recipient addresses are stored in the EU, but "Processing outside of the EU occurs when you request it for support requests", and engineering "might need data access". https://www.twilio.com/docs/sendgrid/data-residency/faq
4. **DPA.** Twilio DPA **[NOT CONFIRMED, not fetched]**.
5. **Pricing.** Free trial "$0/mo for 60 days", "100 emails/day". Essentials "starting at $19.95/mo", Pro "starting at $89.95/mo"; dedicated IPs on Pro and Premier. https://www.twilio.com/en-us/products/email-api/pricing. EU therefore costs at least $89.95/month.
6. **API.** Official Node SDK `@sendgrid/mail`. No idempotency on the mail-send page.
7. **Deliverability.** Mixed marketing and transactional; EU subusers cannot use Marketing.

### 2.7 Scaleway Transactional Email (TEM, France)

Scaleway's website returned HTTP 403 to automated reading. These notes come from Scaleway's own docs source repository (`github.com/scaleway/docs-content`, files under `pages/transactional-email/`), which publishes the same pages as scaleway.com/en/docs.

1. **Tracking.** The TEM docs describe delivery events, flags, blocklists and webhooks only. No open or click tracking or link rewriting is documented. Webhook event types are delivery-focused (delivered, dropped, queued, spam, mailbox not found). https://www.scaleway.com/en/docs/transactional-email/concepts/. A public feature request asks for click tracking: https://feature-request.scaleway.com/posts/528/click-tracking-on-transactional-emails. "TEM never rewrites links" is an inference from the docs **[NOT CONFIRMED by an explicit statement]**.
2. **List-Unsubscribe.** Not mentioned anywhere in the TEM docs **[NOT CONFIRMED whether headers are ever added]**. Blocklists are per domain. Bounces create a temporary block ("1 week", then "1 month", then unlimited). Manual additions need the Scale plan. Unblocking: "You can unblock up to five addresses every 24 hours." https://www.scaleway.com/en/docs/transactional-email/how-to/manage-blocklists/ and https://www.scaleway.com/en/docs/transactional-email/faq/. Blocklist API endpoints **[NOT CONFIRMED]**.
3. **EU residency. Pass.** "Transactional Email is only available in the `fr-par` region." https://www.scaleway.com/en/docs/transactional-email/reference-content/tem-capabilities-and-limits/. "All data is hosted and processed entirely within the European Union." "The entire Transactional Email (TEM) technical stack is fully managed by Scaleway, within the EU." https://www.scaleway.com/en/docs/transactional-email/faq/. Scaleway is a French company. Sub-processors: https://www.scaleway.com/en/subprocessorlist/ **[content NOT CONFIRMED, page blocked]**.
4. **DPA.** The FAQ refers to "Article 11 of our Data Processing Agreement" (SCCs for rare non-EU partners). Contracts page: https://www.scaleway.com/en/contracts/ **[content NOT CONFIRMED, page blocked]**. Email retention period **[NOT CONFIRMED]**.
5. **Pricing.** Essential plan: pay-as-you-go, "300 free emails (with an additional cost of €0.25 for every 1000 additional emails)". Scale plan: €80/month incl. 100k, €0.20/1k extra, dedicated IP, 30-day commitment. https://www.scaleway.com/en/docs/transactional-email/concepts/ and https://www.scaleway.com/en/docs/transactional-email/how-to/manage-tem-plans/. Each recipient counts as one email. Default quota "10,000" emails/month, upgradable via support after payment and identity validation. https://www.scaleway.com/en/docs/transactional-email/reference-content/tem-capabilities-and-limits/. Cost: ~3k ≈ €0.68, ~10k ≈ €2.43, ~50k ≈ €12.43 (needs a quota raise above 10k).
6. **API.** REST API (https://www.scaleway.com/en/developers/api/transactional-email) and SMTP. Official SDK `@scaleway/sdk-tem` (repo scaleway/scaleway-sdk-js, npm registry). Idempotency **[NOT CONFIRMED, none documented]**. Webhooks via Scaleway Topics and Events; one webhook per domain on Essential.
7. **Deliverability.** Transactional-only: "You cannot use Transactional Email to send marketing emails." https://www.scaleway.com/en/docs/transactional-email/faq/. Essential uses shared IPs; Scale gets a dedicated IP (IPv4 + IPv6). New users "may face stricter initial limits". https://www.scaleway.com/en/docs/transactional-email/reference-content/tem-capabilities-and-limits/

### 2.8 Lettermint (Dutch)

1. **Tracking.** "Tracking disabled by default"; set per route, with a per-email override `settings: { track_opens, track_clicks }` that takes "precedence over the selected route's tracking settings". https://lettermint.co/docs/platform/emails/tracking/introduction. "Tracking is off by default and works fully opt-in." https://lettermint.co/changelog/email-tracking-per-email-on-off.md. On Free, open and click tracking is not available at all. https://lettermint.co/pricing
2. **List-Unsubscribe.** Added only on the broadcast route: "we automatically add the correct List-Unsubscribe headers to all your broadcast emails"; it "only applies to our Broadcast route." https://lettermint.co/knowledge-base/definitions/what-is-list-unsubscribe-header.md. Suppressions have team, project and route scopes, reasons `spam_complaint`, `hard_bounce`, `unsubscribe`, `manual`; "Manual suppressions block all mail unless `applies_to` is `broadcast`." List (`GET /suppressions`) and delete (`DELETE /suppressions/{suppressionId}`) by Team API. https://lettermint.co/docs/api-reference/team/suppression. Default scope of automatic hard-bounce and complaint suppressions (team-wide or per route) **[NOT CONFIRMED]**.
3. **EU residency. Pass.** Lettermint "processes and stores your email data only in the EU" on every plan. https://lettermint.co/pricing. DPA: Email Data processing "shall take place within the European Union" (s. 8.1); no remote access from outside the EEA unless authorised and Chapter V is met (s. 8.4). https://lettermint.co/dpa.md. Sub-processors: UpCloud (NL, hosting), OVH Cloud (DE, encrypted backups), Postmastery (NL); Aikido and Mistral listed as "Europe". https://lettermint.co/subprocessors.md. Company: Lettermint B.V., Zwolle, KvK 99337711, Dutch law. https://lettermint.co/dpa.md
4. **DPA.** "applies automatically whenever Lettermint processes Controller Personal Data"; 30 days' notice of new sub-processors; retention 28 days for messages and metadata, 90 days max for events. https://lettermint.co/dpa.md. Transfers rely on "appropriate safeguards under Article 46 GDPR" (SCCs not named).
5. **Pricing.** Free €0 for 300 emails/month, 1 domain, 1 user, no expiry stated. Starter €10/month for 10k (€1.50/1k extra), Growth €13, Pro €15 at 10k. At 50k: Starter €40, Growth €45, Pro €55. Nothing between 300 and 10,000. "EU infrastructure, GDPR, DPA" on every plan. https://lettermint.co/pricing. Cost: ~3k €10, ~10k €10, ~50k €40.
6. **API.** REST `POST https://api.lettermint.co/v1/send`, header `x-lettermint-token`; `route`, `headers`, `settings`, `tag`, `metadata`; 429 with `Retry-After`. https://lettermint.co/docs/api-reference/sending/0.0.1/lettermint-sending-openapi.json. `Idempotency-Key` header, "Keys expire 24 hours after first use"; same key with a different body returns 409. https://lettermint.co/docs/platform/emails/idempotency. Official Node SDK `lettermint` (repo lettermint/lettermint-node, npm registry). Webhooks per team, project or route. https://lettermint.co/changelog/webhooks-for-team-projects-or-routes.md
7. **Deliverability.** Mixed product (transactional and broadcast), but "Transactional email and newsletters go out on separate IP pools"; own IP ranges (AS213427). https://lettermint.co/features/transactional-emails.md. New teams are reviewed "before unrestricted production sending"; before approval you can send only to team members and test addresses. https://lettermint.co/docs/platform/onboarding/compliance-verification

### 2.9 Mailjet (Sinch)

1. **Tracking.** Per-message `TrackOpens`/`TrackClicks` in Send API v3.1 exists in the API reference but was not readable here **[NOT CONFIRMED]**. https://dev.mailjet.com/email/reference/send-emails/
2. **List-Unsubscribe. Fails H4 (as published).** "a List-Unsubscribe header is added to all emails sent from Mailjet." https://www.mailjet.com/blog/deliverability/fireside-chat-with-google-and-yahoo/. Campaign exclusions still allow transactional mail per Mailjet's help centre (search snippet) **[NOT CONFIRMED whether a header click suppresses transactional]**.
3. **EU residency.** Mailjet's help centre names Google Cloud in Frankfurt and Saint-Ghislain (Belgium). https://documentation.mailjet.com/hc/en-us/articles/360042712274-Where-is-my-personal-data-stored (search snippet; page blocked). Sinch sub-processors list Mailgun Technologies (USA) for Mailjet. https://sinch.com/legal/data-protection-agreement-sub-processors/
4. **DPA.** Sinch Email DPA (same as Mailgun).
5. **Pricing.** Free 6,000/month, "200 emails per day", Mailjet logo. Essential $19 for 15k; Premium $29. 50k price not shown. https://www.mailjet.com/pricing/
6. **API.** Official Node SDK `node-mailjet`; `SandboxMode` flag. https://dev.mailjet.com/email/guides/send-api-v31/. Idempotency **[NOT CONFIRMED]**.
7. **Deliverability.** Marketing-first platform with transactional API.

### 2.10 MailerSend

1. **Tracking.** Per-domain `track_clicks`, `track_opens`, `track_unsubscribe`, `track_content`; defaults and per-email override not documented **[NOT CONFIRMED]**. https://developers.mailersend.com/api/v1/domains.html
2. **List-Unsubscribe.** Unsubscribe tracking is a domain setting; header behaviour **[NOT CONFIRMED]**.
3. **EU residency. Weak.** Hosted on Google Cloud in Belgium, but the DPA allows processing "in the United States and anywhere else in the world". https://www.mailersend.com/legal/how-mailersend-stays-gdpr-compliant and https://www.mailersend.com/legal/data-processing-addendum (search snippets).
4. **DPA.** Part of the Terms of Use; SCCs; DPF. Same sources.
5. **Pricing.** Free "500 emails /month", card required; 50k tiers around €25; overage $1.30/1k. Page has inconsistencies. https://www.mailersend.com/pricing
6. **API.** Official Node SDK `mailersend`; 120 send requests/minute; no idempotency documented. https://developers.mailersend.com/general.html
7. **Deliverability.** Sister of MailerLite (marketing) **[NOT CONFIRMED pool separation]**.

### 2.11 SMTP2GO

1. **Tracking.** Set per SMTP user, IP or API key; "Tracking & Status" lets you enable or disable open and click tracking; `data-no-track` per link. https://support.smtp2go.com/hc/en-gb/articles/900002237106-Click-Tracking (search snippets). Defaults **[NOT CONFIRMED]**.
2. **List-Unsubscribe.** **[NOT CONFIRMED]**.
3. **EU residency.** EU data centre in Amsterdam; EU sign-ups are assigned to it; `mail-eu2.smtp2go.com` for EU-only servers. https://support.smtp2go.com/hc/en-gb/articles/12974008254873-EU-Data-Center (search snippets). Company in New Zealand **[NOT CONFIRMED]**.
4. **DPA.** Available in the dashboard (search snippet) **[NOT CONFIRMED]**.
5. **Pricing.** Free 1,000/month, no time limit. Starter $10 for 10k ($1/1k extra). Professional $75 for 100k. https://www.smtp2go.com/pricing/
6. **API.** REST; official Node SDK **[NOT CONFIRMED]**; idempotency **[NOT CONFIRMED]**.
7. **Deliverability.** **[NOT CONFIRMED]**.

### 2.12 Sweego (France)

1. **Tracking.** Email tracking is "Activated per domain" with switches and a CNAME. https://www.sweego.io/product/new-email-sms-tracking. Default off and full disable **[NOT CONFIRMED]**.
2. **List-Unsubscribe.** **[NOT CONFIRMED]**.
3. **EU residency.** Hosted in France on OVHcloud and Scaleway per Sweego's own sovereignty page. https://www.sweego.io/corporate/understanding-the-cloud-sovereignty-framework-and-sweegos-position-within-this-new-european-benchmark (search snippet).
4. **DPA.** "accepted by the customer upon registration" per the terms of sale. https://www.sweego.io/general-terms-and-conditions-of-sale (search snippet). Sub-processor list URL **[NOT CONFIRMED]**.
5. **Pricing.** Free 100 emails/day, 7-day logs. Individual €10/month (€8 on annual) for 20k; 50k price **[NOT CONFIRMED]**. https://www.sweego.io/pricing
6. **API.** REST and SMTP; docs at https://learn.sweego.io; SDK and idempotency **[NOT CONFIRMED]**.
7. **Deliverability.** Email and SMS for tech companies **[NOT CONFIRMED pool separation]**.

### 2.13 Elastic Email

Vendor pages say data centres are mostly in the EU, but free shared pools may move email data outside the EU for up to 48 hours. https://elasticemail.com/blog/updates/elastic-emails-guide-gdpr (search snippet). Free plan and $19 for 50k per https://elasticemail.com/email-api-pricing (search snippet). Tracking and List-Unsubscribe **[NOT CONFIRMED]**. Not researched further: fails H2 on the free pool and is marketing-first.

### 2.14 Bird (formerly MessageBird; SparkPost/SparkPost EU)

1. **Tracking. Pass.** Tracking needs all three: the per-send flag (default `true`), the domain's setting (default "Off") and a verified tracking CNAME. "They remain off until you enable them for the sending domain." Docs advise: "Set `track_clicks: false` on password resets and security notifications." https://bird.com/docs/guides/email/open-click-tracking. Per send: "Set either to `false` to skip open-pixel injection or link rewriting on this send." https://bird.com/en-us/docs/guides/email/sending-email
2. **List-Unsubscribe. Pass.** "Transactional sends accept `List-Unsubscribe` and `List-Unsubscribe-Post`" (yours, not Bird's); marketing sends get Bird-managed unsubscribe. Suppression depends on `category`: "`transactional` delivers through a complaint suppression or a marketing-only opt-out". https://bird.com/en-us/docs/guides/email/sending-email. Suppression API **[NOT CONFIRMED]**.
3. **EU residency.** Each organisation is pinned to a region at signup. For `eu1`, workspace, API keys, messages, recipient data and event logs "remain in that region" and are "never replicated across regions"; only auth and admin are global. https://bird.com/en-us/docs/api/regions. Sub-processors include "Bird Affiliates" in the Netherlands, UK and USA. https://bird.com/legal/subprocessors (search snippet). Bird's 2022 DPA names MessageBird B.V., Amsterdam. https://bird.com/legal/dpa-previous-2022-02 (search snippet). Current HQ and DPA version **[NOT CONFIRMED]**.
4. **DPA.** Current DPA text **[NOT CONFIRMED]**; 2023 version: https://bird.com/legal/dpa-previous-2023
5. **Pricing.** Free 1,000/month, "50/day cap", no overage. Paid plans are monthly deposits: Startup $15 at $0.40/1k, Growth $250 at $0.45/1k; "Paid plans include no free sends"; unused funds carry forward. https://bird.com/pricing/email?sp=true. Cost: ~3k ≈ $1.20 usage (min. $15 deposit), ~10k ≈ $4, ~50k ≈ $20. EU-region price difference **[NOT CONFIRMED]**.
6. **API.** `POST /v1/email/messages` on `https://eu1.platform.bird.com`, bearer token. https://bird.com/docs/guides/email/migrate/sparkpost. `Idempotency-Key` header with replay. https://bird.com/en-us/docs/guides/email/sending-email. Official Node/TS SDK **[NOT CONFIRMED]** (SDK docs at https://bird.com/docs/sdks not read). Free plan: "10 Send API requests per minute".
7. **Deliverability.** Mixed marketing and transactional, separated by `category` **[NOT CONFIRMED IP pool separation]**.

### 2.15 Mailtrap Email Sending

US hosting: Mailtrap's GDPR doc says AWS `us-east-1` and Google in the US, with EU storage planned for 2026. https://docs.mailtrap.io/account-and-organization/privacy-and-security/gdpr-compliance (search snippet). Sub-processors mostly US. https://mailtrap.io/sub-processors/. Free 4,000/month, 150/day; Basic $15 for 10k, $20 for 50k. https://mailtrap.io/pricing/. Fails H2; not researched further.

### 2.16 ZeptoMail (Zoho, now "Zoho CPaaS")

1. **Tracking.** Per Mail Agent; can be disabled; per-message `track_opens`/`track_clicks` and SMTP headers `X-TM-OPEN-TRACK`/`X-TM-CLICK-TRACK`. https://www.zoho.com/zeptomail/help/email-tracking.html (search snippets). Default **[NOT CONFIRMED]**.
2. **List-Unsubscribe.** **[NOT CONFIRMED]**.
3. **EU residency.** Data centre follows the Zoho domain used at signup (`cpaas.zoho.eu` → EU). https://zoho.com/zeptomail/gdpr.html (search snippet). Zoho's processor list includes a US entity for zoho.eu data centres (community report) **[NOT CONFIRMED]**.
4. **DPA.** **[NOT CONFIRMED]**.
5. **Pricing.** Credits of "10,000 emails per credit", "First credit is free", credits "valid for 6 months"; price per credit not shown on the page. https://www.zoho.com/zeptomail/pricing.html
6. **API.** REST; SDK and idempotency **[NOT CONFIRMED]**.
7. **Deliverability.** Transactional-only product **[NOT CONFIRMED]**.

---

## 3. Comparison table

"Pass" = meets the hard requirement as published. Prices are monthly, from the provider pages (or derived), excluding VAT.

| Provider | Tracking fully off (plan) | List-Unsubscribe control (transactional) | EU region | DPA | Free tier | ~3k/mo | ~10k/mo | ~50k/mo | Node SDK | Idempotency |
|---|---|---|---|---|---|---|---|---|---|---|
| **Brevo** (baseline) | Only Professional/Enterprise (per support); new per-contact consent flag unclear | Always added; List-Help only Enterprise | EU (FR/DE/BE) | Yes | 300/day | €0 (Free) | €7–15 | €7–15+ | Yes | No |
| **Brevo Professional** | Yes (per support) | **No**, still added | EU | Yes | n/a | €499 | €499 | €499 | Yes | No |
| Postmark | Yes, default off, all plans | Not added; per stream | **No (US)** | Yes, SCCs | 100/mo | $15 | $15 | ~$66–87 | `postmark` | No |
| Resend | Yes, default off, all plans | Not added | Sending only; **data in US** | Yes, SCCs + DPF | 3k/mo, 100/day | $0 | $20 | $20 | `resend` | Yes |
| **Amazon SES** | Yes, off unless configured; per message | Not added unless `ListManagementOptions` | Yes (Frankfurt, Ireland, Paris…) | Yes, in Service Terms | Credits (new accounts) | ~$0.30 | ~$1 | ~$5 | `@aws-sdk/client-sesv2` | No |
| **Mailgun EU** | Yes, opens/clicks/unsub off by default | Unsub handling off by default; header [NC] | Yes; account data global | Yes (Sinch), SCCs | 100/day | $0–15 | $15 | $35 | `mailgun.js` | No |
| SendGrid | Toggles; defaults [NC] | [NC] | Pro+ only; support outside EU | [NC] | 60-day trial | $19.95 | $19.95 | $89.95+ for EU | `@sendgrid/mail` | No |
| **Scaleway TEM** | No tracking feature documented | Not documented [NC] | Yes, `fr-par` only | Yes | 300/mo | ~€0.68 | ~€2.43 | ~€12.43 | `@scaleway/sdk-tem` | No [NC] |
| **Lettermint** | Yes, default off; not on Free at all | Only on broadcast route | Yes, EU only | Yes, automatic | 300/mo | €10 | €10 | €40 | `lettermint` | Yes |
| Mailjet | Per message [NC] | **Added to all emails** | EU (GCP) | Yes (Sinch) | 6k/mo, 200/day, logo | $0 | $19 | [NC] | `node-mailjet` | [NC] |
| MailerSend | Domain toggles [NC] | [NC] | Hosted BE; DPA allows US | Yes | 500/mo | [NC] | [NC] | ~€25 [NC] | `mailersend` | No |
| SMTP2GO | Per API key toggle | [NC] | Yes (Amsterdam) | [NC] | 1k/mo | $10 | $10 | ~$50–75 | [NC] | [NC] |
| Sweego | Per domain, opt-in [NC] | [NC] | France (vendor claim) | Yes (terms) | 100/day | €10 | €10 | [NC] | [NC] | [NC] |
| **Bird (SparkPost)** | Yes, domain off by default; per-send `false` | Not added on `transactional` | Yes, `eu1` pinned | Yes [NC current text] | 1k/mo, 50/day | $15 deposit | $15 | ~$20 | [NC] | Yes |
| Mailtrap | [NC] | [NC] | **No (US)** | Yes, SCCs | 4k/mo, 150/day | $15 | $15 | $20 | [NC] | [NC] |
| ZeptoMail | Per agent + per message | [NC] | Via zoho.eu [NC] | [NC] | First 10k free | [NC] | [NC] | [NC] | [NC] | [NC] |
| Elastic Email | [NC] | [NC] | Mostly EU; free pool leaves EU | [NC] | ~3k/mo [NC] | [NC] | [NC] | $19 [NC] | [NC] | [NC] |

[NC] = NOT CONFIRMED.

---

## 4. Shortlist

**Pass all four hard requirements (as published):**

1. **Lettermint.** Dutch B.V., EU-only processing, EU sub-processors, DPA applies automatically. Tracking off by default (and absent on Free). No `List-Unsubscribe` on transactional routes. Has `Idempotency-Key`, official Node SDK, suppression API with route scopes, separate IP pools for transactional and broadcast. Cost: Free 300/month is too small for the pilot, so pilot means Starter at €10/month (10k); €40 at 50k. Gaps: default scope of automatic bounce/complaint suppressions; account review before production sending.
2. **Scaleway TEM.** French, `fr-par` only, "no personal data is transferred outside the EU". Transactional-only platform. No open/click tracking at all as far as the docs show. Cheapest at every volume (≈ €0.68 at 3k, ≈ €12 at 50k). Gaps: no idempotency key; List-Unsubscribe behaviour not documented; default quota 10k/month needs a support raise; blocklist unblock limited to five per day; webhooks only through Scaleway Topics and Events.
3. **Amazon SES (eu-central-1 or eu-west-1).** Tracking and unsubscribe headers exist only if you configure them. Very cheap (≈ $5 at 50k). DPA with SCCs in the Service Terms. Caveats: US company; support access from outside the EU not confirmed; no idempotency key; sandbox and production-access review; more setup (IAM, configuration sets, SNS/EventBridge for events).
4. **Bird (EU region).** EU data pinned to `eu1`; tracking off at domain level by default and per-send `false`; no Bird `List-Unsubscribe` on `transactional` sends; idempotency. Caveats: Bird affiliates in the USA and UK are sub-processors; current DPA text and Node SDK not confirmed; Free (50/day) too small for the pilot; $15 minimum monthly deposit.
5. **Mailgun EU (conditional).** Opens, clicks and unsubscribe handling are off by default; message data stays in the EU region. Caveats: account data is global; US group companies are sub-processors; automatic `List-Unsubscribe` behaviour not confirmed; no idempotency key; Free plan EU availability not confirmed.

**Need verification before they can be shortlisted:** SMTP2GO (EU DC exists; List-Unsubscribe and DPA not confirmed), Sweego (EU-native; tracking default and List-Unsubscribe not confirmed), ZeptoMail (EU via zoho.eu; residency and headers not confirmed).

**Fail:**
- **Postmark:** US only; no EU servers planned (H2).
- **Resend:** account data, metadata and logs stored in the US whatever the region (H2).
- **Mailtrap:** US hosting (H2).
- **SendGrid:** EU only on Pro+ (≥ $89.95/month) and processing outside the EU for support (H2, and cost).
- **Mailjet:** "a List-Unsubscribe header is added to all emails" (H4).
- **MailerSend:** DPA allows processing in the US and anywhere (H2); tracking defaults unclear.
- **Elastic Email:** free pools move data outside the EU (H2); marketing-first.
- **Brevo Free/Starter/Standard:** tracking cannot be fully off (H1) and List-Unsubscribe is always added (H4).

---

## 5. Brevo Professional as the baseline

- **Cost:** €499/month (USD $499, GBP £429), "From 150,000 emails per month", sold through "Talk to sales". https://www.brevo.com/pricing/ (structured price data on the page). That is roughly 12–50× the cost of any shortlisted provider at 50k/month.
- **Tracking (H1):** Brevo support told the owner that Professional can fully disable open and click tracking. No public page confirms it **[NOT CONFIRMED publicly]**.
- **List-Unsubscribe (H4): not fixed.** Replacing `List-Unsubscribe` with `List-Help` is "only available with an Enterprise plan". So on Professional a recipient can still click the mail client's unsubscribe button on a sign-in email and block future sign-in codes from `noreply@fivvi.app`.
- **Verdict:** Professional fixes at most one of the two issues, at €499/month. Only Enterprise ("Custom Price") fixes both.
- **One open question worth asking Brevo:** the new per-contact consent flag (`contactPixelTrackingConsent: false`, "Brevo does not track opens or clicks for this email") might remove tracking on cheaper plans. Ask Brevo (1) whether links are still rewritten with `false`, and (2) which plans have it. Even if yes, the List-Unsubscribe problem stays, so H4 still fails below Enterprise.

---

## 6. Options compared for Fivvi

This section is analysis, not source notes. It weighs the sourced facts above against Fivvi's own code.

**What the risk really is today.** The sign-in token is valid for 15 minutes and can be used once (`SIGN_IN_EXPIRES_IN_MINUTES`, `packages/auth/src/sign-in-plugin.ts`). Opening the link only shows the confirm page; only the button's POST uses the token up. So Brevo's click redirect, or a link scanner following it, doesn't sign anyone in. What remains:
- The token sits in Brevo's click data. Someone with access to that data could use it within those 15 minutes, before the user does.
- Sign-in links go through a domain that isn't ours.
- The List-Unsubscribe block. One click on Gmail's "Unsubscribe" next to any Fivvi email stops sign-in codes for that address until someone lifts the block by hand. Brevo confirmed this on 1 November 2026.

| Option | Cost at pilot (~3k/month) | Cost at ~50k/month | Fixes tracking (H1) | Fixes unsubscribe block (H4) | Work for us |
|---|---|---|---|---|---|
| A. Stay on Brevo Free/Starter, accept both risks | €0, later Starter | Starter/Standard | No (anonymous tracking only) | No; needs a runbook or code to lift blocks, and ideally a separate sign-in sender | Runbook; optional second sender |
| A+. Same, plus the new `contactPixelTrackingConsent: false` flag | €0 | as A | Only if Brevo confirms links are no longer rewritten **[NOT CONFIRMED]** | No | One field in `brevoRequestBody` |
| B. Brevo Professional | €499/month | €499/month | Yes (support ticket only) | No | None |
| C. Brevo Enterprise | Custom price | Custom price | Yes | Yes | None |
| D. Lettermint | €10/month Starter (Free stops hard at 300/month, see `ADR-009-lettermint.md` §4) | €40/month | Yes, off by default | Yes, header only on broadcast | New transport like `brevo.ts` with idempotency, DKIM records, sub-processor and ADR update |
| E. Scaleway TEM | ~€0.68 | ~€12.43 (quota raise) | Yes (no tracking feature) | Probably **[NOT CONFIRMED]** | New transport without idempotency (a retry could send twice), DKIM, docs |
| F. Amazon SES (EU) | ~$0.30 | ~$5 | Yes, off unless configured | Yes, header only on request | Most setup (sandbox exit, IAM, events), no idempotency; US company |

**Reading the table.**
- B and C don't make sense at our volume: €499/month buys half a fix.
- A costs nothing, but it leaves the token in a third party's click data and a one-click way for a user to lose sign-in. The owner already accepted the header risk on 30 October 2026, when it wasn't yet known that it blocks sign-in.
- D, E and F fix both issues for €0–€40/month. The paid email plan was already planned for go-live (`ROADMAP.md` M9), so the extra cost over staying on Brevo is a few euros a month.
- The swap is small because `sendEmail` hides the provider (ADR-009). We already send an idempotency key, and Lettermint is the only shortlisted provider that honours one.

**Suggested choice: D (Lettermint), with E (Scaleway TEM) as the written fallback.**
- Lettermint: Dutch company, EU-only processing, DPA in the terms, tracking off by default, no List-Unsubscribe on transactional email, idempotency, and an official Node SDK.
- Its main risk is the company: it is young and small (Chamber of Commerce number 99337711). That is why a fallback is kept.
- Before deciding, do one test send from a Lettermint trial to a Gmail inbox. Check the raw headers for no `List-Unsubscribe` and the links for no rewriting. The deeper study, with suppression scopes, quota behaviour, terms and a trial checklist, is in [ADR-009-lettermint.md](ADR-009-lettermint.md).

**If the owner prefers to stay on Brevo,** do A+ only after Brevo confirms that the consent flag stops link rewriting. Add a separate sign-in sender address on `fivvi.app`, so an unsubscribe from a booking email can't block sign-in. Add a support runbook for lifting unsubscribe blocks.

---

## Key gaps ([NOT CONFIRMED])

- Brevo: whether `contactPixelTrackingConsent: false` stops link rewriting, and on which plans; Professional tracking-off only from the support ticket.
- Lettermint: default scope of automatic hard-bounce and spam-complaint suppressions (team vs route).
- Scaleway: explicit statement that no link rewriting or `List-Unsubscribe` is ever added; email retention period; blocklist API.
- Amazon SES: AWS DPF status and support access from outside the EU.
- Bird: current DPA text, company HQ today, official Node SDK, suppression API.
- Mailgun: automatic `List-Unsubscribe` header, `o:tracking` per message, EU region on Free.
- SMTP2GO, Sweego, ZeptoMail: List-Unsubscribe behaviour and DPA details.
