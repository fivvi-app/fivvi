import { execFile } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { initBrowserErrorReporting } from './browser.ts';
import { createCaptureTransport } from './capture.ts';
import {
  readBrowserErrorReportingConfig,
  readErrorReportingConfig,
  readPageViewsConfig,
  readProductEventsConfig,
} from './config.ts';
import { createErrorReporter } from './reporter.ts';

const DSN = 'https://public@o0.ingest.de.sentry.io/1';
const SHA = '0123456789abcdef0123456789abcdef01234567';
// A synthetic host: whatever POSTHOG_HOST says is used, not a built-in address.
const HOST = 'https://posthog.example.test';

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

describe('E009 PostHog config', () => {
  const readers = [
    ['page views', 'NEXT_PUBLIC_POSTHOG_KEY', 'POSTHOG_KEY', readPageViewsConfig],
    ['product events', 'POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_KEY', readProductEventsConfig],
  ] as const;

  it.each(readers)(
    'AC5: no key means %s are off, without a configuration error',
    (_, keyName, otherKeyName, read) => {
      // The server's product events key is not the browser's page views key, and the other way round.
      for (const env of [
        {},
        { [keyName]: '  ' },
        { [otherKeyName]: 'phc_other', POSTHOG_HOST: HOST },
        { POSTHOG_HOST: HOST },
        { POSTHOG_HOST: 'http://posthog.example.test' },
      ]) {
        expect(read(env)).toStrictEqual({});
      }
    },
  );

  it.each(readers)(
    'reads the %s key and the host from POSTHOG_HOST',
    (_, keyName, _otherKeyName, read) => {
      expect(read({ [keyName]: ' phc_example ', POSTHOG_HOST: ` ${HOST} ` })).toStrictEqual({
        key: 'phc_example',
        host: HOST,
      });
      // A trailing slash is dropped, so the SDKs build their endpoints on the host itself.
      expect(read({ [keyName]: 'phc_example', POSTHOG_HOST: `${HOST}/` }).host).toBe(HOST);
    },
  );

  it.each(readers)(
    'a %s key without POSTHOG_HOST is a configuration error',
    (what, keyName, _otherKeyName, read) => {
      for (const host of [undefined, '', '  ']) {
        expect(read({ [keyName]: 'phc_example', POSTHOG_HOST: host })).toStrictEqual({
          error: `${keyName} is set, but POSTHOG_HOST is not: ${what} are off. Set POSTHOG_HOST to the PostHog host (ENVIRONMENTS.md §7).`,
        });
      }
    },
  );

  it.each(readers)(
    'a POSTHOG_HOST that is not an https:// URL is a %s configuration error',
    (what, keyName, _otherKeyName, read) => {
      for (const host of [
        'http://eu.posthog.example.test',
        'eu.posthog.example.test',
        'ftp://posthog.example.test',
        'not a url',
      ]) {
        expect(read({ [keyName]: 'phc_example', POSTHOG_HOST: host })).toStrictEqual({
          error: `POSTHOG_HOST is not an https:// URL: ${what} are off. Set POSTHOG_HOST to the PostHog host (ENVIRONMENTS.md §7).`,
        });
      }
    },
  );

  it('no PostHog host is hard-coded in packages/observability or apps/web', async () => {
    const repoRoot = path.resolve(import.meta.dirname, '../../..');
    const { stdout } = await promisify(execFile)(
      'git',
      [
        'grep',
        // New files too, before they are committed.
        '--untracked',
        '-n',
        '-i',
        '-I',
        '-E',
        String.raw`posthog\.com`,
        '--',
        'packages/observability',
        'apps/web',
      ],
      { cwd: repoRoot },
    ).catch((error: { code?: number; stdout: string }) => {
      // git grep exits with 1 when nothing matches.
      if (error.code === 1) return { stdout: '' };
      throw error;
    });
    expect(stdout).toBe('');
  });
});
