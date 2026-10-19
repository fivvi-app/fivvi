# Issue tracker: GitHub

Specs and tickets for this repo are GitHub issues in `trainerrrzzz/trainer-hub`. Use `scripts/issue.sh` for every operation; it wraps the `gh` CLI. Bodies and comments are Markdown; pass multi-line text with `--body-file -` and a heredoc. `docs/product/FEATURES.md` stays the registry of IDs, milestones and status: once a spec issue exists, the feature's **ID** links to it.

| Skill term | GitHub |
|---|---|
| Spec (`/to-spec`), issue (`/triage`) | Issue labelled `spec` |
| Spec approved by the owner | `spec-approved` label on the spec |
| Ticket (`/to-tickets`) | Sub-issue of an approved spec, labelled `ready-for-agent` |
| Bug report | Issue labelled `bug` and `needs-triage` |
| Blocked by | Native issue dependency |
| Closed | Closed by the merged PR (`Closes #<n>`), or `scripts/issue.sh close` |

## Conventions

- **Create**: `scripts/issue.sh create <spec|ticket|bug> --title "..." --body-file - [--parent <n>] [--blocked-by <n>]... [--label <l>]...`
- **Read**: `scripts/issue.sh show <n>` prints labels, assignees, parent, open blockers, sub-issues and the body.
- **Update**: `scripts/issue.sh update <n> [--title "..."] [--body-file -] [--minor]` replaces the title or body. On an approved spec it removes `spec-approved`, so the owner approves the change; pass `--minor` only for a typo fix that changes no acceptance criterion or scope.
- **Comment**: `scripts/issue.sh comment <n> --body-file -`
- **Apply / remove labels**: `scripts/issue.sh label <n> --add "..." --remove "..."`
- **Link**: `scripts/issue.sh block <n> --by <m>`; a parent is set with `create --parent`.
- **Frontier**: `scripts/issue.sh ready [--parent <spec>]` lists open, unassigned `ready-for-agent` tickets with no open blocker whose spec is approved.
- **Claim**: `scripts/issue.sh claim <n>` (`scripts/flow.sh start` does it).
- **Close**: `scripts/issue.sh close <n> [--comment "..."] [--not-planned]`

Write titles and bodies in English, in the vocabulary of `GLOSSARY.md`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `scripts/issue.sh show 42`.

## Trainer Hub rules for specs (`/to-spec`)

A spec issue is the requirement of record for one feature (`F0xx`) or enabler (`E0xx`). The owner reviews it on GitHub and approves it with the `spec-approved` label; tickets are cut only after that (`scripts/issue.sh create ticket` refuses an unapproved spec, `scripts/flow.sh` reports `needs-approval`).

- **Title:** `[F0xx] <Feature name from FEATURES.md>`. Use the ID from `FEATURES.md`. A feature that isn't in the registry yet first gets the next free ID in a small `docs/` PR that adds its row as `PLANNED` (`ROADMAP.md §15`), so two parallel specs never take the same ID.
- **Labels:** `spec` (`scripts/issue.sh create spec` sets it). A spec that touches auth, tenant data, health notes, legal or money also gets `owner-merge` when it is created: `scripts/issue.sh create spec --title "..." --body-file - --label owner-merge`. Until their code exists, `scripts/high-risk-paths.txt` matches those areas only by name (ADR-016), so the label is what sends every PR of such a spec to the owner. The owner adds `spec-approved`, and may add `owner-merge` to any other spec when every PR of it must be merged by the owner whatever paths it touches. Never remove `owner-merge`.
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

- **Title:** `[F0xx] <slice>`. Each ticket is a sub-issue of its approved spec (`--parent`), with native blocking edges (`--blocked-by`), labelled `ready-for-agent` (`scripts/issue.sh create ticket` sets it).
- Each ticket has an `## Acceptance criteria` checklist; `scripts/flow.sh status` reports a ticket without one as `needs-refinement`.
- Vertical slices through DB → API (+ regenerated contract) → web → email, in NL and EN. Each ticket names the spec ACs it delivers (`Delivers: AC2, AC3`).
- A mobile slice is two tickets, one for iOS and one for Android, with the same ACs (platform parity).
- Contract first: a ticket that changes the API blocks the platform tickets that consume it.

## When a skill says "publish to the issue tracker"

Create a GitHub issue with `scripts/issue.sh create`, following the rules above.

## When triage applies an outcome

Every comment `triage` posts starts with its AI disclaimer; `scripts/flow.sh` relies on it to see that a question was answered.

- `ready-for-agent`: write the agent brief into the body with `scripts/issue.sh update <n> --body-file -`, keeping the original intent, with an `## Acceptance criteria` checklist. Not as a comment: the body is what was agreed and what `flow.sh` reads. An agent-ready ticket is self-contained: the behaviour from the user's view and no open product questions (check `docs/product/PRODUCT.md` and `GLOSSARY.md`, otherwise ask).
- `needs-info`: the triage notes go in a comment (`scripts/issue.sh comment`). When the owner isn't in the conversation (the factory), post them without waiting for direction or grilling. The owner answers on the issue; an answer given in the conversation goes on the issue too, as a comment without the disclaimer, so the issue holds it. Ask plain questions the owner can answer without writing a spec: yes/no or pick one, each with a concrete example to confirm or correct. `scripts/flow.sh status` reports `waiting` until a comment without the disclaimer follows the notes, then `answered`: triage it again and remove `needs-info`.
- `ready-for-human`: one comment saying what the owner must do (accounts, legal, decisions, store submissions).
- `wontfix`: `scripts/issue.sh close <n> --not-planned --comment "..."`.

## When a skill says "fetch the relevant ticket"

`scripts/issue.sh show <n>`.
