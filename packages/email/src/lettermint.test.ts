import { describe, expect, it, vi } from 'vitest';
import {
  createLettermintTransport,
  lettermintApiUrl,
  lettermintRequestBody,
} from './lettermint.ts';
import { createSendEmail, type RetryEvent } from './send.ts';
import { helloEmail } from './templates/hello.tsx';
import { signInEmail } from './templates/sign-in.tsx';
import { EmailSendError } from './transport.ts';

const apiToken = 'lm-test-not-a-real-token';
const routes = { signIn: 'sign-in-route', mail: 'mail-route' };
const sender = { email: 'noreply@fivvi.app', name: 'Fivvi' };
const to = { email: 'anna@example.com', name: 'Anna' };
const key = '6f1c1f3e-5b2a-4c7e-9a51-3c0e2f5d8b10';
const helloProps = { firstName: 'Anna', sentAt: new Date('2026-09-22T16:00:00Z') };
const signInProps = {
  code: '482915',
  url: 'https://fivvi.example.com/login/confirm?token=t',
  expiresInMinutes: 15,
};

type Reply = Response | Error;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const accepted = (messageId = 'msg-1') => json(202, { message_id: messageId, status: 'pending' });

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

/** `sendEmail` over the Lettermint transport, with a fake sleep that records the waits. */
function setup(...replies: Reply[]) {
  const http = mockFetch(...replies);
  const waits: number[] = [];
  const retries: RetryEvent[] = [];
  const sendEmail = createSendEmail({
    transport: createLettermintTransport({ apiToken, routes, fetch: http.fetch }),
    sender,
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    idempotencyKey: () => key,
    onRetry: (event) => retries.push(event),
  });
  const send = () => sendEmail({ template: helloEmail, props: helloProps, to, locale: 'nl-NL' });
  const sendSignIn = () =>
    sendEmail({ template: signInEmail, props: signInProps, to, locale: 'en' });
  return { ...http, waits, retries, send, sendSignIn };
}

async function failure(promise: Promise<unknown>): Promise<EmailSendError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(EmailSendError);
  return error as EmailSendError;
}

