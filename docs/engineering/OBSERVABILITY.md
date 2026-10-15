# Observability

What Trainer Hub reports about itself, and what it never sends ([ADR-013](../decisions/ADR-013-observability.md), spec [#32](https://github.com/thekeyvan/trainer-hub/issues/32)). Errors go to **Sentry (EU region)**. This document covers error reporting for the API, the cron job and the web app (server and browser); page views, product events and the native apps are added by the later E009 tickets.

## 1. Error reporting

`packages/observability` owns every Sentry call in TypeScript. Apps and other packages call its functions (`createErrorReporter()`, `createRequestErrorHandler()`, `initBrowserErrorReporting()`, `publishSourceMaps()`) and never import `@sentry/*` themselves: Biome's `noRestrictedImports` rule (root `biome.json`) fails lint when they do.

| Runtime | What is captured | Sentry project |
|---|---|---|
| API (`packages/api`, inside the Next.js server) | Every unhandled error in a route. The caller gets the generic `500 Internal Server Error` text, with no stack trace or internal message. `HTTPException`s that a route throws on purpose are not reported | `web` |
| Web server (`apps/web/instrumentation.ts`) | Every error thrown while rendering a page: server components, server actions, and route handlers outside the API (Next.js's `onRequestError`). The visitor gets the error page | `web` |
| Web browser (`apps/web/instrumentation-client.ts`) | Every uncaught error and unhandled promise rejection in the browser, including a component that throws while rendering. A future error boundary (`error.tsx`) that catches an error itself reports it with `captureError` | `web` |
| Cron (`apps/cron`) | A failed run. The error is sent and flushed (at most 2 s) before the process exits with code 1 | `cron` |

Not captured: health check failures (they answer `503` and log to the console), validation errors (`400`), `notFound()` and redirects, and other expected responses.

Every event carries:

- `environment`: `production`, `preview` (PR environments) or `development` (Railway's `development` environment, and local), from `RAILWAY_ENVIRONMENT_NAME`;
- `release`: the commit SHA of the deploy, from `RAILWAY_GIT_COMMIT_SHA`;
- for API errors, the route template as served under `/api` (`transaction` `POST /api/v1/clients/:clientId`, tag `route`), never the real path; for web server errors, the page's route template (`GET /clients/[clientId]`).

The browser gets `environment` and `release` from the same two variables, inlined into the bundle at build time with `NEXT_PUBLIC_SENTRY_DSN` (`next.config.ts`; Railway passes them to the Docker build).

How it is set up:

- **Off without a DSN.** Without `SENTRY_DSN` (local development, unit, integration and e2e tests, CI), `createErrorReporter()` returns a reporter that does nothing: no SDK client, no network call, nothing fails. Without `NEXT_PUBLIC_SENTRY_DSN`, the browser installs no handler and sends nothing. The variables per environment are in [ENVIRONMENTS.md §7](ENVIRONMENTS.md#7-variables).
- **Errors only.** Tracing, profiling, session replay, sessions and client reports are off, in the browser too. Each server runtime gets its own Sentry client: no auto-instrumentation and no global error handlers. The browser client has only the global handlers for uncaught errors, linked errors (`cause`), deduplication and the page URL.
- **No data collection by the SDK.** Sentry v11 collects user info, cookies, headers, bodies and query strings by default (`dataCollection`; the old `sendDefaultPii` option is gone). Every client switches all of it off (`NO_DATA_COLLECTION`), so Sentry never infers the visitor's IP address (`infer_ip: never`).
- **Scrubbed in the process.** Every event and breadcrumb passes the scrubber (§2) in `beforeSend` and `beforeBreadcrumb`, before it leaves the process.
- **Defence in depth (owner setup, #47).** The Sentry projects also have the server-side data scrubber and "Prevent storing of IP addresses" switched on.

### Source maps

Production stack traces from the web app map to the original TypeScript, and nobody can download the source maps from the web app:

1. `next build` writes source maps for the browser (`productionBrowserSourceMaps`) and the server, with a debug ID in every bundle and its map (`turbopack.debugIds`, `next.config.ts`). The SDK sends the debug IDs with each event, which is how Sentry finds the matching map.
2. `apps/web/scripts/publish-source-maps.ts` (`publishSourceMaps()`) then uploads the maps in `.next/static` and `.next/server` to the Sentry project `web` with `sentry-cli`, tagged with the release. It needs `SENTRY_AUTH_TOKEN`, an organisation auth token (it carries the organisation and the EU region), which only exists during the Docker build.
3. It then deletes every `*.map` from `.next`, including the standalone server, before the client assets are copied into it. `/_next/static/**/*.map` answers `404`; the bundles keep their `sourceMappingURL` comment, which points at nothing.

Without `SENTRY_AUTH_TOKEN` (local, CI, previews without a token), nothing is uploaded and nothing talks to the network; the maps are still deleted. A failed upload warns in the build log but doesn't fail the build: a Sentry outage must not block a deploy, at the cost of unmapped stack traces for that release.

## 2. Scrubbing rules

The scrubber (`scrubEvent`, `scrubBreadcrumb`) is a pure allowlist: whatever isn't listed as kept is dropped, so a new SDK field never leaks by default.

| Part of an event | Kept | Dropped |
|---|---|---|
| Error message (`exception.value`, `message`) | The text, with email addresses masked as `[email]` | Email addresses |
| Stack frames | File, function, line, column, source lines | Local variables (`vars`) |
| Request | HTTP method; URL without query string and fragment, emails masked; headers `accept`, `accept-language`, `content-length`, `content-type` | Body, cookies, query string, `Authorization` and every other header (also `x-forwarded-for`), environment (`REMOTE_ADDR`) |
| User | `id` (internal user UUID) and `organization_id` (workspace UUID), only when they are UUIDs | Email, name, username, IP address, location |
| Tags | `route` (a route template) | Everything else |
| Contexts | `app`, `cloud_resource`, `culture`, `device`, `os`, `runtime`, `trace`; `response.status_code` | Everything else, including custom contexts |
| `extra`, `modules`, `threads` | Nothing | All |
| Breadcrumbs | Type, category, level, timestamp; `data.method`, `data.status_code`, `data.url` (without query string) | The message (a log line that may hold any text) and all other data |

UUIDs, route templates, HTTP methods and status codes stay, so an error can still be traced to a record and a route.

**The scrubber can't recognise a name or note text inside an error message.** That is why the message is the one free text we keep, and why our errors never contain names, email addresses or note text: put IDs in messages, never user content ([ADR-013](../decisions/ADR-013-observability.md): no personal data or note content in events, error messages or breadcrumbs). `EmailSendError` in `packages/email` is an example.

## 3. Testing

- Tests check what would leave the process, never how the SDK is called. `createCaptureTransport()` keeps the events that would be sent, after scrubbing; pass it to `createErrorReporter({ env, transport })` with a fake DSN such as `https://public@o0.ingest.de.sentry.io/1`.
- The API is tested through `createApp({ ...NO_DEPENDENCIES, errorReporter })` (`packages/api/test/observability.test.ts`).
- The cron job runs as its own process against a fake Sentry endpoint on `127.0.0.1` (`apps/cron/test/fake-sentry.ts`), which proves the event arrives before the process exits.
- Web: `packages/observability/src/web.test.ts` feeds a server component error through `createRequestErrorHandler()`, and simulates the browser calling `window.onerror` and `window.onunhandledrejection` after `initBrowserErrorReporting()`. `source-maps.test.ts` runs `publishSourceMaps()` on a fake build output with a fake `sentry-cli`. The e2e tests (`apps/web/e2e/error-reporting.spec.ts`) check that every map a bundle points at answers `404`, and that the browser makes no request outside the app's origin.
- Not automated: a real event with a source-mapped stack. After the owner setup (#47), throw a synthetic error on a preview or in production and check the stack in Sentry.
- Test data is synthetic: fake names and `@example.com` addresses.
