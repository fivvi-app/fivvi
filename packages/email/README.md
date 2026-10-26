# @fivvi/email

Transactional email (ADR-009): React Email templates, localized from `packages/i18n`, sent through Brevo behind a small `sendEmail` interface. Server-side only.

```ts
import { createBrevoTransport, createSendEmail, helloEmail, readEmailConfig } from '@fivvi/email';

const config = readEmailConfig(); // BREVO_API_KEY, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME
const sendEmail = createSendEmail({
  transport: createBrevoTransport({ apiKey: config.brevoApiKey }),
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
| `src/brevo.ts` | Brevo transport (`POST /v3/smtp/email`) |
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
| HTTP 429 | Yes, after `Retry-After` / `x-sib-ratelimit-reset`; gives up at once if that is more than 2 s |
| HTTP 5xx | Yes |
| Other 4xx (invalid address, 401 wrong key or unauthorized IP, out of credits, …) | No |

- At most **3 attempts**, full-jitter exponential backoff (≤ 250 ms, then ≤ 500 ms), so the waits add at most 0.75 s. The worst case, three timeouts, holds the request for about 16 s; Brevo normally answers well within a second.
- Every send gets a UUID **idempotency key**, reused on each retry. Brevo processes a key once within 30 minutes, so a retry after a lost response doesn't send twice. A `duplicate_parameter` answer on a retry counts as sent. Checked against the live API on 3 October 2026: a second request with the same key gets HTTP 400 `duplicate_parameter` ("Email for the idempotency key has already been processed") and no second email.
- After the last attempt it throws `EmailSendError`. Its `message` holds only the provider, status and error code (never the recipient, content or API key), so it is safe to log and to report to Sentry (E009). The provider's own message is in `detail`.
- `onRetry` is called before each retry, for logging.

Transports implement `EmailTransport` (`send(email) → { messageId }`, one attempt). Swapping Brevo for another provider means writing one transport; templates and callers don't change.

**Tests** use `createMemoryTransport()`: it records every email (to, locale, template, subject, HTML, text and the `links` in it) and can fail the next sends with `failNext(error)`. Never call Brevo from a test.

## Configuration

| Variable | Example | Notes |
|---|---|---|
| `BREVO_API_KEY` | `xkeysib-…` | Brevo → Settings → SMTP & API → API keys. **Secret.** |
| `EMAIL_FROM_ADDRESS` | `noreply@fivvi.app` | Must be a verified sender in Brevo (Settings → Senders, domains & dedicated IPs) |
| `EMAIL_FROM_NAME` | `Fivvi` | Display name of the sender |
| `BREVO_API_URL` | `http://localhost:4010/v3/smtp/email` | Optional. Sends the requests here instead of to Brevo, for e2e runs against a fake Brevo server. Leave it unset everywhere else |
| `EMAIL_SEND_EXAMPLE_DOMAIN` | `1` | Optional. Outside production, sends `@example.com` mail through Brevo (here `BREVO_API_URL`) instead of writing it to the log. Only the Maestro run sets it (`scripts/maestro.sh`: its fake Brevo server holds the sign-in codes). Leave it unset everywhere else; production ignores it |

`createEnvironmentSendEmail()` is the `sendEmail` the server uses (F001): **production** always sends through Brevo and never logs an email; **outside production**, mail to an `@example.com` address is written to the server log instead (the whole text, so the sign-in code and link can be read from it), and all other mail goes through Brevo (`EMAIL_SEND_EXAMPLE_DOMAIN=1` sends `@example.com` mail through Brevo too). "Production" is the Railway environment named `production` (`RAILWAY_ENVIRONMENT_NAME`). Outside production the Brevo variables may be missing while only `@example.com` mail is sent.

