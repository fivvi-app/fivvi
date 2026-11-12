import {
  type EmailLanguage,
  type Locale,
  matchLocale,
  resolveCommunicationLanguage,
} from '@fivvi/i18n';
import { normalizeEmail } from '../email.ts';

// Trainer invitations (F011, spec #422): the rules of inviting a trainer by email. Pure: the
// route reads the facts, asks, and acts on the answer.

/** How long an invitation works after it is sent, or sent again (spec #422, open question 1). */
export const INVITATION_VALIDITY_DAYS = 7;

/** How many invitations a workspace may make in a day; the next one is refused (F011 AC10). */
export const INVITATIONS_PER_DAY = 20;

/** The longest name on an invitation, in characters, as for a client. */
export const INVITATION_NAME_MAX_LENGTH = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant an invitation sent at `sentAt` stops working: seven times 24 hours later. */
export function invitationExpiry(sentAt: Date): Date {
  return new Date(sentAt.getTime() + INVITATION_VALIDITY_DAYS * DAY_MS);
}

/** The start of the day the quota counts over: the invitations made since it count. */
export function invitationQuotaSince(now: Date): Date {
  return new Date(now.getTime() - DAY_MS);
}

export interface InvitationLanguageSources {
  /** The language the Owner picked for the email; none follows the rest. */
  chosen?: string | null;
  /** The stored language of the account behind the address, if the address has an account. */
  accountPreference?: string | null;
  /** The workspace's default communication language. */
  workspaceDefault: Locale;
}

/**
 * The language of the invitation email (ADR-017, F011 AC2): the one the Owner chose, then the
 * stored preference of the address's account, then the workspace's default. A value that is no
 * catalog language is skipped.
 */
export function invitationLanguage(sources: InvitationLanguageSources): EmailLanguage {
  return resolveCommunicationLanguage({
    recipientPreference: matchLocale(sources.chosen) ?? sources.accountPreference,
    workspaceDefault: sources.workspaceDefault,
  });
}

/** What the database says about an address being invited (F011). */
export interface NewInvitationFacts {
  /** Whether an account with this address already has a team role in the workspace. */
  readonly onTeam: boolean;
  /** The pending invitation of the workspace for this address, expired or not. */
  readonly pending?: { readonly id: string };
  /** How many invitations the workspace made in the last 24 hours, withdrawn ones included. */
  readonly sentInLastDay: number;
}

export type NewInvitationDecision =
  | { readonly outcome: 'invite' }
  | { readonly outcome: 'refused'; readonly reason: 'already_on_team' | 'rate_limited' }
  | {
      readonly outcome: 'refused';
      readonly reason: 'invitation_pending';
      readonly invitationId: string;
    };

/**
 * Whether a new invitation is made (F011 AC8, AC10). Nobody is invited to a team they are on,
 * and an address has one pending invitation at a time (the Owner sends that one again). Only a
 * real new invitation counts against the 20 a day, so a duplicate is told so first.
 */
export function decideNewInvitation(facts: NewInvitationFacts): NewInvitationDecision {
  if (facts.onTeam) return { outcome: 'refused', reason: 'already_on_team' };
  if (facts.pending) {
    return { outcome: 'refused', reason: 'invitation_pending', invitationId: facts.pending.id };
  }
  if (facts.sentInLastDay >= INVITATIONS_PER_DAY) {
    return { outcome: 'refused', reason: 'rate_limited' };
  }
  return { outcome: 'invite' };
}

/** What the database says about an invitation, for the person holding its link. */
export interface InvitationFacts {
  readonly status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  readonly expiresAt: Date;
  /** The address the invitation went to, lower case. */
  readonly email: string;
}

export interface InvitationAnswerFacts {
  readonly invitation: InvitationFacts;
  readonly now: Date;
  /** The signed-in account: its address and whether the person proved it. */
  readonly account: { readonly email: string; readonly emailVerified: boolean };
}

export type InvitationAnswerDecision =
  | { readonly outcome: 'allowed' }
  | { readonly outcome: 'refused'; readonly reason: 'not_valid' | 'wrong_account' };

/** Whether an invitation can still be answered: pending, and not past its expiry (F011 AC6). */
export function isInvitationOpen(
  invitation: Pick<InvitationFacts, 'status' | 'expiresAt'>,
  now: Date,
): boolean {
  return invitation.status === 'pending' && invitation.expiresAt.getTime() > now.getTime();
}

/**
 * Whether the signed-in person may accept or decline (F011 AC3, AC6). A link that is no longer
 * valid (expired, withdrawn, used) is refused for everyone alike, so it reveals nothing about
 * whom it was for; an open one only to the account whose verified address is the invitation's.
 */
export function decideInvitationAnswer(facts: InvitationAnswerFacts): InvitationAnswerDecision {
  const { invitation, now, account } = facts;
  if (!isInvitationOpen(invitation, now)) return { outcome: 'refused', reason: 'not_valid' };
  if (
    !account.emailVerified ||
    normalizeEmail(account.email) !== normalizeEmail(invitation.email)
  ) {
    return { outcome: 'refused', reason: 'wrong_account' };
  }
  return { outcome: 'allowed' };
}
