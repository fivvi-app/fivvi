# @fivvi/contract

The API contract and the clients generated from it (ADR-004, E018).

`packages/api` defines the routes with Hono + `@hono/zod-openapi`. The zod schemas validate requests at runtime and also produce the OpenAPI document. This package commits that document and generates a client for each platform from it, so web, iOS and Android can't drift from the API.

```text
packages/api (zod routes)
  └─▶ openapi.json (OpenAPI 3.1)
        ├─▶ src/generated/schema.ts                  TypeScript (web)
        ├─▶ swift/Sources/FivviAPI/Generated/   Swift (iOS)
        └─▶ kotlin/generated/                        Kotlin (Android)
```

## Rules

- **Never edit generated files by hand.** Everything under the paths above is overwritten on the next run.
- **An API change regenerates everything in the same PR.** `pnpm check` fails otherwise.
- Contract paths don't include the `/api` mount prefix. It is the server URL (`servers[0].url`), so the API can move to its own host later without changing the contract.

## Access: `x-access`

Every operation declares who may call it in an `x-access` extension (E011). The routes are defined with `defineRoute(route, access)` (`packages/api/src/access.ts`); the same declaration installs the access middleware, ahead of request validation, and writes `x-access`, so enforcement and contract can't drift. The generators ignore `x-` extensions.

| `x-access` | Who | Refusals documented on the operation |
|---|---|---|
| `{ "type": "public" }` | Anyone. Each one is on the allow-list in `packages/api/test/isolation/public-routes.ts` with a one-line reason | none |
| `{ "type": "account" }` | Any signed-in account | `401` |
| `{ "type": "workspace", "capability": "team.manage", "roles": [...], "client": "none" \| "own-records" }` | A team role of the workspace in the path whose capability the route names (`roles` are the roles the permission matrix in `packages/domain` gives it; F004), or a client of it for their own records | `401`, `404`, `403` |

Refusals are machine-readable bodies without text: `NotSignedIn` (`401`, `not_signed_in`), `NotFound` (`404`, `not_found`) and `Forbidden` (`403`, `forbidden`). The order of checks is anonymous (`401`), no place in the workspace (`404`), a place without the access (`403`), and only then validation (`400`).

`packages/api/test/isolation/coverage.test.ts` fails, naming the operation, for an operation without `x-access`, a public one that isn't on the allow-list, and an allow-list entry for an operation that no longer exists.

## Regenerate

```bash
pnpm generate:contract
```

Then commit the changed files together with the API change.

Requirements, besides Node and pnpm:

| Tool | Why | Install (macOS) |
|---|---|---|
| Swift 6 toolchain | Builds and runs swift-openapi-generator | Xcode (Command Line Tools) |
| Java 17+ | Runs openapi-generator | `brew install openjdk@21`, then `export JAVA_HOME="$(brew --prefix openjdk@21)"` |

The first run builds swift-openapi-generator (about 1–2 minutes) and downloads the openapi-generator jar (30 MB, from Maven Central, SHA-256 checked). Both are kept in `node_modules/.cache/contract` and reused while their names match: the generator binary is named by a hash of the full `swift --version` output, `Package.swift` and `Package.resolved`; the jar by its pinned version (its SHA-256 is checked on every use). Later runs take a few seconds.

CI (`Checks (Linux)`) caches that directory under one key: the runner OS, the Swift version number, and one hash of `Package.swift`, `Package.resolved` and `config/openapi-generator.json`. A change to any of them misses the cache and starts from an empty directory, so old tools don't accumulate. CI saves the directory even when another check fails, but only after a miss and once both tools exist.

## Drift check

```bash
pnpm check            # all packages, via Turborepo
```

`scripts/check.ts` generates the spec and all three clients into a temp directory. It fails and lists every file that differs from the committed one, is missing, or is no longer generated. Turborepo caches the result (`turbo.json`). The task hash covers this package's files except `README.md` and the tests (the pipeline, `config/`, the generator pins in `tools/`, `openapi.json` and the generated clients), and through `^build` the packages it imports: `packages/api` and its dependencies. So a route, schema or generator change re-runs it, and a change elsewhere reuses the result. Unlike the other packages' `check`, it doesn't depend on the root `//#check:root` (vendored skills under `.agents/`), which can't change its result; CI still runs that through the other packages' `check`. It runs in `Checks (Linux)` in CI; that job needs the Swift toolchain and Java too.

