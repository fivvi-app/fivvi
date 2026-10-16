---
name: 'Product and engineering docs'
description: 'Use when writing or updating FEATURES.md status, the domain glossary, ADRs, the roadmap, workflow, testing or legal docs.'
applyTo: 'docs/**,GLOSSARY.md,CODING_STANDARDS.md'
---
# Product and engineering docs

- Precedence: `PRODUCT.md` owns requirements, `ROADMAP.md` owns sequencing, milestones, gates and decisions, `FEATURES.md` owns status. If two docs disagree, fix the wrong one in the same PR.
- Specs and tickets are GitHub issues, not files (`docs/agents/issue-tracker.md`). Link the spec issue from the `FEATURES.md` ID. A row holds a stable summary and a Status; a spec's progress ("Open:", "Next:" lists) lives in its tickets, not in the row. A ticket PR changes only its row's Status (the spec's first ticket sets `IN PROGRESS`); only the PR that completes the spec sets `IMPLEMENTED` and rewrites the summary as one final line. Never set `IMPLEMENTED` while the spec's Test plan has gaps or NL/EN is missing.
- Give each app, package or platform its own row or bullet where parallel PRs extend a list (the app and package rows of the `AGENTS.md` path table, the native sections of `TESTING.md` and `WORKFLOW.md`), never one sentence that combines several, so parallel PRs edit different lines.
- `GLOSSARY.md` (root) holds the domain language in Matt Pocock's format: **Term**, a one- or two-sentence definition, `_Avoid_`. No implementation details. NL/EN wording goes in `packages/i18n/GLOSSARY.md`.
- ADRs live in `docs/decisions/` (not `docs/adr/`): never change the decision of an accepted ADR; write a new one that supersedes it. New ADRs start as **Proposed** and follow [docs/decisions/README.md](../../docs/decisions/README.md).
- Changes to milestone scope or release order get a row in the `ROADMAP.md` changelog with the reason.
- Legal docs (`docs/legal/`) are drafts in NL and EN; the Dutch text prevails. Keep both in sync and don't change their substance without the owner.
- Style: short, plain sentences. Refer to sections as `WORKFLOW.md §4`. Don't duplicate content; link to the doc that owns it.
