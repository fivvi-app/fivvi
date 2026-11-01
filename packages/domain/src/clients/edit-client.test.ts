import { describe, expect, it } from 'vitest';
import { decideClientEdit } from './edit-client.ts';

describe('F006 AC7, AC8: whether a client edit is saved, and which account the client is linked to', () => {
  it('saves an edit that leaves the email address alone, and keeps the link as it is', () => {
    expect(decideClientEdit({ clientId: 'anna' })).toEqual({ outcome: 'update' });
  });

  it('clearing the email address is allowed and removes the link', () => {
    expect(decideClientEdit({ clientId: 'anna', email: null })).toEqual({
      outcome: 'update',
      accountId: null,
    });
  });

  it('links the client to the account of the new email address', () => {
    expect(
      decideClientEdit({ clientId: 'anna', email: 'new@example.com', accountId: 'account-new' }),
    ).toEqual({ outcome: 'update', accountId: 'account-new' });
  });

  it('links the client to nothing when no account has the new email address', () => {
    expect(decideClientEdit({ clientId: 'anna', email: 'new@example.com' })).toEqual({
      outcome: 'update',
      accountId: null,
    });
  });

  it('refuses an email address another client of the workspace has, naming that client', () => {
    expect(
      decideClientEdit({
        clientId: 'anna',
        email: 'mark@example.com',
        clientWithEmail: { id: 'mark' },
      }),
    ).toEqual({ outcome: 'duplicate', clientId: 'mark' });
  });

  it('refuses an account another client of the workspace is already linked to', () => {
    expect(
      decideClientEdit({
        clientId: 'anna',
        email: 'mark-at-work@example.com',
        accountId: 'account-mark',
        clientOfAccount: { id: 'mark' },
      }),
    ).toEqual({ outcome: 'duplicate', clientId: 'mark' });
  });

  it('is no duplicate when the client is the one that has the address or the account', () => {
    expect(
      decideClientEdit({
        clientId: 'anna',
        email: 'anna@example.com',
        clientWithEmail: { id: 'anna' },
        accountId: 'account-anna',
        clientOfAccount: { id: 'anna' },
      }),
    ).toEqual({ outcome: 'update', accountId: 'account-anna' });
  });

  it('names the other client even when the client itself has the address', () => {
    expect(
      decideClientEdit({
        clientId: 'anna',
        email: 'anna@example.com',
        clientWithEmail: { id: 'anna' },
        accountId: 'account-mark',
        clientOfAccount: { id: 'mark' },
      }),
    ).toEqual({ outcome: 'duplicate', clientId: 'mark' });
  });
});
