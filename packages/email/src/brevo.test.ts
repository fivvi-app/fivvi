import { describe, expect, it } from 'vitest';
import { brevoApiUrl, createBrevoTransport } from './brevo.ts';
import { createSendEmail, type RetryEvent } from './send.ts';
import { helloEmail } from './templates/hello.tsx';
import { EmailSendError } from './transport.ts';

const apiKey = 'xkeysib-test-not-a-real-key';
const sender = { email: 'noreply@fivvi.app', name: 'Fivvi' };
const to = { email: 'anna@example.com', name: 'Anna' };
const props = { firstName: 'Anna', sentAt: new Date('2026-09-22T16:00:00Z') };

type Reply = Response | Error;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const accepted = (messageId = '<202609221600.1@smtp-relay.mailin.fr>') => json(201, { messageId });

/** A mocked HTTP client: answers with `replies` in order and records every request. */
function mockFetch(...replies: Reply[]) {
  const requests: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const fetch = (input: string | URL | Request, init: RequestInit = {}) => {
    requests.push({ url: String(input), init, body: JSON.parse(String(init.body)) });
    const reply = replies.shift();
    if (!reply) throw new Error('No more mocked replies');
    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

/** `sendEmail` over the Brevo transport, with a fake sleep that records the waits. */
function setup(...replies: Reply[]) {
  const http = mockFetch(...replies);
  const waits: number[] = [];
  const retries: RetryEvent[] = [];
  const sendEmail = createSendEmail({
    transport: createBrevoTransport({ apiKey, fetch: http.fetch }),
    sender,
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    idempotencyKey: () => '6f1c1f3e-5b2a-4c7e-9a51-3c0e2f5d8b10',
    onRetry: (event) => retries.push(event),
  });
  const send = () => sendEmail({ template: helloEmail, props, to, locale: 'nl-NL' });
  return { ...http, waits, retries, send };
}

async function failure(promise: Promise<unknown>): Promise<EmailSendError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(EmailSendError);
  return error as EmailSendError;
}

describe('E006 Brevo transport', () => {
  it('posts the rendered email to the transactional API', async () => {
    const { requests, send } = setup(accepted('<id-1@smtp-relay.mailin.fr>'));

    const result = await send();

    expect(result).toEqual({ messageId: '<id-1@smtp-relay.mailin.fr>', attempts: 1 });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe(brevoApiUrl);
    expect(request?.init.method).toBe('POST');
    expect(request?.init.headers).toMatchObject({
      'api-key': apiKey,
      'content-type': 'application/json',
    });
    expect(request?.init.signal).toBeInstanceOf(AbortSignal);
    expect(request?.body).toMatchObject({
      sender,
      to: [to],
      subject: 'Testbericht van Fivvi',
      tags: ['hello'],
      headers: { idempotencyKey: '6f1c1f3e-5b2a-4c7e-9a51-3c0e2f5d8b10' },
    });
    expect(request?.body.htmlContent).toContain('<html dir="ltr" lang="nl-NL"');
    expect(request?.body.textContent).toContain('Hoi Anna,');
  });

  it('retries a 5xx with backoff and the same idempotency key', async () => {
    const { requests, waits, retries, send } = setup(
      json(502, { code: 'bad_gateway' }),
      json(503, {}),
      accepted(),
    );

    const result = await send();

    expect(result.attempts).toBe(3);
    // Full jitter with random() = 0.5: half of 250 ms, then half of 500 ms.
    expect(waits).toEqual([125, 250]);
    expect(retries.map((r) => [r.attempt, r.error.status])).toEqual([
      [1, 502],
      [2, 503],
    ]);
    const keys = requests.map((r) => (r.body.headers as { idempotencyKey: string }).idempotencyKey);
    expect(new Set(keys).size).toBe(1);
  });

  it('retries network errors and timeouts', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const { retries, send } = setup(new TypeError('fetch failed'), timeout, accepted());

    expect((await send()).attempts).toBe(3);
    expect(retries.map((r) => r.error.message)).toEqual([
      'brevo: network error',
      'brevo: request timed out',
    ]);
  });

  it('waits as long as a 429 asks, when that fits the retry budget', async () => {
    const { waits, send } = setup(
      json(429, { code: 'too_many_requests' }, { 'retry-after': '1' }),
      json(429, {}, { 'x-sib-ratelimit-reset': '2' }),
      accepted(),
    );

    expect((await send()).attempts).toBe(3);
    expect(waits).toEqual([1_000, 2_000]);
  });

  it('gives up at once when a 429 asks to wait longer than the budget', async () => {
    const { requests, send } = setup(json(429, {}, { 'retry-after': '60' }));

    const error = await failure(send());
    expect(error.status).toBe(429);
    expect(error.attempts).toBe(1);
    expect(requests).toHaveLength(1);
  });

  it('does not retry a 400 and reports the Brevo error code', async () => {
    const { requests, waits, send } = setup(
      json(400, { code: 'invalid_parameter', message: 'email is not valid in to' }),
    );

    const error = await failure(send());

    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
    expect(error).toMatchObject({
      retryable: false,
      status: 400,
      code: 'invalid_parameter',
      detail: 'email is not valid in to',
      attempts: 1,
    });
    expect(error.message).toBe('brevo: HTTP 400 invalid_parameter');
  });

  it('does not retry a 401 (wrong key or unauthorized IP), and never leaks the key', async () => {
    const { requests, send } = setup(json(401, { code: 'unauthorized', message: 'Key not found' }));

    const error = await failure(send());

    expect(requests).toHaveLength(1);
    expect(error.message).toBe('brevo: HTTP 401 unauthorized');
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain(apiKey);
  });

  it('keeps the recipient and the content out of the error message', async () => {
    const { send } = setup(json(400, { code: 'invalid_parameter', message: `bad ${to.email}` }));

    const error = await failure(send());
    expect(error.message).not.toContain(to.email);
    expect(error.message).not.toContain('Anna');
  });

  it('throws after the last attempt when every attempt fails', async () => {
    const { requests, send } = setup(json(500, {}), json(500, {}), json(500, {}));

    const error = await failure(send());
    expect(requests).toHaveLength(3);
    expect(error).toMatchObject({ status: 500, retryable: true, attempts: 3 });
  });

  it('treats a duplicate on a retry as sent: the lost first attempt got through', async () => {
    const { requests, send } = setup(
      new TypeError('fetch failed'),
      json(400, { code: 'duplicate_parameter', message: 'Idempotency key already used' }),
    );

    expect(await send()).toEqual({ attempts: 2 });
    expect(requests).toHaveLength(2);
  });

  it('fails on a duplicate at the first attempt: the key was reused by mistake', async () => {
    const { send } = setup(json(400, { code: 'duplicate_parameter' }));

    const error = await failure(send());
    expect(error.duplicate).toBe(true);
    expect(error.attempts).toBe(1);
  });

  it('handles a non-JSON error body', async () => {
    const { send } = setup(new Response('<html>Bad gateway</html>', { status: 400 }));

    const error = await failure(send());
    expect(error.message).toBe('brevo: HTTP 400');
    expect(error.code).toBeUndefined();
  });
});
