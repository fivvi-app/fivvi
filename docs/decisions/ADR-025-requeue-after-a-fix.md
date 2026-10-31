# ADR-025: A PR the merge queue removed for a cause outside it is re-queued after the fix

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-31 |
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

## Alternatives considered

| Option | Why not |
|---|---|
| Retry a flaky check once, without a fix | It hides flakes, which keep removing PRs at random. |
| Merge `main` into the PR branch after the fix | It reruns the full PR CI (iOS, Android) and the preview smoke for nothing. The queue already tests on the latest `main`, and ADR-018 decision 6 says nobody updates a branch for being behind. |
| The owner re-queues (today) | It stops the factory on a cause an agent can fix. |
