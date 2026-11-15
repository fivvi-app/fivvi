# ADR-033: Go-live mode: fewer, bigger PRs, tests once, builds off the Mac, review by risk

| | |
|---|---|
| **Status** | Accepted (2026-11-15). **Amends** ADR-018 (group size of the merge queue), ADR-023 (CI workflows agent-queueable until pilot setup) and ADR-024 (what the local check runs before a push); duo sessions (F066) and the single class pass (F058) move after go-live (`ROADMAP.md` v1.43) |
| **Date** | 2026-11-15 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | ADR-016, ADR-018, ADR-021, ADR-023, ADR-024, ADR-025; `docs/engineering/WORKFLOW.md`, `docs/agents/build.md`; the owner's other project, which ships many builds a day with one plain CI job |

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
3. **The tests run once.** Before a push, `pr.sh create` runs `check.sh --fast` (hygiene, lint, types, unit tests, static checks, build); the integration and e2e tests run in CI, which stays the gate. `pr.sh create --full` still runs everything. The merge queue merges up to **3 PRs per group** (`max_entries_to_merge: 3`), if GitHub's grouping runs the checks fewer times than one PR per group; if it doesn't, the size stays 1. With the local e2e runs gone, the builder limit goes from 2 to 4, as long as the load stays under about 50.
4. **Backend and web slices build off the Mac** in cloud sessions, once a spike shows that a cloud session can run `check.sh --fast` and push with the agent's GitHub identity. iOS and Android slices stay on the Mac. Until the spike passes, nothing changes here.
5. **Review by risk, until pilot setup.** A PR that `scripts/risk.sh` calls `low` gets one `reviewer` pass on both axes and at most **one** fix round; only must-fix findings block it, and should-fix findings go to the notes file as follow-ups. A `high` or `owner` PR keeps today's review: full, up to two fix rounds. Only a `reviewer` verdict makes a review clean, as before.
6. **The owner out of the CI loop, until pilot setup.** The CI workflows (`.github/workflows/*.yml`) become agent-queueable (`@agent-queue ci` in `scripts/high-risk-paths.txt`); the rulesets, `risk.sh`, the merge gate, `AGENTS.md`, the agent definitions, hooks and the scripts' own tests stay owner-only. Every agent merge of a CI change is recorded as a high-risk agent merge, which the owner reads after the fact (`flow.sh next`). The owner also takes about 10 minutes a day to add the waiting owner-only PRs to the merge queue.

Items 5 and 6 end at pilot setup, with the other `@agent-queue` lines (ADR-023). Items 2 to 4 stay until a later ADR changes them.

## What stays, because it keeps the apps reliable

- Test-first work, and a failing test first for every bug (`TESTING.md §3`); no test is skipped or weakened to get green.
- CI as the gate: every required check, the contract drift check, and the integration and e2e tests on every PR and merge group.
- The merge queue, which tests every PR on the latest `main`.
- Tenant scoping, and full review of auth, tenant data, health notes and money.
- iOS and Android parity for the trainer app, and the NL/EN parity of every string.

## Consequences

- **Positive:** about 50 fewer tickets before go-live (F066 30, F058 18); the fixed cost per PR comes up to about 4 times less often; a push no longer waits for local e2e runs; up to twice as many builders; the owner is no longer needed for most CI changes. A rough estimate (not measured): go-live in about 2 to 3 weeks instead of about 6.
- **Negative:** bigger PRs are harder to review, which the 5-ticket and 1,500-line cap limits; a test that fails only in an integration or e2e suite is found in CI instead of before the push, which costs a CI round; a low-risk PR merges with should-fix findings open; until pilot setup an agent can change CI without the owner (CI could be weakened; the scripts' tests that pin CI stay owner-only, and every such merge is recorded).
- **Follow-ups:** the spec that builds items 2 to 6; `FEATURES.md` and `ROADMAP.md` v1.43 for item 1.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Work like the owner's small project: commit to `main`, no PRs, no review, one CI job | Fivvi holds gyms' money, several workspaces and health notes; a bug there costs real clients money or leaks data |
| Keep the process and add builders | The Mac is already the bottleneck at 2 builders |
| A self-hosted macOS runner | Faster iOS jobs, but it doesn't touch the per-PR cost or the scope; it can come later |
| Freeze the factory's own fixes (the retro of 5 November) | Rejected by the owner on 6 November 2026 |
