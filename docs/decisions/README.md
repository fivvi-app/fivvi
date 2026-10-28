# Architecture Decision Records

Each significant technical decision is recorded here as a short ADR, in a lightweight [MADR](https://adr.github.io/madr/) style. The roadmap summarises them in [`ROADMAP.md §4.3`](../product/ROADMAP.md#43-architecture-decision-records-adrs); these files hold the full context and trade-offs.

Agents read the ADRs relevant to their change before starting (`WORKFLOW.md §4`). An ADR that conflicts with the code is a bug in one of the two: fix it in the same PR.

## Index

| ADR | Title | Status |
|---|---|---|
| [001](ADR-001-monorepo-tooling.md) | Monorepo tooling: pnpm workspaces + Turborepo, native projects in the same repo | Accepted |
| [002](ADR-002-web-framework.md) | Web framework: Next.js (App Router) + TypeScript strict | Accepted |
| [003](ADR-003-native-mobile-apps.md) | Mobile: native iOS (Swift + SwiftUI) and Android (Kotlin + Jetpack Compose) | Accepted (deviates from `PRODUCT.md §72`) |
| [004](ADR-004-api-layer.md) | API layer: REST + OpenAPI 3.1 with Hono + zod-openapi and generated clients | Accepted |
| [005](ADR-005-database-and-orm.md) | Database & ORM: PostgreSQL (EU) + Drizzle + versioned SQL migrations | Accepted |
| [006](ADR-006-tenant-isolation.md) | Tenant isolation: org-scoped data layer + Postgres RLS + cross-tenant tests | Accepted |
| [007](ADR-007-authentication.md) | Authentication: Better Auth with magic link + 6-digit code, bearer tokens for native; the organization plugin for workspaces amended by ADR-022 | Accepted |
| [008](ADR-008-localization.md) | Localization: ICU catalogs in `packages/i18n`, exported to native catalogs | Accepted |
| [009](ADR-009-transactional-email.md) | Transactional email: React Email + Brevo | Accepted; provider selected |
| [010](ADR-010-background-jobs.md) | Background jobs: lazy expiry + daily cron, no job runner | Accepted |
| [011](ADR-011-hosting-and-environments.md) | Hosting & environments: Railway EU West (Amsterdam) for web, API, Postgres and cron | Accepted (re-evaluated; replaces Vercel + Neon) |
| [012](ADR-012-time-and-recurrence.md) | Time & recurrence: UTC `timestamptz` + IANA zones, RRULE in wall-clock time, materialized occurrences | Accepted |
| [013](ADR-013-observability.md) | Observability: Sentry EU, uptime checks, PostHog EU cookieless | Accepted |
| [014](ADR-014-testing.md) | Testing: Vitest, Playwright, XCTest, JUnit/Compose, Maestro | Accepted |
| [015](ADR-015-ui-foundation.md) | UI foundation: shared design tokens, native UI per platform | Accepted |
| [016](ADR-016-agent-merges.md) | Agents merge low-risk PRs: scripted risk, a merge gate and a ruleset on `main`; amended by ADR-021 | Proposed |
| [017](ADR-017-language-policy.md) | Language policy: interface language falls back to English; the workspace default only sets the communication language | Accepted (replaces ADR-008's locale-resolution rule) |
| [018](ADR-018-merge-queue.md) | Merge queue: agents add low-risk PRs to the queue, the owner adds high-risk ones (until G2 agents also add high-risk PRs that are not owner-only, ADR-021); amends ADR-016; amended by ADR-021 | Proposed |
| [019](ADR-019-sign-in-communication-language.md) | Sign-in communication language: stored preference, otherwise the language of the screen that asked; amends ADR-017 | Proposed |
| [020](ADR-020-payment-provider.md) | Payment provider and merchant model: Mollie Connect for Platforms, the gym as merchant on its own account | Accepted |
| [021](ADR-021-agents-queue-high-risk.md) | Agents queue high-risk PRs before G2, except owner-only changes (guardrails, legal, money, product and decision docs); amends ADR-016 and ADR-018 | Proposed |
| [022](ADR-022-workspaces-on-our-own-tables.md) | Workspaces and team roles run on our own tables and routes (E011), not on Better Auth's organization plugin; amends ADR-007 | Proposed |

ADRs 001–015 were accepted by the owner on 22 September 2026 and written up in M0. ADR-011 was re-evaluated during the write-up and accepted in its new form (Railway) the same day. The *Alternatives considered* sections of those ADRs were reconstructed at write-up time from the roadmap rationale; they explain why the accepted choice fits, not a debate that was re-run.

## Statuses

- **Proposed**: written up, awaiting the owner's decision.
- **Accepted**: decided by the owner; the code follows it.
- **Superseded by ADR-0xx**: replaced; the file stays for history, with a link to its successor.
- **Deprecated**: no longer relevant, not replaced.

Source notes that an ADR rests on (research against primary sources) live in [`research/`](research/), named after the ADR.

An accepted ADR is not edited to change its decision. To change a decision, write a new ADR that supersedes it (or, for a decision not yet built on, re-open it as *Proposed* with a note in the roadmap changelog, as done for ADR-011).

## Adding an ADR

1. Take the next free number and copy the template below to `ADR-0xx-<slug>.md`.
2. Open it on a `docs/<slug>` branch in its own worktree (`WORKFLOW.md §2`) with status **Proposed**.
3. Add it to the index above and to the table in `ROADMAP.md §4.3`.
4. The owner accepts it by approving the PR; set the status to **Accepted** with the date before merge.

## Template

```markdown
# ADR-0xx: <Short decision title>

| | |
|---|---|
| **Status** | Proposed · Accepted · Superseded by ADR-0yy · Deprecated |
| **Date** | YYYY-MM-DD |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §…, ROADMAP.md §…, ADR-0yy, E0xx / F0xx |

## Context

What forces are at play: requirements, constraints, risks. Why a decision is needed now.

## Decision

The choice, stated so an agent can follow it without asking. Include the rules it implies.

## Consequences

- **Positive:** what gets easier.
- **Negative:** what gets harder, what it costs, what we must now watch.
- **Follow-ups:** spikes, checks or later decisions this creates.

## Alternatives considered

| Option | Why not (now) |
|---|---|
| … | … |

## References

Links to specs, vendor docs, benchmarks.
```
