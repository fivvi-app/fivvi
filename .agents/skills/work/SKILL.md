---
name: work
description: "Entry point for all delivery work in Trainer Hub: new ideas or features, existing issues (#n), bugs, 'what's next', PR feedback and merged PRs. Runs the scripts, Matt Pocock's skills and the subagents in the right order so the user only has to talk. Use whenever the user wants to build, refine, pick up, continue, review, ship or clean up work."
---

# Work

You orchestrate; the user only talks. Run every script, skill and subagent yourself, in order. Never ask the user to run a command or to remember the next step.

## Rules

- **Facts come from scripts, not memory.** Before acting on an issue run `scripts/flow.sh status <n>` and act on its `Phase`, `Next` and `Hint`. Run it again after each step instead of assuming what changed.
- **GitHub holds what was agreed:** specs, tickets, blocking edges, labels, assignees and PRs. Comment on an issue only when the owner must answer or act. Never post progress, logs or check results there.
- **Working memory is the ticket's notes file** (`flow.sh start` and `status` print its path): decisions, check results, what's left. Update it at every phase change so a fresh session can continue from `flow.sh status`, the notes, git and the PR. Keep no other plan or state files.
- **Run a vendored skill by reading `.agents/skills/<name>/SKILL.md` and following it.** Most are user-invoked only, so you can't load them as tools. Their tracker and docs steps resolve through `docs/agents/`.
- **Keep this conversation lean.** Delegate building and reviewing to subagents; keep only issue numbers, phases and short reports here.
- **The owner approves and merges.** Never approve or merge a PR and never enable auto-merge. Agent review stays local (`docs/engineering/WORKFLOW.md §4`).
- Keep going while the next phase doesn't need the owner. Stop and report when it waits on a human: a product decision, a review or a merge.

## Route

| The user… | Do |
|---|---|
| mentions an issue (`#57`, a URL, a title) | `scripts/flow.sh status <n>`, then the phase playbook |
| asks what's next or for status | `scripts/flow.sh next`; summarise and propose one item |
| has a new idea or feature | **Shape** |
| reports a bug | Reproduce it with `.agents/skills/diagnosing-bugs/SKILL.md`, file it with `scripts/issue.sh create bug`, then treat it as a ticket |
| says a PR got comments or was merged | `scripts/flow.sh status <n>` for its issue (the number is in the branch: `<type>/<n>-…`) |
| has a pile of new issues | `.agents/skills/triage/SKILL.md` |
| wants codebase upkeep | `.agents/skills/improve-codebase-architecture/SKILL.md` |

## Phase playbook

