# Trainer Hub: rules for coding agents

Dutch-first, bilingual (nl-NL + en) platform for personal trainers and small gyms.
Stack: Next.js web + API (Hono + zod-openapi, REST), native iOS (Swift + SwiftUI), native Android (Kotlin + Jetpack Compose), PostgreSQL (Drizzle), Better Auth. Free tiers until real clients arrive.

## Read first

- Requirements: `docs/product/PRODUCT.md`
- Sequencing, milestones, ADRs, gates: `docs/product/ROADMAP.md`
- Feature status: `docs/product/FEATURES.md`
- Workflow, agent rules, Definition of Done: `docs/engineering/WORKFLOW.md`
- What to test, where and how: `docs/engineering/TESTING.md`

## Non-negotiable rules

- **Every change gets its own branch and git worktree** (`.worktrees/<slug>`). Never edit on `main`. One agent per worktree.
- **Clean up after merge:** remove the worktree, delete the branch, prune, stop dev servers/simulators, remove temp files and preview resources (`WORKFLOW.md §5`).
- Branch names: `feature/F0xx-<slug>[-ios|-android]`, `fix/…`, `chore/E0xx-<slug>`, `docs/<slug>`.
- **No hard-coded user-facing strings** on any platform. The only source is `packages/i18n/{nl-NL,en}.json`; native catalogs are generated. Keep NL and EN in parity; use `packages/i18n/GLOSSARY.md` terminology.
- **API changes go through the OpenAPI contract**; regenerate the TS/Swift/Kotlin clients in the same PR. Never hand-edit generated code.
- Business logic lives in `packages/domain` (server-side). Native apps and web don't re-implement rules.
- Store timestamps in UTC; render with the workspace/user timezone (default Europe/Amsterdam).
- Every business record carries `organization_id`; never query business data without tenant scoping.
- Notes are trainer-only by default and may contain health data. Treat them as sensitive.
- Mobile features need iOS **and** Android parity before they count as done.
- **Every behaviour change ships with tests** (`TESTING.md §3`). Bug fixes start with a failing test. Never delete, skip or weaken a test to get CI green.
- Update the feature doc and `FEATURES.md` status in the same PR as the code.
- Prefer free-tier services; don't add a paid dependency without the owner's approval.
- Don't build anything in `PRODUCT.md §53` (MVP exclusions).
