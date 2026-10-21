import type { ProductEvents } from '@fivvi/observability';
import { describe, expect, it, vi } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';

describe('E009 API product events', () => {
  it('flushes product events after every route, also when the route fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: string[] = [];
    const productEvents: ProductEvents = {
      enabled: true,
      track: () => {},
      flush: () => {
        calls.push('flush');
        return Promise.resolve();
      },
    };
    const app = createApp({ ...NO_DEPENDENCIES, productEvents });
    app.get('/v1/bookings', (c) => {
      calls.push('route');
      return c.json([]);
    });
    app.post('/v1/bookings', () => {
      calls.push('failing route');
      throw new Error('Boom');
    });

    expect((await app.request('/v1/bookings')).status).toBe(200);
    expect((await app.request('/v1/bookings', { method: 'POST' })).status).toBe(500);

    expect(calls).toEqual(['route', 'flush', 'failing route', 'flush']);
  });
});
