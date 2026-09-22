# ADR-009: Transactional email

| | |
|---|---|
| **Status** | Accepted (2026-09-22); Brevo selected (2026-09-22) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §3, §51, §74; ROADMAP.md M1, M5, §12, §13 (R1, R14); ADR-007, ADR-008, ADR-010; E006, F049, F050 |

## Context

Email carries critical flows: sign-in (magic link + code), booking verification, confirmations, cancellations, schedule changes, trainer notifications and invitations (§51). Every email exists in nl-NL and en (§74), and the spec prefers one template structure with localized content over duplicated templates. If magic links land in spam, booking fails (R1). The project runs on free tiers until pilot go-live (`ROADMAP.md §12`).

## Decision

- Templates are written with **React Email**, one template per email type, with all text from the shared i18n catalogs (ADR-008). No per-language copies of a template.
- Sending goes through **Brevo** (EU-based); the owner has created an account. E006 checks its free-tier limits, DPA, EU data handling and delivery before real emails are sent.
- Emails are sent **inline** with retry (ADR-010), behind a small `sendEmail` interface so the provider can be swapped.
- Before M5, a **custom domain** is bought and authenticated with SPF, DKIM and DMARC.

## Consequences

- **Positive:** one template structure, localized strings, testable rendering in both locales (`TESTING.md §2`).
- **Positive:** the provider is replaceable behind one interface.
- **Negative:** free tiers have daily/monthly caps and usually one domain (R14): a cap hit would block magic links. Usage alerts, and an upgrade ready before G4.
- **Negative:** until the domain exists, only test sending is possible.
- **Follow-ups:** E006 in M1 (configure Brevo and test delivery to inbox, not spam); deliverability tests against Gmail, Outlook/Hotmail and a Dutch ISP in M5. Brevo is recorded in the sub-processor list (`ROADMAP.md §4.4`).

## Alternatives considered

| Option | Why not |
|---|---|
| Amazon SES | Cheapest at scale but no meaningful free tier outside AWS, more setup (sandbox, reputation) |
| Postmark / SendGrid | Good deliverability, but small or no free tiers |
| MJML / hand-written HTML | React Email fits the TS/React stack and renders testably |
| Templates per language | Duplicated structure and logic, which §74 explicitly advises against |

## References

- `PRODUCT.md §51` Notifications, `§74` Email localization
