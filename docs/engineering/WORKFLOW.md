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
| Ticket of a feature (`[F0xx]`) | `feature/<issue>-<slug>` | `feature/57-hold-a-spot` |
| Bug | `fix/<issue>-<slug>` | `fix/63-hold-expiry-race` |
| Ticket of an enabler (`[E0xx]`), tooling | `chore/<issue>-<slug>` or `chore/<slug>` | `chore/71-ci-cache` |
| Docs | `docs/<slug>` | `docs/roadmap` |

`scripts/flow.sh start <n>` picks the name from the issue; `scripts/wt.sh add` refuses anything else.

- **Spec issue title:** `[F031] Open Gym public booking`; ticket titles `[F031] <slice>` (`docs/agents/issue-tracker.md`)
- **PR title:** the ticket's title, `[F031] Hold a spot during verification` (`pr.sh create` sets it)
- **Commits:** Conventional Commits with the ID as scope, e.g. `feat(F031): hold a spot during verification` (the `.githooks/commit-msg` hook checks it)

## 3. Lifecycle of a change

We follow [Matt Pocock's skills](https://github.com/mattpocock/skills). The owner only talks; the `work` skill (`.agents/skills/work/SKILL.md`) routes each step to Matt's skills and our scripts. `scripts/flow.sh status <n>` tells it where an issue is and what comes next, so a fresh session can always pick up.

| Step | Skill | Script | Result | Who decides |
|---|---|---|---|---|
| 1. Align | `grill-with-docs` | | Shared understanding; `GLOSSARY.md` and ADR proposals updated | Owner answers |
| 2. Spec | `to-spec` | `issue.sh create spec` | Spec issue `[F0xx] …`: ACs (NL/EN), Test plan, platforms, languages | Owner reviews on GitHub and approves with the `spec-approved` label |
| 3. Tickets | `to-tickets` | `issue.sh create ticket --parent --blocked-by` | Tracer-bullet sub-issues with blocking edges, `ready-for-agent` | Agents, only for an approved spec |
| 4. Build | `implement` (`tdd`, then `code-review`) in a fresh subagent, by `docs/agents/build.md` | `flow.sh start`, `check.sh` | One ticket per worktree, at most three in parallel, test-first, self-reviewed | Agents |
| 5. Ship | `pr` | `pr.sh create`, `reviewed`, `wait`, `smoke`, `ready`, `merge` | One draft → ready PR per ticket that `Closes #<n>`, CI green, self-review and preview smoke check recorded for the head commit, squash-merged | Agents merge low-risk PRs through the merge gate; the owner merges high-risk ones (§4) |
| 6. Clean up | | `flow.sh finish` | No worktree or branch left; the spec's next ready tickets | Agent |

Tickets that aren't agent-ready and bugs go through `triage`; bugs also through `diagnosing-bugs` (failing test first). `implement-spec` (one integration branch for a whole spec) stays available when the owner asks for it.

- Every branch has its own worktree in `.worktrees/` (git-ignored); `scripts/wt.sh add` creates it, installs dependencies and `packages/database/.env`. `scripts/check.sh` gives each worktree its own `E2E_PORT` (3200–3899), because Playwright reuses a server already running on its port. The page view tests use a second server on `E2E_PORT + 1000`, outside that range.
- If an agent tool already isolates its session in a worktree of its own (for example a Copilot or Claude Code background session), work there instead of creating a second one, with a branch named as in §2 (`git branch -m <name>`).
- The spec's **Test plan** is written before implementing (`TESTING.md §6`).
- A ticket PR changes only its feature's `FEATURES.md` Status: the spec's first ticket sets `IN PROGRESS`, the PR that completes the spec `IMPLEMENTED` with the final one-line summary, and the others leave the file alone (`flow.sh` prints the hint). Progress lives in the spec's tickets, not in the row. The feature's ID links the spec issue.
- An API change regenerates `packages/contract` (OpenAPI + TS/Swift/Kotlin clients) in the same PR. A string change edits only `packages/i18n/*.json` and regenerates the native catalogs in the same PR.
- Every PR that touches a Railway watch pattern gets a preview (its own migrated and seeded Postgres); `pr.sh smoke` checks it and records the result in the PR description. Merging to `main` deploys production ([`ENVIRONMENTS.md`](ENVIRONMENTS.md)).
- Merge strategy: **squash merge** into `main`, the only method the repo allows, after the required CI checks (§7) pass. Who merges depends on the PR's risk (§4).

## 4. Working with AI agents

- **One agent per worktree.** Two agents never share a worktree or a branch.
- **Parallel work:** at most three tickets in progress at once (`flow.sh start` refuses a fourth), to limit merge conflicts and the owner's review load.
- **Agent instructions live in one place.** `AGENTS.md` holds the rules for every agent; `CLAUDE.md` only imports it. Area rules live in `.github/instructions/*.instructions.md`: Copilot attaches them by path (`applyTo`), other agents read the one for the area they change.
- **Skills.** `.agents/skills/` holds our `work` skill and Matt Pocock's skills, vendored by `scripts/skills.sh` at the commit pinned in `.agents/skills.yaml` (each has a `.upstream` marker; MIT licence in `.agents/LICENSE.mattpocock-skills`). We add no agents or skills of our own that do what one of Matt's does; repo specifics go in `docs/agents/` (`build.md` for building and review). Copilot and Codex read `.agents/skills/`; Claude Code reads it through the `.claude/skills` symlink. Never edit a vendored skill (the edit guard and `pnpm check` catch it): adapt behaviour in `AGENTS.md` or `docs/agents/`. To take Matt's latest version, run `scripts/skills.sh update` on a `chore/` branch and review the diff like code.
- **Scripts first.** Repetitive steps are scripts in `scripts/` (`AGENTS.md`); agents call them instead of doing the steps by hand. `scripts/bootstrap.sh` installs what they need.
- **Edit guard.** `.claude/settings.json` registers a `PreToolUse` hook, [`.claude/hooks/guard-edits.mjs`](../../.claude/hooks/guard-edits.mjs), that Claude Code and Copilot (CLI and Copilot sessions in VS Code) both run before every file edit. It denies edits in a checkout on `main` (git-ignored files such as `.env` stay editable), hand-edits of generated files (`openapi.json` and the generated clients in `packages/contract`, `packages/i18n/generated/`, the web, Swift and Kotlin outputs of `packages/design-tokens`, `packages/database/migrations/meta/`) and of vendored skills. It covers the agents' edit tools, not shell commands, and only runs in folders the tool trusts. Codex and the VS Code Local agent don't run it. Its tests run in `pnpm test`.
- **Local review:** before the PR, `code-review` checks the diff on two axes in parallel subagents, one against `CODING_STANDARDS.md`, one against the ticket and spec (`docs/agents/build.md`). Findings are fixed on the branch. When both are clean, `pr.sh reviewed` records it in the PR body for the head commit; any later push makes the record stale, so review again.
- **Spec approval:** the owner approves a spec with the `spec-approved` label. Only then are its tickets cut and built (`flow.sh` reports `needs-approval` before). A material change to an approved spec removes the label (`issue.sh update`, unless `--minor` for a typo fix), so the owner approves again.
- **Who merges** ([ADR-016](../decisions/ADR-016-agent-merges.md)): `scripts/risk.sh` classifies each PR from its changed paths (`scripts/high-risk-paths.txt`) and the `owner-merge` label on its issue or spec. Agents merge a low-risk PR with `pr.sh merge`, which squash-merges and deletes the branch only when every condition holds: low-risk, every check passed on the head commit, both `code-review` axes clean on it, `pr.sh smoke` recorded for the head commit that the preview passed or that there is none, the branch up to date with `main`, no unresolved threads, ready for review. Otherwise it merges nothing, records the refusal and its reasons in the PR body for the head commit, and the PR waits for the owner, as every high-risk PR does; agents don't retry it on that commit, and a new push makes the refusal stale. A branch that is only behind `main` is the exception: nothing is recorded, the agent merges `main` in and runs the gate again on the new commit. Until G2 an agent merge is also a production release; from G2 the owner approves production releases separately (`ROADMAP.md` M4).
- **Run the factory:** when the owner says so, the `work` skill builds, ships and merges every ready ticket, at most three at a time, until only owner items are left: specs to approve, high-risk PRs, refused PRs, `needs-info` questions (`flow.sh next`). This runs locally; running it unattended in GitHub Actions is a later decision.
- **No agent review in GitHub CI/CD:** do not add Copilot code review, Claude or Codex review jobs, bot PR reviewers, required agent-review status checks or required cross-agent approvals. GitHub CI is for deterministic checks such as tests, lint, generated-file drift and security scans.
- **Small PRs:** one ticket per PR. A spec that touches backend + iOS + Android heavily gets a contract ticket that blocks the platform tickets.
- **No silent contract breaks:** after a contract freeze (end of M4, end of M7), API changes are additive only.
- **Agents never** approve a PR, push to `main`, force-push shared branches, merge outside `pr.sh merge`, commit secrets, or edit generated files by hand.

## 5. Cleanup checklist (after merge)

`scripts/flow.sh finish <n>`, from the **main checkout**, checks that the PR is merged and the local branch holds nothing more, then removes the worktree, the local and remote branch and the ticket's notes, updates `main`, closes the issue if the PR didn't, and reports what the spec needs next.

Also make sure that:

- [ ] Dev servers, watchers, simulators/emulators and Docker containers started for this change are stopped.
- [ ] Temporary files, scratch scripts and debug output are deleted (never committed).
- [ ] Scratch Railway services or environments created for the change are deleted ([`ENVIRONMENTS.md`](ENVIRONMENTS.md)); the PR environment is deleted automatically on merge.
- [ ] When the last ticket of a spec is merged: `FEATURES.md` shows `IMPLEMENTED` with the final one-line summary, and the spec issue is closed (`flow.sh status <spec>` says `complete`, then `done`).

## 6. Definition of Done

From `PRODUCT.md §86`, extended for native apps. A user-facing feature is **not done** unless:

- [ ] Web behaviour works where required
- [ ] iOS **and** Android behaviour works where required (parity: same screens and states on both)
- [ ] Permissions are correct (Owner / Admin / Trainer / Client)
- [ ] Tenant isolation holds (covered by the isolation suite)
- [ ] Dutch UI exists and has passed the local copy review against `packages/i18n/GLOSSARY.md`
- [ ] English UI exists
- [ ] Dates/times localize correctly (nl-NL: `22 september 2026`, `18:00`, Europe/Amsterdam)
- [ ] Relevant emails exist in nl-NL and en
- [ ] No hard-coded user-facing strings (CI enforced)
- [ ] Generated contract and string catalogs are up to date (CI enforced)
- [ ] Tests cover the acceptance criteria per the spec issue's Test plan and the checklist in [`TESTING.md §3`](TESTING.md) (e2e runs in both locales for user flows)
- [ ] Self-review (`code-review`, both axes) completed and findings fixed (`CODING_STANDARDS.md`)
- [ ] Spec issue up to date with what was built (ACs, languages, platforms)
- [ ] Feature registry status updated
- [ ] Acceptance criteria pass
- [ ] Cleanup (§5) completed after merge

## 7. CI and required checks

CI is GitHub Actions ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)). It runs on every pull request, every push to `main` and on demand (`workflow_dispatch`). A new push to a PR cancels that PR's previous run; runs on `main` are never cancelled.

