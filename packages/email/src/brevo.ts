import { EmailSendError, type EmailTransport, type OutgoingEmail } from './transport.ts';

export const brevoApiUrl = 'https://api.brevo.com/v3/smtp/email';

export interface BrevoTransportOptions {
  /** From `readEmailConfig().brevoApiKey`. */
  apiKey: string;
  /**
   * The API address. Default: Brevo's (`brevoApiUrl`). e2e tests point it at a fake Brevo server
   * (`BREVO_API_URL`).
   */
  apiUrl?: string;
  /** Injected in tests. Default: the global `fetch`. */
  fetch?: typeof fetch;
  /** Per-attempt timeout. A timed-out attempt is retried with the same idempotency key. */
  timeoutMs?: number;
}

/**
 * Sends through Brevo's transactional email API (ADR-009): `POST /v3/smtp/email`.
 * https://developers.brevo.com/reference/sendtransacemail
 */
export function createBrevoTransport({
  apiKey,
  apiUrl = brevoApiUrl,
  fetch: fetchFn = fetch,
  timeoutMs = 5_000,
}: BrevoTransportOptions): EmailTransport {
  return {
    name: 'brevo',
    async send(email) {
      let response: Response;
      try {
        response = await fetchFn(apiUrl, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify(brevoRequestBody(email)),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
        throw new EmailSendError(`brevo: ${timedOut ? 'request timed out' : 'network error'}`, {
          retryable: true,
          cause,
        });
      }

      const body = await readJson(response);
      if (response.ok) {
        const messageId = typeof body.messageId === 'string' ? body.messageId : undefined;
        return { messageId };
      }

      const code = typeof body.code === 'string' ? body.code : undefined;
      const status = response.status;
      throw new EmailSendError(`brevo: HTTP ${status}${code ? ` ${code}` : ''}`, {
        status,
        code,
        detail: typeof body.message === 'string' ? body.message : undefined,
        retryable: status === 429 || status >= 500,
        retryAfterMs: status === 429 ? retryAfterMs(response.headers) : undefined,
        duplicate: code === 'duplicate_parameter',
      });
    },
  };
}

/** The JSON body Brevo expects. Exported for the tests. */
export function brevoRequestBody(email: OutgoingEmail) {
  return {
    sender: email.from,
    to: [email.to],
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
    tags: [email.template],
    // Brevo processes a key only once within 30 minutes; a retry reuses it.
    headers: { idempotencyKey: email.idempotencyKey },
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Seconds to wait, from `Retry-After` or Brevo's `x-sib-ratelimit-reset`, in ms. */
function retryAfterMs(headers: Headers): number | undefined {
  for (const name of ['retry-after', 'x-sib-ratelimit-reset']) {
    const value = headers.get(name);
    const seconds = value === null || value.trim() === '' ? Number.NaN : Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  }
  return undefined;
}
