import { HELLO_GREETING_KEY } from '@trainer-hub/api';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('E018 API mount', () => {
  it('serves GET /api/v1/hello from packages/api', async () => {
    const res = await GET(new Request('http://localhost/api/v1/hello?locale=en'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ greetingKey: HELLO_GREETING_KEY, locale: 'en' });
  });
});
