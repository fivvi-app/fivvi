# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's GitHub issues.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Owner needs to evaluate this issue       |
| `needs-info`               | `needs-info`         | Waiting on the owner's answer to the triage notes in the comments; holds the issue (`flow.sh`: `waiting`, then `answered`) |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires the owner or another human      |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Fivvi additions:

- `spec`: the issue is a feature or enabler spec (`[F0xx]` / `[E0xx]`); its tickets are sub-issues.
- `spec-approved`: the owner approved the spec. Only then are its tickets cut and built; tickets cut from it get `ready-for-agent` at once. A material change to the spec (acceptance criteria or scope) removes the label, so the owner approves again: `scripts/issue.sh update` does it unless you pass `--minor` (a typo fix). Only the owner adds it.
- `owner-merge`: high-risk work. The PRs of this issue, or of every ticket of this spec, are recorded as high-risk even when their paths are low-risk ([ADR-016](../decisions/ADR-016-agent-merges.md)); until pilot setup agents may add them to the merge queue when the whole merge gate holds, and `pr.sh merge` records the merge in the PR body ([ADR-021](../decisions/ADR-021-agents-queue-high-risk.md), [ADR-023](../decisions/ADR-023-owner-out-of-the-per-pr-loop.md)). A spec that touches auth, tenant data, health notes or money (billing, payments, while payments run in the payment provider's test mode) gets it when it is created (`issue-tracker.md`); the owner may add it to any other issue. Never remove it.
- `owner-only`: only the owner merges the PRs of this issue, or of every ticket of this spec, whatever paths they touch (ADR-021). A spec that touches legal, the agents' own rules (core guardrails) or money once payments can move real money gets it when it is created, instead of `owner-merge` (`issue-tracker.md`); the owner may add it to any other issue. Only the owner removes it.
- `run-native`: runs the `iOS` and `Android` CI jobs on this PR whatever changed (`WORKFLOW.md §7`). CI reads it on the PR's pushes, so add it before you push; re-running a job doesn't pick up a label added later.
- Anything in `docs/product/PRODUCT.md §53` (MVP exclusions) is out of scope for the MVP: triage it as `wontfix` with a pointer to §53, or as a post-MVP idea (`ROADMAP.md §9`) if the owner wants to keep it.
- Owner-only work (accounts, dashboards, legal sign-off, store submissions) is `ready-for-human`.

Every open `ready-for-human` issue also carries one priority and one effort label, so the owner can filter on them (`label:prio-high label:effort-quick`). Set them when you create the issue, and check them again when a blocker closes or a gate moves. The owner may change any of them; keep theirs.

**Priority: the first rule that matches wins.**

1. `prio-low`: blocked by an open issue (its *Can you do it now?* says *Not yet*). Raise it when the blocker closes.
2. `prio-high`: agents need its result for the next specs to be written or built: the current or next milestone, or the M11 commerce specs, which are the critical path to go-live. A task with a long wait (a sign-up, a verification, a supplier's reply) counts here only when agents need its result.
3. `prio-medium`: due by G0 (the M0 exit, which includes the §4.1 discovery tasks) or G2.
4. `prio-low`: everything else (go-live, G4, or later).

**Effort: the owner's own time on the task, added up, meetings included. Waiting for a reply or a verification doesn't count.**

| Label | When |
|---|---|
| `effort-quick` | 15 minutes or less |
| `effort-medium` | More than 15 minutes, up to an hour |
| `effort-big` | More than an hour |

`with-pilot-gym`: at least one step is done with the pilot gym owner, so the owner can batch these into one visit.

Every owner task's body has a *Can you do it now?* section after *Why* (yes, or what it waits on) and numbered steps: where to click, what to type, what to send back.
