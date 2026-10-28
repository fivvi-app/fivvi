import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from './instrumentation';
import { verifyApiStartup } from './server/startup';

// The database role check is proven in packages/api/test/startup.integration.test.ts; here it is
// only wired in.
vi.mock('./server/startup', () => ({ verifyApiStartup: vi.fn(() => Promise.resolve()) }));

afterEach(() => {
  vi.mocked(verifyApiStartup).mockClear();
});

// The start-up check may only use the light allowlist entry, not `@fivvi/auth` (#200; packages/auth/README.md).
vi.mock('@fivvi/auth', () => {
  throw new Error('the start-up check must not load the sign-in code (#200)');
});

const KEY = 'phc_example_project_key';
const HOST = 'https://posthog.example.test';
const FIX = 'Set POSTHOG_HOST to the PostHog host (ENVIRONMENTS.md §7).';

describe('E009 page views config at server start', () => {
  it.each([
    [
      'without POSTHOG_HOST',
      '',
      `NEXT_PUBLIC_POSTHOG_KEY is set, but POSTHOG_HOST is not: page views are off. ${FIX}`,
    ],
    [
      'with a non-https POSTHOG_HOST',
      'http://posthog.example.test',
      `POSTHOG_HOST is not an https:// URL: page views are off. ${FIX}`,
    ],
  ])('logs a configuration error for a page views key %s', async (_, host, message) => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', KEY);
    vi.stubEnv('POSTHOG_HOST', host);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(register()).resolves.toBeUndefined();

    expect(log.mock.calls).toEqual([[message]]);
  });

  it.each([
    ['AC5: without a page views key', '', HOST],
    ['with a key and an https POSTHOG_HOST', KEY, HOST],
  ])('logs nothing %s', async (_, key, host) => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key);
    vi.stubEnv('POSTHOG_HOST', host);
    const log = vi.spyOn(console, 'error');

    await register();

    expect(log).not.toHaveBeenCalled();
  });
});

describe('F001 sign-up allowlist at server start (AC9)', () => {
  it('stops the server on a malformed SIGN_UP_ALLOWED_EMAILS, naming the position and not the entry', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('SIGN_UP_ALLOWED_EMAILS', 'pilot@example.com,example-bad');

    const failure = await register().catch((error: Error) => error);

    expect(failure).toBeInstanceOf(Error);
    const { message } = failure as Error;
    expect(message).toMatch(/SIGN_UP_ALLOWED_EMAILS entry 2/);
    expect(message).not.toContain('example-bad');
  });

  it.each([
    ['not set', undefined],
    ['empty', ''],
    ['valid', 'pilot@example.com, @example.org'],
  ])('starts when it is %s', async (_, value) => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('SIGN_UP_ALLOWED_EMAILS', value);

    await expect(register()).resolves.toBeUndefined();
  });
});

describe('E011 database role at server start (AC4)', () => {
  it('checks the API database role when the Node.js server starts', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    await register();

    expect(verifyApiStartup).toHaveBeenCalledOnce();
  });

  it('stops the server when the check refuses the role', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.mocked(verifyApiStartup).mockRejectedValueOnce(new Error('Refusing to start: a reason'));

    await expect(register()).rejects.toThrow('Refusing to start: a reason');
  });

  it.each([
    ['the edge runtime', { NEXT_RUNTIME: 'edge' }],
    ['next build', { NEXT_RUNTIME: 'nodejs', NEXT_PHASE: 'phase-production-build' }],
  ])('does not check it in %s, which has no database', async (_, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);

    await register();

    expect(verifyApiStartup).not.toHaveBeenCalled();
  });
});
