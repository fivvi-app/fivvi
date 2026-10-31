# UX questions for M0 validation

These questions record assumptions in the [information architecture](information-architecture.md) and [six flows](README.md). None is an approved requirement. The wireframes show a proposal so the pilot owner and another trainer can react to a concrete screen. Record the answer, participant, date and affected screen IDs here after validation; then update the flow, feature spec and glossary where relevant. Product scope or permission changes require an owner decision before implementation.

**Status:** Open for the M0 prototype review. The [validation script](../discovery/prototype-validation-script.md) covers the six tasks; use the questions below as follow-ups, not as a replacement for observing the tasks.

## Pilot workflow and terminology

### Q01
Should the owner default to the workspace day on web and their own day on mobile? Is a switch between the two useful? **Proposal:** workspace on web, personal on mobile (WC-01, TD-01).

### Q02
Should trainers see the whole workspace calendar, or only their assigned sessions? **Proposal:** read-only workspace calendar; their own sessions remain editable where permitted (WC-02). Check this against client privacy.

### Q03
Which workspace clients may a trainer open: all, assigned only, or clients they have trained? **Proposal:** workspace client list, with access to notes determined separately by Q04 (TW-01/02).

### Q04
Who may read trainer-only notes about a client within a workspace? **Proposal:** the owner and trainers with access to that client. Health-related content makes this a privacy decision (TW-02, TD-02).

### Q05
**Resolved by the owner, 20 October 2026.** There is no Admin role in the MVP (`PRODUCT.md §9, §50`): the Owner does everything, including the money, and the Trainer runs their own sessions and classes, calendar and attendance. Admin is a later role 🔜, added when a gym asks for a manager who isn't the owner (Release 7.0 "advanced permissions", or earlier on request). Still open from this question: may a trainer copy or share booking links? **Proposal:** trainers may share a published link (TW-07, TD-03).

