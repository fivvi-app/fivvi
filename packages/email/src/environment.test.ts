import { describe, expect, it, vi } from 'vitest';
import { createEnvironmentSendEmail, isProductionEnvironment } from './environment.ts';
import { lettermintApiUrl } from './lettermint.ts';
import type { SentEvent } from './send.ts';
import { signInEmail } from './templates/sign-in.tsx';
import { english } from './test-languages.ts';

const lettermintEnv = {
  LETTERMINT_API_TOKEN: 'lm-test-not-a-real-token',
  LETTERMINT_ROUTE_SIGN_IN: 'sign-in-route',
  LETTERMINT_ROUTE_MAIL: 'mail-route',
  EMAIL_FROM_ADDRESS: 'noreply@fivvi.app',
  EMAIL_FROM_NAME: 'Fivvi',
};
const props = {
  code: '482915',
  url: 'https://fivvi.example.com/login/confirm?token=t',
  expiresInMinutes: 15,
};

function setup(
  env: Record<string, string>,
  onSent?: (event: SentEvent) => void,
  onSentError?: (error: unknown) => void,
) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = (input: string | URL | Request, init: RequestInit = {}) => {
    requests.push({ url: String(input), body: JSON.parse(String(init.body)) });
    return Promise.resolve(
      new Response(JSON.stringify({ message_id: 'msg-1', status: 'pending' }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  const logged: string[] = [];
  const sendEmail = createEnvironmentSendEmail({
    env,
    fetch: fetch as typeof globalThis.fetch,
    log: (line) => logged.push(line),
    onSent,
    ...(onSentError ? { onSentError } : {}),
  });
  const send = (to: string) =>
    sendEmail({
      template: signInEmail,
      props,
      to: { email: to },
      locale: english,
      event: 'sign-in-1',
    });
  return { requests, logged, send };
}

describe('F001 which transport sends an email', () => {
  it.each([
    ['local', {}],
    ['development', { RAILWAY_ENVIRONMENT_NAME: 'development' }],
    ['a preview', { RAILWAY_ENVIRONMENT_NAME: 'pr-130' }],
  ])(
    'AC15: @example.com goes to the log outside production (%s), code and link included, never to Lettermint',
    async (_name, extra) => {
      const { requests, logged, send } = setup({ ...lettermintEnv, ...extra });

      await send('owner@example.com');

      expect(requests).toEqual([]);
      expect(logged).toHaveLength(1);
      expect(logged[0]).toContain('owner@example.com');
      expect(logged[0]).toContain('482915');
      expect(logged[0]).toContain(props.url);
    },
  );

  it('AC15: outside production, other addresses still go to Lettermint', async () => {
    const { requests, logged, send } = setup({
      ...lettermintEnv,
      RAILWAY_ENVIRONMENT_NAME: 'development',
    });

    await send('anna@gym.test');

    expect(logged).toEqual([]);
    expect(requests.map((r) => r.url)).toEqual([lettermintApiUrl]);
  });

  it('AC15: production always sends through Lettermint, @example.com too, and logs nothing', async () => {
    const { requests, logged, send } = setup({
      ...lettermintEnv,
      RAILWAY_ENVIRONMENT_NAME: 'production',
    });
    const consoleOutput = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info')];

    await send('owner@example.com');

    expect(requests).toHaveLength(1);
    expect(logged).toEqual([]);
    for (const spy of consoleOutput) expect(spy).not.toHaveBeenCalled();
  });

  it('F001: EMAIL_SEND_EXAMPLE_DOMAIN=1 sends @example.com mail through Lettermint outside production, never to the log', async () => {
    const { requests, logged, send } = setup({
      ...lettermintEnv,
      LETTERMINT_API_URL: 'http://localhost:4010/v1/send',
      EMAIL_SEND_EXAMPLE_DOMAIN: '1',
    });

    await send('owner@example.com');

    expect(logged).toEqual([]);
    expect(requests.map((r) => r.url)).toEqual(['http://localhost:4010/v1/send']);
  });

  it.each([
    ['unset', {}],
    ['0', { EMAIL_SEND_EXAMPLE_DOMAIN: '0' }],
    ['empty', { EMAIL_SEND_EXAMPLE_DOMAIN: '' }],
    ['true', { EMAIL_SEND_EXAMPLE_DOMAIN: 'true' }],
  ])(
    'F001: EMAIL_SEND_EXAMPLE_DOMAIN %s leaves @example.com mail in the log',
    async (_name, extra) => {
      const { requests, logged, send } = setup({ ...lettermintEnv, ...extra });

      await send('owner@example.com');

      expect(requests).toEqual([]);
      expect(logged).toHaveLength(1);
    },
  );

  it('F001: EMAIL_SEND_EXAMPLE_DOMAIN=1 without Lettermint settings fails when an @example.com email is sent', async () => {
    const { logged, send } = setup({ EMAIL_SEND_EXAMPLE_DOMAIN: '1' });

    await expect(send('owner@example.com')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/LETTERMINT_API_TOKEN/) }),
    });
    expect(logged).toEqual([]);
  });

  it('F001: production is unchanged by EMAIL_SEND_EXAMPLE_DOMAIN: it sends through Lettermint and logs nothing', async () => {
    const { requests, logged, send } = setup({
      ...lettermintEnv,
      RAILWAY_ENVIRONMENT_NAME: 'production',
      EMAIL_SEND_EXAMPLE_DOMAIN: '1',
    });

    await send('owner@example.com');

    expect(requests).toHaveLength(1);
    expect(logged).toEqual([]);
  });

  it('AC15: an @example.com lookalike is not the log: only the exact domain is', async () => {
    const { requests, logged, send } = setup({ ...lettermintEnv });

    await send('anna@example.com.test');
    await send('example.com@gym.test');

    expect(logged).toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it('sends through LETTERMINT_API_URL when it is set, so e2e can use a fake Lettermint server', async () => {
    const { requests, send } = setup({
      ...lettermintEnv,
      LETTERMINT_API_URL: 'http://localhost:4010/v1/send',
    });

    await send('anna@gym.test');

    expect(requests.map((r) => r.url)).toEqual(['http://localhost:4010/v1/send']);
  });

  it('outside production, example.com mail needs no email settings at all', async () => {
    const { logged, send } = setup({});
    await send('owner@example.com');
    expect(logged).toHaveLength(1);
  });

  it('production without Lettermint settings fails at once, never falls back to the log', () => {
    expect(() => setup({ RAILWAY_ENVIRONMENT_NAME: 'production' })).toThrow(/LETTERMINT_API_TOKEN/);
  });

  it('E006 #403: production with a sender and routes but no token fails at once', () => {
    const { LETTERMINT_API_TOKEN: _token, ...withoutToken } = lettermintEnv;
    expect(() => setup({ ...withoutToken, RAILWAY_ENVIRONMENT_NAME: 'production' })).toThrow(
      /^LETTERMINT_API_TOKEN is not set/,
    );
  });

  it("knows production only by Railway's environment name", () => {
    expect(isProductionEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'production' })).toBe(true);
    expect(isProductionEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'pr-1' })).toBe(false);
    expect(isProductionEnvironment({ NODE_ENV: 'production' })).toBe(false);
  });

  it('sends on the sign-in route, with the sign-in template as its tag', async () => {
    const { requests, logged, send } = setup({
      ...lettermintEnv,
      RAILWAY_ENVIRONMENT_NAME: 'production',
    });

    await send('anna@gym.test');

    expect(logged).toEqual([]);
    expect(requests.map((r) => [r.url, r.body.route, r.body.tag])).toEqual([
      [lettermintApiUrl, 'sign-in-route', 'sign-in'],
    ]);
  });

  it('production with a missing route fails at once', () => {
    expect(() =>
      setup({
        ...lettermintEnv,
        LETTERMINT_ROUTE_SIGN_IN: '',
        RAILWAY_ENVIRONMENT_NAME: 'production',
      }),
    ).toThrow(/LETTERMINT_ROUTE_SIGN_IN/);
  });

  it('outside production, a missing route fails when a real address is sent to', async () => {
    const { send } = setup({ LETTERMINT_API_TOKEN: 'lm-test-not-a-real-token' });

    await expect(send('anna@gym.test')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/LETTERMINT_ROUTE_/) }),
    });
  });

  it('F049: reports each accepted send with the catalog ID and language, to the log or the provider', async () => {
    const sent: SentEvent[] = [];
    const { send } = setup({ ...lettermintEnv, RAILWAY_ENVIRONMENT_NAME: 'production' }, (event) =>
      sent.push(event),
    );

    await send('anna@gym.test');

    expect(sent).toEqual([{ emailId: 'EM-08', language: 'en' }]);
  });

  it('F049: a recording that throws is handed to onSentError and does not fail the send', async () => {
    const reported: unknown[] = [];
    const failure = new Error('posthog is down');
    const { send } = setup(
      { ...lettermintEnv, RAILWAY_ENVIRONMENT_NAME: 'production' },
      () => {
        throw failure;
      },
      (error) => reported.push(error),
    );

    await expect(send('anna@gym.test')).resolves.toBeDefined();

    expect(reported).toEqual([failure]);
  });
});
