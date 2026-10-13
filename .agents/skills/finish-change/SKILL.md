---
name: finish-change
description: 'Clean up after a Trainer Hub PR is merged: verify the merge, stop processes started for the change, remove the integration and ticket worktrees, delete local and remote branches, prune, and check the spec issue, the Railway PR environment and FEATURES.md. Use when a PR has been merged or closed, or when asked to "clean up", "finish" or "wrap up" a change.'
argument-hint: 'The branch name or PR number'
---

# Finish a change

The cleanup checklist from `docs/engineering/WORKFLOW.md §5`. Run it from the **main checkout**, not from inside the worktree you're removing.

## 1. Confirm it's merged

```bash
gh pr view <branch-or-number> --json number,state,mergedAt,headRefName,headRefOid
```

Continue only if `state` is `MERGED`, or `CLOSED` and the user confirms the work should be dropped. Otherwise stop and report.

Then check that nothing local is missing from the PR: `git rev-parse <branch>` must equal `headRefOid`. If it differs, the branch has commits the PR doesn't contain; stop and ask the user before deleting anything.

## 2. Stop what the change started

Stop the dev servers, watchers, simulators/emulators and Docker containers this change started (by PID, never by name). The Postgres container from `pnpm db:up` is shared by all worktrees: leave it running if other worktrees still exist.

## 3. Remove the worktrees and branches

First any ticket worktrees and branches `/implement-spec` left behind (`.worktrees/<slug>--<issue>`, branches `<branch>--<issue>`), while the integration branch still exists to compare against:

```bash
git switch main && git pull --ff-only
git worktree list                                  # find the change's worktree paths
git branch --list '<branch>--*'                    # leftover ticket branches
git branch --merged <branch> --list '<branch>--*'  # the ones safe to delete
```

For each leftover ticket branch that is merged into the integration branch: `git worktree remove <ticket-worktree>` (if it has one) and `git branch -D <ticket-branch>`. Ask before deleting one that isn't merged.

Then the integration branch:

```bash
git -C <worktree-path> status --short              # must be empty; otherwise stop and ask
git worktree remove <worktree-path>
git branch -D <branch>                             # -D is needed after a squash merge
git push origin --delete <branch>                  # fine if GitHub already deleted it
git worktree prune
git fetch --prune
```

The worktree path is `.worktrees/<slug>`, or the folder your tool created for the session.

## 4. Check what's left

- [ ] Temporary files, scratch scripts and debug output are gone.
- [ ] The Railway PR environment `pr-<number>` is deleted (Railway deletes it on merge or close; check the dashboard). Scratch Railway services or environments created for the change are deleted (`docs/engineering/ENVIRONMENTS.md`).
- [ ] The spec issue and its tickets are closed (`gh issue view <spec> --json state,subIssuesSummary`). Close any the PR missed, with a comment linking the PR.
- [ ] On `main`, `docs/product/FEATURES.md` shows the new status and its ID links the spec issue. If not, report it: fixing it is a new `docs/<slug>` change, never an edit on `main`.
- [ ] `git worktree list` shows only changes that are still in progress.

## 5. Report

Tell the user what was removed and what still needs attention.