`test/drift.test.ts` runs the spec + TypeScript part of the same comparison under `pnpm test`, and proves that a route change without a regeneration fails. `test/check-cache.test.ts` reads turbo's dry run and fails when the check is no longer cached or its hash loses one of these inputs.

## Generators

Every generator version is pinned, so the output only changes when the API or a pinned version changes.

| Output | Generator | Pinned in | Settings |
|---|---|---|---|
| `openapi.json` | `@hono/zod-openapi` `getOpenAPI31Document` | `pnpm-lock.yaml` | `packages/api/src/openapi.ts` |
| TypeScript | [openapi-typescript](https://openapi-ts.dev) 7.13.0 + [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) | `tools/typescript-generator/package.json` | defaults |
| Swift | [swift-openapi-generator](https://github.com/apple/swift-openapi-generator) 1.13.1 | `tools/swift-generator/Package.resolved` | `config/swift-openapi-generator.yaml` |
| Kotlin | [openapi-generator](https://openapi-generator.tech) 7.25.0, `kotlin` generator | `config/openapi-generator.json` (version + SHA-256) | `config/kotlin.json` |

### TypeScript: openapi-typescript + openapi-fetch

- openapi-typescript generates **types only** (`paths`, `components`, `operations`). It adds no runtime code and makes a small, readable diff in review.
- openapi-fetch (a few kB) is the runtime: `createApiClient({ baseUrl })` in `src/index.ts` returns a `fetch` wrapper whose paths, parameters, bodies and responses are all type-checked against `paths`. It runs in Server Components, route handlers and the browser.
- Alternatives considered: `@hey-api/openapi-ts` and orval generate a whole SDK (more generated code and config for the same type safety). Hono's own RPC client (`hc`) would couple the web app to Hono's types instead of the contract that iOS and Android use.
- openapi-typescript builds its output with the TypeScript 5 compiler API, which TypeScript 7 (used everywhere else) no longer ships. `tools/typescript-generator` is a tiny workspace package that gives it its own TypeScript 5.9.

### Swift: swift-openapi-generator

- Apple's generator, as ADR-004 requires. It produces `Types` and a `Client` (`generate: [types, client]`, `public`, idiomatic naming). The output is committed, so the iOS app doesn't run the generator as a build plugin.
- `swift/` is a Swift package (`FivviAPI`) with the generated sources and the runtime dependencies (`swift-openapi-runtime`, `swift-openapi-urlsession`). The iOS app (E008) adds it as a local package.
- `tools/swift-generator` pins the generator and all its dependencies in `Package.resolved`. SwiftPM only builds a dependency's executable when a target uses it, so that package has a no-op plugin that depends on it.

### Kotlin: openapi-generator

- `kotlin` generator with `jvm-retrofit2`, `kotlinx_serialization` and coroutines (`suspend` functions). This stack is common on Android, and kotlinx.serialization needs no reflection.
- Package `app.fivvi.api`. Change it in `config/kotlin.json` if E008 picks a different application ID, then regenerate.
- Only `src/main/kotlin` is kept. The generator's Gradle files, docs and test stubs are dropped; E008 compiles `kotlin/generated` in its own Gradle module with retrofit 3, okhttp and kotlinx-serialization-json.
- openapi-generator runs on Java, from the jar on Maven Central, verified against the pinned SHA-256. Set `JAVA_HOME`, or have `java` on the `PATH`.

## Upgrading a generator

1. Bump the version: `tools/typescript-generator/package.json`, `tools/swift-generator/Package.swift` (then `swift package update --package-path tools/swift-generator`), or `config/openapi-generator.json` (version **and** SHA-256; Maven Central publishes the SHA-1 next to the jar to cross-check).
2. `pnpm generate:contract`, review the diff of the generated code, and build the clients.
3. Commit the version bump and the regenerated output together.
