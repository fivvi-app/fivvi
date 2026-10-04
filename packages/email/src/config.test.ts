import { describe, expect, it } from 'vitest';
import { readEmailConfig } from './config.ts';

const env = {
  BREVO_API_KEY: 'xkeysib-test-secret',
  EMAIL_FROM_ADDRESS: 'noreply@example.com',
  EMAIL_FROM_NAME: 'Trainer Hub',
};

describe('E006 email config', () => {
  it('reads the sender and API key from the environment', () => {
    expect(readEmailConfig({ ...env, EMAIL_FROM_NAME: ' Trainer Hub ' })).toEqual({
      sender: { email: 'noreply@example.com', name: 'Trainer Hub' },
      brevoApiKey: 'xkeysib-test-secret',
    });
  });

  it('names every missing variable', () => {
    expect(() => readEmailConfig({})).toThrow(
      /^BREVO_API_KEY, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME are not set/,
    );
    expect(() => readEmailConfig({ ...env, EMAIL_FROM_NAME: ' ' })).toThrow(
      /^EMAIL_FROM_NAME is not set/,
    );
  });

  it('rejects a sender that is not an email address', () => {
    expect(() => readEmailConfig({ ...env, EMAIL_FROM_ADDRESS: 'Trainer Hub' })).toThrow(
      'EMAIL_FROM_ADDRESS is not an email address.',
    );
  });

  it('never puts the API key in an error message', () => {
    let message = '';
    try {
      readEmailConfig({ ...env, EMAIL_FROM_ADDRESS: 'nope' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('xkeysib-test-secret');
  });
});
