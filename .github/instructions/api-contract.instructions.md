---
name: 'API routes and OpenAPI contract'
description: 'Use when adding or changing API routes, request/response schemas, zod-openapi definitions, the OpenAPI contract, or generated TypeScript/Swift/Kotlin clients.'
applyTo: 'packages/api/**,packages/contract/**'
---
# API routes and the OpenAPI contract

Full rules: [packages/contract/README.md](../../packages/contract/README.md), ADR-004, ADR-006, ADR-007.

- Define routes in `packages/api/src/routes/` with `createRoute` from `@hono/zod-openapi` and register them in `src/app.ts`. Follow `routes/hello.ts`: explicit `operationId` and `tags`, a named `.openapi('<Schema>')` for response schemas, and a `400` response with `ValidationErrorSchema`.
- Paths are versioned (`/v1/...`) and don't include the `/api` mount prefix.
- External services reach routes through `ApiDependencies` (`src/dependencies.ts`), so tests can pass fakes. Route handlers don't query business tables directly; they call `packages/domain` and tenant-scoped repositories.
- Cross-tenant access returns `404`, never `403`.
- Prefer returning i18n keys or structured data over translated copy (see `routes/hello.ts`).
- Every API change runs `pnpm generate:contract` and commits `openapi.json` and all three clients in the same PR. `pnpm check` fails on drift. Never edit generated files by hand. Needs the Swift 6 toolchain and Java 17+.
- After a contract freeze (end of M4, end of M7), changes are additive only.
- Tests: an integration test per route covering the happy path, validation errors and every role (`TESTING.md §3`).
