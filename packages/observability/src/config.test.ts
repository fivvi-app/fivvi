import http from 'node:http';
import https from 'node:https';
import { describe, expect, it, vi } from 'vitest';
import { createCaptureTransport } from './capture.ts';
import { readErrorReportingConfig } from './config.ts';
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
