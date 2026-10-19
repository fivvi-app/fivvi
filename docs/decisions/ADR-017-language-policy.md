# ADR-017: Personal language policy: interface and communication language

| | |
|---|---|
| **Status** | Accepted (2026-10-15); the communication-language order is amended by [ADR-019](ADR-019-sign-in-communication-language.md) |
| **Date** | 2026-10-15 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §3, §32; ROADMAP.md M2, M6; ADR-008 (supersedes its locale-resolution rule only), ADR-009; E008, F007–F010 |

## Context

ADR-008 set one locale-resolution order for every platform: **explicit user choice → stored preference → workspace default → device/browser → nl-NL**. Building the native shells (E008) showed two problems with it:

- **Two questions share one order.** "Which language does this screen show?" and "Which language does this email use?" have different inputs. The workspace's default communication language (`PRODUCT.md §3`) is about communication when no personal preference is known. Placed before the device language, it overrides the language of the person holding the phone or browser: a Dutch workspace would force Dutch on a client whose browser asks for English.
- **The final fallback doesn't help the people who reach it.** Someone reaches the end of the order only when no Dutch or English is set or requested, e.g. a phone set to German or French only. For them English is far more likely to be readable than Dutch. Dutch users are unaffected: a Dutch device or browser already matches Dutch.

The native platforms add a third input ADR-008 didn't name: the per-app language a user can set in iOS and Android settings. And the native resource fallback can't decide the language, because the source catalogs are Dutch, so a missing match falls back to Dutch resources.

Native tickets need this decided before they are cut (E008 spec #34).

## Decision

> **Amended by [ADR-019](ADR-019-sign-in-communication-language.md) (19 October 2026):** for an email sent outside a workspace, such as the sign-in email, the communication-language order is two steps only — the recipient's stored personal preference, otherwise the interface language of the screen that asked — with no workspace default (there is no workspace to fall back to). The first sign-in that creates an account stores that screen's language as the account's personal preference. The rest of this ADR stands.

Trainer Hub resolves two separate languages. Both use only `nl-NL` and `en`.

**Interface language** (what a screen shows, and the `locale` sent to the API for it), first match wins:

1. **Explicit choice:** the language switch on web, or the OS per-app language on iOS and Android.
2. **Stored personal preference:** the signed-in user's `preferredLocale` (F010, M2).
3. **A booking link's fixed language**, on public booking pages only, when the link sets one (`PRODUCT.md §32`), e.g. an English-only class.
4. **Device or browser languages**, in the user's order of preference. Skip unsupported languages. Match by language subtag: any `nl-*` is `nl-NL` and any `en-*` is `en`. `[fr-FR, nl-BE]` gives Dutch; `[de-DE, en-GB, nl-NL]` gives English.
5. **English**, when nothing above matches, including an empty list.

The workspace's default communication language never decides the interface language. A booking link no longer offers "use the workspace default"; it detects the visitor's language or sets a fixed one, and the visitor can always switch.

**Communication language** (emails and other messages to a recipient), first match wins:

1. The recipient's stored personal preference, including a language a client chose during booking (`PRODUCT.md §3`, *Client language*).
2. The workspace's default communication language.

Rules that follow:

- One shared resolver in `packages/i18n` implements both orders. Web, API, email and the native apps use it or mirror it with tests named after the same cases. They never rely on a platform's resource fallback to decide the language.
- Dutch stays the source language: the catalogs, the native default resources (`values/`, the Xcode development region) and the workspace default for new workspaces in the Netherlands. "Dutch-first" describes authoring and defaults for Dutch users, not the fallback for unsupported devices.
- A saved personal preference precedes device detection on every platform. F010 adds the in-app switch, local persistence before sign-in and profile reuse. Until then, the native apps follow the OS per-app language and the device list.

## Consequences

- **Positive:** a person always sees their own language when we have it, wherever they open Trainer Hub. People we don't support get English, which most of them can read.
- **Positive:** the workspace setting means one thing: the language of messages to someone whose preference we don't know.
- **Positive:** web, iOS and Android follow one rule with the same test cases, so parity can be tested.
- **Negative:** a Dutch gym's client with a German-only browser sees the booking page in English, not Dutch, unless the link fixes Dutch. We accept this: the visible switch (`PRODUCT.md §3`) is one tap away.
- **Negative:** the native apps can't use the OS's resolved bundle language as their input. They must read the raw preferred-language list and apply the rule themselves.
- **Follow-ups:**
  - E008's first ticket migrates `resolveLocale` in `packages/i18n`, its web callers and `packages/i18n/README.md` test-first, with web e2e regression tests.
  - E008's native tickets apply the interface rule on iOS and Android.
  - F010 (M2) adds the stored preference and the in-app switch to this order.
  - The booking-link language setting (M6) offers *detect* and *fixed*, not *workspace default*.
  - Emails pick the communication language once recipients have a stored preference (M2, M5).

## Alternatives considered

| Option | Why not |
|---|---|
| Keep ADR-008's single order with the `nl-NL` fallback | Gives Dutch to the people least likely to read it, and lets the workspace default override the reader's own language |
| Workspace default as the interface fallback, instead of English, or as a booking-link language option | Ties a person's screen to a business setting meant for communication; a German-speaking client at a Dutch gym still gets Dutch |
| Use the native platform's resolved resource language | The source catalogs are Dutch, so unsupported devices would fall back to Dutch, and iOS and Android would differ from web |
| An in-app language picker in the E008 shells | Belongs to F010 with stored preferences and onboarding; the shells have no sign-in |

## References

- `PRODUCT.md §3` Language and localization requirements
- ADR-008 Localization
- E008 Native app shells, spec #34 (AC3)
