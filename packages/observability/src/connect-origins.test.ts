import { describe, expect, it } from 'vitest';
import { browserConnectOrigins } from './connect-origins.ts';

// Synthetic hosts and keys only (AGENTS.md, D8).
const DSN = 'https://publickey@o123.ingest.example.test/456';
const POSTHOG = {
  NEXT_PUBLIC_POSTHOG_KEY: 'phc_example_project_key',
  POSTHOG_HOST: 'https://posthog.example.test',
};

// E013 AC8: the browser may talk to the services the app already uses, named, never by wildcard.
describe('E013 the origins the browser sends reports and page views to', () => {
  it('are none without a Sentry DSN or a PostHog key', () => {
    expect(browserConnectOrigins({})).toEqual([]);
  });

  it('is the origin of the Sentry DSN, without its key or path', () => {
    expect(browserConnectOrigins({ NEXT_PUBLIC_SENTRY_DSN: DSN })).toEqual([
      'https://o123.ingest.example.test',
    ]);
  });

  it('is the PostHog host, without a trailing slash or a path', () => {
    expect(
      browserConnectOrigins({ ...POSTHOG, POSTHOG_HOST: 'https://posthog.example.test/ingest/' }),
    ).toEqual(['https://posthog.example.test']);
  });

  it('are both when both are set', () => {
    expect(browserConnectOrigins({ ...POSTHOG, NEXT_PUBLIC_SENTRY_DSN: DSN })).toEqual([
      'https://o123.ingest.example.test',
      'https://posthog.example.test',
    ]);
  });

  it('leaves out a PostHog host when page views are off (no key, or a host that is not https)', () => {
    expect(browserConnectOrigins({ POSTHOG_HOST: 'https://posthog.example.test' })).toEqual([]);
    expect(
      browserConnectOrigins({ ...POSTHOG, POSTHOG_HOST: 'http://posthog.example.test' }),
    ).toEqual([]);
  });

  it('leaves out a DSN that is not an https URL', () => {
    expect(browserConnectOrigins({ NEXT_PUBLIC_SENTRY_DSN: 'not a dsn' })).toEqual([]);
    expect(
      browserConnectOrigins({ NEXT_PUBLIC_SENTRY_DSN: 'http://key@sentry.example.test/1' }),
    ).toEqual([]);
  });
});
