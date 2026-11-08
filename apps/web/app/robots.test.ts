import { afterEach, describe, expect, it, vi } from 'vitest';
import robots, { dynamic } from './robots';

afterEach(() => vi.unstubAllEnvs());

describe('F064 AC13 /robots.txt', () => {
  it('is built per request, so the environment is read at run time and not baked into the build', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('reads the environment of the running server', () => {
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'pr-644');

    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });

  it('disallows all in production too, until the site is indexable (#648)', () => {
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'production');

    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });
});
