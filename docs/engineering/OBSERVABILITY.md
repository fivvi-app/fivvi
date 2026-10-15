# Observability

What Trainer Hub reports about itself, and what it never sends ([ADR-013](../decisions/ADR-013-observability.md), spec [#32](https://github.com/thekeyvan/trainer-hub/issues/32)). Errors go to **Sentry (EU region)**. This document covers the server side (API and cron); the web app, page views, product events and the native apps are added by the later E009 tickets.

## 1. Error reporting on the server

`packages/observability` owns every Sentry call in TypeScript. Apps and other packages call `createErrorReporter()` and never import `@sentry/*` themselves: Biome's `noRestrictedImports` rule (root `biome.json`) fails lint when they do.

| Runtime | What is captured | Sentry project |
|---|---|---|
| API (`packages/api`, inside the Next.js server) | Every unhandled error in a route. The caller gets the generic `500 Internal Server Error` text, with no stack trace or internal message. `HTTPException`s that a route throws on purpose are not reported | `web` |
| Cron (`apps/cron`) | A failed run. The error is sent and flushed (at most 2 s) before the process exits with code 1 | `cron` |

Not captured: health check failures (they answer `503` and log to the console), validation errors (`400`) and other expected responses.

Every event carries:

- `environment`: `production`, `preview` (PR environments) or `development` (Railway's `development` environment, and local), from `RAILWAY_ENVIRONMENT_NAME`;
- `release`: the commit SHA of the deploy, from `RAILWAY_GIT_COMMIT_SHA`;
- for API errors, the route template as served under `/api` (`transaction` `POST /api/v1/clients/:clientId`, tag `route`), never the real path.

How it is set up:

- **Off without a DSN.** Without `SENTRY_DSN` (local development, unit, integration and e2e tests, CI), `createErrorReporter()` returns a reporter that does nothing: no SDK client, no network call, nothing fails. The variables per environment are in [ENVIRONMENTS.md §7](ENVIRONMENTS.md#7-variables).
- **Errors only.** Tracing, profiling and session replay are off. Each runtime gets its own Sentry client: no auto-instrumentation, no global error handlers, and no default PII (`sendDefaultPii: false`).
- **Scrubbed in the process.** Every event and breadcrumb passes the scrubber (§2) in `beforeSend` and `beforeBreadcrumb`, before it leaves the process.
- **Defence in depth (owner setup, #47).** The Sentry projects also have the server-side data scrubber and "Prevent storing of IP addresses" switched on.

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
- Test data is synthetic: fake names and `@example.com` addresses.
