# Fivvi

The domain language of Fivvi: a platform where gyms, studios and independent trainers run their scheduling, public booking, Open Gym, clients, workouts and notes. Use these terms in code, issues, specs, tests and conversation.

This glossary says what a concept **is**, in English. How each term is worded in the Dutch and English UI, plus tone and copy rules, is in [`packages/i18n/GLOSSARY.md`](packages/i18n/GLOSSARY.md) §4. Code names and i18n keys follow the English term here. 🔜 marks a concept for a post-MVP release, listed so nobody uses the word for something else meanwhile. Requirements: `docs/product/PRODUCT.md`.

## Language

### Workspaces, people and roles

**Fivvi**:
The product and its brand (domain fivvi.app; the working name was Trainer Hub). The client app of Release 1.2 is also called Fivvi.
_Avoid_: Trainer Hub (retired working name), FIVVI, Fivvi App

**Fivvi Pro**:
The business app for owners and trainers, on iOS and Android. Separate from the client app, **Fivvi** (Release 1.2).
_Avoid_: trainer app (in user-facing text)

**Workspace**:
A business on the platform: a gym, studio or independent trainer's business. It owns its clients, sessions, classes, locations and settings, and is the tenant boundary for all business data. Code and the database call it `organization` (`organization_id`).
_Avoid_: organization (outside code), org, company, account, tenant (outside code)

**Personal workspace** 🔜:
A trainer's own independent workspace, next to the workspaces they work for.

**Team**:
Everyone with a role in a workspace: the owner and the trainers (the MVP has no Admin role, see *Admin*).
_Avoid_: staff, personnel

**Team member**:
One person in the team.
_Avoid_: member, "membership" as a name for a person's place in the team (a client's agreement is the Commerce term; F003 "Workspace Membership" is the feature name), staff, user

**Role**:
What a team member may do in a workspace: Owner or Trainer, at most one per workspace (Admin is a later role 🔜). Being a client is not a role, and anonymous visitors have no role.
_Avoid_: permission level, custom role

**Owner**:
Manages the whole workspace, including trainers, settings, booking links and the money (offers, agreements, payments and invoices). Can also be a trainer.
_Avoid_: boss, Admin (a different, later role)

**Admin** 🔜:
A later role, not in the MVP: manages the calendar, classes, bookings, clients and trainers without full owner rights, for a gym that wants a manager who isn't the owner. Added when a gym asks for it (Release 7.0 "advanced permissions", or earlier on request).
_Avoid_: administrator, manager

**Trainer**:
Runs sessions and classes, logs workouts, writes notes and marks attendance. One trainer can work in several workspaces.
_Avoid_: coach, instructor, teacher, PT (as a role name)

**Independent trainer**:
A trainer who runs their own workspace.
_Avoid_: freelancer

**Client**:
A person who trains with or books at a workspace. Belongs to the workspace, not to one trainer. A team member can also be a client (`PRODUCT.md §2.9`).
_Avoid_: customer, member, user, athlete, guest

**Participant**:
A client on a session's list: booked into a class or Open Gym slot, or the client of a private session.
_Avoid_: attendee, student

**Invitation**:
An email from an owner asking someone to join the workspace as a trainer. Accepting it adds the role to the person's existing account, if they have one.

**Account**:
A login: required for a team member; created for a client at their first verified booking. One per person and email address, shared by every workspace the person belongs to.

**Sign in**:
To start using an account by verifying its email address with a magic link or a verification code.
_Avoid_: log in, login (as a verb), sign up, register, session (for being signed in)

**Sign-up** 🔜:
Creating a new account by choice, separate from a first sign-in, an accepted invitation or a client's first verified booking.

**Interface language**:
The language a person sees on screen: Dutch or English. It follows the person (their choice, their preference or their device), or a booking link's fixed language; never the workspace's default communication language.
_Avoid_: locale (outside code), app language

**Communication language**:
The language of an email or other message to a person: their stored preference, otherwise the workspace's default communication language; for a message with no workspace, such as the sign-in email, the interface language of the screen that asked (ADR-019).
_Avoid_: email language, workspace language

### Scheduling

**Session**:
The generic word for any scheduled item: a private session, a class occurrence or an Open Gym slot. Use the specific word when you mean one type. Not the state of being signed in to an account; say *signed in* for that.
_Avoid_: appointment, event, activity

**Private session**:
A trainer-led session for one named client, created by a trainer (an owner who trains counts as one).
_Avoid_: PT session, personal training, appointment, lesson

**Class**:
A group class owned by the workspace: name, description, trainer, location, capacity, duration and timetable.
_Avoid_: lesson, course, workshop, group session

**Occurrence**:
One dated instance of a (recurring) class, with its own trainer, capacity, bookings, attendance and status.
_Avoid_: instance, event

**Timetable**:
The recurring weekly pattern of a workspace's classes.
_Avoid_: schedule (as a noun)

