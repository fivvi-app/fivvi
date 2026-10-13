---
name: start-change
description: 'Start a new change in Trainer Hub: pick the branch name, create the git worktree, set up the environment, read the feature spec and ADRs, and write the Test plan before coding. Use when starting a feature (F0xx), enabler (E0xx), fix or docs change, or when asked to "start", "pick up" or "begin work on" an item.'
argument-hint: 'F0xx / E0xx / fix / docs, plus a short slug, e.g. "F031 open-gym-booking"'
---

# Start a change

Sets up one change the way `docs/engineering/WORKFLOW.md §2–§4` requires: one change, one branch, one worktree, spec and Test plan first.

## 1. Understand the item

1. Find the ID in `docs/product/FEATURES.md`. Read its row: status, milestone, **Depends on**, spec sections.
2. If a dependency isn't `IMPLEMENTED`, or the milestone hasn't started (`docs/product/ROADMAP.md §5`), stop and tell the user before doing anything else.
3. Read the spec sections in `docs/product/PRODUCT.md`, the feature doc in `docs/features/` if it exists, and the ADRs the change touches (`docs/decisions/`).
4. Check that nothing in it falls under `PRODUCT.md §53` (MVP exclusions).

## 2. Create the branch and worktree

1. Branch name (`WORKFLOW.md §2`): `feature/F0xx-<slug>[-ios|-android]`, `fix/F0xx-<slug>` or `fix/<slug>`, `chore/E0xx-<slug>`, `docs/<slug>`. The slug is short kebab-case English.
2. `git worktree list`. If 4 or more change worktrees are open, stop and ask the user (`WORKFLOW.md §4`, parallel limit).
3. **Already in an isolated worktree** that your tool created for this session: `git rev-parse --path-format=absolute --git-dir` differs from `git rev-parse --path-format=absolute --git-common-dir`, `git symbolic-ref --short HEAD` is **not** `main`, and the worktree is clean and based on the latest `origin/main`. Then rename its branch with `git branch -m <branch>` and work there. Never rename `main`.
4. **Otherwise**, from the main checkout:

   ```bash
   git fetch origin
   git worktree add .worktrees/<branch-without-type-prefix> -b <branch> origin/main
   git -C .worktrees/<branch-without-type-prefix> branch --unset-upstream   # never track main
   ```

5. Work only inside that worktree from now on. The edit guard (`.claude/settings.json`) blocks edits on `main`.

## 3. Set up the worktree

```bash
pnpm install
cp packages/database/.env.example packages/database/.env   # only if the change touches the database or API
pnpm db:up                                                 # shared Postgres container; fine if it's already running
```

Every worktree needs its own `.env` (git-ignored). Never put real data or production secrets in it.

## 4. Spec and Test plan first (F0xx)

1. No feature doc yet: copy `docs/features/_TEMPLATE.md` to `docs/features/F0xx-<slug>.md` and fill it from the spec. Ask the user about anything the spec leaves open; don't invent requirements.
2. Write the **Test plan**: every acceptance criterion → layer → test file and name (`docs/engineering/TESTING.md §6`), using the checklist in `TESTING.md §3`.
3. Set the status to `IN PROGRESS` in the feature doc and in `FEATURES.md`.
4. Commit this first: `docs(F0xx): add test plan`.

For E0xx, fix and docs changes, write the expected tests (or "docs only") in the first commit message or a short note instead. A bug fix starts with a failing regression test.

## 5. Report

Tell the user: branch, worktree path, what you read, the Test plan (or the planned tests), open questions, and the first small step you'll implement.
