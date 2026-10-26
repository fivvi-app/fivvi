import { describe, expect, it, vi } from 'vitest';
import { initBrowserErrorReporting } from './browser.ts';
import { createCaptureTransport } from './capture.ts';
import { createErrorReporter } from './reporter.ts';
import { createRequestErrorHandler } from './request-error.ts';

// Synthetic personal data only (AGENTS.md, D8).
const EMAIL = 'anna.devries@example.com';
const IP = '203.0.113.7';
const COOKIE = 'session=test-cookie-value';
const TOKEN = 'Bearer test-token';
const CLIENT_ID = '3f2e1d0c-9b8a-4765-8432-10fedcba9876';
const SHA = '1111111111111111111111111111111111111111';
const DSN = 'https://public@o0.ingest.de.sentry.io/1';
const PERSONAL = ['anna', 'devries', IP, COOKIE, 'test-cookie', 'test-token', 'Mozilla'];

describe('E009 web error reporting', () => {
  it('AC2: server init uses the scrubber and the environment and release tags', async () => {
    const transport = createCaptureTransport();
    const reporter = createErrorReporter({
      env: { SENTRY_DSN: DSN, RAILWAY_ENVIRONMENT_NAME: 'pr-44', RAILWAY_GIT_COMMIT_SHA: SHA },
      transport,
    });
    const onRequestError = createRequestErrorHandler(reporter);
    // What Next.js passes when a server component throws while rendering a page.
    const request = {
      path: `/clients/${CLIENT_ID}?email=${encodeURIComponent(EMAIL)}`,
      method: 'GET',
      headers: {
        accept: 'text/html',
        cookie: COOKIE,
        authorization: TOKEN,
        'x-forwarded-for': IP,
        'user-agent': 'Mozilla/5.0 (test)',
      },
    };
    const context = {
      routerKind: 'App Router',
      routePath: '/clients/[clientId]',
      routeType: 'render',
      renderSource: 'react-server-components',
      revalidateReason: undefined,
    };

    onRequestError(new Error(`Could not render the invitation for ${EMAIL}`), request, context);
    await reporter.flush();

    expect(transport.events).toHaveLength(1);
    const [event] = transport.events;
    expect(event).toMatchObject({
      environment: 'preview',
      release: SHA,
      level: 'error',
      transaction: 'GET /clients/[clientId]',
      tags: { route: '/clients/[clientId]' },
      request: { method: 'GET', url: `/clients/${CLIENT_ID}`, headers: { accept: 'text/html' } },
      exception: {
        values: [{ type: 'Error', value: 'Could not render the invitation for [email]' }],
      },
    });
    const sent = JSON.stringify(event);
    for (const value of PERSONAL) expect(sent).not.toContain(value);
  });
});

describe('E009 browser error reporting', () => {
  // What Next.js inlines into the browser bundle at build time (instrumentation-client.ts).
  const BROWSER_ENV = {
    NEXT_PUBLIC_SENTRY_DSN: DSN,
    RAILWAY_ENVIRONMENT_NAME: 'production',
    RAILWAY_GIT_COMMIT_SHA: SHA,
  };

  it('AC2: browser init uses the scrubber and the environment and release tags', async () => {
    vi.stubGlobal('document', {
      location: new URL(`https://app.example.com/clients/${CLIENT_ID}?email=${EMAIL}#notes`),
      referrer: `https://mail.example.com/inbox?to=${EMAIL}`,
    });
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const transport = createCaptureTransport();
    const reporter = initBrowserErrorReporting({ env: BROWSER_ENV, transport });

    // A browser hands every uncaught error to window.onerror, and every unhandled promise
    // rejection to window.onunhandledrejection.
    const error = new TypeError(`Cannot read the profile of ${EMAIL}`);
    browser.onerror?.(error.message, 'https://app.example.com/_next/static/a.js', 1, 1, error);
    browser.onunhandledrejection?.(
      new PromiseRejectionEventLike(new RangeError(`No slot left for ${EMAIL}`)),
    );
    expect(await reporter.flush()).toBe(true);

    expect(reporter.enabled).toBe(true);
    expect(transport.events).toHaveLength(2);
    const [uncaught, rejection] = transport.events;
    for (const event of transport.events) {
      expect(event).toMatchObject({
        environment: 'production',
        release: SHA,
        level: 'error',
        platform: 'javascript',
        request: { url: `https://app.example.com/clients/${CLIENT_ID}` },
        // Sentry never adds the visitor's IP address.
        sdk: { settings: { infer_ip: 'never' } },
      });
      const sent = JSON.stringify(event);
      for (const value of [...PERSONAL, 'Node.js', '#notes']) expect(sent).not.toContain(value);
    }
    expect(uncaught?.exception?.values?.[0]).toMatchObject({
      type: 'TypeError',
      value: 'Cannot read the profile of [email]',
      mechanism: { handled: false },
    });
    expect(rejection?.exception?.values?.[0]).toMatchObject({
      type: 'RangeError',
      value: 'No slot left for [email]',
      mechanism: { handled: false },
    });
    // Errors only: no performance traces, sessions, replays or client reports.
    expect(transport.itemTypes).toEqual(['event', 'event']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports an error a component catches itself', async () => {
    const transport = createCaptureTransport();
    const reporter = initBrowserErrorReporting({ env: BROWSER_ENV, transport });

    reporter.captureError(new Error(`Could not save the note of ${EMAIL}`));
    await reporter.flush();

    expect(transport.events.at(-1)?.exception?.values?.[0]).toMatchObject({
      type: 'Error',
      value: 'Could not save the note of [email]',
    });
  });
});

/** The global hooks a browser calls for uncaught errors (no DOM types in this package). */
const browser = globalThis as {
  onerror?: (message: string, url: string, line: number, column: number, error: Error) => void;
  onunhandledrejection?: (event: Event) => void;
};

/** The parts of a PromiseRejectionEvent the browser passes to onunhandledrejection. */
class PromiseRejectionEventLike extends Event {
  readonly reason: unknown;

  constructor(reason: unknown) {
    super('unhandledrejection');
    this.reason = reason;
  }
}
