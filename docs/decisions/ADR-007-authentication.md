# ADR-007: Authentication

| | |
|---|---|
| **Status** | Accepted (2026-09-22); the use of the organization / member / invitation plugins for workspaces and roles amended by [ADR-022](ADR-022-workspaces-on-our-own-tables.md) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §2.4, §9, §23, §26, §27, §49, §50; ROADMAP.md M2, M5, §13 (R1); ADR-003, ADR-008, ADR-009; F001, F003, F011, F030 |

## Context

The spec rules out passwords, phone numbers and SMS in MVP; clients use an **email magic link** (§27). Trainers and owners also need to sign in, workspaces need members, roles and invitations (§9, §49, §50), and all emails must be localized (§3, ADR-008). The native apps (ADR-003) must sign in too, and deep links (Universal Links / App Links) are only planned for 1.1. Magic links have two known failure modes (R1): they land in spam, and corporate email scanners (e.g. Outlook Safe Links) open them before the user does and consume the one-time token.

## Decision

- **Better Auth**, configured in `packages/auth`, with its **organization / member / invitation** plugins for workspaces and roles (Owner, Admin, Trainer; clients are separate).
- **Sign-in by email only.** Every sign-in email contains **both** a magic link **and** a 6-digit code:
  - Web can use either.
  - Native apps use the **6-digit code**, so they don't depend on Universal/App Links on day one.
  - The link opens a **confirm-click page**; the token is only consumed when the user presses the button, so scanners that pre-fetch links can't burn it.
- Tokens and codes are **hashed, single-use, short-lived and rate-limited**, and sign-in responses don't reveal whether an account exists.
- **Bearer tokens** for the native apps (stored in Keychain / encrypted storage); cookies for web.
- Better Auth stores its data in **our own Postgres tables** (ADR-005), and its emails are **our own localized templates** (ADR-009).
- **Spike in M1:** prove the native bearer-token flow end to end (code sign-in → token → authenticated generated-client call) on iOS and Android.

> **Note (19 October 2026):** the native spike's timing moved from M1 to M8, alongside the iOS and Android apps (`ROADMAP.md` M8), during F001 shaping. This is a scheduling change, not a reversal: the decisions above (Better Auth, email + 6-digit code, bearer tokens for native) stand unchanged.

## Consequences

- **Positive:** no third-party user store: user data stays in our EU database, under our tenant and privacy rules.
- **Positive:** full control over email wording and language, which a hosted provider would limit.
- **Positive:** the 6-digit code covers native sign-in and scanner-consumed links with one mechanism.
- **Negative:** we own the security of the auth flows (rate limits, token hygiene, enumeration). Covered by the token tests in `TESTING.md §3` and the M9 security review.
- **Negative:** Better Auth is a younger library; the native bearer flow is the least proven part, hence the M8 spike (moved from M1, see the dated note above).
- **Follow-ups:** M8 spike (moved from M1); F001 in M2; deep links in 1.1.

## Alternatives considered

| Option | Why not |
|---|---|
| Auth.js (NextAuth) | Web-centric; weaker story for native bearer tokens and organizations |
| Hosted auth (Clerk, Auth0, Supabase Auth) | User data with a third party (often US), limited email localization, cost beyond free tiers, and it would sit outside our RLS model |
| Passwords | Excluded by the spec (§27) |
| Magic link only | Breaks on scanner pre-clicks and needs deep links for native apps |

## References

- `PRODUCT.md §27` Authentication, `§23` Booking flow
- `ROADMAP.md` M2 key notes, R1