### Q06
**Resolved by the owner, 29 October 2026.** The owner decided the glossary terms (*werkruimte*, *privésessie*, *trainingsschema*, *vervanger* and the commerce terms) by choosing the standard Dutch wording, not by pilot validation; see the [glossary's open questions](../../packages/i18n/GLOSSARY.md#8-open-questions). Use these terms (PS-01, CO-02).

### Q07
How far ahead do clients expect to browse available lessons? **Proposal:** 14 days, with another 14 on request (PB-01).

### Q08
When should a class stop accepting bookings? **Proposal:** at its start time (PB-01/03).

### Q09
When may a client cancel a booking, and must that differ for Open Gym? **Proposal:** until the start time. A cancellation cutoff per offer is now MVP with commerce (see QC02, `PRODUCT.md §93`); Open Gym may use a different cutoff or none (CW-03; cutoff rules in QC02).

### Q10
How long should a pending email confirmation hold a place? **Proposal:** 15 minutes, ending earlier if the class starts (PB-04).

### Q11
Which details make a class choice clear: exact available places, trainer, location, or only a full/available label? **Proposal:** show trainer and remaining places (PB-01/02).

### Q12
If verification arrives after the hold expires but capacity remains, may the client confirm immediately? **Proposal:** offer a fresh capacity check and confirmation, never silently reclaim the old hold (PB-08).

### Q13
Is a six-digit code beside the email link useful for clients who read mail on another device? **Proposal:** both in the same email; code entry on PB-04 (ADR-007).

### Q14
How much location detail does a class or Open Gym listing need, and must an Open Gym slot name a trainer? **Proposal:** show the venue/address in details; no trainer line for Open Gym unless assigned (PB-02, WC-03). **Owner (14 October 2026):** show a short class description, one line on the list and in full on PB-02. The address is still open.

### Q15
Do clients use an add-to-calendar action from a booking confirmation? **Proposal:** one-event calendar download (PB-06).

### Q16
**Resolved by the owner, 19 October 2026.** There are no guests: every client's account is created automatically at their first verified booking (`PRODUCT.md §2.4, §26`). The booking page explains this with one line before the client submits it; there is no account-creation screen and no choice to make. Managing one booking by the email link remains possible either way (`/manage/{token}`, CW-03). Whether a signed-in, already-verified client can book again without a new confirmation email is still open — see QE06.

### Q17
What must appear on a trainer's Today row to choose the next action quickly? **Proposal:** time, client/class, location, workspace and attendance cue (TD-01).

### Q18
When should Today prompt a trainer for missing attendance, and should private and class attendance use different shortcuts? **Proposal:** cue after the session ends (TD-01/02, CO-05).

### Q19
Which timezone should a travelling trainer's personal calendar use? **Proposal:** profile timezone, default Europe/Amsterdam; label it when device timezone differs (TD-01/04).

### Q20
Which calendar view and visible hours match the pilot's timetable? **Proposal:** week first, with day-by-trainer and list alternatives (WC-02/03/04).

### Q21
Is a month view or printable week needed for MVP? **Proposal:** print the week; no month grid until validated (WC-02).

### Q22
Should calendar colour primarily identify session type or trainer? **Proposal:** type; text labels remain visible (WC-02). **Interview 01 (19 October 2026):** the pilot uses colour today to tell private sessions from classes, and not everyone understands it. Every calendar names the type in words and filters by type and trainer (`PRODUCT.md §48`); colour only supports that.

### Q23
Will the owner move sessions by dragging them, or is a form enough? **Proposal:** both paths lead to the same confirmation (WC-07, PS-05).

### Q24
What should happen when a trainer is already assigned elsewhere at the proposed time? **Proposal:** visible warning, with a decision on whether a true conflict must block saving (PS-07).

### Q25
Which private-session durations should be one tap away? **Proposal:** common pilot durations, with a custom duration option (PS-01).

### Q26
Should new, moved and cancelled private sessions email the client automatically? **Proposal:** show the email effect before saving; notification scope also needs QE02 (PS-01/05/06).

### Q27
May trainers create, move or cancel their own private sessions, and may they do so for another trainer? **Proposal:** own sessions only; the owner manages all in their workspace (PS-01/05/06).

### Q28
(After go-live: the first release has one location per workspace, `ROADMAP.md` decision 12.) Which locations do trainers actually use, and when should the system remember a client's preferred location? **Proposal:** infer from client/workspace, ask only when ambiguous (PS-03).

### Q29
Does the gym need to record who initiated a private-session cancellation? **Proposal:** optional reason/initiator; omit if it adds administration without present value (PS-06).

### Q30
Is workout difficulty rated per set, per exercise, or per workout? **Proposal:** per exercise after the last set (WL-03).

### Q31
Which exercise measures beyond weight × reps are needed now, such as bodyweight, duration or distance? **Proposal:** bodyweight can omit weight; duration/distance need an explicit data-model decision (WL-03, QE10).
**Answer (owner, 14 October 2026):** every exercise has a type: weight × reps, reps only, time (m:ss) or distance + time (`PRODUCT.md §38`). The data model stays with QE10 (WL-02, WL-04).

### Q32
Do trainers log between sets, after the session, or both? What can they operate with one hand? **Proposal:** between-set logging on phone and later editing on web (WL-02/03/06).

### Q33
Which weight increments match the pilot's equipment and should quick controls follow those increments? **Proposal:** large step buttons plus direct number entry (WL-03).
**Answer (owner, 14 October 2026):** no step buttons. Values are typed directly in each set row on WL-02 with the numeric keypad. Each row is prefilled and logged with one tap (`PRODUCT.md §41`).

### Q34
Should finishing a workout mark private-session attendance automatically? **Proposal:** mark attended, with a visible confirmation or correction path (WL-05).

### Q35
Should previous exercise values logged by another trainer in the same workspace be visible? **Proposal:** yes, with trainer attribution; never cross workspace boundaries (WL-03).

### Q36
Should a trainer substitution notify booked clients? **Proposal:** optional, off by default when only the trainer changes (CO-02).

### Q37
How does a substitute learn about an assignment, and should the original trainer get a notice? **Proposal:** email the substitute; this adds a template to the MVP email list (CO-02, QE01).

### Q38
Who records class attendance, and when? **Proposal:** assigned trainer or owner from 30 minutes before start (CO-05/06).

### Q39
May staff add walk-ins, including when capacity is full? **Proposal:** add a participant within capacity only; anything else needs a capacity policy (CO-07).

### Q40
May an assigned trainer substitute themselves or cancel a class occurrence? **Proposal:** the owner handles those changes; trainer handles attendance (CO-01/02/03).

### Q41
Does the owner need to undo a cancelled class after notifications have gone out? **Proposal:** no undo in MVP; validate the recovery action before building (CO-03).

### Q42
Should a class cancellation offer a custom message to booked clients? **Proposal:** optional message in the required cancellation email (CO-03).

## Product and engineering decisions exposed by the flows

### QE01
Decide whether the substitute-trainer email (EM-10) belongs in F049/F024. `PRODUCT.md §51` does not list it. If approved, add it to the feature specification and both language catalogs before implementation.

### QE02
Decide whether private-session creation email (EM-11) belongs in F049/F020 and what happens when the client has no email. `PRODUCT.md §51` lists schedule changes and cancellations but does not explicitly list a new private-session email.

### QE03
**Resolved by the owner-approved glossary v0.2:** English uses en-GB formatting, day-month dates and 24-hour time. The catalog remains `en`. Keep this entry as the record for older flow references; no further pilot decision is needed.

### QE04
**Resolved by owner, 22 September 2026.** A trainer saves an internal note separately from an optional client message. After explicit review and share, the client sees the workout recap and client message in *Mijn trainingen* in the signed-in profile and receives the same in a localized email. The internal note is excluded. A private session does not become a client booking in CW-02/03 solely because its workout was shared.

### QE05
Decide whether a signed-in client sees bookings across all workspaces sharing the verified email, with per-workspace authorization on each booking (CW-02).

### QE06
Decide whether an authenticated, verified client can book without a new email confirmation, while still using the same atomic capacity check (PB-03/06).

### QE07
Decide whether a short booking link may change target after a QR code is printed. Define how inactive or retargeted links behave, including safeguards against redirecting a class-specific link to another class (PB-09).

### QE10
Specify the workout log model for non-weight measures, per-set difficulty, previous-value lookup and idempotent writes before F043 implementation (WL-03/07).

### QE11
Cross-workspace conflict warnings may expose another workspace's session details. Decide a privacy-safe response before implementing PS-07; a generic “you are busy” warning may be sufficient, and workspace-scoped screens must never query another workspace's business records.

### QE12
Decide whether substitution and class cancellation are necessary on the M8 trainer apps. The current M8 mobile scope explicitly covers attendance; web can handle administration (CO-02/03/05).

### QE14
Define concurrent edits to the same workout or set before implementing the proposed offline queue and web/phone sync. “Last edit wins” could discard work; server conflict handling and recovery must be designed and tested (WL-07).

### QE15
Starting a workout from a client profile creates a private session that starts now (flow 05, WL-01). Confirm the default duration (proposal: 60 min), that it counts in *Mijn dag* and reports like a planned session, and whether a trainer in someone else's workspace may do this (same rule as creating their own private sessions, Q27).

### QE16
The trainer apps can now create group classes (one-off or weekly) and Open Gym for owners (flow 02, TD-05). Confirm the weekly series horizon (prototype: 8 weeks; ADR-012 proposes a rolling 12-week window) and that editing or ending a series stays web-only in MVP.

### QE17
Decide whether verifying a booking (PB-05/PB-06) signs the client in, so *Naar mijn boekingen* can go straight to CW-02, or whether it still needs a separate CW-01 sign-in. Nobody has decided this; it sits next to QE06 (PB-06, CW-01/02).

## Commerce (interview 01 follow-up)

Commerce moved into the MVP after interview 01 with the pilot owner (19 October 2026, [`results/interview-01.md`](../discovery/results/interview-01.md), `ROADMAP.md` v1.19). Credits (group and private, in packs and plans) followed on 21 October 2026 (owner decision, `ROADMAP.md` v1.21, decision 9): QC17 and QC18 are about them, QC19 is about the default plans, and QC02, QC08, QC12, QC14 and QC16 mention them. These questions block the M11 specs; ask them in the commerce walkthrough (`ROADMAP.md §4.1`) and record the answers here. Never ask for or record real client names, bank details or invoices.

**Status (31 October 2026):** the commerce walkthrough with the pilot gym owner is held ([#150](https://github.com/fivvi-app/fivvi/issues/150)). Every question below has an answer or "the proposal stands"; what is still open is marked in the answer and listed at the end of this section. Where an answer replaces the proposal, the proposal text is kept above it.

### QC01
Does a fixed-weekday membership keep a spot in the chosen classes for its whole term, or does the client book each week within what the membership allows? **Proposal:** a standing spot in the chosen weekly classes, counted against capacity; the client cancels single occurrences (`PRODUCT.md §91`).
**Answer (pilot gym owner and product owner, 31 October 2026):** No fixed days and no standing spot. A membership gives a number of group classes **per week** (1, 2 or 3) and the client books each class themself whenever a spot is free; many keep the same day and time out of habit. The pilot's membership is therefore a **weekly allowance** membership (`PRODUCT.md §91`), not a fixed-weekday one. This replaces the first in-chat answer ("a standing spot"), which was given before the gym owner answered.

**Decision (product owner, 31 October 2026):** two workspace settings, for every studio. A **weekly limit**: the most bookings one client can make in a week, or off; the pilot uses 4 whatever the membership size, so a client can catch up (hardly anyone trains more than 4 times). **Unused weekly classes**: they expire at the end of the week (the pilot's choice) or stay valid until the agreement ends; Fivvi handles both automatically, and the weekly limit stops a client from saving them up and using them all at once.

### QC02
What is the cancellation cutoff (12 or 24 hours mentioned), and is it the same for every offer and for private sessions? Does a cancellation in time return the credit of a credit pack or plan, and does the workspace's own cancellation? **Proposal:** one cutoff per offer, default 24 hours for private sessions and 12 for classes; a cancellation in time and a cancellation by the workspace return the credit (`§93`).
**Answer (pilot gym owner, 31 October 2026):** The cutoff is **12 hours for group classes and 24 hours for private sessions**. When the workspace cancels, everyone gets the class back in full (a makeup that does not count toward the limit, or the credit). When a client cancels in time, they get the class back (a makeup on a membership, the credit on a credit plan), **at most 2 times per month**; after that the class is lost. A late cancellation counts as a no-show: the class is lost. For a private session, "in time" includes moving it, up to 24 hours before, within the same limit of 2 a month (QC17).

### QC03
How many makeups does a membership allow, how long do they stay valid, and can a makeup be used in any class or only the same type? **Proposal:** a limit per term set on the offer; valid until the end of the term; any class the membership could include (`§93`).
**Answer (pilot gym owner, 31 October 2026):** **2 makeups per month**: this is the same rule as the 2 cancellations in QC02. A makeup stays valid **until the end of the membership** and can be used in **any class the membership includes**. The gym owner also adds catch-up classes by hand (for example after a holiday while the client kept paying); they must be used within the membership. The pilot gym's public terms let private sessions be made up until 30 days after the term ends and group classes not after the term. The default membership's makeup limit (QC19 e) is 2 per month.

### QC04
What happens on illness, holidays, a gym closure or a trainer's absence: makeup, pause, or nothing? Is a pause (freeze) needed for go-live? **Proposal:** the workspace's own cancellation gives a makeup outside the limit; no freeze in MVP unless the pilot uses one today.
**Answer (pilot gym owner, 31 October 2026):** The proposal stands: a cancellation by the workspace gives a makeup outside the limit; illness and holidays fall under the normal limit of QC03; **there is no pause (freeze)**, the pilot has none today. The gym owner can add catch-up classes by hand (QC03).

### QC05
When a recurring payment fails, can the client keep booking, and for how long? Who follows it up? (What happens to a credit plan's credits of that month is QC17.) **Proposal:** a setting per offer, default "keep booking for 14 days"; the client and the owner both get an email, and the owner sees the open amount (`§94`).

ADR-020 suggests: no automatic retry in the MVP (Mollie documents none for payments we create; to confirm with Mollie); the client gets a link to pay the open amount by iDEAL. The booking period stays open here.
**Answer (pilot gym owner, 31 October 2026):** The proposal stands: a setting per offer, default "keep booking for 14 days"; the client and the owner get an email; the owner sees the open amount; the client pays it by iDEAL link; no automatic retry. Today the gym owner follows up by message.

### QC06
Which payment methods do the clients use today for the first payment and the recurring ones (iDEAL, SEPA Direct Debit, card)? On which day of the month is a membership collected? **Proposal:** iDEAL for the first payment, SEPA Direct Debit monthly on the agreement's start day.

ADR-020 (Accepted) settles: an iDEAL first payment that creates the SEPA mandate, then SEPA Direct Debit collected by our daily cron on the due date (no provider subscriptions). Open here: what the clients use today and the collection day. Open with Mollie: whether an iDEAL payment on Wero rails still creates a mandate (fallbacks: Pay by Bank, or IBAN and mandate on our page).
**Answer (pilot gym owner, 31 October 2026):** Group: the proposal stands (an iDEAL first payment, then SEPA Direct Debit monthly on the agreement's start day). Private training is a monthly invoice sent by message and paid by hand today; the gym owner wants it to move to **direct debit too**, the same as group.

### QC07
What are the membership terms today: minimum term, tacit renewal, notice period, early ending? They must fit Dutch consumer law (ACM) before G4. **Proposal:** fixed term, then monthly with one month's notice, reviewed in the `ROADMAP.md §4.4` legal check.
**Answer (pilot gym owner, 31 October 2026):** Memberships run **6 or 12 months**; most clients choose 12 (stability for the gym, less hassle for the client). The gym's own terms set a **minimum term of 3 months**, no automatic renewal and no early ending (the full term is due). Private training is sold for 6 months today.

**Dutch law** (see the comment on [#165](https://github.com/fivvi-app/fivvi/issues/165)): no tacit renewal for another fixed term (art. 6:236 j BW); a first term over 12 months is presumed unreasonable (6:237 k); notice at most one month (6:237 o), on any day (6:236 r), online if the client signed up online (6:236 o).

**Decision (product owner, 31 October 2026):** each offer gets an **end-of-term setting**: **stop** (the client actively chooses a new term, with a reminder and a one-tap renewal) or **continue per cycle** at the same price until the client gives notice (at most one month, on any day, online). Today the pilot's clients choose a new 6-month term themselves; which setting the pilot uses in Fivvi is **still open** with the gym owner.

**Still open (lawyer, #165):** early ending. Private training is likely an *opdracht* (7:408): the client may end it at any time, a fixed penalty is likely void and the gym keeps a reasonable part of the fee (7:411). It is unclear for group and combined plans.

### QC08
How are private sessions sold today: a number of sessions with a validity, or a weekly rhythm for a term, and paid up front or monthly? Would the gym sell them as a private credit pack (bought once) or a private credit plan (credits every month, paid monthly), and does it want group credits too? What happens to unused credits at the end (QC17)? **Proposal:** offer both kinds, group and private; a credit pack paid up front (monthly instalments only if the pilot uses them today) and a credit plan paid monthly; unused credits expire, visible in the history (`§90`, `§92`).
**Answer (pilot gym owner, 31 October 2026):** Private training is a **private credit plan**: 1 session a week, paid monthly by direct debit, for 6 months today. Group is the weekly-allowance membership of QC01, 1, 2 or 3 times a week, paid monthly; the gym owner needs monthly payments for long commitments. The pilot also sells a **combination** of 1 private session and 1 group class a week. Group and private credits never mix, so that is two agreements (a membership and a private credit plan) sold together; how to present them as one product is for the F052 spec. A member who wants an extra class in a week buys **group credits** (one, or a pack); they must be used during the membership. Unused credits expire at the end of the term; private sessions get the 30-day grace of QC03.

**Decision (product owner, 31 October 2026):** an offer setting **"only clients with an active membership can buy this"** (a member-only offer).

### QC09
Can the existing direct-debit mandates move from the current app to a new payment provider account (ADR-020, Accepted, settles the gym's own Mollie account), or does every client give a new one? **Proposal:** a new mandate through a first payment link, sent to every client at the cutover (`ROADMAP.md §7`).

ADR-020 suggests: the same, a new mandate for every client. Mollie's Mandates API could import existing mandates, but that depends on the old provider and creditor identifier; it stays open and is only asked if the owner wants to avoid the first-payment links.
**Answer (pilot gym owner, 31 October 2026):** **A**: a new mandate for every client through a first-payment link. Agreements already running move over unchanged (same end date, remaining sessions and next payment date), and the client pays the link by their next payment date, with no extra window. With A4 and A5 at week 0 (`metric-targets.md`), the links go out before go-live.

### QC10
What must the invoices show: company names, VAT number, the gym's KvK and VAT number, a VAT rate per service, and is the private training sold by the same legal entity as the group classes? **Proposal:** one seller per workspace; billing details per client (`§96`); the gym's accountant checks a sample before G4.
**Answer (pilot gym owner, 31 October 2026):** One seller (one legal entity) sells group and private training, at the **same VAT rate** for both. Some clients need an invoice in a company's name with its VAT number (billing details, `PRODUCT.md §96`). The gym's accountant checks a sample before G4 ([#166](https://github.com/fivvi-app/fivvi/issues/166)).

### QC11
What is the "kiosk" or pay-at-the-desk option in the current app, and is it used? **Proposal:** not in MVP (`PRODUCT.md §53`) unless the pilot uses it weekly.
**Answer (pilot gym owner, 31 October 2026):** Not used. Not in the MVP.

### QC12
May a trainer see the credit balances of the clients they train? **Proposal:** yes, the balances of their own clients, not amounts, payments or invoices; the owner does all commerce (agreements, prices, refunds, payouts, billing details, the provider connection). With no Admin role in the MVP (resolved by the owner, 20 October 2026, see Q05) there is no one in between.
**Answer (pilot gym owner, 31 October 2026):** The proposal stands.

### QC13
What does the pilot pay today: the subscription (per month or per year, VAT included?) and the fee per payment, and is there a separate provider fee? (The figures stay in the owner's private notes, not in the repository.) What does a weekly payout need to show? **Proposal:** record only the outcome of the comparison here (for example "cheaper / similar / more expensive per payment"), never the figures; compare with the list prices in ADR-020.

ADR-020 notes: the public list prices of Mollie and Stripe are close enough that fees don't decide the provider (see the [fee comparison in ADR-020](../decisions/ADR-020-payment-provider.md#fees-per-payment-public-list-prices-netherlands-20-october-2026)). This question stays open: the comparison with what the pilot pays today, and Mollie's failed-debit and storno fees for the gym.
**Answer (pilot gym owner, 31 October 2026):** The outcome: **Mollie is cheaper per payment** than the current app (no figures recorded). The current booking and payments app is **Pay'n Plan** (weekly payout). It charges its fee **to the clients**, not to the gym; in Fivvi the gym pays Mollie's fee. Passing a payment-method surcharge on to consumers is often not allowed in the Netherlands, so it is added to the legal check (`ROADMAP.md §4.4`, #165) and stays **open**. Payouts: weekly is fine, but the gym owner wants **as much detail as possible**, each payment and not only a total (`PRODUCT.md §97`). Wish, not a requirement: a payout on demand (the current app has a cash-out-at-any-time button).

### QC14
Which data can the pilot export from the current app (clients, memberships, credit balances and makeups, next due dates), who does it, and how long does it take? **Proposal:** an export the gym owner makes, mapped to the E015 import template (`docs/discovery/import-checklist.md`); an old offer that covers both group and private credits is listed as two offers, since the kinds never mix.

**Decision (product owner, 31 October 2026):** Fivvi helps the gym move its data, and making the move easy is a promise. On our side only synthetic data is used; the gym owner, with the product owner, does the real upload with the E015 template and a guide. **Still open:** whether the current app (Pay'n Plan) can export, and what; to check with the gym owner. For invoices, private sessions are tracked in Word today; whether the invoices are also made there, and so the name of the invoicing tool, is unconfirmed.

### QC15
When the owner changes any field of an offer (price, VAT rate, classes and weekdays, credits, term or validity, payment schedule, cancellation cutoff, makeup limit, carry-over), switches it off or deletes it, does that also change agreements that already run? **Proposal:** a change applies to new agreements only, and so does switching an offer off or deleting it: an agreement that already runs keeps the terms it started with, including its price and cancellation policy (`PRODUCT.md §90`, `§93`). What the defaults start with and when an offer can be switched on is QC19.
**Answer (pilot gym owner, 31 October 2026):** The proposal stands.

### QC16
Does the pilot agree with these four rules? (1) The trainer and client apps never take payments; clients pay on the web. (2) A single class's spot is held while the client pays. (3) The owner can also enter billing details (company name, address, VAT number) for a client. (4) A late cancellation counts like a no-show, and a no-show uses the credit of a credit pack or plan or is lost on a membership. **Proposal:** all four as written in `PRODUCT.md §93–§96`; the merchant model behind them (the gym as merchant, payouts to the workspace) is decided in ADR-020 (Accepted, 21 October 2026), not here.

ADR-020 (Accepted) settles: Mollie's hosted checkout on the web, and a one-off iDEAL payment for a single class (single classes are still proposed scope, decision 9). It suggests holding the spot while the client pays; how long the hold lasts is set in the F058 spec.
**Answer (pilot gym owner, 31 October 2026):** All four rules as written.

### QC17
What are the rules of the credit offers? (1) How long does a **credit pack** stay valid, and do unused credits expire or can the owner extend them? (2) What is the **carry-over limit** of a **credit plan**, and do carried-over credits expire (after one month, or never)? (3) When are a plan's credits for the month granted, and what happens to them when the payment fails or a debit is reversed? (4) When a client has several credit agreements of the same kind, which credit is used first? **Proposal:** (1) a validity set on the offer; unused credits expire at the end, shown as an *expired* line in the history, and the owner can extend them by a new line with a reason; (2) a carry-over limit set on the offer, default 0 (no carry-over) until the pilot says otherwise, and carried-over credits expire at the end of the next month; (3) the credits are granted when the month's payment is paid, and a reversed debit takes back the credits of that month that are still unused, the rest is left to the owner; (4) the credits that expire first (`PRODUCT.md §92`). The pilot's private agreement of about one session a week for six months can be a private credit pack or a private credit plan; the pilot decides which one it sells (QC08).
**Answer (pilot gym owner, 31 October 2026):** The proposal stands for (1)–(4). For private sessions, moving or cancelling up to 24 hours before counts as in time, within the limit of 2 a month (QC02).

### QC18
What does one credit cover? (1) Does one **private credit** cover a private session of any length, or does the length decide how many credits it takes? (2) Does **Open Gym** use group credits? (3) Can a group credit book any group class, or are some classes excluded (a workshop, a class with a guest trainer)? (4) When a client has both a membership and group credits, which agreement does a booking use? **Proposal:** (1) yes, one credit per session whatever its length; the trainer sets the length on the session; (2) no: Open Gym is booked like today, without credits, and the pilot decides whether that changes; (3) any group class, with an exclusion set per class if the pilot needs it; (4) the membership first, and the client or the owner can choose the credits for an extra class (`PRODUCT.md §92`).
**Answer (pilot gym owner, 31 October 2026):** (1) One private credit per session whatever its length (the proposal). (2) **Open Gym has its own kind of credits**, separate from group and private credits; this changes the proposal "Open Gym without credits" and affects F034 and F035 and the credit kinds in `PRODUCT.md §92`. (3) Not asked; the proposal stands. (4) The membership first; credits are only for an extra class (QC08).

### QC19
Which rules go with the default plans and the owner-made offers? The owner decided on 21 October 2026 that a new workspace starts with three default plans (a membership, a group credit pack and a private credit plan), pre-filled and switched off until the owner turns them on; that the owner adds the price; that the owner can change every field of an offer, switch a default off or delete it; and that the owner can create own offers of the four kinds. The rules around that are open: (a) can an offer be switched on without a price? (b) do later changes to Fivvi's defaults reach workspaces that already exist? (c) which VAT rate do the defaults start with? (d) which term does the private credit plan have? (e) what is the default membership's makeup limit? **Proposal:** (a) no: an offer can't be switched on until it has a price; (b) no: a workspace gets its own copy when it is created, and later changes to Fivvi's defaults never change an existing workspace; (c) the owner sets the VAT rate; the default starts with the workspace's usual rate, which the gym's accountant checks (QC10); (d) no fixed term: the plan is paid monthly and the client can cancel it according to the membership rules (QC07); (e) none is proposed yet: the makeup limit stays with QC03 until the pilot answers it (`PRODUCT.md §90`).
**Answer (pilot gym owner, 31 October 2026):** (a), (b) and (c) were not asked explicitly; they stay the proposals above and are **unconfirmed**. (d) The default private credit plan has a **minimum term of 3 months**. (e) The default membership allows **2 makeups per month**.

### Product-owner decisions of the commerce walkthrough (31 October 2026)

The walkthrough with the pilot gym owner (29–31 October 2026) led the product owner to decide the following for **every workspace**, mostly as settings. The pilot's choice is given where it differs. They are in `PRODUCT.md §54` and `§90–§97`.

1. **Billing cycle per offer: every month or every 4 weeks.** The pilot uses **monthly** on purpose: 4-weekly means 13 payments a year, which the gym owner finds unfair to clients.
2. **Intro offer:** a credit pack can be marked **"once per client"** (for example 2 classes valid for 2 weeks). The pilot does trials by hand over WhatsApp and will not use it.
3. **Single class** stays an offer kind any studio can switch on (the product owner's wish; it was proposed scope under [decision 9](../product/ROADMAP.md#14-decisions)).
4. **Member-only offers** (QC08).
5. **End-of-term setting:** stop, or continue per cycle (QC07).
6. **Weekly limit** and **unused weekly classes** settings (QC01).
7. **Plan changes:** the pilot allows **upgrades at any time and no downgrades** (in its terms).
8. **Waitlist before the pilot**, moved forward from Release 1.1 (`PRODUCT.md §54`). The pilot gym has one today: the first in line gets the spot and an email. The gym owner's problem is that a spot can be given 1 minute before the class starts. Wanted: a **cut-off a few minutes before the class** (the owner sets it) after which nobody is moved up, and a **message to waitlisted clients who did not get in**. The milestone and feature ID of the waitlist are for the owner to place (`FEATURES.md` notes that it moved to the MVP; the feature ID is still to place).
9. **Group credit plan** (credits every cycle, book any class) stays possible as an owner-made offer. It was offered to the pilot as an option; the pilot keeps the weekly-allowance membership.

**Still open after the walkthrough:** which end-of-term setting the pilot uses and early ending (QC07, lawyer, #165); what the current app can export (QC14); passing a payment-method surcharge on to consumers (QC13, legal check); confirmation of QC19 (a)–(c); the name of the invoicing tool.
