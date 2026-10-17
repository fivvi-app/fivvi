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

Trainer Hub additions:

- `spec`: the issue is a feature or enabler spec (`[F0xx]` / `[E0xx]`); its tickets are sub-issues.
- `spec-approved`: the owner approved the spec. Only then are its tickets cut and built; tickets cut from it get `ready-for-agent` at once. A material change to the spec (acceptance criteria or scope) removes the label, so the owner approves again: `scripts/issue.sh update` does it unless you pass `--minor` (a typo fix). Only the owner adds it.
- `owner-merge`: the owner merges the PRs of this issue, or of every ticket of this spec, even when their paths are low-risk ([ADR-016](../decisions/ADR-016-agent-merges.md)). A spec that touches auth, tenant data, health notes, legal or money gets it when it is created (`issue-tracker.md`); the owner may add it to any other issue. Never remove it.
- `run-native`: runs the `iOS` and `Android` CI jobs on this PR whatever changed (`WORKFLOW.md §7`). CI reads it on the PR's pushes, so add it before you push; re-running a job doesn't pick up a label added later.
- Anything in `docs/product/PRODUCT.md §53` (MVP exclusions) is out of scope for the MVP: triage it as `wontfix` with a pointer to §53, or as a post-MVP idea (`ROADMAP.md §9`) if the owner wants to keep it.
- Owner-only work (accounts, dashboards, legal sign-off, store submissions) is `ready-for-human`.
