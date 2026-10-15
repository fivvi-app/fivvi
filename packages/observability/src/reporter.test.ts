import { describe, expect, it, vi } from 'vitest';
import { createCaptureTransport } from './capture.ts';
import { createErrorReporter } from './reporter.ts';

const DSN = 'https://public@o0.ingest.de.sentry.io/1';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const ENV = { SENTRY_DSN: DSN, RAILWAY_ENVIRONMENT_NAME: 'pr-43', RAILWAY_GIT_COMMIT_SHA: SHA };

describe('E009 error reporter', () => {
  it('captures an error tagged with environment and release, without sending it anywhere', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const transport = createCaptureTransport();
    const reporter = createErrorReporter({ env: ENV, transport });

    reporter.captureError(new TypeError('Cannot read properties of undefined'));

    expect(reporter.enabled).toBe(true);
    expect(await reporter.flush()).toBe(true);
    expect(transport.events).toHaveLength(1);
    expect(transport.events[0]).toMatchObject({
      environment: 'preview',
      release: SHA,
      level: 'error',
      exception: {
        values: [{ type: 'TypeError', value: 'Cannot read properties of undefined' }],
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('adds the request and the route template, scrubbed before sending', async () => {
    const transport = createCaptureTransport();
    const reporter = createErrorReporter({ env: ENV, transport });
    const request = new Request(
      'https://app.example.com/api/v1/clients/3f2e1d0c-9b8a-4765-8432-10fedcba9876?email=anna@example.com',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', Cookie: 'session=test', Accept: '*/*' },
        body: '{"note":"Knee injury"}',
      },
    );

    reporter.captureError(new Error('Boom'), { request, route: '/v1/clients/:clientId' });
    await reporter.flush();

    expect(transport.events).toHaveLength(1);
    const [event] = transport.events;
    expect(event).toMatchObject({
      transaction: 'POST /v1/clients/:clientId',
      tags: { route: '/v1/clients/:clientId' },
      request: {
        method: 'POST',
        url: 'https://app.example.com/api/v1/clients/3f2e1d0c-9b8a-4765-8432-10fedcba9876',
        headers: { accept: '*/*' },
      },
    });
    const sent = JSON.stringify(event);
    for (const value of ['anna', 'test-token', 'session=test', 'Knee']) {
      expect(sent).not.toContain(value);
    }
  });

  it('reports the cause of an error too', async () => {
    const transport = createCaptureTransport();
    const reporter = createErrorReporter({ env: ENV, transport });

    reporter.captureError(new Error('Job failed', { cause: new RangeError('Out of range') }));
    await reporter.flush();

    expect(transport.events[0]?.exception?.values?.map((e) => e.type)).toEqual([
      'RangeError',
      'Error',
    ]);
  });
});
