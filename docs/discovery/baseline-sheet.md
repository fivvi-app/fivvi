# Baseline sheet

**Purpose:** record the "before" numbers of the pilot gym. At the pilot review (Gate G5, `ROADMAP.md §7`) the same metrics are measured again and compared with these. Covers the baseline in `ROADMAP.md §4.1` and every metric in `§8` that has a meaningful "before" value.

**You** = the product owner. **Gym owner** = the pilot gym's owner (T1). Use numbers only, never client names ([README](README.md#no-personal-data-about-clients-hard-rule)).

**How it works**

1. At the kick-off, give the gym owner **Part B (7-day admin diary)** and **Part C (no-show and booking tally)**. They fill them in for 7 consecutive, normal working days, starting before the shadow day.
2. On the shadow day, fill in the observation-based values (from [`shadow-day-guide.md`](shadow-day-guide.md) §3, §4 and §6).
3. After the 7 days, complete **Part A** together with the gym owner and copy it into `results/baseline.md`.

---

## Admin-time scope

The admin-time target (§8) compares like with like. So split admin time into:

- **MVP scope (codes P, B, L, N, A, O, C):** scheduling, booking and messages about appointments, workout logging and programming, notes, attendance, Open Gym, and (since commerce moved into the MVP, `PRODUCT.md §90–§97`) invoices, payments, memberships and session packs (code C). The platform is meant to reduce this time.
- **Outside MVP (code X):** payroll, marketing, bookkeeping and accounting. These are excluded from the MVP (`PRODUCT.md §53`). Record them for context, but they are **not** part of the admin-time target.

Training time itself (being with a client) is not admin. Admin is the time spent *around* training.

---

## Part A — Baseline metrics

Fill in the **Result** column. For **Source**, write **D** = diary (Part B), **T** = tally (Part C), **S** = shadow-day observation, **I** = interview answer, **R** = records (Excel, calendar, app history), **E** = estimate.

### A1. Volume and inventory

These give context and the denominators for the §8 percentages.

| # | Metric | How to measure | Result | Source |
|---|---|---|---|---|
| A1.1 | Trainers (incl. gym owner) | Count. The same number as the [phone inventory](phone-inventory.md) | | |
| A1.2 | Active clients | Clients with ≥ 1 session or booking in the last 4 weeks (from records), or the gym owner's estimate | | |
| A1.3 | … of which private clients | Same, limited to private sessions | | |
| A1.4 | Recurring group classes per week | Count from the weekly timetable | | |
| A1.5 | Private sessions per week | Average over the last 4 weeks from the calendar/Excel; otherwise the diary-week count | | |
| A1.6 | **Weekly schedule size** | A1.4 + A1.5 + Open Gym slots per week. This is the denominator for "≥ 95 % of the real weekly schedule in the platform" | | |
| A1.7 | Trainers with sessions in a normal week | Count from the timetable and calendar. Denominator for "active trainers ÷ trainers with sessions" | | |
| A1.8 | Locations used, by type | Count per type from `PRODUCT.md §12` (gym, external gym, client home, outdoor, online, other) | | |

### A2. Core baseline (§4.1)

| # | Metric | Definition | How to measure | Result | Source |
|---|---|---|---|---|---|
| A2.1 | **Admin hours per week: gym owner, MVP scope** | Hours per week the gym owner spends on P, B, L, N, A, O and C | Part B diary total for P, B, L, N, A, O and C ÷ 60. Sanity-check against the shadow-day timing log for that day, and against the interview estimate (5.8, question 8.2). If the diary week was unusual, say why | h/week | D |
| A2.2 | Admin hours per week: gym owner, outside MVP | Same, code X | Part B diary total for X ÷ 60 | h/week | D |
| A2.3 | Admin hours per week: other trainers, MVP scope | Sum over T2, T3, … | Interview estimate (5.10, question 10.6), or a diary if a trainer is willing to keep one | h/week | I / D |
| A2.4 | **Number of tools** | Distinct tools used **at least weekly** for P, B, L, N, A, O and C work. A tool is any separate place where information is kept or exchanged: an app, a spreadsheet product, a messaging channel, a paper notebook. Count per product (several Excel files = 1 tool), but list the files. Memory doesn't count | Shadow-day §3 + interview 8.1 | ____ tools: _________________ | S / I |
| A2.5 | **Booking method** | How booking requests for group classes, Open Gym and private sessions arrive, as a % per channel | Part C booking tally over 7 days; if very few bookings, add the gym owner's estimate and mark it **E** | see Part C | T |
| A2.6 | **No-show rate** | No-shows ÷ (attended + no-shows), over group classes and private sessions. A no-show is booked, not cancelled, didn't come (`PRODUCT.md §43`: *Niet verschenen*) | Preferably the last 4 weeks from records. If attendance isn't recorded, use the Part C tally for the 7 diary days (and more if possible) | % (n = ___ bookings) | R / T |
| A2.7 | Late-cancellation rate | Late cancellations ÷ all bookings. "Late" = the gym's own rule (interview 3.4): ____ hours before start | Same source as A2.6 | % | R / T |

