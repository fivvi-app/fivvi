# @fivvi/email

Transactional email (ADR-009): React Email templates, localized from `packages/i18n`, sent through Lettermint (ADR-028) behind a small `sendEmail` interface. Server-side only.

```ts
import { createConfiguredTransport, createSendEmail, helloEmail, readEmailConfig } from '@fivvi/email';
import { resolveClientCommunicationLanguage } from '@fivvi/i18n';

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
  // Only an EmailLanguage from a resolver of @fivvi/i18n type-checks; a plain 'nl-NL' does not (F049).
  locale: resolveClientCommunicationLanguage({ workspaceDefault: 'nl-NL' }),
  timeZone: 'Europe/Amsterdam', // the workspace time zone
});
```

| Path | What |
|---|---|
| `src/catalog.ts` | The email catalog (F049): every email by ID (EM-01 … EM-23, EM-34), with audience, owner features, subject keys, status and template; `templates` is derived from it |
| `src/templates/` | One template per email type, registered in the catalog |
| `src/trainer-invitation-sender.ts` | `createTrainerInvitationSender()`: EM-09 (F011) in the language it is given, linking to `/invitations/{token}`; `apps/web` wires it into the API, which cannot import `.tsx` templates itself. `sendEmail` takes an optional `idempotencyKey` per send |
| `src/private-session-sender.ts` | `createPrivateSessionSender()`: EM-11 (F020), the client's confirmation of a private session, or EM-04, the notice that it moved (a mail with `previous`), in the language it is given and the workspace's time zone, with the address written the Dutch way; `apps/web` wires it into the API, which sends it after the session is committed |
| `src/demo-request-sender.ts` | `createDemoRequestSender()`: the website's demo request (F064) as one email to the address it is given (the support address; `apps/web` picks it, `server/demo-request-recipient.ts`), always in Dutch, listing the visitor's answers and the language of the page they used; nothing goes to the visitor; `apps/web` wires it into the API, which cannot import `.tsx` templates itself |
| `src/components/layout.tsx` | The plain shell of an email without a workspace (sign-in, trainer invitation): `<html lang>`, `<title>`, preview line, footer |
| `src/components/frames.tsx` | `EmailFrameLayout` and its named forms `ClientEmailLayout` and `TeamEmailLayout` (F049): the workspace's name at the top, the content, one button to `https://fivvi.app/home`, the footer |
| `src/render.tsx` | `renderEmail()` and the per-locale context (`t`, `formatDateTime`) |
| `src/send.ts` | `createSendEmail()`: render, send, inline retry |
| `src/lettermint.ts` | Lettermint transport (`POST /v1/send`), the route per template |
| `src/provider.ts` | `createConfiguredTransport()`: the Lettermint transport for the config `readEmailConfig` read |
| `src/log.ts`, `src/environment.ts` | Log transport and the per-environment choice of transport (`createEnvironmentSendEmail`) |
| `src/memory.ts` | In-memory capture transport for tests and local development |
| `src/sending-domain.ts`, `src/sending-domain-cli.ts` | The sending-domain check (F049, AC8): `checkSendingDomain()` reads SPF, DKIM and DMARC through an injected DNS resolver; `runSendingDomainCheck()` is the command behind `check:domain` |
| `scripts/` | Preview server, the test-send CLI and the sending-domain check |

## Templates

