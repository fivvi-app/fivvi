# Lettermint for Fivvi: company, reliability, deliverability, quota, security, legal and API fit

> Source notes for [ADR-028](../ADR-028-transactional-email-through-lettermint.md), gathered by a research agent from primary sources on 2 November 2026. They go deeper than [ADR-028-email-providers.md](ADR-028-email-providers.md) §2.8 and §6, and do not repeat them. Provider terms and prices change; re-check before relying on a figure.

Research date: 2026-11-02 (all pages accessed then). Method: Lettermint's own pages, read as their `.md` versions listed in https://lettermint.co/llms.txt (with `last_updated` noted where it matters); the docs, read through https://lettermint.co/docs/llms.txt and https://lettermint.co/docs/llms-full.txt; the Sending API OpenAPI spec; the changelog, roadmap and legal pages; the status page (incident.io) and its RSS feed; the Trust Center (Vanta, JavaScript only, read in a browser); RIPE NCC data (RIPEstat and the RIPE Database) for AS213427; the npm registry and the `lettermint` GitHub org. One vendor case study (KumoMTA) linked from Lettermint's own `llms.txt` is used and marked as such. Quotes are short and exact. Items marked **[NOT CONFIRMED]** are inferences or gaps. Blocked or unreadable: the Dutch KvK search (JavaScript app, no data returned) and Postmastery's case study (HTTP 403). The research sections (1–9) used public sources only; the trial at the end used a Free account the owner created.

---

## 1. Company and continuity

