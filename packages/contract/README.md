# @trainer-hub/contract

The API contract and the clients generated from it (ADR-004, E018).

`packages/api` defines the routes with Hono + `@hono/zod-openapi`. The zod schemas validate requests at runtime and also produce the OpenAPI document. This package commits that document and generates a client for each platform from it, so web, iOS and Android can't drift from the API.

```text
packages/api (zod routes)
  └─▶ openapi.json (OpenAPI 3.1)
        ├─▶ src/generated/schema.ts                  TypeScript (web)
        ├─▶ swift/Sources/TrainerHubAPI/Generated/   Swift (iOS)
        └─▶ kotlin/generated/                        Kotlin (Android)
```

## Rules

- **Never edit generated files by hand.** Everything under the paths above is overwritten on the next run.
- **An API change regenerates everything in the same PR.** `pnpm check` fails otherwise.
- Contract paths don't include the `/api` mount prefix. It is the server URL (`servers[0].url`), so the API can move to its own host later without changing the contract.

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

The first run builds swift-openapi-generator (about 1–2 minutes) and downloads the openapi-generator jar (30 MB, from Maven Central, SHA-256 checked) into `node_modules/.cache/contract`. Later runs take a few seconds.

## Drift check

```bash
pnpm check            # all packages, via Turborepo
```

`scripts/check.ts` generates the spec and all three clients into a temp directory. It fails and lists every file that differs from the committed one, is missing, or is no longer generated. The task is never cached, because its inputs include `packages/api` and the toolchains. E002 adds it to CI as a required check; the CI job needs the Swift toolchain and Java too.

`test/drift.test.ts` runs the spec + TypeScript part of the same comparison under `pnpm test`, and proves that a route change without a regeneration fails.

## Generators

Every generator version is pinned, so the output only changes when the API or a pinned version changes.

| Output | Generator | Pinned in | Settings |
|---|---|---|---|
| `openapi.json` | `@hono/zod-openapi` `getOpenAPI31Document` | `pnpm-lock.yaml` | `packages/api/src/openapi.ts` |
| TypeScript | [openapi-typescript](https://openapi-ts.dev) 7.13.0 + [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) | `tools/typescript-generator/package.json` | defaults |
| Swift | [swift-openapi-generator](https://github.com/apple/swift-openapi-generator) 1.13.1 | `tools/swift-generator/Package.resolved` | `config/swift-openapi-generator.yaml` |
| Kotlin | [openapi-generator](https://openapi-generator.tech) 7.25.0, `kotlin` generator | `scripts/pipeline.ts` (version + SHA-256) | `config/kotlin.json` |

### TypeScript: openapi-typescript + openapi-fetch

- openapi-typescript generates **types only** (`paths`, `components`, `operations`). It adds no runtime code and makes a small, readable diff in review.
- openapi-fetch (a few kB) is the runtime: `createApiClient({ baseUrl })` in `src/index.ts` returns a `fetch` wrapper whose paths, parameters, bodies and responses are all type-checked against `paths`. It runs in Server Components, route handlers and the browser.
- Alternatives considered: `@hey-api/openapi-ts` and orval generate a whole SDK (more generated code and config for the same type safety). Hono's own RPC client (`hc`) would couple the web app to Hono's types instead of the contract that iOS and Android use.
- openapi-typescript builds its output with the TypeScript 5 compiler API, which TypeScript 7 (used everywhere else) no longer ships. `tools/typescript-generator` is a tiny workspace package that gives it its own TypeScript 5.9.

### Swift: swift-openapi-generator

- Apple's generator, as ADR-004 requires. It produces `Types` and a `Client` (`generate: [types, client]`, `public`, idiomatic naming). The output is committed, so the iOS app doesn't run the generator as a build plugin.
- `swift/` is a Swift package (`TrainerHubAPI`) with the generated sources and the runtime dependencies (`swift-openapi-runtime`, `swift-openapi-urlsession`). The iOS app (E008) adds it as a local package.
- `tools/swift-generator` pins the generator and all its dependencies in `Package.resolved`. SwiftPM only builds a dependency's executable when a target uses it, so that package has a no-op plugin that depends on it.

### Kotlin: openapi-generator

- `kotlin` generator with `jvm-retrofit2`, `kotlinx_serialization` and coroutines (`suspend` functions). This stack is common on Android, and kotlinx.serialization needs no reflection.
- Package `nl.trainerhub.api`. Change it in `config/kotlin.json` if E008 picks a different application ID, then regenerate.
- Only `src/main/kotlin` is kept. The generator's Gradle files, docs and test stubs are dropped; E008 compiles `kotlin/generated` in its own Gradle module with retrofit 3, okhttp and kotlinx-serialization-json.
- openapi-generator runs on Java, from the jar on Maven Central, verified against the pinned SHA-256. Set `JAVA_HOME`, or have `java` on the `PATH`.

## Upgrading a generator

1. Bump the version: `tools/typescript-generator/package.json`, `tools/swift-generator/Package.swift` (then `swift package update --package-path tools/swift-generator`), or `OPENAPI_GENERATOR` in `scripts/pipeline.ts` (version **and** SHA-256; Maven Central publishes the SHA-1 next to the jar to cross-check).
2. `pnpm generate:contract`, review the diff of the generated code, and build the clients.
3. Commit the version bump and the regenerated output together.
