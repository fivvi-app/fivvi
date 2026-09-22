# MVP metric targets worksheet

**Purpose:** agree the MVP success targets with the gym owner (`ROADMAP.md §4.1`, `§8`). Three targets are marked ⚑ in the roadmap and **must** get a number here. The others are defaults that the gym owner confirms or adjusts. At the pilot review (Gate G5, `§7`) the pilot is judged against these targets.

**When:** after the [baseline](baseline-sheet.md) is complete, because most targets are set relative to it. Takes about 30 minutes with the gym owner.

**You** = the product owner. **Gym owner** = the pilot gym's owner.

**Tips**

- Aim for a target that would make the gym owner say "this was worth it", and that we can **measure the same way** as the baseline.
- A target that is too low proves nothing. One that is too high makes a good pilot look like a failure. When in doubt, agree a range: a minimum and a hoped-for level.
- Out of scope for targets: anything in `PRODUCT.md §53` (billing, payments, SMS, …).

---

## Part A — The three ⚑ targets (must be agreed)

### A1. Customers book through public pages

| | |
|---|---|
| **Metric** | Share of group-class + Open Gym bookings made via the public booking pages (not entered by staff) |
| **Baseline** (baseline sheet A3.2, A2.5) | Self-service share today: ____ % · top channel today: ____________ (____ %) |
| **Roadmap default** | ≥ 80 % |
| **Measured in the pilot** | Bookings by source in the database (public page vs created by a trainer/admin), per week |
| **Measured when** | Pilot weeks 4–6 (after the switch-over in weeks 2–3) |

**Vraag:** Hoeveel procent van de boekingen voor groepslessen en Open Gym moeten klanten na de overstap zelf via de boekingspagina doen, voordat je zegt: dit werkt? Welke klanten zullen dat waarschijnlijk níet doen, en waarom?\
*Question: what share of group-class and Open Gym bookings should clients make themselves on the booking page after the switch-over before you'd say: this works? Which clients probably won't, and why?*

| | |
|---|---|
| **Agreed target** | ≥ ______ % (minimum) · hoped for ______ % |
| **Reason / exceptions** | |

### A2. Open Gym receives bookings

| | |
|---|---|
| **Metric** | Open Gym bookings per week |
| **Baseline** (A3.4, shadow-day §6) | Open Gym slots/week today: ____ · bookings/week today: ____ · requests/week: ____ |
| **Roadmap default** | None, agree it here |
| **Measured in the pilot** | Confirmed Open Gym bookings per week in the database; also slots published and spots offered, for context |
| **Measured when** | Pilot weeks 4–6, average per week |

**Help to set it:** planned Open Gym slots per week (____) × capacity per slot (____) = spots offered per week (____). A realistic target is often a share of the spots offered, and at least the number of requests the gym owner receives today.

**Vraag:** Hoeveel Open Gym-momenten per week wil je tijdens de pilot aanbieden, en voor hoeveel mensen per keer? Bij hoeveel boekingen per week zou je zeggen: Open Gym is de moeite waard?\
*Question: how many Open Gym slots per week do you want to offer during the pilot, and for how many people each? At how many bookings per week would you say: Open Gym is worth it?*

| | |
|---|---|
| **Agreed target** | ≥ ______ bookings per week (with ≥ ______ slots published per week) |
| **Reason** | |

### A3. Admin time reduced