**Recurring**:
Repeating on a fixed pattern in the workspace's local time, e.g. every Tuesday at 18:00.
_Avoid_: repeating, periodic

**Schedule**:
To put a session in the calendar (verb only).

**Reschedule**:
To move a session to another date or time.

**Cancel**:
To call off a session or class, or to withdraw a booking. The result is a cancellation.
_Avoid_: delete (for sessions or bookings)

**Assign**:
To link a trainer to a session, or a workout to a client.

**Substitution**:
Replacing the assigned trainer of one occurrence. Its bookings are not affected. The replacing trainer is the substitute.
_Avoid_: cover, stand-in, replacement

**Calendar**:
The day and week view of sessions. A trainer's **my calendar** combines all their workspaces; a **workspace calendar** shows the sessions of one workspace.
_Avoid_: agenda (the Dutch word), planning, roster

**Capacity**:
The maximum number of participants of a class occurrence or Open Gym slot. Active holds count toward it.

**Spot**:
One place within the capacity of a class occurrence or Open Gym slot.
_Avoid_: place, seat, slot (that's Open Gym)

**Open Gym**:
Bookable time where clients train on their own at a location.

**Open Gym slot**:
One Open Gym session, with a start, end, location and capacity.

**Publish**:
To make a class or Open Gym slot visible on the booking page.

**Waitlist**:
A queue for a full class occurrence: when a spot frees up, the first in line gets it. The rules (cut-off, messages) are in `PRODUCT.md §23`.

### Locations

**Location**:
The physical (or online) place where a session happens. Separate from the workspace that owns the session. At go-live a workspace has one location, its own, and every session takes it; more locations follow after go-live.

**Location type**:
What kind of place a location is: the workspace's own premises, an external gym where an independent trainer works, the client's home, outdoors, online, or other. At go-live only the workspace's own premises exist; the other types follow after go-live.

**Default training location**:
A client's usual location, used to infer the location of new sessions. After go-live, with more locations.

### Booking and verification

**Booking**:
A client's confirmed place in a class occurrence or Open Gym slot. Until the email is verified, the place is a hold, not a booking.
_Avoid_: reservation, registration, sign-up, enrolment

**Booking page**:
The public web page where clients book without an app.

**Booking link**:
A shareable URL for a booking scope: all, group classes, Open Gym, one class or one class date. A **QR code** opens a booking link.

**Hold**:
A spot reserved for 10–15 minutes while the client verifies their email. It counts toward capacity until it is confirmed or expires.
_Avoid_: reservation

**Hold state**:
Where a hold is in verification: **pending verification** (email not verified yet), **confirmed** (verified: the hold became a booking) or **expired** (the hold ran out and the spot was released).

**Verify**:
To prove ownership of an email address with the magic link or the verification code.

**Magic link**:
The link in a verification or sign-in email.

**Verification code**:
The 6-digit code in the same email as the magic link.

**Booking confirmation**:
The email and screen a client gets after a confirmed booking.

### Attendance

**Attendance**:
Whether each participant of a session showed up.

**Attendance status**:
One of **booked** (has a confirmed booking, not marked yet), **attended**, **cancelled** (the participant cancelled, or the session was cancelled) or **no-show** (booked, didn't come, didn't cancel). A cancellation after the cutoff is a **late cancellation**.

### Commerce

**Offer**:
Something a workspace sells: a membership, a credit pack, a credit plan or a single class, with its price, VAT rate and terms.
_Avoid_: product, plan (alone; *credit plan* is a kind), package

**Default plan**:
One of the three offers a new workspace starts with (a membership, a group credit pack and a private credit plan), pre-filled and switched off until the owner turns it on. The owner adds the price; the rest of the rules around the defaults are proposals (QC19 in `docs/design/open-questions.md`).
_Avoid_: template, preset, package

**Agreement**:
A client's commitment to a membership, credit pack or credit plan: start, end, renewal, price, payment schedule, cancellation policy and the terms the client agreed to.
_Avoid_: contract (outside legal text), subscription (for the agreement itself)

**Membership**:
An agreement for a weekly allowance of group classes for a term, e.g. two classes a week for six months, paid through recurring payments (see *Recurring payment*). The client books each class themself; there is no standing spot.
_Avoid_: subscription (see *Recurring payment*), plan, pass

**Credit**:
One unit of a group, private or Open Gym credit balance. One credit books one session of its kind: a **group credit** books a group class, a **private credit** books a private session, an **Open Gym credit** books an Open Gym slot. The three kinds never mix and have no exchange rate. Combined credits, one balance for every session type, are not planned (`PRODUCT.md §53`).
_Avoid_: token, point, voucher; using it for a makeup

**Credit pack**:
An offer, and the agreement it makes, for a number of group, private or Open Gym credits bought once and valid for a period. It can be limited to once per client (an intro offer). The pilot's private training is a private credit plan, not a pack.
_Avoid_: package, bundle, session pack (retired, see below)

**Credit plan**:
An offer, and the agreement it makes, for a number of group, private or Open Gym credits each billing cycle, paid by recurring payment (see *Recurring payment*), with a carry-over limit for credits left at the end of the cycle. The pilot's private training is a private credit plan.
_Avoid_: subscription (see *Recurring payment*), credit subscription

**Session pack** (retired):
Retired on 21 October 2026. Use *Credit pack*: a private session pack is a private credit pack.

**Single class** (proposed, [decision 9](docs/product/ROADMAP.md#14-decisions)):
One group class bought on its own, by a client without a membership or as an extra on top of one.
_Avoid_: drop-in, top-up

**Credit balance**:
What a client can still use under one agreement, in credits of one kind (group, private or Open Gym); a client with group and private credits sees two balances. Always explained by its history (granted, used, returned, expired), never a bare counter. A membership's makeups are tracked the same way but are not credits.
_Avoid_: session balance (retired), saldo, remaining sessions

**Weekly limit**:
The most bookings one client can make in a week, a workspace setting (a number, or off). The pilot uses 4, whatever the size of the membership. It also stops a client from saving up unused weekly classes and using them all at once.
_Avoid_: maximum, cap, quota

**Billing cycle**:
How often an offer's recurring payment is due: every month or every 4 weeks. The pilot uses every month.
_Avoid_: payment frequency, subscription period

**Cancellation policy**:
The rules of an offer for cancellations and no-shows: the cutoff, the makeup limit and what each case does to the balance.
_Avoid_: terms, rules (alone)

**Cancellation cutoff**:
How many hours before the start a client can still cancel in time.
_Avoid_: deadline, notice period

**Makeup**:
A right to attend another class, granted under the cancellation policy, for example for a cancellation in time.
_Avoid_: credit (a makeup is not a credit), catch-up, reschedule (that moves a session)

**Payment provider**:
The payment company through which clients' online payments run. In Fivvi it is Mollie, as [ADR-020](docs/decisions/ADR-020-payment-provider.md) decided (Accepted, 21 October 2026), with Stripe Connect as the fallback. Who the merchant is, and that the workspace has its own account with it, is set out in `PRODUCT.md §94`.
_Avoid_: bank

**Merchant**:
The business that sells to the client and receives the money. In Fivvi it is the workspace, not Fivvi itself (decided in ADR-020, Accepted 21 October 2026).
_Avoid_: seller (alone), vendor

**Payment**:
Money collected from a client: a first payment, a recurring payment or a single class.
_Avoid_: transaction (outside code), charge

**Recurring payment**:
A payment collected on a due date of an agreement's payment schedule, under a mandate. A membership's recurring payments together are what people call the subscription model.
_Avoid_: subscription as a name for a payment or for the agreement, automatic payment

**Mandate**:
A client's permission to collect recurring payments from them.
_Avoid_: authorization

**Invoice**:
The numbered tax document for a payment, with the workspace's and the buyer's details as they were when it was issued. Never changes once issued.
_Avoid_: bill, receipt

**Credit note**:
A document that corrects or cancels (part of) an invoice, e.g. after a refund.
_Avoid_: negative invoice

**Billing details**:
The name, company name, address and VAT number a client wants on their invoices.
_Avoid_: invoice address (alone), company info

**Refund**:
Money the workspace returns to a client for a payment, fully or in part.
_Avoid_: reimbursement, chargeback (a different thing)

**Chargeback**:
A payment that the client's bank or card issuer takes back, including a reversed direct debit. The client or the bank decides, not the workspace.
_Avoid_: refund (a different thing)

**Payout**:
A transfer from the payment provider to the workspace, made up of payments minus refunds, chargebacks and fees.
_Avoid_: settlement, withdrawal

### Training

**Workout**:
A planned or logged set of exercises for one client.
_Avoid_: training (as a noun for one workout)

**Workout template**:
A reusable workout, e.g. "Upper A: Bench Press 3 × 8, Cable Row 3 × 10".

**Program** 🔜:
A multi-week plan of workouts.

**Exercise**:
One movement, e.g. Bench Press.

**Exercise library**:
The shared list of exercises, with Dutch and English names, target muscles, equipment and aliases.

**Custom exercise**:
An exercise a trainer created. Stored as entered and never translated.

**Set**:
One round of reps of an exercise, with weight (kg) and difficulty.

**Rep**:
One repetition within a set.

**Difficulty**:
The trainer's rating of how hard a set or exercise felt.

**Log**:
To record sets live during a session.

**Previous values**:
The client's last logged performance for an exercise, shown next to today's sets.

**Workout history**:
All logged workouts of a client.

### Notes

**Note**:
Free-form text about a client (**client note**) or one session (**session note**), stored exactly as entered. May contain health data.

**Visibility**:
Who can read a note: **trainer-only** (the default; the client never sees it) or **client-visible**.