- **Local:** put the three variables in `packages/email/.env` (git-ignored; every worktree needs its own). The `send:test` script loads it.
- **Preview and production:** Railway variables on `web`, declared in `.railway/railway.ts` (`preserve()` for the key and address, so the file holds no value) and listed in [`docs/engineering/ENVIRONMENTS.md §7`](../../docs/engineering/ENVIRONMENTS.md#7-variables). The owner sets the values: the real key only in `production`, a separate test key in `development` (every preview copies it). Never commit a key; rotate it in Brevo if it leaks.
- The sender comes from config, not code, because it changes when the own domain arrives (before M5).

## Scripts

```bash
pnpm email:preview                         # http://localhost:3100, every template × locale
pnpm email:preview --port 3200 --time-zone UTC
pnpm email:send-test --to you@example.com --locale en [--name Anna] [--time-zone Europe/Amsterdam]
```

- **Preview** renders every template in both locales with its `previewProps`, as HTML and as plain text (`/hello/nl-NL`, `/hello/en.txt`). It restarts when a file changes; reload the page. We don't use React Email's `email dev`: it installs `@react-email/ui` and a separate Next.js app with npm at run time, outside our lockfile and pnpm's release-age check.
- **Send test** sends the `hello` template through Brevo to one address and prints the Brevo message id. It is the G1 delivery check; it counts against the daily limit.

## TypeScript 7

Nothing here needs the TypeScript compiler API. React Email 6 (`react-email`: components + `render`) and `use-intl` ship plain JS, and `tsx` (esbuild) runs the scripts, because Node's type stripping doesn't handle JSX. No separate TypeScript 5 package is needed, unlike `packages/contract/tools/typescript-generator`.

## Brevo

Checked on 29 September 2026. Terms change often; re-check before G2 and G4. The legal side is in [`docs/legal/sub-processors.md`](../../docs/legal/sub-processors.md).

| Topic | Finding | Action |
|---|---|---|
| Free plan | **300 emails per day**, shared by transactional and marketing email; transactional API, SMTP and webhooks included; no expiry. API rate limit 1,000 requests/s (not a concern) | Stay on Free until G4. The daily cap would block sign-in and booking emails (R14): add a usage alert, and have a paid plan ready before G4 |
| Sender | Verified sender on a free mailbox domain, so Brevo rewrites the From address to `@brevosend.com` | Own domain with SPF, DKIM and DMARC before M5 (ADR-009), then change `EMAIL_FROM_ADDRESS` |
| Authorized IPs | Brevo blocks API calls from unknown IPs after its 30-day learning phase. Railway has no fixed egress IPs | **Done (3 October 2026):** IP blocking is deactivated for API keys (Settings → Security → Authorized IPs → "Deactivate for API keys"), so calls from any IP work. A leaked key therefore works from anywhere: keep it in `.env` and Railway variables only, use separate dev and production keys, and rotate on any leak. Revisit at G4 if the paid Railway plan has fixed outbound IPs. A block would show up as HTTP 401 `unauthorized` (not retried) |
| Open and click tracking | Brevo adds an open pixel and rewrites links through its own redirect domain on transactional emails. Free and Starter plans can't switch it off in the UI; you can anonymise it, or ask support to disable it for the account | We don't need tracking. **Done (3 October 2026):** anonymous tracking on. Before real emails (G2): ask Brevo support to disable transactional open and click tracking, so sign-in and confirmation links aren't rewritten |
| Logs and email previews | Kept **indefinitely** by default, including the full content. Configurable from 1 month to 5 years | **Done (3 October 2026):** "Never store previews" (no email content kept), and logs deleted after **1 month**, the minimum (retention policy R18). Setting: Transactional → Email retention rules |
| G1 delivery check (3 October 2026) | NL and EN test emails to Gmail: all delivered, none in spam. From shown as an address on `brevosend.com`. No Brevo logo or footer. Gmail hid "images": the only image is Brevo's open-tracking pixel. Gmail showed "Unsubscribe" next to the sender on two of the three, so Brevo apparently adds an unsubscribe header | Second mailbox (Outlook or a Dutch ISP) later; full deliverability tests in M5. Ask Brevo support about the unsubscribe header together with the tracking request |
| DPA | Annex 2 of the Brevo terms, part of the agreement you accept with the terms; no separate signature. Lists the sub-processors; SCCs for transfers | Keep a PDF of the version in force when real data starts (G2) |
| Data location | Stored in the EU: OVH in France and Germany, Google Cloud in Belgium (backups) | — |
| Access from outside the EU | Group companies in the US and India have support and operations access; some optional features use US sub-processors | Recorded in the sub-processor list. Don't enable Brevo's AI features |

Sources: [Brevo pricing](https://www.brevo.com/pricing/), [send transactional email API](https://developers.brevo.com/reference/sendtransacemail), [rate limits](https://developers.brevo.com/docs/api-limits), [rate-limit headers](https://developers.brevo.com/docs/limit-headers), [idempotency](https://developers.brevo.com/docs/heterogenous-versions-batch-emails), [data storage location](https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location), [log retention](https://help.brevo.com/hc/en-us/articles/4415743225746-Manage-the-retention-period-of-transactional-logs-and-email-previews), [anonymous tracking](https://help.brevo.com/hc/en-us/articles/11643306229906-Can-I-anonymize-the-tracking-of-opens-and-clicks-for-my-emails), [tracking thread](https://community.brevo.com/t/no-way-to-disable-by-option-tracking-in-transactional-e-mail/201), [DPA (Annex 2)](https://corp-backend.brevo.com/wp-content/uploads/2024/08/BREVO-Annex-2-DPA-150524.pdf), [EU storage vs access](https://www.hejlsvigconsulting.com/articles/brevo/).

## Tests

```bash
pnpm --filter @fivvi/email test
```

| File | Proves |
|---|---|
| `src/templates/templates.test.ts` | Every template renders in nl-NL and en with no missing keys or placeholders; hello: subject, preview, text and HTML from the catalog, Europe/Amsterdam dates in both locales (summer, winter, around midnight), escaping of user content |
| `src/brevo.test.ts` | The Brevo request (mocked HTTP client), retry with backoff on 5xx, network errors, timeouts and 429, no retry on 400/401, same idempotency key per retry, no secrets or recipient in errors |
| `src/send.test.ts` | `sendEmail` with the memory transport: locale, idempotency keys, retry decisions, link capture |
| `src/retry.test.ts`, `src/config.test.ts` | Backoff maths; config validation without leaking the key |
| `src/lint.test.ts` | The no-hard-coded-text rule is registered here and runs |
