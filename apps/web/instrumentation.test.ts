import { describe, expect, it, vi } from 'vitest';
import { register } from './instrumentation';

// The sign-in code (Better Auth, the database, the email templates) takes seconds to load on a
// busy runner (#200). Make loading it slower than the test timeout: the start-up check must not
// wait for it, so it may only use the light allowlist entry.
vi.mock('@fivvi/auth', async () => {
  await new Promise((resolve) => setTimeout(resolve, 60_000));
  return {};
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
