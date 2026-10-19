# Building a ticket

How a ticket is built and reviewed in this repo. A mid-tier **builder** runs `implement` (with `tdd`) and commits. A high-tier **reviewer** then runs `code-review` on the head commit. The `work` skill runs both as subagents and gives each its brief: the issue number, worktree, notes path and the `Hint` from `flow.sh`, and for a fix the findings, failing checks or PR threads to address.

## Tiers

The agents are defined once in `.agents/agents/` (`builder.md`, `reviewer.md`, `mechanic.md`, `tiers.json`) and generated for each tool by `scripts/agents.sh`; the model of each tier per tool is pinned there. Claude Code takes an alias (`opus`, `sonnet`) or a full model id; the small tier uses `claude-haiku-5-5`, because the `haiku` alias still resolves to Haiku 4.5. Copilot takes a list of model names and uses the first one available: the Copilot CLI id (`claude-sonnet-5.5`) and the VS Code qualified name (`Claude Sonnet 5.5 (copilot)`). Codex takes a model and a reasoning effort per role; see [codex-model-tiers.md](codex-model-tiers.md). Checked on 2026-10-17: `copilot --agent <name>` ran on `claude-sonnet-5.5`, `claude-opus-5.5` and `claude-haiku-5.5`, and `claude --agent <name>` reported `claude-sonnet-5-5`, `claude-opus-5-5` and, for the `haiku` alias, `claude-haiku-4-5` (so the small tier is pinned to the id `claude-haiku-5-5`, listed in Claude Code's model catalog; a live call could not be made from the machine used); VS Code was not run, it takes the qualified name from the list.

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

A new commit makes an earlier verdict stale: any fix, CI repair or merge of `origin/main` is followed by a review on the new head commit before `pr.sh reviewed`.

After a clean verdict `work` records it with `pr.sh reviewed` and ships with `pr.sh ship`; how, including the follow-up pushes, is in the `work` skill's **Ship** section.

## Build (the builder)

- **Read first**: `scripts/issue.sh show <n>` and its parent spec, the notes file, `AGENTS.md`, `CODING_STANDARDS.md`, `docs/agents/domain.md`, and the `.github/instructions/*.instructions.md` for the files you touch.
- **Stay in the worktree**: `cd <worktree> && …` in every command; change files only there.
- **Tests**: `tdd`, one vertical slice at a time, covering the ticket's acceptance criteria and the spec's Test plan rows for them ([TESTING.md](../engineering/TESTING.md)). A fix for a finding or thread that changes behaviour starts with a failing test. Never delete, skip or weaken a test.
- **Hint**: apply it. It says what this PR does to `FEATURES.md`: the spec's first ticket changes only its row's Status to `IN PROGRESS`, the PR that completes the spec sets `IMPLEMENTED` and writes the final one-line summary, any other ticket leaves the file alone. Never add progress ("Open:", "Next:") to the row; it lives in the spec's tickets.
- **Checks**: `scripts/check.sh` passes in the worktree, the same full checks `pr.sh create` runs before a PR's first push; on a follow-up push it runs `--fast` (modes: [WORKFLOW.md §3](../engineering/WORKFLOW.md)). At the end it prints a table of the tests each suite passed, failed and skipped, and writes it to `.work/check-summary.json` (git-ignored, in the worktree); a suite left out by `--fast` is listed as `skipped`. **Quote that summary** in the notes and the report, as the suite names and counts it prints (`root 260 passed`); never retype a count from the long test output.
- **Commits**: Conventional Commits with the feature ID as scope, `feat(F031): hold a spot during verification`. Commit everything before you report: the reviewer reviews `origin/main...HEAD` as committed.
- **No final review**: don't call `code-review`; the `reviewer` does (see Review).
- **Never** push, create or update PRs, or write to GitHub issues. Never guess a product rule; test data is synthetic. Stop with `blocked` when the ticket is ambiguous, needs a product decision, or a check fails for reasons outside the ticket.
- **Notes**: append what you built, decisions, check results and anything left.
- **Report** in at most 10 lines: `done` or `blocked: <why>`, commits and the head SHA, checks with results (the counts quoted from `.work/check-summary.json`), open questions.

## Review (the reviewer)

The `reviewer` runs `.agents/skills/code-review/SKILL.md` in the worktree on the head commit; it never edits, commits or pushes.

- **Fixed point** is `origin/main`; the spec is the ticket and its parent spec. Standards are `CODING_STANDARDS.md` (its checklist and the rules it links) and the instructions for the changed files; the skill's smell baseline applies under them. The spec axis also checks that the tests prove each acceptance criterion in NL and EN where the spec asks for both.
- **Findings** are marked `must-fix`, `should-fix` or `judgement`, each with file, line and what to change. Without subagents, run the two axes one after the other.
- **Verdict**: `clean on <sha>` when no must-fix or should-fix finding is left on that commit, otherwise `not clean on <sha>`.
- **Report** in at most 15 lines: the head SHA, the findings and the verdict. In a review-only round, report only what is still open.

## Fix rounds (the builder again)

A `builder` gets the reviewer's must-fix and should-fix findings in its brief (judgement findings are optional), fixes them test-first when behaviour changes, runs `scripts/check.sh`, commits and reports as above. Never delete, skip or weaken a test to make a finding go away.
