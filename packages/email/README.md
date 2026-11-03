# @fivvi/email

Transactional email (ADR-009): React Email templates, localized from `packages/i18n`, sent through Lettermint (ADR-028) behind a small `sendEmail` interface. Server-side only.

```ts
import { createConfiguredTransport, createSendEmail, helloEmail, readEmailConfig } from '@fivvi/email';

// Lettermint: LETTERMINT_API_TOKEN, both routes and the sender are required
const config = readEmailConfig();
const sendEmail = createSendEmail({
  transport: createConfiguredTransport(config),
  sender: config.sender,
});

await sendEmail({
  template: helloEmail,
  props: { firstName: 'Anna', sentAt },
  to: { email: 'anna@example.com', name: 'Anna' },
  locale: 'nl-NL', // resolveCommunicationLanguage() from @fivvi/i18n
  timeZone: 'Europe/Amsterdam', // the workspace time zone
});
```

| Path | What |
|---|---|
| `src/templates/` | One template per email type. Add new ones to `templates` in `index.ts` |
| `src/components/layout.tsx` | The shell every email shares: `<html lang>`, `<title>`, preview line, footer |
| `src/render.tsx` | `renderEmail()` and the per-locale context (`t`, `formatDateTime`) |
| `src/send.ts` | `createSendEmail()`: render, send, inline retry |
| `src/lettermint.ts` | Lettermint transport (`POST /v1/send`), the route per template |
| `src/provider.ts` | `createConfiguredTransport()`: the Lettermint transport for the config `readEmailConfig` read |
| `src/log.ts`, `src/environment.ts` | Log transport and the per-environment choice of transport (`createEnvironmentSendEmail`) |
| `src/memory.ts` | In-memory capture transport for tests and local development |
| `scripts/` | Preview server and the test-send CLI |

## Templates

- **One template per email type, never one per language.** Every string comes from the catalogs through `ctx.t('email.…')`; the Biome `no-hard-coded-jsx-text` rule is registered in `biome.json` and fails on literal text in JSX.
- Copy lives under the `email` namespace in `packages/i18n/{nl-NL,en}.json`, follows `packages/i18n/GLOSSARY.md` (greeting *Hoi {firstName},* / *Hi {firstName},*, key fact first) and passes the normal parity and ICU checks. The native exporters skip `email.*`, because the apps never show it.
- `ctx.t` **throws** on a missing key, a missing placeholder value or broken ICU, so a broken email fails the send and the tests instead of reaching an inbox.
- Dates and times: `ctx.formatDateTime(instant, 'dateWithYear' | 'date' | 'time')`, in the time zone passed to `sendEmail` (default Europe/Amsterdam) and the locale's formatting locale (`en` → `en-GB`). Pass the result into a `{date}` / `{time}` placeholder.
- User content (names, class names) is passed as a placeholder value and rendered as text; React escapes it.
- A template has `subject`, `preview` (the inbox preview line: put the key fact in it), `render` (the content inside the layout) and `previewProps` (obviously fake data for the preview).
- Plain styles for now; E007 brings the design tokens.

Adding a template: write `src/templates/<type>.tsx`, add the keys to both catalogs, add it to `templates`, and add a render test. The generic test in `templates.test.ts` renders every template in every locale.

## Sending

`createSendEmail({ transport, sender })` returns `sendEmail(options)`. It renders the template in the recipient's locale, then sends inline with a short retry (ADR-010):

| Failure | Retried? |
|---|---|
| Network error, timeout (5 s per attempt) | Yes |
| HTTP 429 | Yes, after `Retry-After`; gives up at once if that is more than 2 s |
| HTTP 5xx | Yes |
| Other 4xx (invalid address, 401 wrong token, 403, 422, …) | No |

- At most **3 attempts**, full-jitter exponential backoff (≤ 250 ms, then ≤ 500 ms), so the waits add at most 0.75 s. The worst case, three timeouts, holds the request for about 16 s; Lettermint normally answers well within a second.
- Every send gets a UUID **idempotency key**, reused on each retry. Lettermint (ADR-028) keeps a key for 24 hours: the same key and body return the same `message_id` (`202`), and the same key with another body is `409` (`duplicate`; on a retry it counts as maybe sent). Checked against the live API on 2 November 2026. Its `409` also covers a `5xx` whose outcome was unknown, so after one a retry may count as sent when the email was not: the user can ask for a new email, which gets a new key. `422` (for example `text` under 3 characters) and `401` and `403` are final.
- After the last attempt it throws `EmailSendError`. Its `message` holds only the provider, status and error code (never the recipient, content or API key), so it is safe to log and to report to Sentry (E009). The provider's own message is in `detail`.
- `onRetry` is called before each retry, for logging.

Transports implement `EmailTransport` (`send(email) → { messageId }`, one attempt). Swapping Lettermint for another provider means writing one transport; templates and callers don't change.

**Tests** use `createMemoryTransport()`: it records every email (to, locale, template, subject, HTML, text and the `links` in it) and can fail the next sends with `failNext(error)`. Never call Lettermint from a test.

## Configuration

**Which provider:** Lettermint (ADR-028). The token, both route variables and the sender are required; production without them throws.

