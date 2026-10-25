import { INTERNAL_SERVER_ERROR } from '@fivvi/api';
import { describe, expect, it, vi } from 'vitest';
import { errorReporter } from '../../../server/error-reporter';
import { GET } from './route';

// The greeting itself is read from Postgres in packages/api/test/hello.integration.test.ts.
describe('E018 API mount', () => {
  it('serves GET /api/v1/hello from packages/api, reading the greeting from the database', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const capture = vi.spyOn(errorReporter, 'captureError').mockImplementation(() => {});
    try {
      const res = await GET(new Request('http://localhost/api/v1/hello?locale=en'));

      expect(res.status).toBe(500);
      expect(await res.text()).toBe(INTERNAL_SERVER_ERROR);
      // The log names the error only: a database error can quote an address (Sentry has the cause).
      expect(log).toHaveBeenCalledWith('Unhandled API error:', 'Error');
      // The cause goes to the error reporter: the 500 came from the database read.
      expect(capture).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('DATABASE_URL is not set') }),
        expect.anything(),
      );
    } finally {
      vi.unstubAllEnvs();
      capture.mockRestore();
      log.mockRestore();
    }
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
