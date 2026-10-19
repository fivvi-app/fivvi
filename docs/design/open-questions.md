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
Who may read trainer-only notes about a client within a workspace? **Proposal:** owner, admin and trainers with access to that client. Health-related content makes this a privacy decision (TW-02, TD-02).

### Q05
Which administrative actions may an admin perform, and may a trainer copy or share booking links? **Proposal:** admin manages classes, Open Gym and links; only owner changes roles/settings; trainers may share a published link (TW-06/07/08, TD-03).

### Q06
Does the gym say *privésessie* for a private appointment? Confirm *werkruimte*, *trainingsschema* and *vervanger* against the [glossary's open terms](../../packages/i18n/GLOSSARY.md#8-open-questions-validate-with-the-pilot-owner). **Proposal:** use glossary terms until validated (PS-01, CO-02).

### Q07
How far ahead do clients expect to browse available lessons? **Proposal:** 14 days, with another 14 on request (PB-01).

### Q08
When should a class stop accepting bookings? **Proposal:** at its start time (PB-01/03).

### Q09
When may a client cancel a booking, and must that differ for Open Gym? **Proposal:** until the start time. A cancellation cutoff per offer is now MVP with commerce (see QC02, `PRODUCT.md §93`); Open Gym may use a different cutoff or none (CW-03).

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
Should calendar colour primarily identify session type or trainer? **Proposal:** type; text labels remain visible (WC-02). **Interview 01 (19 October 2026):** the pilot uses colour today to tell private sessions from classes, and not everyone understands it. Every calendar names the type in words and filters by type and trainer (`PRODUCT.md §45`); colour only supports that.

### Q23
Will the owner move sessions by dragging them, or is a form enough? **Proposal:** both paths lead to the same confirmation (WC-07, PS-05).

### Q24
What should happen when a trainer is already assigned elsewhere at the proposed time? **Proposal:** visible warning, with a decision on whether a true conflict must block saving (PS-07).

### Q25
Which private-session durations should be one tap away? **Proposal:** common pilot durations, with a custom duration option (PS-01).

### Q26
Should new, moved and cancelled private sessions email the client automatically? **Proposal:** show the email effect before saving; notification scope also needs QE02 (PS-01/05/06).

### Q27
May trainers create, move or cancel their own private sessions, and may they do so for another trainer? **Proposal:** own sessions only; owner/admin manage all in their workspace (PS-01/05/06).

### Q28
Which locations do trainers actually use, and when should the system remember a client's preferred location? **Proposal:** infer from client/workspace, ask only when ambiguous (PS-03).

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
Who records class attendance, and when? **Proposal:** assigned trainer or owner/admin from 30 minutes before start (CO-05/06).

### Q39
May staff add walk-ins, including when capacity is full? **Proposal:** add a participant within capacity only; anything else needs a capacity policy (CO-07).

### Q40
May an assigned trainer substitute themselves or cancel a class occurrence? **Proposal:** owner/admin handle those changes; trainer handles attendance (CO-01/02/03).

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
The trainer apps can now create group classes (one-off or weekly) and Open Gym for owners/admins (flow 02, TD-05). Confirm the weekly series horizon (prototype: 8 weeks; ADR-012 proposes a rolling 12-week window) and that editing or ending a series stays web-only in MVP.

### QE17
Decide whether verifying a booking (PB-05/PB-06) signs the client in, so *Naar mijn boekingen* can go straight to CW-02, or whether it still needs a separate CW-01 sign-in. Nobody has decided this; it sits next to QE06 (PB-06, CW-01/02).

## Commerce (interview 01 follow-up)

Commerce moved into the MVP after interview 01 with the pilot owner (19 October 2026, [`results/interview-01.md`](../discovery/results/interview-01.md), `ROADMAP.md` v1.19). These questions block the M11 specs; ask them in the commerce walkthrough (`ROADMAP.md §4.1`) and record the answers here. Never ask for or record real client names, bank details or invoices.

### QC01
Does a fixed-weekday membership keep a spot in the chosen classes for its whole term, or does the client book each week within what the membership allows? **Proposal:** a standing spot in the chosen weekly classes, counted against capacity; the client cancels single occurrences (`PRODUCT.md §91`).

### QC02
What is the cancellation cutoff (12 or 24 hours mentioned), and is it the same for every offer and for private sessions? **Proposal:** one cutoff per offer, default 24 hours for private sessions and 12 for classes (`§93`).

### QC03
How many makeups does a membership allow, how long do they stay valid, and can a makeup be used in any class or only the same type? **Proposal:** a limit per term set on the offer; valid until the end of the term; any class the membership could include (`§93`).

### QC04
What happens on illness, holidays, a gym closure or a trainer's absence: makeup, pause, or nothing? Is a pause (freeze) needed for go-live? **Proposal:** the workspace's own cancellation gives a makeup outside the limit; no freeze in MVP unless the pilot uses one today.

### QC05
When a recurring payment fails, can the client keep booking, and for how long? Who follows it up? **Proposal:** a setting per offer, default "keep booking for 14 days"; the owner gets an email and sees the open amount (`§94`).

### QC06
Which payment methods do the clients use today for the first payment and the recurring ones (iDEAL, SEPA Direct Debit, card)? On which day of the month is a membership collected? **Proposal:** iDEAL for the first payment, SEPA Direct Debit monthly on the agreement's start day.

### QC07
What are the membership terms today: minimum term, tacit renewal, notice period, early ending? They must fit Dutch consumer law (ACM) before G4. **Proposal:** fixed term, then monthly with one month's notice, reviewed in the §4.4 legal check.

### QC08
How are private sessions sold today: a number of sessions with a validity, or a weekly rhythm for a term, and paid up front or monthly? What happens to unused sessions at the end? **Proposal:** a number of sessions with a validity, paid up front or in monthly instalments; unused sessions expire, visible in the history (`§92`).

### QC09
Can the existing direct-debit mandates move from the current app to the gym's new payment provider account, or does every client give a new one? **Proposal:** a new mandate through a first payment link, sent client group by client group during the switch-over (`ROADMAP.md §7`).

### QC10
What must the invoices show: company names, VAT number, the gym's KvK and VAT number, a VAT rate per service, and is the private training sold by the same legal entity as the group classes? **Proposal:** one seller per workspace; billing details per client (`§96`); the gym's accountant checks a sample before G4.

### QC11
What is the "kiosk" or pay-at-the-desk option in the current app, and is it used? **Proposal:** not in MVP (`PRODUCT.md §53`) unless the pilot uses it weekly.

### QC12
Which commerce actions may an admin take (agreements, refunds, prices, payouts), and may a trainer see the session balance of the clients they train? **Proposal:** admins manage agreements and see payments; only the owner changes prices, refunds and the provider connection; trainers see the balance of their own clients, not amounts.

### QC13
What does the pilot pay today: the subscription (per month or per year, VAT included?) and the fee per payment, and is there a separate provider fee? (The figures stay in the owner's private notes, not in the repository.) What does a weekly payout need to show? **Proposal:** record the answers here, like the other questions; compare in the ADR-020 spike.

### QC14
Which data can the pilot export from the current app (clients, memberships, remaining sessions, next due dates), who does it, and how long does it take? **Proposal:** an export the gym owner makes, mapped to the E015 import template (`docs/discovery/import-checklist.md`).

### QC15
When the owner changes an offer's price or cancellation policy, does it also change agreements that already run? **Proposal:** a price change applies to new agreements only, and an agreement keeps the cancellation policy it started with (`PRODUCT.md §90`, `§93`).
