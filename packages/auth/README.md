# @fivvi/auth

Sign-in for the web and, later, the native apps (ADR-007, F001): [Better Auth](https://better-auth.com) on our own Postgres tables. **The only code that imports Better Auth** (a Biome rule in `biome.json` enforces it); `apps/web` and `packages/api` use the interface in `src/auth.ts`. Server-side only.

```ts
import { createAuth } from '@fivvi/auth';

const auth = createAuth({ db, secret, baseURL, sendEmail }); // apps/web/server/auth.ts
auth.handler(request); // served under /api/auth/* by apps/web/app/api/auth/[...all]/route.ts
```

## How sign-in works

A person signs in with only their email address. One request creates **one verification** that holds both the link token and the 6-digit code of the one EM-08 email (`packages/email`). Better Auth's own magic-link and email-OTP plugins each send their own email with their own token, so `src/sign-in-plugin.ts` is a small custom plugin instead:

| Endpoint (under `/api/auth`) | Body | Result |
|---|---|---|
| `POST /sign-in/code/request` | `{ email, locale? }` | Always `200 { status: true }`. An existing account gets one EM-08 email in the language of the page that asked (`locale`, else `Accept-Language`, else English). Any other address gets the same answer and no email |
| `POST /sign-in/code/verify` | `{ email, code }` | The right code: `200` and the sign-in session cookie. Anything else: `401 INVALID_OR_EXPIRED_CODE`, never saying which case it was |

- **Hashes only (AC11).** `auth_verifications.value` holds the HMAC-SHA256 of the link token and `code_hash` that of the code, keyed with `BETTER_AUTH_SECRET` (a code has a million values, so an unkeyed hash would fall to brute force). The database never holds a usable token or code.
- **One per address.** `identifier` is `sign-in:<lower-case email>`; a new request deletes the old verification (the old link and code stop working), and using the code consumes the checked row in one atomic delete, so the link is used up with it (AC4).
- **5 wrong codes kill it (AC6).** `auth_verifications.failed_attempts` counts wrong codes in one `UPDATE ... RETURNING`, so parallel guesses are all counted. At 5 the row is deleted, link and code, and even the right code fails; a new request starts a fresh verification. Every failure (wrong, expired, used, replaced, killed, unknown address) is the same `401 INVALID_OR_EXPIRED_CODE`.
- **Expires after 15 minutes.** The link in the email points at the sign-in page's confirm step, `/login/confirm?token=…` (TW-10, built later), never at a Better Auth URL that would consume the token on a scanner's GET.
- **Cookie.** `HttpOnly`, `SameSite=Lax`, `Secure` unless the base URL is plain `http` (local); 30 days, renewed on use.
- No passwords, no sign-up: an address without an account is answered like any other.
- **Rate limits (AC10, `src/rate-limit.ts`).** A request is counted per email address (3 in 15 minutes) and per IP address (20 in an hour), whether or not the address has an account. Over a limit, the answer is the same `200 { status: true }`, no email is sent, nothing is replaced, and one line `Sign-in request rate-limited: address` (or `ip`) is logged, never with the address or the IP address. The counts are in `auth_rate_limits` (Postgres, so a restart or a deploy keeps them), keyed by a keyed hash of the address or IP address, in fixed windows that start at the first request. They run as a Better Auth `before` hook ahead of the endpoint. Better Auth's own limiter (production only, in memory, answers 429) is switched off for that path; it stays on for the code entry (3 tries in 10 seconds per IP address, per instance).
- **Client IP address.** From the `X-Real-IP` header only; IPv6 addresses count per /64 network. Why that header, what a missing one means and how tests set it: `ENVIRONMENTS.md §7`.

Not here yet (spec #128, later tickets): the confirm-link endpoint (#136), the sign-up allowlist, `GET /api/v1/me`, the web pages and product events.

## Tables

`auth_users` (an account), `auth_sessions` (a sign-in session), `auth_identities` and `auth_verifications`, in `packages/database/src/schema/auth.ts`. They have no `organization_id`: an account is global and shared by every workspace of its person. Better Auth's start-up schema check is off (`advanced.database.validateSchema`), because the tables lack columns it writes only for passwords, OAuth and images; the integration tests run against the real migrated tables.

## Configuration

`BETTER_AUTH_SECRET` (at least 32 characters, a secret per environment) and `BETTER_AUTH_URL` (the public address): [`ENVIRONMENTS.md §7`](../../docs/engineering/ENVIRONMENTS.md#7-variables). Emails go through `createEnvironmentSendEmail()` in `packages/email`: to the server log for `@example.com` outside production, otherwise Brevo.

## Tests

The tests drive the HTTP endpoints, not Better Auth's internals: `packages/api/test/sign-in.integration.test.ts` (real Postgres, in-memory email transport; `pnpm --filter @fivvi/api test:integration`). `src/hash.test.ts` covers the hashes.
