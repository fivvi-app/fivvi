# Go-live import checklist

**Purpose:** agree with the gym owner **which data is imported at go-live, in which format, and how the source files are handled** (`ROADMAP.md §4.1`). This checklist is the input for E015 (data import tooling, M9), including active agreements and balances since commerce moved into the MVP (§3.4a) and deals with risk R13 ("pilot data import is messier than expected").

**You** = the product owner (and developer of the platform). **Gym owner** = the pilot gym's owner. Walk through it together in about 45 minutes, preferably with their real files open **on their screen** (see §1).

---

## 1. Before anything is shared

- [ ] **Roles are clear.** The gym is the *controller* of its client data. The platform (you) is the *processor* (`ROADMAP.md §4.4`).
- [ ] **No files are needed in M0.** Don't ask for the gym owner's Excel or client lists. Ask them to *describe* what they keep ([`quick-questions.md`](quick-questions.md) question 16, or the walkthrough questions in §3). If they offer to show something, look at it **on their screen only**.
- [ ] **No real client data changes hands until the processor agreement (*verwerkersovereenkomst*) is signed**, and even then only if the gym owner chooses the import route in §2.
- [ ] **Only data the gym controls.** Trainers' own independent clients (outside the gym) belong to a separate workspace (`PRODUCT.md §5, §11`). They are not part of this import.

---

## 2. Timeline

| When | What | Output |
|---|---|---|
| **M0 (now)** | Agree the scope (§3) from the gym owner's description. No files | `results/import-plan.md` (or the D answers in `results/quick-questions.md`) |
| **M9** | Choose how the data gets in (below). Only for a file route: dry-run the importer against a copy in a scratch database (`ROADMAP.md §5 M9`) | Route chosen; dry-run report (counts and errors only) if applicable |
| **Pilot week 0** | Data entered by hand, or final template/export → data-quality check (§5) → import. Then the gym owner checks it | Data in; freeze window closed |
| **Go-live + 30 days** | File route only: delete source files and intermediate files (§6) | Deletion date recorded in `results/import-plan.md` |

**How the data gets in at go-live** (decide in M9, not now):

- ☐ **Entered by hand** during onboarding (week 0). Works for small numbers: clients, the weekly timetable and a few weeks of sessions. No file ever changes hands.
- ☐ **The gym owner fills in the template** (§4) from their own Excel and hands it over, after the processor agreement is signed.
- ☐ **The gym owner uploads the file themselves** with the importer (E015), so nobody else sees it. Only if E015 supports self-service upload.

**Freeze window:** between the final export (or the start of entry by hand) and the gym owner's "import looks right", changes in the old system are written on a list and entered in the platform by hand afterwards. Agree how long it lasts: ____ days.

---

## 3. What to import

### Questions for the walkthrough / Vragen voor de doorloop

**Q1** Waar staat je klantenlijst nu? Is dat één bestand, of staan klanten op meerdere plekken?\
*Where is your client list today? Is it one file, or are clients spread over several places?*

**Q2** Van hoeveel klanten heb je een e-mailadres?\
*For how many clients do you have an email address?*

**Q3** Welke klanten moeten er op de eerste dag in staan: alleen actieve, of ook klanten die een tijd niet zijn geweest?\
*Which clients should be in the system on day one: only active ones, or also clients who haven't come for a while?*

**Q4** Hoe ver vooruit staan privétrainingen en boekingen nu al gepland?\
*How far ahead are private sessions and bookings already planned today?*

**Q5** Hoeveel trainingsgeschiedenis wil je in de app terugzien? Is "wat deed de klant vorige keer" genoeg?\
*How much workout history do you want to see in the app? Is "what did the client do last time" enough?*

**Q6** Zijn er notities die je echt mee wilt nemen, of begin je liever opnieuw?\
*Are there notes you really want to bring over, or would you rather start fresh?*

**Q7** Wie maakt de export, en wanneer heeft die persoon daar tijd voor?\
*Who will make the export, and when do they have time for it?*

Then tick a decision per item with the gym owner. Column names in `code font` are the ones to use in the export (§4).

### 3.1 Prerequisites: workspace, locations, trainers

These are usually entered by hand during onboarding. Listing them here means the rest of the import can refer to them.

