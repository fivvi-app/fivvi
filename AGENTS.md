# Trainer Hub: rules for coding agents

Dutch-first, bilingual (nl-NL + en) platform for personal trainers and small gyms.
Stack: Next.js web + API (Hono + zod-openapi, REST), native iOS (Swift + SwiftUI), native Android (Kotlin + Jetpack Compose), PostgreSQL (Drizzle), Better Auth. Free tiers until real clients arrive.

This file is the single source of agent rules for every tool we use: GitHub Copilot (VS Code and CLI) and Codex read it directly; Claude Code reads it through `CLAUDE.md`. Don't copy these rules into tool-specific files; link here instead.

## Read first

- Requirements: `docs/product/PRODUCT.md`
- Sequencing, milestones, ADRs, gates: `docs/product/ROADMAP.md`
- Feature registry and status: `docs/product/FEATURES.md`; specs and tickets are GitHub issues
- Domain language: `GLOSSARY.md` (what a term means); its NL/EN wording: `packages/i18n/GLOSSARY.md`
- Decisions: `docs/decisions/` (ADRs)
- How code must be written and reviewed: `CODING_STANDARDS.md`
- Workflow, Definition of Done: `docs/engineering/WORKFLOW.md`; testing: `docs/engineering/TESTING.md`
- **Area rules** in `.github/instructions/*.instructions.md` (i18n, API + contract, database, testing, domain, docs). Copilot attaches them automatically by path; other agents read the one for the area they change.

## How we work: Matt Pocock's skills

