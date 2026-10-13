---
name: 'Product and engineering docs'
description: 'Use when writing or updating feature docs, FEATURES.md status, ADRs, the roadmap, workflow, testing or legal docs.'
applyTo: 'docs/**'
---
# Product and engineering docs

- Precedence: `PRODUCT.md` owns requirements, `ROADMAP.md` owns sequencing, milestones, gates and decisions, `FEATURES.md` owns status. If two docs disagree, fix the wrong one in the same PR.
- Feature docs: copy `docs/features/_TEMPLATE.md` to `docs/features/F0xx-<slug>.md` before the feature moves to `DESIGNED`. Write the **Test plan** (every AC → layer → test) before implementing.
- Update the feature doc and its `FEATURES.md` row in the same PR as the code. Never set `IMPLEMENTED` while the Test plan has gaps or NL/EN is missing.
- ADRs: never change the decision of an accepted ADR; write a new one that supersedes it. New ADRs start as **Proposed** and follow [docs/decisions/README.md](../../docs/decisions/README.md).
- Changes to milestone scope or release order get a row in the `ROADMAP.md` changelog with the reason.
- Legal docs (`docs/legal/`) are drafts in NL and EN; the Dutch text prevails. Keep both in sync and don't change their substance without the owner.
- Style: short, plain sentences. Refer to sections as `WORKFLOW.md §4`. Don't duplicate content; link to the doc that owns it.
