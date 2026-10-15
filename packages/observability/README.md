# @trainer-hub/observability

Error reporting to Sentry (EU region) for the API, the cron job and the web app's server and browser, plus the web build's source map upload, and cookieless page views to PostHog EU (E009, ADR-013). The only code in the repo that imports `@sentry/*` or `posthog-js`; a Biome rule in the root `biome.json` enforces that. What is captured and the scrubbing rules: [docs/engineering/OBSERVABILITY.md](../../docs/engineering/OBSERVABILITY.md).

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

// app/layout.tsx reads NEXT_PUBLIC_POSTHOG_KEY at request time; app/page-views.tsx, per path:
const { key } = readPageViewsConfig(process.env);
if (key) void capturePageView(key); // loads posthog-js on the first call
```

| Path | What |
|---|---|
| `src/config.ts` | Reads the DSN, environment (`production`, `preview`, `development`) and release |
| `src/reporter.ts` | `createErrorReporter()`: its own Sentry client, errors only |
| `src/client-options.ts` | The options every Sentry client shares (tags, scrubber, no SDK data collection) |
| `src/request-error.ts` | `createRequestErrorHandler()`: Next.js's `onRequestError` for the web server |
| `src/browser.ts` | `initBrowserErrorReporting()` (export `./browser`): the browser client, errors only |
| `src/page-views.ts` | `capturePageView()` and `readPageViewsConfig()` (export `./page-views`): cookieless PostHog page views with the path only; `scrubPageView()`, its `before_send` allowlist |
| `src/source-maps.ts` | `publishSourceMaps()` (export `./source-maps`): uploads the web app's source maps with `sentry-cli`, then deletes them |
| `src/scrub.ts` | The scrubber: an allowlist applied in `beforeSend` and `beforeBreadcrumb`; `NO_DATA_COLLECTION` for the SDK |
| `src/transport.ts` | Posts envelopes to Sentry with `fetch` |
| `src/capture.ts` | Capture transport for tests: keeps the events that would be sent |
