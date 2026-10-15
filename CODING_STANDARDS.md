# Coding standards

What every change to Trainer Hub must follow. Before every PR, the `code-review` skill checks the diff on two axes ([docs/agents/build.md](docs/agents/build.md)): `standards` against this file, `spec` against the ticket and spec issue. Tooling already enforces formatting, lint, types, i18n parity and contract drift, so a review doesn't repeat those. It looks for what tooling can't see.

## Where the detailed rules live

| Area | Rules |
|---|---|
| Everything | [`AGENTS.md`](AGENTS.md) (non-negotiable rules) |
| User-facing text, translations, dates | [`.github/instructions/i18n.instructions.md`](.github/instructions/i18n.instructions.md), [`packages/i18n/README.md`](packages/i18n/README.md), [`packages/i18n/GLOSSARY.md`](packages/i18n/GLOSSARY.md) |
| API routes and the contract | [`.github/instructions/api-contract.instructions.md`](.github/instructions/api-contract.instructions.md), [`packages/contract/README.md`](packages/contract/README.md) |
| Database, migrations, repositories | [`.github/instructions/database.instructions.md`](.github/instructions/database.instructions.md), [`packages/database/README.md`](packages/database/README.md) |
| Business rules | [`.github/instructions/domain.instructions.md`](.github/instructions/domain.instructions.md) |
| Tests | [`.github/instructions/testing.instructions.md`](.github/instructions/testing.instructions.md), [`docs/engineering/TESTING.md`](docs/engineering/TESTING.md) |
| Docs | [`.github/instructions/docs.instructions.md`](.github/instructions/docs.instructions.md) |
| Domain language | [`GLOSSARY.md`](GLOSSARY.md); decisions in [`docs/decisions/`](docs/decisions/README.md) |

## Review checklist

Mark every item ✅, ❌ (finding, with a file reference) or n/a.

- **Spec:** every acceptance criterion of the spec issue is implemented, and nothing outside the spec or in `PRODUCT.md §53` was added.
- **Domain language:** names in code, tests and copy use the terms in `GLOSSARY.md`, not the words it says to avoid.
- **Design:** business rules sit in `packages/domain` behind a small interface (deep modules); routes, apps and native code don't re-implement them. Tested through that interface.
- **Tenant isolation:** business data carries `organization_id`, goes through tenant-scoped repositories, and cross-tenant access returns `404`.
- **Roles:** Owner / Admin / Trainer / Client / anonymous are allowed or denied as specified, with a test for each.
- **i18n:** no hard-coded user-facing strings; keys in both `nl-NL.json` and `en.json`; native catalogs regenerated; Dutch copy checked against `packages/i18n/GLOSSARY.md` (copy review).
- **Time:** stored in UTC; rendered in the workspace zone (Europe/Amsterdam); injected `Clock`; DST and near-midnight cases tested where relevant.
- **Notes and health data:** trainer-only by default; no note content in lists, emails, logs or errors.
- **Contract:** API changes regenerated (`openapi.json` + TS/Swift/Kotlin) in the same change; additive only after a contract freeze.
- **Database:** generated SQL read; migrations forward-only; RLS on new business tables (from E011); seed contains no real data.
- **Tests** (`docs/engineering/TESTING.md §3`, `§9`): the spec's Test plan is fully covered; tests would fail if the feature broke; both locales for user flows; no skipped, deleted or weakened tests; bug fixes have a regression test.
- **Parity:** mobile features on iOS **and** Android.
- **Docs:** `FEATURES.md` status updated; ADRs still match the code (or a new ADR is proposed).
- **Hygiene:** no secrets, real personal data, debug output or scratch files; generated and vendored files not hand-edited; commits follow `feat(F0xx): …`.

Run `scripts/check.sh` before a review and fix findings on the branch before the PR. A review is local only: never a GitHub reviewer or CI job (`docs/engineering/WORKFLOW.md §4`).
