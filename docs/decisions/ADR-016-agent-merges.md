# ADR-016: Agents merge low-risk PRs

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-13 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | ROADMAP.md §4.3, M4 (Gate G2), §16 v1.12; WORKFLOW.md §3, §4, §7; ENVIRONMENTS.md §4; ADR-011; issue #28 |

## Context

Every ticket ended at "the owner merges". Agents already build, self-review, open the PR, wait for CI and smoke-check the preview; the owner's merge was the only step left, and most PRs it waits on can't break anything that matters. The owner wants a software factory: agents take approved work all the way to `main` and stop only for what really needs the owner.

What changed to make this possible:

- The owner moved to GitHub Pro, so a **ruleset** can enforce the checks on `main`. Before, nothing did (`WORKFLOW.md §7` named them "intended").
- The flow is already deterministic: `flow.sh`, `pr.sh` and tested `jq` decisions (`ROADMAP.md` v1.9).

What must not change:

- Agents never approve PRs, push to `main` or force-push. Agent review stays local; GitHub CI runs only deterministic checks (`WORKFLOW.md §4`).
- Railway deploys `main` to production (ADR-011, `ENVIRONMENTS.md §4`). Until G2 production holds no real personal data; from G2 it holds the owner's real timetable and real names.

## Decision

Agents merge a PR when a script finds it **low-risk** and every condition of the **merge gate** holds. Everything else waits for the owner. Decided by the owner on 13 October 2026 (#28).

1. **Risk is decided by a script, never by an agent's judgment.** `scripts/risk.sh <pr>` classifies a PR as high-risk when it changes, adds, deletes or renames a path in `scripts/high-risk-paths.txt`, or when its issue or that issue's parent spec has the `owner-merge` label. It prints the reasons. The pure decision is `scripts/risk.jq`. The high-risk groups:
   - auth; tenant data (`packages/database`: schema, migrations, RLS); health notes; `docs/legal`; billing and payments;
   - product and decision docs: `docs/product`, `docs/decisions`;
   - the factory's own guardrails, so agents can never loosen their own rules: `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `.agents/`, `.claude/`, `.github/`, `.githooks/`, `scripts/`;
   - dependencies and infrastructure, for supply-chain risk and paid dependencies: every `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `Dockerfile`s and `.railway/`.

   The list lives in one versioned file inside a high-risk path (`scripts/`), so changing it is itself high-risk. A malformed line in it is an error, not a rule that is skipped.
2. **GitHub enforces the required checks.** The ruleset `.github/rulesets/main.json` requires a PR, the five CI jobs of `WORKFLOW.md §7` and an up-to-date branch on `main`, and blocks force-pushes and deletion. `.github/repo-settings.json` allows squash merges only and no auto-merge, and holds the `spec-approved` and `owner-merge` labels. `scripts/github-settings.sh apply` applies both files, idempotently.
3. **The merge gate.** `scripts/pr.sh merge` squash-merges the PR and deletes its branch only when all of these hold; otherwise it merges nothing, prints why and exits 1, and the PR stays for the owner. The pure decision is `scripts/merge-gate.jq`. The gate fails closed: when a fact can't be read (risk, review threads, the PR body, the comparison with `main`), it merges nothing.
   - The PR is low-risk (1).
   - Every check on the head commit passed (or was skipped), and the five required ones exist.
   - Both local reviewers (standards and spec) were clean on the head commit: no must-fix or should-fix finding. `pr.sh reviewed` records this in the PR body with the commit's SHA, the way `pr.sh smoke` records its result. Any later push makes the record stale.
   - `pr.sh smoke` recorded for the head commit that the Railway preview passed, or that the PR has no preview. A missing record fails.
   - The branch is up to date with `main`.
   - No unresolved review threads. More than 100 threads count as unknown, so the gate fails.
   - The PR is open, ready for review (not a draft) and targets `main`.

   When the only failure is that the branch is behind `main`, the agent merges `origin/main` into the branch and continues. The new head commit makes the self-review and smoke records stale, so the self-review and the smoke check run again on it before `pr.sh merge`.
4. **Where it runs.** Phase 1 is local: the owner says "run the factory" and the `work` skill works through every ready ticket until only owner items remain (`flow.sh next` lists them). Running unattended in GitHub Actions is a separate, later decision. There is still no agent review in GitHub CI.
5. **Spec approval is a label.** The owner approves a spec by adding `spec-approved`. Tickets are cut and built only for approved specs (`flow.sh` phase `needs-approval`; `issue.sh create ticket` refuses an unapproved spec), and tickets cut from an approved spec are `ready-for-agent` at once. A material change to an approved spec (acceptance criteria or scope) removes the label: `issue.sh update` does it unless `--minor` is passed for a typo fix.
6. **Production releases.** Before G2 an agent merge is a production release. From G2 (real names) the owner approves production releases separately; this is a G2 exit criterion (`ROADMAP.md` M4). The release step is built before G2, not now.

The parallel limit stays at three tickets. The owner keeps merging their own high-risk PRs.

## Consequences

- **Positive:** most tickets reach `main` without waiting for the owner, and the owner's attention goes to specs to approve, high-risk PRs and open questions (`flow.sh next`, "Waiting on the owner"). The checks on `main` are now enforced, also for the owner. Risk and the merge gate are deterministic and tested, so every merge decision can be explained from its printed reasons.
- **Negative:**
  - The merge gate runs in the agent's own session; GitHub can't tell a gated merge from any other merge with the same token. The ruleset is the hard floor (PR, green CI, up to date); the rest relies on agents following `AGENTS.md`. Because the guardrails are high-risk paths, a PR that changes the gate, the path list or the rules always goes to the owner.
  - Paths decide risk. Auth, health notes and billing aren't built yet, so they are matched by name (`*auth*`, `*note*`, `*billing*`, `*payment*`); a file outside those names is low-risk even if it touches such data. Add paths when the code lands, and label sensitive specs `owner-merge`.
  - Until G2, an agent merge deploys production, which holds no real personal data until then.
  - Existing specs need `spec-approved` before their tickets are ready again. After `scripts/github-settings.sh apply`, the orchestrator lists the open specs without `spec-approved` for the owner to approve.
  - The processor agreement promised that the owner approves every merge (`docs/legal/verwerkersovereenkomst.md`, measure T12). The owner approved new wording on 13 October 2026, in Dutch and English: the owner approves every merge of a high-risk change; other changes merge after the required CI checks and two agent reviews.
- **Follow-ups:**
  - Build the separate production-release approval before G2 (decision 6).
  - Decide later whether the factory runs unattended in GitHub Actions (decision 4).
  - Renaming a CI job means changing `WORKFLOW.md §7`, the ruleset and re-applying it in the same PR (a test compares the ruleset with `ci.yml`).

## Alternatives considered

| Option | Why not (now) |
|---|---|
| The owner keeps merging every PR | The owner's merge becomes the bottleneck for changes that carry no real risk. |
| Agents judge the risk of their own PR | Not deterministic or auditable, and an agent could talk itself into merging a guardrail change. |
| GitHub auto-merge | Not allowed (`AGENTS.md`), and GitHub can't see risk, the local self-review or the preview smoke check. |
| A required code-owner review for high-risk paths | Agents open PRs with the owner's account, and GitHub doesn't let an author approve their own PR, so the owner's own high-risk PRs would be blocked. |
| Run the factory in GitHub Actions now | It needs agent credentials in CI and an unattended review setup; decided later, separately (decision 4). |

## References

- Issue #28: the decisions and acceptance criteria.
- [GitHub rulesets REST API](https://docs.github.com/en/rest/repos/rules)