- **One template per email type, never one per language.** Every string comes from the catalogs through `ctx.t('email.…')`; the Biome `no-hard-coded-jsx-text` rule is registered in `biome.json` and fails on literal text in JSX.
- Copy lives under the `email` namespace in `packages/i18n/{nl-NL,en}.json`, follows `packages/i18n/GLOSSARY.md` (greeting *Hoi {firstName},* / *Hi {firstName},*, key fact first) and passes the normal parity and ICU checks. The native exporters skip `email.*`, because the apps never show it.
- `ctx.t` **throws** on a missing key, a missing placeholder value or broken ICU, so a broken email fails the send and the tests instead of reaching an inbox.
- Dates and times: `ctx.formatDateTime(instant, 'dateWithYear' | 'date' | 'time')`, in the time zone passed to `sendEmail` (default Europe/Amsterdam) and the locale's formatting locale (`en` → `en-GB`). Pass the result into a `{date}` / `{time}` placeholder.
- User content (names, class names) is passed as a placeholder value and rendered as text; React escapes it.
- A template has `subject`, `preview` (the inbox preview line: put the key fact in it), `render` (the content inside the layout) and `previewProps` (obviously fake data for the preview).
- Plain styles for now; E007 brings the design tokens.
- **Frames** (F049): an email about a workspace sets `frame: { kind: 'client' | 'team', workspaceName: (props) => props.workspaceName }` on its template. `renderEmail` then wraps the content in the client frame (workspace's name on top, one primary button to the signed-in home (`https://fivvi.app/home`), the footer "Je krijgt deze e-mail omdat je klant bent bij {workspace}.", "Vragen? Neem contact op met {workspace}.", then "Verstuurd via Fivvi") or the team frame (the same, with "… omdat je in het team van {workspace} zit."). Don't put your own footer or workspace header in the content. The button label defaults to `email.frame.button`; `buttonLabel` and `buttonPath: (props) => 'bookings'` (relative to `https://fivvi.app/`; a path to another host throws) change them. Leave `frame` out for the sign-in email (ADR-019) and the trainer invitation (its recipient is not on the team yet): they keep the plain layout. The workspace's name is user content and is shown as typed.

## The email catalog

`src/catalog.ts` lists every transactional email by ID (F049, spec #476; the IDs and subjects are the spec's M5 table). It is the single list the docs, the checks and the preview read, and the only way to a template: `templates` (the preview, the render tests) is derived from it.

| Status | Meaning |
|---|---|
| `active` | The template exists and is sent. The entry points at it (`template`) and names the subject keys that exist in both catalogs |
| `reserved` | The ID is taken for an email whose owner feature has not built its template yet. It has the audience, the owner features and the planned subject keys, no template |
| `retired` | No longer sent (EM-01, ADR-026). The ID stays taken |

Internal emails (the demo request to Fivvi's own inbox, the developer sample) are in `internalCatalog` with a `key` and no EM ID. Entries without a client, trainer or owner as recipient go there, never into `catalog`.

`catalog.test.ts` fails when a template file under `src/templates/` is not in the catalog, when an `active` entry has no template, when a `reserved` or `retired` entry has one, when two entries share an ID and when one template is registered twice.

**Adding the email of a feature** (the feature that owns a `reserved` ID builds it):

1. Write `src/templates/<type>.tsx` (see Templates) and its render test; add the keys to `nl-NL.json`, `en.json` and `comments.json`, worded as in `packages/i18n/GLOSSARY.md`.
2. Export it from `src/templates/index.ts`.
3. In `catalog.ts`, import it and change the entry of its ID: `status: 'active'`, `template: register(yourEmail)`, and `subjectKeys` set to the keys that now exist (they must exist in both languages).
4. A new email that has no reserved ID takes the number after the highest allocated anywhere (EM-35 today), not just in `catalog.ts`: the prototype's `docs/design/prototype-v2/more-email.js` already allocates EM-24 to EM-34 for the M6, M9 and M11 emails (for example EM-28 in #481), most of them not yet in the catalog. Use another number only when the feature's spec already allocated one. Add it to `catalog` as `active` in the same change.
5. Run `pnpm --filter @fivvi/email test`: the catalog test, the generic render test for both languages and the preview pick it up without another list.

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

## Sending-domain check

```bash
pnpm --filter @fivvi/email check:domain                      # fivvi.app
pnpm --filter @fivvi/email check:domain --domain example.org # another domain
```

Reads the **public DNS** of the sending domain (no token, no secret, nothing sent) and reports whether Lettermint can send as it (ADR-028, F049 AC8). It prints one `PASS` or `FAIL` line per record, names what is missing or wrong, and exits 0 only when all three pass, 1 when one fails and 2 on bad arguments. A DNS lookup that fails for another reason than "no record" (a timeout, SERVFAIL) counts as a failing record and prints the DNS error code. The output holds Lettermint's host names and the DMARC policy only, never the report addresses of a DMARC record.

| Check | Passes when |
|---|---|
| SPF | `lm-bounces.<domain>` is a CNAME to a `lmta.net` host (Lettermint's Return-Path, which carries Lettermint's SPF record) and exactly one `v=spf1` record resolves there. Receivers check SPF on that Return-Path host, never on the root, so an SPF record at the root of `<domain>` does not count |
| DKIM | `lm1._domainkey.<domain>` and `lm2._domainkey.<domain>` are both CNAMEs to a `lmta.net` host (Lettermint rotates the keys every six months behind them) |
| DMARC | `_dmarc.<domain>` has exactly one `v=DMARC1` record with `p=quarantine` or `p=reject` |

**The records are the owner's** (`ROADMAP.md §4.5`; the DNS provider is Cloudflare, set to *DNS only*). Lettermint shows the exact target of each CNAME for the domain in its dashboard (*Domains*); this is the set to expect for `fivvi.app`:

| Type | Name | Value |
|---|---|---|
| CNAME | `lm-bounces.fivvi.app` | `bounces.lmta.net` |
| CNAME | `lm1._domainkey.fivvi.app` | `lm1.<domain id>.dkim.lmta.net` |
| CNAME | `lm2._domainkey.fivvi.app` | `lm2.<domain id>.dkim.lmta.net` |
| TXT | `_dmarc.fivvi.app` | `v=DMARC1; p=quarantine; rua=<the address already in the record>` (keep the `rua` and any other tag; change only `p=none` to `p=quarantine`) |

Do not set `aspf=s`: Lettermint refuses to verify a domain with strict SPF alignment.

The tests (`src/sending-domain.test.ts`) answer from a fake resolver and never touch the network.

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
| `src/catalog.test.ts` | The catalog: every template file is in it, every `active` entry has a template, unique IDs, EM-01 … EM-23 and EM-34 present, subject keys exist in both languages |
| `src/templates/templates.test.ts` | Every template renders in nl-NL and en with no missing keys or placeholders; hello: subject, preview, text and HTML from the catalog, Europe/Amsterdam dates in both locales (summer, winter, around midnight), escaping of user content |
| `src/send.test.ts` | `sendEmail` with the memory transport: locale, idempotency keys, retry decisions, link capture |
| `src/lettermint.test.ts` | The Lettermint request (mocked HTTP client): route per template, sender and recipient format, tag, idempotency key; retry on 5xx, network errors, timeouts and 429 with `Retry-After`; `409` as duplicate; no retry on 401, 403 and 422; no token or recipient in errors |
| `src/retry.test.ts`, `src/config.test.ts` | Backoff maths; config validation without leaking the key |
| `src/sending-domain.test.ts` | The sending-domain check against fake DNS answers: SPF (Return-Path CNAME or root `include:`), both DKIM CNAMEs, DMARC `p=quarantine`/`reject`; each failure named; exit codes; no report address printed |
| `src/lint.test.ts` | The no-hard-coded-text rule is registered here and runs |
