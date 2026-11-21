import { describe, expect, it } from 'vitest';
import { readEmailConfig } from './config.ts';

const lettermintEnv = {
  LETTERMINT_API_TOKEN: 'lm-test-secret',
  LETTERMINT_ROUTE_SIGN_IN: 'sign-in-route',
  LETTERMINT_ROUTE_MAIL: 'mail-route',
  EMAIL_FROM_ADDRESS: 'noreply@fivvi.app',
  EMAIL_FROM_NAME: 'Fivvi',
  EMAIL_REPLY_TO_ADDRESS: 'support@example.com',
};

describe('E006 email config', () => {
  it('reads the token, the routes and the sender from the environment', () => {
    expect(readEmailConfig({ ...lettermintEnv, EMAIL_FROM_NAME: ' Fivvi ' })).toEqual({
      sender: { email: 'noreply@fivvi.app', name: 'Fivvi' },
      replyTo: { email: 'support@example.com' },
      lettermint: {
        apiToken: 'lm-test-secret',
        routes: { signIn: 'sign-in-route', mail: 'mail-route' },
      },
    });
  });

  it('reads an optional API address', () => {
    expect(
      readEmailConfig({ ...lettermintEnv, LETTERMINT_API_URL: ' http://localhost:4010/v1/send ' }),
    ).toMatchObject({ lettermint: { apiUrl: 'http://localhost:4010/v1/send' } });
    expect(() => readEmailConfig({ ...lettermintEnv, LETTERMINT_API_URL: 'nope' })).toThrow(
      'LETTERMINT_API_URL is not a URL.',
    );
  });

  it('requires the token, both routes and the sender, and names what is missing', () => {
    expect(() => readEmailConfig({})).toThrow(
      /^LETTERMINT_API_TOKEN, LETTERMINT_ROUTE_SIGN_IN, LETTERMINT_ROUTE_MAIL, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME, EMAIL_REPLY_TO_ADDRESS are not set/,
    );
    expect(() => readEmailConfig({ LETTERMINT_API_TOKEN: 'lm-test-secret' })).toThrow(
      /^LETTERMINT_ROUTE_SIGN_IN, LETTERMINT_ROUTE_MAIL, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME, EMAIL_REPLY_TO_ADDRESS are not set/,
    );
    expect(() => readEmailConfig({ ...lettermintEnv, LETTERMINT_ROUTE_MAIL: ' ' })).toThrow(
      /^LETTERMINT_ROUTE_MAIL is not set/,
    );
  });

  it('requires the Reply-To address too, so production never sends without one (#1514)', () => {
    const { EMAIL_REPLY_TO_ADDRESS: _unset, ...withoutReplyTo } = lettermintEnv;
    expect(() => readEmailConfig(withoutReplyTo)).toThrow(/^EMAIL_REPLY_TO_ADDRESS is not set/);
    expect(() => readEmailConfig({ ...lettermintEnv, EMAIL_REPLY_TO_ADDRESS: ' ' })).toThrow(
      /^EMAIL_REPLY_TO_ADDRESS is not set/,
    );
    expect(() => readEmailConfig({ ...lettermintEnv, EMAIL_REPLY_TO_ADDRESS: 'nope' })).toThrow(
      'EMAIL_REPLY_TO_ADDRESS is not an email address.',
    );
  });

  it('treats a blank token as not set', () => {
    expect(() => readEmailConfig({ ...lettermintEnv, LETTERMINT_API_TOKEN: ' ' })).toThrow(
      /^LETTERMINT_API_TOKEN is not set/,
    );
  });

  it('never puts the token in an error message', () => {
    expect(() => readEmailConfig({ ...lettermintEnv, EMAIL_FROM_ADDRESS: 'nope' })).toThrow(
      'EMAIL_FROM_ADDRESS is not an email address.',
    );
    let message = '';
    try {
      readEmailConfig({ ...lettermintEnv, LETTERMINT_ROUTE_MAIL: '' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('lm-test-secret');
  });
});
