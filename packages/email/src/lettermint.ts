import type { LettermintRoutes } from './config.ts';
import {
  type EmailAddress,
  EmailSendError,
  type EmailTransport,
  type OutgoingEmail,
} from './transport.ts';

export const lettermintApiUrl = 'https://api.lettermint.co/v1/send';

/** The template id of the sign-in email (`templates/sign-in.tsx`): the one on its own route. */
const signInTemplate = 'sign-in';

export interface LettermintTransportOptions {
  /** From `readEmailConfig().lettermint.apiToken`. */
  apiToken: string;
  /** From `readEmailConfig().lettermint.routes`. */
  routes: LettermintRoutes;
  /** The API address. Default: Lettermint's (`lettermintApiUrl`); tests point it elsewhere. */
  apiUrl?: string;
  /** Injected in tests. Default: the global `fetch`. */
  fetch?: typeof fetch;
  /** Per-attempt timeout. A timed-out attempt is retried with the same idempotency key. */
  timeoutMs?: number;
}

/**
 * Sends through Lettermint's send API (ADR-028): `POST /v1/send`.
 * https://lettermint.co/docs/api-reference/sending/0.0.1/lettermint-sending-openapi.json
 */
export function createLettermintTransport({
  apiToken,
  routes,
  apiUrl = lettermintApiUrl,
  fetch: fetchFn = fetch,
  timeoutMs = 5_000,
}: LettermintTransportOptions): EmailTransport {
  return {
    name: 'lettermint',
    async send(email) {
      let response: Response;
      try {
        response = await fetchFn(apiUrl, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-lettermint-token': apiToken,
            // Lettermint keeps a key for 24 hours: the same key and body return the same
            // message id, so a retry after a lost response doesn't send twice.
            'idempotency-key': email.idempotencyKey,
          },
          body: JSON.stringify(lettermintRequestBody(email, routes)),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
        throw new EmailSendError(
          `lettermint: ${timedOut ? 'request timed out' : 'network error'}`,
          {
            retryable: true,
            cause,
          },
        );
      }

      const body = await readJson(response);
      if (response.ok) {
        const messageId = typeof body.message_id === 'string' ? body.message_id : undefined;
        return { messageId };
      }

      // Errors come as `{ error: { code, message } }` or, for 401, 409 and 422, `{ message }`.
      const error = typeof body.error === 'object' && body.error !== null ? body.error : body;
      const { code, message } = error as { code?: unknown; message?: unknown };
      const status = response.status;
      const codeText = typeof code === 'string' ? code : undefined;
      throw new EmailSendError(`lettermint: HTTP ${status}${codeText ? ` ${codeText}` : ''}`, {
        status,
        code: codeText,
        detail: typeof message === 'string' ? message : undefined,
        retryable: status === 429 || status >= 500,
        retryAfterMs: status === 429 ? retryAfterMs(response.headers) : undefined,
        // The key was used before. The same key with the same body answers 202 again, so a 409
        // on a retry (after a 5xx or timeout of unknown outcome) means "maybe sent" (ADR-028);
        // on the first attempt it is our own mistake. `createSendEmail` tells them apart by the attempt.
        duplicate: status === 409,
      });
    },
  };
}

/** The JSON body Lettermint expects. Exported for the tests. */
export function lettermintRequestBody(email: OutgoingEmail, routes: LettermintRoutes) {
  return {
    route: email.template === signInTemplate ? routes.signIn : routes.mail,
    from: formatAddress(email.from),
    to: [formatAddress(email.to)],
    subject: email.subject,
    html: email.html,
    text: email.text,
    tag: email.template,
  };
}

/** `Name <address>`, or the bare address. A name with special characters is quoted. */
function formatAddress({ email, name }: EmailAddress): string {
  const displayName = name?.replace(/[\r\n]+/g, ' ').trim();
  if (!displayName) return email;
  const plain = /^[\p{L}\p{N} .'_-]+$/u.test(displayName);
  return `${plain ? displayName : `"${displayName.replace(/["\\]/g, '\\$&')}"`} <${email}>`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** `Retry-After` (seconds, or an HTTP date) in ms. */
function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get('retry-after')?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
