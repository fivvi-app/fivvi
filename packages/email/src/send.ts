import { setTimeout as sleep } from 'node:timers/promises';
import type { EmailLanguage, Locale } from '@fivvi/i18n';
import { catalogIdOf } from './catalog.ts';
import { emailIdempotencyKey } from './idempotency-key.ts';
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
   * The recipient's communication language, as a resolver of `@fivvi/i18n` returned it
   * (`resolveCommunicationLanguage`, `resolveClientCommunicationLanguage`,
   * `resolveSignInCommunicationLanguage`, `resolveInternalCommunicationLanguage`; ADR-017,
   * ADR-019). A plain `'en'` or `'nl-NL'` does not
   * type-check, so no send picks its language by hand.
   */
  locale: EmailLanguage;
  /** The workspace or user time zone. Default: Europe/Amsterdam. */
  timeZone?: string;
  /**
   * The event that causes this email, as text that names it and no one: the session and its
   * version (`{sessionId}:{version}`), the invitation and its token's hash. The idempotency key is
   * built from the email's catalog ID and this event (F049), so sending the same email for the same
   * event twice reaches the provider with one key and goes out once, while another event has a key
   * of its own. A send that has no natural event (a demo request) makes a fresh one per request.
   */
  event: string;
}

export interface SendEmailResult {
  messageId?: string;
  attempts: number;
}

/** Renders a template in the recipient's locale and sends it, retrying transient failures. */
export type SendEmail = <Props>(options: SendEmailOptions<Props>) => Promise<SendEmailResult>;

/** What a successful send records: the catalog ID and the language, never the recipient. */
export interface SentEvent {
  /** `EM-11`, or the key of an internal email (`demo-request`). */
  emailId: string;
  language: Locale;
}

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
  /**
   * Called once after a send the provider accepted, with the email's catalog ID and language and
   * nothing else about the recipient: the web server records the product event `email_sent` here.
   */
  onSent?: (event: SentEvent) => void;
  /**
   * Called with the error when `onSent` throws. The email is already delivered then, so the send
   * still succeeds; the caller reports the error (the web server hands it to Sentry). Default:
   * the error's name on the server log.
   */
  onSentError?: (error: unknown) => void;
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
    onSent,
    onSentError = (error) =>
      console.error('Email sent hook failed:', error instanceof Error ? error.name : 'unknown'),
  } = options;

  return async ({ template, props, to, locale, timeZone, event }) => {
    const emailId = catalogIdOf(template.id);
    if (!emailId) throw new Error(`Template ${template.id} is not in the email catalog.`);
    const rendered = await renderEmail(template, props, { locale, timeZone });
    const email: OutgoingEmail = {
      from: sender,
      to,
      ...rendered,
      locale,
      template: template.id,
      idempotencyKey: emailIdempotencyKey(emailId, event),
    };

    const result = await deliver(email);
    // After the provider accepted it, and outside the retry loop: a hook that throws must neither
    // make the send be tried again nor fail it, because the email is delivered.
    try {
      onSent?.({ emailId, language: locale });
    } catch (error) {
      onSentError(error);
    }
    return result;
  };

  async function deliver(email: OutgoingEmail): Promise<SendEmailResult> {
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
        onRetry?.({ template: email.template, attempt, delayMs, error });
        await wait(delayMs);
      }
    }
  }
}
