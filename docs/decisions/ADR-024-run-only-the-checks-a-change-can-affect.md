# ADR-024: A check runs when something it depends on changed, and only then

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-28 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | Builds on ADR-002 (CI), ADR-014 (testing), ADR-018 (merge queue); WORKFLOW.md §3 and §7; TESTING.md §7; issue #293 |

## Context

Measured on 2026-10-28, checks cost more time than the changes they guard:

- **Locally**, `scripts/check.sh` ran the integration tests (396) and the web e2e tests (70) on every run, whatever changed, because both were `cache: false` in turbo. A builder runs the full check after every round, so #292 (scripts and Markdown only) ran the database and browser suites about six times for nothing, and `pr.sh create` ran it once more before each push.
- **In CI**, the `iOS` job (16 to 24 minutes) and the `Android` job (11 to 14) ran on 24 and 25 of the last 60 PR runs. Any path under `packages/contract/` started both, also when a change touched only the TypeScript side and the committed Swift and Kotlin clients stayed the same. `E2E (Linux)` ran on every PR, also for a docs-only change. `Checks (Linux)` was fine: turbo's cache already skips what did not change.
- The merge queue runs the same set again on the combined commit.
- Inside the native jobs the time went to work done in a row: the iOS Dutch and English test passes one after the other (about 16 of 21 minutes), the Android Maestro flows after the unit and UI tests, and an iOS build cache that was restored but did not make the build incremental.

The owner wants the factory fast, with no check removed: the same tests, run when they can tell something.

## Decision

One rule everywhere: **a check runs when something it depends on changed.**

1. **One tested decision.** `scripts/affected.mjs` maps the changed paths to what must run. Packages come from the workspace itself (`pnpm-workspace.yaml`, each `package.json`): a changed package and every package that depends on it, however indirectly, is affected. Other paths: scripts, hooks, agent definitions, CI, the native apps' files and the Markdown that root tests read affect the root script tests and shellcheck; any other Markdown affects only the hygiene checks (doc links); the workspace setup (lockfile, root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `biome.json`, `.nvmrc`, the shared test preset `packages/testing/src/vitest.ts`) affects everything. The web e2e tests run when the web app is affected. Every skip names its reason. Table-driven tests cover it (`scripts/test/affected.test.mjs`), so the decision lives in a script and not in workflow conditions.
2. **`scripts/check.sh` runs the affected set by default**, against the merge base with `origin/main` plus the working tree. `--all` is today's full run; `--fast` still skips integration and e2e. The cheap hygiene checks (vendored skills, agent definitions, commit messages, emails, secrets, doc links) always run. The summary lists a suite left out as `skipped (not affected)`. Builders run the affected set per round and `--all` only when the round changed the workspace setup or the reviewer asks; `pr.sh create` runs the affected set before every push (`--full` is `--all`). CI stays the gate.
3. **Integration and e2e tests are cacheable** (`turbo.json`): their inputs are the package, what it depends on (turbo's `^build` chain), the migrations, the seeds and the testing package; `TEST_DATABASE_URL`, `DATABASE_URL` and `E2E_PORT` stay out of the hash. A second run with nothing changed is a cache hit, locally and in CI.
4. **CI's `E2E (Linux)` runs only when the web app is affected**, decided in `Detect changes` by the same script, with the reasons in the log and the job summary. `workflow_dispatch` and the `run-native` label force every job.
5. **Native jobs start on what the apps read**: the committed Swift client (`packages/contract/swift/`) starts iOS, the committed Kotlin client (`packages/contract/kotlin/`) starts Android, instead of every path under `packages/contract/`. A change on the TypeScript side that should have changed a client still fails the contract drift check in `Checks (Linux)`.
6. **The merge queue uses the same rules**: `Detect changes` compares a merge group with the group's base commit, so it runs what the combined change affects.
7. **Native jobs that run take half the time, with the same tests.** iOS builds once (`iOS build`, which packs the test bundle as an artifact) and runs the Dutch and the English pass as two parallel jobs (`iOS tests (nl)`, `iOS tests (en)`) with `test-without-building`; the UI tests still run in both languages on every push. Android's `Android build` uploads the debug app made for the Maestro run, `Android tests` runs the unit and Compose UI tests, and `Android Maestro` runs the flows from the uploaded app, in a job of its own. The required checks `iOS` and `Android` stay as **gate jobs** that need their parts and fail when any part did not succeed (`scripts/native-gate.sh`); they are skipped, and so pass, when the native decision says skip, so the ruleset does not change. `test-ios.sh` and `android.sh` get the split steps, and `pnpm test:ios` and `pnpm test:android` stay one command each.
8. **The iOS build cache is made to work.** Xcode decides what to compile by the modification time of its inputs, and a checkout gives every file the time of the checkout, so the restored DerivedData was thrown away (about 90 s of Swift and 50 s of asset catalog every run). `scripts/ios-mtimes.mjs` records each source file's content hash and modification time in the cache and puts the old time back on every file whose content is unchanged; a changed file keeps the new time and is compiled.

## Why this is safe

- The affected set is conservative: a package change affects all its dependents; a path no rule knows is treated as a root change; the workspace setup affects everything. Skipping is only for paths nothing builds from (Markdown that no test reads).
- CI is still the gate: `Checks (Linux)` runs every package task through turbo, whose cache now skips integration and e2e exactly when none of their inputs changed. A required check that is skipped passes the ruleset only when its inputs did not change; a gate that runs fails if any part did not succeed.
- Narrowing the native trigger misses nothing: the apps build only from the committed generated clients, and the drift check fails when an API change did not regenerate them.
- `check.sh --all` and `workflow_dispatch` or the `run-native` label are the way to run everything on demand.

## Consequences

- **Positive:** a change to scripts or documents skips the database, browser and native suites; a round of a builder takes seconds when little changed; iOS and Android take about half the time when they do run; the required check names do not change.
- **Negative:** more parts to a native check (a failing part is found by its own job name); two artifacts per native run (kept one day); the rule that maps paths to checks must be kept in step with the workspace (it reads the workspace, so a new package needs no change, but a new kind of root file may need a pattern).
- **Not done:** remote turbo caching (a paid or self-hosted service); moving UI tests to the merge queue only (they keep running on every push); larger or self-hosted macOS runners.
