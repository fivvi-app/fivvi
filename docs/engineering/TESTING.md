# Testing Strategy

How we test Trainer Hub so that AI agents and humans can change it often without breaking it. The tools are fixed by ADR-014 (`ROADMAP.md §4`). This document covers **what** to test, **where**, **how**, and **what blocks a merge**. It applies to every PR.

## 1. Principles

1. **Tests ship with the change.** A PR that adds or changes behaviour includes the tests for it. "Tests later" does not exist, just like "translate later".
2. **Acceptance criteria become tests.** Every acceptance criterion in a feature doc maps to at least one automated test (§6). If a criterion can't be automated, the feature doc says why and how it is checked by hand.
3. **Bug fix = failing test first.** Reproduce the bug in a test, see it fail, then fix it. The test stays as a regression guard.
4. **Test at the lowest layer that can prove the rule.** Business rules live in `packages/domain`, so most tests live there too. E2E tests prove that the pieces are wired together; they don't re-test every rule.
5. **Real Postgres, not mocks, for data.** RLS, constraints, transactions and locks are part of our correctness. Mock only at system boundaries (§5.4).
6. **Deterministic or it doesn't count.** No real clock, no real network, no `sleep`. A flaky test is a bug (§8).
7. **Never weaken a test to get green.** Don't delete, skip or loosen assertions, and don't update snapshots without reading the diff. If a test is wrong, fix it in the PR and explain why in the description.

## 2. Test layers

| Layer | Tool | Lives in | Proves | Speed |
|---|---|---|---|---|
| **Domain unit** | Vitest | `packages/domain/**/*.test.ts` (next to the code) | Business rules: recurrence, capacity, holds, permissions matrix, time and locale formatting | ms, no I/O |
| **API integration** | Vitest + real Postgres | `packages/api/test/` | Routes end to end in-process: validation, auth, roles, tenant scoping, RLS, transactions, migrations, response matches the OpenAPI schema | seconds |
| **Tenant isolation suite** (E011) | Vitest + real Postgres | `packages/api/test/isolation/` | Workspace A can never read or write workspace B's data, through **any** route (§4.1) | seconds |
| **Email** | Vitest | `packages/email/**/*.test.ts` | Every template renders in nl-NL and en with no missing keys; links and dates are correct | ms |
| **Web component** | Vitest + Testing Library | `apps/web/**/*.test.tsx` | Only for components with real logic (forms, pickers, stateful widgets). Not for static markup | ms |
| **Web e2e** | Playwright | `apps/web/e2e/` | Critical user flows in a real browser, **in NL and EN**, with axe accessibility checks; mobile viewport for public pages | minutes |
| **iOS unit** | XCTest | `apps/ios/TrainerHubTests/` | View models, state handling, API-client mapping, error states | seconds |
| **iOS UI** | XCUITest | `apps/ios/TrainerHubUITests/` | A few platform-specific flows Maestro can't cover | minutes |
| **Android unit** | JUnit | `apps/android/app/src/test/` | View models, state handling, API-client mapping, error states | seconds |
| **Android UI** | Compose UI tests | `apps/android/app/src/androidTest/` | Screen states and interactions | minutes |
| **Mobile e2e** | Maestro | `e2e/maestro/` | **The same flow YAML on iOS and Android**, in both locales. This is the parity acceptance test (M8) | minutes |
| **Static checks** | CI (E002, E005, E018) | — | Lint, typecheck, i18n parity, ICU syntax, no hard-coded strings, OpenAPI drift, generated clients up to date | seconds |

Rough shape: many domain tests, a solid layer of API integration tests, a small number of e2e flows. If an e2e test is the only thing catching a rule, add a lower-level test for that rule.

## 3. What to test, by type of change

Use this as the checklist when writing and reviewing a PR.

