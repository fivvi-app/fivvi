# Engineering Workflow

How every change gets from idea to `main`, and how we clean up afterwards. It applies equally to every AI coding agent (GitHub Copilot, Claude Code, Codex) and to humans.

## 1. Golden rules

1. **Never commit directly to `main`.** `main` is always deployable.
2. **One change = one branch = one worktree.** No exceptions, including docs and small fixes.
3. **Clean up when the change is merged.** A finished change leaves no worktree, no branch and no running process behind.
4. **Both languages, every platform the feature touches, or it isn't done.** See the Definition of Done (§6).

## 2. Branch naming

| Type | Pattern | Example |
|---|---|---|
| Feature | `feature/F0xx-<slug>` | `feature/F031-open-gym-booking` |
| Platform slice of a feature | `feature/F0xx-<slug>-ios` / `-android` | `feature/F043-live-logging-ios` |
| Fix | `fix/F0xx-<slug>` or `fix/<slug>` | `fix/F029-hold-expiry-race` |
| Engineering enabler | `chore/E0xx-<slug>` | `chore/E002-ci-pipeline` |
| Docs | `docs/<slug>` | `docs/roadmap` |

- **Issue title:** `[F031] Open Gym public booking`
- **PR title:** `[F031] Implement Open Gym public booking`
- **Commits:** Conventional Commits with the ID as scope, e.g. `feat(F031): hold spot during verification`

## 3. Lifecycle of a change

```bash
# 1. Start from an up-to-date main
git switch main && git pull --ff-only        # (pull once a remote exists)

# 2. Create branch + worktree together
git worktree add .worktrees/F031-open-gym-booking -b feature/F031-open-gym-booking

# 3. Work only inside the worktree
cd .worktrees/F031-open-gym-booking
pnpm install

# 4. Commit in small steps, then open a PR
git push -u origin feature/F031-open-gym-booking
```

- Worktrees live in `.worktrees/<slug>` (git-ignored). The slug is the branch name without the type prefix.
- If an agent tool already isolates its session in a worktree of its own (for example a Copilot or Claude Code background session), work in that worktree instead of creating a second one. Rename its branch to the pattern in §2 (`git branch -m <name>`) before the first push, and clean it up the same way after merge (§5).
- Write the feature doc's **Test plan** before implementing, and put the local test results in the PR description (`TESTING.md`).
- Update the feature doc and the `FEATURES.md` status **in the same PR**.
- An API change regenerates `packages/contract` (OpenAPI + TS/Swift/Kotlin clients) in the same PR.
- A string change edits only `packages/i18n/*.json` and regenerates the native catalogs in the same PR.
- Every PR gets a Railway preview (a PR environment with its own migrated and seeded Postgres). Smoke-check its URL and put the result in the PR description. Merging to `main` deploys production. Environments, deploys, rollback and variables: [`ENVIRONMENTS.md`](ENVIRONMENTS.md).
- Merge strategy: **squash merge** into `main` after the applicable deterministic CI checks (§7) are green and the owner approves. Agent review happens locally before the PR and is not a GitHub merge requirement.

## 4. Working with AI agents

- **One agent per worktree.** Two agents never share a worktree or a branch.
- **Parallel work limit:** at most 3–4 open worktrees at once, to limit merge conflicts and review load.
- **Before starting, an agent reads:** `AGENTS.md`, the relevant feature spec in `docs/features/`, and the relevant ADRs.
- **Agent instructions live in one place.** `AGENTS.md` holds the rules for every agent; `CLAUDE.md` only imports it. Area rules live in `.github/instructions/*.instructions.md`: Copilot attaches them by path (`applyTo`), other agents read the one for the area they change. Don't copy rules into tool-specific files; update the shared file instead.
- **Workflow skills.** `.agents/skills/` turns §3–§5 into steps an agent can follow: `start-change`, `local-review` and `finish-change`. Copilot and Codex load them as skills; Claude Code reads the `SKILL.md` files through `AGENTS.md`. When this workflow changes, update the skills in the same PR.
- **Edit guard.** `.claude/settings.json` registers a `PreToolUse` hook, [`.claude/hooks/guard-edits.mjs`](../../.claude/hooks/guard-edits.mjs), that Claude Code and Copilot (CLI and Copilot sessions in VS Code) both run before every file edit. It denies edits in a checkout on `main` (git-ignored files such as `.env` stay editable) and hand-edits of generated files: `openapi.json` and the generated clients in `packages/contract`, `packages/i18n/generated/` and `packages/database/migrations/meta/`. It covers the agents' edit tools, not shell commands, and only runs in folders the tool trusts. Codex and the VS Code Local agent don't run it. Its tests run in `pnpm test`.
- **Local review:** before pushing, the author checks correctness, tenant isolation, i18n, platform parity and test quality (`TESTING.md §9`). A second agent may review locally when useful, but it is optional. Fix findings on the branch before the PR.
- **No agent review in GitHub CI/CD:** do not add Copilot code review, Claude or Codex review jobs, bot PR reviewers, required agent-review status checks or required cross-agent approvals. GitHub CI is for deterministic checks such as tests, lint, generated-file drift and security scans.
- **Small PRs:** one feature or one platform slice per PR. Split anything that touches backend + iOS + Android heavily into contract PR → platform PRs.
- **No silent contract breaks:** after a contract freeze (end of M4, end of M7), API changes are additive only.
- **Agents never** push to `main`, force-push shared branches, commit secrets, or edit generated files by hand.

