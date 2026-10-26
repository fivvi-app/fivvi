# @fivvi/testing

Shared test setup (ADR-014, `docs/engineering/TESTING.md`). Test-only: add it as a `devDependency`.

| Entry point | What |
|---|---|
| `@fivvi/testing/vitest` | `unitConfig()` and `integrationConfig()`, the Vitest presets every package uses |
| `@fivvi/testing/database` | `cloneTemplateDatabase()`, `createTestDatabase()`, `withRollback()` for integration tests |
| `@fivvi/testing/database/setup` | `setupTemplateDatabase(migrate)` for a Vitest global setup |
| `@fivvi/testing/database/server` | `serverUrl()`, `localServerUrl(url, variable, refusal)`, `databaseUrl(name)`, `identifier(name)`, `onServer(...)` on the local test server, for setups outside Vitest (the web e2e server); `localServerUrl` returns `url` only when its host is local and otherwise throws `refusal` without the URL, for every script that deletes data |
| `@fivvi/testing/clock` | `fixedClock`, `manualClock`, `freezeSystemTime`, `zonedTime`, `wallTime`, `dstTransitions` |

Factories (`createWorkspace()`, …) will live here once the first business tables exist (`TESTING.md §5.2`).

## Vitest presets

```ts
// vitest.config.ts: unit tests, *.test.ts(x)
import { unitConfig } from '@fivvi/testing/vitest';
export default unitConfig();

// vitest.integration.config.ts: integration tests, *.integration.test.ts
import { integrationConfig } from '@fivvi/testing/vitest';
export default integrationConfig({ test: { globalSetup: ['./test/global-setup.ts'] } });
```

Both run in Node with `TZ=UTC`, restore mocks, stubbed env and globals after each test, and never retry. Overrides are merged in; arrays such as `exclude` are appended. A package with integration tests also adds `"test:integration": "vitest run --config vitest.integration.config.ts"` to its scripts; turbo picks it up.

## Database isolation

Why and when: `TESTING.md §5.3`. How:

```ts
// test/global-setup.ts: migrate one template database per run
import { setupTemplateDatabase } from '@fivvi/testing/database/setup';
export default setupTemplateDatabase(async (url) => {
  const client = createDatabase({ url, maxConnections: 1 });
  try {
    await runMigrations(client.db);
  } finally {
    await client.close(); // the template can only be copied once nobody is connected
  }
});
```

```ts
// some.integration.test.ts
let database: TestDatabase;
let client: DatabaseClient;

beforeAll(async () => {
  database = await cloneTemplateDatabase(); // this file's own migrated database
  client = createDatabase({ url: database.url, maxConnections: 2 });
});

afterAll(async () => {
  await client?.close();
  await database?.drop();
});

it('AC1: …', async () => {
  await withRollback(client.db, async (tx) => {
    // write and assert through tx; everything is rolled back afterwards
  });
});
```

The server comes from `TEST_DATABASE_URL` (else `DATABASE_URL`) and must be on `localhost`. Database names start with `fivvi_test_<run id>_`; the global setup's teardown drops all of them, including ones a test forgot.

## Clock

```ts
const { springForward, fallBack } = dstTransitions(2026); // 29 March / 25 October, 01:00 UTC
const clock = manualClock(zonedTime('2026-03-28T18:00'));  // Europe/Amsterdam wall-clock time
clock.advance({ days: 1 });                                 // 24 hours
wallTime(clock.now());                                      // '2026-03-29T19:00'
zonedTime('2026-10-25T02:30', { disambiguation: 'later' }); // the second 02:30 (winter time)
```

A local time in the skipped (spring) or repeated (autumn) hour throws unless you pass `disambiguation`. Other time zones: pass `{ timeZone }` to `zonedTime`, or a second argument to `wallTime` and `dstTransitions`.
