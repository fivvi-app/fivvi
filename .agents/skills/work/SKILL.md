---
name: work
description: "Entry point for all delivery work in Fivvi: new ideas or features, existing issues (#n), bugs, 'what's next', 'run the factory', PR feedback and merged PRs. Routes each step to the right Matt Pocock skill or script so the user only has to talk. Use whenever the user wants to build, refine, pick up, continue, review, ship, merge or clean up work."
---

# Work

You route; Matt Pocock's vendored skills do the work. Run every script, skill and subagent yourself, in order. Never ask the user to run a command or to remember the next step.

## Rules

- **Facts come from scripts, not memory.** Before acting on an issue run `scripts/flow.sh status <n>` and act on its `Phase`, `Next` and `Hint`. Run it again after each step instead of assuming what changed.
- **Claims need evidence.** Before you record a manual or owner check result, or write a status claim in `FEATURES.md`, `ROADMAP.md` or on an issue, check it against the code and the data path: `docs/agents/build.md`, **Manual checks**.
- **GitHub holds what was agreed:** specs, tickets, blocking edges, labels, assignees and PRs. Comment on an issue only when the owner must answer or act. Never post progress, logs or check results there.
- **Working memory is the ticket's notes file** (`flow.sh start` and `status` print its path): decisions, check results, what's left. Update it at every phase change so a fresh session can continue from `flow.sh status`, the notes, git and the PR. Keep no other plan or state files.
- **Run a vendored skill by reading `.agents/skills/<name>/SKILL.md` and following it.** Most are user-invoked only, so you can't load them as tools. Their tracker and docs steps resolve through `docs/agents/`.
- **Keep this conversation lean.** Each ticket is built by a fresh `builder` subagent and reviewed by a fresh `reviewer`; keep only issue numbers, phases and short reports here.
- **This conversation runs on the high tier** (models per tool: `docs/agents/build.md`, **Tiers**): shaping (grill, to-spec, to-tickets, triage) happens here, in the main conversation. You start the work on its tier as a subagent: `builder` (mid) builds and fixes, `reviewer` (high) does every code review, `mechanic` (small) does the mechanical work (**Subagents**, `docs/agents/build.md`). If this conversation runs on another tier, say so once and carry on; never run a review or a build here in its place.
- **The owner approves specs and adds owner-only PRs to the merge queue** (`docs/decisions/ADR-016-agent-merges.md`, `docs/decisions/ADR-018-merge-queue.md`, `docs/decisions/ADR-021-agents-queue-high-risk.md`, `docs/decisions/ADR-023-owner-out-of-the-per-pr-loop.md`). Until pilot setup you also add a high-risk PR to the queue when it is not owner-only: low and high risk alike go through `scripts/pr.sh merge` only; it decides, not you, and it records a high-risk merge in the PR body. Never approve a PR, merge in any other way (no `gh pr merge` by hand, no `--admin`), or enable auto-merge (`--auto`). Agent review stays local (`docs/engineering/WORKFLOW.md §4`).
- Keep going while the next phase doesn't need the owner. Stop and report when it waits on a human: a spec approval, a product decision, an owner-only PR, a PR the merge gate refused or a PR the merge queue removed.

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
| `building` | **Build** every ready ticket in parallel (no fixed limit; start no more agents at once than the tool's rate limits allow, and build tickets that change the same files one after the other); `triage` tickets that aren't `ready-for-agent`, one at a time with the user. |
| `needs-refinement`, `answered` | `.agents/skills/triage/SKILL.md` on it, one at a time with the user. |
| `waiting` | Report and stop: the owner answers the `needs-info` question on the issue. |
| `ready`, `in-progress` | **Build** (for `in-progress`, resume from the notes file and the worktree's commits) |
| `draft-pr` | **Ship** from step 2; if the notes file has no `clean on <head sha>`, run **Build** step 3 first |
| `changes-requested` | **Review loop** |
| `ready-to-merge` | **Ship** from step 4. Low-risk and high-risk (agent-queueable) PRs alike: `pr.sh merge` records a high-risk one in the PR body before it queues it. |
| `merge-refused` | Report and stop: `pr.sh merge` refused this commit, so the owner decides. Never run `pr.sh merge` on it again; only a fix pushed with `pr.sh create` (a new commit) makes it `ready-to-merge` again. |
| `queued` | Nothing to do: the PR is in the merge queue and GitHub tests and merges it (`WORKFLOW.md §7`). Report it as queued; check `flow.sh status <n>` again later. Never queue it again. |
| `queue-removed` | GitHub removed the PR from the queue (`flow.sh status` shows the reason). Read the `merge_group` run of its queue branch (`gh run list --event merge_group`). A cause in the PR: a `builder` fixes it (**Build** step 2), a `reviewer` reviews (**Build** step 3), push with `pr.sh create` (a new commit makes the removal stale) and continue with **Ship** from step 2. A flaky check or a timeout: report and stop, the owner decides. Never queue the same commit again yourself. |
| `in-review`, `approved` | Report and stop: owner-only (or risk unknown), so the owner reviews and adds it to the merge queue. A high-risk PR that an agent may queue is `ready-to-merge`, not `in-review`. |
| `merged` | `scripts/flow.sh finish <n>` from the main checkout, then continue with what it reports for the spec. GitHub merged it, after the queue if it was queued. |
| `complete` | Check `FEATURES.md` says `IMPLEMENTED` on `main`, then close the spec with `scripts/issue.sh close <n>`. |
| `abandoned` | Ask the user; act only when they decide. |
| `blocked`, `taken` | Say why and propose something from `scripts/flow.sh next`. |
| `human` | Help without code: research (`.agents/skills/research/SKILL.md`), questions for the owner, a prototype. |
| `done` | Nothing to do. |

## Shape

New work. Keep these steps in this conversation; don't delegate or compact between them.

1. **Grill**: `.agents/skills/grill-with-docs/SKILL.md`. It updates `GLOSSARY.md` and proposes ADRs as decisions settle.
2. **Spec**: `.agents/skills/to-spec/SKILL.md` → a spec issue, following `docs/agents/issue-tracker.md` (`[F0xx]` title, ACs in NL/EN, Test plan, platforms, languages). A spec that touches auth, tenant data, health notes or money (billing, payments, while payments run in the payment provider's test mode) gets the `owner-merge` label when you create it (`scripts/issue.sh create spec … --label owner-merge`): its PRs are recorded as high-risk and agents may queue them. A spec that touches legal or the agents' own rules (the core guardrails) gets `owner-only` instead (`--label owner-only`): every PR of it goes to the owner. Once `@agent-queue billing` is gone from `scripts/high-risk-paths.txt` (payments can move real money), money specs get `owner-only` again. High-risk paths match those areas only by name until their code exists. The owner reviews it and approves it with the `spec-approved` label. Report and stop here; continue with step 3 only once the spec is approved (`flow.sh status` no longer says `needs-approval`).
3. **Tickets**: `.agents/skills/to-tickets/SKILL.md` → sub-issues with blocking edges via `scripts/issue.sh create ticket --parent <spec> [--blocked-by <n>]...`, each with an `## Acceptance criteria` checklist. Size each to merge within a day or two. A spec that waits on another spec is cut too (`needs-tickets`): each ticket is blocked by the other spec's tickets it needs, or by that spec itself (`docs/agents/issue-tracker.md`, **Fivvi rules for tickets**).
4. **Build** the ready tickets unless the user wants to stop.

## Build

Per ticket; run independent tickets in parallel. There is no fixed limit; `flow.sh start` enforces one only when the session sets `FIVVI_MAX_TICKETS`. Start no more agents at once than the tool's rate limits allow, and build tickets that change the same files one after the other.

1. `scripts/flow.sh start <n>` claims it and creates its worktree and notes; it prints the worktree, notes path, `E2E_PORT` and a `Hint` (what this PR changes in `FEATURES.md`, if anything).
2. A fresh `builder` subagent runs `.agents/skills/implement/SKILL.md` on the ticket, following `docs/agents/build.md`, with the issue number, worktree, notes path and hint. It builds test-first with `tdd` and commits; it does **not** review its own work. On `blocked`, stop this ticket and ask the user; when only the owner can answer and they aren't here (**Factory**), `triage` it to `needs-info`.
3. **Review**: a fresh `reviewer` subagent runs `.agents/skills/code-review/SKILL.md` (standards and spec axes) on the head commit, following `docs/agents/build.md`, with the issue number, worktree, notes path and the scope (`docs/agents/build.md`, **Review**): `full` for the first review; for every later one (a fix, a CI repair, a merge of `origin/main`), `since <sha>` of the last review with its must-fix and should-fix findings. Record each verdict in the notes file as `reviewed <sha> (<scope>): clean` or `not clean`; the next scope starts there. It reports its findings and the verdict `clean on <sha>` or `not clean on <sha>`. For must-fix and should-fix findings, start a fresh `builder` with the findings in its brief (**Build** step 2), then a `reviewer` on the new head commit. At most two fix rounds; the review after the second is review-only: fix nothing, list what's left in the notes file. Note each round in the notes file. Only a `reviewer` verdict can make a review clean.
4. **Ship**.

## Ship

Run `pr.sh` inside the worktree: `cd <worktree> && scripts/pr.sh …`.

1. `pr.sh create --body-file -` with a body shaped by `.agents/skills/pr/SKILL.md`. It runs `scripts/check.sh`, pushes, opens a draft titled after the issue and adds `Closes #<n>`. Every later push is a plain `pr.sh create`, without `--body-file`: on an open PR it keeps the body.
2. If a `reviewer` reported `clean on <sha>` for the pushed head commit: `pr.sh reviewed` records it for the head commit. Otherwise skip it; the PR will stay for the owner (`ship` stops at `ready`, which names the missing review).
3. `pr.sh ship` runs `wait`, `smoke` and `ready` in order and stops at the first failure with its exit code; it records nothing itself, so step 2 comes first. `ready` refuses unless every CI check passed on the head commit and the clean review and the smoke are recorded for it. At the end it prints the step durations of the native jobs. Never chain `wait`, `smoke` and `ready` by hand. On exit 0 the PR is ready for review: note it in the notes file. Otherwise read the step that failed:
   - `wait` exit 1, a check failed: a `mechanic` digs the failing log out and reports the failing step and first error, a fresh `builder` fixes it (**Build** step 2), a `reviewer` reviews the new head commit (**Build** step 3), and push with `pr.sh create` (back to step 2). Exit 2, still running after the timeout (20 minutes, 45 when iOS or Android run): report and stop.
   - `smoke` fails: the preview is not healthy, or Railway did not deploy it and the `railway` CLI is missing or logged out. With the CLI, smoke redeploys a skipped preview itself, in the PR's own environment only; without it, a preview that deployed is still health-checked. Report and stop.
   - `ready` refuses: it names what is missing. Record or fix that and run `pr.sh ship` again; a PR left without a clean review stays a draft for the owner.
4. **Merge.** `scripts/flow.sh status <n>`. On `ready-to-merge`, run `pr.sh merge`: it checks the merge gate and adds the PR to the merge queue only when every condition holds, then records the queued commit on the PR (for a high-risk PR it first records `**High-risk agent merge:**` with the commit and the reasons). Being behind `main` is no reason to wait or to merge `main` in: the queue tests the PR on the latest `main`. Once it says "added to the merge queue", report the PR as queued and move on: GitHub squash-merges it when the checks pass on the combined commit (`WORKFLOW.md §7`). Later `flow.sh status <n>` says `merged` (then `scripts/flow.sh finish <n>` from the main checkout, and continue with what it reports), still `queued` (nothing to do), or `queue-removed` (see the playbook). Never run `gh pr merge` yourself, and never use `--auto` or `--admin`. When the gate refuses, it records the refusal and its reasons on the PR for the head commit: report it to the owner and stop, and never retry the merge. The PR stays for the owner (`merge-refused`, under "Waiting on the owner" in `flow.sh next`) until the owner decides or a fix is pushed. Same when the phase is `in-review` (owner-only, or risk unknown).

## Review loop

1. `pr.sh status` and `pr.sh threads` in the worktree.
2. A fresh `builder` runs `implement` on the failing checks and threads (**Build** step 2), with the thread ids and text in its brief; a `reviewer` then reviews the new commit (**Build** step 3).
3. Push with `pr.sh create` (**Ship** step 1), then reply to each thread: `pr.sh reply <thread> --body "<what changed>" --resolve` when fixed; without `--resolve` when you disagree, so the owner decides.
4. The push made the review and smoke records stale: continue with **Ship** from step 2.
5. Update the notes file, report.

## Factory

The owner says "run the factory", or the scheduled task starts it (every 2 hours on the owner's Mac): work through everything that doesn't need the owner, then report what does. One run at a time.

0. `scripts/flow.sh lock acquire` first, from the main checkout. When it fails because another run holds the lock, report the lock's age as it printed it and stop: claim nothing, start nothing, and don't release a lock you did not take. Keep the run id it prints (`run id: …`) and note it in the run's notes. The lock expires 3 hours after it was taken **or last refreshed**, and `acquire` takes an expired lock over by itself, so a live run renews it: `scripts/flow.sh lock refresh <run-id>` after each ticket the run starts, after each `pr.sh` step that waits (`ship`, `wait`) and after each `pr.sh merge` that adds a PR to the merge queue. `refresh` fails when the lock is gone or another run holds it (it took over after this run went quiet for 3 hours): then stop, claim nothing more, report it, and don't release.
1. `scripts/flow.sh next`.
2. For each issue under "Assigned to you", act on its phase with the playbook (resume `in-progress`, ship `draft-pr`, queue `ready-to-merge`, fix `changes-requested`, clean up `merged`). Skip what waits on a human, including `merge-refused`, and what waits on GitHub: `queued`. Handle `queue-removed` as the playbook says.
3. For each approved spec in `needs-tickets`, cut its tickets (**Shape** step 3).
4. **Build** the tickets under "Ready for an agent" (no fixed limit; mind the tool's rate limits and tickets that change the same files), each through **Ship** to `pr.sh merge`; `flow.sh finish` follows once GitHub has merged the PR. Queue the PRs and carry on with the next ticket instead of waiting for the queue; run `flow.sh next` and the `queued` PRs' `flow.sh status` again after each queue, `finish` the ones that are `merged`: it unblocks the next tickets.
5. Stop when nothing is ready and every open item waits on the owner. Report the "Waiting on the owner" list from `flow.sh next` and the "For the owner to read" list (the high-risk PRs agents merged in the last 7 days), the answered questions to `triage` together (`Triage #n … (answered)`), the PRs merged and the PRs still queued in this run, the PRs `pr.sh merge` refused with their reasons, the PRs the queue removed, and any ticket that stopped as `blocked`. Then measure the run from the main checkout, `node scripts/usage.mjs snapshot --since <the run's start> --label <date>-factory --out .work/usage/<date>-factory.json`, and report the main changes of `node scripts/usage.mjs compare docs/agents/usage/2026-10-24-factory.json .work/usage/<date>-factory.json` (`docs/agents/build.md`, **Usage**). Last, `scripts/flow.sh lock release <run-id>`, also when the run stops early on an error after it took the lock; a run that crashes leaves the lock to expire 3 hours after its last refresh.

A PR that `pr.sh merge` refused is reported to the owner, not retried: never merge around a refusal or run `pr.sh merge` again on the refused commit. The same goes for a commit the queue removed. Only the owner adds `spec-approved`. Add `owner-merge` only when creating a spec that touches auth, tenant data or health notes, and `owner-only` only when it touches legal, money or the agents' own rules (**Shape** step 2); never remove either. Questions only the owner can answer go on the issue with `needs-info`, posted by `triage`.

## Subagents

Three agents, defined once in `.agents/agents/` and pinned to a model tier in every tool (`docs/agents/build.md`, **Tiers**). Start each by name, never as the tool's general-purpose subagent, which would run on this conversation's model.

| Agent | Tier | Start it for |
|---|---|---|
| `builder` | mid | **Build** step 2: a ticket, a fix round after a review, failing checks, PR threads |
| `reviewer` | high | **Build** step 3: both `code-review` axes on the head commit, review-only rounds, merge-commit reviews. The only source of `clean on <sha>` |
| `mechanic` | small | CI-log digging, simple conflicts (unions), status and doc edits the brief spells out, waiting on `pr.sh wait` |

A subagent starts fresh, with none of this conversation. Brief it with pointers, not pasted content: the issue number, worktree, notes path and hint, and for a fix the findings, failing checks or threads. The agent files say what to read. Expect the short report `build.md` asks for.

- **Claude Code**: the Agent tool with `subagent_type` `builder`, `reviewer` or `mechanic` (`.claude/agents/`, the model from `tiers.json`).
- **Copilot**: the custom agent of that name (`.github/agents/<name>.agent.md`; its `model` field lists the Copilot names). In the CLI, run it as a subagent by name; in VS Code, as a subagent of the main conversation.
- **Codex**: `spawn_agent` with `agent_type` `reviewer` or `mechanic` and `fork_turns: "none"`; the role pins the model, so don't pass `model`. A native role can't change the sandbox and can't commit in a worktree, so start the `builder` (and a `mechanic` that has to commit) with `scripts/codex-agent.sh mid|small <worktree> <prompt-file>`, which grants that worktree's git dir and its own branch, and keeps `commondir`, `gitdir` and `.githooks` read-only; the prompt file starts with "Read and follow `.agents/agents/builder.md`" (the wrapper has no role) and continues with the brief, and the final message is the report. The same wrapper starts any tier when the roles aren't loaded (the repo isn't trusted in `~/.codex/config.toml`). Details in `docs/agents/codex-model-tiers.md`.
- **No subagent support**: do the same steps inline, one ticket per conversation. A review in the conversation that built is not a `reviewer` verdict: run it in a fresh conversation on the high tier, or skip `pr.sh reviewed` so the PR stays for the owner.

Never hand-edit `.claude/agents/`, `.github/agents/` or `.codex/agents/`: change `.agents/agents/` and run `scripts/agents.sh sync` (`scripts/check.sh` fails when they differ).

## Context hygiene

- One ticket per subagent; the `reviewer` runs both `code-review` axes itself, without subagents of its own.
- This conversation runs on the standard context window (`.claude/settings.json` pins `opus`, not `opus[1m]`): every turn reads the whole conversation again, so a long one costs more on each step.
- After **Shape**, after each **Factory** pass, or when this conversation gets long, start a new one: `scripts/flow.sh status` and GitHub rebuild the picture.
- Share research through the notes file, not through this conversation. `flow.sh finish` deletes it.

## After a build

When a build went sideways (rework, failed checks, review rounds, a refused merge), suggest `.agents/skills/retro/SKILL.md` before the conversation ends.
