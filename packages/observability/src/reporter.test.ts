import { describe, expect, it, vi } from 'vitest';
import { createCaptureTransport } from './capture.ts';
import { createErrorReporter } from './reporter.ts';

const DSN = 'https://public@o0.ingest.de.sentry.io/1';
const SHA = '1111111111111111111111111111111111111111';
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

  it('AC4: sends no IP address and no default PII from the request', async () => {
    const transport = createCaptureTransport();
    const reporter = createErrorReporter({ env: ENV, transport });
    const request = new Request('https://app.example.com/api/v1/hello', {
      headers: {
        'X-Forwarded-For': '203.0.113.7',
        'X-Real-IP': '203.0.113.7',
        'User-Agent': 'Mozilla/5.0 (test)',
      },
    });

    reporter.captureError(new Error('Boom'), { request, route: '/v1/hello' });
    await reporter.flush();

    const [event] = transport.events;
    expect(event?.user).toBeUndefined();
    expect(event?.request).toEqual({ method: 'GET', url: 'https://app.example.com/api/v1/hello' });
    expect(JSON.stringify(event)).not.toMatch(/203\.0\.113\.7|ip_address|\{\{auto\}\}|Mozilla/);
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

  it('E012 AC5: tags an error with the cron task and run, and drops every other tag', async () => {
    const transport = createCaptureTransport();
    const reporter = createErrorReporter({ env: ENV, transport });

    reporter.captureError(new Error('Job failed'), {
      tags: {
        'cron.task': 'lettermint-usage',
        'cron.run_id': '3f2e1d0c-9b8a-4765-8432-10fedcba9876',
        client_name: 'Anna',
      },
    });
    await reporter.flush();

    expect(transport.events[0]?.tags).toEqual({
      'cron.task': 'lettermint-usage',
      'cron.run_id': '3f2e1d0c-9b8a-4765-8432-10fedcba9876',
    });
  });

  describe('E012 AC10 cron monitor check-ins', () => {
    const monitor = {
      slug: 'cron',
      crontab: '*/5 * * * *',
      checkinMargin: 5,
      maxRuntime: 4,
      timezone: 'UTC',
    };

    it('sends the check-in in progress, then ok with its duration, under one check-in ID', async () => {
      const transport = createCaptureTransport();
      const reporter = createErrorReporter({ env: ENV, transport });

      const checkIn = reporter.startCheckIn(monitor);
      checkIn.finish('ok');
      await reporter.flush();

      expect(transport.itemTypes).toEqual(['check_in', 'check_in']);
      const [started, finished] = transport.checkIns;
      expect(started).toMatchObject({
        monitor_slug: 'cron',
        status: 'in_progress',
        environment: 'preview',
        release: SHA,
        monitor_config: {
          schedule: { type: 'crontab', value: '*/5 * * * *' },
          checkin_margin: 5,
          max_runtime: 4,
          timezone: 'UTC',
        },
      });
      expect(finished).toMatchObject({ monitor_slug: 'cron', status: 'ok' });
      expect(finished?.check_in_id).toBe(started?.check_in_id);
      expect(typeof finished?.duration).toBe('number');
    });

    it('sends error when the run failed', async () => {
      const transport = createCaptureTransport();
      const reporter = createErrorReporter({ env: ENV, transport });

      reporter.startCheckIn(monitor).finish('error');
      await reporter.flush();

      expect(transport.checkIns.map((checkIn) => checkIn.status)).toEqual(['in_progress', 'error']);
    });

    it('sends only the last status once, however often finish is called', async () => {
      const transport = createCaptureTransport();
      const reporter = createErrorReporter({ env: ENV, transport });

      const checkIn = reporter.startCheckIn(monitor);
      checkIn.finish('ok');
      checkIn.finish('error');
      await reporter.flush();

      expect(transport.checkIns.map((sent) => sent.status)).toEqual(['in_progress', 'ok']);
    });

    it('sends nothing without a DSN', async () => {
      const transport = createCaptureTransport();
      const reporter = createErrorReporter({ env: {}, transport });

      reporter.startCheckIn(monitor).finish('ok');

      expect(await reporter.flush()).toBe(true);
      expect(transport.itemTypes).toEqual([]);
    });
  });
});