### A3. Baselines for the §8 success metrics

| # | §8 metric | Baseline measure | How to measure | Result | Source |
|---|---|---|---|---|---|
| A3.1 | Owner runs scheduling through the platform (≥ 95 %) | Where the weekly schedule lives today, and in how many places | Shadow day P observations: list every place the schedule exists | places: ______ | S |
| A3.2 | Customers book through public pages (≥ 80 % ⚑) | Share of group + Open Gym bookings that clients make **themselves, without a message to a person** | Part C: self-service bookings ÷ all group + Open Gym bookings (probably 0 %) | % | T |
| A3.3 | Booking is easy (≥ 70 % conversion; < 5 min to verify) | Time from a client's first booking message to a confirmed booking | Part C: note the time for each booking where you can see both moments; report the median | median ____ min (n = ___) | T / S |
| A3.4 | Open Gym receives bookings (⚑) | Open Gym bookings per week today, and requests per week | Part C Open Gym rows + interview 7.2 | bookings ___/wk · requests ___/wk | T / I |
| A3.5 | Workout logging replaces Word and by-hand notes (≥ 80 %) | Share of private sessions with a workout recorded anywhere (Word, paper, app) | Shadow day: count the observed private sessions with a recorded workout; and ask per trainer for the last week | % (n = ___ sessions) | S / I |
| A3.6 | Notes replace scattered tools | Number of places where client notes live | Interview 5.1 + 10.4; count distinct places | ____ places: ______ | I |
| A3.7 | Previous performance is easy to access (≥ 4/5) | Trainer rating 1–5 "how easy is it to see what a client did last time" + measured seconds to find it | Interview 4.4 / 10.3 (median over trainers); shadow day: time the look-up | rating ____ /5 · ____ s | I / S |
| A3.8 | Admin time reduced (⚑ e.g. −50 %) | = A2.1 | — | h/week | D |
| A3.9 | Strongest signal: "would you go back?" | Satisfaction with today's way of working, 1–5 | Interview 8.4 | ____ /5 | I |
| A3.10 | Normal usage needs no developer | Not applicable before the platform exists | — | n/a | — |
| A3.11 | Reliability (uptime, cross-tenant incidents, crash-free sessions) | Not applicable before the platform exists | — | n/a | — |
| A3.12 | Dutch- and English-only users complete everything | Clients who prefer English (context for the EN share) | Interview 3.6 | ≈ ____ clients | I |

### A4. Extra context (optional but useful)

| # | Metric | How to measure | Result | Source |
|---|---|---|---|---|
| A4.1 | Messages about appointments outside working hours, per week | Part B: tick the "after hours" column | | D |
| A4.2 | Scheduling mistakes in the last month (double booking, wrong time or place, forgotten substitution) | Interview 2.5 | | I |
| A4.3 | Time to arrange a trainer substitution | Interview 2.3, or observed | min | I / S |

---

## Part B — 7-day admin diary

*Filled in by the gym owner. Instructions are in Dutch, with English underneath.*

**Instructie:** Schrijf elke dag op hoeveel minuten je besteedt aan administratie, per soort. Afronden op 5 minuten is prima. Doe het liefst direct na elk blok, of in ieder geval aan het eind van de dag. Tijd met een klant (de training zelf) telt niet mee. Het gaat om alles eromheen.\
*Instruction: each day, write down how many minutes you spend on admin, per type. Rounding to 5 minutes is fine. Ideally fill it in right after each block, or at least at the end of the day. Time with a client (the training itself) doesn't count; it's about everything around it.*

| Code | Wat telt mee / What counts |
|---|---|
| **P** Planning | Rooster maken en wijzigen, privétrainingen inplannen of verzetten, vervanging regelen · *Making and changing the schedule, planning or moving private sessions, arranging substitutes* |
| **B** Boekingen | Boekingsverzoeken, bevestigen, afzeggingen, plekken tellen, berichten over afspraken · *Booking requests, confirming, cancellations, counting spots, messages about appointments* |
| **L** Trainingen | Schema's maken, sets en gewichten bijhouden, opzoeken wat iemand vorige keer deed · *Writing programmes, recording sets and weights, looking up what someone did last time* |
| **N** Notities | Notities over klanten of trainingen schrijven of opzoeken · *Writing or looking up notes about clients or sessions* |
| **A** Aanwezigheid | Bijhouden wie er was, niet verschenen opvolgen · *Tracking who attended, following up no-shows* |
| **O** Open Gym | Vrij trainen plannen, aankondigen, aanmeldingen bijhouden · *Planning and announcing free training, tracking sign-ups* |
| **C** Facturen en betalingen | Facturen maken of aanpassen, betalingen opvolgen, abonnementen en sessiepakketten bijhouden · *Making or editing invoices, following up payments, keeping track of memberships and session packs* |
| **X** Overig | Salaris, marketing, boekhouding · *Payroll, marketing, bookkeeping* |

