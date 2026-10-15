# Observability

What Trainer Hub reports about itself, and what it never sends ([ADR-013](../decisions/ADR-013-observability.md), spec [#32](https://github.com/thekeyvan/trainer-hub/issues/32)). Errors go to **Sentry (EU region)**, product events to **PostHog (EU Cloud)**. This document covers the server side: error reporting for the API and cron, and product events (§4); the web app, page views and the native apps are added by the later E009 tickets.

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

## 4. Product events

Server code sends product events to **PostHog EU** (`https://eu.i.posthog.com`, Frankfurt) with one typed function, `track()`. It only accepts events from the catalog (§4.3), with only the properties the catalog lists for them. Product events from the native apps are captured here too, when the API handles the action: the apps have no analytics SDK.

### 4.1 How it is set up

- **One entry point.** `packages/observability` owns every PostHog call on the server. The API gets `createProductEvents({ errorReporter })` as the `productEvents` dependency (`apps/web/app/api/[[...route]]/route.ts`); a route calls `dependencies.productEvents.track(event)` after the action succeeded. Apps and other packages never import `posthog-node`: the same Biome `noRestrictedImports` rule as for Sentry fails lint when they do.
- **Production only, off without a key.** Without `POSTHOG_KEY` (development, previews, local, tests, CI), `track()` still checks the event but sends nothing and makes no network call ([ENVIRONMENTS.md §7](ENVIRONMENTS.md#7-variables)).
- **Flushed per request, never failing it.** Each event is sent straight away, and the API waits for it after every request (`flush()`, at most 1 s). A failed or slow PostHog never fails or blocks the request: `flush()` never throws.
- **What leaves the process:** the event name, `distinct_id`, the catalog properties, a timestamp and an event UUID, plus the SDK's own `$lib`, `$lib_version`, `$is_server` and `$geoip_disable: true`. GeoIP lookup and exception autocapture are off, and there is no feature flag key, so the SDK makes no other calls. The request to PostHog comes from our server, so PostHog never sees a visitor's IP address.

### 4.2 Rules for an event

- **Name:** `snake_case`, past tense, object first: `booking_confirmed`, `workout_logged`. Property names are `snake_case` too. Use the terms of `GLOSSARY.md`.
- **Properties** are made with `property` (`packages/observability/src/event-schema.ts`) and can only be: `uuid()`, `enum([...])`, `boolean()`, `number()`, `date()` (ISO date), `dateTime()` (ISO date and time) and `optional(...)` of one of those. **Never free text:** no names, email addresses, note or workout content, or URL parameters ([role-mapping.md](../legal/role-mapping.md) D4). `defineCatalog()` throws when the module loads if a property is anything else, e.g. `z.string()`, or a name isn't `snake_case`.
- **`distinct_id`** is the internal user UUID. For an anonymous visitor (a booking page visitor before verification), use `anonymousDistinctId()`: a random UUID for that request, never stored. Link the steps of an anonymous funnel through record UUIDs in the properties (e.g. the hold's ID), not through the visitor.
- **Checked twice.** The type of `track()` rejects an unknown event, an extra property and a value outside an enum at compile time. At runtime, every event is checked against its strict zod schema. Outside production, a rejected event throws a `ProductEventError`, so a test or a developer sees it at once. In production it is dropped and reported to Sentry as a warning that names the event and the failing property, never a value; the request carries on.
- **Versioning:** an event's name and the meaning and type of its properties never change once it is live, so old and new data stay comparable. Adding an optional property is fine. Anything else is a new event with a new name (e.g. `booking_confirmed_v2`); mark the old one `Retired` in §4.3 and stop sending it.

How to add an event:

1. The feature spec names the event, its properties and the metric it serves (e.g. `ROADMAP.md §8`).
2. Add it to `PRODUCT_EVENT_CATALOG` in `packages/observability/src/catalog.ts`.
3. Add or update its row in §4.3, with status `Live`.
4. Call `track()` where the action succeeds, with the route's `productEvents` dependency.
5. Test it through the capture transport: pass `createProductEvents({ env: { POSTHOG_KEY: 'phc_test' }, transport: createProductEventCaptureTransport(), errorReporter })` to the API and assert on `transport.events`, i.e. what PostHog would receive.

### 4.3 Event catalog

No event is live yet. The MVP features add theirs when they are built; their specs define the properties. The planned events serve the pilot metrics in `ROADMAP.md §8` and give Release 3.2 business analytics its history (`ROADMAP.md §10`):

| Event | Status | Feature | Measures |
|---|---|---|---|
| `spot_held` | Planned | F029 Booking Hold | Booking started → confirmed conversion; time to verify |
| `booking_confirmed` | Planned | F030 Magic-Link Verification, F031 Guest Booking | Booking conversion; share of bookings through public pages; Open Gym bookings per week |
| `booking_cancelled` | Planned | F026 Cancellations | Cancellations (3.2) |
| `attendance_recorded` | Planned | F025 Attendance | Trainers using their assigned sessions; no-shows (3.2) |
| `workout_logged` | Planned | F043 Live Workout Logging | Private sessions with a logged workout |

### 4.4 Testing

- `packages/observability/src/track.test.ts` uses its own test catalog. It checks that a catalog event leaves with exactly its properties (`createProductEventCaptureTransport()` keeps the events PostHog would receive, decoded from the SDK's gzipped batch); that unknown events, extra properties, free text and a non-UUID `distinct_id` are rejected, with `@ts-expect-error` on each call so typecheck fails if one compiles; that production drops them with a Sentry warning; and that nothing is sent without a key.
- `packages/api/test/product-events.test.ts` checks that the API flushes after every request.
