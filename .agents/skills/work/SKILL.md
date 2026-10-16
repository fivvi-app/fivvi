---
name: work
description: "Entry point for all delivery work in Trainer Hub: new ideas or features, existing issues (#n), bugs, 'what's next', 'run the factory', PR feedback and merged PRs. Routes each step to the right Matt Pocock skill or script so the user only has to talk. Use whenever the user wants to build, refine, pick up, continue, review, ship, merge or clean up work."
---

# Work

You route; Matt Pocock's vendored skills do the work. Run every script, skill and subagent yourself, in order. Never ask the user to run a command or to remember the next step.

## Rules

- **Facts come from scripts, not memory.** Before acting on an issue run `scripts/flow.sh status <n>` and act on its `Phase`, `Next` and `Hint`. Run it again after each step instead of assuming what changed.
- **GitHub holds what was agreed:** specs, tickets, blocking edges, labels, assignees and PRs. Comment on an issue only when the owner must answer or act. Never post progress, logs or check results there.
- **Working memory is the ticket's notes file** (`flow.sh start` and `status` print its path): decisions, check results, what's left. Update it at every phase change so a fresh session can continue from `flow.sh status`, the notes, git and the PR. Keep no other plan or state files.
- **Run a vendored skill by reading `.agents/skills/<name>/SKILL.md` and following it.** Most are user-invoked only, so you can't load them as tools. Their tracker and docs steps resolve through `docs/agents/`.
- **Keep this conversation lean.** Each ticket is built by a fresh subagent; keep only issue numbers, phases and short reports here.
- **The owner approves specs and merges high-risk PRs** (`docs/decisions/ADR-016-agent-merges.md`). Merge a low-risk PR only with `scripts/pr.sh merge`; it decides, not you. Never approve a PR, merge in any other way, or enable auto-merge. Agent review stays local (`docs/engineering/WORKFLOW.md §4`).
- Keep going while the next phase doesn't need the owner. Stop and report when it waits on a human: a spec approval, a product decision, a high-risk PR or a PR the merge gate refused.

## Route

| The user… | Do |
|---|---|
| mentions an issue (`#57`, a URL, a title) | `scripts/flow.sh status <n>`, then the phase playbook |
| asks what's next or for status | `scripts/flow.sh next`; summarise and propose one item |
| says "run the factory" | **Factory** |
| has a new idea or feature | **Shape** |
| reports a bug | Reproduce it with `.agents/skills/diagnosing-bugs/SKILL.md`, file it with `scripts/issue.sh create bug`, then treat it as a ticket |
| says a PR got comments or was merged | `scripts/flow.sh status <n>` for its issue (the number is in the branch: `<type>/<n>-…`) |
| has a pile of new issues | `.agents/skills/triage/SKILL.md` |
| isn't sure which flow fits | `.agents/skills/ask-matt/SKILL.md` |
| wants codebase upkeep | `.agents/skills/improve-codebase-architecture/SKILL.md` |

## Phase playbook

