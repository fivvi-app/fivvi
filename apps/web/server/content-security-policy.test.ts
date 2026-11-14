import { describe, expect, it } from 'vitest';
import { cspNonce, policyDirective as directive } from '../test/security-headers';
import {
  carriesDocumentPolicy,
  contentSecurityPolicy,
  createNonce,
} from './content-security-policy';

// Synthetic hosts and keys only (AGENTS.md, D8).
const SENTRY = 'https://publickey@o123.ingest.example.test/456';
const ANALYTICS = {
  NEXT_PUBLIC_POSTHOG_KEY: 'phc_example_project_key',
  POSTHOG_HOST: 'https://posthog.example.test',
};

describe('E013 AC8 the nonce', () => {
  it('differs per request', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));

    expect(nonces.size).toBe(50);
  });

  it('is at least 128 bits of base64, which fits a nonce source', () => {
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]{22,}={0,2}$/);
  });

  it('is read back from a policy', () => {
    const nonce = createNonce();

    expect(cspNonce({ 'content-security-policy': contentSecurityPolicy(nonce, {}) })).toBe(nonce);
  });
});

describe('E013 AC8 the Content-Security-Policy', () => {
  const policy = contentSecurityPolicy('abc123==', {});

  it('lets scripts run from the app, Turnstile and inline scripts with the nonce', () => {
    expect(directive(policy, 'script-src')).toEqual([
      "'self'",
      "'nonce-abc123=='",
      'https://challenges.cloudflare.com',
    ]);
  });

  it('never allows eval or inline scripts without the nonce', () => {
    expect(policy).not.toContain('unsafe-eval');
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
    expect(directive(policy, 'script-src')).not.toContain('*');
  });

  it('forbids framing, plug-ins and a changed base address, and posts forms to the app only', () => {
    expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(policy, 'object-src')).toEqual(["'none'"]);
    expect(directive(policy, 'base-uri')).toEqual(["'self'"]);
    expect(directive(policy, 'form-action')).toEqual(["'self'"]);
  });

  it('falls back to the app’s own origin', () => {
    expect(directive(policy, 'default-src')).toEqual(["'self'"]);
  });

  it('lets the Turnstile widget frame and call out to Cloudflare, and nothing else frame', () => {
    expect(directive(policy, 'frame-src')).toEqual(['https://challenges.cloudflare.com']);
    expect(directive(policy, 'connect-src')).toContain('https://challenges.cloudflare.com');
  });

  it('loads images and fonts from the app, and images also from data and blob addresses', () => {
    expect(directive(policy, 'img-src')).toEqual(["'self'", 'data:', 'blob:']);
    expect(directive(policy, 'font-src')).toEqual(["'self'"]);
  });

  it('allows styles from the app and the style attributes of components', () => {
    expect(directive(policy, 'style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('has no wildcard and no scheme-wide source in a directive of scripts, frames or connections', () => {
    for (const name of ['script-src', 'frame-src', 'connect-src', 'default-src']) {
      for (const source of directive(policy, name) ?? []) {
        expect(source).not.toMatch(/^\*|^https?:$|\*\./);
      }
    }
  });

  it('is one line without a newline', () => {
    expect(policy).not.toMatch(/[\r\n]/);
  });

  describe('what the app already loads', () => {
    it('lets the browser report errors to the Sentry host of the DSN, by name', () => {
      const connect = directive(
        contentSecurityPolicy('n', { NEXT_PUBLIC_SENTRY_DSN: SENTRY }),
        'connect-src',
      );

      expect(connect).toEqual([
        "'self'",
        'https://challenges.cloudflare.com',
        'https://o123.ingest.example.test',
      ]);
    });

    it('lets the browser send page views to the PostHog host, by name', () => {
      const connect = directive(contentSecurityPolicy('n', ANALYTICS), 'connect-src');

      expect(connect).toContain('https://posthog.example.test');
    });

    it('allows no analytics or error reporting host when they are off', () => {
      expect(directive(policy, 'connect-src')).toEqual([
        "'self'",
        'https://challenges.cloudflare.com',
      ]);
    });
  });

  describe('in development', () => {
    it('allows eval for React’s debugging, and only there', () => {
      const development = contentSecurityPolicy('n', { NODE_ENV: 'development' });

      expect(directive(development, 'script-src')).toContain("'unsafe-eval'");
      for (const env of [{}, { NODE_ENV: 'production' }, { NODE_ENV: 'test' }]) {
        expect(contentSecurityPolicy('n', env)).not.toContain('unsafe-eval');
      }
    });
  });
});

describe('E013 AC8 which answers carry the policy', () => {
  it.each(['/', '/en', '/login', '/book/johns-gym', '/home', '/no-such-page', '/robots.txt'])(
    '%s is a document',
    (path) => {
      expect(carriesDocumentPolicy(path)).toBe(true);
    },
  );

  it.each(['/api', '/api/v1/me', '/api/auth/get-session'])('%s (the API) is not', (path) => {
    expect(carriesDocumentPolicy(path)).toBe(false);
  });

  it('knows /apiary is not the API', () => {
    expect(carriesDocumentPolicy('/apiary')).toBe(true);
  });
});