| Variable | Example | Notes |
|---|---|---|
| `LETTERMINT_API_TOKEN` | `lm-…` | Lettermint → project → API token. **Secret** |
| `LETTERMINT_ROUTE_SIGN_IN` | `sign-in` | Slug of the Lettermint route for sign-in emails (the `sign-in` template). Required. The slug is generated from the route's name and can't be changed |
| `LETTERMINT_ROUTE_MAIL` | `bookings` | Slug of the route for every other template. Required |
| `LETTERMINT_API_URL` | `http://localhost:4010/v1/send` | Optional. Sends the requests here instead of to Lettermint, for tests and for the e2e and Maestro runs against a fake Lettermint server. Leave it unset everywhere else |
| `EMAIL_FROM_ADDRESS` | `noreply@fivvi.app` | Must be on a domain verified in Lettermint |
| `EMAIL_FROM_NAME` | `Fivvi` | Display name of the sender |
| `EMAIL_SEND_EXAMPLE_DOMAIN` | `1` | Optional. Outside production, sends `@example.com` mail through Lettermint (here `LETTERMINT_API_URL`) instead of writing it to the log. Only the Maestro run sets it (`scripts/maestro.sh`: its fake Lettermint server holds the sign-in codes). Leave it unset everywhere else; production ignores it |

`createEnvironmentSendEmail()` is the `sendEmail` the server uses (F001): **production** always sends through the provider and never logs an email; **outside production**, mail to an `@example.com` address is written to the server log instead (the whole text, so the sign-in code and link can be read from it), and all other mail goes through the provider (`EMAIL_SEND_EXAMPLE_DOMAIN=1` sends `@example.com` mail through it too). "Production" is the Railway environment named `production` (`RAILWAY_ENVIRONMENT_NAME`). Outside production the provider's variables may be missing while only `@example.com` mail is sent.

The log transport is the one known place where a sign-in link is printed as it is, with the page asked for (`returnTo`, #207) next to the token and code (F001 AC15). That is acceptable because it never runs in production and only for `@example.com` addresses; everywhere else the page asked for is not logged (`packages/auth/README.md`).

- **Local:** put the variables in `packages/email/.env` (git-ignored; every worktree needs its own). The `send:test` script loads it. It needs `LETTERMINT_API_TOKEN`, `LETTERMINT_ROUTE_SIGN_IN` and `LETTERMINT_ROUTE_MAIL` plus the sender (`EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`).
- **Preview and production:** Railway variables on `web`, declared in `.railway/railway.ts` (`preserve()` for the keys, routes and address, so the file holds no value) and listed in [`docs/engineering/ENVIRONMENTS.md §7`](../../docs/engineering/ENVIRONMENTS.md#7-variables). The owner sets the values: the production token only in `production`, a separate token in `development` (every preview copies it). Never commit a token; rotate it in Lettermint if it leaks.
- The sender comes from config, not code, because it changes when the own domain arrives (before M5).

## Scripts

```bash
pnpm email:preview                         # http://localhost:3100, every template × locale
pnpm email:preview --port 3200 --time-zone UTC
pnpm email:send-test --to you@example.com --locale en [--name Anna] [--time-zone Europe/Amsterdam]
```

- **Preview** renders every template in both locales with its `previewProps`, as HTML and as plain text (`/hello/nl-NL`, `/hello/en.txt`). It restarts when a file changes; reload the page. We don't use React Email's `email dev`: it installs `@react-email/ui` and a separate Next.js app with npm at run time, outside our lockfile and pnpm's release-age check.
- **Send test** sends the `hello` template through Lettermint to one address and prints the Lettermint message id. It is the G1 delivery check; it counts against the monthly limit.

## TypeScript 7

Nothing here needs the TypeScript compiler API. React Email 6 (`react-email`: components + `render`) and `use-intl` ship plain JS, and `tsx` (esbuild) runs the scripts, because Node's type stripping doesn't handle JSX. No separate TypeScript 5 package is needed, unlike `packages/contract/tools/typescript-generator`.

## History

Until ADR-028 (November 2026), transactional email went through Brevo (ADR-009), whose click tracking rewrote the sign-in link and whose `List-Unsubscribe` header could block sign-in codes. Its transport, tests, fake e2e server and variables were removed in #403. The findings and the trial are in [`docs/decisions/research/ADR-028-email-providers.md`](../../docs/decisions/research/ADR-028-email-providers.md); the legal side is in [`docs/legal/sub-processors.md`](../../docs/legal/sub-processors.md).

## Tests

```bash
pnpm --filter @fivvi/email test
```

| File | Proves |
|---|---|
| `src/templates/templates.test.ts` | Every template renders in nl-NL and en with no missing keys or placeholders; hello: subject, preview, text and HTML from the catalog, Europe/Amsterdam dates in both locales (summer, winter, around midnight), escaping of user content |
| `src/send.test.ts` | `sendEmail` with the memory transport: locale, idempotency keys, retry decisions, link capture |
| `src/lettermint.test.ts` | The Lettermint request (mocked HTTP client): route per template, sender and recipient format, tag, idempotency key; retry on 5xx, network errors, timeouts and 429 with `Retry-After`; `409` as duplicate; no retry on 401, 403 and 422; no token or recipient in errors |
| `src/retry.test.ts`, `src/config.test.ts` | Backoff maths; config validation without leaking the key |
| `src/lint.test.ts` | The no-hard-coded-text rule is registered here and runs |
