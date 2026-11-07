import { describe, expect, it } from 'vitest';
import { demoRequestRecipient } from './demo-request-recipient';

describe('F064 where demo requests go', () => {
  it('production sends them to the support address of the site', () => {
    expect(demoRequestRecipient({ RAILWAY_ENVIRONMENT_NAME: 'production' })).toEqual({
      email: 'support@fivvi.app',
      name: 'Fivvi support',
    });
  });

  it.each([
    ['development', {}],
    ['a preview', { RAILWAY_ENVIRONMENT_NAME: 'pr-641' }],
    ['development on Railway', { RAILWAY_ENVIRONMENT_NAME: 'development' }],
    ['a lookalike of production', { RAILWAY_ENVIRONMENT_NAME: 'production-copy' }],
  ])(
    '%s never sends to the real address: an @example.com address, which is logged, not sent',
    (_name, env) => {
      const recipient = demoRequestRecipient(env);

      expect(recipient.email).toMatch(/@example\.com$/);
      expect(recipient.email).not.toContain('fivvi.app');
    },
  );

  it('a variable can point a test server at a fake mailbox, outside production only', () => {
    const env = { DEMO_REQUEST_TO: 'support@fivvi.e2e.test' };

    expect(demoRequestRecipient(env).email).toBe('support@fivvi.e2e.test');
    expect(demoRequestRecipient({ ...env, RAILWAY_ENVIRONMENT_NAME: 'pr-641' }).email).toBe(
      'support@fivvi.e2e.test',
    );
    // Production ignores it, so a stray variable can never redirect the real requests.
    expect(demoRequestRecipient({ ...env, RAILWAY_ENVIRONMENT_NAME: 'production' }).email).toBe(
      'support@fivvi.app',
    );
    expect(demoRequestRecipient({ DEMO_REQUEST_TO: '  ' }).email).toMatch(/@example\.com$/);
  });
});
