# ADR-018: Merges go through the merge queue

| | |
|---|---|
| **Status** | Proposed; the rule that agents add only low-risk PRs (context and decision 4) amended by [ADR-021](ADR-021-agents-queue-high-risk.md) and [ADR-023](ADR-023-owner-out-of-the-per-pr-loop.md) |
| **Date** | 2026-10-19; decision 4 amended 2026-10-21 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | Amends ADR-016 (decisions 2 and 3); WORKFLOW.md §3, §4, §7; ENVIRONMENTS.md §4; ADR-011; issue #119 (supersedes the idea of #113) |

## Context

Retro of 15 to 17 October 2026: PRs kept falling behind `main`, and each needed a "merge `main`, review again, push, wait for CI" round before the merge. The ruleset of ADR-016 required an up-to-date branch, so the last PR to merge forced every other open PR to repeat the round (about 15 rounds in one session). Reviews of conflict-free merges found nothing that `scripts/check.sh` or CI would not have caught.

The repo now lives in the organisation `trainerrrzzz`, and merge queues are available for public repositories owned by an organisation. A merge queue gives what "require branches to be up to date" gave, without the manual round: GitHub builds a temporary branch with the PR on top of the latest `main`, runs the required checks on it, and merges only when they pass.

What must not change (ADR-016): agents never approve PRs, push to `main`, force-push or enable auto-merge; the owner adds high-risk PRs; the merge gate decides for agents.

> **Amended by [ADR-021](ADR-021-agents-queue-high-risk.md) (24 October 2026):** until G2 the owner adds only the owner-only PRs to the queue; agents also add a high-risk PR that is not owner-only, when the whole merge gate holds.

Facts checked against GitHub's documentation on 2026-10-19:

- **`merge_group` event** (events that trigger workflows). Runs a workflow when a PR is added to a merge queue. The only activity type is `checks_requested`. `GITHUB_SHA` is the SHA of the merge group and `GITHUB_REF` its ref (`refs/heads/gh-readonly-queue/main/pr-<n>-<sha>`). The workflow must list `merge_group` as a trigger, or "status checks will not be triggered when you add a pull request to a merge queue. The merge will fail as the required status check will not be reported." The `branches` filter applies to the base branch. The payload (`merge_group` in the webhook payloads) has `head_sha` (the merge group), `head_ref`, `base_ref` and `base_sha` ("the SHA of the merge group's parent commit"), plus `head_commit`. `base_sha` is read as `github.event.merge_group.base_sha`.
- **`merge_queue` ruleset rule** (REST API, rules). Parameters, all required: `merge_method` (`MERGE`, `SQUASH`, `REBASE`), `grouping_strategy` (`ALLGREEN`: the commit of every queued PR in the group must pass the required checks; `HEADGREEN`: only the head of the group), `max_entries_to_build` (PRs requesting checks at the same time), `max_entries_to_merge` and `min_entries_to_merge` (group size), `min_entries_to_merge_wait_minutes` (how long to wait for the minimum group size) and `check_response_timeout_minutes` (how long to wait for a required check before assuming it failed).
- **`gh pr merge` on a branch that requires a merge queue**, as the GitHub CLI manual describes it ("Merging a pull request with a merge queue"; what gh really sends is in the next fact). No merge strategy is required. If the required checks have passed, the PR is added to the queue. If they have not, **auto-merge is enabled** instead. `--auto` is auto-merge, and `--admin` bypasses the queue. The CLI cannot remove a PR from the queue or show the queue; that is done on GitHub, and the GraphQL API shows `isInMergeQueue`, `isMergeQueueEnabled`, `mergeQueueEntry`, `autoMergeRequest` and the `AddedToMergeQueueEvent` and `RemovedFromMergeQueueEvent` timeline items.
- **How `gh pr merge` queues** (checked in the source of gh 2.96.0, `pkg/cmd/pr/merge`, on 2026-10-21). On a branch with a merge queue it ignores the strategy flag (it warns "The merge strategy for main is set by the merge queue") and always sends the `enablePullRequestAutoMerge` mutation, also without `--auto`. With `allow_auto_merge` `false` GitHub rejects it ("Auto merge is not allowed for this repository"). The GraphQL mutation `enqueuePullRequest` (`pullRequestId`, `expectedHeadOid`) adds a PR to the queue directly, without auto-merge.
- **Required checks must report on `merge_group` runs.** The merge queue waits for the required checks on the temporary branch. A check that never reports times out and the PR is removed. A job skipped by an `if` counts as passed, as on a PR. Removal reasons: a failing check on the merge group, the timeout, a user removing the PR, or a branch protection failure that could not be resolved.
- **Railway** deploys the branch `main` with "Wait for CI" (`.railway/railway.ts`: `github(REPO, { branch: 'main', checkSuites: true })`), and PR environments are created for open PRs (`ENVIRONMENTS.md §1`, §4). A `gh-readonly-queue/*` branch is neither, so nothing deploys from it and nothing breaks.

