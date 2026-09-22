# ADR-006: Tenant isolation

| | |
|---|---|
| **Status** | Accepted (2026-09-22) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §4, §5, §77, §78, §79; ROADMAP.md M2, §13 (R4); TESTING.md §4.1; ADR-005; E011 |

## Context

Every gym or trainer is a workspace (`PRODUCT.md §5`), and business data belongs to a workspace (§77). Trainers can belong to several workspaces at once (§4), and the trainer calendar deliberately reads **across** workspaces (§78). A cross-tenant leak (R4, impact *Critical*) would expose client and possibly health data (§79) to another business. The code is written by AI agents, so one forgotten `WHERE organization_id = …` must not be enough to cause a leak.

## Decision

Two independent barriers, plus tests:

1. **Org-scoped data-access layer.** Every business table has an `organization_id` column. Business data is only read or written through repository functions that take a tenant context (user, active workspace, role) and apply the scope. Route handlers don't query business tables directly.
2. **Postgres Row-Level Security as defence in depth.** RLS is enabled on every business table. Each request runs in a transaction that sets the current user and the organizations they may access (e.g. `set_config('app.org_ids', …, true)`), and policies filter on it. The application connects as a role **without** `BYPASSRLS`; only migrations and explicitly marked admin jobs use a privileged role.
3. **Automated cross-tenant tests (E011)** in CI: the suite enumerates every route from `openapi.json`, creates data in workspace A, calls the route as a user of workspace B, and expects `404` with no data from A. A check fails CI if a business table has no RLS policy.

The cross-workspace trainer calendar (§78) is an explicit, permission-checked query over **the trainer's own memberships**, not an unscoped query.

## Consequences

- **Positive:** a leak needs two independent mistakes (a missing app scope **and** a missing or wrong policy) and must also slip past the isolation suite.
- **Positive:** new routes are covered automatically, because the suite reads the contract.
- **Negative:** RLS needs per-request session settings, which means each request uses a transaction and the connection pool must not leak settings between requests (transaction-local `set_config`).
- **Negative:** RLS policies are SQL that reviewers must read carefully; policy bugs can also *hide* data and cause confusing empty results.
- **Negative:** background jobs that work across tenants (daily cron, ADR-010) need a clearly separated privileged path, audited in review.
- **Follow-ups:** E011 in M2; the security review in M9 includes the isolation suite and RLS coverage.

## Alternatives considered

| Option | Why not |
|---|---|
| App-level scoping only | One missed filter leaks data; too fragile for agent-written code |
| Schema per tenant | Migrations × N tenants; cross-workspace trainer calendar becomes a multi-schema query |
| Database per tenant | Operational cost and free-tier limits; same cross-workspace problem |
| RLS only | Hard to debug when it's the only layer; the app layer gives clear, testable intent and good error handling |

## References

- `PRODUCT.md §77` Multi-tenancy, `§78` Personal calendar
- `TESTING.md §4.1` Tenant isolation
