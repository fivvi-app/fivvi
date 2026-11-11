import type { RetentionKey } from './retention.ts';

/**
 * The privacy registry (E014, spec #477): the one place where every table says what an export
 * and a deletion do to it. Deleting a client, deleting an account, the workspace export and the
 * data inventory `docs/engineering/PRIVACY.md` all read it, and a test fails when a table of the
 * schema is missing from it, so a later feature can't add personal data that deletion forgets.
 *
 * A feature that adds a table declares it here in the same PR. Fields are database column names.
 */

/** Whose data a row is: the person that asks for the export or the deletion. */
export type PrivacySubject = 'client' | 'account' | 'team_member' | 'workspace';

/**
 * What deleting the subject does to the row: `delete` removes it, `anonymize` keeps the row
 * without the link to the person (only a count remains), `keep-for-law` keeps it unchanged for
 * the period of its retention constant (invoices: tax law).
 */
export type PrivacyDeletion = 'delete' | 'anonymize' | 'keep-for-law';

interface PersonalDataDeclaration {
  readonly table: string;
  readonly personal: true;
  readonly subject: PrivacySubject;
  /** The columns that hold personal data (or lead to a person): the data inventory lists them. */
  readonly personalData: readonly string[];
  /**
   * Columns that look like a link to a person (`*_team_member_id`, `*_account_id`, `*_client_id`,
   * `*_user_id`, `*_trainer_profile_id`) and are left out of `personalData` on purpose, each with
   * the reason. A test fails for such a column that is in neither.
   */
  readonly leftOut?: Readonly<Record<string, string>>;
  /** The columns an export carries; empty when no export carries the table. */
  readonly export: readonly string[];
  /** For the inventory: how the table is reached, what stays and why. Plain English, no copy shown to a user. */
  readonly note: string;
}

/** A table with a timer or a legal period names the constant of `RETENTION` that it follows. */
export type PrivacyDeclaration =
  | (PersonalDataDeclaration & {
      readonly onDelete: 'delete' | 'anonymize';
      readonly retention?: RetentionKey;
    })
  | (PersonalDataDeclaration & {
      readonly onDelete: 'keep-for-law';
      readonly retention: RetentionKey;
    })
  | {
      readonly table: string;
      readonly personal: false;
      /** Why the table holds no personal data. */
      readonly reason: string;
    };

const TIMESTAMPS = ['created_at', 'updated_at'] as const;

