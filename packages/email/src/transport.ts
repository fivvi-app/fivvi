import type { Locale } from '@fivvi/i18n';

export interface EmailAddress {
  email: string;
  /** Display name. User content: never translated. */
  name?: string;
}

/** A rendered email, ready for a transport. */
export interface OutgoingEmail {
  from: EmailAddress;
  to: EmailAddress;
  subject: string;
  html: string;
  text: string;
  locale: Locale;
  /** Template id, e.g. `hello`. Sent to the provider as a tag for its logs. */
  template: string;
  /**
   * The same key on every attempt of one send, so the provider can drop a retry of a
   * request it already accepted (a lost response). A UUID.
   */
  idempotencyKey: string;
}

export interface SentEmail {
  /** The provider's id for the message, when it returned one. */
  messageId?: string;
}

/** Hands an email to a provider. One attempt: retrying is `createSendEmail`'s job. */
export interface EmailTransport {
  readonly name: string;
  send(email: OutgoingEmail): Promise<SentEmail>;
}

export interface EmailSendErrorOptions {
  /** Whether trying again can succeed: network errors, timeouts, 429 and 5xx. */
  retryable: boolean;
  /** HTTP status, when the provider answered. */
  status?: number;
  /** The provider's error code, e.g. Brevo's `unauthorized`. */
  code?: string;
  /** The provider's error message. Kept out of `message`, because it may name the recipient. */
  detail?: string;
  /** How long the provider asked us to wait before trying again. */
  retryAfterMs?: number;
  /** The provider already accepted a request with this idempotency key. */
  duplicate?: boolean;
  cause?: unknown;
}

/**
 * A send that failed. `message` holds only the provider, status and error code, never the
 * recipient, the content or the API key, so it is safe to log and to report to Sentry.
 */
export class EmailSendError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  readonly code?: string;
  readonly detail?: string;
  readonly retryAfterMs?: number;
  readonly duplicate: boolean;
  /** Attempts made, set by `createSendEmail` when it gives up. */
  attempts = 1;

  constructor(message: string, options: EmailSendErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'EmailSendError';
    this.retryable = options.retryable;
    this.status = options.status;
    this.code = options.code;
    this.detail = options.detail;
    this.retryAfterMs = options.retryAfterMs;
    this.duplicate = options.duplicate ?? false;
  }
}
