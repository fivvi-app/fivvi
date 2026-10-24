import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

// Sign-in itself is proven in packages/api/test/sign-in.integration.test.ts; this proves that
// apps/web mounts Better Auth's endpoints under /api/auth.
describe('F001 /api/auth mount', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves Better Auth under /api/auth', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-that-is-at-least-thirty-two-characters-long');
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgres://fivvi:fivvi@localhost:5432/fivvi_unused');

    const res = await GET(new Request('http://localhost:3000/api/auth/ok'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