## 5. Cleanup checklist (after merge)

Run from the **main checkout**, not from inside the worktree:

```bash
git switch main && git pull --ff-only
git worktree remove .worktrees/F031-open-gym-booking
git branch -D feature/F031-open-gym-booking          # -D is required after a squash merge; verify it's merged first
git push origin --delete feature/F031-open-gym-booking
git worktree prune
git fetch --prune
```

Also make sure that:

- [ ] Dev servers, watchers, simulators/emulators and Docker containers started for this change are stopped.
- [ ] Temporary files, scratch scripts and debug output are deleted (never committed).
- [ ] The Railway PR environment for this change is gone (it is deleted automatically on merge/close; check anyway). Scratch Railway services or environments created for the change are deleted ([`ENVIRONMENTS.md`](ENVIRONMENTS.md)).
- [ ] `FEATURES.md` shows the new status; the feature doc lists its implementation references (PR link).
- [ ] `git worktree list` shows only the worktrees for changes still in progress.

## 6. Definition of Done

From `PRODUCT.md §86`, extended for native apps. A user-facing feature is **not done** unless:

- [ ] Web behaviour works where required
- [ ] iOS **and** Android behaviour works where required (parity: same screens and states on both)
- [ ] Permissions are correct (Owner / Admin / Trainer / Client)
- [ ] Tenant isolation holds (covered by the isolation suite)
- [ ] Dutch UI exists and has passed the local copy review against `GLOSSARY.md`
- [ ] English UI exists
- [ ] Dates/times localize correctly (nl-NL: `22 september 2026`, `18:00`, Europe/Amsterdam)
- [ ] Relevant emails exist in nl-NL and en
- [ ] No hard-coded user-facing strings (CI enforced)
- [ ] Generated contract and string catalogs are up to date (CI enforced)
- [ ] Tests cover the acceptance criteria per the feature's Test plan and the checklist in [`TESTING.md §3`](TESTING.md) (e2e runs in both locales for user flows)
- [ ] Local review checklist completed
- [ ] Feature documentation updated
- [ ] Feature registry status updated
- [ ] Acceptance criteria pass
- [ ] Cleanup checklist (§5) completed after merge

## 7. CI and required checks

CI is GitHub Actions ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)). It runs on every pull request and every push to `main`. A new push to a PR cancels that PR's previous run; runs on `main` are never cancelled.

| Check (job name) | Runner | Runs when | What it does |
|---|---|---|---|
| `Detect changes` | Linux | Always | Works out which native jobs need to run. Required because a skipped job counts as passed: if this job broke, the native jobs would pass without running |
| `Checks (Linux)` | Linux | Always | `pnpm install`, then one `turbo run lint typecheck test test:integration build format:check check` with the turbo cache. Integration tests run against a Postgres 18 service container (`TEST_DATABASE_URL`) |
| `E2E (Linux)` | Linux | Always | Builds `apps/web` and runs the Playwright specs in nl-NL and en with axe checks (`turbo run test:e2e`). Chromium is cached per Playwright version; the report is uploaded when the job fails |
| `iOS` | macOS | `apps/ios/**` or `packages/contract/**` changed **and** `apps/ios` exists | Placeholder until E008 adds the build and tests. macOS minutes count 10× (`ROADMAP.md §12`) |
| `Android` | Linux | `apps/android/**` or `packages/contract/**` changed **and** `apps/android` exists | Placeholder until E008 adds the build and tests |

**Intended required checks on `main`:** all five jobs above. Branch protection and rulesets aren't available for this private repo on the current GitHub plan, so nothing enforces them yet. Until then, the owner only merges when all five show as passed or skipped. When the plan allows it, add exactly these job names as required status checks. Renaming a job renames its check, so change this table in the same PR.

**Adding a check:** a new deterministic check (i18n parity, ICU syntax, OpenAPI drift, generated files up to date, …) is a `check` script in the package that owns it. `turbo run check` in `Checks (Linux)` picks it up, so the workflow file doesn't change. Keep `Checks (Linux)` under ~10 minutes (`TESTING.md §7`).

**Native jobs:** until E008, `iOS` and `Android` skip cleanly. If `apps/ios` or `apps/android` exists while its job is still the placeholder, the job fails on purpose, so a native project can't land without real CI. E008 replaces the placeholder steps and keeps the job names.
