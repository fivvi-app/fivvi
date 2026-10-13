# Trainer Hub: rules for coding agents

Dutch-first, bilingual (nl-NL + en) platform for personal trainers and small gyms.
Stack: Next.js web + API (Hono + zod-openapi, REST), native iOS (Swift + SwiftUI), native Android (Kotlin + Jetpack Compose), PostgreSQL (Drizzle), Better Auth. Free tiers until real clients arrive.

This file is the single source of agent rules for every tool we use: GitHub Copilot (VS Code, CLI and cloud agent) and Codex read it directly; Claude Code reads it through `CLAUDE.md`. Don't copy these rules into tool-specific files; link here instead.

## Read first

- Requirements: `docs/product/PRODUCT.md`
- Sequencing, milestones, ADRs, gates: `docs/product/ROADMAP.md`
- Feature status: `docs/product/FEATURES.md`; the feature doc in `docs/features/`
- Workflow, agent rules, Definition of Done: `docs/engineering/WORKFLOW.md`
- What to test, where and how: `docs/engineering/TESTING.md`
- The ADRs for the area you touch: `docs/decisions/`
- **Area rules** in `.github/instructions/*.instructions.md` (i18n, API + contract, database, testing, domain, docs). Copilot attaches them automatically by path; other agents read the one for the area they change.

## Workflow skills

`.agents/skills/` holds the steps of every change: `start-change` (branch, worktree, spec, Test plan), `local-review` (checks and review checklist before pushing) and `finish-change` (cleanup after merge). Copilot and Codex offer them as skills; in Claude Code, read the `SKILL.md` and follow it.

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

## Non-negotiable rules

- **Every change gets its own branch and git worktree.** Never edit on `main`. One agent per worktree. Create it as `.worktrees/<slug>`; if your tool already runs the session in its own isolated worktree, use that one, but the branch still follows the naming below (`WORKFLOW.md §3`).
- **Edit guard:** a hook in `.claude/settings.json` (run by Claude Code and Copilot) blocks file edits on `main` and hand-edits of generated files. If it blocks you, fix the cause (switch to a worktree, or change the source and run the generator). Never get around it with shell commands.
- **Clean up after merge:** remove the worktree, delete the branch, prune, stop dev servers/simulators, remove temp files and preview resources (`WORKFLOW.md §5`).
- Branch names: `feature/F0xx-<slug>[-ios|-android]`, `fix/…`, `chore/E0xx-<slug>`, `docs/<slug>`. Commits: Conventional Commits with the ID as scope (`feat(F031): …`). PR title: `[F031] Implement …`.
- **No hard-coded user-facing strings** on any platform. The only source is `packages/i18n/{nl-NL,en}.json`; native catalogs are generated. Keep NL and EN in parity; use `packages/i18n/GLOSSARY.md` terminology.
- **API changes go through the OpenAPI contract**; regenerate the TS/Swift/Kotlin clients in the same PR. Never hand-edit generated code.
- Business logic lives in `packages/domain` (server-side). Native apps and web don't re-implement rules.
- Store timestamps in UTC; render with the workspace/user timezone (default Europe/Amsterdam).
- Every business record carries `organization_id`; never query business data without tenant scoping.
- Notes are trainer-only by default and may contain health data. Treat them as sensitive.
- **No real data in AI context.** Never open, paste or upload production data, real or pseudonymised pilot files, or screenshots with real data in any agent session. Use synthetic fixtures (`docs/legal/role-mapping.md`, D8).
- Mobile features need iOS **and** Android parity before they count as done.
- **Every behaviour change ships with tests** (`TESTING.md §3`). Bug fixes start with a failing test. Never delete, skip or weaken a test to get CI green.
- **Agent review stays local.** Review changes against `WORKFLOW.md §4` before pushing. Do not add Copilot, Claude or Codex GitHub PR reviewers, review jobs, or required agent-review checks; a second local agent review is optional.
- Update the feature doc and `FEATURES.md` status in the same PR as the code.
- Prefer free-tier services; don't add a paid dependency without the owner's approval.
- Don't build anything in `PRODUCT.md §53` (MVP exclusions).
