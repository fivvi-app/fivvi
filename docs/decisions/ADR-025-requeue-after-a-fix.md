# ADR-025: A PR the merge queue removed for a cause outside it is re-queued after the fix

| | |
|---|---|
| **Status** | Proposed; amended 2026-11-12 (a flaky test is quarantined first) |
| **Date** | 2026-10-31; amended 2026-11-12 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | Amends ADR-018 (decisions 4 and 5, and the "flaky check" consequence); builds on ADR-016, ADR-021, ADR-023; AGENTS.md (Push and merge); the `work` skill (`queue-removed`, Factory); bug #353 |

## Context

On 31 October 2026 the merge queue removed PR #352 (ticket #315, reviewed clean). A flaky web E2E test (`language.spec.ts:326`, now bug #353) failed in its `merge_group` run; the same test had failed on `main` twice the day before. The rule of ADR-018 ("a flaky check in the queue removes the PR and the owner decides whether to queue it again"; "never queue the same commit again yourself") made the factory report it and stop. Every later run ended at `flow.sh idle`, nobody filed the flaky test as a bug, and all work behind #315 waited on the owner.

The cause was outside the PR, and an agent can fix it: file the bug, build it, and queue the same commit again once the fix is on `main`. Only the part "queue it again" needed the owner, and that part is mechanical when the facts are on GitHub.

## Decision

When the queue removes a PR for a cause **outside the PR** (the failing check also fails on `main` or on other PRs, a flaky test, a stalled or timed-out job), the factory does not stop:

1. **File or find the bug.** It files a bug for the failing check (`issue.sh create bug … --label ready-for-agent`) with the run ids, the failing test and error, and `## Acceptance criteria` (it diagnosed it, so it is triaged), or finds the open bug that already covers it. Then it links it on GitHub: `issue.sh block <ticket> --by <bug>`. GitHub holds the link.
2. **Build the bug first.** It is an ordinary ready item, built, reviewed and shipped like any ticket. A bug that blocks a removed PR goes before other ready work.
3. **Re-queue after the fix.** Once the bug is closed as completed after the removal, the factory queues the **same** removed commit once more with `scripts/pr.sh merge <pr> --after <bug>`. No merge of `main`, no new push: the queue tests the PR on the latest `main`, which now has the fix (ADR-018 decision 6 stands). The rest of the merge gate holds as always: not owner-only, checks passed on the head commit, reviewer clean, smoke checked, no open threads, ready for review.
4. **Once only.** A commit is re-queued after a fix at most once. If the queue removes it again, the owner decides, as before.
5. A cause **in** the PR is unchanged: fix it, push, review, smoke, merge.

> **Amended (12 November 2026): a flaky test is quarantined first and fixed within the week.** From 24 October to 12 November 2026 the queue removed PRs 35 times for failed checks, against 287 merges, and about 26 merged PRs fixed flaky tests and runners. Decision step 2 made every removed PR wait a full ticket round, the diagnosis and the real fix, before its re-queue. Most of those failures were tests that pass and fail on the same code: tests that ran close to their timeout, races in UI tests, an e2e checkbox. `TESTING.md §8` already allows a quarantine with a linked issue, an owner and a date, for at most one week, and never for tenant isolation, concurrency or permission tests. No PR used it, because a quarantined test was a skipped test, and nothing kept it honest.
>
> When the cause is a **flaky test** that `TESTING.md §8` lets us quarantine:
>
> 1. **Evidence first.** A test counts as flaky only when it failed and also passed on the same code, with both run ids in the bug: the same commit (a re-run of the failed job, `gh run rerun <run> --failed`, gives that where GitHub still allows it), or the same tree in a merge group and in the push run or the daily run on `main` ([ADR-018](ADR-018-merge-queue.md), amendment of 12 November 2026). A test that fails every time is broken, not flaky: decision steps 1 to 5 apply.
> 2. **Two issues.** The factory files (or finds) the bug for the real fix, as in decision step 1, and files a quarantine ticket that names the bug and blocks the removed PR's issue (`issue.sh block <n> --by <quarantine ticket>`). The quarantine ticket is small: it adds the test to the quarantine list. Once it is merged and closed, the re-queue of decision step 3 runs as before, with `pr.sh merge <pr> --after <quarantine ticket>`. The bug does not block the PR.
> 3. **A quarantined test still runs.** Each test runner (Vitest, Playwright, XCTest, Compose, Maestro) reads one quarantine list; every entry names the test, its bug, the date it was added and an end date at most 7 days later. The owner that `TESTING.md §8` asks for is whoever is assigned the bug, and the factory while nobody is. The required jobs leave the listed tests out, and a job that is not required (`Quarantine`) runs exactly those tests on every CI run, so their results stay visible and the fix can show it works there. A quarantined test is moved, not skipped, so "never delete, skip or weaken a test" (`AGENTS.md`, `TESTING.md §1`) still holds.
> 4. **The date is enforced, not remembered.** `scripts/check.sh` (and so `Checks (Linux)`) fails when an entry has no bug, no added date or no end date, an end date more than 7 days after the added date, or an end date that has passed, or when it lists a tenant isolation, concurrency or permission test. Those tests carry a tag in their name (`@isolation`, `@concurrency`, `@permission`) that the rule reads; tagging the existing ones is part of the follow-up. An expired entry therefore stops every PR until its bug is fixed: the fix, which takes the test off the list, is ready work the factory builds before other tickets, as a bug that blocks a removed PR is (decision step 2).
> 5. **Not for runners and services.** A cause that is not a test (no macOS runner, a mirror or download that fails, a timed-out job) is not quarantined: decision steps 1 to 5 apply, and the retries of #1268 stay.
> 6. **Who merges a quarantine.** The quarantine lists live outside every guardrail path and are a risk group of their own, `quarantine`, declared `@agent-queue` in `scripts/high-risk-paths.txt` until pilot setup, as `tooling` is. A quarantine ticket therefore goes through `pr.sh merge` like any agent-queueable PR, and is recorded as a high-risk agent merge for the owner to read. This loosens the guardrail on "the files that skip tests" for these lists only, because step 4 limits what a list may hold and step 3 keeps the tests running. The other files that skip tests (the Xcode test plans and schemes, `TestPlanSkips.swift`), the list readers, the `check.sh` rule and the `Quarantine` job stay owner-only.
>
> Rejected: retrying a failed test once in every runner (it hides flakes, as before); letting the merge queue ignore a flaky test without a list (nobody would know which tests are trusted).

