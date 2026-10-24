import { describe, expect, it, vi } from 'vitest';
import { brevoApiUrl } from './brevo.ts';
import { readEmailConfig } from './config.ts';
import { createEnvironmentSendEmail, isProductionEnvironment } from './environment.ts';
import { signInEmail } from './templates/sign-in.tsx';

const brevoEnv = {
  BREVO_API_KEY: 'xkeysib-test-not-a-real-key',
  EMAIL_FROM_ADDRESS: 'noreply@fivvi.app',
  EMAIL_FROM_NAME: 'Fivvi',
};
const props = {
  code: '482915',
  url: 'https://fivvi.example.com/login/confirm?token=t',
  expiresInMinutes: 15,
};

function setup(env: Record<string, string>) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = (input: string | URL | Request, init: RequestInit = {}) => {
    requests.push({ url: String(input), body: JSON.parse(String(init.body)) });
    return Promise.resolve(
      new Response(JSON.stringify({ messageId: '<1@brevo>' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  const logged: string[] = [];
  const sendEmail = createEnvironmentSendEmail({
    env,
    fetch: fetch as typeof globalThis.fetch,
    log: (line) => logged.push(line),
  });
  const send = (to: string) =>
    sendEmail({ template: signInEmail, props, to: { email: to }, locale: 'en' });
  return { requests, logged, send };
}

describe('F001 which transport sends an email', () => {
  it.each([
    ['local', {}],
    ['development', { RAILWAY_ENVIRONMENT_NAME: 'development' }],
    ['a preview', { RAILWAY_ENVIRONMENT_NAME: 'pr-130' }],
  ])(
    'AC15: @example.com goes to the log outside production (%s), code and link included, never to Brevo',
    async (_name, extra) => {
      const { requests, logged, send } = setup({ ...brevoEnv, ...extra });

      await send('owner@example.com');

      expect(requests).toEqual([]);
      expect(logged).toHaveLength(1);
      expect(logged[0]).toContain('owner@example.com');
      expect(logged[0]).toContain('482915');
      expect(logged[0]).toContain(props.url);
    },
  );

  it('AC15: outside production, other addresses still go to Brevo', async () => {
    const { requests, logged, send } = setup({
      ...brevoEnv,
      RAILWAY_ENVIRONMENT_NAME: 'development',
    });

    await send('anna@gym.test');

    expect(logged).toEqual([]);
    expect(requests.map((r) => r.url)).toEqual([brevoApiUrl]);
  });

  it('AC15: production always sends through Brevo, @example.com too, and logs nothing', async () => {
    const { requests, logged, send } = setup({
      ...brevoEnv,
      RAILWAY_ENVIRONMENT_NAME: 'production',
    });
    const consoleOutput = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info')];

    await send('owner@example.com');

    expect(requests).toHaveLength(1);
    expect(logged).toEqual([]);
    for (const spy of consoleOutput) expect(spy).not.toHaveBeenCalled();
  });

  it('AC15: an @example.com lookalike is not the log: only the exact domain is', async () => {
    const { requests, logged, send } = setup({ ...brevoEnv });

    await send('anna@example.com.test');
    await send('example.com@gym.test');

    expect(logged).toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it('sends through BREVO_API_URL when it is set, so e2e can use a fake Brevo server', async () => {
    const { requests, send } = setup({
      ...brevoEnv,
      BREVO_API_URL: 'http://localhost:4010/v3/smtp/email',
    });

    await send('anna@gym.test');

    expect(requests.map((r) => r.url)).toEqual(['http://localhost:4010/v3/smtp/email']);
  });

  it('outside production, example.com mail needs no Brevo settings at all', async () => {
    const { logged, send } = setup({});
    await send('owner@example.com');
    expect(logged).toHaveLength(1);
  });

  it('production without Brevo settings fails at once, never falls back to the log', () => {
    expect(() => setup({ RAILWAY_ENVIRONMENT_NAME: 'production' })).toThrow(/BREVO_API_KEY/);
  });

  it("knows production only by Railway's environment name", () => {
    expect(isProductionEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'production' })).toBe(true);
    expect(isProductionEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'pr-1' })).toBe(false);
    expect(isProductionEnvironment({ NODE_ENV: 'production' })).toBe(false);
  });

  it('reads an optional Brevo API address from the environment', () => {
    expect(readEmailConfig(brevoEnv).brevoApiUrl).toBeUndefined();
    expect(
      readEmailConfig({ ...brevoEnv, BREVO_API_URL: ' http://localhost:4010/x ' }).brevoApiUrl,
    ).toBe('http://localhost:4010/x');
    expect(() => readEmailConfig({ ...brevoEnv, BREVO_API_URL: 'nope' })).toThrow(
      'BREVO_API_URL is not a URL.',
    );
  });
});
