# Pilot discovery kit (M0)

The kit you, the product owner, use **in person** with the pilot gym to complete [`ROADMAP.md §4.1`](../product/ROADMAP.md#41-pilot-discovery) and the prototype check in [§4.2](../product/ROADMAP.md#42-ux-design). What it produces feeds Gate G0 (§4.6), the pilot success metrics (§8) and the pilot review at the end of M10 (§7).

**Who is who:** **you** = the product owner running the sessions. **Gym owner** = the pilot gym's owner, who is also a PT. **Trainers** = the other trainers working at the pilot gym.

- Sessions run in **Dutch**. Every question is written in Dutch, with the English underneath in italics.
- Every document can be printed. Print it from the GitHub view (Cmd/Ctrl + P) and fill it in by hand. You type up the results afterwards (see [Where results go](#where-results-go)).

## The documents

| # | Document | What it is for | ROADMAP |
|---|---|---|---|
| 1 | [`shadow-day-guide.md`](shadow-day-guide.md) | Observe a real working day: scheduling, booking, logging, notes. Includes a timing log and interview questions | §4.1 shadow day, artefacts, inventory |
| 2 | [`baseline-sheet.md`](baseline-sheet.md) | Measure the "before" numbers that the pilot is compared against: admin hours, tools, booking method, no-show rate and more. Includes a 7-day admin diary | §4.1 baseline, §8 |
| 3 | [`phone-inventory.md`](phone-inventory.md) | One form per trainer: platform, device, OS version. Sets the minimum OS versions | §4.1 phones, ADR-003 |
| 4 | [`import-checklist.md`](import-checklist.md) | Agree what data is imported at go-live, in which format, and how the source files are handled safely | §4.1 import, §4.4, R13 |
| 5 | [`metric-targets.md`](metric-targets.md) | Agree the MVP metric targets with the gym owner, especially the ⚑ ones | §4.1 targets, §8 |
| 6 | [`prototype-validation-script.md`](prototype-validation-script.md) | Test the clickable prototype with the gym owner and at least one other trainer, task by task, and record findings | §4.2, G0 |

## Order of use

Steps 1–6 take about two weeks. Step 7 happens when the clickable prototype from §4.2 is ready.

| Step | When | With whom | Document | Time | Output |
|---|---|---|---|---|---|
| **1. Kick-off** | Day 0 | Gym owner | This README, [`baseline-sheet.md` Part B](baseline-sheet.md#part-b--7-day-admin-diary), [`import-checklist.md` §1](import-checklist.md#1-before-anything-is-shared) | 20 min | Shadow-day date agreed. The gym owner starts the 7-day admin diary and knows which artefacts to prepare |
| **2. Shadow day** | Day 2–7 (during the diary week) | Gym owner, trainers present that day | [`shadow-day-guide.md`](shadow-day-guide.md) | 1 working day + 45 min interview | Timing log, observations, interview notes |
| **3. Phone inventory** | During the shadow day, or 5 min per trainer that week | Every trainer who will use the app, including the gym owner | [`phone-inventory.md`](phone-inventory.md) | 5 min per trainer | One form per trainer |
| **4. Import walkthrough** | Shadow day or the day after | Gym owner | [`import-checklist.md`](import-checklist.md) | 45 min | Agreed import scope and format; pseudonymised sample files |
| **5. Baseline complete** | After the 7-day diary is finished | Gym owner | [`baseline-sheet.md`](baseline-sheet.md) | 30 min | All baseline values filled in |
| **6. Target setting** | After step 5 (it needs the baseline) | Gym owner | [`metric-targets.md`](metric-targets.md) | 30 min | Agreed targets, signed off |
| **7. Prototype validation** | When the §4.2 prototype is clickable | Gym owner + ≥ 1 other trainer, separately | [`prototype-validation-script.md`](prototype-validation-script.md) | 60 min per person | Findings list; gym owner's sign-off on the 6 critical flows |

**Before the kick-off:** print the kit, and bring a stopwatch (a phone is fine) and a pen. Check whether the processor agreement (§4.4) is signed. Until it is, you only look at files on the gym owner's own screen or receive pseudonymised samples ([`import-checklist.md` §1](import-checklist.md#1-before-anything-is-shared)).

## Where results go

Type the filled-in results into `docs/discovery/results/`, one file per document, using the same structure as the template:

| Result file | From |
|---|---|
| `results/shadow-day.md` | shadow-day guide: observations, timing-log summary, interview notes |
| `results/baseline.md` | baseline sheet |
| `results/phone-inventory.md` | all phone forms combined into one table, plus the proposed minimum OS versions |
| `results/import-plan.md` | the import checklist as agreed |
| `results/metric-targets.md` | agreed targets and sign-off |
| `results/prototype-validation.md` | findings list and sign-off |

Commit them on their own branch and worktree (for example `docs/discovery-results`) and open a PR against `main`, as described in [`WORKFLOW.md`](../engineering/WORKFLOW.md).

### No personal data about clients (hard rule)

The repository is private, but it is still not the place for personal data. Results may contain **counts, durations, percentages, tool names and anonymised quotes only**.

- **Never commit** client names, email addresses, phone numbers, dates of birth, addresses, health information, the content of real notes or workouts, or screenshots and photos that show any of these.
- Refer to clients as **Klant A, Klant B, …** and to trainers as **T1, T2, …** (the gym owner is **T1**). Keep the code-to-name list on paper only. It never goes into the repository.
- Quotes are allowed if they contain no names or health details. Paraphrase when in doubt.
- **Never commit source files** such as Excel sheets, CSV exports, calendar exports (`.ics`) or contact exports, not even pseudonymised ones. `results/.gitignore` blocks the common formats as a safety net. The rule still applies to every other folder too.
- Real client data never goes into an AI agent's prompt or context. Agents build the importer (E015) against synthetic fixtures ([`import-checklist.md` §6](import-checklist.md#6-privacy-handling-of-source-files)).
- **Paper originals:** keep them somewhere safe until the results PR is merged, then shred them.

## After the results are merged

Each result feeds a follow-up change (each on its own branch, per `WORKFLOW.md`):

- [ ] Tick the §4.1 checkboxes in `ROADMAP.md` that are done.
- [ ] Replace the ⚑ targets in `ROADMAP.md §8` with the agreed values, and add a changelog line.
- [ ] Record the minimum iOS and Android versions in the ADR-003 write-up (`docs/decisions/`).
- [ ] Use the agreed import scope and formats in the E015 feature doc (data import tooling, M9).
- [ ] Turn prototype findings into wireframe and prototype changes (§4.2). Put confusing Dutch words into `packages/i18n/GLOSSARY.md`, and put post-MVP wishes in the 1.1 backlog (R7).

### What this covers for Gate G0 (§4.6)

| G0 criterion | Covered by |
|---|---|
| Critical flows validated by the pilot owner | `results/prototype-validation.md`, gym owner's sign-off |
| Baseline metrics recorded | `results/baseline.md` + `results/metric-targets.md` |
| Trainer phone inventory known | `results/phone-inventory.md` |
