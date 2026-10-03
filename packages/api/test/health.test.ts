import { z } from '@hono/zod-openapi';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ApiDependencies,
  createApiHandler,
  createApp,
  HEALTH_CHECK_TIMEOUT_MS,
  HealthResponseSchema,
} from '../src/index.ts';

// Strict copy: the response may not carry fields the contract doesn't declare.
const StrictHealthResponse = z.strictObject({
  ...HealthResponseSchema.shape,
  checks: z.strictObject(HealthResponseSchema.shape.checks.shape),
});

function withDatabase(pingDatabase: ApiDependencies['pingDatabase']): ApiDependencies {
  return { pingDatabase };
}

describe('E003 GET /v1/health', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns 200 when the database answers the ping', async () => {
    const pingDatabase = vi.fn(() => Promise.resolve());

    const res = await createApp(withDatabase(pingDatabase)).request('/v1/health');

    expect(res.status).toBe(200);
    expect(StrictHealthResponse.parse(await res.json())).toEqual({
      status: 'ok',
      checks: { database: 'ok' },
    });
    expect(pingDatabase).toHaveBeenCalledOnce();
  });

  it('pings the database on every request instead of caching the result', async () => {
    const pingDatabase = vi.fn(() => Promise.resolve());
    const app = createApp(withDatabase(pingDatabase));

    await app.request('/v1/health');
    await app.request('/v1/health');

    expect(pingDatabase).toHaveBeenCalledTimes(2);
  });

  it('is never cached by clients or proxies', async () => {
    const res = await createApp(withDatabase(() => Promise.resolve())).request('/v1/health');

    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 503 without error details when the ping fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secret = 'postgres://app:hunter2@postgres.railway.internal:5432/railway';

    const res = await createApp(
      withDatabase(() => Promise.reject(new Error(`connect ECONNREFUSED ${secret}`))),
    ).request('/v1/health');

    expect(res.status).toBe(503);
    const body = await res.text();
    expect(StrictHealthResponse.parse(JSON.parse(body))).toEqual({
      status: 'unavailable',
      checks: { database: 'unavailable' },
    });
    expect(body).not.toContain('hunter2');
    expect(log).toHaveBeenCalledOnce();
  });

  it('returns 503 when the ping hangs longer than the timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const hanging = new Promise<void>(() => {});

    const pending = createApp(withDatabase(() => hanging)).request('/v1/health');
    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS);
    const res = await pending;

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'unavailable' });
  });

  it('reports the database as unavailable when none is configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await createApp().request('/v1/health');

    expect(res.status).toBe(503);
  });

  it('is served under /api by the mounted handler', async () => {
    const handle = createApiHandler(withDatabase(() => Promise.resolve()));

    const res = await handle(new Request('http://localhost/api/v1/health'));

    expect(res.status).toBe(200);
  });
});
