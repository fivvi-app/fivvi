# Fivvi
## Product Specification & Roadmap

**Purpose:** Starting specification for building the product from scratch  
**Initial market:** Netherlands  
**Initial pilot:** Existing PT who owns a gym and works with other trainers  
**Target platforms:** Web, iOS, Android  
**Primary language:** Dutch  
**Secondary language:** English

---

# 1. Product vision

Build a simple operating platform for personal trainers and small fitness businesses.

**The simple user experience is the product.** It is the one thing that must set us apart from the tools a gym can already buy, so every feature is judged by it (§2.0).

The first version must solve the real workflow of the pilot gym:

- private training
- group classes
- multiple trainers
- public class booking
- Open Gym booking
- client management
- memberships, credit packs and credit plans (group and private credits), with a credit balance the owner and the client can trust
- recurring payments and invoices (§90–§97)
- workout/program management
- live workout logging
- trainer notes
- scheduling

The pilot gym can only switch when the platform solves the four pain points it named (§8, §2.8): billing, one clear calendar, proper roles and tracking of prepaid sessions. So it also takes over what the current booking and payment app does: memberships, recurring payments and invoices. Workout logging, notes and more locations follow right after go-live (§52).

The same architecture must later support:

- solo independent trainers
- freelance/mobile trainers
- trainers working at several gyms
- trainers with independent clients
- hybrid trainers
- gym owners
- multi-trainer organizations
- multi-location fitness businesses

The product launches in the Netherlands first.

Therefore the entire product must be:

> **Dutch-first, fully bilingual Dutch + English from day one.**

---

# 2. Product principles

## 2.0 Simple is the product

The simple user experience is the only difference we can have with other platforms, and the most important thing to the owner (20 October 2026). Every feature and every screen is judged by it first:

- **Few steps.** Every daily task takes as few steps as possible, on a phone for the trainer and the client, on a laptop for the owner. Count the taps before a flow is built.
- **Ask nothing we can know.** Never ask for what the platform can know or infer (§2.1): the workspace, the language, the time zone, the location, the client's details from a booking.
- **One place for everything.** Scheduling, booking, memberships, payments and invoices live in Fivvi, so no one needs a second app next to it (§2.8).
- **Plain words.** Plain Dutch and English, no jargon: *Betalingen koppelen*, not "merchant onboarding" or "SEPA mandate" (`packages/i18n/GLOSSARY.md`).
- **Hard things are done for the owner.** The owner never has to learn payments or KYC beyond one guided connect step (§94).
- **Start from something ready.** A new workspace comes with three default plans, switched off: the owner adds the price and turns one on, instead of building an offer from an empty form (§90; owner, 21 October 2026).

---

## 2.1 Keep it simple

The platform must reduce administration compared with:

- the pilot's current booking and payment app
- Google Calendar
- Word documents
- manually prepared invoices
- manual booking systems

Avoid unnecessary configuration.

Infer obvious information automatically.

---

## 2.2 Dutch-first, bilingual everywhere

Dutch is the default product language.

English must always be available.

This applies to:

- trainer web
- trainer mobile
- public booking pages
- client web
- client mobile
- magic-link emails
- booking confirmations
- cancellation emails
- notifications
- validation messages
- empty states
- onboarding
- settings
- QR landing pages

Never build Dutch and English as separate products.

All user-facing strings must come through the localization system.

---

## 2.3 Public booking before app installation

Clients must not need an app to book.

A QR code or URL opens a responsive booking page.

---

## 2.4 A client account is created at the first verified booking

For first booking:

```text
Name
Email
```

No phone number.

No password.

Email is verified using a magic link.

The client's account is created automatically the moment they verify their first booking; there is no separate account-creation step or choice (§26, §27).

---

## 2.5 Free-form notes first

Do not force trainers to maintain structured psychological/coaching fields.

Provide simple free-form notes.

AI can later summarize or structure those notes.

---

## 2.6 Location should usually be inferred

If a trainer works at one gym:

> use that location automatically.

If an independent client usually trains at TrainMore Zuid:

> use TrainMore Zuid automatically.

Only ask when ambiguous.

---

## 2.7 Open Gym stays simple

No:

- floors
- rooms
- equipment resources

in MVP.

Open Gym is simply a bookable offering with:

- start
- end
- location
- capacity

---

## 2.8 The pilot must be able to switch

The pilot owner won't use Fivvi in parallel with the old apps (owner, 20 October 2026). He starts using it only when it solves at least the four pain points he named in interview 01. These four are the **go-live minimum**:

1. **Billing:** invoices for private training and recurring payments.
2. **One clear calendar** for private sessions and group classes, for owner, trainers and clients.
3. **Proper roles:** trainers use their own team access, never client access.
4. **Tracking prepaid private sessions:** used and left. Private credits (credit packs and credit plans, §92) answer it.

A product that only replaces the calendar, while memberships, payments and invoices stay in the old app, is not a replacement (`docs/discovery/results/interview-01.md`). So there is no parallel run and no soft launch next to the old app: everything moves at one cutover (`ROADMAP.md §7`).

So the MVP covers the whole chain for the pilot's standard cases: a group membership with a weekly allowance of classes, and credits in kinds that never mix, group credits for group classes, private credits for private sessions and Open Gym credits for Open Gym, bought as a credit pack or paid monthly as a credit plan (owner, 21 and 31 October 2026; §91, §92). It also covers single classes (single classes and payouts are proposed scope, [decision 9](ROADMAP.md#14-decisions)):

```text
agreement → booking → attendance → credit balance → payment → invoice
```

Keep it to those cases. Every other pricing model waits for evidence (§53, §66); combined credits, one balance for every session type, are not planned.

---

## 2.9 One account, separate relationships

A person has one account (§27). In each workspace that account can have a **team role** (Owner or Trainer) and, separately, be a **client**. The two exist side by side and never merge (§9).

Trainers never need a client account to see their schedule.

---

# 3. Language and localization requirements

Localization is part of the foundation, not a later feature.

## Default behaviour

The interface language follows the person (ADR-017):

```text
Dutch device or browser → Dutch
English device or browser → English
Neither (or no language set) → English
```

Dutch users get Dutch. Dutch stays the source language of every text.

The user can switch at any time:

```text
Nederlands
English
```

---

## Language preference

Store language on the user profile:

```ts
preferredLocale: "nl-NL" | "en"
```

For a client with no stored preference yet:

- detect browser/device locale: the first supported language in the browser's or device's order
- fall back to English when neither Dutch nor English is requested
- always provide visible language switching

---

## Workspace default language

Each workspace can have:

```text
Default communication language
```

Initially:

```text
Dutch
English
```

This affects public-facing communication when no individual preference is known.

---

## Client language

If a client selects English during booking:

```text
Booking confirmation → English
Future magic links → English
Cancellation email → English
Client dashboard → English
```

Their preference should persist.

---

## Content vs interface translations

System UI is fully translated by us.

User-created content is not automatically translated in MVP.

Example:

Trainer creates:

```text
Class name:
Strength & Conditioning
```

That remains exactly as entered.

Group classes may also carry an optional English name and description, typed by the owner (§18). Visitors and staff see the version in their language. If the English version is empty, they see the Dutch one. This is still not automatic translation (§53).

---

## Date/time formatting

For Dutch users:

```text
22 september 2026
18:00
```

Use:

- 24-hour time
- Dutch date conventions
- Europe/Amsterdam timezone by default

Do not hard-code timezone assumptions into stored timestamps.

Store canonical timestamps and render according to workspace/user timezone.

---

# 4. Core architecture principle

Do not model:

> One trainer → one gym.

Instead:

> A trainer can participate in several workspaces and can also operate independently.

Their personal calendar combines all relevant sessions.

Example:

```text
Sarah

09:00 Anna
Independent
TrainMore Zuid

11:00 Mark
Independent
Basic-Fit Oost

15:00 Strength Group
John's Gym

18:00 Private
John's Gym
```

---

# 5. Workspace model

The central business concept is a **Workspace**.

Internally this can be represented as `Organization`.

A workspace can represent:

- gym
- studio
- independent trainer business

Examples:

```text
John's Gym
```

```text
Sarah Personal Training
```

---

# 6. Workspace membership

One trainer may belong to multiple workspaces.

Example:

