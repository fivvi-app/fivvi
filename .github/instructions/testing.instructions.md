---
name: 'Tests'
description: 'Use when writing or changing tests: Vitest unit and integration tests, Playwright e2e, test databases, clocks and DST fixtures, regression tests for bug fixes.'
applyTo: '**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/test/**,**/e2e/**,packages/testing/**'
---
# Tests

Full strategy: [docs/engineering/TESTING.md](../../docs/engineering/TESTING.md), helpers: [packages/testing/README.md](../../packages/testing/README.md), ADR-014.

- The file name picks the suite: `*.test.ts(x)` unit (no database), `*.integration.test.ts` real Postgres, `apps/web/e2e/*.spec.ts` Playwright.
- Test at the lowest layer that proves the rule. Use the checklist in `TESTING.md §3` for which tests a change needs.
- Name by behaviour and feature: `describe('F029 booking hold')`, `it('AC2: rejects booking when full')`. Reference acceptance criteria from the feature doc's Test plan.
- Database: `cloneTemplateDatabase()` per file, `withRollback()` per test. Commit only when rollback can't prove it (concurrency, second connection, deferred constraints, migrations). Never mock the database, the domain package or our own API.
- Time: inject a `Clock`; use `fixedClock`, `manualClock`, `zonedTime`, `dstTransitions` from `@trainer-hub/testing/clock`. No real clock, network or `sleep`. Tests run with `TZ=UTC`.
- Playwright: import `test`/`expect` from `apps/web/e2e/fixtures.ts`. Every spec runs in nl-NL and en with axe. Select by role + accessible name from the catalog or by test ID; never hard-code Dutch or English text.
- Every test creates its own workspace/data. No real personal data: fake names and `@example.com`.
- Bug fix: write the failing regression test first. Never delete, skip or loosen a test to get green.