| Change | Required tests |
|---|---|
| New or changed **business rule** | Domain unit tests, including edge cases and invalid input |
| New or changed **API route** | Integration test: happy path, validation error, **every role** (Owner / Admin / Trainer / Client / anonymous) allowed or denied as specified, response matches the schema. The isolation suite picks the route up automatically (§4.1) |
| **Schema / migration** | Migrations apply to an empty DB and on top of the previous version; RLS policy exists for every new business table (a test checks this) |
| **Scheduling, time, recurrence** | DST fixtures (§4.3); times near midnight in Europe/Amsterdam |
| **Booking, capacity, holds** | Concurrency test (§4.2); hold expiry; cancellation frees the spot |
| **Tokens** (magic link, 6-digit code, invitations) | Single use, expiry, stored hashed, rate limit, wrong-workspace rejection |
| **Notes / health data** | Roles that must not see notes get a denial, and no note content leaks into lists, emails, logs or error messages |
| **User-facing web flow** | Playwright e2e in NL **and** EN for the flow's main path |
| **Mobile feature** | Unit tests on **both** iOS and Android for the view model, plus a Maestro flow (both locales) for the main path |
| **Strings** | Covered by CI checks; no extra test unless the string has plural or date logic |
| **Email template** | Render test in both locales |
| **Bug fix** | A regression test that fails without the fix, at the lowest layer that reproduces it |
| **Refactor, no behaviour change** | Existing tests stay green, unchanged. If you have to change tests, it wasn't a pure refactor |

## 4. High-risk areas

These are the bugs that hurt most (`ROADMAP.md §13`: R2, R3, R4). They get dedicated, always-on tests.

### 4.1 Tenant isolation (R4)

