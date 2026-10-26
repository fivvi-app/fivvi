import { createCaptureTransport, createErrorReporter } from '@fivvi/observability';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// Synthetic personal data only.
const EMAIL = 'anna.devries@example.com';
const CLIENT_ID = '3f2e1d0c-9b8a-4765-8432-10fedcba9876';
const SHA = '1111111111111111111111111111111111111111';
const WITH_DSN = {
  SENTRY_DSN: 'https://public@o0.ingest.de.sentry.io/1',
  RAILWAY_ENVIRONMENT_NAME: 'production',
  RAILWAY_GIT_COMMIT_SHA: SHA,
};

/** The app with a route that fails the way a bug in a real route would. */
function appThatThrows(dependencies: ApiDependencies, error: Error) {
  const app = createApp(dependencies);
  app.post('/v1/clients/:clientId/notes', () => {
    throw error;
  });
  return app;
}

function request(app: ReturnType<typeof createApp>) {
  return app.request(`/v1/clients/${CLIENT_ID}/notes?email=${EMAIL}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-session-token',
      Cookie: 'session=test-cookie',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: 'Knee injury, avoid deep squats' }),
  });
}

describe('E009 API error reporting', () => {
  it('AC1: unhandled route error returns generic 500 and captures one tagged event', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = createCaptureTransport();
    const errorReporter = createErrorReporter({ env: WITH_DSN, transport });
    const app = appThatThrows(
      { ...NO_DEPENDENCIES, errorReporter },
      new Error(`Could not save the note of ${EMAIL}`),
    );

    const res = await request(app);
    await errorReporter.flush();

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toBe('Internal Server Error');
    expect(log).toHaveBeenCalledOnce();

    expect(transport.events).toHaveLength(1);
    const [event] = transport.events;
    expect(event).toMatchObject({
      environment: 'production',
      release: SHA,
      transaction: 'POST /v1/clients/:clientId/notes',
      tags: { route: '/v1/clients/:clientId/notes' },
      request: {
        method: 'POST',
        url: `http://localhost/v1/clients/${CLIENT_ID}/notes`,
        headers: { 'content-type': 'application/json' },
      },
      exception: { values: [{ type: 'Error', value: 'Could not save the note of [email]' }] },
    });
    const sent = JSON.stringify(event);
    for (const value of [EMAIL, 'test-session-token', 'test-cookie', 'Knee']) {
      expect(sent).not.toContain(value);
    }
  });

  it('AC5: without a DSN, returns the same 500 and captures nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = createCaptureTransport();
    const errorReporter = createErrorReporter({ env: {}, transport });
    const app = appThatThrows({ ...NO_DEPENDENCIES, errorReporter }, new Error('Boom'));

    const res = await request(app);
    await errorReporter.flush();

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Internal Server Error');
    expect(transport.events).toEqual([]);
  });

  it('does not report an HTTP error that a route throws on purpose', async () => {
    const transport = createCaptureTransport();
    const errorReporter = createErrorReporter({ env: WITH_DSN, transport });
    const app = appThatThrows(
      { ...NO_DEPENDENCIES, errorReporter },
      new HTTPException(404, { message: 'Not found' }),
    );

    const res = await request(app);
    await errorReporter.flush();

    expect(res.status).toBe(404);
    expect(transport.events).toEqual([]);
  });
});
