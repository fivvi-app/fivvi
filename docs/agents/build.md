# Building a ticket

How `implement` (and `tdd` and `code-review` under it) runs in this repo. The `work` skill gives you the issue number, worktree, notes path and the `Hint` from `flow.sh`, and for a fix the failing checks or PR threads to address.

- **Read first**: `scripts/issue.sh show <n>` and its parent spec, the notes file, `AGENTS.md`, `CODING_STANDARDS.md`, `docs/agents/domain.md`, and the `.github/instructions/*.instructions.md` for the files you touch.
- **Stay in the worktree**: `cd <worktree> && …` in every command; change files only there.
- **Tests**: `tdd`, one vertical slice at a time, covering the ticket's acceptance criteria and the spec's Test plan rows for them ([TESTING.md](../engineering/TESTING.md)). A fix for a finding or thread that changes behaviour starts with a failing test. Never delete, skip or weaken a test.
- **Hint**: apply it, e.g. the `FEATURES.md` status this PR sets.
- **Checks**: `scripts/check.sh` passes in the worktree, the same checks `pr.sh create` runs before it pushes.
- **Commits**: Conventional Commits with the feature ID as scope, `feat(F031): hold a spot during verification`. Commit before `code-review`: it reviews `origin/main...HEAD`, so it can't see uncommitted work.
- **Code review**: the fixed point is `origin/main`; the spec is the ticket and its parent spec. Standards are `CODING_STANDARDS.md` (its checklist and the rules it links) and the instructions for the changed files; the skill's smell baseline applies under them. The spec axis also checks that the tests prove each acceptance criterion in NL and EN where the spec asks for both. Mark each finding `must-fix`, `should-fix` or `judgement`. Fix must-fix and should-fix findings, at most two rounds, and list what's left in the notes file. The review is **clean** when the last round, on the last commit, has no must-fix or should-fix finding; only then may `work` record it with `pr.sh reviewed`. Without subagents, run the two axes one after the other.
- **Never** push, create or update PRs, or write to GitHub issues. Never guess a product rule; test data is synthetic. Stop with `blocked` when the ticket is ambiguous, needs a product decision, or a check fails for reasons outside the ticket.
- **Notes**: append what you built, decisions, check results, the review result and anything left.
- **Report** in at most 10 lines: `done` or `blocked: <why>`, commits, checks with results, the review (`clean on <sha>` or the findings left), open questions.