We work with [Matt Pocock's skills](https://github.com/mattpocock/skills), vendored in `.agents/skills/` and pinned in `.agents/skills.lock.json`. Copilot and Codex read `.agents/skills/`; Claude Code reads the same files through the `.claude/skills` symlink. Never edit a vendored skill; adapt behaviour here or in `docs/agents/`, and update the pin with `node .agents/sync-skills.mjs --update` (`WORKFLOW.md §4`).

The path of a feature (`WORKFLOW.md §3`):

1. **Align:** `/grill-with-docs` with the owner. It sharpens `GLOSSARY.md` and proposes ADRs as decisions crystallise.
2. **Spec:** `/to-spec` publishes the spec issue `[F0xx] …`. The owner reviews it on GitHub.
3. **Tickets:** `/to-tickets` cuts tracer-bullet sub-issues with blocking edges, labelled `ready-for-agent`.
4. **Build:** `/implement-spec #<spec>` works the ticket graph in parallel: an integration branch, one implementer per ticket in its own worktree, each driving `/tdd`, merged back, then `/code-review`. For one ticket or a small change, use `/implement`.
5. **PR:** the body follows `/pr`, plus one `Closes #<n>` line per issue (spec and every ticket), the check results and the Railway smoke check. The owner approves; squash merge.
6. **Clean up:** `/finish-change`.

Also: `/diagnosing-bugs` for bugs (failing test first), `/triage` for incoming issues, `/improve-codebase-architecture` every few days, `/wayfinder` for work bigger than one spec, `/prototype`, `/research`, `/retro` after a session, `/handoff` to pass work to another agent, `/ask-matt` when unsure which skill fits.

## Agent skills

### Issue tracker

Specs and tickets are GitHub issues in `thekeyvan/trainer-hub` (`gh` CLI), with Trainer Hub rules for titles, sections and slicing. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus `spec`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md`, ADRs in `docs/decisions/` (not `docs/adr/`). See `docs/agents/domain.md`.

## Repository map

| Path | What |
|---|---|
| `apps/web` | Next.js (App Router) web app; mounts the API under `/api` |
| `apps/cron` | Daily cron job (ADR-010) |
| `packages/api` | Hono + zod-openapi routes (source of the OpenAPI contract) |
| `packages/contract` | Committed `openapi.json` + generated TS / Swift / Kotlin clients |
| `packages/database` | Drizzle schema, SQL migrations, seed, typed client |
| `packages/i18n` | The only source of user-facing strings; exports native catalogs |
| `packages/email` | React Email templates + Brevo transport |
| `packages/testing` | Vitest presets, test database isolation, clock/DST helpers |
| `packages/domain`, `apps/ios`, `apps/android` | Planned (business rules from M2; native shells in E008) |

## Commands

Node 26 and pnpm (versions pinned in `package.json`). Run from the repo root; add `--filter @trainer-hub/<pkg>` for one package.

- `pnpm install`
- `pnpm lint` · `pnpm typecheck` · `pnpm check` (i18n + contract drift) · `pnpm format:check` (`pnpm fix` to apply)
- `pnpm test` (unit, no database)
- `pnpm db:up`, then `pnpm test:integration` with `TEST_DATABASE_URL` set as in `packages/database/.env.example` (real Postgres)
- `pnpm test:e2e` (Playwright, nl-NL + en, axe)
- Regenerate: `pnpm generate:contract` · `pnpm --filter @trainer-hub/i18n generate` · `pnpm db:generate --name <what>`

Details: `docs/engineering/TESTING.md §7.1`.

## Worktrees

Every branch has its own worktree under `.worktrees/` (`WORKFLOW.md §2–§3`). `/implement-spec` uses the feature branch `feature/F0xx-<slug>` as its integration branch and gives each ticket a branch `feature/F0xx-<slug>--<issue>` in `.worktrees/F0xx-<slug>--<issue>`. Set up every new worktree before working in it:

- `pnpm install`
- `cp packages/database/.env.example packages/database/.env` when the ticket touches the database or API; `pnpm db:up` starts the shared Postgres (test databases never collide)
- **A unique `E2E_PORT` per worktree** before `pnpm test:e2e`, e.g. `3100 + <issue number>`. Playwright reuses a server already running on its port, so two worktrees on the same port test each other's build.

## Non-negotiable rules

- **Every change gets its own branch and git worktree.** Never edit on `main`. One agent per worktree. Create it as `.worktrees/<slug>`; if your tool already runs the session in its own isolated worktree, use that one, but the branch still follows the naming below (`WORKFLOW.md §3`).
- **Edit guard:** a hook in `.claude/settings.json` (run by Claude Code and Copilot) blocks file edits on `main` and hand-edits of generated files and vendored skills. If it blocks you, fix the cause (switch to a worktree, or change the source and run the generator). Never get around it with shell commands.
- **Clean up after merge:** remove the worktree, delete the branch, prune, stop dev servers/simulators, remove temp files and preview resources (`WORKFLOW.md §5`).
- Branch names: `feature/F0xx-<slug>[-ios|-android]` (tickets: `…--<issue>`), `fix/…`, `chore/E0xx-<slug>`, `docs/<slug>`. Commits: Conventional Commits with the ID as scope (`feat(F031): …`). PR title: `[F031] Implement …`.
- **No hard-coded user-facing strings** on any platform. The only source is `packages/i18n/{nl-NL,en}.json`; native catalogs are generated. Keep NL and EN in parity; use the terms of `GLOSSARY.md`, worded as in `packages/i18n/GLOSSARY.md`.
- **API changes go through the OpenAPI contract**; regenerate the TS/Swift/Kotlin clients in the same PR. Never hand-edit generated code.
- Business logic lives in `packages/domain` (server-side). Native apps and web don't re-implement rules.
- Store timestamps in UTC; render with the workspace/user timezone (default Europe/Amsterdam).
- Every business record carries `organization_id`; never query business data without tenant scoping.
- Notes are trainer-only by default and may contain health data. Treat them as sensitive.
- **No real data in AI context.** Never open, paste or upload production data, real or pseudonymised pilot files, or screenshots with real data in any agent session. Use synthetic fixtures (`docs/legal/role-mapping.md`, D8).
- Mobile features need iOS **and** Android parity before they count as done.
- **Every behaviour change ships with tests** (`TESTING.md §3`). Bug fixes start with a failing test. Never delete, skip or weaken a test to get CI green.
- **Agent review stays local.** Run `/code-review` (against `CODING_STANDARDS.md` and the spec issue) before pushing. Do not add Copilot, Claude or Codex GitHub PR reviewers, review jobs, or required agent-review checks; a second local agent review is optional.
- Update the `FEATURES.md` status in the same PR as the code; the PR closes the spec issue and its tickets.
- Prefer free-tier services; don't add a paid dependency without the owner's approval.
- Don't build anything in `PRODUCT.md §53` (MVP exclusions).
