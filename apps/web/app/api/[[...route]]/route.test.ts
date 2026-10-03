import { HELLO_GREETING_KEY } from '@trainer-hub/api';
import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('E018 API mount', () => {
  it('serves GET /api/v1/hello from packages/api', async () => {
    const res = await GET(new Request('http://localhost/api/v1/hello?locale=en'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ greetingKey: HELLO_GREETING_KEY, locale: 'en' });
  });
});

describe('E003 health check mount', () => {
  it('reports the database as unavailable when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await GET(new Request('http://localhost/api/v1/health'));

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        status: 'unavailable',
        checks: { database: 'unavailable' },
      });
      expect(log).toHaveBeenCalledWith(
        'Health check: database unavailable:',
        expect.stringContaining('DATABASE_URL is not set'),
      );
    } finally {
      vi.unstubAllEnvs();
      log.mockRestore();
    }
  });
});
