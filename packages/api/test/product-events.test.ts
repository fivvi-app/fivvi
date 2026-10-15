import type { ProductEvents } from '@trainer-hub/observability';
import { describe, expect, it, vi } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';

describe('E009 API product events', () => {
  it('flushes product events once per request, also when the route fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const productEvents: ProductEvents = {
      enabled: true,
      track: () => {},
      flush: vi.fn(() => Promise.resolve()),
    };
    const app = createApp({ ...NO_DEPENDENCIES, productEvents });
    app.post('/v1/bookings', () => {
      throw new Error('Boom');
    });

    expect((await app.request('/v1/hello')).status).toBe(200);
    expect(productEvents.flush).toHaveBeenCalledTimes(1);
    expect((await app.request('/v1/bookings', { method: 'POST' })).status).toBe(500);
    expect(productEvents.flush).toHaveBeenCalledTimes(2);
  });
});
