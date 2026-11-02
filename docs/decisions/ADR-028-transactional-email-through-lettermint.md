# ADR-028: Transactional email through Lettermint

| | |
|---|---|
| **Status** | Accepted (2026-11-02) |
| **Date** | 2026-11-02 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | Amends ADR-009 (the provider only); `ROADMAP.md` M4 exit criteria, §12, §13 (R1, R14); `docs/legal/sub-processors.md` §4, `retention-policy.md` R18; ADR-007, ADR-010, ADR-011; E006, #160 |

## Context

ADR-009 chose Brevo for transactional email: sign-in codes and links (ADR-007), and booking emails. Two Brevo behaviours break R1 and the M4 exit criterion "Email is ready for real names".

1. **Click tracking rewrites every link** through Brevo's redirect domain, so the one-time sign-in token passes through Brevo's click data. Brevo support said on 1 November 2026 that fully switching tracking off is only possible on **Professional (€499/month) and Enterprise**. Free, Starter and Standard can only anonymise it, which still rewrites links.
2. **Brevo adds `List-Unsubscribe` to all email**, transactional included. A recipient who taps the mail client's "Unsubscribe" button is blocked for every email from that sender, sign-in codes included. Replacing the header with `List-Help` is Enterprise-only.

On 30 October 2026 the owner had accepted the header risk (R1, a comment on #160), before it was known that a header unsubscribe blocks sign-in codes. This ADR replaces that acceptance.

So Brevo Professional fixes only the first problem, at about 50 times what we would otherwise pay at go-live, and only Enterprise fixes both.

We compared 16 providers against four hard requirements:
- tracking fully off on a plan we would use
- email processed and stored in the EU
- a DPA in the terms
- no `List-Unsubscribe` on transactional email

The results are in [`research/ADR-028-email-providers.md`](research/ADR-028-email-providers.md). Lettermint, Scaleway TEM, Amazon SES and Bird meet all four as published, and Mailgun EU does with gaps. **Lettermint** (Lettermint B.V., Zwolle) is chosen because it is also:
- an EU company with EU-only sub-processors
- documented to add no `List-Unsubscribe` to transactional mail
- honouring the idempotency key our `sendEmail` already sends

Of the other four, only Bird has an idempotency key, and it has US and UK sub-processors. The deeper check and a live trial on 2 November 2026 are in [`research/ADR-028-lettermint.md`](research/ADR-028-lettermint.md). The trial showed:
- the sign-in link arrives byte for byte, with no pixel
- no `List-Unsubscribe` header
- DKIM, SPF and DMARC pass for `fivvi.app` at Zoho and Gmail
- the email lands in the Gmail inbox
- the same idempotency key with the same body returns the same message and sends once; with a different body it returns `409`

## Decision

- **Transactional email goes through Lettermint** instead of Brevo. The rest of ADR-009 stays: React Email templates from the i18n catalogs, one `sendEmail` interface, inline retry with the same idempotency key on every attempt (ADR-010), and SPF, DKIM and DMARC on `fivvi.app`.
- **Two transactional routes per project:** one for sign-in emails, one for all other email. A spam complaint or unsubscribe suppresses an address only on the route it came from, and only Lettermint support can lift a complaint. So a complaint about a booking email must never stop sign-in codes. Hard bounces stay team-wide, which is right.
- **Route settings:**
  - Open and click tracking stay off; that is the default.
  - "Suppress auto-responders" is on.
  - "Hide email content" is on for the sign-in route.
- **Environments:**
  - **On Free (one project allowed):** one project, `Fivvi`, with the two routes, and a separate send-only token per environment: one for `production`, one for `development`, which previews inherit. Both share the routes and the 300-email quota.
  - **On Starter:** a project per environment, plus a sandbox project for CI. Previews keep inheriting the `development` values (ENVIRONMENTS.md); whether they move to the sandbox is the migration spec's call.
  - Tokens are set by the owner in Railway (`preserve()`); the production token is never used outside production.
  - Outside production, `@example.com` mail stays in the server log (unchanged), so development uses the quota only for real addresses.
- **The transport is plain `fetch`** against `POST https://api.lettermint.co/v1/send` with the `Idempotency-Key` header, like the Brevo transport: no SDK, so no new dependency.
  - `429` and `5xx` are retried, honouring `Retry-After`.
  - A `409` on a retry after a `5xx` or timeout means "maybe sent" (`duplicate`). A `409` on a first attempt is a bug.
  - `401`, `403` and `422` are final.
- **Plan: Free, then Starter.**
  - Free (300 emails a month for the whole team, hard stop) is enough for the internal alpha on synthetic data.
  - Move to **Starter (€10/month, 10,000 included)** at pilot setup at the latest, or as soon as usage passes about 200 in a month. This replaces the Brevo paid plan the M9 checklist already planned.
  - On Starter, overage stays billed. **Never "Disable overages" or set a low spend cap**: either one rejects sign-in emails at the limit.
  - Our own usage alert reads the Team API (R14).
- **Brevo is removed after the cutover:**
  - its transport, variables and fake server
  - its DNS records (`brevo1/2._domainkey`, the `brevo-code` TXT)
  - its row in the sub-processor list
  - then the account itself
- **Fallback: Scaleway Transactional Email** (France, EU-only, transactional-only). Lettermint may end the service on 30 days' notice. The `sendEmail` seam keeps a provider swap small enough to finish within that notice.

## Consequences

- **Positive:** sign-in links reach the user unchanged, and no mail client offers an unsubscribe that blocks sign-in (R1). The M4 tracking criterion can be met without Brevo Professional.
- **Positive:** EU-only processing by a Dutch company; the DPA applies automatically and covers us as a processor for gyms. Lettermint has ISO 27001 until 2029. Content, recipients and delivery events are kept 28 days, within R18's 30-day maximum.
- **Positive:** the cost is about the same as the Brevo plan we would have needed anyway: €0 now, €10/month at pilot volume, about €40/month at 50,000 emails.
- **Negative:** Free allows only 300 emails a month, against Brevo Free's 300 a day. Watch the usage until Starter.
- **Negative:** a young, two-person company with no SLA below Enterprise. There were five short incidents from August to October 2026, and all customers send from two leased /24s. The fallback and the seam are the answer; switching again costs a transport and DNS.
- **Negative:** Lettermint stores email content for 28 days and we can't shorten it, where Brevo kept none. Analytics events are kept for 90 days, over R18's maximum. So R18 needs a new Lettermint exception for both, in place of the Brevo one. "Hide email content" covers the dashboard only. The sign-in token in stored content has expired after 15 minutes anyway.
- **Negative:** the acceptable-use policy allows suspension above 0.1% spam complaints. That makes bot protection on sign-up and sign-in (Turnstile, E013) more important.
- **Follow-ups:**
  - The migration spec (E006): transport, Railway variables, routes, fake server, usage alert, Brevo removal.
  - A small owner-only PR for `sub-processors.md` §4 and R18.
  - On acceptance, the `ROADMAP.md` lines that name Brevo change with it: the ADR-009 row in §4.3, the M4 exit criterion on tracking, the M9 email-capacity item, the §12 email row and R1's mitigation.
  - One question to Lettermint support about the default scope of automatic suppressions, which test addresses can't show.
  - ADR-009 gets a note that points here.

## Alternatives considered

| Option | Why not (now) |
|---|---|
| Stay on Brevo Free or Starter and accept both risks | The sign-in token stays in Brevo's click data, and one tap on "Unsubscribe" stops sign-in codes until someone lifts the block by hand |
| Brevo Professional (€499/month) | Fixes tracking only; `List-Unsubscribe` stays below Enterprise |
| Brevo Enterprise | Custom price for a problem €10/month solves |
| Scaleway Transactional Email | EU-only and cheapest, but no idempotency key (a retry could send twice), only 5 unblocks a day, and its `List-Unsubscribe` behaviour isn't documented. Kept as the fallback |
| Amazon SES (EU region) | Very cheap and mature, but a US company, no idempotency key, a sandbox review and the most setup |
| Bird (SparkPost EU) | EU region, but US and UK sub-processors, a $15 monthly minimum, and the DPA and Node SDK unconfirmed |
| Mailgun (EU region) | Tracking and unsubscribe handling are off by default, but account data is global, US group companies are sub-processors, and whether it adds `List-Unsubscribe` itself is not documented |
| Postmark, Resend, Mailtrap | Account data or all data in the US |
| Mailjet | Adds `List-Unsubscribe` to all email |
| SendGrid | EU data only from about $90/month |

## References

- [`research/ADR-028-email-providers.md`](research/ADR-028-email-providers.md): 16 providers against the four requirements, with sources.
- [`research/ADR-028-lettermint.md`](research/ADR-028-lettermint.md): company, reliability, deliverability, quota, security, terms, API fit, and the trial results of 2 November 2026.
- Issue #160: the request to Brevo, its answer of 22 October and the owner's risk acceptance of 30 October 2026. Brevo's answer of 1 November 2026 is in the owner's support ticket and summarised in `research/ADR-028-email-providers.md` §2.1.