```text
Sarah

John's Gym — Trainer
Fit Studio — Trainer
Sarah Personal Training — Owner
```

Their personal calendar combines all assigned sessions.

Each session still belongs to its originating workspace.

---

# 7. Session ownership vs location

These are separate concepts.

Example:

```text
Session:
Private training with Anna

Workspace:
Sarah Personal Training

Trainer:
Sarah

Location:
TrainMore Zuid
```

TrainMore is only the physical location.

It does not own or manage the session.

Another:

```text
Session:
Strength Group

Workspace:
John's Gym

Trainer:
Sarah

Location:
John's Gym
```

---

# 8. Initial pilot scenario

The pilot PT:

- owns the gym
- trains private clients
- runs some group classes
- has other trainers working there
- other trainers run additional group classes
- tracks workouts and notes manually
- wants Open Gym availability

Today the gym runs on two apps, Google Calendar and Word documents (interview of 19 October 2026, `docs/discovery/results/interview-01.md`):

- one app lets group clients book classes, keeps track of their memberships and collects their payments automatically
- private training is managed by hand: the owner prepares and sends invoices for it, some in a company's name, and tracks how many prepaid sessions a client has left
- group clients often commit for 6 or 12 months to a number of classes a week (1, 2 or 3) and book each class themself; interview 01 suggested fixed weekdays, which the commerce walkthrough of 31 October 2026 corrected (§91); a missed class is normally lost, and a cancellation made in time may give a limited makeup
- clients with a membership can buy an extra class on top of it
- trainers have to use client access to see their schedule, and private sessions and group classes are mixed in one calendar, told apart only by colour

The owner would switch, and even pay more, if the whole workflow works and is simpler. They won't move to a product that leaves payments in the old app.

Therefore:

> Multi-trainer organization support is an MVP requirement.

> Memberships, credit packs and credit plans (group and private), recurring payments and invoices are MVP requirements, and with the calendar and the roles they cover the four pain points that define go-live (§2.8).

The owner decided on 20 October 2026: no parallel run with the old apps, one location at go-live (§12) and no Admin role in the MVP (§9).

---

# 9. User roles

Owner and Trainer are the **team roles** of the MVP: a person has at most one per workspace. An Admin role comes later (see **Admin** below). **Client** is not a team role; it is a separate relationship with a workspace, and the same account can have both (§2.9):

| Situation | What happens |
|---|---|
| The owner also teaches | One account; the owner runs sessions and classes like a trainer |
| A trainer works at two gyms | One account; rights are checked per workspace |
| Trainer in workspace A, owner of workspace B | Each workspace's data stays separate |
| A client becomes a trainer | Accepting the invitation adds the team role to the existing account; the client's bookings and agreements stay |
| A team member buys classes | Their own bookings appear under their client view; their team role shows them nothing more about other clients than it already did |
| A team role is removed | Only the team rights go; the person's own bookings, agreements and invoices as a client stay |

Hiding a screen is never the permission: every API call checks the workspace, the relationship and the role.

## Owner

Can:

- manage workspace
- manage trainers
- view organization calendar
- manage clients
- manage classes
- manage Open Gym
- assign trainers
- manage booking links
- manage offers, prices and the cancellation policy: start from the three default plans or make their own (§90, §93)
- manage agreements, payments and invoices (§91–§96)
- connect the workspace's payment provider account in one guided step (decided in ADR-020; §94)
- manage settings

The pilot PT is:

```text
Owner
+
Trainer
```

---

## Admin 🔜

