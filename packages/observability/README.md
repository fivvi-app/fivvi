# @trainer-hub/observability

Error reporting to Sentry (EU region) for the API, the cron job and the web app's server and browser, plus the web build's source map upload; server product events and cookieless web page views to PostHog EU (E009, ADR-013). The only code in the repo that imports `@sentry/*`, `posthog-node` or `posthog-js`; a Biome rule in the root `biome.json` enforces that. What is captured and the scrubbing rules: [docs/engineering/OBSERVABILITY.md](../../docs/engineering/OBSERVABILITY.md).

```ts
import { createErrorReporter } from '@trainer-hub/observability';

const errorReporter = createErrorReporter(); // SENTRY_DSN, RAILWAY_ENVIRONMENT_NAME, RAILWAY_GIT_COMMIT_SHA

errorReporter.captureError(error, { request, route: '/v1/clients/:clientId' });
await errorReporter.flush(); // before a short-lived process exits
```

Without `SENTRY_DSN`, the reporter does nothing and makes no network call.

The web app (`apps/web`) wires in the rest:

```ts
// instrumentation.ts: errors while rendering a page
export const onRequestError = createRequestErrorHandler(createErrorReporter());

// instrumentation-client.ts: uncaught browser errors; values inlined at build time
initBrowserErrorReporting({ env: { NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN, … } });

// scripts/publish-source-maps.ts, after `next build`: upload (with SENTRY_AUTH_TOKEN), then delete
await publishSourceMaps({ buildDir: '.next' });

// app/layout.tsx reads NEXT_PUBLIC_POSTHOG_KEY and POSTHOG_HOST at request time;
// app/page-views.tsx, per path:
const { key, host } = readPageViewsConfig(process.env);
if (key) void capturePageView({ key, host }); // loads posthog-js on the first call

// instrumentation.ts, at server start: reports a key without a valid POSTHOG_HOST, once
export function register() { checkPageViewsConfig(errorReporter); }
```

| Path | What |
|---|---|
| `src/config.ts` | Reads the DSN, environment (`production`, `preview`, `development`) and release; the PostHog keys and `POSTHOG_HOST` |
| `src/posthog-config.ts` | `checkPageViewsConfig()` and `PostHogConfigError`: a PostHog key without a valid `POSTHOG_HOST`, logged and reported to Sentry |
| `src/reporter.ts` | `createErrorReporter()`: its own Sentry client, errors only |
| `src/client-options.ts` | The options every Sentry client shares (tags, scrubber, no SDK data collection) |
| `src/request-error.ts` | `createRequestErrorHandler()`: Next.js's `onRequestError` for the web server |
| `src/browser.ts` | `initBrowserErrorReporting()` (export `./browser`): the browser client, errors only |
| `src/page-views.ts` | `capturePageView()` and `readPageViewsConfig()` (export `./page-views`): cookieless PostHog page views with the path only ([OBSERVABILITY.md §5](../../docs/engineering/OBSERVABILITY.md#5-page-views)); `scrubPageView()`, its `before_send` allowlist |
| `src/source-maps.ts` | `publishSourceMaps()` (export `./source-maps`): uploads the web app's source maps with `sentry-cli`, then deletes them |
| `src/scrub.ts` | The scrubber: an allowlist applied in `beforeSend` and `beforeBreadcrumb`; `NO_DATA_COLLECTION` for the SDK |
| `src/transport.ts` | Posts envelopes to Sentry with `fetch` |
| `src/capture.ts` | Capture transport for tests: keeps the events that would be sent |
| `src/catalog.ts` | The product event catalog: the only events `track()` accepts |
| `src/event-schema.ts` | `property` and `defineCatalog()`: UUIDs, enums, booleans, numbers and ISO dates only |
| `src/product-events.ts` | `createProductEvents()`: `track()` and `flush()` to PostHog, at `POSTHOG_HOST` |
| `src/product-event-capture.ts` | Capture transport for tests: keeps the product events PostHog would receive |

Product events go to PostHog (`POSTHOG_HOST`) from server code, only from the catalog ([OBSERVABILITY.md §4](../../docs/engineering/OBSERVABILITY.md#4-product-events)).

```ts
import { createProductEvents } from '@trainer-hub/observability';

const productEvents = createProductEvents({ errorReporter }); // POSTHOG_KEY, POSTHOG_HOST, RAILWAY_ENVIRONMENT_NAME

productEvents.track({ event: 'booking_confirmed', distinctId: userId, properties: { booking_id } });
await productEvents.flush(); // once per request; the API does this for every route
```

Without `POSTHOG_KEY`, events are still checked but nothing is sent. A key without a valid `POSTHOG_HOST` (an `https://` URL) is a configuration error: it is logged and reported to Sentry, and nothing is sent.
