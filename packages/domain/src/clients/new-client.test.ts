import { describe, expect, it } from 'vitest';
import { CLIENT_NAME_MAX_LENGTH, decideNewClient, normalizeEmail } from './new-client.ts';

describe('F006 AC2: an email address is stored lower case', () => {
  it('lowers the case and drops the spaces around it', () => {
    expect(normalizeEmail('Anna@Example.com')).toBe('anna@example.com');
    expect(normalizeEmail('  ANNA@EXAMPLE.COM ')).toBe('anna@example.com');
  });

  it('allows a name of 120 characters and no more', () => {
    expect(CLIENT_NAME_MAX_LENGTH).toBe(120);
  });
});

describe('F006 AC3, AC4: whether a new client is added, and to which account it is linked', () => {
  it('adds a client without an email address, linked to nothing', () => {
    expect(decideNewClient({})).toEqual({ outcome: 'add', accountId: null });
  });

  it('adds a client with an email address nobody in the workspace uses and no account has', () => {
    expect(decideNewClient({ email: 'anna@example.com' })).toEqual({
      outcome: 'add',
      accountId: null,
    });
  });

  it('links the new client to the account that has the email address', () => {
    expect(decideNewClient({ email: 'anna@example.com', accountId: 'account-anna' })).toEqual({
      outcome: 'add',
      accountId: 'account-anna',
    });
  });

  it('offers the client of the workspace that already uses the email address', () => {
    expect(
      decideNewClient({
        email: 'anna@example.com',
        clientWithEmail: { id: 'client-anna' },
        accountId: 'account-anna',
      }),
    ).toEqual({ outcome: 'duplicate', clientId: 'client-anna' });
  });

  it('offers the client the account is already linked to in the workspace', () => {
    // The client was linked by another way (say, a first booking) and has another address on file.
    expect(
      decideNewClient({
        email: 'anna@example.com',
        accountId: 'account-anna',
        clientOfAccount: { id: 'client-anna' },
      }),
    ).toEqual({ outcome: 'duplicate', clientId: 'client-anna' });
  });

  it('prefers the client with the email address when both facts hold', () => {
    expect(
      decideNewClient({
        email: 'anna@example.com',
        clientWithEmail: { id: 'by-email' },
        accountId: 'account-anna',
        clientOfAccount: { id: 'by-account' },
      }),
    ).toEqual({ outcome: 'duplicate', clientId: 'by-email' });
  });

  it('never links a client without an email address, whatever else it is told', () => {
    expect(decideNewClient({ accountId: 'account-anna' })).toEqual({
      outcome: 'add',
      accountId: null,
    });
  });
});
