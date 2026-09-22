# ADR-008: Localization

| | |
|---|---|
| **Status** | Accepted (2026-09-22) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §2.2, §3, §73, §74; ROADMAP.md §2 (principle 1), M1, M2, §10, §13 (R10); ADR-003, ADR-009; E005, F007–F010 |

## Context

The product is Dutch-first and fully bilingual (nl-NL + en) on every surface: web, iOS, Android and email (`PRODUCT.md §2.2, §3`). There must be no hard-coded user-facing strings (§73), and emails use the same localized content (§74). With native apps (ADR-003), strings now live in three runtimes: web (JSON), iOS (String Catalogs) and Android (`strings.xml`). Maintaining three sets of translations by hand guarantees drift.

## Decision

- **One source of truth:** ICU MessageFormat catalogs in `packages/i18n`: `nl-NL.json` and `en.json`, with shared keys. `packages/i18n/GLOSSARY.md` fixes terminology.
- **Web** uses **next-intl** on these catalogs.
- A **generator exports** the catalogs to **iOS String Catalogs (`.xcstrings`)** and **Android `strings.xml` + plurals**. Generated files are committed and never edited by hand.
- **Emails** render from the same catalogs (ADR-009).
- **CI checks:** key parity between locales, valid ICU syntax, no hard-coded strings (web lint rule; SwiftLint / ktlint custom rules), and generated native catalogs up to date.
- Locale resolution, used on every platform: **explicit user choice → stored preference → workspace default → device/browser → nl-NL** (`ROADMAP.md` M2).
- Dates and times use the platform's locale APIs with the workspace/user time zone (ADR-012). User content is never auto-translated (§3).

## Consequences

- **Positive:** one set of keys and translations for three platforms and email; adding a string to only one locale fails CI.
- **Positive:** the glossary and one catalog make LLM translation review (R10) practical: the reviewer sees every string in one place.
- **Negative:** the exporter must map ICU plurals and placeholders to Apple and Android formats correctly; complex ICU (nested select/plural) may not map cleanly. Keep messages simple; the exporter fails loudly on constructs it can't convert.
- **Negative:** native developers can't add strings in Xcode or Android Studio directly; they add keys to the JSON and regenerate.
- **Follow-ups:** E005 in M1 (package, exporters, CI checks); start `GLOSSARY.md` in M0 (`ROADMAP.md §4.2`).

## Alternatives considered

| Option | Why not |
|---|---|
| Separate catalogs per platform | Three translation sets drift; parity can't be checked in one place |
| Hosted translation platform (Lokalise, Crowdin, Phrase) as source | Paid beyond small tiers; the repo stays the source of truth and agents work in files |
| i18next instead of next-intl | Also workable; next-intl fits the App Router and uses ICU natively |
| Native catalogs as source, exported to web | Two native formats can't both be the source; JSON is the neutral format |

## References

- `PRODUCT.md §3`, `§73` Localization architecture, `§74` Email localization
- `ROADMAP.md §10` Localization track
