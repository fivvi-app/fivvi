---
name: local-review
description: 'Review a Trainer Hub change locally before pushing or opening a PR: run the relevant checks and tests, walk the WORKFLOW.md §4 review checklist and Definition of Done (tenant isolation, roles, i18n NL/EN, time zones, notes privacy, contract, migrations, test quality, docs), and draft the PR description. Use when asked to "review", "check before push", "ready for PR" or "self-review".'
argument-hint: 'Optional: the feature ID or the areas to focus on'
---

# Local review

Agent review in this repo happens locally, before the push (`docs/engineering/WORKFLOW.md §4`). Nothing here adds a GitHub reviewer or CI job. Run it inside the change's worktree.

## 1. Scope

```bash
git fetch origin
git status --short
git diff --stat origin/main...HEAD
```

Read the full diff, plus the feature doc and its Test plan. List the areas touched: domain, API/contract, database, web, email, i18n, native, docs.

## 2. Run the checks for those areas

Commands: `docs/engineering/TESTING.md §7.1`. Always:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm check && pnpm format:check
```

Add `pnpm test:integration` (needs `pnpm db:up` and `TEST_DATABASE_URL`) for database, API or cron changes, and `pnpm test:e2e` for user-facing web flows. Keep the commands and results; they go in the PR description. A failing check is a finding: fix it, don't skip it.

## 3. Checklist

Mark every item ✅, ❌ (finding) or n/a, with a file reference for each ❌.

- **Correctness:** every acceptance criterion is implemented, and nothing outside the spec or in `PRODUCT.md §53` was added.
- **Tenant isolation:** business data carries `organization_id`, goes through tenant-scoped repositories, and cross-tenant access returns `404`.
- **Roles:** Owner / Admin / Trainer / Client / anonymous are allowed or denied as specified, with a test for each.
- **i18n:** no hard-coded user-facing strings; keys in both `nl-NL.json` and `en.json`; native catalogs regenerated; Dutch copy checked against `packages/i18n/GLOSSARY.md` (local copy review).
- **Time:** stored in UTC; rendered in the workspace zone (Europe/Amsterdam); injected `Clock`; DST and near-midnight cases tested where relevant.
- **Notes and health data:** trainer-only by default; no note content in lists, emails, logs or errors.
- **Contract:** API changes regenerated (`openapi.json` + TS/Swift/Kotlin) in this change; additive only after a contract freeze.
- **Database:** generated SQL read; migrations forward-only; RLS on new business tables (from E011); seed contains no real data.
- **Tests** (`TESTING.md §3`, `§9`): the Test plan is fully covered; tests would fail if the feature broke; both locales for user flows; no skipped, deleted or weakened tests; bug fixes have a regression test.
- **Parity:** mobile features on iOS **and** Android.
- **Docs:** feature doc and `FEATURES.md` status updated; ADRs still match the code.
- **Hygiene:** no secrets, real personal data, debug output or scratch files; generated files not hand-edited; commits follow `feat(F0xx): …`.

Optional: ask a second agent for an independent local review of the diff. It is never required and never runs in GitHub.

## 4. Fix, then report

Fix every ❌ on the branch, re-run the affected checks, and repeat until the checklist is clean. Then give the user:

1. The checklist with results.
2. A PR description draft: title `[F0xx] Implement …`, summary, the test commands and their results, docs updated, and a placeholder for the Railway preview smoke check (`curl -fsS https://<pr-domain>/api/v1/health`, `docs/engineering/ENVIRONMENTS.md §4`).
