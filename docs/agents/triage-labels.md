# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's GitHub issues.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Owner needs to evaluate this issue       |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires the owner or another human      |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Trainer Hub additions:

- `spec`: the issue is a feature or enabler spec (`[F0xx]` / `[E0xx]`); its tickets are sub-issues.
- Anything in `docs/product/PRODUCT.md §53` (MVP exclusions) is out of scope for the MVP: triage it as `wontfix` with a pointer to §53, or as a post-MVP idea (`ROADMAP.md §9`) if the owner wants to keep it.
- Owner-only work (accounts, dashboards, legal sign-off, store submissions) is `ready-for-human`.
