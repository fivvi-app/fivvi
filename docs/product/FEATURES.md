# Feature Registry

The single source of truth for feature status. Update it **in the same PR** as the change.

- **Lifecycle:** `IDEA → PLANNED → DESIGNED → IN PROGRESS → IN REVIEW → IMPLEMENTED → RELEASED` (`PRODUCT.md §81`)
- **Priority:** `Must` (MVP cannot ship without it) · `Should` (first to slip to 1.1 if dates are at risk)
- **Languages:** a feature is not `IMPLEMENTED` until both NL and EN work (`PRODUCT.md §82`)
- **Spec:** the *Spec* column points to the requirements in [`PRODUCT.md`](PRODUCT.md). Each feature's spec and tickets are GitHub issues (`/to-spec`, `/to-tickets`, [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)); once a spec issue exists, the ID links to it, e.g. `[F031](https://github.com/thekeyvan/trainer-hub/issues/<n>)`
- **Milestones:** see [`ROADMAP.md §5`](ROADMAP.md#5-mvp-delivery-plan-m1m9)

## Summary

| Release | Features | Released |
|---|---|---|
| MVP | 51 (F001–F051) + 18 engineering enablers (E001–E018) | 0 |

---

## MVP: user-facing features

### Foundation

| ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |
|---|---|---|---|---|---|---|---|---|
| F001 | Authentication | PLANNED | Must | M2 | E004, E006 | ⬜ | ⬜ | §2.4, §27 |
| F002 | Workspaces | PLANNED | Must | M2 | F001 | ⬜ | ⬜ | §5 |
| F003 | Workspace Membership | PLANNED | Must | M2 | F002 | ⬜ | ⬜ | §6 |
| F004 | Roles | PLANNED | Must | M2 | F003 | ⬜ | ⬜ | §9, §50 |
| F005 | Trainer Profile | PLANNED | Must | M2 | F003 | ⬜ | ⬜ | §9 |
| F006 | Client Profile | PLANNED | Must | M2 (+M8 mobile) | F002 | ⬜ | ⬜ | §10, §34 (quick add, name only) |
| F007 | Localization Infrastructure | PLANNED | Must | M1–M2 | E005 | ⬜ | ⬜ | §3, §73 |
| F008 | Dutch UI | PLANNED | Must | continuous | F007 | ⬜ | — | §2.2 |
| F009 | English UI | PLANNED | Must | continuous | F007 | — | ⬜ | §2.2 |
| F010 | Locale Preference | PLANNED | Must | M2 | F001, F007 | ⬜ | ⬜ | §3 |

### Trainers

| ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |
|---|---|---|---|---|---|---|---|---|
| F011 | Trainer Invitations | PLANNED | Must | M3 | F003, F004, E006 | ⬜ | ⬜ | §49 |
| F012 | Multi-Workspace Trainer | PLANNED | Must | M3 | F003, F005 | ⬜ | ⬜ | §4, §6 |
| F013 | Personal Trainer Calendar | PLANNED | Must | M4 (+M8 mobile) | F012, F020 | ⬜ | ⬜ | §46, §47, §78 |
| F014 | Workspace Calendar | PLANNED | Must | M4 | F020 | ⬜ | ⬜ | §45, §48, §78 |

### Locations

| ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |
|---|---|---|---|---|---|---|---|---|
| F015 | Locations | PLANNED | Must | M3 | F002 | ⬜ | ⬜ | §12 |
| F016 | Organization Default Location | PLANNED | Must | M3 | F015 | ⬜ | ⬜ | §13 |
| F017 | Trainer Locations | PLANNED | Must | M3 | F005, F015 | ⬜ | ⬜ | §13 |
| F018 | Client Preferred Location | PLANNED | Must | M3 | F006, F015 | ⬜ | ⬜ | §14 |
| F019 | Automatic Location Selection | PLANNED | Must | M3 (wired in M4) | F016, F017, F018 | ⬜ | ⬜ | §2.6, §13 |

### Scheduling

| ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |
|---|---|---|---|---|---|---|---|---|
| F020 | Private Sessions | PLANNED | Must | M4 (+M8 mobile) | F005, F006, F015 | ⬜ | ⬜ | §17 |
| F021 | Group Class Templates | PLANNED | Must | M4 (+M8 mobile: create a class) | F005, F015 | ⬜ | ⬜ | §15, §18, §19 |
| F022 | Recurring Classes | PLANNED | Must | M4 (+M8 mobile: weekly repeat) | F021, E012 | ⬜ | ⬜ | §15, §20 |
| F023 | Trainer Assignment | PLANNED | Must | M4 | F020, F021 | ⬜ | ⬜ | §17, §19 |
| F024 | Trainer Substitution | PLANNED | Must | M4 | F022, F023 | ⬜ | ⬜ | §19 |
| F025 | Attendance | PLANNED | Must | M4 (+M8 mobile) | F020, F022 | ⬜ | ⬜ | §43 |
| F026 | Cancellations | PLANNED | Must | M4 | F020, F022, F049 | ⬜ | ⬜ | §17, §51 |

### Booking

| ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |
|---|---|---|---|---|---|---|---|---|
| F027 | Public Booking Page | PLANNED | Must | M5 | F022, F007 | ⬜ | ⬜ | §15, §21 |
| F028 | Booking Capacity | PLANNED | Must | M5 | F027 | ⬜ | ⬜ | §18 |
| F029 | Booking Hold | PLANNED | Must | M5 | F028, E012 | ⬜ | ⬜ | §24 |
| F030 | Magic-Link Verification | PLANNED | Must | M5 | F029, F049 | ⬜ | ⬜ | §23, §27 |
| F031 | Guest Booking | PLANNED | Must | M5 | F030 | ⬜ | ⬜ | §25 |
| F032 | Optional Account Creation | PLANNED | Must | M5 | F031, F001 | ⬜ | ⬜ | §2.4, §26 |
| F033 | Client Booking Dashboard | PLANNED | Must | M5 | F031 | ⬜ | ⬜ | §15 (Client Web) |

### Open Gym

| ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |
|---|---|---|---|---|---|---|---|---|
| F034 | Open Gym Slots | PLANNED | Must | M6 (+M8 mobile) | F015, F020 | ⬜ | ⬜ | §2.7, §15, §28 |
| F035 | Open Gym Public Booking | PLANNED | Must | M6 | F034, F027–F031 | ⬜ | ⬜ | §30 |
| F036 | Open Gym Suggestions | PLANNED | **Should** | M6 | F034, F013 | ⬜ | ⬜ | §29 |

### Sharing

| ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |
|---|---|---|---|---|---|---|---|---|
| F037 | Booking Links | PLANNED | Must | M6 | F027, F035 | ⬜ | ⬜ | §32 |
| F038 | QR Codes | PLANNED | Must | M6 | F037 | ⬜ | ⬜ | §33 |

### Workouts

| ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |
|---|---|---|---|---|---|---|---|---|
| F039 | Exercise Library | PLANNED | Must | M7 | F007 | ⬜ | ⬜ | §38 |
| F040 | Custom Exercises | PLANNED | Must | M7 | F039 | ⬜ | ⬜ | §38 |
| F041 | Workout Templates | PLANNED | Must | M7 | F039 | ⬜ | ⬜ | §39 (save a logged workout as template) |
| F042 | Client Workouts | PLANNED | Must | M7 | F041, F006 | ⬜ | ⬜ | §40 |
| F043 | Live Workout Logging | PLANNED | Must | M7 (+M8 mobile) | F039, F020 | ⬜ | ⬜ | §41 (with or without a template) |
| F044 | Previous Workout Display | PLANNED | Must | M7 (+M8 mobile) | F043 | ⬜ | ⬜ | §41 |
| F045 | Workout History | PLANNED | Must | M7 (+M8 mobile) | F043 | ⬜ | ⬜ | §42, §37 (shared recap) |
| F051 | Repeat Previous Workout | PLANNED | Must | M7 (+M8 mobile) | F043, F045 | ⬜ | ⬜ | §41 (moved from §54) |

### Notes

| ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |
|---|---|---|---|---|---|---|---|---|
| F046 | Client Notes | PLANNED | Must | M7 (+M8 mobile) | F006 | ⬜ | ⬜ | §35 |
| F047 | Session Notes | PLANNED | Must | M7 (+M8 mobile) | F020 | ⬜ | ⬜ | §36–37 (internal note) |
| F048 | Note Visibility | PLANNED | Must | M7 (+M8 mobile) | F046, F047 | ⬜ | ⬜ | §37, §79 (explicit client share) |

### Notifications

| ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |
|---|---|---|---|---|---|---|---|---|
| F049 | Localized Transactional Emails | PLANNED | Must | M1 (infra) → M5 | E006, F007 | ⬜ | ⬜ | §51, §74 (EM-12 in M7) |
| F050 | Trainer Booking Notifications | PLANNED | Must | M5 | F049, F031 | ⬜ | ⬜ | §51 |

---

## MVP: engineering enablers

These are not user-facing, so they don't need NL/EN columns. They still go through the same branch/PR/cleanup workflow.

| ID | Enabler | Status | Milestone | Notes |
|---|---|---|---|---|
| E001 | Monorepo & tooling | IMPLEMENTED | M1 | pnpm workspaces + Turborepo (`lint`, `typecheck`, `test`, `build`, `format:check`), Node 26 + pnpm pinned, TypeScript 7 strict, Biome (lint + format); empty `apps/web` Next.js skeleton (React Server Components). `apps/ios` / `apps/android` and SwiftLint/ktlint come with E008 (ADR-001) |
| E002 | CI pipeline | IMPLEMENTED | M1 | GitHub Actions (`.github/workflows/ci.yml`) on every PR and push to `main`: one Linux job runs `turbo run lint typecheck test build format:check check` with pnpm and turbo caches; later static checks (i18n parity, OpenAPI drift) plug in as `check` tasks. Path-filtered `iOS` (macOS, `apps/ios`/contract only) and `Android` placeholder jobs skip until E008. A ruleset on `main` enforces the required checks (`.github/rulesets/main.json`, applied by `scripts/github-settings.sh`, ADR-016) |
| E003 | Environments & deployment | IMPLEMENTED | M1 | Railway, EU West Amsterdam, managed by Railway Infrastructure as Code (`.railway/railway.ts`): `web` (Next.js standalone + API, Dockerfile, Wait for CI, health check `GET /api/v1/health` with DB ping), private-network Postgres, `cron` skeleton (`apps/cron`). Migrations (+ seed outside production) run as the pre-deploy step; the `hello` greeting is a data migration. `production` deploys `main`; `development` is the base of per-PR environments, so previews never get production secrets. ADR-011 conditions 1–2 checked (M1 spike results: restore works on Hobby, scheduled backups need Pro). See `docs/engineering/ENVIRONMENTS.md` (ADR-011) |
| E004 | Database, ORM & migrations | IMPLEMENTED | M1 | `packages/database`: Drizzle ORM (`node-postgres`), versioned SQL migrations (`db:generate` / `db:migrate`, schema drift check), idempotent seed, typed client from `DATABASE_URL` (sessions in UTC); Postgres 18 in `compose.yaml` (same major as Railway); `system_greetings` table for the M1 hello slice; conventions in the package README; `test:integration` turbo task (migrate → seed → read on real Postgres). RLS comes with E011 (ADR-005, ADR-006) |
| E005 | i18n package, native export & guardrails | IMPLEMENTED | M1 | `packages/i18n`: nl-NL + en ICU catalogs with typed keys, exporters → `.xcstrings` / `strings.xml` + plurals (committed in `generated/`), `pnpm check` (key + placeholder parity, ICU subset, generated files up to date), next-intl in `apps/web` (nl-NL default, en formatted as en-GB), Biome no-hard-coded-JSX-text plugin, `GLOSSARY.md` (ADR-008). Native no-literal-string rules (SwiftLint/ktlint) and wiring the generated catalogs into the apps come with E008 |
| E006 | Email infrastructure | IMPLEMENTED | M1 | `packages/email`: React Email templates localized from `packages/i18n` (`email.*` keys, skipped by the native exporters), `sendEmail` with a Brevo transport (transactional API, idempotency key), inline retry with backoff (ADR-010) and an in-memory capture transport for tests; sender from config; `pnpm email:preview` and `pnpm email:send-test`; Brevo free tier, DPA, EU storage, tracking and log retention checked (`docs/legal/sub-processors.md §4`). G1 delivery check: NL + EN test emails in the Gmail inbox, not spam (2026-10-03). Open: second mailbox check; domain + SPF/DKIM/DMARC before M5; ask Brevo support to disable transactional tracking before G2 (ADR-009) |
| [E007](https://github.com/thekeyvan/trainer-hub/issues/33) | Design tokens & UI foundation | IMPLEMENTED | M1 | `packages/design-tokens`: Style Dictionary v4 (DTCG) source from the M0 draft, light and dark; generates web CSS variables, Tailwind v4 theme and shadcn theme variables, a SwiftPM package (adaptive colours, Dynamic Type styles) and Kotlin (Material 3 light/dark schemes, shapes); `pnpm check` fails on stale outputs and on contrast pairs below WCAG AA. `packages/ui`: standard shadcn kit (Button, Input, Label, Card) themed only by tokens, Tailwind's default palette removed, 3:1 focus outline, compact/touch densities per layout, self-hosted Bricolage Grotesque display font; a `check` rejects raw colours in web source. Web follows the system light/dark setting. Native wiring is E008 (ADR-015) |
| [E008](https://github.com/thekeyvan/trainer-hub/issues/34) | Native app shells | IN PROGRESS | M1 | iOS (Swift + SwiftUI) and Android (Kotlin + Compose) with generated API client + strings wired (ADR-003). Shared resolver in `packages/i18n` follows ADR-017: `resolveInterfaceLanguage` (explicit → stored → booking link → first supported device/browser language → `en`) and `resolveCommunicationLanguage` (recipient preference → workspace default); the web hello page and `GET /api/v1/hello` use it. Hello-screen strings (`hello.error`, `common.retry`, `common.loading`, `app.name`) in both native catalogs, and `generated/ios/InfoPlist.xcstrings` with the app's display name from `app.name`. iOS shell in `apps/ios` (iOS 17+, Swift 6): hello screen through the generated `TrainerHubAPI` client in the interface language (per-app language → first supported device language → `en`), catalogs referenced in place, SwiftLint with a no-literal-text rule, unit and UI tests in nl and en (`pnpm test:ios`), the real `iOS` CI job, `scripts/bootstrap.sh --mobile` for Xcode and SwiftLint. Android shell in `apps/android` (API 26+, Kotlin, Compose, Material 3): the same hello screen through the generated Kotlin client and `strings.xml` with the same language rule, ktlint with a no-literal-text rule, unit and Compose UI tests in nl-NL and en (`pnpm test:android`), the shared Maestro hello flow on the emulator in both languages (`pnpm test:maestro`), the real `Android` CI job, and `--mobile` for the JDK, Android SDK, emulator and Maestro. Next: themes, real-device check |
| [E009](https://github.com/thekeyvan/trainer-hub/issues/32) | Observability | IN PROGRESS | M1 | `packages/observability`: Sentry (EU) error reporting for the API, the cron job and the web app (server components and browser), tagged with environment and release (commit SHA), scrubbed by an allowlist before sending, off without a DSN; web source maps uploaded at build time and deleted from the build output; capture transport for tests; Biome rule keeps `@sentry/*`, `posthog-node` and `posthog-js` imports inside the package. Typed server product events: `track()` to PostHog EU accepts only catalog events (UUIDs, enums, booleans, numbers, ISO dates), flushed per request, off without `POSTHOG_KEY`; in production a rejected event is dropped with a Sentry warning. Cookieless PostHog EU page views in the web app: path only, no cookies or storage, slim `posthog-js` without autocapture, recording or surveys, production-only (`NEXT_PUBLIC_POSTHOG_KEY`, read at runtime). See `docs/engineering/OBSERVABILITY.md` (event catalog in §4, page views in §5). Open: a source-mapped production event and a page view in PostHog checked by hand (after owner setup), the PostHog entries in `docs/legal/` aligned with the page view properties before `NEXT_PUBLIC_POSTHOG_KEY` is set (owner, OBSERVABILITY.md §5.1), owner setup (accounts, uptime monitors, limits), iOS and Android crash reporting (ADR-013) |
| E010 | Test infrastructure | IMPLEMENTED | M1 | `packages/testing`: shared Vitest presets (`unitConfig` / `integrationConfig`, `*.integration.test.ts`, `TZ=UTC`, no retries), database isolation (template database migrated once per run → clone per test file → `withRollback` per test; commit-needing tests get their own database), clock and Europe/Amsterdam DST helpers. CI runs `test:integration` against a Postgres 18 service in `Checks (Linux)`, and Playwright in a new `E2E (Linux)` job: every spec in nl-NL and en with automatic axe (WCAG 2.2 AA) checks, Chromium cached. Commands in `TESTING.md §7.1`. XCTest/XCUITest, JUnit + Compose UI tests and Maestro are specified for E008 in `TESTING.md §7.2` (ADR-014) |
| E011 | Tenant isolation suite & RLS | PLANNED | M2 | Cross-tenant tests in CI (ADR-006) |
| E012 | Scheduled jobs | PLANNED | M4 | Daily cron: recurrence materialization, hold cleanup, retention; holds expire lazily (ADR-010) |
| E013 | Public surface security | PLANNED | M5 | Rate limits, hold caps, Cloudflare Turnstile, headers |
| E014 | Privacy tooling | PLANNED | M9 | Data export, deletion, retention jobs, note-access audit log (§79) |
| E015 | Data import tooling | PLANNED | M9 | Pilot Excel/CSV → clients, timetable, sessions |
| E016 | Backups, restore drill & runbooks | PLANNED | M9 | A verified restore, incident/rollback runbooks |
| E017 | App distribution | PLANNED | M8 | Existing Apple company membership (owner-reported): verify access; confirm Play Console account or enroll; set up TestFlight, Play internal testing and store requirements |
| E018 | API contract & client generation | IMPLEMENTED | M1 | `packages/api`: Hono + zod-openapi, mounted in `apps/web` under `/api`; stub `GET /api/v1/hello`. `packages/contract`: committed `openapi.json` (3.1) → TS (openapi-typescript + openapi-fetch), Swift (swift-openapi-generator), Kotlin (openapi-generator, retrofit2 + kotlinx.serialization); generators pinned. Drift check: `pnpm check` (Turborepo `check` task); E002 makes it a required CI check (ADR-004) |

---

## Post-MVP backlog (IDEA)

These get `F0xx` IDs when they move to `PLANNED`. Full context is in [`ROADMAP.md §9`](ROADMAP.md#9-post-mvp-roadmap-11--70).

| Release | Candidate items |
|---|---|
| 1.1 | Waitlists · cancellation cutoff · recurring private appointments · schedule exceptions · holidays · blocked time · workout duplication · warm-up sets · supersets · workout reordering · pinned notes · note search · offline resilience · bulk attendance · *session reminder emails (suggested)* · *read-only ICS calendar feed (suggested)* · *Universal Links / App Links (suggested)* |
| 1.2 | Native client iOS/Android apps · push (APNs + FCM) · email → app deep links |
| 1.3 | AI note capture (NL/EN, speech + text, trainer confirms) |
| 1.4 | AI pre-session client briefing |
| 2.0 | Self-serve signup · persona onboarding · marketing site · help center · *platform billing (decision pending)* |
| 2.1 | Freelance improvements · gym access information |
| 2.2 | Workspace switching · cross-workspace conflict detection · workspace-specific permissions |
| 2.3 | Multi-location organizations |
| 3.0 – 7.0 | See roadmap themes |
