# Data inventory

<!-- Generated from packages/domain/src/privacy by `pnpm --filter @fivvi/domain generate:privacy`. Do not edit by hand: a test fails when this file differs from the registry. -->

Which personal data Fivvi stores, per table, how an export and a deletion treat it, and for how long it is kept. It is the source for the App Store privacy details and the Google Play data safety form (`RELEASE.md §9`). A feature that adds a table declares it in the privacy registry in the same PR ([`TESTING.md §3`](TESTING.md)).

Periods come from [`retention-policy.md`](../legal/retention-policy.md) §2. A period of days counts 24 hours of UTC time, a period of months calendar months in UTC.

## Client data

Deleted or anonymised when a client is deleted.

| Table | Personal data | Export carries | Deletion | Retention | Note |
|---|---|---|---|---|---|
| `clients` | `name`, `email`, `email_locale`, `account_id` | `id`, `account_id`, `name`, `email`, `email_locale`, `created_at`, `updated_at` | Deleted | 30 days after the client was moved to the trash | The client record of a workspace. A deleted client stays restorable in the trash for the period, then the row is deleted (R6). |
| `session_participants` | `client_id`, `attendance_status` | `id`, `session_id`, `client_id`, `attendance_status`, `agreement_id`, `created_at`, `updated_at` | Anonymised | 30 days after the client was moved to the trash | A client’s place in a session. After the client is purged the row stays without the link to her, as a count such as “1 participant, attended” (R6). |

## Account data

Deleted when a person deletes the account.

| Table | Personal data | Export carries | Deletion | Retention | Note |
|---|---|---|---|---|---|
| `auth_users` | `name`, `email`, `preferred_locale`, `booking_emails` | Not exported | Deleted | 24 months after the account's last sign-in, booking or team membership | The sign-in of a person. Deleted at once when the person deletes the account, and 30 days after the warning email that follows 24 months without a sign-in (R10). Not part of a workspace export: a workspace holds its own client and team records. |
| `auth_sessions` | `user_id`, `ip_address`, `user_agent` | Not exported | Deleted | 30 days after the sign-in session was last used | A signed-in browser or app. Deleted with the account; an expired session is deleted by a daily task (R10). |
| `auth_identities` | `user_id`, `account_id` | Not exported | Deleted | Until deleted | How an account signs in. Deleted with the account. |
| `auth_verifications` | `identifier`, `locale` | Not exported | Deleted | 24 hours after the sign-in link or code expired or was used | An emailed sign-in link and code (only hashes of them are stored). Deleted after the period, counted from expiry or use (R2). |
| `auth_rate_limits` | `key` | Not exported | Deleted | 24 hours after the row was written | A counter per keyed hash of an email or IP address; the table holds neither (R14). |

## Team data

Ends when a team member leaves a workspace or deletes the account.

| Table | Personal data | Export carries | Deletion | Retention | Note |
|---|---|---|---|---|---|
| `team_members` | `account_id` | `id`, `account_id`, `role`, `created_at`, `updated_at` | Deleted | Until deleted | The role of an account in a workspace. Deleted when the membership ends (F003), which is also what deleting the account does. |
| `trainer_profiles` | `team_member_id` | `id`, `team_member_id`, `created_at`, `updated_at` | Deleted | Until deleted | Who trains in a workspace. Deleted with the team member. |
| `trainer_invitations` | `name`, `email`, `email_locale`, `inviter_team_member_id` | `id`, `name`, `email`, `email_locale`, `inviter_team_member_id`, `sent_at`, `expires_at`, `status`, `created_at`, `updated_at` | Deleted | 30 days after the invitation expired, was withdrawn or was accepted | An invitation to join a team. Only the hash of its link is stored, and never exported (R3). |
| `group_classes` | `default_trainer_profile_id` | `id`, `name_nl`, `name_en`, `description_nl`, `description_en`, `default_trainer_profile_id`, `capacity`, `duration_minutes`, `archived_at`, `created_at`, `updated_at` | Anonymised | 24 months after the trainer's team membership ended | A class. Without its usual trainer once the trainer’s profile is removed; the class itself stays with the workspace. |
| `sessions` | `trainer_profile_id`, `created_by_team_member_id`, `updated_by_team_member_id` | `id`, `type`, `status`, `trainer_profile_id`, `location_id`, `starts_at`, `ends_at`, `capacity`, `series_id`, `group_class_id`, `version`, `created_by_team_member_id`, `updated_by_team_member_id`, `created_at`, `updated_at` | Anonymised | 24 months after the trainer's team membership ended | A scheduled session. The links to the trainer and to who planned it or changed it last are cleared when the team member is removed; the session stays as the workspace’s record (R9). |

## Workspace data

Deleted when a terminated workspace is purged.

| Table | Personal data | Export carries | Deletion | Retention | Note |
|---|---|---|---|---|---|
| `organizations` | `name`, `slug` | `id`, `name`, `slug`, `default_locale`, `time_zone`, `created_at`, `updated_at` | Deleted | 60 days after the workspace was terminated | The trading name of a workspace can be a person’s name. Deleted when a terminated workspace is purged (R11). |
| `locations` | `name`, `postcode`, `house_number`, `house_number_addition`, `street`, `city` | `id`, `name`, `type`, `postcode`, `house_number`, `house_number_addition`, `street`, `city`, `is_default`, `created_at`, `updated_at` | Deleted | 60 days after the workspace was terminated | Where sessions take place; the address can be a trainer’s home. Deleted when a terminated workspace is purged (R11). |

## Tables without personal data

| Table | Why |
|---|---|
| `job_runs` | The cron job’s run records: task name, times and outcome, never content. A daily task deletes rows after 90 days (E012). |
| `system_greetings` | System data read by every workspace: the i18n key of a greeting (M1). |

## Retention periods

| Constant | Policy | Period |
|---|---|---|
| `SIGN_IN_TOKEN_AFTER_EXPIRY` | R2 | 24 hours |
| `TRAINER_INVITATION_AFTER_CLOSING` | R3 | 30 days |
| `TRASH` | R6 | 30 days |
| `CLIENT_REVIEW_AFTER_INACTIVITY` | R5 | 24 months |
| `REVIEW_ANSWER` | R5 | 30 days |
| `ACCOUNT_INACTIVITY` | R10 | 24 months |
| `ACCOUNT_WARNING` | R10 | 30 days |
| `SIGN_IN_SESSION_AFTER_LAST_USE` | R10 | 30 days |
| `FORMER_TRAINER` | R9 | 24 months |
| `ACCESS_LOG` | R12 | 12 months |
| `RATE_LIMIT` | R14 | 24 hours |
| `DELETION_LOG` | §3.5 | 30 days |
| `INVOICE` | R21 | 7 years after the end of the year |
| `WORKSPACE_EXPORT_WINDOW` | R11 | 30 days |
| `WORKSPACE_PURGE` | R11 | 60 days |
