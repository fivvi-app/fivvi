import { createCaptureTransport, createErrorReporter } from '@fivvi/observability';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTurnstileVerifier,
  readTurnstileSecret,
  TURNSTILE_NO_ANSWER_REPORT_INTERVAL_MS,
  TURNSTILE_TEST_SECRET_FAIL,
  TURNSTILE_TEST_SECRET_PASS,
  TURNSTILE_TIMEOUT_MS,
  TURNSTILE_VERIFY_URL,
  turnstileAllows,
} from './turnstile.ts';

// E013 (spec #467, ticket #711), AC10 and AC11: the Turnstile check, against a fake Cloudflare.
// The tokens and secret keys here are obviously fake.

const FAKE_TOKEN = 'fake-turnstile-token-0001';
const FAKE_SECRET = 'fake-turnstile-secret-0001';
const headers = new Headers({ 'x-real-ip': '192.0.2.10' });

/** A fake Cloudflare: answers like the documented siteverify, as the secret key says. */
function fakeCloudflare() {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    calls.push({ url: String(input), body: new URLSearchParams(String(init?.body)) });
    const secret = calls.at(-1)?.body.get('secret');
    const success = secret === TURNSTILE_TEST_SECRET_PASS;
    return Promise.resolve(
      Response.json({ success, 'error-codes': success ? [] : ['invalid-input-response'] }),
    );
  };
  return { calls, fetch };
}

/** A Cloudflare that never answers, but gives up when the caller aborts (as fetch does). */
const silentCloudflare: typeof globalThis.fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError')),
    );
  });