| | |
|---|---|
| **Metric** | Gym owner's admin hours per week, **MVP scope** (codes P–O; excludes invoices, payroll and marketing, see [admin-time scope](baseline-sheet.md#admin-time-scope)) |
| **Baseline** (A2.1) | ______ h/week (diary week: ______) |
| **Roadmap default** | e.g. −50 % |
| **Measured in the pilot** | **The same 7-day diary** ([baseline sheet Part B](baseline-sheet.md#part-b--7-day-admin-diary)), repeated by the gym owner in **pilot week 5**. Same categories, same rules |
| **Measured when** | Pilot week 5; reported at G5 |

**Vraag:** Je besteedt nu ongeveer ____ uur per week aan planning, boekingen, trainingen bijhouden en notities. Hoeveel uur zou het na de overstap moeten zijn om het de moeite waard te vinden? Wat ga je met die tijd doen?\
*Question: you currently spend about ____ hours a week on scheduling, booking, tracking workouts and notes. How many hours should it be after the switch-over for it to feel worth it? What will you do with that time?*

| | |
|---|---|
| **Agreed target** | ≤ ______ h/week (= −______ % vs baseline) |
| **Reason** | |

*Optional:* also set a target for the other trainers (baseline A2.3): ≤ ______ h/week in total.

---

## Part B — Confirm or adjust the other targets

Tick **Confirm**, or write the adjusted target and the reason. Baselines come from the [baseline sheet](baseline-sheet.md).

| # | Metric (§8) | Roadmap target | Baseline | Confirm / adjusted to | Measured in the pilot by |
|---|---|---|---|---|---|
| B1 | Share of the real weekly schedule that exists in the platform | ≥ 95 % from pilot week 3 | schedule size (A1.6): ____ items/week; lives in ____ places (A3.1) | ☐ Confirm / ______ | Items in the platform ÷ the gym owner's real weekly schedule, checked at the weekly check-in |
| B2 | Active trainers per week ÷ trainers with sessions | 100 % | trainers with sessions (A1.7): ____ | ☐ Confirm / ______ | Trainers who open their sessions or log at least once that week (product events) |
| B3 | Started → confirmed booking conversion; median time to verify | ≥ 70 %; < 5 min | today: median ____ min to confirm (A3.3) | ☐ Confirm / ______ | Booking funnel events (started, verified, confirmed) |
| B4 | Missing translation keys; e2e suites per locale on web, iOS, Android | 0 missing; all green | n/a | ☐ Confirm | CI |
| B5 | Private sessions with a logged workout | ≥ 80 % | ____ % recorded anywhere today (A3.5) | ☐ Confirm / ______ | Private sessions with ≥ 1 logged set ÷ private sessions held |
| B6 | Owner and trainers confirm no other notes tool is in use | Yes, at pilot review | ____ places today (A3.6) | ☐ Confirm | Question at the pilot review (see Part D) |
| B7 | Trainer rating "easy to see what they did last time" | ≥ 4 / 5 | ____ / 5 today (A3.7) | ☐ Confirm / ______ | The same question as the baseline (shadow-day guide 4.4 / 10.3), at the bi-weekly trainer check |
| B8 | Developer interventions for routine operations | 0 in the final 2 weeks | n/a | ☐ Confirm | Support log in `docs/pilot/` |
| B9 | Uptime; cross-tenant incidents; app crash-free sessions | ≥ 99.5 %; 0; ≥ 99 % | n/a | ☐ Confirm | Uptime monitor; incident log; Sentry |
| B10 | "Would you go back to Excel + calendar + manual booking?" | **No** | satisfaction today ____ / 5 (A3.9) | ☐ Confirm | Question at the pilot review (see Part D) |

**Vraag (voor B1–B10):** Dit zijn de doelen die wij voorstellen. Is er een doel dat je te makkelijk of te moeilijk vindt, of dat voor jou niets zegt?\
*Question (for B1–B10): these are the targets we propose. Is there one you find too easy or too hard, or that means nothing to you?*

---

## Part C — The gym owner's own success measures (optional)

From the shadow-day interview (question 9.3, "when would you say this is a success?"). Add up to three, but only if they can be measured during the pilot and fall within MVP scope.

**Vraag:** Is er iets anders waaraan jij na zes weken wilt zien dat het werkt?\
*Question: is there anything else that would show you after six weeks that it works?*

| # | Metric | Baseline | Target | Measured by |
|---|---|---|---|---|
| C1 | *e.g. no-show rate (baseline A2.6; §8 has no target)* | ____ % | ≤ ____ % | Attendance statuses in the platform |
| C2 | | | | |
| C3 | | | | |

---

## Part D — Pilot-review questions (fixed now, asked at G5)

These are agreed now so the pilot review asks exactly the same thing.

**D1** Gebruik je naast Trainer Hub nog een ander programma, schrift of app voor notities over klanten? Zo ja, welke en waarvoor?\
*Do you still use any other program, notebook or app for notes about clients besides Trainer Hub? If so, which one and what for?* → B6

**D2** Zou je terug willen naar Excel, een aparte agenda en handmatig boeken? Waarom wel of niet?\
*Would you want to go back to Excel, a separate calendar and manual booking? Why or why not?* → B10

**D3** Op een schaal van 1 tot 5: hoe makkelijk is het nu om te zien wat een klant vorige keer deed?\
*On a scale of 1 to 5: how easy is it now to see what a client did last time?* → B7

---

## Sign-off

| | |
|---|---|
| Agreed on / *Akkoord op* | |
| Gym owner / *Eigenaar gym* | |
| Product owner | |

**Afterwards:** type the agreed values into `results/metric-targets.md`. In a follow-up PR, replace the ⚑ entries in `ROADMAP.md §8` with the agreed targets and add a changelog line (`§16`).