## Decision

Merges into `main` go through the merge queue (squash). Agents add low-risk PRs to the queue; the owner adds high-risk PRs. Decided by the owner for issue #119.

> **Amended by [ADR-021](ADR-021-agents-queue-high-risk.md) (24 October 2026):** until G2 agents add low-risk PRs and high-risk PRs that are not owner-only; the owner adds the owner-only ones. In decision 4 "a high-risk PR is refused as before; the owner adds it with 'Merge when ready'" now holds for an owner-only PR only.

1. **The ruleset requires the merge queue and no longer requires an up-to-date branch.** `.github/rulesets/main.json` gets a `merge_queue` rule with `merge_method: SQUASH`, `grouping_strategy: ALLGREEN`, `max_entries_to_build: 3` (the parallel limit of tickets, `WORKFLOW.md §4`), `max_entries_to_merge: 1` (one PR, one squash commit, one production deploy, as before), `min_entries_to_merge: 1`, `min_entries_to_merge_wait_minutes: 5` and `check_response_timeout_minutes: 60`. A check starts after `Detect changes` (`timeout-minutes: 5`), and the longest native job, `Android`, times out after 45 minutes (`iOS` after 30; a cold `iOS` run takes about 25, see `WORKFLOW.md §7`). So 60 is above 5 + 45: a hung job fails on its own timeout, not by the queue's. `strict_required_status_checks_policy` is `false`. The five required checks, the PR rule (squash only), force-push and deletion blocks stay. `allow_auto_merge` stays `false`. `scripts/github-settings.sh apply` applies it.
2. **CI runs on `merge_group`.** `.github/workflows/ci.yml` has `merge_group: types: [checks_requested], branches: [main]`, so the five required checks report on the queue's temporary branch. Runs of merge groups are not cancelled. `Detect changes` compares the merge group's head with `github.event.merge_group.base_sha` (fetched if it is not in the shallow checkout), so the native jobs run only when a native path changed in the group (`scripts/native-jobs.sh`, unchanged), exactly as on a PR. Without a `base_sha` every path counts as changed (all jobs run), never fewer. The `run-native` label belongs to the PR's own run; the merge group runs a native job only when a native path changed.
3. **The merge gate loses "up to date with `main`".** `scripts/merge-gate.jq` and `scripts/pr.sh` no longer check it; the queue tests the PR on the latest `main`. The other conditions of ADR-016 (low-risk, checks passed on the head commit, both `code-review` axes clean, preview smoke-checked, no open threads, ready for review) stay.
4. **`scripts/pr.sh merge` adds the PR to the queue.** When the gate holds and the base branch has a merge queue (`isMergeQueueEnabled`), it sends `enqueuePullRequest` with the head commit as `expectedHeadOid`; without a queue it runs `gh pr merge --squash --match-head-commit <head>` (never `--auto`, never `--admin`). Then it reads the PR's queue state from GitHub, and reports "added to the merge queue (position n)". It records `**Merge queue:** added to the merge queue on <sha>` in the PR body, as an audit trail. It does not delete the branch (deleting the head branch of a queued PR closes it); `flow.sh finish` does after GitHub merged the PR. If GitHub merged at once (no queue on the branch, before the ruleset is applied) it reports the squash-merge and deletes the branch as before. If auto-merge is on afterwards all the same, `pr.sh merge` turns it off again and fails: auto-merge stays forbidden. If it cannot turn it off, it fails and says auto-merge is still on, to be turned off on GitHub. If the gate refuses, it queues nothing and records the refusal, as in ADR-016. A head commit the queue already removed is refused by the gate too (condition "not removed from the queue"): only the owner queues it again, or a push makes it a new commit. A high-risk PR is refused as before; the owner adds it with "Merge when ready".
5. **A removal is visible.** `scripts/pr.sh queue <pr>` reports `queued`, `removed` (with GitHub's reason) or nothing. A PR is `removed` when its last queue event on the timeline is a removal that is not older than the head commit (`committedDate`); a push after the removal makes it stale, like a refusal, and a later removal (the owner queued the new commit) counts again. `flow.sh status` shows the phases `queued` (nothing to do) and `queue-removed` (read the `merge_group` run; fix a cause in the PR and push, otherwise report it, the owner decides; nobody queues the same commit again as it is). `flow.sh next` lists a removed PR under "Waiting on the owner". `flow.sh finish` refuses while a PR is queued or was removed.
6. **Nobody updates a branch for being behind `main`.** A conflict is still resolved on the branch (merge `origin/main`, check, review of the resolution by the `reviewer`, push), because GitHub cannot queue a PR with conflicts.
7. **Rollout order.** ADR, ruleset, workflow and scripts are one PR. Merge it first, while the old ruleset is still in force: `ci.yml` with `merge_group` must be on `main` before the queue exists. Then run `scripts/github-settings.sh apply`. Applying first would require a queue whose required checks never report, so the first queued PR would hang until the timeout. The PR of this ADR is high-risk (`docs/decisions`, `.github/`, `scripts/`), so the owner merges it.

AI still never approves a PR and never turns on auto-merge.

> **Amended 21 October 2026:** decision 4 first ran `gh pr merge --squash --match-head-commit <head>` on the queue branch too. The first real run (PR #176) failed: gh asks for auto-merge there, which `allow_auto_merge: false` rejects. `pr.sh merge` now enqueues the PR with `enqueuePullRequest`, so `allow_auto_merge` stays `false` and no auto-merge request is ever made. The rest of this ADR stands.

> **Amended by [ADR-021](ADR-021-agents-queue-high-risk.md) (24 October 2026):** until G2 `pr.sh merge` also adds a high-risk PR to the queue when it is not owner-only; the merge gate's first condition is "not owner-only", and an owner-only PR is still refused. `max_entries_to_build: 3` limits the checks running at once, not the tickets in progress (there is no fixed limit on those any more).

## Consequences

- **Positive:** no more "merge `main`, review again, push, wait for CI" rounds; the queue tests the combination that will really be on `main` (it also catches semantic breaks of two PRs that merge cleanly, such as a duplicate import); three PRs can be built at the same time; the owner and agents use the same path to `main`.
- **Negative:**
  - A merge takes as long as a full CI run on the combined commit, after the CI run of the PR (a cold `iOS` run is the longest, `WORKFLOW.md §7`). Agents no longer wait for it; `flow.sh status` shows the PR as `queued`, then `merged`.
  - A flaky check in the queue removes the PR and the owner decides whether to queue it again.
  - `flow.sh finish` cannot run in the same session step as `pr.sh merge`; it follows once GitHub merged the PR.
  - The CI minutes of the native jobs may run twice per PR (the PR run, then the merge group), including the macOS `iOS` job.
  - `base_sha` is documented as "the merge group's parent commit". With several queued PRs it is the commit the group sits on, so the diff covers every queued PR's commits at least; a native change in an earlier PR may run a native job for a later PR. That is the safe direction.
- **Follow-ups:**
  - After applying the ruleset, queue a trivial low-risk PR with `pr.sh merge` and check that it merges. The first try (PR #176, 21 October 2026) failed on `allow_auto_merge: false`, which led to `enqueuePullRequest` (see the amendment under Decision); queue PR #176 again once that is on `main`.
  - Check on the first merge that Railway deploys `main` once, after the checks pass on the merged commit ("Wait for CI"), and that no environment is created for a `gh-readonly-queue/*` branch.
  - Revisit `max_entries_to_merge` and `grouping_strategy` if the queue becomes slow; one PR per merge keeps one deploy per PR.
  - #113 (a conflict-free merge of `main` keeps the review) is superseded: that case no longer exists, and a conflict still gets a full review.

## Alternatives considered

| Option | Why not (now) |
|---|---|
| Keep "require branches to be up to date" and an agent that updates branches (#113) | The round was the biggest time sink of the retro; the queue removes it and tests the combination as well. |
| Drop "up to date" without a queue | Two PRs that pass CI alone could break `main` together. |
| GitHub auto-merge | Not allowed (`AGENTS.md`); GitHub cannot see risk, the local review or the preview smoke check. |
| `gh pr merge --admin` or a ruleset bypass actor | Skips the queue and the checks; `bypass_actors` stays empty. |
| `HEADGREEN` grouping | Only the head of a group is checked; with one PR per merge it makes no difference, and `ALLGREEN` is the stricter rule. |
| Group several PRs per merge (`max_entries_to_merge` above 1) | Saves little (builds already run in parallel) and puts several PRs in one production deploy. |
| A third-party merge bot | One more dependency and token for what GitHub does itself. |

## References

- Issue #119: the decisions and acceptance criteria. Issue #113: superseded.
- [Events that trigger workflows: `merge_group`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group)
- [Webhook events and payloads: `merge_group`](https://docs.github.com/en/webhooks/webhook-events-and-payloads#merge_group)
- [REST API endpoints for rules: `merge_queue`](https://docs.github.com/en/rest/repos/rules)
- [Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [Merging a pull request with a merge queue](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/merging-a-pull-request-with-a-merge-queue)
- [`gh pr merge`](https://cli.github.com/manual/gh_pr_merge)
- [GraphQL mutation `enqueuePullRequest`](https://docs.github.com/en/graphql/reference/mutations#enqueuepullrequest)
