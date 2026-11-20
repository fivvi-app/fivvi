# ADR-033: Go-live mode: fewer, bigger PRs, tests once, builds off the Mac, review by risk

| | |
|---|---|
| **Status** | Accepted (2026-11-15). **Amends** ADR-016 (decision 3, what a clean review means for a low-risk PR), ADR-018 (build concurrency of the merge queue, 3 to 4; group size stays 1, #1425), ADR-023 (CI workflows agent-queueable until pilot setup), ADR-024 (what the local check runs before a push) and ADR-025 (step 6: the Quarantine jobs are in ci.yml, agent-queueable); duo sessions (F066) and the single class pass (F058) move after go-live (`ROADMAP.md` v1.43). **Amended by** [ADR-034](ADR-034-fast-pipeline.md) (20 November 2026 note: item 3, where the integration and e2e tests run; item 5, the axes of the review) and [ADR-035](ADR-035-lean-pipeline.md) (item 3: the integration tests too, and the builder limit), both while `.github/pipeline.json` says so; item 4 (cloud builds) does not take effect, the spike #1426 was closed as not planned on 20 November 2026 |
| **Date** | 2026-11-15 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | ADR-016, ADR-018, ADR-021, ADR-023, ADR-024, ADR-025; `docs/legal/verwerkersovereenkomst.md` (measure T12); `docs/engineering/WORKFLOW.md`, `docs/agents/build.md`; the owner's other project, which ships many builds a day with one plain CI job |

## Context

The owner wants the apps live as soon as possible, without giving up reliability. On 15 November 2026:

- **577 tickets were open** (`ready-for-agent`): 255 backend, 154 web, 88 iOS and 80 Android. By the roadmap's milestones, 566 of them are go-live scope (M4 103, M5 118, M6 14, M11 223, M9 54, other enablers 44); only 11 are M7.
- **About 13 tickets closed a day** (133 from 5 to 15 November), so the open tickets alone are about 6 weeks of work, before new bugs.
- **Half of the merged PRs were not features**: of the last 150, 80 were enablers and 61 features; many of the enablers fixed the factory itself (CI timing, flaky tests, the merge queue, local check runs under load).
- **Every ticket pays the full fixed cost**: the local `check.sh` with the integration and e2e tests, CI on the PR (the iOS jobs about 28 minutes, median), the `reviewer` with up to two fix rounds, the preview smoke check, and CI again on the merge group, which merges one PR at a time (`max_entries_to_merge: 1`). Of 10 feature PRs merged on 11–14 November, 7 took more than a day from their first commit to the merge, the longest about 2.5 days.
- **The owner's Mac is the bottleneck**: local e2e runs and booted simulators pushed the load to about 700, so the factory runs at most 2 builders (14 November 2026).

Production holds no real personal data until pilot setup (ADR-023), so this is the cheap moment to take on more speed.

## Decision

1. **Duo sessions (F066) and the single class pass (F058) come after go-live.** They are not among the four pain points that define go-live (`ROADMAP.md §3.1`). They join the running pilot after G4, like M7. Their open tickets move from `ready-for-agent` to `ready-for-human` (swap them back to resume), and the draft PR of F066 waits. A booking needs a membership with allowance left or credits of the matching kind; a trial stays an intro credit pack.
2. **One PR per platform slice of a spec, not per ticket.** A builder takes the open, unblocked tickets of one spec on one platform (backend, web, iOS or Android), at most 5 tickets or about 1,500 changed lines, and builds them test-first in one branch; the PR closes all of them. A ticket blocked only by another ticket in the same slice may join it. Replaces "one ticket per PR" in `AGENTS.md` and `WORKFLOW.md`.
3. **The tests run once.** Before a push, `pr.sh create` runs `check.sh --fast` (hygiene, lint, types, unit tests, static checks, build); the integration and e2e tests run in CI, which stays the gate. *Amended (20 November 2026): where they run now is decided by `.github/pipeline.json`: with `ci: fast` ([ADR-034](ADR-034-fast-pipeline.md)) the e2e tests run in the nightly run and the integration tests in CI; with `ci: lean` ([ADR-035](ADR-035-lean-pipeline.md)) the integration tests run in the nightly run too.* `pr.sh create --full` still runs everything. The merge queue keeps **one PR per group** (`max_entries_to_merge: 1`, `grouping_strategy: ALLGREEN`): GitHub builds and tests every queued PR on its own temporary branch whatever the group size, so a group of up to 3 PRs would run the required checks no fewer times (the result and its sources are in "Merge group size (#1425)" below). With the local e2e runs gone, the builder limit goes from 2 to 4, as long as the load stays under about 50, and `max_entries_to_build` goes from 3 to 4 with it. *Amended: the builder limit is now `scripts/pipeline.sh get builders` ([ADR-035](ADR-035-lean-pipeline.md): 1, one ticket or slice in flight at a time).*
4. **Backend and web slices build off the Mac** in cloud sessions, once a spike shows that a cloud session can run `check.sh --fast` and push with the agent's GitHub identity. iOS and Android slices stay on the Mac. Until the spike passes, nothing changes here. *Amended (20 November 2026): the spike #1426 was closed as not planned, because the factory builds one ticket or slice at a time under [ADR-035](ADR-035-lean-pipeline.md), so this item does not take effect; backend and web slices build on the Mac like the rest.*
5. **Review by risk, until pilot setup.** A PR that `scripts/risk.sh` calls `low` gets one `reviewer` pass on both axes and at most **one** fix round; only must-fix findings block it, and should-fix findings go to the notes file as follow-ups. This changes ADR-016 decision 3 (the merge gate: a review is clean when no must-fix or should-fix finding is left): for a `low` PR a reviewer verdict is clean when no must-fix finding is left. A `high` or `owner` PR keeps today's review: full, up to two fix rounds. Only a `reviewer` verdict makes a review clean, as before.
6. **The owner out of the CI loop, until pilot setup.** The CI workflows (`.github/workflows/*.yml`) become agent-queueable (`@agent-queue ci` in `scripts/high-risk-paths.txt`); the rulesets, `risk.sh`, the merge gate, `AGENTS.md`, the agent definitions, hooks and the scripts' own tests stay owner-only. Every agent merge of a CI change is recorded as a high-risk agent merge, which the owner reads after the fact (`flow.sh next`). `@agent-queue ci` lands only after measure T12 of the processor agreement (`docs/legal/verwerkersovereenkomst.md`) is changed, in the Dutch and the English text: T12 now promises that the owner approves every merge of a change to "de CI-workflow" (the CI workflow), and changing it is an owner-only legal change. Until then CI workflow changes stay owner-only. The owner also takes about 10 minutes a day to add the waiting owner-only PRs to the merge queue.

Items 5 and 6 end at pilot setup, with the other `@agent-queue` lines (ADR-023). Items 2 to 4 stay until a later ADR changes them.

Item 1 takes effect with this ADR. Items 2, 3, 5 and 6 take effect when the tickets of spec #1419 change `AGENTS.md`, `WORKFLOW.md`, `docs/agents/build.md`, the `work` skill and the scripts; until then the current rules hold. Item 4 waited for its spike, which was closed as not planned (see above).

## What stays, because it keeps the apps reliable

- Test-first work, and a failing test first for every bug (`TESTING.md §3`); no test is skipped or weakened to get green.
- CI as the gate: every required check, the contract drift check, and the integration and e2e tests on every PR and merge group. *Amended: they run in CI or in the nightly run as `.github/pipeline.json` says (`ci: fast`, ADR-034: e2e in the nightly run; `ci: lean`, ADR-035: the integration tests too); the other required checks and the merge gate still run on every PR.*
- The merge queue, which tests every PR on the latest `main`.
- Tenant scoping, and full review of auth, tenant data, health notes and money.
- iOS and Android parity for the trainer app, and the NL/EN parity of every string.

## Merge group size (#1425)

Question: does a merge group of more than one PR run the required checks fewer times than one PR per group? Answer: **no, so the size stays 1** (`max_entries_to_merge: 1`, `min_entries_to_merge: 1`, `grouping_strategy: ALLGREEN`; `.github/rulesets/main.json` and its pinning test in `scripts/test/github-settings.test.mjs` already hold exactly that).

- **GitHub's docs** ([Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue), checked 17 November 2026): "Merge limits do not combine `merge_group` builds", and merge limits "only affect merges to the base branch once one or more `merge_group` has satisfied build checks". The minimum and maximum group size (and the wait for the minimum) decide how many already-built entries are merged together; the number of builds is the build concurrency (`max_entries_to_build`, the `merge_group` webhooks dispatched). The docs' examples show one temporary branch per entry: `main/pr-1` holds PR #1, `main/pr-2` holds PRs #1 and #2; both merge when both pass. So every queued PR gets its own `merge_group` event and its own run of the required checks, in a group of 1 or of 3.
- **`ALLGREEN` against `HEADGREEN`** ([REST: rules](https://docs.github.com/en/rest/orgs/rules) lists the two values; ADR-018 records their meaning): it changes only which of those builds must pass before a group merges (every entry, or the head of the group; the UI's "Only merge non-failing pull requests"). It builds nothing less, so it saves no run either. `ALLGREEN` stays, the stricter rule.
- **Runs GitHub made on 16 and 17 November 2026** (`gh run list --event merge_group`; all with the size at 1, so they show how the queue builds, not what a bigger group does). On 16 November #1435, #1428 and #1429 were queued within 18 seconds: runs 43826697393, 43826699460 and 43826733856, one each, stacked on the one before. On 17 November #1385, #1439 and #1310 were added one after another (15:27, 15:32 and 15:43), each while the earlier ones were still queued: #1385 (run 44114527403, base `2b8740e3`, on `main`), #1439 (run 44115619252, base `d8dca165`, the head of #1385's group) and #1310 (run 44117540761, base `a9bba2af`, the head of #1439's group), one each, stacked. Three PRs, three runs of the required checks, as the docs describe.
- **Not tried live:** a trial with `max_entries_to_merge: 3` needs the owner to change the ruleset and to queue two PRs at once; the docs state the result plainly, and what a trial could still add is only whether GitHub's behaviour differs from its documentation. Should the owner want it anyway: set `max_entries_to_merge: 3` and `min_entries_to_merge: 2` with a short wait, queue two PRs, and count the `merge_group` runs with `gh run list --event merge_group`; two runs mean no saving.
- **What a group would cost:** several PRs in one squash commit and one production deploy, which ADR-018 avoided (a bad deploy has more to bisect). With no saving of runs there is no reason to take that.
- **What does save runs** is item 2, one PR per platform slice (the PR run, the review, the smoke check and the merge group are paid once for up to 5 tickets), and the narrower scope of `Detect changes`, not the group size.

## Consequences

- **Positive:** about 50 fewer tickets before go-live (F066 30, F058 18); the fixed cost per PR comes up to about 4 times less often; a push no longer waits for local e2e runs; up to twice as many builders (amended: `builders` in `.github/pipeline.json`); the owner is no longer needed for most CI changes. A rough estimate (not measured): go-live in about 2 to 3 weeks instead of about 6.
- **Negative:** bigger PRs are harder to review, which the 5-ticket and 1,500-line cap limits; a test that fails only in an integration or e2e suite is found in CI instead of before the push, which costs a CI round; a low-risk PR merges with should-fix findings open; until pilot setup an agent can change CI without the owner (CI could be weakened; the scripts' tests that pin CI stay owner-only, and every such merge is recorded).
- **Follow-ups:** the spec (#1419) that builds items 2 to 6; the change of measure T12 in `docs/legal/verwerkersovereenkomst.md`, NL and EN, before `@agent-queue ci` lands (owner-only, legal); `FEATURES.md` and `ROADMAP.md` v1.43 for item 1.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Work like the owner's small project: commit to `main`, no PRs, no review, one CI job | Fivvi holds gyms' money, several workspaces and health notes; a bug there costs real clients money or leaks data |
| Keep the process and add builders | The Mac is already the bottleneck at 2 builders |
| A self-hosted macOS runner | Faster iOS jobs, but it doesn't touch the per-PR cost or the scope; it can come later |
| Freeze the factory's own fixes (the retro of 5 November) | Rejected by the owner on 6 November 2026 |
