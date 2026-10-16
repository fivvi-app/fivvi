import { describe, expect, it, vi } from 'vitest';
import { register } from './instrumentation';

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
  ])('logs a configuration error for a page views key %s', (_, host, message) => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', KEY);
    vi.stubEnv('POSTHOG_HOST', host);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => register()).not.toThrow();

    expect(log.mock.calls).toEqual([[message]]);
  });

  it.each([
    ['AC5: without a page views key', '', HOST],
    ['with a key and an https POSTHOG_HOST', KEY, HOST],
  ])('logs nothing %s', (_, key, host) => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key);
    vi.stubEnv('POSTHOG_HOST', host);
    const log = vi.spyOn(console, 'error');

    register();

    expect(log).not.toHaveBeenCalled();
  });
});
