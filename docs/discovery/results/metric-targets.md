# Metric targets: results

| | |
|---|---|
| **Date** | 29 October 2026 (A4–A6: 31 October 2026) |
| **Source** | Quick questions 19–21 ([`quick-questions.md`](quick-questions.md)), the commerce walkthrough ([#150](https://github.com/fivvi-app/fivvi/issues/150)) and the product owner's decisions in chat |
| **Template** | [`../metric-targets.md`](../metric-targets.md) |
| **Status** | Part A1–A6 agreed (A4–A6 on 31 October 2026, commerce walkthrough, [#150](https://github.com/fivvi-app/fivvi/issues/150)). Parts B and C are not discussed yet |

All baselines are estimates (quick questions, not a diary). At G5 the same question is asked again.

## Part A: the ⚑ targets

### A1. Customers book through public pages

| | |
|---|---|
| **Baseline** | Group classes: booked through the current booking app, sometimes WhatsApp. Private training: WhatsApp. The gym owner expects 10 out of 10 clients to book themselves through a link or QR code (question 20) |
| **Agreed target** | **≥ 80 %** of group-class and Open Gym bookings through the public booking pages (minimum), hoped for 90 % or more |
| **Reason** | The roadmap default stands. The gym owner expects almost everyone to self-book, and group classes already self-book today |
| **Measured** | Bookings by source in the database, pilot weeks 4–6 |

### A2. Open Gym receives bookings

| | |
|---|---|
| **Baseline** | No Open Gym today, no client requests (questions 5, 21) |
| **Agreed target** | **No pass/fail number.** Open Gym runs as a test. Report slots published, spots offered and confirmed bookings per week, averaged over pilot weeks 4–6, at G5 |
| **Reason** | No baseline and no demand yet, and the gym owner doesn't know what number would make it worth it. A made-up number would prove nothing. Revisit at G5 with the real figures |
| **Measured** | Confirmed Open Gym bookings per week in the database, with slots and spots for context |

### A3. Admin time reduced

| | |
|---|---|
| **Baseline** | 4–5 h/week (question 9, estimate), taken as 4.5 h |
| **Agreed target** | **≤ 3.5 h/week** (minimum, 1 h less, about −22 %), hoped for **≤ 2.5 h/week** (about −44 %) |
| **Reason** | The gym owner said 1 h less would make it worth it (question 19). The hoped-for level is close to the roadmap default of −50 % (2.25 h) |
| **Measured** | The same question 9, asked again in pilot week 5 and reported at G5 |

### A4. Agreements run in the platform

| | |
|---|---|
| **Baseline** | All memberships, credit packs and private agreements run in the current booking and payments app (Pay'n Plan) and in Word (private sessions). Nothing runs in Fivvi |
| **Agreed target** | **100 % of running agreements in Fivvi from pilot week 0** (the first pilot day, instead of the roadmap default of week 3), with **0** unexplained balance differences |
| **Reason** | The gym owner does not want to run two systems next to each other. All running agreements move over at once, unchanged (same end date, remaining sessions and next payment date) |
| **Measured** | Share of active agreements in the database against the count in the old app at cutover; the reconciliation report of the import (E015) for balance differences, pilot weeks 0–6 |

### A5. Payments collected without the old app

| | |
|---|---|
| **Baseline** | All group payments are collected by the current booking app; private training is invoiced by message and paid by hand |
| **Agreed target** | **100 % of due payments through Fivvi from pilot week 0** (instead of the roadmap default of week 6), with **0** duplicate charges |
| **Reason** | One cut-over date for both apps: the old app's collection stops on the same date, so no client is charged twice. Private training moves to direct debit too |
| **Measured** | Payments collected through Fivvi against due payments, and charges of the same amount for the same due date, from the payment provider's reports, pilot weeks 0–6 |

### A6. Private invoices need no manual work

| | |
|---|---|
| **Baseline** | Private sessions are tracked in Word; invoices are sent by message and paid by hand (whether the invoices are also made in Word is not confirmed) |
| **Agreed target** | **0** invoices made or edited by hand per month |
| **Reason** | The roadmap default stands. Every payment gets an invoice made by Fivvi (`PRODUCT.md §96`) |
| **Measured** | Invoices made or edited outside Fivvi, asked of the gym owner each month of the pilot and reported at G5 |

### What A4 and A5 at week 0 mean

Week 0 has consequences for the plan; they shape `ROADMAP.md §7` (the launch checklist) and the M11 specs:

- The import is **complete and checked before go-live** ([#157](https://github.com/fivvi-app/fivvi/issues/157)), with the reconciliation report agreed by the gym owner.
- The gym's **Mollie account is approved** before go-live (Mollie reviews SEPA Direct Debit separately).
- The **first-payment links go out before week 0**, so every client has a new mandate when the old app's collection stops (QC09).
- **One cut-over date for both apps:** the old app's collection stops on that date; the old app may stay read-only until the first full payment cycle reconciles.

## Part C: the gym owner's own success measures

Question 22 gave six statements (see [`quick-questions.md`](quick-questions.md)). They are **not yet** turned into measures. Candidates for the next target session, at most three:

| # | Metric | Baseline | Target | Measured by |
|---|---|---|---|---|
| C1 | Private sessions left per client visible in the app | Not visible today (Word) | To agree | Check at the pilot review |
| C2 | Current members imported and correct at go-live | n/a | To agree, with the import scope ([#157](https://github.com/fivvi-app/fivvi/issues/157)) | Count after the import |
| C3 | No-shows (2–3 out of 10 today, not a §8 metric) | 20–30 % | To agree | Attendance statuses in the platform |
