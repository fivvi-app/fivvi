# ADR-004: API layer — REST + OpenAPI with generated clients

| | |
|---|---|
| **Status** | Accepted (2026-09-22), replaces the earlier tRPC proposal |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §70, §75; ROADMAP.md §2 (principle 3), M1, §6; ADR-002, ADR-003; E018 |

## Context

`PRODUCT.md §75` requires **one backend** that serves web, mobile, public booking, client web and future client apps. The first roadmap draft proposed tRPC, which works only with TypeScript clients. With native Swift and Kotlin apps (ADR-003), the API needs a **language-neutral contract** that all three clients can generate code from, so they cannot drift apart.

## Decision

- **REST over HTTPS with JSON**, described by **OpenAPI 3.1**.
- Routes are written with **Hono + `@hono/zod-openapi`** in `packages/api`. Zod schemas are both the runtime validation and the source of the OpenAPI document.
- The API is **served from Next.js route handlers** (ADR-002). `packages/api` stays a standalone Hono app so it can move to its own service later.
- `openapi.json` is **generated and committed** in `packages/contract`, together with generated clients:
  - TypeScript (web);
  - Swift (`swift-openapi-generator`);
  - Kotlin (`openapi-generator`).
- **Generated code is never edited by hand.** Any API change regenerates the contract and all clients in the same PR; the CI **OpenAPI drift check** fails otherwise.
- After a contract freeze (end of M4, end of M7), changes are **additive only** and versioned (`ROADMAP.md §6`).

## Consequences

- **Positive:** web, iOS and Android use the same typed contract; a breaking change shows up as a compile error on every platform in the same PR.
- **Positive:** the contract is a readable review artefact, and it drives the tenant-isolation suite, which enumerates every route from `openapi.json` (`TESTING.md §4.1`).
- **Negative:** more ceremony than tRPC: every route declares request and response schemas, and codegen runs on every API change.
- **Negative:** three generators with their own quirks (nullable handling, enums, dates). E018 includes a spike to pin generator versions and settings.
- **Follow-ups:** E018 sets up codegen and the drift check in M1.

## Alternatives considered

| Option | Why not |
|---|---|
| tRPC (first draft) | TypeScript-only; native apps would need a hand-written client |
| GraphQL | Flexible, but more server complexity (resolvers, N+1, authorization per field) and caching work for no MVP need |
| gRPC / Connect | Awkward from browsers and plain HTTP tooling; harder to debug; less natural for a public booking web page |
| Hand-written OpenAPI spec (design-first) | Spec and code can drift; generating the spec from zod schemas keeps one source of truth |

## References

- `PRODUCT.md §75` Backend
- `ROADMAP.md` M1 (drift check), §6 (contract freezes)
