import type { Locale } from '@fivvi/i18n';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgPolicy,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { instant, timestamps } from './columns.ts';
import { APP_ROLE } from './tenant-policies.ts';
import { teamMembers } from './tenancy.ts';

/** Where an invitation stands: `pending` until the person accepts or declines or the Owner withdraws it. */
export const invitationStatus = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'declined',
  'withdrawn',
]);

/**
 * An invitation to join a workspace's team as a Trainer (F011, spec #422). The Owner types the
 * name and the email address (stored lower case); the person's account, if there is one, is found
 * by the address when they accept. `email_locale` is the language of the email the Owner chose;
 * empty follows the address's account preference, then the workspace default (ADR-017).
 *
 * The token that opens the invitation is never stored, only its hash (`token_hash`, unique), so a
 * leaked table opens nothing; resending rotates it. The expiry is an instant in UTC. A workspace
 * has at most one `pending` invitation per address (a partial unique index); a closed one stays
 * as a row, so the count of the day's invitations (20 a day) cannot be reset by withdrawing.
 *
 * The inviter is a team member of the same workspace. Removing the team member removes their
 * invitations with them (the composite foreign key cascades), as it does their trainer profile.
 */
export const trainerInvitations = businessTable(
  'trainer_invitations',
  {
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailLocale: text('email_locale').$type<Locale>(),
    inviterTeamMemberId: uuid('inviter_team_member_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    sentAt: instant('sent_at').notNull().defaultNow(),
    expiresAt: instant('expires_at').notNull(),
    status: invitationStatus('status').notNull().default('pending'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('trainer_invitations_token_hash_unique').on(table.tokenHash),
    uniqueIndex('trainer_invitations_organization_id_email_pending_unique')
      .on(table.organizationId, table.email)
      .where(sql`${table.status} = 'pending'`),
    index('trainer_invitations_organization_id_created_at_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    foreignKey({
      name: 'trainer_invitations_inviter_fk',
      columns: [table.organizationId, table.inviterTeamMemberId],
      foreignColumns: [teamMembers.organizationId, teamMembers.id],
    }).onDelete('cascade'),
    check(
      'trainer_invitations_name_valid',
      sql`btrim(${table.name}) <> '' AND char_length(${table.name}) <= 120`,
    ),
    // Two narrow doors for a person who is not on the team (F011), each opened by a setting that
    // only the repositories of this table make, in their own transaction (`app_invitation_*()`,
    // migration 0020). By token: the invitation whose token hash the context names, to read and
    // lock it. By address: the sign-in gate asks whether an address has a pending invitation.
    // Read-only; closing an invitation happens in the workspace's context, after the door found it.
    pgPolicy('trainer_invitations_by_token', {
      as: 'permissive',
      for: 'select',
      to: APP_ROLE,
      using: sql`${table.tokenHash} = app_invitation_token_hash()`,
    }),
    pgPolicy('trainer_invitations_by_email', {
      as: 'permissive',
      for: 'select',
      to: APP_ROLE,
      using: sql`${table.email} = app_invitation_email()`,
    }),
    check('trainer_invitations_email_lowercase', sql`${table.email} = lower(${table.email})`),
    check(
      'trainer_invitations_email_locale_supported',
      sql`${table.emailLocale} IS NULL OR ${table.emailLocale} IN ('nl-NL', 'en')`,
    ),
  ],
);

export type TrainerInvitation = typeof trainerInvitations.$inferSelect;
