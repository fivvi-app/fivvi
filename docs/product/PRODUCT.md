# Trainer Platform
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

The first version must solve the real workflow of the pilot gym:

- private training
- group classes
- multiple trainers
- public class booking
- Open Gym booking
- client management
- workout/program management
- live workout logging
- trainer notes
- scheduling

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

## 2.1 Keep it simple

The platform must reduce administration compared with:

- Excel
- Calendar
- Notes
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
- uses Excel/calendar manually
- tracks workouts and notes manually
- wants Open Gym availability

Therefore:

> Multi-trainer organization support is an MVP requirement.

---

# 9. User roles

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
- manage settings

The pilot PT is:

```text
Owner
+
Trainer
```

---

## Admin

Can manage:

- calendar
- classes
- bookings
- clients
- trainers

without full ownership permissions.

---

## Trainer

Can:

- view own schedule
- manage relevant sessions
- run assigned classes
- access relevant clients
- log workouts
- add notes
- mark attendance

---

## Client

Can:

- book group classes
- book Open Gym
- verify email (creates the account automatically)
- later use client web/mobile

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

Supported MVP types:

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

## Organization session

If class belongs to John's Gym:

```text
Location:
John's Gym
```

automatically.

---

## Independent client

If Anna's normal gym is:

```text
TrainMore Zuid
```

the next session automatically uses that location.

---

## Ambiguous location

Only then ask:

```text
Where is this session?

TrainMore Zuid
Basic-Fit Oost
Other
```

---

# 14. Client preferred location

A client relationship can have:

```text
Default training location
```

Especially useful for independent trainers.

---

# 15. MVP platforms

## Trainer Web

Primary administrative interface. The daily operational screens (Today, personal calendar, sessions, attendance, workout logging, notes) also work in a phone browser, with touch-sized targets, and the trainer web can be added to the phone's home screen. Until the native trainer apps arrive, this is how trainers work from a phone. The workout logger keeps sets that weren't sent yet on the device and sends them when the connection returns.

- dashboard
- calendar
- trainers
- clients
- classes
- Open Gym
- workouts
- booking links
- QR codes
- settings

Available in:

```text
Dutch
English
```

---

## Trainer Mobile

iOS + Android. Delivered after the pilot goes live on the web (`ROADMAP.md §3.1`); the apps then join the pilot.

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
- group class, one-off or repeating every week (owner/admin only)
- Open Gym (owner/admin only)

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

Must have a prominent:

```text
NL | EN
```

switch.

---

## Client Web

Initially:

- upcoming bookings
- past bookings
- cancellation
- profile

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

Trainer/admin can:

- create
- reschedule
- cancel
- assign trainer
- assign client
- set/infer location
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
app.com/book/johns-gym
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

After booking, the confirmation screen shows one explanatory line — no choice, no extra screen:

Dutch:

```text
Je boeking is bevestigd.

We maken een account voor je aan, zodat je je boekingen kunt zien.
```

English:

```text
Your booking is confirmed.

We create an account for you so you can see your bookings.
```

The account can be deleted on request (E014).

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

- the first sign-in of an email address we've allowed (the pilot owner, during the pilot)
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

A client can be added wherever a client is chosen (new session, the client list, the app's **+**). Only a name is required; email, language for emails and default training location are optional. A matching email in the same workspace offers the existing client instead of a duplicate.

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
Payments
Memberships
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

---

# 49. Trainer invitations

Owner invites trainer by email.

Invitation email must be bilingual/localized according to:

1. selected recipient language if known
2. otherwise workspace default

---

# 50. MVP roles

```text
Owner
Admin
Trainer
```

Do not build custom permissions yet.

---

# 51. Notifications

MVP client emails:

- magic link
- booking confirmation
- cancellation
- schedule change
- class cancellation
- trainer-shared workout recap and optional client message

Trainer emails:

- new booking
- cancellation

All templates require:

```text
nl-NL
en
```

versions.

---

# 52. MVP scope

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

- organization location
- external location
- client preferred location
- automatic inference

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

## Training

- exercise library
- custom exercises
- workout templates
- client workouts
- live logging, with or without a template
- repeat previous workout
- save a logged workout as a template
- previous performance
- history

## Notes

- client notes
- session notes
- note visibility

## Platforms

- trainer web
- trainer iOS
- trainer Android
- responsive public booking web
- basic client web

---

# 53. Explicit MVP exclusions

Do not build yet:

- billing
- invoices
- payments
- packages
- subscriptions
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

---

# 54. Release 1.1 — Pilot refinement

Based on actual usage:

- waitlists
- cancellation cutoff
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

Previous-session duplication moved to the MVP (§41) on 23 September 2026, after prototype feedback.

All additions must work in Dutch and English.

---

# 55. Release 1.2 — Client apps

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

Default location minimizes repetitive selection.

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

# 66. Release 4 — Commercial features

Add:

- packages
- credits
- subscriptions
- memberships
- payments
- invoices
- recurring payments
- reminders
- accounting integrations

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
17. Locations
18. organization default location
19. client preferred location
20. automatic location inference

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

## Phase G — Workouts

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

66. import required existing data
67. onboard gym owner
68. onboard other trainers
69. add group classes
70. publish Dutch-first booking page
71. verify English booking experience
72. publish Open Gym
73. run real sessions
74. observe usage
75. track workarounds
76. track remaining Excel/calendar/notes usage
77. define Release 1.1 from actual evidence

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
- private workout logging replaces Excel
- notes replace scattered tools
- previous performance is easy to access
- owner sees organization schedule
- trainer sees combined personal schedule
- normal usage requires no developer intervention

Strongest validation signal:

> The pilot gym does not want to return to Excel + separate calendar + manual booking.

---

# 88. Roadmap summary

| Release | Objective |
|---|---|
| **MVP** | Dutch-first pilot gym platform |
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
| **4.0** | Payments and billing |
| **5.0** | Advanced AI |
| **6.0** | Integrations |
| **7.0** | Larger-business features |

---

# 89. Core product promise

## Gym owners

> Manage trainers, clients, private sessions, group classes and Open Gym in one place.

## Trainers

> Know where you need to be, who you're training, what they did last time and what you need to remember.

## Clients

> Scan a QR code, choose a session, enter your name and email, verify it and you're booked.

## Netherlands launch requirement

> Every essential workflow must work naturally in Dutch first, with a complete English alternative available everywhere.