- The suite **enumerates every route from `openapi.json`**. For each route that touches a business record it creates data in workspace A and calls the route as a user of workspace B. Expected result: `404` (never `403`, so we don't reveal the record exists) and no data from A in the response.
- A new route without an isolation case fails CI. Public routes are listed explicitly in an allow-list, which is reviewed in the PR.
- A second set of tests runs queries directly against Postgres with a workspace-scoped role to prove RLS blocks cross-tenant reads **even if the data-access layer has a bug**.

### 4.2 Overbooking (R3)

- Fire N parallel booking requests (separate DB connections) at an occurrence with 1 spot left. Exactly one succeeds; the others get a "full" result; the database agrees.
- The same for holds: an active hold counts against capacity; an expired hold does not.

### 4.3 Time and daylight saving (R2)

- Fixed fixtures for the **last Sunday of March and October** in Europe/Amsterdam: "every Tuesday 18:00" stays 18:00 local on both sides of the change.
- Times between 00:00 and 02:00 local, which fall on the previous day in UTC.
- Rendering: nl-NL `22 september 2026`, `18:00`; en uses the English format, same timezone.

## 5. Conventions

### 5.1 Naming and traceability

- Group tests by feature ID and name them after the behaviour, not the function:
  `describe('F029 booking hold')` → `it('releases the spot when the hold expires')`
- Tests that cover an acceptance criterion reference it: `it('AC2: guest receives the confirmation email in their locale')`. A reviewer can then check the feature doc against the test list.
- Native: the same idea in XCTest/JUnit method names, e.g. `test_F043_AC1_logsSetWhileOffline`.

### 5.2 Test data

- **Factories, not fixtures files.** Shared builders live in `packages/testing` (e.g. `createWorkspace()`, `createTrainer(ws)`, `createClass(ws, { capacity: 1 })`). They create valid records with sensible defaults, so a test only states what matters to it.
- **Every test creates its own workspace.** Tests never depend on each other's data or on order, and they can run in parallel. This also exercises tenant scoping by default.
- **Seed data is for local development and the e2e baseline only.** Tests don't modify shared seed data.
- **No real personal data**, ever. Use obviously fake names and `@example.com` addresses.

### 5.3 Database

- Local: Postgres in Docker (same major version as production). CI: a Postgres service container. Never run tests against the Railway production or preview databases.
- Migrations are applied once per test run; each test worker gets its own database, so workers don't interfere.
- Concurrency tests use real, separate connections and are allowed to be slower.

### 5.4 Time, locale and external services

- **Clock:** domain code gets "now" from an injected `Clock`, never `Date.now()` / `Date()` / `new Date()` directly. Tests use a fixed clock. The test process runs with `TZ=UTC` so the machine's timezone never leaks in.
- **Locale-independent selectors:** e2e and UI tests find elements by role + accessible name from the catalog, or by test ID / accessibility identifier, so **the same test runs in both locales**. Assert on visible text only where the text is the point, and read it from `packages/i18n`, never hard-code Dutch or English in a test.
- **Mock only at boundaries:** email provider (a capture transport that records to, locale, subject and links), Cloudflare Turnstile (official test keys), Sentry/PostHog (disabled), the clock. Don't mock the database, the domain package or our own API.
- **No network** in unit and integration tests. E2E hits only our own local stack.

### 5.5 Coverage

- Coverage is reported on every PR, but **the checklist in §3 is the real bar**, not a number.
- One hard gate: `packages/domain` line coverage must not drop below **90%**. That package is small, pure and where the rules live, so it is cheap to keep high.

## 6. Test plan in the feature doc

Every feature doc (`docs/features/_TEMPLATE.md`) has a **Test plan** section, written **before** implementation. It lists each acceptance criterion with the layer(s) that prove it:

| AC | Layer | Test |
|---|---|---|
| AC1 (NL/EN) | Playwright | `apps/web/e2e/booking.spec.ts` → `AC1: guest books a class` |
| AC2 | API integration | `packages/api/test/bookings.test.ts` → `AC2: rejects booking when full` |
| AC3 | Domain unit | `packages/domain/booking/hold.test.ts` → `AC3: hold expires after 10 minutes` |

The reviewer checks this table against the code.

## 7. Where tests run

| When | What runs |
|---|---|
| **Locally, before opening a PR** | Everything for the areas you touched. Agents paste the commands and results in the PR description. Mobile changes: build and run the unit tests and the affected Maestro flows on both platforms locally |
| **Every PR (Linux, required)** | Static checks, domain unit, API integration, isolation suite, email, web component, Playwright (NL + EN), Android unit + Compose tests |
| **PR touching `apps/ios` or the contract (macOS, required when triggered)** | iOS build, XCTest, XCUITest. Path-filtered to save macOS minutes (ROADMAP §12) |
| **PR touching mobile apps, contract or strings** | Maestro flows on the platforms affected. If CI minutes run short, Maestro runs locally and nightly instead; the PR description must say it ran |
| **Before a TestFlight / Play internal build** | Full suite on both platforms, both locales |

**Budget:** keep the required Linux checks under ~10 minutes. If they get slower, speed them up (parallelise, move logic tests down a layer), don't drop them.

Commands (`pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, …) are defined in E010. Add them to this section when E010 lands.

## 8. Flaky tests

- A flaky test is a bug with a priority, not noise. Fix the cause (usually a race, a real clock or shared data).
- CI retries are off for unit and integration tests. Playwright and Maestro may retry once, and a test that only passes on retry is reported as flaky.
- Quarantine (skip) is allowed only with a linked issue, an owner and a date, for at most one week. Never quarantine tenant isolation, concurrency or permission tests: fix them or revert the change that broke them.

## 9. Agent workflow

1. Read the feature doc and write or update its **Test plan** (§6) first.
2. Write the failing tests for the next small step, then implement until green (test-first is expected for domain rules and bug fixes).
3. Run the relevant suites locally and paste the results into the PR description.
4. **Cross-review checks the tests too:** do they actually assert the acceptance criteria, cover the roles and both locales, and would they fail if the feature broke? A test that can't fail is worse than no test.
5. Never mark a feature `IMPLEMENTED` in `FEATURES.md` while its Test plan has gaps.