| Phase | Do |
|---|---|
| `needs-spec` | **Shape** on this issue; publish with `scripts/issue.sh update <n>` instead of creating a new one. Keep its intent and show the new body before writing. |
| `needs-tickets` | **Shape** from step 3. If one PR is enough, add `## Acceptance criteria` and the `ready-for-agent` label to the spec itself and **Build** it as a ticket. |
| `building` | **Build** every ready ticket in parallel (at most three at a time); **Refine** tickets that aren't `ready-for-agent`, one at a time with the user. |
| `needs-refinement` | **Refine** |
| `ready`, `in-progress` | **Build** (for `in-progress`, resume from the notes file and the worktree's commits) |
| `draft-pr` | **Ship** from step 2 |
| `changes-requested` | **Review loop** |
| `in-review`, `approved` | Report and stop: the owner reviews and merges. |
| `merged` | `scripts/flow.sh finish <n>` from the main checkout, then continue with what it reports for the spec. |
| `complete` | Check `FEATURES.md` says `IMPLEMENTED` on `main`, then close the spec with `scripts/issue.sh close <n>`. |
| `abandoned` | Ask the user; act only when they decide. |
| `blocked`, `taken` | Say why and propose something from `scripts/flow.sh next`. |
| `human` | Help without code: research (`.agents/skills/research/SKILL.md`), questions for the owner, a prototype. |
| `done` | Nothing to do. |

## Shape

New work. Keep these steps in this conversation; don't delegate or compact between them.

1. **Grill**: `.agents/skills/grill-with-docs/SKILL.md`. It updates `GLOSSARY.md` and proposes ADRs as decisions settle.
2. **Spec**: `.agents/skills/to-spec/SKILL.md` → a spec issue, following `docs/agents/issue-tracker.md` (`[F0xx]` title, ACs in NL/EN, Test plan, platforms, languages). The owner reviews it.
3. **Tickets**: `.agents/skills/to-tickets/SKILL.md` → sub-issues with blocking edges via `scripts/issue.sh create ticket --parent <spec> [--blocked-by <n>]...`, each with an `## Acceptance criteria` checklist. Size each to merge within a day or two.
4. **Build** the ready tickets unless the user wants to stop.

## Refine

An agent-ready ticket is self-contained: the behaviour from the user's view, an `## Acceptance criteria` checklist, no open product questions.

1. `scripts/issue.sh show <n>` and its parent.
2. Grill the user on the gaps only (`.agents/skills/grilling/SKILL.md`). Don't guess product rules: check `docs/product/PRODUCT.md` and `GLOSSARY.md`, otherwise ask.
3. Agree the new body, write it with `scripts/issue.sh update <n> --body-file -`, then `scripts/issue.sh label <n> --add ready-for-agent` (or `ready-for-human` when it needs the owner: accounts, legal, decisions).

## Build

Per ticket; run independent tickets in parallel, at most three at a time (`flow.sh start` enforces it).

1. `scripts/flow.sh start <n>` claims it and creates its worktree and notes; it prints the worktree, notes path, `E2E_PORT` and a `Hint` (e.g. the `FEATURES.md` status this PR must set).
2. **Implementer** with the issue number, worktree, notes path and hint. On `blocked`, stop this ticket and ask the user.
3. **Self-review**: two **reviewers** in parallel, `standards` and `spec`, with the worktree and `origin/main` as base. Send must-fix and should-fix findings to a new implementer. At most two rounds; list what's left in the PR description.
4. **Ship**.

## Ship

Run `pr.sh` inside the worktree: `cd <worktree> && scripts/pr.sh …`.

1. `pr.sh create --body-file -` with a body shaped by `.agents/skills/pr/SKILL.md`. It runs `scripts/check.sh`, pushes, opens a draft titled after the issue and adds `Closes #<n>`.
2. `pr.sh wait`: exit 0, CI passed; 1, a check failed: fix it with an implementer and push with `pr.sh create`; 2, still running after 20 minutes: report and stop.
3. `pr.sh smoke` checks the Railway preview and records the result in the PR body.
4. `pr.sh ready`, note the PR in the notes file, report, stop.

## Review loop

1. `pr.sh status` and `pr.sh threads` in the worktree.
2. An **implementer** addresses the failing checks and threads, with the thread ids and text in its brief.
3. Push with `pr.sh create`. Reply to each thread: `pr.sh reply <thread> --body "<what changed>" --resolve` when fixed; without `--resolve` when you disagree, so the owner decides.
4. Update the notes file, report, stop.

## Subagents

Workers start fresh, with none of this conversation. Brief them with pointers (issue number, worktree, notes path, base ref), not pasted content, and expect short reports.

| Agent | Brief | Use for |
|---|---|---|
| `implementer` | `.agents/agents/implementer.agent.md` | Builds or fixes one ticket in its worktree, test-first; commits, never pushes. |
| `reviewer` | `.agents/agents/reviewer.agent.md` | One review axis of a worktree's diff; read-only. |

Copilot and Claude Code know them as custom agents. In Codex, spawn a subagent and tell it to follow the brief file. Without subagent support, do the same steps inline, one ticket per conversation.

## Context hygiene

- One ticket per implementer, one axis per reviewer.
- After **Shape**, or when this conversation gets long, start a new one: `scripts/flow.sh status` and GitHub rebuild the picture.
- Share research through the notes file, not through this conversation. `flow.sh finish` deletes it.
