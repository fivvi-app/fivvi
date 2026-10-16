# Trainer Hub: rules for coding agents

Dutch-first, bilingual (nl-NL + en) platform for personal trainers and small gyms. Next.js web + API (Hono + zod-openapi, REST), native iOS (Swift + SwiftUI) and Android (Kotlin + Jetpack Compose), PostgreSQL (Drizzle), Better Auth. Free tiers until real clients arrive.

This file is the one rule file for every agent: GitHub Copilot (VS Code and CLI) and Codex read it directly, Claude Code through `CLAUDE.md`.

| Path | What |
|---|---|
| `apps/web`, `apps/cron` | Next.js web app (mounts the API under `/api`); daily cron job |
| `packages/api`, `packages/contract` | API routes (zod-openapi); committed `openapi.json` + generated TS/Swift/Kotlin clients |
| `packages/database`, `packages/i18n`, `packages/email`, `packages/observability`, `packages/testing` | Schema and migrations; the only source of user-facing strings; email; error reporting, product events and page views (the only code that imports Sentry, `posthog-node` or `posthog-js`); test helpers |
| `apps/ios` | Native iOS app (Swift, SwiftUI), `pnpm test:ios` |
| `apps/android` | Native Android app (Kotlin, Jetpack Compose), `pnpm test:android`; see its `README.md` |
| `packages/domain` | Planned: business rules (M2) |
| `docs/product/` | `PRODUCT.md` (requirements), `ROADMAP.md` (milestones, decisions), `FEATURES.md` (registry and status) |
| `docs/engineering/` | `WORKFLOW.md` (flow, Definition of Done), `TESTING.md`, `ENVIRONMENTS.md`, `OBSERVABILITY.md` |
| `GLOSSARY.md`, `docs/decisions/` | Domain language; ADRs |
| `CODING_STANDARDS.md`, `.github/instructions/` | How code is written and reviewed; rules per area |
| `.agents/skills/` | `work` (the router) plus [Matt Pocock's skills](https://github.com/mattpocock/skills), pinned in `.agents/skills.yaml` |
| `scripts/` | `bootstrap.sh`, `flow.sh`, `issue.sh`, `wt.sh`, `pr.sh`, `risk.sh`, `check.sh`, `skills.sh`, `github-settings.sh`, `test-ios.sh`, `android.sh`, `maestro.sh` |
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
- Prefer free-tier services; no paid dependency without the owner's approval.

## Push and merge

- Never push to `main` or force-push shared branches. Every change goes through a PR. A ruleset on `main` enforces the PR, the CI checks and an up-to-date branch (`WORKFLOW.md §7`).
- AI may: commit and push its own branch, open a PR, push fixes for review comments, and merge a **low-risk** PR with `scripts/pr.sh merge` ([ADR-016](docs/decisions/ADR-016-agent-merges.md)). AI may not: approve a PR, merge a high-risk PR, merge in any other way, or enable auto-merge.
- Risk is decided by `scripts/risk.sh`, never by judgment: a PR is high-risk when it touches a path in `scripts/high-risk-paths.txt` (auth, tenant data, health notes, legal, billing, product and decision docs, these guardrails, dependencies and infrastructure) or its issue or spec has the `owner-merge` label. The owner merges high-risk PRs.
- `pr.sh merge` merges only when the whole merge gate holds: low-risk, every check passed on the head commit, both `code-review` axes clean on it, the preview smoke-checked, up to date with `main`, no open threads, ready for review. When it refuses, it records the refusal on the PR for the head commit and the PR stays for the owner; never work around it or retry it on that commit.
- Open or update PRs only with `scripts/pr.sh create` (draft, runs `scripts/check.sh`, pushes, adds `Closes #<issue>`). Record a clean self-review with `scripts/pr.sh reviewed` and the Railway preview with `scripts/pr.sh smoke`, both for the head commit; publish with `scripts/pr.sh ready`.
- Branch: `<type>/<issue>-<slug>` (type `feature`, `fix`, `chore` or `docs`), or `<type>/<slug>` without an issue. Commits: Conventional Commits with the feature ID as scope, `feat(F031): hold a spot` (a commit hook checks it). PR title: the issue title, `[F031] …`. One ticket per PR; squash merge.
- After the merge: `scripts/flow.sh finish <n>` from the main checkout.
- Agent review stays local: Matt's `code-review` (standards and spec axes) before the PR, and again after every push. No Copilot, Claude or Codex reviewers or review jobs in GitHub.

## Agent skills

**For any delivery request (an idea, an issue, a bug, a PR, "what's next"), follow `.agents/skills/work/SKILL.md`.** It routes each step to the vendored skill or script that does it, so the user only has to talk. Its first command is always `scripts/flow.sh status <n>` for an issue, or `scripts/flow.sh next`; act on the `Phase` and `Next` it prints, never on memory.

`work` is ours. The other skills are vendored: never edit them; change their behaviour in `docs/agents/`. Update them with `scripts/skills.sh update`. Copilot and Codex read `.agents/skills/`; Claude Code reads it through the `.claude/skills` symlink.

### Building

How `implement`, `tdd` and `code-review` run here. See `docs/agents/build.md`.

### Issue tracker

GitHub issues via `scripts/issue.sh`: spec = issue labelled `spec`, ticket = sub-issue, blocked by = native dependency. Tickets are cut and built only for a spec the owner approved with `spec-approved`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five defaults (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus `spec`, `spec-approved` and `owner-merge`. See `docs/agents/triage-labels.md`.

### Domain docs

Single context: `GLOSSARY.md` and `docs/decisions/` (not `docs/adr/`). See `docs/agents/domain.md`.
