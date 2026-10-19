# ADR-019: Sign-in email language

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-19 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §3, §27; ADR-007, ADR-009, ADR-017; F001, F010 |

## Context

ADR-017 resolves the communication language of an email from the recipient's stored personal preference, then the workspace's default communication language. A sign-in email (F001, ADR-007) has no workspace: an account is shared by every workspace its person belongs to, and the first sign-in of a new account happens before any workspace exists. A new account has no stored preference either. So for a sign-in email, ADR-017's order can end without an answer.

## Decision

Adds one rule to ADR-017's communication-language order, for emails sent outside a workspace (today: the sign-in email):

1. The recipient's stored personal preference.
2. The interface language of the screen where the email was requested.

- The first sign-in that creates an account stores that interface language as the account's personal preference, so later emails and screens follow it until the person changes it (F010).
- Emails sent in a workspace's context keep ADR-017's order unchanged.
- The shared resolver in `packages/i18n` implements this order next to ADR-017's two, with tests named after the same cases.

## Consequences

- **Positive:** a person always gets the sign-in email in the language they were just reading, including at their first sign-in.
- **Positive:** the account's first preference comes from a choice the person saw, not from a workspace setting.
- **Negative:** a sign-in requested from a screen in the "wrong" language (a shared computer) sends the email in that language until the person has a stored preference.
- **Follow-ups:** F010 adds the in-app switch that changes the stored preference.

## Alternatives considered

| Option | Why not (now) |
|---|---|
| Always Dutch (the product's default market) | Contradicts ADR-017: English is the fallback for interface language, and an English-reading person would get a Dutch email |
| Both languages in one email | Longer and harder to scan for the code; every other email uses one resolved language |
| The default communication language of the account's first workspace | No workspace exists at the first sign-in, and with several workspaces the choice is arbitrary |

## References

- ADR-017 *Communication language*
- `PRODUCT.md §3` Language and localization requirements, §27 Authentication