describe('E013 the Turnstile check', () => {
  const reported: unknown[] = [];
  const reportNoAnswer = (error: unknown) => reported.push(error);

  beforeEach(() => {
    reported.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const verifier = (options: Partial<Parameters<typeof createTurnstileVerifier>[0]> = {}) =>
    createTurnstileVerifier({
      secret: TURNSTILE_TEST_SECRET_PASS,
      fetch: fakeCloudflare().fetch,
      reportNoAnswer,
      clock: { now: () => new Date() },
      ...options,
    });

  it('AC1: passes with the always-pass test key and fails with the always-fail test key', async () => {
    const cloudflare = fakeCloudflare();

    expect(
      await verifier({ secret: TURNSTILE_TEST_SECRET_PASS, fetch: cloudflare.fetch }).verify(
        FAKE_TOKEN,
        headers,
      ),
    ).toBe('pass');
    expect(
      await verifier({ secret: TURNSTILE_TEST_SECRET_FAIL, fetch: cloudflare.fetch }).verify(
        FAKE_TOKEN,
        headers,
      ),
    ).toBe('fail');
  });

  it('asks the documented siteverify endpoint with the secret, the token and the client IP', async () => {
    const cloudflare = fakeCloudflare();

    await verifier({ fetch: cloudflare.fetch }).verify(FAKE_TOKEN, headers);

    expect(cloudflare.calls).toHaveLength(1);
    expect(cloudflare.calls[0]?.url).toBe(TURNSTILE_VERIFY_URL);
    expect(TURNSTILE_VERIFY_URL).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(Object.fromEntries(cloudflare.calls[0]?.body ?? [])).toEqual({
      secret: TURNSTILE_TEST_SECRET_PASS,
      response: FAKE_TOKEN,
      remoteip: '192.0.2.10',
    });
  });

  it('sends an IPv6 client address as it came, not as the /64 network address sign-in counts it under', async () => {
    const cloudflare = fakeCloudflare();

    await verifier({ fetch: cloudflare.fetch }).verify(
      FAKE_TOKEN,
      new Headers({ 'x-real-ip': '2001:db8:1:2:3:4:5:6' }),
    );

    expect(cloudflare.calls[0]?.body.get('remoteip')).toBe('2001:db8:1:2:3:4:5:6');
  });

  it('leaves the IP out when the request has no usable one', async () => {
    const cloudflare = fakeCloudflare();

    await verifier({ fetch: cloudflare.fetch }).verify(FAKE_TOKEN, new Headers());

    expect(cloudflare.calls[0]?.body.has('remoteip')).toBe(false);
  });

  it('fails a missing or empty token without asking Cloudflare', async () => {
    const cloudflare = fakeCloudflare();
    const turnstile = verifier({ fetch: cloudflare.fetch });

    expect(await turnstile.verify(undefined, headers)).toBe('fail');
    expect(await turnstile.verify('   ', headers)).toBe('fail');
    expect(await turnstile.verify('x'.repeat(2049), headers)).toBe('fail');
    expect(cloudflare.calls).toHaveLength(0);
  });

  it('AC10: answers "no answer" when Cloudflare takes longer than 3 seconds', async () => {
    expect(TURNSTILE_TIMEOUT_MS).toBe(3000);
    const result = verifier({ fetch: silentCloudflare }).verify(FAKE_TOKEN, headers);

    await vi.advanceTimersByTimeAsync(TURNSTILE_TIMEOUT_MS - 1);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await result).toBe('no_answer');
  });

  it('answers "no answer" when Cloudflare is unreachable, answers an error or something else', async () => {
    const answers: (typeof globalThis.fetch)[] = [
      () => Promise.reject(new TypeError('fetch failed')),
      () => Promise.resolve(new Response('Bad gateway', { status: 502 })),
      () => Promise.resolve(new Response('<html>', { status: 200 })),
      () => Promise.resolve(Response.json({ success: false, 'error-codes': ['internal-error'] })),
      () =>
        Promise.resolve(Response.json({ success: false, 'error-codes': ['invalid-input-secret'] })),
      () => Promise.resolve(Response.json({ nothing: 'useful' })),
    ];
    for (const fetch of answers) {
      expect(await verifier({ fetch }).verify(FAKE_TOKEN, headers)).toBe('no_answer');
    }
  });

  it('fails a token Cloudflare calls a bad request: the visitor sent it, so it is not "no answer"', async () => {
    const turnstile = verifier({
      fetch: () =>
        Promise.resolve(Response.json({ success: false, 'error-codes': ['bad-request'] })),
    });

    expect(await turnstile.verify(FAKE_TOKEN, headers)).toBe('fail');
    expect(reported).toHaveLength(0);
  });

  it('names the service error code in the report, so a wrong secret key is not hidden', async () => {
    const turnstile = verifier({
      fetch: () =>
        Promise.resolve(Response.json({ success: false, 'error-codes': ['invalid-input-secret'] })),
    });

    expect(await turnstile.verify(FAKE_TOKEN, headers)).toBe('no_answer');
    expect(String((reported[0] as Error).message)).toContain('invalid-input-secret');
    expect(String((reported[0] as Error).message)).not.toContain(FAKE_TOKEN);
  });

  it('AC10: a caller can let "no answer" through (sign-in) or refuse it (join request)', () => {
    expect(turnstileAllows('pass', 'open')).toBe(true);
    expect(turnstileAllows('pass', 'closed')).toBe(true);
    expect(turnstileAllows('fail', 'open')).toBe(false);
    expect(turnstileAllows('fail', 'closed')).toBe(false);
    expect(turnstileAllows('no_answer', 'open')).toBe(true);
    expect(turnstileAllows('no_answer', 'closed')).toBe(false);
  });

  it('AC10: reports a Cloudflare that did not answer once per minute at most', async () => {
    const turnstile = verifier({ fetch: () => Promise.reject(new TypeError('fetch failed')) });

    await turnstile.verify(FAKE_TOKEN, headers);
    await turnstile.verify(FAKE_TOKEN, headers);
    vi.setSystemTime(Date.now() + TURNSTILE_NO_ANSWER_REPORT_INTERVAL_MS - 1);
    await turnstile.verify(FAKE_TOKEN, headers);
    expect(reported).toHaveLength(1);

    vi.setSystemTime(Date.now() + 1);
    await turnstile.verify(FAKE_TOKEN, headers);
    expect(reported).toHaveLength(2);
    expect(TURNSTILE_NO_ANSWER_REPORT_INTERVAL_MS).toBe(60_000);
  });

  it('does not report a pass or a fail', async () => {
    await verifier({ secret: TURNSTILE_TEST_SECRET_FAIL }).verify(FAKE_TOKEN, headers);
    await verifier().verify(FAKE_TOKEN, headers);

    expect(reported).toHaveLength(0);
  });

  it('AC11: neither the token nor the secret key is in a log line, an error or the Sentry event', async () => {
    vi.useRealTimers();
    const logged: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => {
        logged.push(args.map(String).join(' '));
      });
    }
    const transport = createCaptureTransport();
    const errorReporter = createErrorReporter({
      env: { SENTRY_DSN: 'https://public@sentry.example.test/1' },
      transport,
    });
    // A failing fetch whose error holds both values, as a careless client library might.
    const leaky: typeof globalThis.fetch = () =>
      Promise.reject(new TypeError(`fetch failed: ${FAKE_SECRET} ${FAKE_TOKEN}`));
    const turnstile = createTurnstileVerifier({
      secret: FAKE_SECRET,
      fetch: leaky,
      reportNoAnswer: (error) => errorReporter.captureError(error, { level: 'warning' }),
      clock: { now: () => new Date() },
    });

    expect(await turnstile.verify(FAKE_TOKEN, headers)).toBe('no_answer');
    await errorReporter.flush();

    const sent = JSON.stringify(transport.events);
    expect(sent).not.toContain(FAKE_TOKEN);
    expect(sent).not.toContain(FAKE_SECRET);
    expect(logged.join('\n')).not.toContain(FAKE_TOKEN);
    expect(logged.join('\n')).not.toContain(FAKE_SECRET);
    expect(transport.events.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});

describe('E013 which secret key the check uses', () => {
  it('uses the always-pass test key outside production when none is set', () => {
    expect(readTurnstileSecret({})).toBe(TURNSTILE_TEST_SECRET_PASS);
    expect(readTurnstileSecret({ RAILWAY_ENVIRONMENT_NAME: 'pr-12' })).toBe(
      TURNSTILE_TEST_SECRET_PASS,
    );
    expect(readTurnstileSecret({ RAILWAY_ENVIRONMENT_NAME: 'development' })).toBe(
      TURNSTILE_TEST_SECRET_PASS,
    );
  });

  it('uses TURNSTILE_SECRET_KEY outside production when it is set (e2e sets the always-fail key)', () => {
    expect(readTurnstileSecret({ TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET_FAIL })).toBe(
      TURNSTILE_TEST_SECRET_FAIL,
    );
  });

  it('needs TURNSTILE_SECRET_KEY in production and never falls back to a test key', () => {
    expect(
      readTurnstileSecret({
        RAILWAY_ENVIRONMENT_NAME: 'production',
        TURNSTILE_SECRET_KEY: FAKE_SECRET,
      }),
    ).toBe(FAKE_SECRET);
    expect(() => readTurnstileSecret({ RAILWAY_ENVIRONMENT_NAME: 'production' })).toThrow(
      'TURNSTILE_SECRET_KEY is not set',
    );
    expect(() =>
      readTurnstileSecret({ RAILWAY_ENVIRONMENT_NAME: 'production', TURNSTILE_SECRET_KEY: '  ' }),
    ).toThrow();
  });

  it('is the test keys Cloudflare publishes', () => {
    expect(TURNSTILE_TEST_SECRET_PASS).toBe('1x0000000000000000000000000000000AA');
    expect(TURNSTILE_TEST_SECRET_FAIL).toBe('2x0000000000000000000000000000000AA');
  });
});