| Phase | Do |
|---|---|
| `needs-spec` | **Shape** on this issue; publish with `scripts/issue.sh update <n>` instead of creating a new one. Keep its intent and show the new body before writing. |
| `needs-approval` | Report and stop: the owner approves the spec on GitHub with the `spec-approved` label. |
| `needs-tickets` | **Shape** from step 3. If one PR is enough, add `## Acceptance criteria` and the `ready-for-agent` label to the spec itself. Adding ACs is a material change: `issue.sh update` removes `spec-approved`, so the spec waits for the owner to approve it again (`needs-approval`); report and stop, and **Build** it as a ticket once approved. Use `--minor` only for edits that change nothing material. |
| `building` | **Build** every ready ticket in parallel (at most three at a time); `triage` tickets that aren't `ready-for-agent`, one at a time with the user. |
| `needs-refinement`, `answered` | `.agents/skills/triage/SKILL.md` on it, one at a time with the user. |
| `waiting` | Report and stop: the owner answers the `needs-info` question on the issue. |
| `ready`, `in-progress` | **Build** (for `in-progress`, resume from the notes file and the worktree's commits) |
| `draft-pr` | **Ship** from step 2 |
| `changes-requested` | **Review loop** |
| `ready-to-merge` | **Ship** from step 6 |
| `merge-refused` | Report and stop: `pr.sh merge` refused this commit, so the owner decides. Never run `pr.sh merge` on it again; only a fix pushed with `pr.sh create` (a new commit) makes it `ready-to-merge` again. |
| `in-review`, `approved` | Report and stop: high-risk (or risk unknown), so the owner reviews and merges. |
| `merged` | `scripts/flow.sh finish <n>` from the main checkout, then continue with what it reports for the spec. |
| `complete` | Check `FEATURES.md` says `IMPLEMENTED` on `main`, then close the spec with `scripts/issue.sh close <n>`. |
| `abandoned` | Ask the user; act only when they decide. |
| `blocked`, `taken` | Say why and propose something from `scripts/flow.sh next`. |
| `human` | Help without code: research (`.agents/skills/research/SKILL.md`), questions for the owner, a prototype. |
| `done` | Nothing to do. |

## Shape

New work. Keep these steps in this conversation; don't delegate or compact between them.

1. **Grill**: `.agents/skills/grill-with-docs/SKILL.md`. It updates `GLOSSARY.md` and proposes ADRs as decisions settle.
2. **Spec**: `.agents/skills/to-spec/SKILL.md` → a spec issue, following `docs/agents/issue-tracker.md` (`[F0xx]` title, ACs in NL/EN, Test plan, platforms, languages). A spec that touches auth, tenant data, health notes, legal or money gets the `owner-merge` label when you create it: `scripts/issue.sh create spec … --label owner-merge`, so every PR of it goes to the owner (high-risk paths match those areas only by name until their code exists). The owner reviews it and approves it with the `spec-approved` label. Report and stop here; continue with step 3 only once the spec is approved (`flow.sh status` no longer says `needs-approval`).
3. **Tickets**: `.agents/skills/to-tickets/SKILL.md` → sub-issues with blocking edges via `scripts/issue.sh create ticket --parent <spec> [--blocked-by <n>]...`, each with an `## Acceptance criteria` checklist. Size each to merge within a day or two.
4. **Build** the ready tickets unless the user wants to stop.

## Build

Per ticket; run independent tickets in parallel, at most three at a time (`flow.sh start` enforces it).

1. `scripts/flow.sh start <n>` claims it and creates its worktree and notes; it prints the worktree, notes path, `E2E_PORT` and a `Hint` (what this PR changes in `FEATURES.md`, if anything).
2. A fresh subagent runs `.agents/skills/implement/SKILL.md` on the ticket, following `docs/agents/build.md`, with the issue number, worktree, notes path and hint. `implement` builds test-first with `tdd` and reviews its work with `code-review` (standards and spec axes); it reports whether that review is **clean** on its last commit. On `blocked`, stop this ticket and ask the user; when only the owner can answer and they aren't here (**Factory**), `triage` it to `needs-info`.
3. **Ship**.

## Ship

Run `pr.sh` inside the worktree: `cd <worktree> && scripts/pr.sh …`.

1. `pr.sh create --body-file -` with a body shaped by `.agents/skills/pr/SKILL.md`. It runs `scripts/check.sh`, pushes, opens a draft titled after the issue and adds `Closes #<n>`.
2. If the subagent reported `code-review` clean on the pushed commit: `pr.sh reviewed` records it for the head commit. Otherwise skip it; the PR will stay for the owner.
3. `pr.sh wait`: exit 0, CI passed; 1, a check failed: fix it with a fresh subagent running `implement` (**Build** step 2), which reviews again, and push with `pr.sh create` (back to step 2); 2, still running after 20 minutes: report and stop.
4. `pr.sh smoke` checks the Railway preview and records the result for the head commit.
5. `pr.sh ready`, note the PR in the notes file.
6. `scripts/flow.sh status <n>`. On `ready-to-merge`, run `pr.sh merge`: it checks the merge gate and squash-merges only when every condition holds. When it merged, run `scripts/flow.sh finish <n>` from the main checkout and continue with what it reports. When it refuses, it records the refusal and its reasons on the PR for the head commit: report it to the owner and stop, and never retry the merge. The PR stays for the owner (`merge-refused`, under "Waiting on the owner" in `flow.sh next`) until the owner decides or a fix is pushed. Same when the phase is `in-review`. If the only failure is that the branch is behind `main` (nothing is recorded then), merge `origin/main` in the worktree, run `scripts/check.sh`, run `code-review` on the new commit as in `docs/agents/build.md` and continue from step 1 instead.

## Review loop

1. `pr.sh status` and `pr.sh threads` in the worktree.
2. A fresh subagent runs `implement` on the failing checks and threads (**Build** step 2), with the thread ids and text in its brief; it reviews the new commit with `code-review`.
3. Push with `pr.sh create`, then reply to each thread: `pr.sh reply <thread> --body "<what changed>" --resolve` when fixed; without `--resolve` when you disagree, so the owner decides.
4. The push made the review and smoke records stale: continue with **Ship** from step 2.
5. Update the notes file, report.

## Factory

The owner says "run the factory": work through everything that doesn't need the owner, then report what does.

1. `scripts/flow.sh next`.
2. For each issue under "Assigned to you", act on its phase with the playbook (resume `in-progress`, ship `draft-pr`, merge `ready-to-merge`, fix `changes-requested`, clean up `merged`). Skip what waits on a human, including `merge-refused`.
3. For each approved spec in `needs-tickets`, cut its tickets (**Shape** step 3).
4. **Build** the tickets under "Ready for an agent", at most three in progress at a time, each through **Ship** to `pr.sh merge` and `flow.sh finish`. Run `flow.sh next` again after each merge: it unblocks the next tickets.
5. Stop when nothing is ready and every open item waits on the owner. Report the "Waiting on the owner" list from `flow.sh next`, the answered questions to `triage` together (`Triage #n … (answered)`), the PRs merged in this run, the PRs `pr.sh merge` refused with their reasons, and any ticket that stopped as `blocked`.

A PR that `pr.sh merge` refused is reported to the owner, not retried: never merge around a refusal or run `pr.sh merge` again on the refused commit. Only the owner adds `spec-approved`. Add `owner-merge` only when creating a spec that touches auth, tenant data, health notes, legal or money (**Shape** step 2); never remove it. Questions only the owner can answer go on the issue with `needs-info`, posted by `triage`.

## Subagents

A ticket's subagent starts fresh, with none of this conversation. Brief it with pointers, not pasted content: run `.agents/skills/implement/SKILL.md` following `docs/agents/build.md`, the issue number, worktree, notes path and hint, and for a fix the failing checks or threads. Expect the short report `build.md` asks for. Use the tool's general-purpose subagent (Copilot, Claude Code, Codex). Without subagent support, do the same steps inline, one ticket per conversation.

## Context hygiene

- One ticket per subagent; `code-review` runs its two axes in subagents of their own.
- After **Shape**, or when this conversation gets long, start a new one: `scripts/flow.sh status` and GitHub rebuild the picture.
- Share research through the notes file, not through this conversation. `flow.sh finish` deletes it.

## After a build

When a build went sideways (rework, failed checks, review rounds, a refused merge), suggest `.agents/skills/retro/SKILL.md` before the conversation ends.
