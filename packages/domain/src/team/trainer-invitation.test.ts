import { describe, expect, it } from 'vitest';
import {
  decideNewInvitation,
  INVITATION_NAME_MAX_LENGTH,
  INVITATION_VALIDITY_DAYS,
  INVITATIONS_PER_DAY,
  invitationExpiry,
  invitationLanguage,
  invitationQuotaSince,
} from './trainer-invitation.ts';

const NOW = new Date('2026-11-05T10:30:00.000Z');

describe('F011 trainer invitation rules', () => {
  it('AC1: an invitation is valid for 7 days from the moment it is sent', () => {
    expect(INVITATION_VALIDITY_DAYS).toBe(7);
    expect(invitationExpiry(NOW).toISOString()).toBe('2026-11-12T10:30:00.000Z');
  });

  it('AC1: the expiry holds across the clock change: seven times 24 hours', () => {
    // 22 October 2026 is a week before the clocks go back in the Netherlands (25 October).
    expect(invitationExpiry(new Date('2026-10-22T10:30:00.000Z')).toISOString()).toBe(
      '2026-10-29T10:30:00.000Z',
    );
  });

  it('does not change the date it is given', () => {
    const now = new Date(NOW);
    invitationExpiry(now);
    expect(now).toEqual(NOW);
  });

  it('AC10: the quota counts the invitations of the last 24 hours', () => {
    expect(INVITATIONS_PER_DAY).toBe(20);
    expect(invitationQuotaSince(NOW).toISOString()).toBe('2026-11-04T10:30:00.000Z');
  });

  it('AC1: the name is at most 120 characters, as a client name', () => {
    expect(INVITATION_NAME_MAX_LENGTH).toBe(120);
  });

  describe('AC2: the language of the email', () => {
    it('a chosen language wins over the address’s preference and the workspace default', () => {
      expect(
        invitationLanguage({ chosen: 'en', accountPreference: 'nl-NL', workspaceDefault: 'nl-NL' }),
      ).toBe('en');
      expect(
        invitationLanguage({ chosen: 'nl-NL', accountPreference: 'en', workspaceDefault: 'en' }),
      ).toBe('nl-NL');
    });

    it('without a choice, the preference of the account behind the address wins', () => {
      expect(
        invitationLanguage({ chosen: null, accountPreference: 'en', workspaceDefault: 'nl-NL' }),
      ).toBe('en');
    });

    it('without either, the workspace default decides', () => {
      expect(
        invitationLanguage({ chosen: null, accountPreference: null, workspaceDefault: 'nl-NL' }),
      ).toBe('nl-NL');
      expect(invitationLanguage({ workspaceDefault: 'en' })).toBe('en');
    });

    it('skips a value that is no catalog language', () => {
      expect(
        invitationLanguage({ chosen: 'fr', accountPreference: 'zz', workspaceDefault: 'en' }),
      ).toBe('en');
    });
  });

  describe('AC8, AC10: whether a new invitation is made', () => {
    const none = { onTeam: false, sentInLastDay: 0 };

    it('an address nobody has invited is invited', () => {
      expect(decideNewInvitation(none)).toEqual({ outcome: 'invite' });
    });

    it('an address already on the team is refused, whatever else holds', () => {
      expect(
        decideNewInvitation({
          onTeam: true,
          pending: { id: 'a' },
          sentInLastDay: INVITATIONS_PER_DAY,
        }),
      ).toEqual({ outcome: 'refused', reason: 'already_on_team' });
    });

    it('an address with a pending invitation gets no second one and names the first', () => {
      expect(decideNewInvitation({ ...none, pending: { id: 'inv-1' } })).toEqual({
        outcome: 'refused',
        reason: 'invitation_pending',
        invitationId: 'inv-1',
      });
    });

    it('the 20th invitation of a day goes out, the 21st is refused', () => {
      expect(decideNewInvitation({ ...none, sentInLastDay: INVITATIONS_PER_DAY - 1 })).toEqual({
        outcome: 'invite',
      });
      expect(decideNewInvitation({ ...none, sentInLastDay: INVITATIONS_PER_DAY })).toEqual({
        outcome: 'refused',
        reason: 'rate_limited',
      });
    });

    it('a duplicate is told so even when the day’s limit is reached', () => {
      expect(
        decideNewInvitation({
          onTeam: false,
          pending: { id: 'inv-1' },
          sentInLastDay: INVITATIONS_PER_DAY,
        }),
      ).toMatchObject({ reason: 'invitation_pending' });
    });
  });
});