Not in the MVP (owner, 20 October 2026). The Owner can do everything, including the money, and the Trainer runs their own sessions and classes. An Admin role (a manager who isn't the owner) is added when a gym asks for one: Release 7.0 "advanced permissions" (`ROADMAP.md §9`), or earlier on request.

---

## Trainer

Can:

- view own schedule, with their own team access (never through a client account)
- manage relevant sessions
- run assigned classes
- access relevant clients
- log workouts
- add notes
- mark attendance
- see the credit balance of the clients they train, not amounts or invoices (proposal, [QC12](../design/open-questions.md#qc12)); the owner does all commerce

---

## Client

Can:

- book group classes
- book Open Gym
- verify email (creates the account automatically)
- see their own schedule: group bookings and private sessions together, clearly labelled (§15, Client Web)
- see their memberships, credit packs, credit plans and credit balances, one per kind (§91–§92)
- buy a single class (§95)
- pay, and see their payments and invoices (§94, §96)
- keep their billing details, including a company name (§96)
- use client web; client apps come later (§55)

---

# 10. Clients belong to workspaces

A client does not need to belong to exactly one trainer.

Example:

```text
John's Gym

Keyvan

Private trainer:
John

Group classes:
Sarah
Mike
```

---

# 11. Independent trainer clients

Independent trainer:

```text
Sarah Personal Training

Anna
Mark
Keyvan
Lisa
```

These clients belong to Sarah's independent workspace.

---

# 12. Locations

**At go-live each workspace has one location**, the gym's own (`organization_location`), and every session takes it (owner, 20 October 2026). Nobody has to choose.

**After go-live, still in the MVP** (M7, with automatic location selection, F019), a workspace can have more locations and the other types:

```text
organization_location
external_gym
client_home
outdoor
online
other
```

No floors.

No rooms.

No complex resource management.

---

# 13. Location UX

At go-live only the first case below exists: the session shows the workspace's one location. The rest applies after go-live.

## Organization session

If class belongs to John's Gym:

```text
Location:
John's Gym
```

automatically.

---

## Independent client (after go-live)

If Anna's normal gym is:

```text
TrainMore Zuid
```

the next session automatically uses that location.

---

## Ambiguous location (after go-live)

Only then ask:

```text
Where is this session?

TrainMore Zuid
Basic-Fit Oost
Other
```

---

# 14. Client preferred location (after go-live)

A client relationship can have:

```text
Default training location
```

Especially useful for independent trainers.

---

# 15. MVP platforms

## Trainer Web

Primary administrative interface. The daily operational screens (Today, personal calendar, sessions, attendance, workout logging, notes) also work in a phone browser, with touch-sized targets, and the trainer web can be added to the phone's home screen. The native trainer apps are built in parallel with the web (Trainer Mobile, below); the phone browser stays a fallback for a trainer whose app isn't ready or who prefers it. The workout logger keeps sets that weren't sent yet on the device and sends them when the connection returns.

- dashboard
- calendar
- trainers
- clients
- classes
- Open Gym
- workouts
- booking links
- QR codes
- offers, agreements, payments and invoices (§90–§97)
- settings

Available in:

```text
Dutch
English
```

---

## Trainer Mobile

The trainer app is **Fivvi Pro** (app ID `app.fivvi.pro`, the iOS bundle ID and the Android application ID); the client app of Release 1.2 is a separate app, **Fivvi** (`app.fivvi`, §55; `ROADMAP.md` decision 18). iOS + Android. Built in parallel with the web from M2 (`ROADMAP.md §3.1`; M8 is the label of this track), not after go-live: every feature with a trainer mobile surface gets iOS and Android tickets next to its web ticket, with the same acceptance criteria, and counts as done when web, iOS and Android all work. Trainers use the apps from go-live through TestFlight and Play internal testing if they pass their checks; go-live doesn't wait for public App Store / Play listings. Client apps stay Release 1.2.

Primary daily operational interface:

- Today
- personal calendar
- clients
- sessions
- workout logging
- notes
- attendance

A **+** action creates what the user's role allows, without switching to web:

- private session (every trainer, for their own sessions)
- client (name only; email and language can follow)
- group class, one-off or repeating every week (owner only)
- Open Gym (owner only)

Class templates, series edits, trainers, booking links and settings stay on Trainer Web.

Available in Dutch and English.

---

## Public Booking Web

Responsive.

No installation required.

Supports:

- group classes
- Open Gym
- booking
- magic-link verification
- paying for a single class (§95)

It never lists private sessions. A client with a membership books the classes it includes without paying again (§91).

Must have a prominent:

```text
NL | EN
```

switch.

---

## Client Web

Initially:

- **my schedule**: upcoming group bookings and private sessions in one list, each labelled with its type, trainer and location, and filterable by type
- past bookings
- cancellation, with its effect on the credit balance shown before confirming (§93)
- memberships, credit packs and credit plans, and the credit balance per kind with its history, for example "6 group credits, 3 private credits" (§91–§92)
- payments and invoices (§94, §96)
- profile, including billing details (§96)

A client who books group classes only sees no private sessions; a client with both sees both, never another client's.

Dutch + English.

---

## Client Native App

Added after MVP.

iOS + Android.

Dutch + English from first release.

---

# 16. Session types

MVP:

```text
Private
Group
Open Gym
```

Use a common scheduling engine where practical.

---

# 17. Private sessions

Owner and trainer can:

- create
- reschedule
- cancel
- assign trainer
- assign client
- location: the workspace's one location at go-live; set or inferred after go-live (§12–§13)
- attach workout
- mark attendance
- add notes

Private self-booking is not required initially.

---

# 18. Group classes

Definition:

```text
Name (Dutch, optional English)
Description (Dutch, optional English)
Trainer
Location
Capacity
Duration
Schedule
```

Example:

```text
Strength Training

Tuesday
18:00–19:00

Trainer:
Sarah

Capacity:
8
```

The owner types the name and description in Dutch and, optionally, in English. Each viewer sees their language, else the Dutch text (§3).

---

# 19. Class ownership

Group class belongs to its workspace.

Example:

```text
John's Gym
```

Sarah is merely the assigned trainer.

Trainer substitution therefore does not affect the class or bookings.

---

# 20. Recurring classes

Support:

```text
Every Tuesday
18:00
```

Each occurrence has:

- trainer
- date
- capacity
- bookings
- attendance
- status

---

# 21. Public booking page

Example:

```text
fivvi.app/book/johns-gym
```

Dutch default:

```text
GROEPSLESSEN

Dinsdag 18:00
Strength
Trainer: Sarah
3 plekken beschikbaar
```

English:

```text
GROUP CLASSES

Tuesday 18:00
Strength
Trainer: Sarah
3 spots available
```

---

# 22. Booking input

Require only:

```text
Name
Email
```

Localized labels:

```text
Naam
E-mailadres
```

or:

```text
Name
Email
```

---

# 23. Booking flow

```text
Choose class/Open Gym
        ↓
Name + email
        ↓
Temporarily hold spot
        ↓
Send magic link
        ↓
Click link
        ↓
Email verified
        ↓
Booking confirmed
        ↓
Client account created
```

The entire flow stays in the user's selected language.

## Waitlist

Added to the MVP, before the pilot, on 31 October 2026 (moved forward from Release 1.1, §54), because the pilot gym has one today.

- When a class is full, a client can join its **waitlist**. When a spot frees up, the first in line gets it and an email.
- The owner sets a **cut-off**, a few minutes before the class starts. After it nobody is moved up, so a spot is never given at the last minute (the pilot gym's problem today: a spot can be given 1 minute before class).
- Clients still on the waitlist after the cut-off get a **message that they didn't get in**.
- Capacity is never exceeded. How long a client has to confirm, how a waitlisted client with a membership or credits is handled, and the waitlist's milestone and feature ID are settled in the feature spec.

---

# 24. Temporary booking hold

Status:

```text
pending_verification
```

Suggested expiry:

```text
10–15 minutes
```

Verified:

```text
confirmed
```

Expired:

```text
expired
```

---

# 25. Booking with email verification

The client retains:

- name
- verified email
- language preference
- booking history linked to email

Receives localized:

- confirmations
- cancellations
- changes

Verifying the email creates the client's account (§26); there is no separate account step.

---

# 26. Client account created automatically

Before submitting the booking form, it shows one explanatory line — no choice, no extra screen:

Dutch:

```text
We maken een account voor je aan, zodat je je boekingen kunt zien.
```

English:

```text
We create an account for you so you can see your bookings.
```

After verification, the confirmation screen's headline is:

Dutch:

```text
Je boeking is bevestigd.
```

English:

```text
Your booking is confirmed.
```

The account's stored language is the language the client booked in (§3, *Client language*). The account can be deleted on request (E014).

---

# 27. Authentication

Clients use:

```text
Email magic link
```

No:

- passwords
- phone numbers
- SMS

in MVP.

Everyone signs in the same way: email, then the link or the 6-digit code from the email (ADR-007).

Sign-up is closed in MVP. An account is only created by:

- the first sign-in of an email address we've allowed (the pilot owner)
- accepting a trainer invitation (§49)
- a client's first verified booking (§26)

Any other address gets the same "check your email" message and no email, so nobody can tell whether an account exists. Open sign-up comes with Release 2.0 (§58).

---

# 28. Open Gym

Definition:

```text
Workspace
Location
Date
Start
End
Capacity
```

Example:

```text
Friday
10:00–11:00
Capacity: 2
```

---

# 29. Open Gym publishing

For MVP:

- manually create
- manually publish

System may suggest:

```text
You're already at the gym from 10:00–11:00.

Offer Open Gym?

[ Publish ]
```

Localized appropriately.

---

# 30. Open Gym booking

Uses the same booking flow:

```text
Name
Email
Magic link
Verification
Confirmation
```

---

# 31. Future Open Gym automation

Later support rules:

- capacity
- allowed days
- allowed hours
- publish X hours beforehand
- trainer must already be on-site

---

# 32. Booking links

Generate:

- all bookings
- group classes
- Open Gym
- specific class
- specific occurrence

Language behaviour:

A booking link can:

- detect the visitor's browser language (the default)
- set a fixed page language, Dutch or English, e.g. for an English-only class

Every booking page allows manual switching, and the visitor's own choice wins over the link's language (ADR-017).

---

# 33. QR codes

Generate QR codes for any booking link.

Actions:

```text
Copy link
Download QR
Print
Share
```

QR should lead to responsive bilingual pages.

---

# 34. Client profile

A client can be added wherever a client is chosen (new session, the client list, the app's **+**). Only a name is required; email and language for emails are optional (a default training location follows after go-live, §14). A matching email in the same workspace offers the existing client instead of a duplicate.

Contains:

```text
Overview
Sessions
Workouts
Bookings
Notes
History
```

Later:

```text
Progress
```

In MVP the profile also shows (§90–§97):

```text
Agreements (memberships, credit packs and credit plans, with the credit balance per kind)
Payments and invoices
Billing details
```

---

# 35. Client notes

Free-form text.

Example:

```text
Likes techno.

Doesn't like Bulgarian split squats.

Usually prefers evening sessions.
```

Do not force translation.

Notes are stored exactly as entered.

---

# 36. Session notes

Example:

```text
22 September

Bench final set was hard.
Keep same weight next time.
```

---

# 37. Note visibility

Support:

```text
Trainer-only
Client-visible
```

Default:

```text
Trainer-only
```

After a workout, the trainer can save an internal session note and separately write an optional message for the client. The internal note remains visible only to authorized workspace staff. Finishing the workout does not share either the workout or the note automatically. The trainer can review and explicitly share the workout recap and client message immediately or later. Shared workouts appear in the signed-in client's profile and are also sent by email. The internal note is never included in that recap, email, or client profile. Trainer-written messages are displayed exactly as entered, without translation.

---

# 38. Exercise library

Store:

```text
Name
Target muscles
Equipment
Instructions
Optional media
Aliases
```

The exercise library must eventually support localized exercise names/instructions.

For MVP:

- Dutch name where available
- English name
- trainer-created custom exercises
- an exercise type that decides what a set records:
  - weight × reps (kg and reps; the default);
  - reps only (bodyweight);
  - time (seconds, shown as m:ss);
  - distance + time (metres and m:ss).

Every exercise has a type, library and custom alike. Creating a custom exercise asks for its type.

Custom exercise content does not require translation.

---

# 39. Workout templates

Example:

```text
Upper A

Bench Press
3 × 8

Cable Row
3 × 10
```

A logged workout can be saved as a new template when the trainer finishes it. This turns a workout built on the fly into one that can be reused. When a workout from a template was changed, finishing offers to save it as a new template; the original template stays as it was.

---

# 40. Client workouts

Trainer can assign workouts/programs to individual clients.

Group programming can come later.

---

# 41. Live workout logging

A trainer can start a workout in three ways:

- **empty**: no template, exercises are added during the session (on the fly);
- **repeat the previous workout**: the client's last logged workout, prefilled with its values;
- **from a template**: an assigned or any workspace template.

An assigned workout opens directly. A workout can also start from the client profile without a planned session; this creates a private session that starts now.

During the workout:

- the logger is one scrolling list: every exercise in order, with its sets and progress underneath;
- exercises can be added at any time, from the library (Dutch and English search, the client's recent exercises first) or as a new custom exercise;
- each set shows its previous value and fields for today, set by the exercise type (§38);
- each set is prefilled (today's previous set, else last time's same set, else the target) and logged with one tap;
- the trainer can edit a set's values directly in its row;
- each exercise can get extra sets, prefilled from its last set; any unlogged set can be removed, also one from a template, and so can a whole exercise (after a confirmation when it has logged sets);
- difficulty is asked once per exercise, under each exercise ("how was it?"), and defaults to Normal;
- the logger shows the elapsed workout time.

The finished workout records its duration.

Example:

```text
BENCH PRESS

Previous
60kg × 8
60kg × 8
60kg × 7

Today
62.5kg × 8
62.5kg × 8
62.5kg × 7

Difficulty:
Easy / Normal / Hard
```

Localized labels:

```text
Vorige training
Vandaag
Makkelijk
Normaal
Zwaar
```

---

# 42. Workout history

Track:

- exercise
- sets
- reps
- weight
- difficulty
- date
- session
- trainer
- notes

---

# 43. Attendance

Statuses:

```text
Booked
Attended
Cancelled
No-show
```

Dutch UI:

```text
Geboekt
Aanwezig
Geannuleerd
Niet verschenen
```

A cancellation after the cutoff counts as a late cancellation (§93). What an attendance status does to a credit balance follows the agreement's cancellation policy, never a separate count (§92, §93).

---

# 44. Trainer web navigation

Dutch default:

```text
Dashboard
Agenda
Klanten
Lessen
Open Gym
Trainingen
Trainers
Boekingslinks
Instellingen
```

English:

```text
Dashboard
Calendar
Clients
Classes
Open Gym
Workouts
Trainers
Booking Links
Settings
```

---

# 45. Owner dashboard

Example:

```text
TODAY

09:00 Private — John
10:00 Strength — Sarah — 7/8
11:00 Private — Mike
12:00 Open Gym — 1/2
```

Owner sees workspace-wide schedule.

---

# 46. Trainer dashboard

Trainer sees primarily:

```text
MY DAY
```

across all workspaces.

---

# 47. Combined trainer calendar

Example:

```text
09:00 Anna
Sarah Personal Training
TrainMore Zuid

11:00 Mark
Sarah Personal Training
Basic-Fit Oost

15:00 Strength
John's Gym

18:00 Private
Fit Studio
```

---

# 48. Workspace calendar

Shows only sessions belonging to that workspace.

This remains separate from personal trainer calendar.

**Calendar types and filters (all calendars, §45–§48):** every calendar names each session's type in words (Private, Group, Open Gym) and can filter by type and trainer. Colour may help, but never carries meaning on its own.

---

# 49. Trainer invitations

Owner invites a person by email to join the team as a trainer (the MVP has no other team role to invite for, §50).

Invitation email must be bilingual/localized according to:

1. selected recipient language if known
2. otherwise workspace default

If the email address already has an account (for example a client of the gym), accepting the invitation adds the team role to that account. It never creates a second account (§9).

---

# 50. MVP roles

```text
Owner
Trainer
```

Owner can do everything, including the money; Trainer runs their own sessions and classes, calendar and attendance. Admin is a later role 🔜 (§9): added when a gym asks for a manager who isn't the owner (Release 7.0 "advanced permissions", or earlier on request).

Do not build custom permissions yet.

These are team roles. Being a client is a separate relationship, not a fourth role (§9).

---

# 51. Notifications

MVP client emails:

- magic link
- booking confirmation
- cancellation
- schedule change
- class cancellation
- trainer-shared workout recap and optional client message (after go-live, with workouts)
- agreement confirmation with its terms, and the link for the first payment (§91, §94)
- invoice, with the invoice attached (§96)
- failed payment (§94)

Trainer emails:

- new booking
- cancellation

Owner emails:

- failed payment (§94)

All templates require:

```text
nl-NL
en
```

versions.

---

# 52. MVP scope

Everything above **After go-live** is needed for the pilot's go-live (`ROADMAP.md` Gate G4), except the trainer apps bullet, which says so itself. The items under **After go-live** are still MVP, but they join the running pilot.

## Foundation

- users
- workspaces
- memberships
- roles
- trainer profiles
- client profiles
- multi-workspace trainer
- localization infrastructure
- Dutch translations
- English translations
- locale preference

## Scheduling

- workspace calendar
- personal trainer calendar
- private sessions
- group classes
- recurring classes
- Open Gym
- attendance
- cancellations

## Trainers

- multiple trainers
- invitations
- trainer assignment
- substitution

## Locations

- one location per workspace, the gym's own (§12); every session takes it

## Booking

- public bilingual booking page
- group booking
- Open Gym booking
- name/email
- temporary hold
- magic link
- booking with email verification
- client account created automatically

## Sharing

- booking links
- QR codes

## Commerce

Single classes and payouts are proposed scope ([decision 9](ROADMAP.md#14-decisions)).

- offers and prices (§90)
- memberships with a weekly allowance of group classes (§91)
- credit packs and credit plans, group and private (§92)
- credit balance per kind with its history (§92)
- cancellation cutoff, no-shows and limited makeups (§93)
- recurring payments through the workspace's payment provider account (decided in ADR-020; §94)
- single class purchase (§95)
- invoices with billing details and credit notes (§96)
- payouts and reconciliation (§97)

## Platforms

- trainer web
- responsive public booking web
- basic client web
- trainer iOS and Android apps, built in parallel with the web (not a G4 gate: an app that fails its checks stays off without delaying go-live, decision 8; `ROADMAP.md` M8, the native track): sign-in, Today, personal calendar, clients, session screen, attendance and the **+** menu come with the scheduling milestones; trainers install them through TestFlight and Play internal testing; no public store listings are needed for go-live

## After go-live (joins the running pilot)

These follow right after go-live, in this order of need. The trainer web keeps working the whole time. Training and notes ship on web, iOS and Android together: the logger, history and notes screens in the trainer apps come with them.

### Locations

- more locations per workspace and the other location types: external gym, client home, outdoor, online (§12)
- trainer locations and a client's preferred location (§14)
- automatic location inference (§2.6, §13); until then the workspace's location is preselected

### Training

- exercise library
- custom exercises
- workout templates
- client workouts
- live logging, with or without a template
- repeat previous workout
- save a logged workout as a template
- previous performance
- history

### Notes

- client notes
- session notes
- note visibility

---

# 53. Explicit MVP exclusions

Do not build yet:

- pricing models beyond memberships, credit packs, credit plans and single classes (for example combined credits: one balance for every session type, not planned, owner 21 October 2026; or pay-what-you-use)
- discounts, coupons, gift cards, family or shared memberships
- accounting integrations (Moneybird, e-Boekhouden, Exact Online)
- point-of-sale or kiosk payments at the desk, until the pilot's current use is known ([QC11](../design/open-questions.md#qc11))
- payments inside the native apps (clients pay on the web) (proposal, [QC16](../design/open-questions.md#qc16))
- Fivvi holding client money in its own account (ADR-020 decides the gym as merchant instead; §94)
- platform billing: charging gyms and trainers for Fivvi ([`ROADMAP.md` decision 16](ROADMAP.md#14-decisions), listed under "Decided iteratively" and decided at the 2.0 entry gate)
- phone number requirement
- SMS
- complex permission system
- client-native app
- AI notes
- AI programming
- chat
- nutrition
- wearables
- advanced analytics
- automatic content translation
- white-label
- marketplace
- floors
- rooms
- resource management
- payroll
- commissions
- open sign-up (anyone creating an account themselves, §27, §58)

---

# 54. Release 1.1 — Pilot refinement

Based on actual usage:

- recurring private appointments
- schedule exceptions
- holidays
- blocked time
- workout duplication
- warm-up sets
- supersets
- workout reordering
- pinned notes
- note search
- offline resilience
- bulk attendance

Previous-session duplication moved to the MVP (§41) on 23 September 2026, after prototype feedback. The cancellation cutoff moved to the MVP (§93) on 19 October 2026, because memberships and credits depend on it. Waitlists moved to the MVP, before the pilot, on 31 October 2026 (§23), after the commerce walkthrough: the pilot gym has a waitlist today.

All additions must work in Dutch and English.

---

# 55. Release 1.2 — Client apps

The client app is a separate app, **Fivvi** (app ID `app.fivvi`, iOS and Android), next to **Fivvi Pro** for owners and trainers (`app.fivvi.pro`); resolved by the owner on 21 October 2026 (`ROADMAP.md` decision 18). Check the store names for availability before the first listing.

Launch:

```text
iOS
Android
```

Navigation:

```text
Home
Book
Training
Profile
```

Dutch:

```text
Home
Boeken
Training
Profiel
```

Features:

- upcoming bookings
- group booking
- Open Gym
- cancellations
- workout history
- notifications
- language switching

---

# 56. Release 1.3 — AI note capture

Trainer speaks/types natural language.

AI proposes structured notes.

AI input/output must eventually support both:

```text
Dutch
English
```

Example Dutch input:

```text
Laatste set bankdrukken was zwaar.
Volgende keer hetzelfde gewicht houden.
```

The trainer confirms before saving.

---

# 57. Release 1.4 — AI client briefing

Generate concise pre-session summary from historical data.

Available in trainer's selected language.

---

# 58. Release 2.0 — SaaS onboarding

Open product to external customers.

Onboarding:

```text
What describes you?

Independent trainer
Trainer at gym
Studio/gym owner
```

Dutch default equivalent included.

---

# 59. Release 2.1 — Freelance trainers

Enhance:

- independent workspace
- multiple external gyms
- client default location
- navigation links
- combined schedule
- organization + independent clients together

---

# 60. Gym access information

Optional:

```text
Client has membership
Trainer has membership
Guest pass required
Client pays access
Trainer pays access
No extra cost
```

No billing yet.

---

# 61. Release 2.2 — Multi-workspace improvements

Add:

- easy workspace switching
- combined calendar
- cross-workspace conflict detection
- workspace-specific permissions
- personal workspace
- organization work side-by-side

---

# 62. Release 2.3 — Multi-location organizations

Example:

```text
FitLab

Amsterdam Zuid
Amsterdam Oost
Utrecht
```

Default location minimizes repetitive selection. (More locations in one workspace come earlier, after go-live, §12; this release is about organizations that span several sites.)

---

# 63. Release 3.0 — Smart scheduling

Potential:

- travel warnings
- client clustering
- location optimization
- buffer suggestions
- conflict detection

---

# 64. Release 3.1 — Open Gym automation

Rules:

- capacity
- days
- time ranges
- advance publication
- trainer on-site

---

# 65. Release 3.2 — Analytics

Track:

- private sessions
- class occupancy
- Open Gym usage
- cancellations
- no-shows
- busiest periods
- trainer workload
- retention

Analytics UI must remain bilingual.

---

# 66. Release 4 — Advanced commerce

Memberships, recurring payments and invoices moved into the MVP on 19 October 2026, and group and private credits (credit packs and credit plans) on 21 October 2026 (§2.8, §90–§97); single classes and payouts are proposed scope ([decision 9](ROADMAP.md#14-decisions)). Release 4 builds on them:

- other pricing models the pilot shows a need for (combined credits are not planned, §53)
- discounts, coupons, gift cards, family or shared memberships
- payment reminders and dunning beyond the MVP's failed-payment handling
- point-of-sale or kiosk payments
- accounting integrations
- revenue reports

For the Dutch market, later integrations should prioritize the systems customers actually use locally.

---

# 67. Release 5 — Advanced AI

Potential:

- note summaries
- progression insights
- training suggestions
- schedule assistance

AI must understand Dutch and English.

Trainer retains final control.

---

# 68. Release 6 — Integrations

Potential:

- Google Calendar
- Apple Calendar
- Outlook
- accounting providers
- payment providers
- Apple Health
- Health Connect
- wearables
- exercise/media services

---

# 69. Release 7 — Larger business features

Potential:

- advanced permissions
- the Admin role (a manager who isn't the owner, §9; earlier on request)
- reception role
- custom branding
- custom domain
- staff analytics
- commissions
- enterprise controls
- white-label

---

# 70. Technical architecture

Recommended monorepo:

```text
/apps
  /web
  /mobile

/packages
  /api
  /domain
  /database
  /auth
  /i18n
  /validation
  /types
  /ui
```

`/i18n` is a first-class shared package.

---

# 71. Web stack

Recommended:

```text
Next.js
TypeScript
```

Handles:

- trainer dashboard
- public booking
- client web
- organization administration

---

# 72. Mobile stack

Recommended:

```text
React Native
Expo
TypeScript
```

One codebase:

```text
iOS
Android
```

---

# 73. Localization architecture

All UI strings must use translation keys.

Example:

```ts
t("booking.confirm")
```

not:

```ts
"Confirm booking"
```

Translation files:

```text
/packages/i18n/locales/nl-NL.json
/packages/i18n/locales/en.json
```

Example:

```json
{
  "booking.confirm": "Boeking bevestigen"
}
```

```json
{
  "booking.confirm": "Confirm booking"
}
```

No hard-coded user-facing strings in components.

---

# 74. Email localization

Transactional email templates require separate translations.

Example:

```text
magic-link.nl
magic-link.en

booking-confirmation.nl
booking-confirmation.en

booking-cancelled.nl
booking-cancelled.en
```

Prefer one template structure with localized content rather than duplicating business logic.

---

# 75. Backend

One backend serves:

- web
- mobile
- public booking
- client web
- future client mobile

---

# 76. Database

Use PostgreSQL.

Core entities:

```text
users
organizations
organization_members
trainer_profiles
client_profiles
trainer_clients
locations
sessions
session_participants
group_templates
bookings
exercises
workouts
workout_exercises
set_logs
notes
booking_links
```

Store locale preference where relevant.

---

# 77. Multi-tenancy

Business data belongs to workspace.

Core business records generally carry:

```text
organizationId
```

Strict workspace isolation is required.

---

# 78. Personal calendar

Two distinct concepts:

## Workspace calendar

All sessions owned by that organization.

## Trainer calendar

All sessions assigned to that trainer across every workspace.

This distinction exists from MVP.

---

# 79. Privacy

Notes may contain sensitive personal/health information.

Requirements:

- trainer-only notes
- role-based access
- data export
- deletion
- secure storage
- minimal data collection
- no unnecessary profiling

Payment data stays with the payment provider: Fivvi stores its references (payment, mandate, refund), amounts and statuses, never card numbers or full bank account numbers (§94). Invoices are kept for the statutory retention period, also when a client asks for deletion; the rest of their data is deleted (E014, `docs/legal/retention-policy.md`).

---

# 80. Feature tracking

Mandatory from day one.

```text
/docs/product
  PRODUCT.md
  ROADMAP.md
  FEATURES.md
```

Individual features:

```text
/docs/features
```

---

# 81. Feature lifecycle

```text
IDEA
↓
PLANNED
↓
DESIGNED
↓
IN PROGRESS
↓
IN REVIEW
↓
IMPLEMENTED
↓
RELEASED
```

---

# 82. Feature specification

Every feature includes:

```text
ID
Name
Status
Release
Problem
User stories
Platforms
Languages
Requirements
Non-goals
Dependencies
Acceptance criteria
Implementation references
```

`Languages` is mandatory.

Example:

```text
Languages:
Dutch ✅
English ✅
```

A feature is not complete until both languages work.

---

# 83. Git workflow

Issue:

```text
[F031] Open Gym public booking
```

Branch:

```text
feature/F031-open-gym-booking
```

PR:

```text
[F031] Implement Open Gym public booking
```

---

# 84. Initial feature registry

The current registry, with status, priority and milestone of every feature, is [`FEATURES.md`](FEATURES.md); this list is the initial one, extended with F051–F061.

## Foundation

```text
F001 Authentication
F002 Workspaces
F003 Workspace Membership
F004 Roles
F005 Trainer Profile
F006 Client Profile
F007 Localization Infrastructure
F008 Dutch UI
F009 English UI
F010 Locale Preference
```

## Trainers

```text
F011 Trainer Invitations
F012 Multi-Workspace Trainer
F013 Personal Trainer Calendar
F014 Workspace Calendar
```

## Locations

```text
F015 Locations
F016 Organization Default Location
F017 Trainer Locations
F018 Client Preferred Location
F019 Automatic Location Selection
```

## Scheduling

```text
F020 Private Sessions
F021 Group Class Templates
F022 Recurring Classes
F023 Trainer Assignment
F024 Trainer Substitution
F025 Attendance
F026 Cancellations
```

## Booking

```text
F027 Public Booking Page
F028 Booking Capacity
F029 Booking Hold
F030 Magic-Link Verification
F031 Booking with Email Verification
F032 Client Account on First Booking
F033 Client Booking Dashboard
```

## Open Gym

```text
F034 Open Gym Slots
F035 Open Gym Public Booking
F036 Open Gym Suggestions
```

## Sharing

```text
F037 Booking Links
F038 QR Codes
```

## Workouts

```text
F039 Exercise Library
F040 Custom Exercises
F041 Workout Templates
F042 Client Workouts
F043 Live Workout Logging
F044 Previous Workout Display
F045 Workout History
F051 Repeat Previous Workout
```

## Notes

```text
F046 Client Notes
F047 Session Notes
F048 Note Visibility
```

## Notifications

```text
F049 Localized Transactional Emails
F050 Trainer Booking Notifications
```

## Commerce

```text
F052 Offers and Prices
F053 Memberships
F054 Credit Packs and Plans (group, private and Open Gym)
F055 Credit Balance
F056 Cancellation Policy and Makeups
F057 Recurring Payments
F058 Single Class Purchase
F059 Invoices and Billing Details
F060 Failed Payments and Refunds
F061 Payouts and Reconciliation
```

---

# 85. MVP implementation sequence

## Phase A — Foundation

1. Monorepo
2. PostgreSQL
3. Authentication
4. Workspaces
5. Memberships
6. Roles
7. Trainer profiles
8. Client profiles
9. Tenant authorization
10. Localization architecture
11. Dutch translation baseline
12. English translation baseline
13. Locale persistence

---

## Phase B — Trainers and locations

14. Trainer invitations
15. Multiple trainers
16. Multi-workspace architecture
17. Locations: one per workspace, the gym's own (more locations and the other types after go-live, §52)
18. organization default location (that one location)
19. trainer locations and client preferred location (after go-live, §52)
20. automatic location inference (after go-live, §52)

---

## Phase C — Calendar

21. Workspace calendar
22. Personal trainer calendar
23. Private sessions
24. Trainer assignment
25. Group templates
26. Recurrence
27. Trainer substitution
28. Attendance
29. Cancellation

---

## Phase D — Public booking

30. Public bilingual booking page
31. Language switcher
32. Capacity
33. name/email form
34. temporary booking hold
35. localized magic link
36. booking confirmation
37. booking with email verification
38. client account created automatically
39. client web dashboard

---

## Phase E — Open Gym

40. Open Gym creation
41. capacity
42. public booking
43. attendance
44. publishing suggestion

---

## Phase F — Sharing

45. booking URLs
46. QR generation
47. download/share QR

---

## Phase K — Commerce

Runs after Phase D (it needs bookings and client accounts), next to Phases E and F, and before Phase J.

Phase K: single classes and payouts are proposed scope ([decision 9](ROADMAP.md#14-decisions)).

79. offers and prices
80. payment provider account per workspace (decided in ADR-020)
81. memberships with a weekly allowance of group classes
82. credit packs and credit plans, group and private
83. credit balance per kind and its history
84. cancellation cutoff, no-shows and makeups
85. recurring payments
86. single class purchase
87. invoices, billing details and credit notes
88. failed payments and refunds
89. payouts and reconciliation

---

## Phase G — Workouts

Phases G and H follow after go-live (§52). Phase I is built in parallel with the web (§52, §15 Trainer Mobile): its first items come with the scheduling milestones and the logger and notes (62–63) with Phases G and H.

48. bilingual exercise library baseline
49. custom exercises
50. workout templates
51. assign workouts
52. live logging
53. previous values
54. workout history

---

## Phase H — Notes

55. client notes
56. session notes
57. visibility

---

## Phase I — Trainer mobile

Built in parallel with the web, next to each web feature (`ROADMAP.md` M8, the native track); iOS and Android together.

58. Today
59. personal calendar
60. clients
61. session screen
62. workout logger
63. notes
64. attendance
65. Dutch/English language switching

---

## Phase J — Pilot

66. import required existing data, including active agreements, credit balances and billing dates; the owner checks the reconciliation report against the old app
67. onboard gym owner
68. onboard other trainers
69. add group classes
70. publish Dutch-first booking page
71. verify English booking experience
72. publish Open Gym
73. run real sessions
74. cutover: scheduling, booking and payments all move to Fivvi at once and every client gets the first-payment link for the new mandate; the old app stays read-only until the first full payment cycle reconciles, then it is cancelled (`ROADMAP.md §7`)
75. observe usage
76. track workarounds
77. track remaining use of the old apps, Google Calendar and Word
78. define Release 1.1 from actual evidence

---

# 86. Definition of Done

A user-facing feature is **not done** unless:

- web/mobile behaviour works where required
- permissions are correct
- tenant isolation works
- Dutch UI exists
- English UI exists
- dates/times localize correctly
- relevant emails are translated
- feature documentation is updated
- feature registry status is updated
- acceptance criteria pass

---

# 87. MVP success criteria

The MVP succeeds if:

- owner runs gym scheduling through platform
- trainers use their assigned classes/sessions
- customers book through public pages
- Dutch users can complete everything without English
- English users can complete everything without Dutch
- Open Gym receives bookings
- private workout logging replaces Word and by-hand notes
- notes replace scattered tools
- previous performance is easy to access
- owner sees organization schedule
- trainer sees combined personal schedule, with their own team access
- memberships, credit packs and credit plans run in the platform, and every credit balance can be explained from its history
- recurring payments are collected without the old app, with no duplicate charges
- private invoices no longer need to be made by hand
- normal usage requires no developer intervention

Strongest validation signal:

> The pilot gym cancels its old booking and payment app and does not want to go back to it, Google Calendar or Word documents.

---

# 88. Roadmap summary

| Release | Objective |
|---|---|
| **MVP** | Dutch-first pilot gym platform, including memberships, recurring payments and invoices |
| **1.1** | Pilot-driven improvements |
| **1.2** | Client iOS + Android |
| **1.3** | Dutch/English AI note capture |
| **1.4** | AI client briefing |
| **2.0** | Public SaaS onboarding |
| **2.1** | Freelance trainer improvements |
| **2.2** | Multi-workspace improvements |
| **2.3** | Multi-location businesses |
| **3.0** | Smart scheduling |
| **3.1** | Open Gym automation |
| **3.2** | Business analytics |
| **4.0** | Advanced commerce |
| **5.0** | Advanced AI |
| **6.0** | Integrations |
| **7.0** | Larger-business features |

---

# 89. Core product promise

## Gym owners

> Manage trainers, clients, private sessions, group classes, Open Gym, memberships, payments and invoices in one place.

## Trainers

> Know where you need to be, who you're training, what they did last time and what you need to remember.

## Clients

> Scan a QR code, choose a session, enter your name and email, verify it and you're booked.

## Netherlands launch requirement

> Every essential workflow must work naturally in Dutch first, with a complete English alternative available everywhere.

---

# Commerce (MVP)

Added on 19 October 2026 after the first interview with the pilot owner (`docs/discovery/results/interview-01.md`), who can't switch without it (§2.8). The subscription model (recurring payments) and invoices arrive **together**: every payment, recurring or one-off, gets an invoice. Memberships, credit packs and credit plans (group and private; owner, 21 October 2026), recurring payments and invoices are decided; single classes and payouts are proposed scope ([decision 9](ROADMAP.md#14-decisions)). A new workspace starts with three default plans, and the owner can make their own offers (§90; owner, 21 October 2026). The commerce walkthrough of 31 October 2026 answered the questions QC01–QC19 ([`open-questions.md`](../design/open-questions.md)); what is still open is marked there, the feature specs settle it with the owner, and nothing here guesses it.

Keep these concepts separate in the model, even where the screen combines them: a class's recurrence is not a payment schedule, a payment is not an invoice, and a missed class is not a missed payment.

---

# 90. Offers and prices

An **offer** is what a workspace sells. MVP has four kinds (single class: proposed, [decision 9](ROADMAP.md#14-decisions)):

| Offer | Example | Paid |
|---|---|---|
| **Membership** | 2 group classes a week, booked by the client, for 6 or 12 months | Recurring, usually monthly (§94) |
| **Credit pack** (group, private or Open Gym) | 26 private credits to use within 6 months (about one session a week) | Once, up front (§94) |
| **Credit plan** (group, private or Open Gym) | 4 group credits every month, with a carry-over limit | Recurring, every cycle (§94) |
| **Single class** (stays an offer kind any studio can switch on; the single class itself is proposed, [decision 9](ROADMAP.md#14-decisions)) | One group class, on its own or on top of a membership | At booking (§95) |

The owner sets each offer's name (Dutch, optional English, as in §18), price in euros including VAT, VAT rate, term and, for a membership, how many classes a week (1, 2 or 3 at the pilot gym) and which classes it covers; for a credit pack how many credits and how long they stay valid, for a credit plan how many credits each cycle and the carry-over limit (both a validity or limit set on the offer, [QC17](../design/open-questions.md#qc17)). A credit offer is of one kind (group, private or Open Gym), never mixed (§92). A change to an offer applies to new agreements only (proposal, [QC15](../design/open-questions.md#qc15)); the defaults a new workspace starts with are in *Default plans* below.

Every offer also has these settings (product owner, 31 October 2026, for every workspace; the pilot's choice in brackets):

- **Billing cycle:** every month or every 4 weeks (the pilot: every month, because 4-weekly means 13 payments a year, which the gym owner finds unfair to clients).
- **Intro offer:** a credit pack can be limited to **once per client**, for example 2 classes valid for 2 weeks (the pilot does trials by hand and won't use it).
- **Member-only:** an offer can be limited to clients with an active membership, for example extra group credits for a member who wants another class in a week (QC08).
- **End of term:** the agreement either **stops** (the client chooses a new term, with a reminder and a one-tap renewal) or **continues per cycle** at the same price until the client gives notice. A continuing agreement follows Dutch consumer law: no tacit renewal for another fixed term, a first term over 12 months is presumed unreasonable, notice of at most one month on any day, and online if the client signed up online (QC07; the legal check is `ROADMAP.md §4.4`). Which setting the pilot uses is open.

**Plan changes** are not an offer setting: the pilot's own rule is **upgrades at any time and no downgrades**. Whether that becomes a setting for every workspace is not decided.

## Default plans

A new workspace starts with three ready-made offers, the **default plans** (owner, 21 October 2026). They are pre-filled and **switched off**: clients can't see or buy them until the owner turns them on. Fivvi never suggests a price, so the owner adds the price (including VAT) first. The rest of this section is a proposal, tied to [QC19](../design/open-questions.md#qc19): an offer can't be switched on without a price (QC19 a), and the default's VAT rate is the owner's to set, starting from the workspace's usual rate and checked with the gym's accountant (QC19 c, [QC10](../design/open-questions.md#qc10)).

| Default plan | Kind | Pre-filled | Paid |
|---|---|---|---|
| **Membership** | Membership | 2 group classes a week, for 6 months, 2 makeups a month | Monthly (§94) |
| **Group credit pack** | Credit pack, group | 10 group credits, valid for 3 months | Once, up front (§94) |
| **Private credit plan** | Credit plan, private | 4 private credits a month (about one session a week), minimum term of 3 months | Monthly (§94) |

- **The owner can change every field of an offer** (owner decision), a default included: its name (Dutch and optional English, as in §18), price, VAT rate, classes and weekdays, credits, term or validity, payment schedule, cancellation cutoff, makeup limit and carry-over, where they apply. The owner can also switch a default off again or delete it.
- **Starting values.** The defaults start with the pilot's answers: a cutoff of 12 hours for classes and 24 hours for private sessions ([QC02](../design/open-questions.md#qc02)), a minimum term of 3 months for the private credit plan (QC19 d) and 2 makeups a month for the membership ([QC03](../design/open-questions.md#qc03), QC19 e). The carry-over limit starts at 0 ([QC17](../design/open-questions.md#qc17), the proposal stands). The rest of QC19 (a to c) is still a proposal, unconfirmed.
- **A default is a starting point, not a template that stays linked** (proposal, QC19 b). The workspace gets its own copy when it is created; later changes to Fivvi's defaults never change an existing workspace.
- **Changes apply to new agreements only** (proposal, [QC15](../design/open-questions.md#qc15)); this includes changing any field, switching an offer off or deleting it: agreements that already run keep their terms.

## Owner-made plans

The owner can **create their own offers** from scratch (*Nieuw aanbod* / *New offer*; the UI term is to confirm, `packages/i18n/GLOSSARY.md` §4.9), next to or instead of the defaults, with the same fields as a default. Every offer is **one of the four kinds** above (membership, credit pack, credit plan or single class; the single class is proposed, [decision 9](ROADMAP.md#14-decisions)). An owner can't create a new kind, and a credit offer is of one kind, so group, private and Open Gym credits never mix (§92).

---

# 91. Memberships

A **membership** is a client's agreement for a **weekly allowance** of group classes, for a term (for example 2 classes a week, 6 months). The pilot's memberships give 1, 2 or 3 classes a week.

- **The client books each class themself** whenever a spot is free, within the allowance. Many clients keep the same day and time out of habit, but the membership holds **no standing spot**, so capacity is never exceeded. The pilot's membership is a weekly allowance; whether memberships on fixed weekdays with a standing spot stay an option is not decided (the product owner's call).
- **Weekly limit** (a workspace setting, a number or off): the most bookings one client can make in a week. The pilot uses 4, whatever the size of the membership, so a client can catch up after a missed week.
- **Unused weekly classes** (a workspace setting): they either **expire at the end of the week** (the pilot's choice) or **stay valid until the agreement ends**. Fivvi handles both automatically; the weekly limit stops a client from saving classes up and using them all at once.
- While the membership is active and paid up, the client books the included classes without paying again. What happens when a payment fails is a setting of the offer (§94, [QC05](../design/open-questions.md#qc05)).
- It has a start date, an end date, and what happens at the end, set on the offer (§90): it stops, or it continues per cycle under the rules of Dutch consumer law ([QC07](../design/open-questions.md#qc07)). The terms the client agreed to are stored with the agreement.
- It is billed every month or every 4 weeks, as the offer says (§90). The pilot allows upgrades at any time and no downgrades.
- The client confirms it online with its first payment, which also gives the mandate for the recurring payments (§94; [QC06](../design/open-questions.md#qc06)).

---

# 92. Credits and the credit balance

A **credit** is one unit of a client's credit balance. Credits come in three kinds that never mix (owner, 21 October 2026; Open Gym credits added on 31 October 2026):

- **Group credits** book group classes.
- **Private credits** book private sessions.
- **Open Gym credits** book Open Gym slots (§28). The pilot gym asked for these as their own kind, instead of Open Gym without credits. Whether the pilot sells any, and how, is settled in the F034 and F035 specs.

One credit books one session of its kind: there are no exchange rates between the kinds, and no way to pay a private session with group credits or the other way round. **Combined credits**, one balance for every session type, are not planned (§53).

Credits come with an agreement, from one of two offers (§90):

- A **credit pack** gives a number of credits, bought once and valid for a period set on the offer ([QC17](../design/open-questions.md#qc17)). A pack can be an intro offer, limited to **once per client** (§90).
- A **credit plan** gives a number of credits each billing cycle, paid by a recurring payment (§94), with a carry-over limit for credits left at the end of the cycle (a limit set on the offer; carried-over credits expire at the end of the next cycle, [QC17](../design/open-questions.md#qc17)).

The pilot's private training (about one session a week, 6 months today) is a **private credit plan**, paid monthly by direct debit ([QC08](../design/open-questions.md#qc08)). Its combination of 1 private session and 1 group class a week is two agreements, a membership and a private credit plan, sold together; how to present them as one product is for the F052 spec. A member who wants an extra group class buys group credits (one, or a pack) from a **member-only** offer (§90); they must be used during the membership. Unused credits expire at the end of the term, and private sessions get the 30 days of §93.

- The owner creates the agreement for a client; the client confirms it and pays online (§94).
- A group class (§18) can use one group credit and a private session (§17) one private credit, from an agreement of the matching kind. The booking and the session screen show which agreement. One private credit covers a private session of any length ([QC18](../design/open-questions.md#qc18)). When a client has a membership and group credits, the booking uses the membership first and the credits only for an extra class; which of several credit agreements of one kind is used first is [QC17](../design/open-questions.md#qc17).

A **credit balance** shows what a client can still use under an agreement, in credits of that agreement's kind. It is never a bare counter. Each change is a line in its history: granted, used, returned, expired, with the session, the person or rule that caused it, and the time. The balance is the sum of that history, so the owner and the client can always see why it says what it says. A membership's makeups (§93) are tracked the same way, as their own lines, and are not credits.

Each agreement has its own balance, and each balance is in one kind: using a credit never touches a membership's makeups, and a single class never touches either. A client with group and private credits sees two balances, for example "6 group credits, 3 private credits", each adding up its agreements and each leading to the agreements and the history behind it.

---

# 93. Cancellation, no-shows and makeups

Each offer has a **cancellation policy**:

| Event | Effect |
|---|---|
| The client cancels before the **cutoff** (hours before the start, set per offer; proposal, [QC02](../design/open-questions.md#qc02)) | Membership: may grant a **makeup**, up to the makeup limit (2 per month by default). Credit plan: the credit returns to the balance, at most 2 times per month like the makeups (QC02). Credit pack: the credit returns to the balance (proposal, [QC02](../design/open-questions.md#qc02)) |
| The client cancels after the cutoff (late cancellation) | The credit is used or the membership class is lost, like a no-show (proposal, [QC16](../design/open-questions.md#qc16)) |
| **No-show** | The credit is used (pack or plan) or the class is lost (membership) (proposal, [QC16](../design/open-questions.md#qc16)) |
| The workspace cancels the session or class | Credits: the credit returns (proposal, [QC02](../design/open-questions.md#qc02)). Membership: a makeup, outside the limit (proposal, [QC04](../design/open-questions.md#qc04)) |

The pilot gym's values, which the defaults start with (§90): a cutoff of **12 hours for group classes and 24 hours for private sessions**; at most **2 makeups per month** on a membership and, on a credit plan, at most **2 credits returned per month** (the same limit as the cancellations in time that give them; after that the class is lost); a makeup is valid **until the end of the membership** and can be used in any class the membership includes; when the workspace cancels, everyone gets the class back in full, outside the limit. For a private session, moving it up to 24 hours before counts as cancelling in time, within the same limit. The owner can also add catch-up classes by hand, for example after a holiday while the client kept paying; they must be used within the membership. The pilot gym's terms let private sessions be made up until 30 days after the term ends; group classes not after the term. There is no pause (freeze): illness and holidays fall under the normal limit ([QC04](../design/open-questions.md#qc04)). Before confirming a cancellation, the client sees what it does to their balance or makeups. An agreement keeps the policy that applied when it started (proposal, [QC15](../design/open-questions.md#qc15)).

---

# 94. Recurring payments

Payments run through a **payment provider**. [ADR-020](../decisions/ADR-020-payment-provider.md) (Accepted by the owner, 21 October 2026) decides on **Mollie Connect for Platforms**, with Stripe Connect as the fallback (see [`ROADMAP.md` decision 14](ROADMAP.md#14-decisions)). **Merchant model (decided in ADR-020):** each workspace connects its own Mollie account, so the gym is the merchant: client money goes from the provider to the gym's bank account and never through an account of Fivvi. The provider pays out to the gym weekly (the gym sets the day in its own Mollie dashboard); the pilot wants weekly payouts. The gym pays the provider's fee per payment; passing a payment-method surcharge on to clients is often not allowed in the Netherlands and is part of the legal check (`ROADMAP.md §4.4`, [QC13](../design/open-questions.md#qc13)).

- **Connecting payments is one guided step, and only the Owner does it** (trainers never; decision 13 and ADR-020). In Fivvi the owner chooses *Betalingen koppelen* / *Connect payments*. Fivvi creates a pre-filled Mollie account (name, email, company, KvK) and opens Mollie's onboarding in Dutch. The owner finishes Mollie's own checks (KvK, ID, owners, bank verification) and returns to Fivvi connected. An owner who already has a Mollie account just logs in and approves. Mollie reviews SEPA Direct Debit separately (it aims for 3 business days), so payments switch on only when Mollie reports that the account can receive them; until then Fivvi shows the status in plain words.

- **First payment:** the client pays online (iDEAL first; proposal, [QC06](../design/open-questions.md#qc06)) when confirming a membership, a credit pack or a credit plan. That payment also gives the **mandate** for later collections (proposal, [QC06](../design/open-questions.md#qc06)).
- **Recurring payments:** on each due date Fivvi asks the provider to collect the next amount by SEPA Direct Debit under the mandate (proposal, [QC06](../design/open-questions.md#qc06)). The payment schedule belongs to the agreement and has nothing to do with the class times. It follows the offer's **billing cycle**, every month or every 4 weeks (§90; the pilot: every month). A credit plan is paid this way like a membership; its credits are granted when the cycle's payment is paid ([QC17](../design/open-questions.md#qc17)). The pilot's private training moves to direct debit too ([QC06](../design/open-questions.md#qc06)).
- **Exactly once:** a due amount is charged once, even when a job retries or the provider sends the same event twice.
- **Failed payment:** the client and the owner get an email (proposal, [QC05](../design/open-questions.md#qc05)), and the agreement shows the open amount. Whether the client can keep booking until it is paid is a setting of the offer (proposal, [QC05](../design/open-questions.md#qc05)), never an accident.
- **Refund and chargeback:** the owner can refund a payment fully or in part (only the owner refunds in the MVP, [QC12](../design/open-questions.md#qc12)). A refund or a reversed direct debit gets a credit note (§96), and the policy says what happens to the credits.
- The trainer and client apps never take payments; clients pay on the web (proposal, [QC16](../design/open-questions.md#qc16)).

---

# 95. Single class purchase (proposed, [decision 9](ROADMAP.md#14-decisions))

A client can buy one class: as a client without a membership, or as a client with a membership who wants an extra class this week. They choose the class on the booking page (§21), pay online, and the booking is confirmed when the payment succeeds. The spot is held while they pay, like a booking hold (§24; proposal, [QC16](../design/open-questions.md#qc16)). Buying an extra class never changes what the membership includes. Single classes stay an offer kind any studio can switch on (product owner, 31 October 2026); whether the pilot gym sells them is not known.

---

# 96. Invoices

Every payment gets an **invoice**, emailed to the client and kept on their profile and in client web.

- **Billing details:** a client can put a company name, address and VAT number on their invoices; the owner can too, on behalf of a client (proposal, [QC16](../design/open-questions.md#qc16)). Without them, the invoice uses the client's name.
- It meets the Dutch invoice requirements (Belastingdienst): a unique number in one series per workspace without gaps (one series per workspace is a proposal, [QC10](../design/open-questions.md#qc10)), the issue date, the workspace's legal name, address, KvK and VAT number, the buyer's details, what was supplied, the amount excluding VAT, the VAT rate and amount, and the total.
- Once issued, an invoice never changes, even when the client's or workspace's details change later. A correction is a **credit note** that refers to it.
- Private invoices are made automatically: the owner no longer types them.
- Invoices are in the client's communication language (§3), with the amounts in euros.

---

# 97. Payouts and reconciliation

The owner sees, per payout from the provider, which payments, refunds, chargebacks and provider fees it contains, and which payments failed or are still open. Everything the provider reports must match a payment in Fivvi; whatever doesn't is shown to the owner, never ignored. The pilot gym wants as much detail as possible: each payment in a payout, not only a total. A payout on demand (the current app has a cash-out-at-any-time button) is a wish of the pilot gym owner, not decided.

At go-live the active agreements, their credit balances and their next due dates are imported (E015) and the owner checks the reconciliation report against the old app before the cutover, when every client gets the first-payment link for the new mandate (`ROADMAP.md §7`).