How it works:

- **`pr.sh merge <pr> [--after <bug>]`.** With `--after`, the gate condition "not removed from the queue" also passes when `<bug>` is closed with the state reason completed, blocks the issue the PR closes, was closed after the removal (`RemovedFromMergeQueueEvent.createdAt`), and the PR body has no earlier re-queue line for this head commit. Every failed condition is named in the refusal, which is recorded as any refusal. Anything unreadable fails closed. Without `--after` a removed commit is refused, as before.
- **The audit line.** Before it queues, `pr.sh merge --after` records `**Merge queue:** re-queued <sha> after #<bug> fixed the check that removed it` in the PR body, next to the `added to the merge queue` line. It is the fact that stops a second re-queue; it comes from GitHub (the PR body), not from notes. A body can be replaced (`pr.sh create --body-file` on an existing PR), so the rule also rests on a fact the body cannot erase: `pr.sh queue` reports `requeued` when the PR body has the line for the head commit, or when the timeline holds two or more removals after the head commit's `committedDate`. When GitHub refuses to queue the PR, the line is taken out again, so the one re-queue is not used up, but only after the queue state confirms the PR is neither queued nor merged: after an unclear error (a timeout while GitHub did queue it) the line stays.
- **Phases.** A removed PR whose risk is low or high (`scripts/risk.sh`) and whose head commit the merge gate has not refused is `waiting-fix` (the issue has an open blocker; nothing to do on the PR) or `requeue` (no open blocker, a blocker closed as completed after the removal, the commit not re-queued before: `pr.sh merge <pr> --after <bug>`). A removed PR the gate refused on its head commit is `merge-refused`; an owner-only or unknown-risk one, one with neither a blocker nor a fix on record, and a commit already re-queued after a fix are `queue-removed`: all three go to the owner. `flow.sh idle` does not count `waiting-fix` as work, and `flow.sh next` lists it neither under "Ready for an agent" (the bug that blocks it is the ready work, through `issue.sh ready`) nor under "Waiting on the owner"; a `requeue` is listed under "Ready for an agent" and not under "Waiting on the owner". `queue-removed <sha>: reported to the owner` in the notes still ends the work for a removal that has no fix in code.
- **Facts.** `flow.sh facts` carries `fixed_blockers` (blockers closed as completed, with `closed_at`), read from GraphQL because `gh issue view` shows neither the state reason nor the closing time; `pr.sh queue` returns `removed_at` and `requeued`.

## Consequences

- **Positive:** a flaky or broken check stops removing PRs at random: it becomes a bug, which is fixed. The factory is not stalled behind one removal, and the owner is asked only when a commit fails twice.
- **Negative:**
  - The re-queue waits for the bug fix to merge, which can take a full ticket round.
  - A removal whose cause is wrongly judged "outside" costs one extra queue run; the second removal goes to the owner.
  - `fixed_blockers` costs one more read for an issue whose PR was removed.
- **Follow-ups:** the owner may read the `re-queued` lines in PR bodies after the fact.
- *Amendment of 12 November 2026:*
  - **Positive:** a PR removed by a flaky test waits for a small quarantine PR, not for the full fix; the flaky test keeps running where everyone can see it; the one-week rule of `TESTING.md §8` is checked by a script instead of remembered.
  - **Negative:** a test in quarantine guards nothing for up to a week; an expired entry fails every PR until its fix is merged; each test runner needs its own list reader, and the `Quarantine` job costs runner minutes; until pilot setup an agent can quarantine a test without the owner (step 6), which the owner reads after the fact.
  - **Follow-ups:** the quarantine lists, the `check.sh` rule and the `Quarantine` job per runner, `TESTING.md §8`, `WORKFLOW.md §7`, and the `work` skill's `queue-removed` step (the quarantine ticket) are tickets of their own; the ones that touch CI, the skill or the files that skip tests are owner-only. Until the list of a runner exists, its flaky tests go through decision steps 1 to 5 as before. The `quarantine` group in `scripts/high-risk-paths.txt` and the tags of step 4 come with the first list.

## Alternatives considered

| Option | Why not |
|---|---|
| Retry a flaky check once, without a fix | It hides flakes, which keep removing PRs at random. |
| Merge `main` into the PR branch after the fix | It reruns the full PR CI (iOS, Android) and the preview smoke for nothing. The queue already tests on the latest `main`, and ADR-018 decision 6 says nobody updates a branch for being behind. |
| The owner re-queues (today) | It stops the factory on a cause an agent can fix. |
