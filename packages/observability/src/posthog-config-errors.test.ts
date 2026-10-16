import { describe, expect, it, vi } from 'vitest';
import { createCaptureTransport } from './capture.ts';
import { checkPageViewsConfig } from './posthog-config-errors.ts';
import { createErrorReporter } from './reporter.ts';

const WITH_DSN = {
  RAILWAY_ENVIRONMENT_NAME: 'production',
  SENTRY_DSN: 'https://public@o0.ingest.de.sentry.io/1',
};
const KEY = 'phc_example_project_key';
const HOST = 'https://posthog.example.test';

function setup() {
  const sentry = createCaptureTransport();
  const errorReporter = createErrorReporter({ env: WITH_DSN, transport: sentry });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  return { sentry, errorReporter, log };
}

describe('E009 page views config check', () => {
  it.each([
    ['without POSTHOG_HOST', undefined, 'POSTHOG_HOST is not'],
    ['with a non-https POSTHOG_HOST', 'http://posthog.example.test', 'not an https:// URL'],
  ])('logs a page views key %s and reports it to Sentry', async (_, host, problem) => {
    const { sentry, errorReporter, log } = setup();

    checkPageViewsConfig(errorReporter, { NEXT_PUBLIC_POSTHOG_KEY: KEY, POSTHOG_HOST: host });
    await errorReporter.flush();

    expect(log).toHaveBeenCalledOnce();
    const [message] = log.mock.calls[0] ?? [];
    expect(message).toContain(problem);
    expect(message).toContain('page views are off');
    expect(
      sentry.events.map((event) => [
        event.level,
        event.exception?.values?.[0]?.type,
        event.exception?.values?.[0]?.value,
      ]),
    ).toEqual([['error', 'PostHogConfigError', message]]);
  });

  it.each([
    ['AC5: without a page views key', { POSTHOG_HOST: HOST }],
    ['with a key and an https POSTHOG_HOST', { NEXT_PUBLIC_POSTHOG_KEY: KEY, POSTHOG_HOST: HOST }],
  ])('reports nothing %s', async (_, env) => {
    const { sentry, errorReporter, log } = setup();

    checkPageViewsConfig(errorReporter, env);
    await errorReporter.flush();

    expect(log).not.toHaveBeenCalled();
    expect(sentry.events).toEqual([]);
  });
});
