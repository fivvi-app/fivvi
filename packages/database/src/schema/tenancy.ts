import type { Locale } from '@fivvi/i18n';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgEnum,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authUsers } from './auth.ts';
import { businessTable } from './business-table.ts';
import { timestamps } from './columns.ts';

/**
 * What a team member is in a workspace (`GLOSSARY.md`, `PRODUCT.md §9`). Being a client is not a
 * role: it is a row in `clients`.
 *
 * Adding a role later (Admin, Release 7.0) is one additive migration, which leaves every
 * existing row and policy alone: `ALTER TYPE team_role ADD VALUE 'admin'` (a custom migration:
 * `pnpm db:generate --custom --name team_role_admin`), then add the value here. The tenancy
 * integration test runs exactly that statement.
 */
export const teamRole = pgEnum('team_role', ['owner', 'trainer']);

/**
 * The team role of an account in a workspace (E011; F003 and F004 own the flows that create,
 * change and end it). At most one per account and workspace. The same account may also be a
 * client of the same workspace, in `clients`: the two are separate rows (`PRODUCT.md §9`).
 */
export const teamMembers = businessTable(
  'team_members',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => authUsers.id),
    role: teamRole('role').notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('team_members_organization_id_account_id_unique').on(
      table.organizationId,
      table.accountId,
    ),
    index('team_members_account_id_idx').on(table.accountId),
  ],
  { accountColumn: 'accountId' },
);

/**
 * The client record of a workspace (E011 created the minimal shape; F006 adds the profile). The
 * account link is optional: a client added by hand has no account yet (`PRODUCT.md §34`), and one
 * whose email address belongs to an account is linked to it (`PRODUCT.md §2.9`). At most one
 * client relationship per account and workspace, and one client per email address and workspace.
 *
 * `email` is required (every client has one, spec #174 decision 5, 2 November 2026) and lower
 * case (the API stores it so, the check holds the line): two clients with different addresses
 * may share a name. `email_locale` is the language for emails the team set;
 * empty follows the workspace default (ADR-017).
 */
export const clients = businessTable(
  'clients',
  {
    accountId: uuid('account_id').references(() => authUsers.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailLocale: text('email_locale').$type<Locale>(),
    ...timestamps(),
  },
  (table) => [
    unique('clients_organization_id_account_id_unique').on(table.organizationId, table.accountId),
    uniqueIndex('clients_organization_id_email_unique').on(table.organizationId, table.email),
    index('clients_account_id_idx').on(table.accountId),
    check(
      'clients_name_valid',
      sql`btrim(${table.name}) <> '' AND char_length(${table.name}) <= 120`,
    ),
    check('clients_email_lowercase', sql`${table.email} = lower(${table.email})`),
    check(
      'clients_email_locale_supported',
      sql`${table.emailLocale} IS NULL OR ${table.emailLocale} IN ('nl-NL', 'en')`,
    ),
  ],
  // A client route sees only its own client row (Q2); `id` is the client's id.
  { accountColumn: 'accountId', clientColumn: 'id' },
);

/**
 * Who trains in a workspace (F005): a row means "this team member trains here", and holds nothing
 * else in M2. Every Trainer has one; an Owner has one when they also train, and only they switch it.
 * The composite foreign key removes it with the team-member record (F003's removal), so the account
 * and its name stay and nothing of a removed person's training is left behind.
 */
export const trainerProfiles = businessTable(
  'trainer_profiles',
  {
    teamMemberId: uuid('team_member_id').notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('trainer_profiles_team_member_id_unique').on(table.teamMemberId),
    foreignKey({
      name: 'trainer_profiles_team_member_fk',
      columns: [table.organizationId, table.teamMemberId],
      foreignColumns: [teamMembers.organizationId, teamMembers.id],
    }).onDelete('cascade'),
  ],
);

export type TeamMember = typeof teamMembers.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type TrainerProfile = typeof trainerProfiles.$inferSelect;
