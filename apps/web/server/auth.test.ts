import { describe, expect, it } from 'vitest';
import { readAuthConfig } from './auth';

const secret = 'test-secret-that-is-at-least-thirty-two-characters-long';

describe('F001 sign-in configuration', () => {
  it('reads the secret and the public address from the environment', () => {
    expect(
      readAuthConfig({
        BETTER_AUTH_SECRET: secret,
        BETTER_AUTH_URL: 'https://pr-130.up.example.net/',
      }),
    ).toEqual({ secret, baseURL: 'https://pr-130.up.example.net' });
  });

  it('needs a secret, and says which variable is missing', () => {
    expect(() => readAuthConfig({ BETTER_AUTH_URL: 'https://fivvi.app' })).toThrow(
      /BETTER_AUTH_SECRET is not set/,
    );
  });

  it('rejects a short secret without printing it', () => {
    let message = '';
    try {
      readAuthConfig({ BETTER_AUTH_SECRET: 'short-secret', BETTER_AUTH_URL: 'https://fivvi.app' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/at least 32 characters/);
    expect(message).not.toContain('short-secret');
  });

  it('needs the public address on a deployed server, but not in local development', () => {
    expect(() => readAuthConfig({ BETTER_AUTH_SECRET: secret, NODE_ENV: 'production' })).toThrow(
      /BETTER_AUTH_URL is not set/,
    );
    expect(readAuthConfig({ BETTER_AUTH_SECRET: secret, NODE_ENV: 'development' }).baseURL).toBe(
      'http://localhost:3000',
    );
  });

  it('rejects an address that is not a URL', () => {
    expect(() =>
      readAuthConfig({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'fivvi.app' }),
    ).toThrow('BETTER_AUTH_URL is not a URL.');
  });
});
