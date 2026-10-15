import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Locale } from '@trainer-hub/i18n';
import { type EmailTemplate, renderEmail } from './render.tsx';
import { defaultRetryPolicy, nextDelay, type RetryPolicy } from './retry.ts';
import {
  type EmailAddress,
  EmailSendError,
  type EmailTransport,
  type OutgoingEmail,
} from './transport.ts';

export interface SendEmailOptions<Props> {
  template: EmailTemplate<Props>;
  props: Props;
  to: EmailAddress;
  /**
   * The recipient's communication language, resolved with `resolveCommunicationLanguage`
   * from `@trainer-hub/i18n` (ADR-017).
   */
  locale: Locale;
  /** The workspace or user time zone. Default: Europe/Amsterdam. */
  timeZone?: string;
}

export interface SendEmailResult {
  messageId?: string;
  attempts: number;
}

/** Renders a template in the recipient's locale and sends it, retrying transient failures. */
export type SendEmail = <Props>(options: SendEmailOptions<Props>) => Promise<SendEmailResult>;

export interface RetryEvent {
  template: string;
  attempt: number;
  delayMs: number;
  error: EmailSendError;
}

export interface CreateSendEmailOptions {
  transport: EmailTransport;
  /** From `readEmailConfig().sender`. */
  sender: EmailAddress;
  retry?: RetryPolicy;
  /** Called before each retry, e.g. to log it. The event holds no recipient data. */
  onRetry?: (event: RetryEvent) => void;
  // Injected in tests, so they never wait or depend on chance.
  sleep?: (ms: number) => Promise<unknown>;
  random?: () => number;
  idempotencyKey?: () => string;
}

/**
 * Creates the `sendEmail` function the API uses. Sends are inline with a short retry
 * (ADR-010): network errors, timeouts, 429 and 5xx are retried; other failures throw at once.
 * It throws an `EmailSendError` after the last attempt; the caller reports it (Sentry, E009).
 */
export function createSendEmail(options: CreateSendEmailOptions): SendEmail {
  const {
    transport,
    sender,
    retry = defaultRetryPolicy,
    onRetry,
    sleep: wait = sleep,
    random = Math.random,
    idempotencyKey = randomUUID,
  } = options;

  return async ({ template, props, to, locale, timeZone }) => {
    const rendered = await renderEmail(template, props, { locale, timeZone });
    const email: OutgoingEmail = {
      from: sender,
      to,
      ...rendered,
      locale,
      template: template.id,
      idempotencyKey: idempotencyKey(),
    };

    for (let attempt = 1; ; attempt++) {
      try {
        const sent = await transport.send(email);
        return { messageId: sent.messageId, attempts: attempt };
      } catch (cause) {
        const error =
          cause instanceof EmailSendError
            ? cause
            : new EmailSendError(`${transport.name}: send failed`, { retryable: false, cause });
        // A retry that the provider recognises as a repeat: an earlier attempt got through
        // and only its response was lost.
        if (error.duplicate && attempt > 1) return { attempts: attempt };
        const delayMs = error.retryable
          ? nextDelay(attempt, retry, random, error.retryAfterMs)
          : undefined;
        if (delayMs === undefined) {
          error.attempts = attempt;
          throw error;
        }
        onRetry?.({ template: template.id, attempt, delayMs, error });
        await wait(delayMs);
      }
    }
  };
}
