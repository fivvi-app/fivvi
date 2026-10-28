import { describe, expect, it, vi } from 'vitest';
import { readAuthConfig } from './auth';

const secret = 'test-secret-that-is-at-least-thirty-two-characters-long';

describe('F001 sign-in configuration', () => {
  it('reads the secret and the public address from the environment', () => {
    expect(
      readAuthConfig({
        BETTER_AUTH_SECRET: secret,
        BETTER_AUTH_URL: 'https://pr-130.up.example.net/',
      }),
    ).toEqual({
      secret,
      baseURL: 'https://pr-130.up.example.net',
      signUpAllowlist: expect.objectContaining({ allows: expect.any(Function) }),
    });
  });

  describe('SIGN_UP_ALLOWED_EMAILS (AC9)', () => {
    const base = { BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'https://fivvi.app' };

    it('reads exact addresses and @domain entries', () => {
      const { signUpAllowlist } = readAuthConfig({
        ...base,
        SIGN_UP_ALLOWED_EMAILS: 'pilot@gym.test, @example.com',
      });

      expect(signUpAllowlist.allows('pilot@gym.test')).toBe(true);
      expect(signUpAllowlist.allows('anyone@example.com')).toBe(true);
      expect(signUpAllowlist.allows('anyone@voorbeeld.nl')).toBe(false);
    });

    it('is closed when the variable is not set or empty (production until the owner sets it)', () => {
      for (const env of [base, { ...base, SIGN_UP_ALLOWED_EMAILS: '' }]) {
        expect(readAuthConfig(env).signUpAllowlist.allows('owner@example.com')).toBe(false);
      }
    });

    it('fails on a malformed entry, without printing it', () => {
      let message = '';
      try {
        readAuthConfig({
          ...base,
          SIGN_UP_ALLOWED_EMAILS: 'pilot@gym.test,gym.test',
        });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/SIGN_UP_ALLOWED_EMAILS entry 2/);
      expect(message).not.toContain('gym.test');
    });
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

describe('F002 the allowlist the API builds the workspace rule on', () => {
  it('is the one sign-in parsed from SIGN_UP_ALLOWED_EMAILS, read once on first use', async () => {
    vi.resetModules();
    vi.stubEnv('BETTER_AUTH_SECRET', secret);
    vi.stubEnv('BETTER_AUTH_URL', 'https://fivvi.app');
    vi.stubEnv('SIGN_UP_ALLOWED_EMAILS', 'pilot@gym.test');
    const { signUpAllowlist } = await import('./auth');

    const first = signUpAllowlist();
    vi.stubEnv('SIGN_UP_ALLOWED_EMAILS', 'someone@else.test');

    expect(first.allows('pilot@gym.test')).toBe(true);
    expect(first.allows('someone@else.test')).toBe(false);
    expect(signUpAllowlist()).toBe(first);
  });
});