| Check (job name) | Runner | Runs when | What it does |
|---|---|---|---|
| `Detect changes` | Linux | Always | Works out which native jobs need to run ([`scripts/native-jobs.sh`](../../scripts/native-jobs.sh)). Required because a skipped job counts as passed: if this job broke, the native jobs would pass without running |
| `Checks (Linux)` | Linux | Always | `pnpm install`, then one `turbo run lint typecheck test test:integration build format:check check` with the turbo cache. Integration tests run against a Postgres 18 service container (`TEST_DATABASE_URL`). The contract drift check is cached like the other tasks, so it only runs when the API, a generator or the generated clients change; its generator tools are cached per version ([`packages/contract/README.md`](../../packages/contract/README.md#drift-check)) |
| `E2E (Linux)` | Linux | Always | Builds `apps/web` and runs the Playwright specs in nl-NL and en with axe checks (`turbo run test:e2e`). Each e2e server runs on its own migrated database on a Postgres 18 service container (`TEST_DATABASE_URL`). Chromium is cached per Playwright version; the report is uploaded when the job fails |
| `iOS` | macOS | See "Native jobs" below | `pnpm test:ios`'s script on `macos-26` with Xcode 26.6 ([`apps/ios/README.md`](../../apps/ios/README.md#tests)): SwiftLint, one `build-for-testing`, then the unit and UI tests in nl and en without building again, at the same time on two simulators. One job rather than a matrix per locale, so the check keeps its name and both locales share the build. DerivedData and the Swift packages are cached by `Package.resolved`, the Xcode version and the runner OS. Prints the build timing summary and the slowest tests; uploads both locales' test results when it fails |
| `Android` | Linux | See "Native jobs" below | Frees disk space for the emulator, then `pnpm test:android` (ktlint with the literal-text and colour rules, build, unit tests, Compose UI tests on a KVM emulator), then `pnpm test:maestro` (Postgres, migrate, seed, the web server and the Maestro flows in nl-NL and en) ([`apps/android/README.md`](../../apps/android/README.md)). The emulator boots from a cached snapshot of the AVD (keyed by system image, emulator and settings), or cold when there is none or it doesn't load. Reports and the emulator log are uploaded on every run, also after a cancel |

**Required checks on `main`:** all five jobs above, enforced by the ruleset in [`.github/rulesets/main.json`](../../.github/rulesets/main.json). It also requires a PR and a branch that is up to date with `main`, and blocks force-pushes and deletion; the repo allows squash merges only ([`.github/repo-settings.json`](../../.github/repo-settings.json)). `scripts/github-settings.sh apply` applies both, and can be run again at any time. Renaming a job renames its check, so change this table and the ruleset in the same PR and apply it after the merge (a test compares the ruleset with `ci.yml`).

**Adding a check:** a new deterministic check (i18n parity, ICU syntax, OpenAPI drift, generated files up to date, …) is a `check` script in the package that owns it. `turbo run check` in `Checks (Linux)` picks it up, so the workflow file doesn't change. Keep `Checks (Linux)` under ~10 minutes (`TESTING.md §7`).

**Native jobs:** `iOS` and `Android` run in a PR, or a push to `main`, that touches the app, its generated inputs (client, string catalogs, design tokens) or its own scripts, the exact paths being those in [`scripts/native-jobs.sh`](../../scripts/native-jobs.sh), and only when `apps/ios` or `apps/android` exists. A skipped job counts as passed. Shared files (`.github/workflows/ci.yml`, `scripts/_lib.sh`) don't run them on their own. A push to `main` that touches none of those paths skips them. To run them anyway, add the `run-native` label to the PR before you push (CI reads it on the PR's pushes; re-running a job doesn't pick up a label added later), or run `gh workflow run CI --ref <branch>`. Each runs the same `pnpm test:*` scripts as locally, so a green job means the same as a green local run. The caches (the iOS build, the Android AVD) belong to the PR that created them or to `main`; the pushes to `main` that change native paths write the `main` caches every PR can read, so a PR's first run is warm once `main` has run its paths. The cache action never overwrites an existing key: when a cached AVD snapshot stops loading, the job falls back to a cold boot but the fresh snapshot isn't saved under the same key, so bump the `v1` in the AVD cache key in `ci.yml` to rebuild it. The Android job stops the emulator with `scripts/android.sh stop`, which waits for it to exit before the AVD cache is saved. Both jobs end with their step durations in the job summary ([`scripts/step-timings.sh`](../../scripts/step-timings.sh)); the iOS job adds the build timing and the slowest tests, the Android job the emulator boot time.
