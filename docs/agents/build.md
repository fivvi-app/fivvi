# Building a ticket

How a ticket is built and reviewed in this repo. A mid-tier **builder** runs `implement` (with `tdd`) and commits. A high-tier **reviewer** then runs `code-review` on the head commit. The `work` skill runs both as subagents and gives each its brief: the issue number, worktree, notes path and the `Hint` from `flow.sh`, and for a fix the findings, failing checks or PR threads to address.

## Tiers

The agents are defined once in `.agents/agents/` (`builder.md`, `reviewer.md`, `mechanic.md`, `tiers.json`) and generated for each tool by `scripts/agents.sh`; the model of each tier per tool is pinned there. Claude Code takes an alias (`opus`, `sonnet`) or a full model id; the small tier uses `claude-haiku-5-5`, because the `haiku` alias still resolves to Haiku 4.5. Copilot takes a list of model names and uses the first one available: the Copilot CLI id (`claude-sonnet-5.5`) and the VS Code qualified name (`Claude Sonnet 5.5 (copilot)`). Codex takes a model and a reasoning effort per role; see [codex-model-tiers.md](codex-model-tiers.md). Checked on 2026-10-17: `copilot --agent <name>` ran on `claude-sonnet-5.5`, `claude-opus-5.5` and `claude-haiku-5.5`, and `claude --agent <name>` reported `claude-sonnet-5-5`, `claude-opus-5-5` and, for the `haiku` alias, `claude-haiku-4-5` (so the small tier is pinned to the id `claude-haiku-5-5`, listed in Claude Code's model catalog; a live call could not be made from the machine used); VS Code was not run, it takes the qualified name from the list.

Each agent's `claude-tools` field is its tool allowlist in Claude Code (the generated `tools:`): without one, a subagent inherits every tool of the session, MCP servers included, and starts with all their schemas in context. In Claude Code the main conversation runs on the standard context window: `.claude/settings.json` pins `opus`, not `opus[1m]`. In the 1M window a factory run grew to 965k tokens before it compacted, and every turn read all of it again.

| Tier | Claude Code | Copilot | Codex | Agent | Does |
|---|---|---|---|---|---|
| High | Opus | Opus | Sol | main conversation | Shaping: grill, to-spec, to-tickets, triage; orchestration |
| High | Opus | Opus | Sol | `reviewer` | **Every code review**: both axes, ticket and merge-commit reviews |
| Mid | Sonnet | Sonnet | Terra | `builder` | `implement` with `tdd`: tests and code, and the fix rounds after a review |
| Small | Haiku | Haiku | Luna | `mechanic` | CI-log digging, simple conflict resolution (unions), status and doc edits, waiting on checks |

## Loop

1. `builder` builds the ticket and commits; it does **not** run `code-review`. `implement` ends with a `code-review` call; here that step belongs to the reviewer, so skip it.
2. `reviewer` reviews the head commit and reports its findings and the verdict.
3. On must-fix or should-fix findings, a `builder` fixes them and the `reviewer` reviews the new head commit. At most two fix rounds; the review after the second is a **review-only round**: nothing more is fixed, and findings still open are listed in the notes file, so the PR stays for the owner.
4. The review is **clean** when the reviewer's last review, on the last commit, has no must-fix or should-fix finding. Only the reviewer's verdict `clean on <sha>` lets `work` record it with `pr.sh reviewed`; the builder never claims it.

A new commit makes an earlier verdict stale: any fix, CI repair or merge of `origin/main` is followed by a review on the new head commit before `pr.sh reviewed`, scoped to what changed since the last review (**Review**, Scope). A branch that is merely behind `origin/main` needs no merge: the merge queue tests the PR on the latest `main` ([ADR-018](../decisions/ADR-018-merge-queue.md)); merge `origin/main` only to resolve a real conflict.

After a clean verdict `work` records it with `pr.sh reviewed` and ships with `pr.sh ship`, then `pr.sh merge` adds a low-risk PR, and until pilot setup a high-risk PR that is not owner-only, to the merge queue (GitHub squash-merges it when the checks pass on the latest `main`; the owner queues an owner-only PR, [ADR-021](../decisions/ADR-021-agents-queue-high-risk.md)); how, including the follow-up pushes, is in the `work` skill's **Ship** section. A PR the queue removes comes back as a fix round: the brief names the failing checks of its `merge_group` run, and the same rules apply.

## Build (the builder)

- **Read first**: `scripts/issue.sh show <n>` and its parent spec, the notes file, `AGENTS.md`, `CODING_STANDARDS.md`, `docs/agents/domain.md`, and the `.github/instructions/*.instructions.md` for the files you touch.
- **Stay in the worktree**: `cd <worktree> && …` in every command; change files only there.
- **Tests**: `tdd`, one vertical slice at a time, covering the ticket's acceptance criteria and the spec's Test plan rows for them ([TESTING.md](../engineering/TESTING.md)). A fix for a finding or thread that changes behaviour starts with a failing test. Never delete, skip or weaken a test.
- **Manual checks** (for the builder and for `work`, which records their results): steps for a manual or owner check, and the result recorded for one (in a PR body, notes or issue), prove the **data path**, not only the screen: change the row in a preview or test database and watch the screen change, or compare the endpoint's response with the row. A greeting that renders proves nothing while the endpoint is a stub (#59, #93).
- **Owner-only edits** (spec #292): `scripts/pr.sh create` prints the owner-only reasons of a ticket PR after it pushes (`scripts/risk.sh <pr>` shows all of them). An owner-only edit that the ticket does not need in the same commit does not ride along in the ticket PR: move it to a small PR of its own on a `chore/` branch (`scripts/flow.sh start` is for tickets; `scripts/wt.sh add chore/<slug>`), which nothing blocks and which only the owner queues, and note it in the notes file. The builder does not push or open it; the report names it so `work` does. When the ticket cannot work without the guarded change, that PR goes first and the ticket PR waits on it (say so in the report). A ticket PR that is owner-only only because of its issue's `owner-only` label has nothing to split.
- **Hint**: apply it. It says what this PR does to `FEATURES.md`: the spec's first ticket changes only its row's Status to `IN PROGRESS`, the PR that completes the spec sets `IMPLEMENTED` and writes the final one-line summary, any other ticket leaves the file alone. Never add progress ("Open:", "Next:") to the row; it lives in the spec's tickets.
- **Checks**: `scripts/check.sh` passes in the worktree. It runs only what the change can affect (the changed packages and their dependents, their integration tests, the web e2e tests when the web app is affected, the root script tests for scripts and hooks; Markdown only: the hygiene checks), the same set `pr.sh create` runs before every push; the workspace setup (lockfile, root `package.json`, `turbo.json`, `tsconfig.base.json`, the shared test preset) affects everything. Run it per round and while you build (after each commit, only the tests the change can affect: one test file, `node --test scripts/test/<file>.test.mjs`, shellcheck on the script you touched). Use `--all` only when the round changed the workspace setup or the reviewer asks for the full run (modes: [WORKFLOW.md §3](../engineering/WORKFLOW.md), [ADR-024](../decisions/ADR-024-run-only-the-checks-a-change-can-affect.md)). At the end it prints a table of the tests each suite passed, failed and skipped, and writes it to `.work/check-summary.json` (git-ignored, in the worktree); a suite left out by `--fast` is listed as `skipped`, one the change does not affect as `skipped (not affected)`, one turbo never ran after a failure as `not-run`. **Quote that summary** in the notes and the report, rows as printed (`root                               pass                       351       0       0`: suite, status, passed, failed, skipped); never retype a count from the long test output. Native iOS and Android counts are not in it: `check.sh` doesn't run those suites.
- **Commits**: Conventional Commits with the feature ID as scope, `feat(F031): hold a spot during verification`. Commit everything before you report: the reviewer reviews only what is committed.
- **No final review**: don't call `code-review`; the `reviewer` does (see Review).
- **Never** push, create or update PRs, or write to GitHub issues. Never guess a product rule; test data is synthetic. Stop with `blocked` when the ticket is ambiguous, needs a product decision, or a check fails for reasons outside the ticket.
- **Notes**: append what you built, decisions, check results and anything left.
- **Report** in at most 10 lines: `done` or `blocked: <why>`, commits and the head SHA, checks with results (the counts quoted from `.work/check-summary.json`), open questions.

## Review (the reviewer)

The `reviewer` runs `.agents/skills/code-review/SKILL.md` in the worktree on the head commit; it never edits, commits or pushes.

- **Scope** comes from the brief; `work` sets it from the last verdict in the notes file. Each review covers only what no earlier review on this branch saw:
  - **`full`**, the first review of a branch: fixed point `origin/main`, the diff `origin/main...HEAD`.
  - **`since <sha>`**, every later review (after a fix round, a CI repair, a review-loop fix or a merge of `origin/main`), with the last review's must-fix and should-fix findings in the brief. First check `git merge-base --is-ancestor <sha> HEAD`; when it fails (history rewritten), review `full` instead. Otherwise walk `git rev-list --first-parent --reverse <sha>..HEAD`: review a merge of `origin/main` (`git merge-base --is-ancestor <merge>^2 origin/main` holds) by what its conflict resolution changed, `git show --remerge-diff <merge>` (empty when git merged it without a hand-made change), and any other commit, other merges included, by its own diff against its first parent. Check that each finding from the brief is resolved; one that isn't stays open. Read the surrounding code where a diff needs it; don't review the earlier commits again.
- **Sources**: the spec is the ticket and its parent spec. Standards are `CODING_STANDARDS.md` (its checklist and the rules it links) and the instructions for the changed files; the skill's smell baseline applies under them. The spec axis also checks that the tests prove each acceptance criterion in NL and EN where the spec asks for both.
- **Both axes in the reviewer itself**, one after the other: start no sub-agents for them. This replaces step 4 of `code-review`, which starts one per axis; each would start fresh and read the same diff and standards again.
- **Findings** are marked `must-fix`, `should-fix` or `judgement`, each with file, line and what to change.
- **Verdict**: `clean on <sha>` when no must-fix or should-fix finding is left on that commit, otherwise `not clean on <sha>`. It covers the whole branch: every commit was reviewed in some scope, and the findings of the last review are carried into this one.
- **Report** in at most 15 lines: the head SHA, the scope (`full` or `since <sha>`), the findings and the verdict. In a review-only round, report only what is still open.

## Fix rounds (the builder again)

A `builder` gets the reviewer's must-fix and should-fix findings (or the failing checks of a `merge_group` run, when the merge queue removed the PR) in its brief (judgement findings are optional), fixes them test-first when behaviour changes, runs `scripts/check.sh`, commits and reports as above. Never delete, skip or weaken a test to make a finding go away.

## Usage

`node scripts/usage.mjs snapshot --since <date> [--until <date>] --label <name>` measures a run from Claude Code's transcripts on this machine: tokens, price-weighted cost per model, agent and tool time per ticket, and quality (first-review-clean rate, findings per review, CI failures, queue removals, owner comments, follow-up fixes, reverts). `node scripts/usage.mjs compare <before.json> <after.json>` compares two snapshots per ticket group (area and size), so a run is compared with runs of similar tickets, not with a different mix. Claude Code deletes transcripts after 30 days by default, so take the snapshot within that time. Baselines live in `docs/agents/usage/`; `2026-10-24-factory.json` is the run before the review, tools and context-window changes.
