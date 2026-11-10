import { readReportingEnvironment } from '@fivvi/observability';
import { usableClientIp } from './rate-limit.ts';
import type { Clock } from './sign-in-plugin.ts';

// The Turnstile check of the public forms (E013, spec #467): one function that asks Cloudflare
// whether a token is good. It answers `pass`, `fail` or `no_answer`; what a caller does with
// `no_answer` is its own rule (`turnstileAllows`): sign-in fails open, a join request closed.
// The secret key is server-only and, like every token, never logged, reported or put in an error.

/** Cloudflare's documented verification call. */
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** How long Cloudflare gets to answer: then it is "no answer" (AC10). */
export const TURNSTILE_TIMEOUT_MS = 3_000;

/** A Cloudflare that did not answer is reported to Sentry once per this long at most (AC10). */
export const TURNSTILE_NO_ANSWER_REPORT_INTERVAL_MS = 60_000;

/**
 * A token is a few hundred characters (Cloudflare documents 2048 as its maximum): a longer one
 * is not from Cloudflare and is not worth a call.
 */
const MAX_TOKEN_LENGTH = 2_048;

/** Cloudflare's published test secret keys: always pass, always fail. Not secrets. */
export const TURNSTILE_TEST_SECRET_PASS = '1x0000000000000000000000000000000AA';
export const TURNSTILE_TEST_SECRET_FAIL = '2x0000000000000000000000000000000AA';

/** `pass`: a human; `fail`: not; `no_answer`: Cloudflare did not say (timeout, outage, error). */
export type TurnstileResult = 'pass' | 'fail' | 'no_answer';

/** What a caller does with `no_answer`: let the request through (`open`) or refuse it (`closed`). */
export type TurnstileFailureMode = 'open' | 'closed';

/** Whether a caller with this failure mode lets a request with this result through. */
export function turnstileAllows(result: TurnstileResult, mode: TurnstileFailureMode): boolean {
  return result === 'pass' || (result === 'no_answer' && mode === 'open');
}

/**
 * The secret key of this process: `TURNSTILE_SECRET_KEY`. In the `production` environment it is
 * required and never falls back to a test key. Elsewhere (local, tests, previews) a missing key
 * means Cloudflare's always-pass test key, and e2e sets the always-fail one for its one test.
 * Errors never include the key.
 */
export function readTurnstileSecret(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (secret) return secret;
  if (readReportingEnvironment(env) === 'production') {
    throw new Error('TURNSTILE_SECRET_KEY is not set (ENVIRONMENTS.md §7).');
  }
  return TURNSTILE_TEST_SECRET_PASS;
}

export interface TurnstileVerifierOptions {
  /** The secret key (`readTurnstileSecret`). Never logged. */
  secret: string;
  /** Tests pass a fake Cloudflare; defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /**
   * Gets one error per minute at most when Cloudflare did not answer. The error names the kind of
   * failure and nothing else: no token, no secret key, no IP address, nothing of the request.
   */
  reportNoAnswer: (error: Error) => void;
  /** Where "now" comes from, for the once-per-minute report. */
  clock: Clock;
}

export interface TurnstileVerifier {
  /**
   * Asks Cloudflare whether `token` is good, with the client IP address of the request when it has
   * a usable one. A missing, empty or oversized token fails without a call. Never throws.
   */
  verify(token: string | undefined, headers: Headers): Promise<TurnstileResult>;
}

/** Cloudflare error codes that say the call, not the visitor, was wrong: no answer about the token. */
const SERVICE_ERRORS = new Set([
  'internal-error',
  'missing-input-secret',
  'invalid-input-secret',
  'bad-request',
]);

type NoAnswerReason = 'timeout' | 'unreachable' | 'http-error' | 'invalid-answer';

export function createTurnstileVerifier({
  secret,
  fetch = globalThis.fetch,
  reportNoAnswer,
  clock,
}: TurnstileVerifierOptions): TurnstileVerifier {
  let lastReportAt: number | undefined;

  function noAnswer(reason: NoAnswerReason): 'no_answer' {
    const now = clock.now().getTime();
    if (
      lastReportAt === undefined ||
      now - lastReportAt >= TURNSTILE_NO_ANSWER_REPORT_INTERVAL_MS
    ) {
      lastReportAt = now;
      try {
        // A new error with a fixed message, never the one fetch threw: that may quote the request.
        reportNoAnswer(new Error(`Turnstile: Cloudflare gave no answer (${reason}).`));
      } catch {
        // Reporting must never turn into a failed check.
      }
    }
    return 'no_answer';
  }

  return {
    async verify(token, headers) {
      const response = token?.trim();
      if (!response || response.length > MAX_TOKEN_LENGTH) return 'fail';

      const form = new URLSearchParams({ secret, response });
      const ip = usableClientIp(headers);
      if (ip) form.set('remoteip', ip);

      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve('timeout');
        }, TURNSTILE_TIMEOUT_MS);
      });
      try {
        // The race covers a fetch that ignores the abort, and an answer whose body stalls.
        const answer = await Promise.race([
          fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form, signal: controller.signal }),
          timedOut,
        ]);
        if (answer === 'timeout') return noAnswer('timeout');
        if (!answer.ok) return noAnswer('http-error');
        const body: unknown = await Promise.race([answer.json(), timedOut]);
        if (body === 'timeout') return noAnswer('timeout');
        return interpret(body) ?? noAnswer('invalid-answer');
      } catch {
        return noAnswer(controller.signal.aborted ? 'timeout' : 'unreachable');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function interpret(body: unknown): 'pass' | 'fail' | null {
  if (typeof body !== 'object' || body === null) return null;
  const { success } = body as { success?: unknown };
  const codes = (body as { 'error-codes'?: unknown })['error-codes'];
  if (success === true) return 'pass';
  if (success !== false) return null;
  if (Array.isArray(codes) && codes.some((code) => SERVICE_ERRORS.has(String(code)))) return null;
  return 'fail';
}
