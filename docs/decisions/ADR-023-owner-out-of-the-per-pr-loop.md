# ADR-023: The owner out of the per-PR loop: status ticks, tooling, payments in test mode, early tickets, scheduled runs, and the end of agent queueing at pilot setup

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-28 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | Spec #292; amends ADR-016 (decision 1 and the production-release link of decision 6), ADR-018 (decision 4) and ADR-021 (decisions 1, 2, 6 and 7); ADR-020; ROADMAP.md §4.3, §7 (pilot setup) and the G2 exit criteria; WORKFLOW.md §7; `docs/legal/verwerkersovereenkomst.md` measure T12 |

## Context

Of the last 60 merged PRs, 26 were owner-only. About 11 were real owner decisions (ADRs, the roadmap, the merge rules). The other ~15 were ordinary feature work that became owner-only through one file touched along the way: a new package's `tsconfig.json` or `vitest.config.ts` (#284), a Playwright config (#187), the status row in `FEATURES.md` that a spec's last PR updates (#262, #282), a native test script (#222, #227, #240), `TESTING.md` (#199, #202), a test in a lint folder (#289). Specs blocked by another spec got no tickets until that whole spec was done, so F003 to F010 could not be planned. Nothing restarted the factory once a run stopped. And ADR-021 hands every high-risk PR back to the owner at G2, although G2 is an internal alpha on synthetic data: real personal data first enters production at pilot setup (`ROADMAP.md` §7, decision 6), so M5, M6 and M11 would wait on the owner PR by PR for no safety gain.

The owner wants a software factory: agents take approved specs to `main` on their own; the owner decides the product, approves specs and reads what was merged.

What must not change: agents never loosen their own rules, never touch what was promised to customers (`docs/legal`), and never approve a PR, merge outside `pr.sh merge`, use `--admin` or enable auto-merge.

## Decision

### 1. Status-only edits are agent-queueable, for good

A change to `docs/product/ROADMAP.md` or `docs/product/FEATURES.md` that only moves a status no longer gives the PR a `product-docs` reason. `scripts/status-only.jq` holds the pure decision, `scripts/risk.jq` calls it with the patch of the file (`scripts/risk.sh` takes it from the PR files API). Every other path of the PR still decides its risk.

- `ROADMAP.md`: every removed line has an added line that is the same checklist item with `[ ]` turned into `[x]` (a trailing issue or PR reference such as ` (#262)` may be appended), and no other line changes. Unticking is never status-only.
- `FEATURES.md`: every changed line is a row of an existing ID in a feature or enabler table; the ID is unchanged except for gaining a link to its spec issue; Status moves forward along `IDEA → PLANNED → DESIGNED → IN PROGRESS → IN REVIEW → IMPLEMENTED → RELEASED` (it may stay); NL and EN only go from ⬜ to ✅; the Feature (or Enabler) and Notes cells change only in a row whose Status becomes `IMPLEMENTED`; Priority, Milestone, Depends on and the Spec column never change; no row is added or removed and nothing outside those tables changes.
- Fail closed: a file whose patch is missing or truncated (hunk line counts must match the headers), a patch that changes nothing, and a renamed, added, removed or large-diff file stay owner-only.

### 2. Guardrails split into core and tooling

`guardrails` in `scripts/high-risk-paths.txt` becomes two groups. The list stays the one place to read the boundary, with the reason of each rule in its comments.

- **Core (`guardrails`, owner-only):** `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `.agents/`, `.claude/`, `.codex/`, `.github/`, `.githooks/`, `docs/agents/`, `WORKFLOW.md`, the root `package.json` and `turbo.json` at every depth (they choose which checks run), every script in `scripts/` with its tests except the tooling ones below (risk, merge gate, phases, labels, issues, PRs, checks, agent definitions, GitHub settings, allowlists, secrets), and the files that skip tests (`*.xctestplan`, `*.xcscheme`, the iOS skip list).
- **Tooling (`tooling`, declared `@agent-queue`):** test and build configs (nested `tsconfig.json`, Vitest and Playwright configs, `biome.json(c)`, `.shellcheckrc`, SwiftLint, `.editorconfig`, global test setups), the lint folders, the drift and contrast checks, the i18n and design-token CLIs, the Android build files that wire checks, the Maestro config, `docs/engineering/TESTING.md`, and the native, release and asset helper scripts in `scripts/` with their tests (`android.sh`, `test-ios.sh`, `maestro.sh`, `ios-device.sh`, `_android.sh`, `_ios.sh`, `release*.sh`, `play-publish.mjs`, `app-icon.mjs`, and the release, app-icon, app-ID and Dockerfile tests).
- **New directive `@except <group> <pattern>`.** A file that matches it is skipped by every rule of that group. The broad rule `guardrails /scripts` stays, so a new script is owner-only by default, and the tooling scripts are carved out by name. A malformed line, or an `@except` for a group with no path rule, is an error (fail closed), like a malformed rule.
- Supersedes ADR-021 decision 1's list of guarded files in as far as it names `TESTING.md`, the lint rules, the drift and contrast checks and the CLIs that pick checks as guardrails; they are now tooling.

### 3. Billing and payments are agent-queueable while payments run in test mode

`billing` is declared `@agent-queue`. Its line ends at the first of: production gets a live payment-provider key (the pilot's Mollie account goes live, at least a week before cutover), or pilot setup. `legal` and `product-docs` stay owner-only.

- A spec that touches money gets `owner-merge` (high-risk, agent-queueable) instead of `owner-only` until that end. Existing `owner-only` labels stay; only the owner removes them.
- **The key guard.** `scripts/payment-key-guard.sh` reads a payment-provider key on stdin and refuses a live key (Mollie: `live_…`) while `@agent-queue billing` is in `scripts/high-risk-paths.txt`, naming the line to remove; it accepts a test key (`test_…`) and refuses any key it does not recognise. No setup of a payment secret exists yet (production secrets are set by the owner in the Railway dashboard, `ENVIRONMENTS.md`), so the guard stands alone: the setup that comes with M11 must pipe the key through it, and the owner runs it before pasting a live key. The pilot-setup checklist (`ROADMAP.md` §7) puts "remove `@agent-queue billing`" at the step that connects the pilot's Mollie account.

### 4. Tickets are cut as soon as a spec is approved

An approved, described spec with open blockers and no tickets is `needs-tickets`, not `blocked`. Each ticket gets blocking edges on the tickets of the other spec it really needs, or on the other spec itself when those do not exist yet. `issue.sh ready` already decides readiness per ticket; the parent spec's own blockers no longer hold its tickets back.

### 5. Owner-only edits do not ride along in feature PRs

`pr.sh create` prints the owner-only reasons of a ticket PR after it pushes. The builder moves an owner-only edit that the ticket does not need in the same commit to a small `chore/` PR of its own, blocked from nothing, and notes it. When the ticket cannot work without the guarded change, that PR goes first and the ticket PR waits on it.

### 6. The factory runs on a schedule, with a run lock

`scripts/flow.sh lock acquire|release|status` keeps one lock file (`.work/factory.lock`) with an expiry of 3 hours. The Factory section of the `work` skill acquires it first and releases it in the report step; a run that finds a live lock reports its age and stops without claiming anything; a lock older than 3 hours is taken over (a crash does not stop the factory for good). `WORKFLOW.md` says the factory runs when the owner says so, and every 2 hours on the owner's Mac. The schedule is a Claude Code scheduled task on the owner's Mac, set up after this merges; it is not repo code. Known limit: two runs racing for an expired lock are guarded only by the atomic link of the lock file.

### 7. Agent queueing of high-risk PRs ends at pilot setup, not at G2

ADR-021 decision 6 ("it ends at G2") becomes: the `@agent-queue` lines are removed at pilot setup, before the first real personal data enters production. `ROADMAP.md` moves that item from the G2 exit criteria to the pilot setup (week 0) checklist. After that every high-risk PR goes to the owner again, as in ADR-016. Measure T12 of the processor agreement (version 0.4) says exactly this boundary, in Dutch and English: the owner approves every merge of a change to the agent rules (core) and legal matters; until real personal data is processed in production, other changes, including authentication, tenant data, health notes, dependencies, infrastructure, tooling and payment code while payments run only in the payment provider's test mode, merge after the required CI checks, the two agent reviews and a check of the preview; from then on the owner approves those high-risk changes again, and every payment change from the moment live payments are switched on; status updates to the roadmap and feature registry merge without the owner at all times. Approving the PR of this ADR approves that wording.

The merge gate (`scripts/merge-gate.jq`) and `flow.sh next` are unchanged: any `high` PR passes the risk condition, and the agent merges of `tooling` and `billing` PRs are recorded in the PR body and listed under "For the owner to read" like the other high-risk groups.

Rollout: this ADR, the scripts and tests, `AGENTS.md`, `WORKFLOW.md`, `docs/agents/`, the `work` skill, `ROADMAP.md` and the agreement are one PR. It is owner-only (core scripts, `AGENTS.md`, `docs/decisions`, `docs/legal`), so the owner merges it. After the merge no label or ruleset change is needed.

## Consequences

- **Positive:** the factory no longer stops for clerical ticks, new packages, lint or test tooling, or payment work in test mode; planning runs ahead of blocked specs; the owner reads a list instead of approving PR by PR; the owner-only PRs that remain are small and hold only the guarded change.
- **Negative:**
  - Until pilot setup an agent can merge a tooling change that weakens a lint rule or a drift check without the owner seeing it first. Mitigations: the same gate as every high-risk PR (checks, the high-tier review on both axes, the merge queue on `main`, the audit record), the after-the-fact list, and the core staying owner-only: the risk list, the merge gate, the check scripts and the root `package.json` and `turbo.json` cannot be loosened by an agent.
  - A payment change in test mode can reach `main` without the owner. The only real-money exposure is production, so the guard and the checklist step stop the live key from being set while the `billing` line is there. The guard only helps if the setup calls it: a key pasted in the dashboard is covered by the checklist step, not by code.
  - The status-only rule reads diff text. A shape it does not know falls back to owner-only, so mistakes cost the owner a review, not the roadmap its integrity.
  - The `@except` boundary is a list of names: a new native or release script is owner-only until a line moves it.
- **Follow-ups:**
  - At pilot setup: remove `@agent-queue billing` before the live payment-provider key is set, and all other `@agent-queue` lines before real data enters (`ROADMAP.md` §7), together with the production-release approval of ADR-016 decision 6.
  - M11: the setup of the payment secret calls `scripts/payment-key-guard.sh`.
  - Set up the 2-hourly scheduled task on the owner's Mac, with the owner's OK in that session.
  - A later ADR may revisit what happens after pilot setup with evidence from the pilot.

## Alternatives considered

| Option | Why not (now) |
|---|---|
| Keep ADR-021 as it is (ends at G2) | G2 is an internal alpha on synthetic data; M5, M6 and M11 would wait on the owner PR by PR with no gain in safety. |
| Keep `TESTING.md`, lint and drift checks guarded | A new package or a lint tweak stopped the factory about as often as a real rule change; the review still checks that a test is not weakened. |
| Let agents change the risk list or the merge gate | Agents could loosen their own rules. These stay core. |
| Keep billing owner-only | M11 would wait on the owner PR by PR, although no real money moves until a live key is set. |
| Make billing agent-queueable until pilot setup only | A live Mollie key is set at least a week before cutover, earlier than pilot setup in the plan; payment code must come back to the owner at that moment. |
| Tickets only when the blocking spec is done | F003 to F010 cannot be planned, and the ticket that does not need the other spec's work waits. |
| Run the factory in GitHub Actions | Out of scope (`WORKFLOW.md` keeps it a later decision). |