| Item | Fields | Decision |
|---|---|---|
| Workspace | name, timezone (default `Europe/Amsterdam`), default language (`nl`) | ☐ Enter by hand |
| Locations | `location_name`, `location_type` (`organization_location` / `external_gym` / `client_home` / `outdoor` / `online` / `other`, `PRODUCT.md §12`), address (only for the gym's own locations) | ☐ Enter by hand ☐ Import |
| Trainers | `trainer_name`, `trainer_email` (for the invitation), role (`owner` / `admin` / `trainer`), language (`nl` / `en`) | ☐ Enter by hand (invitations) ☐ Import |

### 3.2 Clients — **required**

| Field | Column | Required? | Notes |
|---|---|---|---|
| Source key | `client_key` | **Yes** | A key made up for the export (e.g. `K001`), used to link sessions, bookings and history. **Never** a BSN, a date of birth or a phone number |
| First name | `first_name` | **Yes** | |
| Last name | `last_name` | Yes, if known | |
| Email | `email` | Recommended | Needed for booking confirmations and the optional client account. Clients without an email can still be trained and logged |
| Preferred language | `language` | Optional | `nl` or `en`; default `nl` (`PRODUCT.md §3`, client language) |
| Default location | `default_location` | Optional | A `location_name` from 3.1 (`PRODUCT.md §14`) |
| Primary trainer | `trainer_email` | Optional | Which trainer usually trains this client |
| Status | `status` | **Yes** | `active` / `inactive`. **Decision:** import inactive clients? ☐ No (default) ☐ Yes, if active in the last ____ months |

**Not imported** (data minimisation, `PRODUCT.md §79`): phone numbers (the MVP doesn't require one, `§53`), dates of birth, addresses of private clients (except a billing address a client wants on a company invoice, §3.4a), payment data beyond the agreements, balances and due dates of §3.4a (never IBANs, card data or mandate documents), photos, and any health information in separate columns.

☐ Scope agreed. Number of clients to import: ≈ ______

### 3.3 Class schedule (recurring group classes) — **required**

One row per recurring class. The platform stores the rule in local wall-clock time and creates the individual occurrences itself (ADR-012).

| Field | Column | Required? | Notes |
|---|---|---|---|
| Class name | `class_name` | **Yes** | As clients see it, e.g. `Kracht` |
| Description | `description` | Optional | Stored exactly as written; not translated (`PRODUCT.md §3`) |
| Trainer | `trainer_email` | **Yes** | The regular trainer |
| Location | `location_name` | **Yes** | From 3.1 |
| Capacity | `capacity` | **Yes** | Whole number |
| Weekday | `weekday` | **Yes** | `ma` / `di` / `wo` / `do` / `vr` / `za` / `zo` |
| Start time | `start_time` | **Yes** | `HH:MM`, 24h, Dutch local time |
| Duration | `duration_min` | **Yes** | Minutes |
| First date | `first_date` | **Yes** | `YYYY-MM-DD` (the first occurrence on or after go-live) |
| Last date | `last_date` | Optional | Empty = no end date |
| Skipped dates | `skip_dates` | Optional | Dates the class doesn't run (holidays), separated by `;` |
| Publicly bookable | `public` | **Yes** | `ja` / `nee` |

☐ Scope agreed. Recurring classes: ≈ ______ per week

### 3.4 Future sessions and bookings — **required**

Only **from the go-live date onwards**. Past sessions are not imported (history, if wanted, goes through 3.5).

**Private sessions** — one row per future session:

| Column | Required? | Notes |
|---|---|---|
| `date` | **Yes** | `YYYY-MM-DD` |
| `start_time` / `end_time` | **Yes** | `HH:MM`, 24h, Dutch local time |
| `trainer_email` | **Yes** | |
| `client_key` | **Yes** | From 3.2 |
| `location_name` | **Yes** | From 3.1; empty = the client's default location |

**Existing bookings in future group classes** — one row per client per occurrence:

| Column | Required? | Notes |
|---|---|---|
| `class_name` + `date` | **Yes** | Identifies the occurrence |
| `client_key` | **Yes** | |

**Future Open Gym slots** (if any are already announced): `date`, `start_time`, `end_time`, `location_name`, `capacity`.

**Decisions**

- [ ] Horizon: import future sessions and bookings up to ____ weeks ahead (suggestion: 12, the same as the recurrence horizon in ADR-012).
- [ ] Emails on import: ☐ **No** confirmation emails to clients for imported bookings (default: the gym owner informs clients themselves) ☐ Yes, send confirmations.
- [ ] Standing weekly private sessions: import them as individual future sessions (default) ☐ agreed.

### 3.4a Agreements, balances and payments — **required** (v1.19)

Commerce is part of go-live (`ROADMAP.md` M11, `PRODUCT.md §90–§97`), so the active memberships and session packs come along. The current booking and payment app is the source; agree in M0 what it can export (QC14 in [`open-questions.md`](../design/open-questions.md#qc14)). **Never** import or copy IBANs, card data or mandate documents: mandates stay with the payment provider (QC09).

**Offers** — one row per kind of membership or session pack sold today: `name`, `kind` (`membership` / `session_pack`), `price_eur` (incl. VAT), `vat_rate`, `term_months` or `validity_months`, `classes_per_week` (membership) or `sessions` (pack), `cutoff_hours`, `makeups_per_term`.

**Active agreements** — one row per client per agreement:

| Column | Required? | Notes |
|---|---|---|
| `client_key` | **Yes** | From 3.2 |
| `offer_name` | **Yes** | From the offers above |
| `start_date` / `end_date` | **Yes** | `YYYY-MM-DD` |
| `renews` | **Yes** | `yes` / `no`, and the notice period if yes |
| `weekly_classes` | Membership only | e.g. `Kracht di 18:00; Kracht do 18:00` |
| `next_due_date` / `amount_eur` | **Yes** | The next recurring payment |
| `open_amount_eur` | Optional | Unpaid amounts at go-live |

**Session balances at go-live** — one row per agreement: `sessions_left` (pack) or `makeups_left` (membership), with the date it was counted. It becomes the first line of the balance history (`PRODUCT.md §92`), marked as imported.

**Billing details** — only for clients who want a company invoice: `company_name`, `address` (the billing address on the invoice, not a home address otherwise), `vat_number`.

**Decisions**

- [ ] Mandates: ☐ every client gives a new one through a first payment link (default, QC09) ☐ the provider moves the existing ones.
- [ ] Switch-over order: which client group pays through Trainer Hub first (`ROADMAP.md §7`, week 1).
- [ ] Reconciliation: after the import, the gym owner checks a report with counts, totals per offer, the sum of balances and the next due dates against the old app. Nobody pays through Trainer Hub until it matches.
- [ ] Invoice numbers: the series in Trainer Hub continues after the last number of the old app ☐ or starts a new series (ask the gym's accountant).

### 3.5 Workout history — **optional**

Useful so that trainers see "Vorige training" (previous values, `PRODUCT.md §41`) from day one.

- [ ] **Scope:**
  ☐ None (trainers log from scratch)
  ☐ **Last session per exercise per client** (enough for previous values; suggested)
  ☐ Last ____ weeks
  ☐ Everything available
- [ ] Only for clients who still have private sessions after go-live? ☐ Yes (suggested) ☐ No

| Column | Required? | Notes |
|---|---|---|
| `client_key` | **Yes** | |
| `date` | **Yes** | `YYYY-MM-DD` |
| `exercise` | **Yes** | As written today; mapped to the exercise library during the import (see below) |
| `set_no` | **Yes** | 1, 2, 3, … |
| `reps` | **Yes** | |
| `weight_kg` | Optional | Number; empty = bodyweight |
| `difficulty` | Optional | `makkelijk` / `normaal` / `zwaar` |
| `trainer_email` | Optional | |

**Exercise mapping:** make a list of all distinct exercise names in the source (names only, no client data). During the import each name is matched to a library exercise or created as a custom exercise (`PRODUCT.md §38`). The same list feeds the glossary (Dutch names, aliases).

**Current programmes / templates:** usually rebuilt by hand in the app (`PRODUCT.md §39`). ☐ Rebuild by hand ☐ Import (only if there are more than ~20)

### 3.6 Client notes — **not imported by default; decide explicitly**

Not part of the §4.1 list. Notes can contain **health data** (special-category data under the GDPR/AVG, R11).

- ☐ **Not imported (default).** Trainers re-enter what is still relevant, as trainer-only notes.
- ☐ Imported, only if **all** of these hold:
  - the processor agreement is signed and the DPIA assessment (`ROADMAP.md §4.4`) is done;
  - the gym owner first removes notes that are no longer needed (minimisation);
  - they are imported as **trainer-only** (`PRODUCT.md §37`), exactly as written (`§35`).

---

## 4. Format

- **One Excel workbook (`.xlsx`) with one sheet per item** (`clients`, `classes`, `sessions`, `class_bookings`, `open_gym`, `workout_history`), **or one UTF-8 CSV file per item.** E015 will provide a template workbook. Until then, use the column names from §3.
- The first row holds the column names. After that, one record per row, with no merged cells, subtotals or colour coding that carries meaning.
- **Dates:** `YYYY-MM-DD` (e.g. `2026-10-06`). **Times:** `HH:MM`, 24 hours, in Dutch local time. The platform converts them to UTC (ADR-012).
- **Numbers:** whole numbers for capacity, reps and minutes. Weights may use a decimal comma or a decimal point (`62,5` or `62.5`), but one style per file.
- **Emails:** one per cell, no spaces.
- **Fixed values** (weekday, language, status, location type, difficulty) exactly as listed in §3.
- One `client_key` per client, used the same way in every sheet.
- The format only matters if the data is imported from a file (see "How the data gets in" in §2). It doesn't matter for entry by hand.

---

## 5. Data-quality check (before every import, including the dry-run)

- [ ] No duplicate clients (same name + email, or the same person under two keys).
- [ ] Emails look valid; the number of clients without an email is known: ____
- [ ] Every class and session has a trainer and a location that exist in 3.1.
- [ ] No overlapping private sessions for the same trainer.
- [ ] No sessions or bookings before the go-live date.
- [ ] Bookings per class occurrence ≤ capacity.
- [ ] Every `client_key` in `sessions`, `class_bookings` and `workout_history` exists in `clients`.
- [ ] Exercise names are mapped (3.5), if history is imported.
- [ ] Clients who asked not to be moved, or to be deleted, are removed from the source first.
- [ ] Counts after the import match the source (clients, classes, future sessions, bookings, history rows), and the gym owner has spot-checked 5 records.

---

## 6. Privacy handling of source files

*This is not legal advice. It is the working agreement for handling the pilot's files. See `ROADMAP.md §4.4`.*

| Rule | Detail |
|---|---|
| **Processor agreement first** | No real (non-pseudonymised) client data is transferred before the *verwerkersovereenkomst* is signed. |
| **Minimise** | The gym owner exports only the columns in §3. Everything else stays in the gym's own files. |
| **Transfer** | Never via WhatsApp, an ordinary email attachment or a loose USB stick. Use an encrypted archive (e.g. AES-256 zip or an encrypted disk image) and share the password **through a different channel** (in person or by phone). |
| **Storage** | Only on your encrypted laptop (FileVault), in a dedicated folder **outside every git repository and worktree**. Not in a cloud-sync folder unless that provider is covered by a DPA and stores data in the EU. |
| **Never in git** | Not in the repository, not in `docs/discovery/results/`, not pseudonymised. `results/.gitignore` blocks spreadsheet, CSV and calendar/contact export formats as a safety net. |
| **Never in AI context** | Don't open real or pseudonymised source files in any AI coding agent (GitHub Copilot, Claude Code, Codex), and don't paste rows into a prompt. Agents build and test the importer (E015) against **synthetic fixtures** with the same columns. You run the M9 dry-run yourself and review its output yourself. Only counts and error types go into a PR or an issue. |
| **Databases** | The dry-run uses a scratch database (e.g. a Neon branch), which is deleted right after the dry-run. The real import only goes into production, in week 0. |
| **Retention** | Delete source files, cleaned exports and any logs with personal data **within 30 days after go-live**, once the gym owner confirms the import is correct. Record the date in `results/import-plan.md`. |
| **Informing clients** | Telling clients that their data moves to the new system is the gym's job as controller (privacy notice). The platform's NL/EN privacy policy (§4.4) supports this. |
| **Requests** | If a client objects or asks for deletion before the import, remove them from the source. After the import, use the platform's deletion (E014). |

---

## 7. Agreement (copy into `results/import-plan.md`)

No client data in this table. Counts and decisions only.

| Item | Import? | Scope / horizon | Source (tool, no file contents) | By hand / file | Notes |
|---|---|---|---|---|---|
| Locations | | | | | |
| Trainers | | | | | |
| Clients | | ≈ ___ clients | | | |
| Class schedule | | ≈ ___ classes/week | | | |
| Future private sessions | | ___ weeks | | | |
| Future class bookings | | ___ weeks | | | |
| Open Gym slots | | | | | |
| Workout history | | | | | |
| Client notes | | | | | |

- Emails on import: ☐ none ☐ confirmations
- Freeze window: ____ days
- Processor agreement signed on: ____________ (required before a real transfer)
- Source files deleted on: ____________ (fill in after go-live)

**Agreed on / Akkoord op:** ____________ **Gym owner / Eigenaar gym:** ____________ **Product owner:** ____________
