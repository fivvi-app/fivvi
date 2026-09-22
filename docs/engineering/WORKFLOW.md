# Engineering Workflow

How every change gets from idea to `main`, and how we clean up afterwards. It applies equally to Claude Code, Codex and humans.

## 1. Golden rules

1. **Never commit directly to `main`.** `main` is always deployable.
2. **One change = one branch = one worktree.** No exceptions, including docs and small fixes.
3. **Clean up when the change is merged.** A finished change leaves no worktree, no branch and no running process behind.
4. **Both languages, every platform the feature touches, or it isn't done.** See the Definition of Done (§6).

## 2. Branch naming

| Type | Pattern | Example |
|---|---|---|
| Feature | `feature/F0xx-<slug>` | `feature/F031-open-gym-booking` |
| Platform slice of a feature | `feature/F0xx-<slug>-ios` / `-android` | `feature/F043-live-logging-ios` |
| Fix | `fix/F0xx-<slug>` or `fix/<slug>` | `fix/F029-hold-expiry-race` |
| Engineering enabler | `chore/E0xx-<slug>` | `chore/E002-ci-pipeline` |
| Docs | `docs/<slug>` | `docs/roadmap` |

- **Issue title:** `[F031] Open Gym public booking`
- **PR title:** `[F031] Implement Open Gym public booking`
- **Commits:** Conventional Commits with the ID as scope, e.g. `feat(F031): hold spot during verification`

## 3. Lifecycle of a change

```bash
# 1. Start from an up-to-date main
git switch main && git pull --ff-only        # (pull once a remote exists)

# 2. Create branch + worktree together
git worktree add .worktrees/F031-open-gym-booking -b feature/F031-open-gym-booking

# 3. Work only inside the worktree
cd .worktrees/F031-open-gym-booking
pnpm install

# 4. Commit in small steps, then open a PR
git push -u origin feature/F031-open-gym-booking
```

- Worktrees live in `.worktrees/<slug>` (git-ignored). The slug is the branch name without the type prefix.
- Update the feature doc and the `FEATURES.md` status **in the same PR**.
- An API change regenerates `packages/contract` (OpenAPI + TS/Swift/Kotlin clients) in the same PR.
- A string change edits only `packages/i18n/*.json` and regenerates the native catalogs in the same PR.
- Merge strategy: **squash merge** into `main` after CI is green, the cross-review is done, and the owner approves.

## 4. Working with AI agents

- **One agent per worktree.** Two agents never share a worktree or a branch.
- **Parallel work limit:** at most 3–4 open worktrees at once, to limit merge conflicts and review load.
- **Before starting, an agent reads:** `AGENTS.md`, the relevant feature spec in `docs/features/`, and the relevant ADRs.
- **Cross-review:** every PR is reviewed by the *other* agent (Claude-written → Codex reviews; Codex-written → Claude reviews) for correctness, tenant isolation, i18n and parity. Findings are fixed before the owner's review.
- **Small PRs:** one feature or one platform slice per PR. Split anything that touches backend + iOS + Android heavily into contract PR → platform PRs.
- **No silent contract breaks:** after a contract freeze (end of M4, end of M7), API changes are additive only.
- **Agents never** push to `main`, force-push shared branches, commit secrets, or edit generated files by hand.

## 5. Cleanup checklist (after merge)

Run from the **main checkout**, not from inside the worktree:

```bash
git switch main && git pull --ff-only
git worktree remove .worktrees/F031-open-gym-booking
git branch -D feature/F031-open-gym-booking          # -D is required after a squash merge; verify it's merged first
git push origin --delete feature/F031-open-gym-booking
git worktree prune
git fetch --prune
```

Also make sure that:

- [ ] Dev servers, watchers, simulators/emulators and Docker containers started for this change are stopped.
- [ ] Temporary files, scratch scripts and debug output are deleted (never committed).
- [ ] Preview deployments and Neon preview branches for this change are removed.
- [ ] `FEATURES.md` shows the new status; the feature doc lists its implementation references (PR link).
- [ ] `git worktree list` shows only the worktrees for changes still in progress.

## 6. Definition of Done

From `PRODUCT.md §86`, extended for native apps. A user-facing feature is **not done** unless:

- [ ] Web behaviour works where required
- [ ] iOS **and** Android behaviour works where required (parity: same screens and states on both)
- [ ] Permissions are correct (Owner / Admin / Trainer / Client)
- [ ] Tenant isolation holds (covered by the isolation suite)
- [ ] Dutch UI exists and has passed the LLM review against `GLOSSARY.md`
- [ ] English UI exists
- [ ] Dates/times localize correctly (nl-NL: `22 september 2026`, `18:00`, Europe/Amsterdam)
- [ ] Relevant emails exist in nl-NL and en
- [ ] No hard-coded user-facing strings (CI enforced)
- [ ] Generated contract and string catalogs are up to date (CI enforced)
- [ ] Tests cover the acceptance criteria (e2e runs in both locales for user flows)
- [ ] Cross-agent review done
- [ ] Feature documentation updated
- [ ] Feature registry status updated
- [ ] Acceptance criteria pass
- [ ] Cleanup checklist (§5) completed after merge