**Minuten per dag / Minutes per day**

| Dag / Day | Datum / Date | P | B | L | N | A | O | C | X | Na werktijd? (min) / After hours? (min) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | |
| 2 | | | | | | | | | | |
| 3 | | | | | | | | | | |
| 4 | | | | | | | | | | |
| 5 | | | | | | | | | | |
| 6 | | | | | | | | | | |
| 7 | | | | | | | | | | |
| **Totaal / Total** | | | | | | | | | | |

- Was dit een normale week? / *Was this a normal week?* ☐ Ja / Yes ☐ Nee / No, omdat / because: ______________________
- Totaal P, B, L, N, A, O en C (min) / *Total P, B, L, N, A, O and C (min):* ________ → ÷ 60 = ________ uur / *hours* → **A2.1**
- Totaal X (min) / *Total X (min):* ________ → ÷ 60 = ________ uur / *hours* → **A2.2**

---

## Part C — Booking and attendance tally

*Filled in by the gym owner during the same 7 days. Each row is one booking (or booking request). Use Klant A, Klant B … or leave the client column out. Never write names.*

**Instructie:** Schrijf elke boeking of elk boekingsverzoek op één regel. Na de les of training vul je in of de klant er was.\
*Instruction: write every booking or booking request on one line. After the class or session, fill in whether the client came.*

**Kanaal / Channel:** **W** = WhatsApp · **I** = Instagram/Facebook · **T** = telefoon / *phone* · **S** = sms · **E** = e-mail · **P** = persoonlijk / *in person* · **Z** = zelf geboekt zonder bericht (bijv. boekingssysteem) / *self-booked without a message (e.g. booking tool)* · **A** = anders / *other*

**Soort / Type:** **G** = groepsles / *group class* · **PT** = privétraining / *private session* · **OG** = Open Gym

**Uitkomst / Outcome:** **✓** = aanwezig / *attended* · **NV** = niet verschenen / *no-show* · **AF** = op tijd afgezegd / *cancelled in time* · **LA** = te laat afgezegd / *late cancellation*

| # | Datum verzoek / Request date | Tijd eerste bericht / First message time | Tijd bevestigd / Confirmed time | Kanaal / Channel | Soort / Type | Datum les / Session date | Uitkomst / Outcome |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |
| 7 | | | | | | | |
| 8 | | | | | | | |
| 9 | | | | | | | |
| 10 | | | | | | | |
| 11 | | | | | | | |
| 12 | | | | | | | |
| 13 | | | | | | | |
| 14 | | | | | | | |
| 15 | | | | | | | |
| 16 | | | | | | | |
| 17 | | | | | | | |
| 18 | | | | | | | |
| 19 | | | | | | | |
| 20 | | | | | | | |

*Print extra copies as needed. For recurring bookings (the same client in the same class every week), one row per occurrence is enough: fill in the outcome only.*

### Tally summary (you fill this in afterwards)

| Channel | Group | Private | Open Gym | Total | % of total |
|---|---|---|---|---|---|
| WhatsApp | | | | | |
| Instagram / Facebook | | | | | |
| Phone | | | | | |
| SMS | | | | | |
| Email | | | | | |
| In person | | | | | |
| Self-booked | | | | | |
| Other | | | | | |
| **Total** | | | | | 100 % |

| Outcome | Count |
|---|---|
| Attended | |
| No-show | |
| Cancelled in time | |
| Late cancellation | |
| **No-show rate** = no-show ÷ (attended + no-show) | % → **A2.6** |
| **Late-cancellation rate** = late ÷ all | % → **A2.7** |
| **Median time to confirm** (first message → confirmed) | min → **A3.3** |

---

## Part D — Results summary

Copy this into `results/baseline.md`, together with Part A.

| Baseline | Value | Measured over | Confidence (high / medium / low) |
|---|---|---|---|
| Admin hours/week, gym owner, MVP scope (A2.1) | | | |
| Admin hours/week, gym owner, outside MVP (A2.2) | | | |
| Admin hours/week, other trainers (A2.3) | | | |
| Number of tools (A2.4) | | | |
| Booking method: top channel and % (A2.5) | | | |
| Self-service booking share (A3.2) | | | |
| No-show rate (A2.6) | | | |
| Late-cancellation rate (A2.7) | | | |
| Median time to confirm a booking (A3.3) | | | |
| Open Gym bookings / requests per week (A3.4) | | | |
| Private sessions with a recorded workout (A3.5) | | | |
| Places where notes live (A3.6) | | | |
| Ease of seeing last time, rating / seconds (A3.7) | | | |
| Satisfaction with current way of working (A3.9) | | | |
| Weekly schedule size (A1.6) | | | |

**Measured by:** ______________ **Diary week:** ______________ **Agreed with the gym owner on:** ______________
