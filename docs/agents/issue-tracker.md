# Issue tracker: GitHub

Specs and tickets for this repo live as GitHub issues in `thekeyvan/trainer-hub`. Use the `gh` CLI for all operations. `docs/product/FEATURES.md` stays the registry of IDs, milestones and status. Once a spec issue exists, the feature's **ID** links to it; the *Spec* column keeps the `PRODUCT.md` references.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/thekeyvan/trainer-hub/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`. Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`. Normally the merged PR closes the spec and its tickets (one `Closes #<n>` line per issue in the PR body; GitHub only links the first issue after a single keyword).

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## Trainer Hub rules for specs (`/to-spec`)

A spec issue is the requirement of record for one feature (`F0xx`) or enabler (`E0xx`). The owner reviews it on GitHub before tickets are cut.

- **Title:** `[F0xx] <Feature name from FEATURES.md>`. Use the ID from `FEATURES.md`. A feature that isn't in the registry yet first gets the next free ID in a small `docs/` PR that adds its row as `PLANNED` (`ROADMAP.md §15`), so two parallel specs never take the same ID.
- **Labels:** `spec` and `ready-for-agent`.
- **Body:** Matt's spec template, plus these sections after *Solution*:
  - **Feature:** ID, milestone, priority, `PRODUCT.md §…` references, and dependencies. A dependency that isn't `IMPLEMENTED` blocks the spec: stop and tell the user.
  - **Platforms:** checklist of trainer web, trainer iOS, trainer Android, public booking web, client web.
  - **UX:** the screen IDs and flows it implements (`docs/design/`).
  - **Languages:** `Dutch ⬜` / `English ⬜`, ticked when each works (mandatory, `PRODUCT.md §82`).
  - **Acceptance criteria:** `AC1:` … in Given/When/Then, each marked **NL** and/or **EN**. Cover every role that is allowed or denied (Owner, Admin, Trainer, Client, anonymous).
  - **Test plan** (inside *Testing Decisions*): a table mapping every AC to a layer and a named test (`docs/engineering/TESTING.md §6`).
- Use the vocabulary of the root `GLOSSARY.md`. Respect the ADRs in `docs/decisions/`. Nothing from `PRODUCT.md §53` (MVP exclusions).
- Never put real personal data in an issue: GitHub only ever sees synthetic data (`docs/legal/sub-processors.md`).

## Trainer Hub rules for tickets (`/to-tickets`)

- **Title:** `[F0xx] <slice>`. Each ticket is a sub-issue of its spec, with native blocking edges.
- Vertical slices through DB → API (+ regenerated contract) → web → email, in NL and EN. Each ticket names the spec ACs it delivers (`Delivers: AC2, AC3`).
- A mobile slice is two tickets, one for iOS and one for Android, with the same ACs (platform parity).
- Contract first: a ticket that changes the API blocks the platform tickets that consume it.

## When a skill says "publish to the issue tracker"

Create a GitHub issue following the rules above.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's native issue dependencies: `gh api --method POST repos/thekeyvan/trainer-hub/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is `gh api repos/thekeyvan/trainer-hub/issues/<n> --jq .id`. Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children, drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