describe('E006 Lettermint transport', () => {
  it('posts the rendered email with the route, sender, recipient, tag and idempotency key', async () => {
    const { requests, send } = setup(accepted('msg-abc'));

    const result = await send();

    expect(result).toEqual({ messageId: 'msg-abc', attempts: 1 });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe(lettermintApiUrl);
    expect(lettermintApiUrl).toBe('https://api.lettermint.co/v1/send');
    expect(request?.init.method).toBe('POST');
    expect(request?.init.headers).toMatchObject({
      'x-lettermint-token': apiToken,
      'content-type': 'application/json',
      'idempotency-key': key,
    });
    expect(request?.init.signal).toBeInstanceOf(AbortSignal);
    expect(request?.body).toMatchObject({
      route: 'mail-route',
      from: 'Fivvi <noreply@fivvi.app>',
      to: ['Anna <anna@example.com>'],
      subject: 'Testbericht van Fivvi',
      tag: 'hello',
    });
    expect(request?.body.html).toContain('<html dir="ltr" lang="nl-NL"');
    expect(request?.body.text).toContain('Hoi Anna,');
  });

  it('sends sign-in emails on the sign-in route and every other template on the mail route', async () => {
    const { requests, send, sendSignIn } = setup(accepted(), accepted());

    await sendSignIn();
    await send();

    expect(requests.map((r) => [r.body.tag, r.body.route])).toEqual([
      ['sign-in', 'sign-in-route'],
      ['hello', 'mail-route'],
    ]);
  });

  it('posts to the configured API address', async () => {
    const http = mockFetch(accepted());
    const transport = createLettermintTransport({
      apiToken,
      routes,
      apiUrl: 'http://localhost:4010/v1/send',
      fetch: http.fetch,
    });

    await transport.send({
      from: sender,
      to,
      subject: 'Hoi',
      html: '<p>Hoi</p>',
      text: 'Hoi Anna',
      locale: 'nl-NL',
      template: 'hello',
      idempotencyKey: key,
    });

    expect(http.requests.map((r) => r.url)).toEqual(['http://localhost:4010/v1/send']);
  });

  it('writes an address without a name bare, and quotes a name that needs it', () => {
    const base = {
      from: { email: 'noreply@fivvi.app' },
      subject: 's',
      html: 'h',
      text: 'text',
      locale: 'en',
      template: 'hello',
      idempotencyKey: key,
    } as const;

    expect(
      lettermintRequestBody({ ...base, to: { email: 'a@gym.test' } }, { signIn: 's', mail: 'm' }),
    ).toMatchObject({ from: 'noreply@fivvi.app', to: ['a@gym.test'] });
    expect(
      lettermintRequestBody(
        { ...base, to: { email: 'a@gym.test', name: 'Doe, "Jo" <x@y.test>\r\nBcc: z' } },
        { signIn: 's', mail: 'm' },
      ).to,
    ).toEqual(['"Doe, \\"Jo\\" <x@y.test> Bcc: z" <a@gym.test>']);
  });

  it('sends a non-ASCII display name as plain text, never MIME-encoded', () => {
    const base = {
      from: { email: 'noreply@fivvi.app', name: 'Zoë Ünal' },
      to: { email: 'a@gym.test', name: 'Zoë Ünal' },
      subject: 's',
      html: 'h',
      text: 'text',
      locale: 'en',
      template: 'hello',
      idempotencyKey: key,
    } as const;

    expect(lettermintRequestBody(base, { signIn: 's', mail: 'm' })).toMatchObject({
      from: 'Zoë Ünal <noreply@fivvi.app>',
      to: ['Zoë Ünal <a@gym.test>'],
    });
  });

  it('retries a 5xx with backoff and the same idempotency key', async () => {
    const { requests, waits, retries, send } = setup(
      json(500, { error: { code: 'INTERNAL_ERROR', message: 'Oops' } }),
      json(503, {}),
      accepted(),
    );

    const result = await send();

    expect(result.attempts).toBe(3);
    expect(waits).toEqual([125, 250]);
    expect(retries.map((r) => [r.attempt, r.error.status])).toEqual([
      [1, 500],
      [2, 503],
    ]);
    const keys = requests.map((r) => (r.init.headers as Record<string, string>)['idempotency-key']);
    expect(keys).toEqual([key, key, key]);
  });

  it('retries network errors and timeouts', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const { retries, send } = setup(new TypeError('fetch failed'), timeout, accepted());

    expect((await send()).attempts).toBe(3);
    expect(retries.map((r) => r.error.message)).toEqual([
      'lettermint: network error',
      'lettermint: request timed out',
    ]);
  });

  it('waits as long as a 429 asks through Retry-After, when that fits the retry budget', async () => {
    const { waits, send } = setup(
      json(429, { error: { code: 'RATE_LIMITED', message: 'Slow down' } }, { 'retry-after': '1' }),
      json(429, {}, { 'retry-after': '2' }),
      accepted(),
    );

    expect((await send()).attempts).toBe(3);
    expect(waits).toEqual([1_000, 2_000]);
  });

  it('reads Retry-After given as an HTTP date', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
      const { send } = setup(
        json(429, {}, { 'retry-after': new Date('2030-01-01T00:01:00Z').toUTCString() }),
      );

      const error = await failure(send());
      expect(error.retryAfterMs).toBe(60_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up at once when a 429 asks to wait longer than the budget', async () => {
    const { requests, send } = setup(json(429, {}, { 'retry-after': '60' }));

    const error = await failure(send());
    expect(error).toMatchObject({ status: 429, retryable: true, attempts: 1 });
    expect(error.retryAfterMs).toBe(60_000);
    expect(requests).toHaveLength(1);
  });

  it.each([
    [401, { message: 'Invalid token' }, 'lettermint: HTTP 401'],
    [
      403,
      { error: { code: 'FEATURE_NOT_AVAILABLE', message: 'Upgrade' } },
      'lettermint: HTTP 403 FEATURE_NOT_AVAILABLE',
    ],
    [
      422,
      { message: 'The text field must be at least 3 characters.', errors: { text: ['too short'] } },
      'lettermint: HTTP 422',
    ],
  ])('does not retry a %i', async (status, body, message) => {
    const { requests, waits, send } = setup(json(status, body));

    const error = await failure(send());

    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
    expect(error).toMatchObject({ retryable: false, status, duplicate: false, attempts: 1 });
    expect(error.message).toBe(message);
  });

  it('keeps the provider message out of the error message but in the detail', async () => {
    const { send } = setup(json(422, { message: `bad ${to.email}` }));

    const error = await failure(send());
    expect(error.detail).toBe(`bad ${to.email}`);
    expect(error.message).not.toContain(to.email);
    expect(error.message).not.toContain('Anna');
  });

  it('never leaks the token', async () => {
    const { send } = setup(json(401, { message: 'Invalid token' }));

    const error = await failure(send());
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain(apiToken);
  });

  it('reports a 409 as a duplicate and does not retry it', async () => {
    const { requests, send } = setup(
      json(409, {
        message: 'This idempotency key has already been used on a request with a different payload',
      }),
    );

    const error = await failure(send());
    expect(error).toMatchObject({ duplicate: true, retryable: false, status: 409, attempts: 1 });
    expect(error.message).toBe('lettermint: HTTP 409');
    expect(requests).toHaveLength(1);
  });

  it('treats a 409 on a retry as maybe sent: the failed first attempt may have got through', async () => {
    const { requests, send } = setup(new TypeError('fetch failed'), json(409, { message: 'used' }));

    expect(await send()).toEqual({ attempts: 2 });
    expect(requests).toHaveLength(2);
  });

  it('throws after the last attempt when every attempt fails', async () => {
    const { requests, send } = setup(json(500, {}), json(500, {}), json(500, {}));

    const error = await failure(send());
    expect(requests).toHaveLength(3);
    expect(error).toMatchObject({ status: 500, retryable: true, attempts: 3 });
  });

  it('handles a non-JSON error body', async () => {
    const { send } = setup(new Response('<html>Bad gateway</html>', { status: 422 }));

    const error = await failure(send());
    expect(error.message).toBe('lettermint: HTTP 422');
    expect(error.code).toBeUndefined();
  });
});
