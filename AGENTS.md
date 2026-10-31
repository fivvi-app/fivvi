# Fivvi: rules for coding agents

Dutch-first, bilingual (nl-NL + en) platform for personal trainers and small gyms. Next.js web + API (Hono + zod-openapi, REST), native iOS (Swift + SwiftUI) and Android (Kotlin + Jetpack Compose), PostgreSQL (Drizzle), Better Auth. Free tiers until real clients arrive.

The product is **Fivvi** (domain `fivvi.app`: web app, booking pages and the API under `/api`). The native app for owners and trainers is **Fivvi Pro** (`apps/ios`, `apps/android`, app ID `app.fivvi.pro`); the client app (Release 1.2) will be Fivvi (`app.fivvi`). The npm scope is `@fivvi/*`.

This file is the one rule file for every agent: GitHub Copilot (VS Code and CLI) and Codex read it directly, Claude Code through `CLAUDE.md`.

| Path | What |
|---|---|
| `apps/web` | Next.js web app (mounts the API under `/api`) |
| `apps/cron` | Daily cron job |
| `apps/ios` | Native iOS app (Swift, SwiftUI), `pnpm test:ios` |
| `apps/android` | Native Android app (Kotlin, Jetpack Compose), `pnpm test:android`; see its `README.md` |
| `packages/api` | API routes (zod-openapi) |
| `packages/auth` | Better Auth configuration and the sign-in with the emailed link and code (ADR-007, F001); the only code that imports Better Auth |
| `packages/contract` | The API contract: committed `openapi.json` + generated TS/Swift/Kotlin clients |
| `packages/database` | Schema and migrations |
| `packages/design-tokens` | Design tokens: the one source of colours, type, spacing, radii and motion, generated for web, Swift and Kotlin |
| `packages/domain` | Planned: business rules (M2) |
| `packages/email` | Email templates and sending |
| `packages/i18n` | The only source of user-facing strings |
| `packages/observability` | Error reporting, product events and page views (the only TypeScript code that imports Sentry, `posthog-node` or `posthog-js`) |
| `packages/testing` | Test helpers |
| `packages/ui` | Web component kit (shadcn/ui), themed by the design tokens |
| `docs/product/` | `PRODUCT.md` (requirements), `ROADMAP.md` (milestones, decisions), `FEATURES.md` (registry and status) |
| `docs/engineering/` | `WORKFLOW.md` (flow, Definition of Done), `TESTING.md`, `ENVIRONMENTS.md`, `OBSERVABILITY.md` |
| `docs/agents/tools.md` | The owner's tools agents may use (`railway`, `gh`, iPhone, Android) and what stays with the owner |
| `GLOSSARY.md`, `docs/decisions/` | Domain language; ADRs |
| `CODING_STANDARDS.md`, `.github/instructions/` | How code is written and reviewed; rules per area |
| `.agents/skills/` | `work` (the router) plus [Matt Pocock's skills](https://github.com/mattpocock/skills), pinned in `.agents/skills.yaml` |
| `.agents/agents/`, `.codex/` | The `builder`, `reviewer` and `mechanic` agents and the model of each tier per tool (`tiers.json`); `scripts/agents.sh` generates `.claude/agents/`, `.github/agents/` and `.codex/agents/` from them. Codex project config |
| `scripts/` | `bootstrap.sh`, `flow.sh`, `issue.sh`, `wt.sh`, `pr.sh`, `risk.sh`, `check.sh`, `skills.sh`, `agents.sh`, `codex-agent.sh`, `github-settings.sh`, `test-ios.sh`, `ios-device.sh`, `android.sh`, `maestro.sh` |
| `.worktrees/<branch>/` | Git worktrees: all work happens here |

## Rules

- **Deterministic first.** If a step can be a script, make it a script and call it; don't do it by hand or by prompt.
- If a prerequisite is missing, run `scripts/bootstrap.sh` (`--api` adds Java and Swift, needed only to change the API; `--mobile` the native app toolchains).
- **Always work in a worktree** (`scripts/flow.sh start <n>` or `scripts/wt.sh add <branch>`). Never edit or commit in the main checkout; an edit guard (`.claude/settings.json`) blocks edits on `main` and of generated files and vendored skills. Never get around it with shell commands.
- Run `scripts/check.sh` before you call work done; `pr.sh create` runs it before every push.
- **No hard-coded user-facing strings** on any platform. The only source is `packages/i18n/{nl-NL,en}.json`; native catalogs are generated. NL and EN in parity, with the terms of `GLOSSARY.md` worded as in `packages/i18n/GLOSSARY.md`.
- **API changes go through the OpenAPI contract**; regenerate the TS/Swift/Kotlin clients in the same PR. Never hand-edit generated code.
- Business logic lives in `packages/domain` (server-side). Native apps and web don't re-implement rules.
- Store timestamps in UTC; render in the workspace/user time zone (default Europe/Amsterdam).
- Every business record carries `organization_id`; never query business data without tenant scoping.
- Notes are trainer-only by default and may contain health data. Treat them as sensitive.
- **No real data in AI context.** Never open, paste or upload production data, real or pseudonymised pilot files, or screenshots with real data. Synthetic data only (`docs/legal/role-mapping.md`, D8).
- Mobile features need iOS **and** Android parity before they count as done.
- **Every behaviour change ships with tests** (`docs/engineering/TESTING.md §3`), test-first. Bug fixes start with a failing test. Never delete, skip or weaken a test to get green.
- Don't guess product rules: check `docs/product/PRODUCT.md` and `GLOSSARY.md`, otherwise ask. Don't reverse an ADR without a new one. Nothing from `PRODUCT.md §53` (MVP exclusions).
- **No personal email addresses.** Commits (author, committer, `Co-authored-by`) use only GitHub noreply addresses (`git config --local user.email <id>+<login>@users.noreply.github.com`, which `scripts/bootstrap.sh` sets), and no personal or work address goes in files, PR bodies or issues; use `example.com` in examples. `scripts/check.sh` and the commit hook enforce it with an allowlist (`scripts/email-allowlist.txt`).
- Prefer free-tier services; no paid dependency without the owner's approval.

## Push and merge

- Never push to `main` or force-push shared branches. Every change goes through a PR. A ruleset on `main` enforces the PR, the CI checks and the merge queue (`WORKFLOW.md §7`, [ADR-018](docs/decisions/ADR-018-merge-queue.md)); nobody updates a branch by hand to be "up to date": the queue tests every PR on the latest `main`.
- AI may: commit and push its own branch, open a PR, push fixes for review comments, and add a **low-risk** PR to the merge queue with `scripts/pr.sh merge` ([ADR-016](docs/decisions/ADR-016-agent-merges.md), [ADR-018](docs/decisions/ADR-018-merge-queue.md)); until pilot setup also a **high-risk** PR that is not owner-only ([ADR-021](docs/decisions/ADR-021-agents-queue-high-risk.md), [ADR-023](docs/decisions/ADR-023-owner-out-of-the-per-pr-loop.md)). AI may not: approve a PR, add an owner-only PR to the queue, merge in any other way (no `gh pr merge` by hand, no `--admin`), or enable auto-merge (no `--auto`).
- Risk is decided by `scripts/risk.sh`, never by judgment, as `low`, `high` or `owner`. A PR is high-risk when it touches a path in `scripts/high-risk-paths.txt` or its issue or spec has the `owner-merge` label. It is **owner-only** (`owner`) when it touches a path of the groups guardrails (the core: these rules, the agent definitions, hooks, CI, the scripts that decide risk, gates, phases, checks and allowlists, the root `package.json` and `turbo.json`, the files that skip tests), legal, or product and decision docs, any group the file does not declare `@agent-queue`, or when its issue or spec has the `owner-only` label. The other high-risk groups (auth, tenant data, health notes, dependencies, infrastructure, tooling such as test and build configs, lint rules and native helper scripts, and billing while payments run in the payment provider's test mode) and `owner-merge` are agent-queueable until pilot setup; `billing` ends earlier, before a live payment-provider key is set. Tooling includes things that can skip tests (the Vitest and Playwright configs, the shared Vitest preset, `test-ios.sh`, `android.sh` and `maestro.sh` with the test-plan skip validation in `test-ios.sh`); the owner accepted that in ADR-023, and "never skip or weaken a test" still binds you. A change to `ROADMAP.md` or `FEATURES.md` that only ticks boxes or moves a status forward is not owner-only (`scripts/status-only.jq`). The owner adds owner-only PRs to the merge queue; at pilot setup, before real personal data enters production, the owner removes the `@agent-queue` lines and adds every high-risk PR again. A ticket PR that is owner-only because of a file the ticket does not need moves that edit to a PR of its own (`docs/agents/build.md`).
- `pr.sh merge` adds the PR to the merge queue only when the whole merge gate holds: not owner-only, every check passed on the head commit, the `reviewer` (both `code-review` axes) clean on it, the preview smoke-checked, no open threads, ready for review, and the merge queue has not removed that commit. When it refuses, it records the refusal on the PR for the head commit and the PR stays for the owner; never work around it or retry it on that commit. For a high-risk PR it first records `**High-risk agent merge:**` with the commit and the reasons in the PR body; the owner reads those after the fact (`flow.sh next`). GitHub then tests the PR on the latest `main` and squash-merges it. If the queue removes it (`flow.sh status`: `queue-removed`), fix a cause in the PR and push. For a cause outside the PR (a flaky or broken check that also fails elsewhere) of a PR an agent may queue (low or high risk) file or find the bug, block the PR's issue with it (`issue.sh block <n> --by <bug>`), build the bug first, and once it is closed as completed queue the same commit once more with `scripts/pr.sh merge <pr> --after <bug>` ([ADR-025](docs/decisions/ADR-025-requeue-after-a-fix.md)); a commit removed again after that, an owner-only PR and one the gate refused on its head commit go to the owner. Never queue the same commit again in any other way yourself.
- Open or update PRs only with `scripts/pr.sh create` (draft, runs `scripts/check.sh`, pushes, adds `Closes #<issue>`). Record a clean self-review with `scripts/pr.sh reviewed` and the Railway preview with `scripts/pr.sh smoke`, both for the head commit; publish with `scripts/pr.sh ship`; the `work` skill's **Ship** section has the steps.
- Branch: `<type>/<issue>-<slug>` (type `feature`, `fix`, `chore` or `docs`), or `<type>/<slug>` without an issue. Commits: Conventional Commits with the feature ID as scope, `feat(F031): hold a spot` (a commit hook checks it). PR title: the issue title, `[F031] …`. One ticket per PR; squash merge.
- After GitHub has merged it (`flow.sh status <n>` says `merged`; a queued PR is not merged yet): `scripts/flow.sh finish <n>` from the main checkout.
- Agent review stays local: the high-tier `reviewer` subagent runs Matt's `code-review` (standards and spec axes) before the PR, and again after every push. The builder never reviews its own work, and only the `reviewer` can call a review clean. No Copilot, Claude or Codex reviewers or review jobs in GitHub.

## Agent skills

**For any delivery request (an idea, an issue, a bug, a PR, "what's next"), follow `.agents/skills/work/SKILL.md`.** It routes each step to the vendored skill or script that does it, so the user only has to talk. Its first command is always `scripts/flow.sh status <n>` for an issue, or `scripts/flow.sh next`; act on the `Phase` and `Next` it prints, never on memory.

`work` is ours. The other skills are vendored: never edit them; change their behaviour in `docs/agents/`. Update them with `scripts/skills.sh update`. Copilot and Codex read `.agents/skills/`; Claude Code reads it through the `.claude/skills` symlink. The agent definitions are generated per tool: `.claude/agents/` (Claude Code), `.github/agents/` (Copilot), `.codex/agents/` (Codex).

### Model tiers

Work is routed to a model tier in every tool: the high tier shapes (the main conversation) and does **every code review** (`reviewer`), the mid tier builds and fixes (`builder`), the small tier does mechanical work (`mechanic`). The models of each tier and tool are in the table in `docs/agents/build.md`, **Tiers**.

The `work` skill starts the `builder`, then the `reviewer` on the head commit, then a `builder` for the findings (at most two fix rounds, then a review-only round). Change a model in `.agents/agents/tiers.json`, never in a generated file, and run `scripts/agents.sh sync`; Codex also needs the repo trusted in `~/.codex/config.toml` (`docs/agents/codex-model-tiers.md`).

### Building

How a ticket is built (`implement`, `tdd`) and reviewed (`code-review`) here. See `docs/agents/build.md`.

### Issue tracker

GitHub issues via `scripts/issue.sh`: spec = issue labelled `spec`, ticket = sub-issue, blocked by = native dependency. Tickets are cut and built only for a spec the owner approved with `spec-approved`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five defaults (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus `spec`, `spec-approved`, `owner-merge` (high-risk work, agent-queueable) and `owner-only` (only the owner merges). See `docs/agents/triage-labels.md`.

### Domain docs

Single context: `GLOSSARY.md` and `docs/decisions/` (not `docs/adr/`). See `docs/agents/domain.md`.