export const PRIVACY_REGISTRY: readonly PrivacyDeclaration[] = [
  // Platform tables: the global account of a person (F001, ADR-007).
  {
    table: 'auth_users',
    personal: true,
    subject: 'account',
    personalData: ['name', 'email', 'preferred_locale', 'booking_emails'],
    export: [],
    onDelete: 'delete',
    retention: 'ACCOUNT_INACTIVITY',
    note: 'The sign-in of a person. Deleted at once when the person deletes the account, and 30 days after the warning email that follows 24 months without a sign-in (R10). Not part of a workspace export: a workspace holds its own client and team records.',
  },
  {
    table: 'auth_sessions',
    personal: true,
    subject: 'account',
    personalData: ['user_id', 'ip_address', 'user_agent'],
    export: [],
    onDelete: 'delete',
    retention: 'SIGN_IN_SESSION_AFTER_LAST_USE',
    note: 'A signed-in browser or app. Deleted with the account; an expired session is deleted by a daily task (R10).',
  },
  {
    table: 'auth_identities',
    personal: true,
    subject: 'account',
    personalData: ['user_id', 'account_id'],
    export: [],
    onDelete: 'delete',
    note: 'How an account signs in. Deleted with the account.',
  },
  {
    table: 'auth_verifications',
    personal: true,
    subject: 'account',
    personalData: ['identifier', 'locale'],
    export: [],
    onDelete: 'delete',
    retention: 'SIGN_IN_TOKEN_AFTER_EXPIRY',
    note: 'An emailed sign-in link and code (only hashes of them are stored). Deleted after the period, counted from expiry or use (R2).',
  },
  {
    table: 'auth_rate_limits',
    personal: true,
    subject: 'account',
    personalData: ['key'],
    export: [],
    onDelete: 'delete',
    retention: 'RATE_LIMIT',
    note: 'A counter per keyed hash of an email or IP address; the table holds neither (R14).',
  },
  {
    table: 'job_runs',
    personal: false,
    reason:
      'The cron job’s run records: task name, times and outcome, never content. A daily task deletes rows after 90 days (E012).',
  },
  {
    table: 'system_greetings',
    personal: false,
    reason: 'System data read by every workspace: the i18n key of a greeting (M1).',
  },
  // The workspace.
  {
    table: 'organizations',
    personal: true,
    subject: 'workspace',
    personalData: ['name', 'slug'],
    export: ['id', 'name', 'slug', 'default_locale', 'time_zone', ...TIMESTAMPS],
    onDelete: 'delete',
    retention: 'WORKSPACE_PURGE',
    note: 'The trading name of a workspace can be a person’s name. Deleted when a terminated workspace is purged (R11).',
  },
  // Team.
  {
    table: 'team_members',
    personal: true,
    subject: 'team_member',
    personalData: ['account_id'],
    export: ['id', 'account_id', 'role', ...TIMESTAMPS],
    onDelete: 'delete',
    note: 'The role of an account in a workspace. Deleted when the membership ends (F003), which is also what deleting the account does.',
  },
  {
    table: 'trainer_profiles',
    personal: true,
    subject: 'team_member',
    personalData: ['team_member_id'],
    export: ['id', 'team_member_id', ...TIMESTAMPS],
    onDelete: 'delete',
    note: 'Who trains in a workspace. Deleted with the team member.',
  },
  {
    table: 'trainer_invitations',
    personal: true,
    subject: 'team_member',
    personalData: ['name', 'email', 'email_locale', 'inviter_team_member_id'],
    export: [
      'id',
      'name',
      'email',
      'email_locale',
      'inviter_team_member_id',
      'sent_at',
      'expires_at',
      'status',
      ...TIMESTAMPS,
    ],
    onDelete: 'delete',
    retention: 'TRAINER_INVITATION_AFTER_CLOSING',
    note: 'An invitation to join a team. Only the hash of its link is stored, and never exported (R3).',
  },
  // Clients.
  {
    table: 'clients',
    personal: true,
    subject: 'client',
    personalData: ['name', 'email', 'email_locale', 'account_id'],
    export: ['id', 'account_id', 'name', 'email', 'email_locale', ...TIMESTAMPS],
    onDelete: 'delete',
    retention: 'TRASH',
    note: 'The client record of a workspace. A deleted client stays restorable in the trash for the period, then the row is deleted (R6).',
  },
  {
    table: 'session_participants',
    personal: true,
    subject: 'client',
    personalData: ['client_id', 'attendance_status'],
    export: ['id', 'session_id', 'client_id', 'attendance_status', 'agreement_id', ...TIMESTAMPS],
    onDelete: 'anonymize',
    retention: 'TRASH',
    note: 'A client’s place in a session. After the client is purged the row stays without the link to her, as a count such as “1 participant, attended” (R6).',
  },
  // Places, classes and sessions.
  {
    table: 'locations',
    personal: true,
    subject: 'workspace',
    personalData: ['name', 'postcode', 'house_number', 'house_number_addition', 'street', 'city'],
    export: [
      'id',
      'name',
      'type',
      'postcode',
      'house_number',
      'house_number_addition',
      'street',
      'city',
      'is_default',
      ...TIMESTAMPS,
    ],
    onDelete: 'delete',
    retention: 'WORKSPACE_PURGE',
    note: 'Where sessions take place; the address can be a trainer’s home. Deleted when a terminated workspace is purged (R11).',
  },
  {
    table: 'group_classes',
    personal: true,
    subject: 'team_member',
    personalData: ['default_trainer_profile_id'],
    export: [
      'id',
      'name_nl',
      'name_en',
      'description_nl',
      'description_en',
      'default_trainer_profile_id',
      'capacity',
      'duration_minutes',
      'archived_at',
      ...TIMESTAMPS,
    ],
    onDelete: 'anonymize',
    retention: 'FORMER_TRAINER',
    note: 'A class. Without its usual trainer once the trainer’s profile is removed; the class itself stays with the workspace.',
  },
  {
    table: 'sessions',
    personal: true,
    subject: 'team_member',
    personalData: ['trainer_profile_id', 'created_by_team_member_id', 'updated_by_team_member_id'],
    export: [
      'id',
      'type',
      'status',
      'trainer_profile_id',
      'location_id',
      'starts_at',
      'ends_at',
      'capacity',
      'series_id',
      'group_class_id',
      'version',
      'created_by_team_member_id',
      'updated_by_team_member_id',
      ...TIMESTAMPS,
    ],
    onDelete: 'anonymize',
    retention: 'FORMER_TRAINER',
    note: 'A scheduled session. The links to the trainer and to who planned it or changed it last are cleared when the team member is removed; the session stays as the workspace’s record (R9).',
  },
  // The two logs of the privacy tooling (E014, ticket #1173): IDs and times, never content.
  {
    table: 'access_log',
    personal: true,
    subject: 'client',
    personalData: ['actor_team_member_id', 'subject_client_id'],
    export: [
      'id',
      'actor_team_member_id',
      'action',
      'subject_client_id',
      'object_id',
      'occurred_at',
      ...TIMESTAMPS,
    ],
    onDelete: 'keep-for-law',
    retention: 'ACCESS_LOG',
    note: 'Who exported, trashed, restored or purged which client, and from M7 who viewed or changed which note (the note’s ID, never its content). IDs and a time only; the Owner reads it with the names resolved at read time (R12). The entries are write-once and stay unchanged, also when the client is purged or the team member leaves: the ID then no longer leads to a person and the reader shows “Deleted client”. “Kept for the law” here means the record of who did what is kept as it was written until the period ends; then a daily task deletes it.',
  },
  {
    table: 'deletion_log',
    personal: true,
    subject: 'workspace',
    personalData: ['record_id'],
    export: [],
    onDelete: 'keep-for-law',
    retention: 'DELETION_LOG',
    note: 'The table name and record ID of every hard deletion and anonymization, with the workspace and the time, so a restore of a backup can re-apply them (retention policy §3.5). No content. Platform data of the cron role, not part of an export. The entries are write-once and stay unchanged, also when the client, the person or the whole workspace is deleted, because a restore of a backup made before the deletion has to re-apply them; a daily task deletes each entry when the period ends.',
  },
  // Payments (E019, ADR-020): references, amounts and statuses; the provider holds the payment data.
  {
    table: 'payment_customers',
    personal: true,
    subject: 'client',
    personalData: ['client_id', 'provider_customer_id'],
    export: ['id', 'client_id', 'provider_customer_id', ...TIMESTAMPS],
    onDelete: 'delete',
    retention: 'TRASH',
    note: 'The payment provider’s customer of a client (a reference, no name or email is stored here). Deleted with the client when she is purged (R6); the provider’s own customer is theirs to remove.',
  },
  {
    table: 'payments',
    personal: true,
    subject: 'client',
    personalData: ['client_id', 'amount_cents', 'provider_payment_id', 'provider_mandate_id'],
    export: [
      'id',
      'client_id',
      'kind',
      'purpose',
      'purpose_reference_id',
      'business_key',
      'amount_cents',
      'currency',
      'description',
      'supplied',
      'provider_payment_id',
      'provider_mandate_id',
      'status',
      'testmode',
      ...TIMESTAMPS,
    ],
    onDelete: 'keep-for-law',
    retention: 'INVOICE',
    note: 'A payment of a client: references, amount and status, never card or bank account numbers. Kept for the statutory period like the invoice it belongs to, also when the client asks for deletion (R21). Which retention rule payments follow is to be confirmed in the legal follow-up of E019 (spec #466); until then the invoice period is the cautious one.',
  },
  {
    table: 'payment_status_changes',
    personal: true,
    subject: 'client',
    personalData: ['client_id', 'provider_event_id'],
    export: [
      'id',
      'payment_id',
      'client_id',
      'from_status',
      'to_status',
      'occurred_at',
      'source',
      'provider_event_id',
      ...TIMESTAMPS,
    ],
    onDelete: 'keep-for-law',
    retention: 'INVOICE',
    note: 'The append-only status lines of a payment; kept as long as the payment is (R21), and never rewritten.',
  },
];

const BY_TABLE: ReadonlyMap<string, PrivacyDeclaration> = new Map(
  PRIVACY_REGISTRY.map((declaration) => [declaration.table, declaration]),
);

/** The declaration of a table, `undefined` when it has none. */
export function declaredTable(table: string): PrivacyDeclaration | undefined {
  return BY_TABLE.get(table);
}

/** The tables of the schema (`schemaTables`, database names) that the registry does not declare. */
export function tablesMissingFromRegistry(schemaTables: readonly string[]): string[] {
  return schemaTables.filter((table) => !BY_TABLE.has(table)).sort();
}

/** The declarations whose table is not in the schema any more. */
export function tablesNotInSchema(schemaTables: readonly string[]): string[] {
  const present = new Set(schemaTables);
  return PRIVACY_REGISTRY.filter((declaration) => !present.has(declaration.table))
    .map((declaration) => declaration.table)
    .sort();
}