**Who and when**
- Founders: Bjarn and Bjorn. They "signed the founding documents of Lettermint" at the end of 2024, with 1 January 2025 as the start date. https://lettermint.co/blog/lettermint-turns-1-and-we-are-just-getting-started.md (2 January 2026)
- Full names, from the KumoMTA case study: Bjarn Bronsveld (technical build) and Bjorn Antonissen (UI/UX). Vendor case study, self-reported. https://kumomta.com/customers/lettermint-builds-sovereign-european-email-infrastructure-on-kumomta-and-scales-100x. The npm maintainers are `bjarnbronsveld` and `bjornftw`. https://registry.npmjs.org/lettermint
- Timeline: GitHub org created 18 November 2024 (https://github.com/lettermint, via the GitHub API); AS213427 registered 13 February 2025 (https://rest.db.ripe.net/ripe/aut-num/AS213427); first email over their own IPs at the end of February 2025; "beta launch at the end of May" 2025 (turns-1 blog above). Terms and DPA were first published on 2025-05-29 (`published` field of https://lettermint.co/terms-of-service.md). So the service has been public for about **17 months**.
- Legal form: started as a V.O.F. (partnership); "Lettermint V.O.F became Lettermint B.V." at the start of 2026 (turns-1 blog). Lettermint B.V., KvK 99337711, Willemsvaart 16 B, 8019 AB Zwolle. https://lettermint.co/terms-of-service.md §3, https://lettermint.co/contact ("Appointments only").
- Ownership and funding: "privately held and founder-owned, with no external investors, VC funding, or parent company." https://lettermint.co/european-email.md
- Team size: no figure published anywhere I could read **[NOT CONFIRMED]**. The KumoMTA case study calls the company bootstrapped and names only the two founders. The confidentiality page says "Everyone on the team holds a certificate of conduct (VOG)". https://lettermint.co/confidentiality.md. The Node SDK's human commits are almost all by one person (`bjarn`, 51 commits; the rest are bots). https://github.com/lettermint/lettermint-node (GitHub API, contributors)
- Other products of the founders: none found on Lettermint's own sources **[NOT CONFIRMED]**.
- KvK extract (registration date, SBI, directors, employees): not reachable; the KvK search is a JavaScript app that returned no data **[NOT CONFIRMED]**.

**Customers and scale**
- No customer count is published. https://lettermint.co/testimonials ("Loved by developers", ~26 named small companies and founders), https://lettermint.co/contact
- Logos on the home page: Loavies, Provincie Noord-Holland, Provincie Zeeland, Volt Europa, Bitonic, lekker Energie. https://lettermint.co
- Volume claims: "Tens of millions of emails go through Lettermint every month." https://lettermint.co/pricing.md. KumoMTA case study: about 50,000 emails a month in September 2025, about 200,000 a day by July 2026 (vendor case study, self-reported).

**If Lettermint stops**
- Lettermint may end the contract "at any time" with "at least thirty (30) calendar days' prior written notice". https://lettermint.co/terms-of-service.md §19.3
- It may discontinue the service with at least 30 days' notice and "is not liable for any damage resulting from such discontinuation". Same page, §8.6.
- Force majeure explicitly includes "illness of employees and/or absence of employees who are crucial" to the service; under force majeure Lettermint may cancel "with immediate effect". §17.2, §17.4. This is a written bus-factor clause.
- After termination the customer has 30 days to retrieve data; then Lettermint may delete it, and may charge for help with retrieval. §19.9.3; DPA §11.2–11.4 (export "in a commonly used, machine-readable format"). https://lettermint.co/dpa.md
- What matters for us is small: messages and events are kept only 28 days anyway, and we keep our own copy of what we send. The real continuity risk is losing sending at 30 days' notice, which the `sendEmail` seam and a written fallback (providers note §6) cover.

## 2. Reliability

**Status page.** https://status.lettermint.co runs on incident.io (the page's own assets and the `/proxy/status.lettermint.co` JSON). Components: website, dashboard, Team API, Sending API, SMTP relay, inbound, outgoing transactional, outgoing broadcast, webhooks, custom domains, open and click tracking. Data since 7 March 2025 (website) and 17 March 2025 (APIs). https://status.lettermint.co/proxy/status.lettermint.co. The public history shows a 90-day window (August–November 2026); older incidents are not shown.

**Uptime shown (Aug–Nov 2026, read on 2 November):** API 99.97%, SMTP relay 99.97%, outbound delivery 100%, webhooks 100%, tracking 99.993%. https://status.lettermint.co

**Incidents in the visible window** (https://status.lettermint.co/history, https://status.lettermint.co/feed.rss):

| Date (2026) | Title | Impact |
|---|---|---|
| 15 Oct | Intermittent API errors | 18:26–18:30 UTC; about 170 sends via API/SMTP rejected with a temporary error. A database connection stuck read-only. "Messages from rejected requests were not accepted and not sent." |
| 11 Oct | Delayed webhook delivery | About 1 h 14 min of delayed webhooks; no events lost; sending unaffected. Cause not stated. https://status.lettermint.co/incidents/01M4N7HE90THZZSACYXA55Y8B5 |
| 1 Oct | Intermittent API errors | 19:56–20:07 CEST, "a small percentage of requests". https://status.lettermint.co/incidents/01M3WAH93EPAH3DE4RVF29WZ8N |
| 23 Sep | Widespread platform outage | Message intake stopped 18:51–18:57 and 19:02–19:04 CEST; Sending API errors until about 20:04 during emergency maintenance. https://status.lettermint.co/incidents/01M37K0H3VNEW9170PRBWB0J55 |
| 1 Sep | API and SMTP relay degradation | One API instance failed some requests (04:01–04:06 UTC), then recurred; "The cause was a defect in the PHP JIT." Accepted email not lost. https://status.lettermint.co/incidents/01M1DSVJS7NA9V15MJ5T19R3FN |
| 12 Aug | [Blocklist] Broadcast IP blocked with Outlook | One broadcast IP pulled; "Transactional routes and other broadcast IPs remain unaffected." |

- 23 September write-up: "A RabbitMQ disk alarm caused both interruptions." A three-broker RabbitMQ cluster stopped publishing cluster-wide; monitoring did not alert in time. Follow-ups: more storage, RabbitMQ 4.3.6, better alerts. It does not say explicitly whether accepted messages were lost ("We retried queued jobs after recovery"). https://status.lettermint.co/incidents/01M37K0H3VNEW9170PRBWB0J55/write-up
- Earlier, 2025: "We had some bumps that our customers unfortunately noticed. Emails that were delayed". They then migrated to multi-AZ. https://lettermint.co/blog/lettermint-turns-1-and-we-are-just-getting-started.md
- Pattern: five platform incidents in about ten weeks (Aug–Oct 2026), each short (minutes), all published with honest detail. Not large, but frequent for a sign-in path. A send that gets a 5xx must be retried by us (see §7, idempotency).

**SLA.** None below Enterprise: "SLA … Enterprise" only, on Pro. https://lettermint.co/pricing.md. The terms: Lettermint "does not guarantee uninterrupted availability" (§8.1) and is not liable for temporary unavailability except for intent or deliberate recklessness (§8.4). https://lettermint.co/terms-of-service.md

**Infrastructure.**
- API, dashboard and SMTP hosts resolve to UpCloud address space (AS202053, "UPCLOUD UpCloud Ltd"): `api.lettermint.co` → 85.9.214.69 / 85.9.219.187; `smtp.lettermint.co` → 85.9.217.22 / 85.9.214.239 (DNS lookup and https://stat.ripe.net/data/prefix-overview/data.json?resource=85.9.214.69). No CDN in front.
- "spread across multiple availability zones, with encrypted backups at a separate provider in Germany" (OVH). https://lettermint.co/european-email.md, https://lettermint.co/subprocessors.md
- Processing "exclusively on infrastructure in Amsterdam and Germany". https://lettermint.co/confidentiality.md
- KumoMTA on self-managed Kubernetes, first on OVHcloud, then a "dedicated private cloud with UpCloud" in Amsterdam (vendor case study). The backend is PHP (1 Sep incident) with RabbitMQ (23 Sep write-up). Whether the UpCloud "zones" are separate data centres or one Amazon-style region **[NOT CONFIRMED]**.

**Retries when a recipient server defers.**
- Lettermint retries deferrals automatically and detects greylisting to "retry at exactly the right moment". https://lettermint.co/knowledge-base/deliverability/what-is-greylisting-why-email-delayed.md
- Temporary errors "become final failures only if the usual delivery retry window expires". https://lettermint.co/docs/llms-full.txt (TLS page, https://lettermint.co/docs/platform/emails/tls.md). The length of that window is not published **[NOT CONFIRMED]**. Soft bounces raise `message.soft_bounced` webhooks.

## 3. Deliverability

**IP space (RIPE).**
- AS213427, holder "LETTERMINT Lettermint B.V.", created 2025-02-13, sponsoring LIR "Lagrange Cloud Technologies Limited" (London). Peers in the routing policy: UpCloud (AS202053), OVH (AS16276), AS215577 (a personal AS). https://rest.db.ripe.net/ripe/aut-num/AS213427, https://stat.ripe.net/data/as-overview/data.json?resource=AS213427
- Announced prefixes on 2 November 2026: 155.254.62.0/24 (announced since February 2025), 212.74.55.0/24 (since February 2026) and 2a06:9801:227::/48 (since October 2026). https://stat.ripe.net/data/routing-history/data.json?resource=AS213427
- Both IPv4 /24s are **PA space assigned to Lettermint from UK LIRs** ("ASSIGNED PA" inside SYN LTD's block; "SUB-ALLOCATED PA" inside Chillishot Ltd's block). They are leased, not Lettermint's own allocation. https://stat.ripe.net/data/whois/data.json?resource=155.254.62.0/24, https://stat.ripe.net/data/whois/data.json?resource=212.74.55.0/24
- Their SPF names exactly these two /24s: `spf.lmta.net` = `v=spf1 ip4:155.254.62.0/24 ip4:212.74.55.0/24 -all` (DNS lookup). So all outbound mail, every customer and both pools, comes from 512 IPv4 addresses.

**Shared vs dedicated.** Managed (shared) IP pools on every plan. Dedicated IP is a €50/month add-on only on Pro from 300,000 emails/month; BYOIP is Enterprise. https://lettermint.co/pricing.md. Transactional and broadcast use separate pools (providers note §2.8); the status page lists them as separate components.

**Postmastery.** Listed as a sub-processor that "Monitors deliverability and IP reputation" and "Handles your emails" (NL). https://lettermint.co/subprocessors.md. Engaged from autumn 2025 (vendor case study). Postmastery's own case study returned HTTP 403 and was not read. Why a monitoring firm needs email access, and how much it sees **[NOT CONFIRMED]**.

**Onboarding review.**
- Unverified teams "can only send to verified team members and test addresses". https://lettermint.co/docs/platform/onboarding/compliance-verification.md. There is also a shared onboarding sender on the `lettermint.dev` domain for first tests. https://lettermint.co/docs/quickstart.md
- Questions: account type, website, email types, "How to handle unsubscribes", expected volume. Review is "Usually within a few hours" (Amsterdam time). https://lettermint.co/knowledge-base/account/verified-account-required-to-send-emails-this-is-why.md. Verification happens "during European business hours". https://lettermint.co/european-email.md

**Sending limits.**
- Pricing: daily limit "No limit" on every plan; monthly limit 300 on Free, "No limit" on paid plans; "Sending has no rate limits". https://lettermint.co/pricing.md
- But other docs hint at hidden limits: Sandbox messages "do not affect … reputation, warmup, or Live sending limits" (https://lettermint.co/docs/platform/projects-and-routes/sandbox-mode.md), and the Python guide comments "422: invalid parameters, daily limit exceeded" (https://lettermint.co/docs/guides/send-email-with-python.md). Any warm-up or per-hour cap for a new team **[NOT CONFIRMED]**.
- 50 recipients per message, 25 MB per message and per request. https://lettermint.co/docs/platform/emails/limitations.md

**Abuse policing.** AUP thresholds: spam complaints "Must remain below 0.1%"; hard bounces below 10%; exceeding them "may result in temporary suspension or permanent termination". https://lettermint.co/acceptable-use.md. The terms allow suspension "without prior notice or liability" on reasonable suspicion (§7.14). AI output alone cannot cause a permanent suspension, but temporary automated measures are allowed (DPA §13.5). Lettermint warns of bot sign-ups using real addresses, which create complaints. https://lettermint.co/knowledge-base/deliverability/stop-bot-signups-prevent-spam-complaints.md

**Feedback loops.** Spam complaints arrive as ARF reports and are forwarded or synthesised ("Lettermint creates an ARF from the complaint evidence"). https://lettermint.co/docs/platform/projects-and-routes/bounce-and-complaint-forwarding.md. Which mailbox-provider FBLs they are enrolled in **[NOT CONFIRMED]**.

**DNS records and alignment.**
- DKIM: two CNAMEs, `lm1._domainkey` and `lm2._domainkey`, with automatic rotation every six months. https://lettermint.co/docs/platform/domains/introduction.md, https://lettermint.co/pricing.md
- Return-Path: CNAME `lm-bounces.<domain>` → `bounces.lmta.net`; SPF lives there, so no change to our root SPF. https://lettermint.co/docs/platform/domains/spf.md
- DMARC: required before sending; Lettermint blocks first verification if `aspf=s`. Fivvi's record today is `v=DMARC1; p=none; rua=…` with no `aspf`, so relaxed alignment applies and SPF aligns (DNS lookup of `_dmarc.fivvi.app`). DKIM signs with our domain (CNAME under our domain), so DKIM aligns too.

## 4. Quota behaviour (critical)

- **Free:** "Free plans have a fixed limit of 300 emails per month with no overage option." https://lettermint.co/docs/platform/teams/spend-limits.md. At 300 sends stop until the period renews. Over SMTP the reply is `550 5.7.0` "Your team reached its monthly email limit"; resend only after an upgrade or renewal. https://lettermint.co/docs/guides/send-email-with-smtp/response-codes.md. The HTTP status and error code from the REST API at the cap are not in the OpenAPI spec **[NOT CONFIRMED]**.
- **Paid, default:** overage is billed, not blocked: "Overages will be calculated and billed to the User's account automatically". https://lettermint.co/terms-of-service.md §12.3. Rates: Starter €1.50 per 1,000. https://lettermint.co/pricing.md
- **Paid, if we cap it:** "Disable overages" or a custom € limit rejects every email over the plan's included volume. Emails within the included volume keep sending. https://lettermint.co/docs/platform/teams/spend-limits.md. Lettermint is not liable for "failed email deliveries" caused by such a suspension. Terms §12.4.
- **Daily caps:** none on any plan per the pricing table (but see the warm-up gap in §3).
- **Alerts:** owners get an email when the included volume is nearly used ("We send multiple warnings", https://lettermint.co/pricing.md), and at 80% and 100% of a custom overage budget (spend-limits doc). The thresholds cannot be set by us **[NOT CONFIRMED]**. Usage can be read through the Team API (`read:team` covers "settings, and usage"). https://lettermint.co/docs/platform/teams/api-tokens.md
- **Counting:** one unit per accepted recipient; suppressed and test recipients use none; scheduled emails reserve capacity. Spend-limits doc.
- **For Fivvi:** Free (300) is unsafe for anything past an internal alpha: one busy week of sign-ins would block sign-in emails. On Starter, keep the default (bill overage) or set a generous custom cap, never "Disable overages". Watch usage with the Team API and alert on our side.

## 5. Security

- **Certification:** ISO/IEC 27001:2022, certificate 123382, issued 21 August 2026, valid until 20 August 2029, by Prescient Security LLC (Nashville, USA; IAS-accredited). Scope: the ISMS for the email platform (transactional, broadcast, inbound) and supporting infrastructure in EEA cloud environments. Read on https://trust.lettermint.co/resources. Announced at https://lettermint.co/blog/lettermint-iso-27001-certified.md
- **SOC 2:** not claimed anywhere **[NOT CONFIRMED / none]**.
- **Pentests:** no pentest report or summary in the Trust Center; it lists a "System security testing" control and policies behind "Request access". The DPA promises "security testing" (§6.2(e)). Aikido scans infrastructure and code. Third-party pentest **[NOT CONFIRMED]**.
- **Dashboard login:** MFA, passkeys and social login on all plans; team-wide MFA enforcement; SSO (SAML/OIDC) with SCIM on paid plans. https://lettermint.co/pricing.md, https://lettermint.co/docs/platform/teams/security.md
- **API tokens:** Project tokens (`lm_…`) can only send, for one project, by API or SMTP. Team tokens (`lm_team_…`) have abilities such as `read:messages`, `write:suppressions`. Several tokens per project, so one per environment. https://lettermint.co/docs/platform/projects-and-routes/api-tokens.md, https://lettermint.co/docs/platform/teams/api-tokens.md
- **IP allowlists** per token on all plans; other IPs get `401`. https://lettermint.co/changelog/restrict-your-api-tokens-to-specific-ip-addresses.md. Only useful if our Railway egress IP is static **[NOT CONFIRMED for our Railway plan]**.
- **Webhook signing:** HMAC-SHA256 in `X-Lettermint-Signature` (`t=…,v1=…`, Stripe-style, replay protection), plus optional Basic Auth. https://lettermint.co/docs/platform/webhooks/signing.md
- **Encryption:** TLS 1.2+ in transit where supported; encrypted at rest; daily encrypted backups. DPA §6.2(c),(f). Enforced TLS per route or per email is available. https://lettermint.co/docs/platform/emails/tls.md
- **Who can see content:** staff access "limited to delivery, support, security and abuse prevention, and logged"; staff hold a VOG. https://lettermint.co/confidentiality.md. Of the sub-processors, UpCloud, OVH and Postmastery "Handle your emails"; Mistral (support and abuse AI) and Aikido do not. https://lettermint.co/subprocessors.md
- **Retention controls:** fixed. Message content, recipients, metadata and events: 28 days. Analytics events: 90 days (from 8 November 2026). "You cannot configure these retention periods." https://lettermint.co/docs/platform/emails/data-retention.md. Custom retention is on the roadmap, "In progress". https://lettermint.co/roadmap/custom-data-retention.md. The same doc mentions "Content redaction … If your team has access to this setting"; which plans have it **[NOT CONFIRMED]**. "Hide email content" per project or route only hides the preview in the dashboard. https://lettermint.co/changelog/hide-email-content-in-your-dashboard.md
- **Effect on sign-in:** the magic link (15-minute, single use) sits in stored content for 28 days. It is dead long before then, so the exposure window equals our token lifetime. Still: turn on "Hide email content" for the sign-in route.

## 6. Legal detail

Terms: https://lettermint.co/terms-of-service.md (last updated 2026-04-08). DPA: https://lettermint.co/dpa.md (last updated 2026-10-09).

- **Liability cap:** liability is first excluded "to the extent permitted by mandatory law"; otherwise direct damage is capped at the insurance payout, or else the fees paid in the prior year (§18.1–18.2). Indirect damage excluded, including "loss of information (including Data)" (§18.5). Lettermint must first get a written notice of default with a cure period (§18.8). For us: at most about €120/year at Starter.
- **Governing law and disputes:** Dutch law; first ICT-mediation (SGOA), then the District Court of Overijssel, Zwolle for EU customers (§20–21). DPA also Dutch law (DPA §17).
- **Sub-processor changes:** 30 days' notice by email or in-product; objection on reasonable grounds; if unresolved, either side may terminate the affected service (DPA §7.2–7.4).
- **Breach notification:** "within twenty-four (24) hours after becoming aware" (DPA §10.1).
- **Audit rights:** yes, including on-site where reasonably necessary; 30 days' notice; normally once per 12 months; each side bears its own costs (DPA §12.3–12.8). Ordinary requests can be met with Trust Center material (§12.2).
- **Deletion at end:** return or delete; 30-day retrieval window; backups overwritten within 14 days; written confirmation on request (DPA §11).
- **Price changes:** at least one month's notice; if the increase exceeds 10%, we may cancel within 30 days (§12.8). Terms changes: 30 days' notice, right to terminate (§2.5).
- **AI:** the DPA allows AI-assisted support and abuse handling, with no training on our data (DPA §13; Mistral listed). The confidentiality page says "No AI training, no third-party AI services." https://lettermint.co/confidentiality.md. The second half contradicts the DPA and sub-processor list; the DPA prevails (DPA §2.4).
- **Transactional mail rules:** consent or another legal basis (§7.4.1); accurate sender; unsubscribe and postal address are required for marketing (§7.4.3, §7.4.5). The AUP is stricter in wording: "Include your valid physical postal address in every email." https://lettermint.co/acceptable-use.md. Whether that applies to sign-in mail **[NOT CONFIRMED]**; adding the address to the footer is cheap. No "on behalf of third parties without proper consents" and no reselling without consent (§7.9.5–7.9.6); sending Fivvi's own booking mail for gyms is normal use, but sending from gyms' own domains later should be checked.
- **Signature:** none needed. The DPA "is deemed to have been accepted" with the terms (§15.3) and "is countersigned on request". https://lettermint.co/pricing.md
- **Processor chain (gyms → Fivvi → Lettermint):** covered. "Where Controller itself acts as a processor … Lettermint acts as a subprocessor." DPA §1.9. Locations: Email Data stays in the EU (§8.1); other data in the EU/EEA (§8.2). Our gym DPA must list Lettermint as a sub-processor with 30 days' notice, which matches Lettermint's own notice period, so we can pass changes on only if we act immediately.

## 7. Technical fit

**Send API** (https://lettermint.co/docs/api-reference/sending/0.0.1/lettermint-sending-openapi.json, spec version 0.0.1)
- `POST https://api.lettermint.co/v1/send` and `/v1/send/batch` (up to 500 emails). Fields: `from`, `to`, `cc`, `bcc`, `reply_to` (array), `subject` (≤ 998 chars), `html`, `text`, `attachments` (`filename`, `content`, `content_type`, `content_id`), `headers`, `metadata` ("not added as email headers"), `tag`, `tags` (≤ 20), `route`, `scheduled_at`, `settings` (`track_opens`, `track_clicks`, `tls`), `sandbox_result`. Response `202` with `message_id` and `status: "pending"`.
- **Custom headers:** allowed. A `List-Unsubscribe` we send is accepted and normalised (angle brackets added); the API rejects one with no usable URL. https://lettermint.co/docs/platform/emails/limitations.md. So we must simply never send it. Lettermint adds it only on broadcast routes (providers note §2.8).
- **Errors:** `401` token, `403` `FEATURE_NOT_AVAILABLE` or permission, `409` idempotency conflict, `422` validation, `429` `RATE_LIMITED` with `Retry-After`, `500` `INTERNAL_ERROR`. Retry `429`, `5xx` and timeouts with the same key; never `401`, `403`, `422`.
- **Idempotency:** keys are per project, 24 hours. After a `5xx` "whose outcome is unknown", the same key returns `409 Conflict` until it expires. https://lettermint.co/docs/platform/emails/idempotency.md. So a `409` after a `5xx` means "maybe sent"; for sign-in, the user requesting a new code gets a new key anyway.
- **Rate limits:** send endpoints are "not throttled by a fixed per-minute API rate limit". https://lettermint.co/docs/guides/send-email-with-smtp.md. Team API: 300 reads and 60 writes per minute. https://lettermint.co/docs/platform/teams/team-api/reference.md

**Webhooks** (https://lettermint.co/docs/platform/webhooks/events.md, https://lettermint.co/docs/platform/webhooks/introduction.md)
- Events: `message.created`, `.sent`, `.delivered`, `.auto_replied`, `.hard_bounced`, `.soft_bounced`, `.spam_complaint`, `.failed`, `.suppressed`, `.policy_rejected`, `.unsubscribed`, `.opened`, `.clicked`, `suppression.added`, `suppression.removed`, inbound events, `webhook.test`.
- Envelope: `id` (for dedup), `event`, `timestamp`, `sandbox`, `context` (team/project/route IDs), `data` with `message_id`, `subject`, `recipient`, `metadata`, `headers`, `tag(s)`. Payloads carry the subject and the recipient address.
- Scope: team, project(s) or route(s). Retries: 12 attempts over about 14 hours; 30-second timeout; disabled after 72 hours of failures, and events during that time are lost.

**Suppressions: default scopes** (the open gap from the providers note §2.8). https://lettermint.co/docs/platform/emails/suppressions.md

| Trigger | Scope | Blocks |
|---|---|---|
| Hard bounce (invalid address, inactive mailbox, invalid domain, hard quota) | **Team** | All mail, every project and route |
| Spam complaint | **Source route** | On a transactional route: all mail on that route |
| Unsubscribe (hosted page "or a delivery event") | **Source route** | On a transactional route: all mail on that route |

- "Suppression records do not expire." Soft bounces never suppress.
- Spam complaint records use "a protected removal flow": removal returns `202`, and "The record stays active until support approves the request."
- **For Fivvi:** a user who marks one booking email as spam would lose sign-in emails, if both share a route, until Lettermint support approves. Fix: separate transactional routes, one for sign-in, one for bookings and other mail. A complaint then only blocks the booking route. Hard bounces stay team-wide, which is correct. What "a delivery event classified as an unsubscribe" means on a transactional route without `List-Unsubscribe` **[NOT CONFIRMED]**.

**Test and environments**
- Sandbox mode per project: full processing, signed webhooks, no delivery; simulate results with `sandbox_result`; no quota use; 100 recipients per team per minute. Starter and up only; not on Free. https://lettermint.co/docs/platform/projects-and-routes/sandbox-mode.md
- Test addresses on `lettermint.dev` (local parts `ok`, `softbounce`, `hardbounce`, `spamcomplaint`) work on every plan and before verification. https://lettermint.co/docs/platform/emails/sending-test-emails.md
- Projects: Free 1, paid unlimited, so dev/preview/prod separation needs Starter. https://lettermint.co/pricing.md
- SMTP relay `smtp.lettermint.co` on all plans. https://lettermint.co/docs/guides/send-email-with-smtp.md

**Node SDK `lettermint`** (https://registry.npmjs.org/lettermint, https://github.com/lettermint/lettermint-node, checked 2 November 2026)
- Latest 3.3.0 (30 October 2026); 22 versions since 24 May 2025; majors 2.0.0 (May 2026) and 3.0.0 (October 2026), so expect breaking changes about twice a year.
- Zero runtime dependencies; TypeScript types (`dist/index.d.ts`); Node ≥ 20; MIT in `package.json` (the repo has no LICENSE file).
- Downloads: 28,060 last week, 87,666 last month. https://api.npmjs.org/downloads/point/last-week/lettermint
- GitHub: 12 stars, 0 forks, 0 open issues, 1 issue ever; last commit 30 October 2026. One human contributor.
- The SDK "never retries on its own"; it supports `idempotencyKey` and typed errors (`RateLimitError`, `TimeoutError`). https://lettermint.co/docs/guides/send-email-with-nodejs.md. We could skip the SDK: our transport is one `fetch` call.

## 8. Support

- Channels on every plan: ticket (in the dashboard), email (the help address on the contact page), social media, Discord. "Direct line to our team" and SLA: Enterprise only. https://lettermint.co/pricing.md, https://lettermint.co/contact
- The Dutch pricing page says "Basis ondersteuning" for Starter and Growth and "Voorrang bij ondersteuning" (priority) for Pro. https://lettermint.co/nl. The English table shows no such difference.
- Response times: not published for any plan **[NOT CONFIRMED]**. Hours: "European business hours". https://lettermint.co/european-email.md
- Language: the site has a full Dutch version, and the founders are Dutch; Dutch-language support is likely but not stated **[NOT CONFIRMED]**.
- Docs quality: good. Machine-readable docs, an OpenAPI spec, SMTP reply tables, a production checklist, honest limits. Minor slips: example webhook payloads show a hard bounce with a `250 OK` response. https://lettermint.co/docs/platform/webhooks/events.md

## 9. Risks and red flags

See the next section.

---

## Verdict for Fivvi

This section is analysis, not source notes. Some facts in it were checked directly on 2 November 2026:
- **npm registry:** `lettermint` 3.3.0, 28,060 downloads in the week of 23–29 October.
- **RIPE:** both sending /24s are registered to `ORG-LB245-RIPE` (netname `LETTERMINT`, NL), as `ASSIGNED PA` and `SUB-ALLOCATED PA`. The API host `api.lettermint.co` sits on UpCloud (AS202053) in Amsterdam.
- **Blocklists:** none of the 508 IPv4 addresses in those two /24s is listed on Spamhaus ZEN. The lookups were checked against Spamhaus's test entry first.

**Lettermint is a good choice, with five conditions.** Lettermint, Scaleway TEM, Amazon SES, Bird and (with gaps) Mailgun meet all four hard requirements as published. Lettermint is the one that also is an EU company with EU-only sub-processors, documents that transactional mail gets no `List-Unsubscribe`, and honours an idempotency key. The four:
- tracking off
- EU-only processing, backed by RIPE and DNS data
- a DPA that names the processor chain we are in
- no List-Unsubscribe on transactional mail

It also has the idempotency our `sendEmail` already relies on. The risks found are real but manageable, and most of them apply to Brevo too, which has no SLA below its top plans either.

1. **Two transactional routes:** one for sign-in, one for bookings and other mail. A spam complaint blocks only its own route, and only Lettermint support can lift it. With one route, a "spam" click on a booking email would stop sign-in codes. Hard bounces stay team-wide, which is right.
2. **Starter (€10/month) by pilot setup, with overage billing left on.** (This note first said "from the switch". After the trial the owner chose Free for the internal alpha: outside production `@example.com` mail is only logged, so few real emails go out. ADR-028 records that.) Free stops hard at 300 a month, and so does a paid plan with "Disable overages". Add our own usage alert through the Team API (R14). A paid plan needs the owner's approval. It replaces the Brevo paid plan already planned for go-live.
3. **A transport that maps Lettermint's answers:**
   - `429` and `5xx` are retryable, using `Retry-After`.
   - A `409` after a `5xx` means "maybe sent" (our `duplicate` flag); a `409` with a different body is a bug.
   - `401`, `403` and `422` are final.

   This is a plain `fetch` transport like `brevo.ts`, plus a fake server for e2e like `BREVO_API_URL`. No SDK is needed, so no new dependency.
4. **Content retention and R18.** Lettermint keeps content, recipients and events for 28 days, which is within R18's 30-day maximum. But analytics events are kept 90 days, over the maximum, and R18 now says the provider keeps no email content; so R18 needs a new Lettermint exception for both. Lettermint, unlike Brevo with previews off, does store the email content. So turn on "Hide email content" for the sign-in route if our plan has it. The plan is **[NOT CONFIRMED]**: ask in the trial. Either way the stored sign-in link expires after 15 minutes. `retention-policy.md` R18 and `sub-processors.md` §4 change, which makes that PR owner-only.
5. **A written fallback.** The company is two founders and 17 months old. It may end the service on 30 days' notice, and its terms treat losing "crucial" staff as force majeure. Keep Scaleway TEM as the documented fallback, and keep the transport swap small enough to do within that notice.

**Also needed, already planned:** Turnstile on the sign-up and sign-in forms (E013). The AUP allows suspension without notice above 0.1% complaints, so bot sign-ups with real addresses are a bigger risk here than on Brevo.

**What would change the verdict:** a trial send that shows rewritten links or a `List-Unsubscribe` header on the transactional route. Also a "delivery event classified as unsubscribe" turning out to suppress transactional mail without any header.

---

## Red flags and open questions

**Red flags**
1. **Tiny team, written bus-factor clause.** Two founders, no investors, one person behind the code we would call. The terms list absence of "crucial" staff as force majeure, allowing immediate cancellation (§17.2, §17.4). Mitigated by the `sendEmail` seam and a ready fallback.
2. **Spam complaints block a whole transactional route, and only Lettermint support can lift them.** Must split sign-in from other mail on separate routes before go-live.
3. **Strict AUP: under 0.1% complaints.** At pilot volume (1,000–3,000/month) that is 1–3 complaints a month. Bot sign-ups with real addresses could trip it, and the terms allow suspension without notice (§7.14). We need bot protection on sign-up and sign-in forms.
4. **Free plan hard stop at 300.** Sign-in emails are rejected after 300 a month. Paid plans with "Disable overages" or a low cap do the same. Default overage billing is the safe setting.
5. **Five short platform incidents in ten weeks** (Aug–Oct 2026), including a RabbitMQ intake stop; 99.97% API uptime over the window. No SLA below Enterprise. Our sender must retry `5xx` and timeouts with the same idempotency key.
6. **Liability cap ≈ fees paid in the prior year,** loss of data excluded, availability excluded.
7. **All mail leaves from two leased /24s (PA space from UK LIRs).** A block or a lost lease affects everyone at once; reputation is shared with other small senders on the transactional pool.
8. **Retention cannot be shortened yet** (28 days content; custom retention "In progress").
9. **Marketing copy contradicts the DPA** on third-party AI ("no third-party AI services" vs Mistral in DPA §13). Minor, but worth knowing before quoting their pages to gyms.
10. **Fast-moving SDK:** two major versions in 2026.

**Not red flags (checked):** idempotency exists and is well specified; webhooks are signed; EU-only processing is backed by DNS/RIPE data (UpCloud NL, own AS); ISO 27001 with a 2029 expiry; the DPA covers our processor chain; 30-day notices on sub-processors, terms and prices.

**Open questions [NOT CONFIRMED]**
- HTTP status and error code from `POST /v1/send` when the monthly quota or spend limit is hit.
- Any warm-up, per-hour or daily cap on a newly verified team ("Live sending limits", "daily limit exceeded").
- The delivery retry window for deferred mail before `message.failed`.
- Which plans get "content redaction"; when custom retention ships.
- What "a delivery event … classified as an unsubscribe" is on a transactional route.
- What Postmastery can see of message content.
- Pentest: date, firm, summary.
- Support response times; Dutch-language support.
- Team size and KvK extract details.
- Whether the AUP's "physical postal address in every email" applies to transactional mail.

---

## What to verify with a trial account

Free plan first (no card); Starter only if the owner approves the €10/month.

1. **Verification:** note the questions asked and how long approval takes. Until then, send only to team members and the `lettermint.dev` test addresses.
2. **DNS:** add `lm1._domainkey`, `lm2._domainkey` and `lm-bounces` CNAMEs for the sending domain; check Lettermint accepts our DMARC (`p=none`, relaxed) without warnings.
3. **Raw headers of a sign-in email** to Gmail, Outlook.com and iCloud: no `List-Unsubscribe` or `List-Unsubscribe-Post`; DKIM `d=` our domain and passing; Return-Path `lm-bounces.<our domain>`; SPF and DMARC pass; list every `X-` or `Feedback-ID` header Lettermint adds.
4. **No unsubscribe UI:** Gmail and Outlook show no "Unsubscribe" link next to the sender.
5. **No link rewriting or pixel:** the magic link `href` is byte-identical to what we sent; no `t.ltrmnt.com`; no 1×1 image. Repeat on Starter with the route defaults and with `settings: { track_opens: false, track_clicks: false }`.
6. **Routes and suppression scope:** create two transactional routes (sign-in, bookings). Send to the `spamcomplaint` test address on the bookings route and to the `hardbounce` test address; then `GET /v1/suppressions` and record `scope`, `route_id` and `applies_to`. Check whether test addresses create real suppressions. Confirm the sign-in route still sends to an address with a bookings-route complaint.
7. **Complaint removal:** `DELETE` the complaint suppression; expect `202` and a support ticket; time the approval.
8. **Quota response:** ask support for the exact HTTP status and error code at the monthly cap, and test it if it can be done safely.
9. **Spend limit default on Starter:** confirm it is "Unlimited" by default; see which owner emails arrive and when; read usage through the Team API.
10. **Idempotency:** same key and body twice → same `message_id`, one delivery; same key, other body → `409`; check the `409` after a simulated `5xx` is handled as "maybe sent".
11. **Webhooks:** verify `X-Lettermint-Signature` in our handler; receive `message.delivered`, `.hard_bounced`, `.spam_complaint`, `.suppressed` and `suppression.added`; check payloads hold no more personal data than expected.
12. **Sending to a suppressed address:** does the API still return `202`, followed by `message.suppressed`?
13. **Sandbox (Starter):** a sandbox project for CI and Railway previews; check the 100 recipients/minute limit is enough.
14. **Dashboard:** turn on "Hide email content" for the sign-in route; check whether "content redaction" appears; enforce MFA for the team.
15. **Token IP allowlist:** check whether Railway gives our service a stable egress IP; if so, pin the production token.
16. **Ask support (one ticket):** warm-up or per-hour limits for new teams; deferral retry window; Dutch-language support and response times; whether the AUP postal-address rule applies to transactional mail; Postmastery's access to message content; pentest summary; when custom retention ships.

---

## Trial results (2 November 2026)

Free plan, team "Fivvi", project "Fivvi trial", sender domain `fivvi.app`. Sent only to the team mailbox and the `lettermint.dev` test addresses. All content synthetic.

- **Setup (checks 1, 2, 14):**
  - Lettermint asked for three CNAMEs: `lm-bounces` → `bounces.lmta.net`, and `lm1._domainkey` / `lm2._domainkey` → `lm1`/`lm2.<id>.dkim.lmta.net`. They are in Cloudflare as DNS only. Our existing DMARC record verified as it is.
  - DKIM keys are managed and rotate every 6 months.
  - The verification form asks for business name, address, type of mail, website, estimated volume and how recipients opt in or out. Submitted on 2 November 2026; approval still pending.
  - Two transactional routes, Sign-in and Bookings. Slugs are generated from the name and can't be changed afterwards.
  - Open and click tracking are off by default on both routes.
  - "Hide email content" is available per route on Free and is on for Sign-in.
- **Idempotency (check 10):**
  - The same key and body twice returned `202` with the same `message_id`, and only one email went out.
  - The same key with a different body returned `409`: "This idempotency key has already been used on a request with a different payload".
- **Validation:** `text` must be at least 3 characters (`422` otherwise). Our emails always have a longer text part.
- **Test addresses and suppressions (checks 6, 12):**
  - The `spamcomplaint` and `hardbounce` test addresses on `lettermint.dev` produce the "Spam complaint" and "Hard bounce" statuses, but **create no suppression records**. `GET /v1/suppressions` stayed empty.
  - A second send to the complaint address was processed again on both routes.
  - So suppression scope can't be tested with test addresses. The documented scopes (§7) stand until a real complaint or a manual suppression shows otherwise.
- **Link rewriting (check 5):** the sign-in link arrived in the inbox byte for byte as sent, with no redirect domain: `https://fivvi.app/login/confirm?token=…&returnTo=%2Fbookings`.
- **Inbox placement:** delivered to the Inbox in Zoho Mail, not Spam. Zoho shows "Verified domain. Sender couldn't be verified". Zoho shows this for mail that claims our own hosted domain but comes from outside Zoho.
- **Authentication (check 3)** in Zoho's `Authentication-Results`: `dkim=pass`; `spf=pass`, because `lm-bounces.fivvi.app` designates `155.254.62.128` (`smtp-out-b-128.nl-ams.lmta.net`); `dmarc=pass` (p=none) with `header.from=fivvi.app`.
  - The Return-Path is `feedback-<message id>@lm-bounces.fivvi.app`.
  - The Message-ID is `<message id>@lmta.net`.
- **Raw headers (checks 3, 4, 5)** of the sign-in email, from Zoho's "Show original":
  - **No `List-Unsubscribe` and no `List-Unsubscribe-Post`.** This is Brevo's second problem, and it's gone on the transactional route.
  - Two DKIM signatures: `d=fivvi.app; s=lm1`, which aligns with From and is the one DMARC uses, and `d=bounces.lmta.net; s=lm1` for Lettermint's feedback loop.
  - Feedback headers: `CFBL-Address` (RFC 9477, an ARF report address on `bounces.lmta.net`), `Feedback-ID: <ids>:lettermint` (Gmail's feedback loop), and `X-Complaints-To` (Lettermint's abuse address).
  - `X-Lettermint-Pool: transactional-0` confirms the transactional IP pool.
  - `X-LM-Trace` is base64 JSON with the message id, the **recipient address** and the team id (`team_…`). Only the recipient sees it, and it holds their own address, so it isn't a leak, but it is there.
  - No open-tracking image in the HTML part. The link is unchanged in both the HTML and text parts.
  - No `Auto-Submitted` or `Precedence` header, because "Suppress auto-responders" was off. Turn it on for both routes in production, so out-of-office replies don't come back to `noreply@`.

- **Approval:** verification submitted at about 15:02 and approved at 15:24 on 2 November 2026 (ticket T-4DF7E4AB). Lettermint warned that mail from a domain less than 30 days old may land in junk at first.
- **Gmail (check 4)**, sent after approval to the owner's Gmail, read through the Gmail API:
  - Placed in the **Inbox** (labels `INBOX`, `IMPORTANT`, `CATEGORY_UPDATES`), not Spam.
  - `Authentication-Results: mx.google.com`: dkim=pass for `@fivvi.app` and for `@bounces.lmta.net`; spf=pass for `lm-bounces.fivvi.app` (`155.254.62.129`); dmarc=pass with `header.from=fivvi.app`.
  - **No `List-Unsubscribe` or `List-Unsubscribe-Post` header**, so Gmail has nothing to build an Unsubscribe button from.
  - The link is unchanged, and the HTML has no image.
  - The header set matches the Zoho copy.

**Trial verdict:** both of Brevo's problems are solved on the Free plan. Links aren't rewritten and there's no pixel, and no `List-Unsubscribe` is added to transactional mail. Authentication passes and the mail lands in the inbox. Still open:
- Outlook.com and iCloud placement (optional)
- a support question on suppression scope, because test addresses don't create suppressions
- the Starter behaviour with overage billing
