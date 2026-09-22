# ADR-001: Monorepo tooling

| | |
|---|---|
| **Status** | Accepted (2026-09-22) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §70, §83; ROADMAP.md §4.3, M1; ADR-003, ADR-004, ADR-008, ADR-015; E001 |

## Context

Trainer Hub has a web app, an API, a native iOS app, a native Android app (ADR-003) and several shared packages: API contract, domain logic, database, auth, i18n, validation, design tokens. `PRODUCT.md §70` recommends a monorepo with `/apps` and `/packages`.

The work is done by AI agents in parallel worktrees, with one PR per change (`WORKFLOW.md`). Many changes cut across platforms. For example, a new API field touches `packages/api`, regenerates `packages/contract`, and is used by web, iOS and Android. If those live in separate repositories, one change becomes several coordinated PRs, and the three clients can drift from the contract.

## Decision

- **One Git repository** for everything.
- **pnpm workspaces + Turborepo** for the TypeScript part (`apps/web`, `packages/*`). Turborepo runs tasks (`build`, `test`, `lint`, `typecheck`, codegen) with dependency ordering and caching.
- **Native projects live in the same repo** but keep their own build tools: `apps/ios` (Xcode project, Swift Package Manager) and `apps/android` (Gradle). They are not pnpm packages.
- Generated artefacts that cross the TS/native boundary (OpenAPI clients, string catalogs, design tokens) are produced by scripts in the TS workspace and **committed**, so native builds don't need Node to be installed. CI checks that they are up to date (ADR-004, ADR-008, ADR-015).
- TypeScript is `strict` everywhere.

Layout (from `ROADMAP.md` M1):

```text
/apps     web (Next.js, hosts the API) · ios · android
/packages api · contract · domain · database · auth · i18n · validation · design-tokens · ui
```

## Consequences

- **Positive:** one PR can change the contract, the backend and all three clients together, so reviews see the whole change. Shared tooling, one CI, one issue tracker. Turborepo caching keeps CI on the free minutes budget (`ROADMAP.md §12`).
- **Positive:** worktrees (`WORKFLOW.md §3`) work on the whole product, not one slice.
- **Negative:** two build worlds in one repo. CI must path-filter so an iOS build runs only when `apps/ios` or the contract changes (macOS minutes count 10×).
- **Negative:** Xcode and Gradle don't understand the pnpm graph. The codegen → native dependency is kept explicit through committed generated files plus a CI drift check.
- **Follow-ups:** E001 sets up the workspace, ESLint/Prettier, SwiftLint and ktlint; E002 adds path filters.

## Alternatives considered

| Option | Why not |
|---|---|
| Separate repos per platform | One logical change becomes 3–4 PRs that must land in order; contract drift becomes likely; harder for agents to see the whole change |
| Nx | Capable, but heavier configuration than this project needs. Turborepo + pnpm covers task orchestration and caching with less setup |
| npm/yarn workspaces | pnpm is faster and stricter about undeclared dependencies, which catches mistakes agents make |
| Bazel (one build tool for all platforms) | Far too much setup and upkeep for a small team; fights Xcode and Gradle conventions |

## References

- `PRODUCT.md §70` Technical architecture
- `ROADMAP.md` M1 (repo layout, CI notes)
