# @trainer-hub/observability

Error reporting to Sentry (EU region) for server runtimes: the API and the cron job (E009, ADR-013). The only code in the repo that imports `@sentry/*`; a Biome rule in the root `biome.json` enforces that. What is captured and the scrubbing rules: [docs/engineering/OBSERVABILITY.md](../../docs/engineering/OBSERVABILITY.md).

```ts
import { createErrorReporter } from '@trainer-hub/observability';

const errorReporter = createErrorReporter(); // SENTRY_DSN, RAILWAY_ENVIRONMENT_NAME, RAILWAY_GIT_COMMIT_SHA

errorReporter.captureError(error, { request, route: '/v1/clients/:clientId' });
await errorReporter.flush(); // before a short-lived process exits
```

Without `SENTRY_DSN`, the reporter does nothing and makes no network call.

| Path | What |
|---|---|
| `src/config.ts` | Reads the DSN, environment (`production`, `preview`, `development`) and release |
| `src/reporter.ts` | `createErrorReporter()`: its own Sentry client, errors only |
| `src/scrub.ts` | The scrubber: an allowlist applied in `beforeSend` and `beforeBreadcrumb` |
| `src/transport.ts` | Posts envelopes to Sentry with `fetch` |
| `src/capture.ts` | Capture transport for tests: keeps the events that would be sent |
| `src/catalog.ts` | The product event catalog: the only events `track()` accepts |
| `src/event-schema.ts` | `property` and `defineCatalog()`: UUIDs, enums, booleans, numbers and ISO dates only |
| `src/product-events.ts` | `createProductEvents()`: `track()` and `flush()` to PostHog EU |
| `src/product-event-capture.ts` | Capture transport for tests: keeps the product events PostHog would receive |

Product events go to PostHog EU from server code, only from the catalog ([OBSERVABILITY.md §4](../../docs/engineering/OBSERVABILITY.md#4-product-events)). The only code in the repo that imports `posthog-node`.

```ts
import { createProductEvents } from '@trainer-hub/observability';

const productEvents = createProductEvents({ errorReporter }); // POSTHOG_KEY, RAILWAY_ENVIRONMENT_NAME

productEvents.track({ event: 'booking_confirmed', distinctId: userId, properties: { booking_id } });
await productEvents.flush(); // once per request; the API does this for every route
```

Without `POSTHOG_KEY`, events are still checked but nothing is sent.
