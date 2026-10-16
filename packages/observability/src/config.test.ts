import http from 'node:http';
import https from 'node:https';
import { describe, expect, it, vi } from 'vitest';
import { initBrowserErrorReporting } from './browser.ts';
import { createCaptureTransport } from './capture.ts';
import {
  readBrowserErrorReportingConfig,
  readErrorReportingConfig,
  readPageViewsConfig,
} from './config.ts';
import { createErrorReporter } from './reporter.ts';

const DSN = 'https://public@o0.ingest.de.sentry.io/1';
const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('E009 error reporting config', () => {
  it('AC5: no DSN or key means disabled and no network', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const request = vi.spyOn(http, 'request');
    const secureRequest = vi.spyOn(https, 'request');
    const transport = createCaptureTransport();

    for (const env of [{}, { SENTRY_DSN: '  ', RAILWAY_ENVIRONMENT_NAME: 'production' }]) {
      const reporter = createErrorReporter({ env, transport });
      expect(() => reporter.captureError(new Error('Boom'))).not.toThrow();
      expect(reporter.enabled).toBe(false);
      expect(await reporter.flush()).toBe(true);
    }

    expect(transport.events).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(secureRequest).not.toHaveBeenCalled();
    expect(readErrorReportingConfig({})).toEqual({ dsn: undefined, environment: 'development' });
  });

  it('AC5: without NEXT_PUBLIC_SENTRY_DSN the browser installs nothing and sends nothing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const transport = createCaptureTransport();
    const browser = globalThis as { onerror?: unknown; onunhandledrejection?: unknown };

    // The server's DSN is not the browser's: only NEXT_PUBLIC_SENTRY_DSN turns the browser on.
    for (const env of [{}, { NEXT_PUBLIC_SENTRY_DSN: ' ', SENTRY_DSN: DSN }]) {
      const reporter = initBrowserErrorReporting({ env, transport });
      expect(() => reporter.captureError(new Error('Boom'))).not.toThrow();
      expect(reporter.enabled).toBe(false);
      expect(await reporter.flush()).toBe(true);
    }

    expect(browser.onerror).toBeUndefined();
    expect(browser.onunhandledrejection).toBeUndefined();
    expect(transport.itemTypes).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads the browser DSN, environment and release as inlined at build time', () => {
    expect(
      readBrowserErrorReportingConfig({
        NEXT_PUBLIC_SENTRY_DSN: ` ${DSN} `,
        RAILWAY_ENVIRONMENT_NAME: 'pr-44',
        RAILWAY_GIT_COMMIT_SHA: SHA,
      }),
    ).toEqual({ dsn: DSN, environment: 'preview', release: SHA });
  });

  it('reads the DSN and tags the release with the commit SHA from Railway', () => {
    expect(
      readErrorReportingConfig({
        SENTRY_DSN: ` ${DSN} `,
        RAILWAY_ENVIRONMENT_NAME: 'production',
        RAILWAY_GIT_COMMIT_SHA: SHA,
      }),
    ).toEqual({ dsn: DSN, environment: 'production', release: SHA });
  });

  it.each([
    ['production', 'production'],
    ['development', 'development'],
    ['pr-43', 'preview'],
    ['trainer-hub-pr-43', 'preview'],
    [undefined, 'development'],
  ])('maps Railway environment %s to %s', (railway, environment) => {
    expect(
      readErrorReportingConfig({ SENTRY_DSN: DSN, RAILWAY_ENVIRONMENT_NAME: railway }).environment,
    ).toBe(environment);
  });
});

describe('E009 page views config', () => {
  it('AC5: no key means page views are off', () => {
    // The server's product events key is not the browser's: only NEXT_PUBLIC_POSTHOG_KEY counts.
    for (const env of [{}, { NEXT_PUBLIC_POSTHOG_KEY: '  ' }, { POSTHOG_KEY: 'phc_server' }]) {
      expect(readPageViewsConfig(env)).toEqual({ key: undefined });
    }
  });

  it('reads the PostHog project key', () => {
    expect(readPageViewsConfig({ NEXT_PUBLIC_POSTHOG_KEY: ' phc_example ' })).toEqual({
      key: 'phc_example',
    });
  });
});
