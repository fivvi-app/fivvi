---
name: 'Product and engineering docs'
description: 'Use when writing or updating FEATURES.md status, the domain glossary, ADRs, the roadmap, workflow, testing or legal docs.'
applyTo: 'docs/**,GLOSSARY.md,CODING_STANDARDS.md'
---
# Product and engineering docs

- Precedence: `PRODUCT.md` owns requirements, `ROADMAP.md` owns sequencing, milestones, gates and decisions, `FEATURES.md` owns status. If two docs disagree, fix the wrong one in the same PR.
- Specs and tickets are GitHub issues, not files (`docs/agents/issue-tracker.md`). Update the `FEATURES.md` row in the same PR as the code and link the spec issue from the ID. Never set `IMPLEMENTED` while the spec's Test plan has gaps or NL/EN is missing.
- `GLOSSARY.md` (root) holds the domain language in Matt Pocock's format: **Term**, a one- or two-sentence definition, `_Avoid_`. No implementation details. NL/EN wording goes in `packages/i18n/GLOSSARY.md`.
- ADRs live in `docs/decisions/` (not `docs/adr/`): never change the decision of an accepted ADR; write a new one that supersedes it. New ADRs start as **Proposed** and follow [docs/decisions/README.md](../../docs/decisions/README.md).
- Changes to milestone scope or release order get a row in the `ROADMAP.md` changelog with the reason.
- Legal docs (`docs/legal/`) are drafts in NL and EN; the Dutch text prevails. Keep both in sync and don't change their substance without the owner.
- Style: short, plain sentences. Refer to sections as `WORKFLOW.md §4`. Don't duplicate content; link to the doc that owns it.
