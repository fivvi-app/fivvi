# ADR-022: Workspaces and team roles run on our own tables and routes, not on Better Auth's organization plugin

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-28 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | Amends ADR-007 (the organization / member / invitation plugins for workspaces and roles; sign-in stays Better Auth); ADR-006 (tenant isolation); ADR-004 (API contract); F002 Workspaces (#170, ticket #276), F003, F004, F011; E011 (#145) |

## Context

ADR-007 chose Better Auth "with its organization / member / invitation plugins for workspaces and roles". Spec #170 (F002) made the first ticket a proof, because E011 (#145) later built `organizations` and `team_members` as forced-RLS business tables, an access helper (401 / 404 / 403, `x-access` in the contract) and a tenant context per request, none of which the plugin knows. The ticket's rule: the plugin fits only if all four conditions hold, otherwise F002 does not use it for workspaces and records why next to ADR-007.

The proof is `packages/auth/test/organization-plugin.integration.test.ts` (`pnpm --filter @fivvi/auth test:integration`). It configures the plugin of the pinned version (better-auth 1.7.12) over our two tables in the test only, and runs it on real Postgres as `fivvi_app` (RLS forced, no `BYPASSRLS`), calling the plugin's HTTP endpoints with real sessions. Nothing of the plugin is in `src/`.

| # | Condition | Result | Evidence |
|---|---|---|---|
| 1 | One team role per account and workspace | **Met** | Adding a second role for an account that is a member fails (`User is already a member of this organization`). The plugin stores role lists as `owner,trainer` and defaults to `member`; both fail in our `team_role` enum, so the database keeps the rule, with a 500 instead of a 4xx. |
| 2 | 401 not signed in, 404 no place in the workspace, 403 role not allowed | **Not met by the plugin's endpoints; met only behind our access helper or a wrapper** | 401 and 403 match. A caller with no place in the workspace gets **400** from the plugin's HTTP endpoints (`USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION` on rename, `ORGANIZATION_NOT_FOUND` on read), the same 400 for another workspace's ID and for an ID that does not exist. A route behind `defineRoute` never gets there: the access helper answers 404 before it calls `auth.api.*`. So the plugin can meet the condition only if every call goes through that helper or a wrapper that maps its 400s. |
| 3 | Every read and write in the request's tenant context | **Met only with a per-request executor, application-made ids and a hook** | The plugin runs on the one database `createAuth` is given at start-up, the app pool with no context: the real Owner of A cannot read it (400, "not found"), rename it (400, "not a member") or list it (`[]`). A new Better Auth instance per request, built over the request's transaction, reads, renames and lists correctly. That needs the transaction, which `packages/database` keeps sealed on purpose (E011: repositories are the only code that touches it). Create is a separate cost, and not the plugin's fault: E011's policy `organizations_workspace` (migration 0008, `WITH CHECK id = ANY(app_workspace_ids())`) wants the id before the row exists, so any create has to choose the id first, our own route included. With the plugin that means `advanced.database.generateId` as a function for the whole instance and a `beforeCreateOrganization` hook that hands the chosen id to the plugin. |
| 4 | Fields map onto `organization_id`, `account_id`, `role`, no second membership table | **Met** | `schema.member.fields.userId = 'accountId'` maps `member` onto `team_members`; no second membership table appears. The plugin runs without `auth_sessions.active_organization_id` (the Drizzle adapter leaves the field out and "open workspace on the session" does nothing; we use the `workspaceId` of the path). Deleting a workspace needs an `invitation` table (it deletes them before the workspace), and so would invitations (F011). In 1.7.12 the plugin takes the slug from the caller and a rename can change it; `organizationHooks.beforeUpdateOrganization` can drop a slug change on rename, and our route can pass a slug it made itself (F002 makes the slug from the name and never changes it, AC2 and AC6). |

Conditions 2 and 3 are the ones the ticket calls out ("our 404 rule, RLS"). Taken honestly, neither is a flat failure: each can be met, at a cost. The plugin's endpoints also live under `/api/auth/organization/*`, outside `defineRoute`, so they carry no `x-access`, are not in the contract and are not enumerated by E011's isolation suite; using the plugin means not exposing those endpoints and calling `auth.api.*` only from our own routes.

**What the plugin would cost.** Using it for workspaces is possible only with all of: (1) a per-request executor, here a Better Auth instance built over the request's sealed transaction; (2) application-made ids for the whole Better Auth instance, plus a hook that hands the workspace's id to the plugin; (3) a 404 wrapper (our access helper in front of every `auth.api.*` call) that turns the plugin's 400s into our status codes. In addition come the `invitation` table (needed to delete a workspace and to invite) and a hook to pin the slug. That is the real reason for the decision below: after those, the plugin does little that a repository function does not.

## Decision

F002 does **not** use Better Auth's organization plugin for workspaces. Sign-in, sessions and bearer tokens stay on Better Auth (ADR-007 is otherwise unchanged).

- **Workspaces and team roles** are `organizations` and `team_members` (E011), written through repository functions in `packages/database` with the request's tenant scope, behind `defineRoute` and the access helper. Creating a workspace is one transaction in `packages/api` and `packages/domain` (spec #170).
- **Invitations (F011), role changes (F004) and membership (F003)** are built the same way on our tables; they do not wait for, or assume, the plugin's `member` and `invitation` models.
- **No plugin code, schema or column** is added: no `organization()` in `packages/auth/src`, no `invitation` table, no `auth_sessions.active_organization_id`. The workspace a request is about is the `workspaceId` in the path (E011), not state on the session.
- The probe test stays as the record of this decision and pins the plugin's behaviour on purpose. If a later version of the plugin accepts a per-request adapter and our status codes, a new ADR can reopen this.

## Consequences

- **Positive:** one access path to workspace data (access helper, tenant scope, RLS), one contract, one set of status codes; E011's isolation suite covers every workspace route; no second membership model and no per-request Better Auth instance.
- **Negative:** we write the membership, role and invitation flows ourselves (F003, F004, F011), including their emails (ADR-009) and tests, and do not get the plugin's invitation lifecycle for free.
- **Follow-ups:** ADR-007's status line points here; the ADR table in `ROADMAP.md §4.3` notes it. F002's tickets (#277 onwards) build on `organizations` and `team_members` as they are.

## Alternatives considered

| Option | Why not |
|---|---|
| The plugin over our tables with a Better Auth instance per request, over the tenant transaction | Needs the sealed transaction exported from `packages/database`, application-made ids for the whole instance plus a hook, and a wrapper that turns its 400s into our 404s; after that the plugin does little a repository function does not. |
| The plugin over our tables with a request-scoped executor (`AsyncLocalStorage`) behind one long-lived Better Auth instance | Avoids building an instance per request, but the executor becomes ambient state, which E011 chose against: it picked explicit scopes (`inWorkspaceScope`, repositories) so the tenant context is passed, not looked up. It still needs the sealed transaction exposed from `packages/database` so it can be put into the async context for Better Auth's adapter, plus the application-made ids with their hook and the 404 wrapper. |
| The plugin on the privileged connection | Breaks ADR-006 and E011 (RLS would not apply; the privileged connection is allow-listed for system work only). |
| The plugin with its own `organization`, `member` and `invitation` tables next to ours | A second membership model; the ticket and E011 rule it out. |

## References

- Ticket #276, spec #170 (*Implementation Decisions → Tables*), E011 spec #145
- `packages/auth/test/organization-plugin.integration.test.ts`
- Better Auth organization plugin, source of the pinned version: `better-auth/dist/plugins/organization/` (`routes/crud-org.mjs`, `adapter.mjs`)
