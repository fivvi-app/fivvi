# ADR-034: Fast pipeline: UI tests nightly, lighter CI, review split into standards per PR and spec per slice

| | |
|---|---|
| **Status** | Accepted (2026-11-18). **Amends**, while `.github/pipeline.json` says `fast` and `split`: ADR-016 (decision 3, what the reviewer checks before the merge gate), ADR-018 (what the required checks run), ADR-024 (which tests a change runs in CI) and ADR-033 (item 5, review by risk: the fix rounds stay, the axes change). Switching back to `full` and `per-pr` restores those ADRs as they were; nothing is removed |
| **Date** | 2026-11-18 |
| **Extended by** | [ADR-035](ADR-035-lean-pipeline.md) (19 November 2026): a third `ci` value, `lean`, and the `builders` setting, on the same switch; not a reversal, and `fast` still means what is written here |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | ADR-016, ADR-018, ADR-024, ADR-025, ADR-033; `docs/engineering/WORKFLOW.md §7`, `docs/engineering/TESTING.md`, `docs/agents/build.md`; the tag `pipeline-full-2026-11-18` |

## Context

Measured on 18 November 2026 over the whole project (22 September to 18 November: 423 merged PRs, 1,017 issues, 1,605 CI runs with every job's timing, and the agent transcripts of 378 tickets since 19 October, `scripts/usage.mjs`):

- **A ticket's touch time is about 95 to 110 minutes**: a median of 70 minutes of agent time (118 for native tickets), 15 minutes of agents waiting on CI, and the CI runs themselves.
- **The review loop is the largest part of the agent time.** 25% of tickets pass their first review (83 of 331); the median ticket needs 2 reviews and 43% need 3 or more. Agent time grows about 30 minutes with each round: 29 minutes with 1 review, 61 with 2, 88 with 3, 155 with 4 or more.
- **Native UI tests are about 60% of CI's runner time** (837 runner hours): `iOS tests` 280 hours (22 minutes a run, median, per language), `Android Maestro` 115, `Android tests` 99 (most of it the Compose UI tests on an emulator). A run that touches native code takes a median of 25 minutes on the PR and 28 in the merge queue; without the UI and e2e jobs the same runs end after about 5 and 7.
- **Most queue removals come from the UI jobs.** The iOS gate failed in 40 of the 68 failed merge-group runs, mostly in `iOS tests` or with no runner; each removal costs a fix round and a second queue run.
- **75% of a ticket's lead time is waiting in the backlog** (issue opened → first commit), and a spec waits a median of 43 hours for `spec-approved`. This ADR does not change that; more throughput does.

The owner wants to deliver faster without throwing the current setup away: it must stay one switch away.

## Decision

1. **One switch, two settings.** `.github/pipeline.json` holds `ci` (`fast` or `full`) and `review` (`split` or `per-pr`). `scripts/pipeline.sh get ci|review` reads it, for scripts and agents; `ci.yml` reads it in `Detect changes`. `full` and `per-pr` are the setup as it was on 18 November 2026, unchanged; the tag `pipeline-full-2026-11-18` marks that commit. Changing the file is an owner-only change (`.github` is core guardrails). This ADR sets `fast` and `split`.
2. **`ci: fast`: no UI tests on PRs and merge groups.**
   - `iOS tests (nl)` and `(en)` run the unit tests only (`scripts/test-ios.sh test <locale> --unit-only`); `iOS build` is unchanged.
   - `Android tests` runs the unit tests and the signed release bundle without an emulator (`scripts/android.sh verify --no-ui`); `Android Maestro` does not run.
   - `E2E (Linux)` does not run (a skipped required check passes, as today).
   - The `Quarantine` jobs run only their non-UI lists (Vitest); the Playwright, Compose and Maestro lists run at night.
   - `Detect changes`, `Checks (Linux)` (the `check.sh --fast` set plus the integration tests) and the gates `iOS` and `Android` run as today, under the same names, so the ruleset's required checks do not change. The push run on `main` still only fills the caches.
   - Locally, builders run the same unit-only modes (`test-ios.sh --unit-only`, `android.sh test --no-ui`); `pnpm test:ios` and `pnpm test:android` without the flag still run everything.
3. **The UI tests run every night, on `main`.** `ci.yml` gets a `schedule` trigger (02:00 UTC). A scheduled run, like `workflow_dispatch`, runs every job in full: the native jobs and `E2E (Linux)` whatever changed, the UI tests included, and every quarantine list. When a job of a nightly run fails, its last job opens a bug issue (or comments on the open one) titled `Nightly UI tests failed`, labelled `bug` and `ready-for-agent`, with the run, the failing jobs and an `## Acceptance criteria` checklist ("the nightly run passes"). The factory builds it before the other tickets, after a failing deploy. A flaky UI test goes to the quarantine as today (ADR-025).
4. **`review: split`: standards on every PR, the spec once per slice and once per spec.**
   - **On every PR** (a ticket or a platform slice), the `reviewer` runs the **standards** axis of `code-review` only, and checks one mechanical thing for the spec: the builder's notes list, for every acceptance criterion of every ticket in the PR, the test that proves it, and each named test exists in the diff. A missing or unknown test is a must-fix finding. The fix rounds stay as ADR-033 item 5 sets them (`low`: one round, must-fix only; `high` and `owner`: two rounds, should-fix blocks).
   - **A `high` or `owner` PR keeps both axes on the PR** (auth, tenant data, health notes, money, the guardrails): those are the changes where a late spec finding costs most.
   - **After each slice or ticket PR of a spec merges**, a fresh `reviewer` runs the **spec** axis on what it merged: the map from `scripts/spec-review.sh map <spec>` (every acceptance criterion of the spec and its tickets → the ticket that owns it → the PR that closed it → its squash commit and files), the PR's squash commit, and the code on `main`. It reports per acceptance criterion: passes, or fails with file, line, the commit and the ticket it traces to (`git blame` on the line). This answers "where is the problem": every line on `main` belongs to one squash commit, `[F0xx] … (#PR)`, which closes its tickets.
   - **When every ticket of the spec is closed** (`flow.sh` phase `complete`), a last spec review covers the whole spec across its platforms: the acceptance criteria no ticket owned, and the parity of iOS and Android. `flow.sh` reports the phase `spec-review` until a clean final review is recorded for the current `main`; only then is the spec closed.
   - **A finding becomes a bug ticket under the spec** (`scripts/issue.sh create bug --parent <spec>`, `ready-for-agent`, with the acceptance criterion, the file and line, the commit, the PR and the ticket it traces to, and its own `## Acceptance criteria`). It is built through the normal lane and keeps the spec open. Verdicts are recorded with `scripts/spec-review.sh record`, in `.work/spec-<n>/spec-review.md` (git-ignored; the map can be rebuilt from GitHub at any time).
   - Only a `reviewer` verdict makes a review clean, as before; `pr.sh reviewed` records which axes it covered, and the merge gate accepts a standards-only record only while `review` is `split` and the PR is `low` risk.
   - Which axes a PR gets depends on its risk, and `scripts/risk.sh` needs a PR to decide it. So with `split`, `work` opens the draft (`pr.sh create`) before the first review; until there is a PR, the risk is unknown and the review covers both axes.
5. **To go back** (step by step in `WORKFLOW.md §8`), the owner sets `"ci": "full"` and `"review": "per-pr"` in `.github/pipeline.json` in one PR: CI runs every UI test on every PR and merge group again, the reviewer runs both axes on every PR, the spec-review step and its phase go away, and the nightly run stays as an extra check (it then finds nothing the PRs did not). Each setting can go back on its own.

## Consequences

- **Faster, by about a third.** Estimated from the numbers above: about 20 to 30 minutes less agent time per ticket from the review (fewer rounds; the spec review per slice and its fix tickets add back about 5 to 10), about 10 minutes less waiting on CI and 15 minutes less CI wall time, and about 5 minutes on average from fewer flaky removals. Native tickets gain most. With 4 builders, a slot is free about 1.6 times sooner. To be measured with `scripts/usage.mjs compare` after the first week.
- **UI regressions reach `main`** and are found the next night, not before the merge. The nightly bug is built first, and a release still runs the full iOS and Android suites before it ships (E017, `RELEASE.md`).
- **Spec problems are found later**, after the slice merged. A slice is at most 5 tickets, so a wrong reading of the spec is found before many more tickets build on it; the AC → test check on every PR catches a missing test early. If spec reviews often send work back across several tickets, switch `review` back to `per-pr`.
- **Railway is unchanged**: CI still runs and still gates `main`'s deploy ("Wait for CI"), only shorter. One edge: the nightly run is a check suite on `main`'s head commit, so when a PR merged shortly before 02:00 UTC and its deploy still waits for CI, a failing nightly run holds that deploy back too; the next merge deploys as usual, and the nightly bug says what failed.
- **UI tests on one PR on purpose**: the `run-native` label forces the native jobs but not the UI tests; `gh workflow run CI --ref <branch>` (`workflow_dispatch`) runs everything, the UI tests included.
- **Nothing is deleted**: the UI test jobs, the scripts' full modes, both review axes and the docs of the full setup stay, behind the switch.

## Alternatives considered

- **One job at a time on the laptop, no CI and no review.** No merge conflicts and no CI wait, but it gives up the 4 parallel builders (the throughput) and every gate before `main`; the cheap, deterministic checks (`Checks (Linux)` runs in a median of 3.4 minutes) are worth more than they cost.
- **Delete the UI test jobs.** Faster to write, but the owner wants to be able to come back; the switch keeps both.
- **The spec axis only once, when the spec is complete.** Cheaper, but a spec of 20 tickets would find a wrong reading after all of them were built; per slice bounds that to 5.
