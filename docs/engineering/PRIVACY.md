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
| `client_billing_details` | `client_id`, `company_name`, `street`, `house_number`, `house_number_addition`, `postcode`, `city`, `vat_number` | `id`, `client_id`, `as_company`, `company_name`, `street`, `house_number`, `house_number_addition`, `postcode`, `city`, `vat_number`, `changed_by`, `created_at`, `updated_at` | Deleted | 30 days after the client was moved to the trash | The company a client wants invoices made out to (CW-04): name, address and VAT number, which can be a sole trader’s own. Deleted with the client when she is purged (R6). An issued invoice keeps its own copy of the buyer for the invoice period (R21). |
| `access_log` | `actor_team_member_id`, `subject_client_id` | `id`, `actor_team_member_id`, `action`, `subject_client_id`, `object_id`, `occurred_at`, `created_at`, `updated_at` | Kept for the law | 12 months after the entry was written | Who exported, trashed, restored or purged which client, and from M7 who viewed or changed which note (the note’s ID, never its content). IDs and a time only; the Owner reads it with the names resolved at read time (R12). The entries are write-once and stay unchanged, also when the client is purged or the team member leaves: the ID then no longer leads to a person and the reader shows “Deleted client”. “Kept for the law” here means the record of who did what is kept as it was written until the period ends; then a daily task deletes it. |
| `payment_customers` | `client_id`, `provider_customer_id` | `id`, `client_id`, `provider_customer_id`, `created_at`, `updated_at` | Deleted | 30 days after the client was moved to the trash | The payment provider’s customer of a client (a reference, no name or email is stored here). Deleted with the client when she is purged (R6); the provider’s own customer is theirs to remove. |
| `payments` | `client_id`, `amount_cents`, `provider_payment_id`, `provider_mandate_id` | `id`, `client_id`, `kind`, `purpose`, `purpose_reference_id`, `business_key`, `amount_cents`, `currency`, `description`, `supplied`, `provider_payment_id`, `provider_mandate_id`, `status`, `testmode`, `created_at`, `updated_at` | Kept for the law | 7 years after the end of the year after the invoice was issued | A payment of a client: references, amount and status, never card or bank account numbers. Kept for the statutory period like the invoice it belongs to, also when the client asks for deletion (R21). Which retention rule payments follow is to be confirmed in the legal follow-up of E019 (spec #466); until then the invoice period is the cautious one. |
| `payment_status_changes` | `client_id`, `provider_event_id` | `id`, `payment_id`, `client_id`, `from_status`, `to_status`, `occurred_at`, `source`, `provider_event_id`, `created_at`, `updated_at` | Kept for the law | 7 years after the end of the year after the invoice was issued | The append-only status lines of a payment; kept as long as the payment is (R21), and never rewritten. |
| `payment_refunds` | `client_id`, `amount_cents`, `reason`, `provider_refund_id`, `requested_by_team_member_id` | `id`, `payment_id`, `client_id`, `amount_cents`, `revoke_credits`, `provider_refund_id`, `status`, `created_at`, `updated_at` | Kept for the law | 7 years after the end of the year after the invoice was issued | A refund of a payment of a client (F060): amount, status and the provider’s reference. Kept as long as the payment is (R21). The internal reason the Owner wrote stays out of a client’s export, because it is the Owner’s note about the refund; the link to the team member who asked is cleared when that person leaves the team. |
| `payment_refund_status_changes` | `client_id`, `provider_event_id` | `id`, `refund_id`, `client_id`, `from_status`, `to_status`, `occurred_at`, `source`, `provider_event_id`, `created_at`, `updated_at` | Kept for the law | 7 years after the end of the year after the invoice was issued | The append-only status lines of a refund; kept as long as the refund is (R21), and never rewritten. |
| `payment_chargebacks` | `client_id`, `amount_cents`, `provider_chargeback_id`, `bank_reason` | `id`, `payment_id`, `client_id`, `provider_chargeback_id`, `amount_cents`, `bank_reason`, `received_at`, `created_at`, `updated_at` | Kept for the law | 7 years after the end of the year after the invoice was issued | A reversal (terugboeking) of a payment by the client’s bank (F060): amount, the bank’s reason code and the provider’s reference. Kept as long as the payment is (R21). |

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
| `class_series` | `trainer_profile_id` | `id`, `group_class_id`, `rrule`, `local_start_time`, `duration_minutes`, `time_zone`, `trainer_profile_id`, `capacity`, `starts_on`, `ends_on`, `materialized_until`, `version`, `created_at`, `updated_at` | Anonymised | 24 months after the trainer's team membership ended | A weekly series of a class (F022). Without its usual trainer once the trainer’s profile is removed; the series stays with the workspace, as its dates do. |
| `sessions` | `trainer_profile_id`, `created_by_team_member_id`, `updated_by_team_member_id` | `id`, `type`, `status`, `trainer_profile_id`, `location_id`, `starts_at`, `ends_at`, `capacity`, `series_id`, `occurrence_date`, `detached_fields`, `group_class_id`, `version`, `created_by_team_member_id`, `updated_by_team_member_id`, `created_at`, `updated_at` | Anonymised | 24 months after the trainer's team membership ended | A scheduled session. The links to the trainer and to who planned it or changed it last are cleared when the team member is removed; the session stays as the workspace’s record (R9). |

## Workspace data

Deleted when a terminated workspace is purged.

| Table | Personal data | Export carries | Deletion | Retention | Note |
|---|---|---|---|---|---|
| `organizations` | `name`, `slug` | `id`, `name`, `slug`, `default_locale`, `time_zone`, `created_at`, `updated_at` | Deleted | 60 days after the workspace was terminated | The trading name of a workspace can be a person’s name. Deleted when a terminated workspace is purged (R11). |
| `workspace_invoice_details` | `legal_name`, `street`, `house_number`, `house_number_addition`, `postcode`, `city`, `kvk_number`, `vat_number`, `question_email` | `id`, `legal_name`, `street`, `house_number`, `house_number_addition`, `postcode`, `city`, `kvk_number`, `vat_number`, `question_email`, `no_vat`, `created_at`, `updated_at` | Deleted | 60 days after the workspace was terminated | The seller on every invoice of the workspace: the legal name, address, KvK and VAT number, which can be a sole trader’s own, and the email for invoice questions. Deleted when a terminated workspace is purged (R11). An issued invoice keeps its own copy of these details. |
| `locations` | `name`, `postcode`, `house_number`, `house_number_addition`, `street`, `city` | `id`, `name`, `type`, `postcode`, `house_number`, `house_number_addition`, `street`, `city`, `is_default`, `created_at`, `updated_at` | Deleted | 60 days after the workspace was terminated | Where sessions take place; the address can be a trainer’s home. Deleted when a terminated workspace is purged (R11). |
| `deletion_log` | `record_id` | Not exported | Kept for the law | 30 days after the entry was written | The table name and record ID of every hard deletion and anonymization, with the workspace and the time, so a restore of a backup can re-apply them (retention policy §3.5). No content. Platform data of the cron role, not part of an export. The entries are write-once and stay unchanged, also when the client, the person or the whole workspace is deleted, because a restore of a backup made before the deletion has to re-apply them; a daily task deletes each entry when the period ends. |

## Tables without personal data

| Table | Why |
|---|---|
| `job_runs` | The cron job’s run records: task name, times and outcome, never content. A daily task deletes rows after 90 days (E012). |
| `system_greetings` | System data read by every workspace: the i18n key of a greeting (M1). |
| `exercise_library` | The exercise library, the same for every workspace: an exercise’s key, type, muscle groups and search aliases (F039). The names are in `packages/i18n`. Nothing about any workspace or person. |
| `offers` | An offer of a workspace: its kind, status and origin, and which version is current (F052). Prices and terms, nothing about a person. Kept as long as the workspace is; an offer is archived, never deleted. |
| `offer_versions` | An immutable version of an offer: names, descriptions, the price in euro cents, the VAT rate and the terms of its kind (F052). Nothing about a person: the offer’s text is the owner’s, written for clients in general. Never changed or deleted: a trigger refuses it for every role, so every price a client ever agreed to stays explainable. |
| `payouts` | A payout of the workspace: the provider’s settlement ID, the bank reference, the date, the amount and the status (F061). The gym’s own money, nothing about a person. Kept as long as the workspace is. |
| `payout_status_changes` | The append-only status lines of a payout (F061): which status it had and when it was fetched. Nothing about a person; a trigger refuses every update and delete. |
| `payout_lines` | A line of a payout: the provider’s ID of a payment, refund, reversal or fee, its signed amount and the description the provider reports (F061). The description is the one Fivvi sent with the payment or refund, which E019 keeps free of notes and health content; the line holds no client ID, only the link to the payment it was matched to, and the payment’s own declaration decides what deleting a client does to it. It is declared as not personal because the line is the workspace’s accounting record of a payout and cannot be found, exported or deleted per client; the provider’s payment ID and the amount it carries are also kept by `payments`, which is kept for the law (R21). Whether the payout records need a retention rule of their own is part of the legal follow-up of E019 (spec #466). |

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
