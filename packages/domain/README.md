# @fivvi/domain

Business rules (`docs/product/PRODUCT.md`), server-side and pure: no I/O, no framework imports, no clock of its own (a rule that needs "now" takes an injected `Clock`, `@fivvi/testing/clock`). The one exception is the import dry-run CLI (`src/import/cli.ts` and `src/import/workspace-fixtures.ts`, E015 spec #478): a dev tool that reads a file and talks to a scratch database on the local Postgres; no rule imports from them and `src/index.ts` does not export them. `packages/api` calls the rules; web, iOS and Android never re-implement one (`CODING_STANDARDS.md`). Tested next to the code, through the exported interface.

```ts
import { canCreateWorkspace, slugCandidates, WORKSPACE_DEFAULTS } from '@fivvi/domain';

canCreateWorkspace({ email, signUpAllowlist }); // F002, F012: on the sign-up allowlist
for (const slug of slugCandidates("John's Gym")) {
  // 'johns-gym', 'johns-gym-2', … without the reserved words; take the first the database accepts
}
```

| Module | What | Spec |
|---|---|---|
| `src/workspaces/can-create.ts` | Who may create a workspace: on the sign-up allowlist (F001) alone, also with a workspace already (F012) | F002 AC5, F012 AC8, AC9 |
| `src/workspaces/slug.ts` | The URL name from a workspace name: transliterate, lower case, hyphens, a number when taken, reserved words skipped | F002 AC2 |
| `src/team/last-owner.ts` | A workspace keeps at least one Owner: whether a removal (F004: a role change) leaves one | F003 AC7 |
| `src/team/trainer-invitation.ts` | Inviting a trainer: valid for 7 days, 20 invitations a day, one pending per address, not for someone on the team, and the language of the email (chosen, then the address's account, then the workspace default) | F011 AC1, AC2, AC8, AC10 |
| `src/clients/new-client.ts` | A new client: the email address stored lower case, whether it is a duplicate of a client of the workspace, and which account it is linked to | F006 AC2–AC4, AC9 |
| `src/clients/edit-client.ts` | An edited client: whether the new email address is a duplicate of another client of the workspace, and which account the link follows | F006 AC7, AC8 |
| `src/locations/address.ts` | A location's address: the Dutch postcode normalized to `1234 AB`, the house number of one to five digits, all or nothing | F015 AC15 |
| `src/locations/default-location.ts` | The location types of `PRODUCT.md §12`, the 120-character name limit and `defaultLocation(workspace)`, the one location every session takes | F015, F016 |
| `src/scheduling/zoned-time.ts` | A wall-clock date and time in a time zone to a UTC instant, and an instant back to the wall clock (ADR-012): a time the clocks skip does not exist, a repeated one takes the earlier instant and says so | F020 AC4 |
| `src/scheduling/group-class.ts` | A class on a date (F021): `scheduleClassOnDate` copies the class's trainer (or none), capacity and duration onto the date, takes the default location and the DST rules of `zoned-time.ts`; `decideGroupDateEdit` edits one date's day, start, end and capacity (an end not after the start is refused); `GROUP_CLASS_LIMITS` (name 80, description 500, capacity 1–100, duration 15–240 in steps of 5) | F021 AC3–AC5, AC9 |
| `src/scheduling/private-session.ts` | Planning a private session: who may plan for whom (`session.private.manage.own` / `.any`), the start and end as UTC instants, durations of 15 to 240 minutes in steps of 5, the default location, a past session flagged; whether EM-11 goes out (asked for, not in the past) and its language (the client's, then the workspace default). `reschedulePrivateSession` moves one: the Owner any session, a Trainer their own, the same time rules, the location kept, a stale version or a cancelled session refused, whether EM-04 goes out (asked for, new time not in the past). **The seam for later session specs**: group classes (F021) and Open Gym (F034) add their own planning functions beside it over the same session record | F020 AC1–AC8 |
| `src/commerce/offers.ts` | Offers: `validateOffer` per kind (membership, credit pack, credit plan, single class pass) with the bounds of `OFFER_LIMITS` and a field-level reason for each invalid value, one credit kind per credit offer, a term over 12 months only with the confirmation flag, amounts as whole cents and VAT as 2100 or 900 basis points; `summarise` (the one-line summary) and `cancellationSentence` in Dutch and English from `packages/i18n` (`offers.*`), `formatEuros` (`€ 79,00` / `€79.00`) and `formatVatRate` (`21 %` / `21%`) | F052 AC4, AC7, AC8, AC10, AC16 |
| `src/import/` | The importer of the data import (E015, spec #478), pure functions over text and rows: `parseWorkbook(bytes)` (an `.xlsx`, via `read-excel-file`) and `parseCsvFiles({ clients: text })` give the same `ParsedImport` (sheets with a header and numbered rows; a file over 5 MB, one that unpacks to over 50 MB or with more than 5,000 rows is refused with an `ImportFileError`); `checkImport(parsed, workspace)` checks the `clients` sheet against a read-only `WorkspaceSnapshot` (required columns, no column outside the template, no header twice (an error), a column with data but no header name is reported by its letter and not imported (a warning), `client_key` and email unique, every client has a valid email, `language`, `status` and `trainer_email`) and gives problems with sheet, row, column, type and severity; `planImport` counts the clients to create, reuse (the email of a client of the workspace, F006) and leave out (`inactive`); `describeProblem(problem, locale)` words a problem in the Owner's language (`dataImport.*` in `packages/i18n`). The sheets of later tickets are added to the same functions | E015 AC3, AC12, AC15 |
| `src/commerce/invoice-math.ts` | Invoice arithmetic: prices include VAT, the amount excluding VAT is `incl × 10000 / (10000 + rate)` rounded half up (a credit note mirrors it), totals are sums of lines, a workspace without VAT has lines with only the amount | F059 AC3, AC9 |
| `src/commerce/invoice-number.ts` | The invoice and credit note number `{year}-{number}` (`2028-0001`): the year from the invoice date in the workspace time zone, restarting at 1 each year; the format lives in `formatInvoiceNumber` | F059 AC8 |
| `src/commerce/invoice-details.ts` | The seller's invoice details (legal name, address, KvK 8 digits, VAT `NL` + 9 digits + `B` + 2 digits; complete when all valid) and a client's billing details (company name and address required, VAT number optional), with their own error codes | F059 AC2 |
| `src/workspaces/defaults.ts` | What a new workspace starts with (`nl-NL`, `Europe/Amsterdam`) and the 80-character name limit | F002 AC2, AC3 |

### Import dry-run

```bash
IMPORT_DRY_RUN_DATABASE_URL=postgres://fivvi:fake-local-db-password@localhost:5432/fivvi \
  pnpm --filter @fivvi/domain import:dry-run --file <path> --workspace-fixture johns-gym
```

Loads the named synthetic workspace (`johns-gym`, or `johns-gym-existing-client`) into a scratch database it creates on the local Postgres (`pnpm db:up`) and drops afterwards, runs the check and the plan on the file and prints counts, and the type, sheet and row of each problem: never a name, email address, column name or cell value. Without `IMPORT_DRY_RUN_DATABASE_URL` it uses `TEST_DATABASE_URL`; a server that isn't on localhost is refused without echoing the URL. `--file` is one `.xlsx`, or one `.csv` per sheet (the sheet is the file name after the last dot: `clients.csv`, `import-sample.clients.csv`; repeat `--file`). Exit code 0 when the file can be imported, 1 when it has an error, 2 when it can't run or the file is refused. The synthetic sample is in `packages/testing/fixtures/` (`@fivvi/testing/import-sample`).

Tests: `pnpm --filter @fivvi/domain test` (Vitest, `*.test.ts` next to the code); `pnpm --filter @fivvi/domain test:integration` runs the CLI against the local Postgres.
