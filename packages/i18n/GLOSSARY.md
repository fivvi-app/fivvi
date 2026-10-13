# Trainer Hub: terminology and tone glossary (nl-NL + en)

This is the **single terminology source** for every user-facing string on every surface: trainer web, iOS, Android, public booking, client web and email. Humans and LLM translators both use it. If a string and this glossary disagree, the string is wrong.

- **Status:** v0.2, started in M0 (`ROADMAP.md §4.2`). Terms marked ⚠️ still need to be validated with the pilot owner (see [§8 Open questions](#8-open-questions-validate-with-the-pilot-owner)).
- **Scope:** UI strings, emails, notifications, validation messages, empty states, public booking pages and QR posters. Legal documents (privacy policy, terms, verwerkersovereenkomst) follow their own register and are out of scope.
- **Catalogs:** `packages/i18n/nl-NL.json` and `packages/i18n/en.json` (ICU MessageFormat, ADR-008). Native catalogs (`.xcstrings`, `strings.xml`) are generated from them and are never edited by hand.
- **Precedence:** `PRODUCT.md` owns requirements. This file owns terminology, tone and copy style. Where it deliberately differs from example copy in `PRODUCT.md`, [§7](#7-deviations-from-productmd-example-copy) lists why.

## Contents

1. [Tone of voice](#1-tone-of-voice)
2. [Capitalization, spelling and punctuation](#2-capitalization-spelling-and-punctuation)
3. [Dates, times and numbers](#3-dates-times-and-numbers)
4. [Term table](#4-term-table)
5. [UI verbs, messages and dialogs](#5-ui-verbs-messages-and-dialogs)
6. [How agents use this glossary](#6-how-agents-use-this-glossary)
7. [Deviations from PRODUCT.md example copy](#7-deviations-from-productmd-example-copy)
8. [Open questions (validate with the pilot owner)](#8-open-questions-validate-with-the-pilot-owner)
9. [Changelog](#9-changelog)

---

## 1. Tone of voice

### 1.1 Dutch (nl-NL): informal "je", friendly and short

**Decision: always address the reader with "je", never "u".** `ROADMAP.md §10` sets the tone guide as *informal "je", friendly and short*, and `PRODUCT.md §26` already uses it ("Je boeking is bevestigd. Wil je een account aanmaken?"). This applies to every audience (owners, trainers, clients, guests) and every surface, including emails.

| Rule | ✅ Do | ❌ Don't |
|---|---|---|
| Use "je" as subject and possessive. Use "jij/jouw" only for emphasis or contrast | Je boeking is bevestigd. | Uw boeking is bevestigd. / Jouw boeking is bevestigd. |
| Never mix "je" and "u" in one product, screen or email | Wil je een account aanmaken? | Wilt u een account aanmaken? |
| "Je" is lowercase mid-sentence, and there is no capital "U" | Kies een les die bij je past. | Kies een les die bij U past. |
| Short sentences, active voice | We hebben je een e-mail gestuurd. | Er is door ons een e-mail naar u verzonden. |
| Plain words instead of officialese | Vul je naam in. | Gelieve uw naam in te vullen. |
| Use "we" for what the platform does. Name the workspace when the gym or trainer does something | John's Gym heeft je les geannuleerd. | We hebben je les geannuleerd. (when the gym did it) |
| Friendly, not cute | Er ging iets mis. Probeer het opnieuw. | Oeps! Daar ging iets fout 🙈 |

**Words to avoid in Dutch copy** (stiff, bureaucratic or anglicized): *u, uw, gelieve, a.u.b., alstublieft, indien, dient te, middels, reeds, teneinde, wij verzoeken, succesvol* (as in "succesvol opgeslagen"), *klik hier, selecteer* (prefer *kies*), *Oeps*.

Keep established loanwords that Dutch trainers actually use: *training, trainer, dashboard, account, link, e-mail, set, Open Gym, online, studio*. Don't introduce new anglicisms when a common Dutch word exists (*notitie*, not *note*; *melding*, not *notificatie*).

### 1.2 English (en)

- Second person ("you"), friendly and plain. Contractions are fine: *you're, we've, don't*.
- Same content and intent as the Dutch string. English is **not** a literal back-translation of Dutch, and Dutch is not a literal translation of English. Each must read naturally.
- Avoid *please* on every line, *successfully*, *Oops*, *Error:*, *Are you sure?*, *click here*.
- **Spelling: British English (en-GB)**, matching the en-GB date/time formatting in §3 and `PRODUCT.md`'s own "Cancelled": *cancelled, colour, centre, favourite, personalise, organise*. Code identifiers keep their existing spelling (`organization_id`).

### 1.3 Shared principles

- **Say what happened and what to do next.** No error codes, stack traces or blame.
- **Specific over generic.** "Les annuleren" beats "Annuleren"; "Boeking bevestigd" beats "Gelukt".
- **User content is never translated.** Class names, workspace names, exercise names a trainer typed, and notes stay exactly as entered (`PRODUCT.md §3`, §35).
- **Language names are always written in their own language:** *Nederlands*, *English*. The switch reads `NL | EN`.

---

## 2. Capitalization, spelling and punctuation

### 2.1 Capitalization

- **Sentence case everywhere, in both languages:** buttons, headings, tabs, navigation, labels, email subjects. EN: "Booking links", "Add client". NL: "Boekingslinks", "Klant toevoegen".
- **Never write all-caps in the catalog.** Headings like "GROEPSLESSEN" in `PRODUCT.md §21` are a visual style. Store "Groepslessen" and apply `text-transform`/platform styling.
- **Always capitalized:** *Open Gym* (a product term, both words capitalized, in both languages), *Trainer Hub*, workspace/brand names as entered.
- **NL weekdays and months are lowercase** in running text: "dinsdag 22 september". They take a capital only at the start of a sentence or label. EN weekdays and months are always capitalized.
- **Role and status labels** start with a capital when shown as a label or badge ("Eigenaar", "Niet verschenen"). In running text they're lowercase ("je bent eigenaar van John's Gym").

### 2.2 Dutch spelling that LLMs get wrong

- **Compounds are one word:** *boekingslink, boekingspagina, klantnotitie, sessienotitie, trainingsschema, wachtlijst*. Never "boekings link" or "boeking link".
- **Hyphenate** compounds with an abbreviation, a multi-word English term or a vowel clash: *QR-code, e-mailadres, Open Gym-moment, Open Gym-boeking, sms-code*.
- *e-mail* has a hyphen in Dutch (*e-mail, e-mails, e-mailadres*). English writes *email*.
- Plurals with an apostrophe after a long vowel: *agenda's, schema's*. No apostrophe elsewhere: *sessies, lessen, klanten*.
- Adjective inflection follows the article: *de les → nieuwe les*, but *het trainingsschema → nieuw trainingsschema*, *het account → nieuw account*. The term table lists articles for this reason.
- Diaeresis and accents: *privé, privésessie, cliënt* (forbidden anyway), *kopiëren, geïnteresseerd*.

### 2.3 Punctuation

- **Ranges use an en dash without spaces:** `18:00–19:00`, `ma–vr`.
- **Ellipsis is one character:** `…` ("Laden…", "Loading…").
- **No full stop** on buttons, labels, tabs, headings, badges or single-phrase toasts ("Opgeslagen"). **Full stop** on full-sentence body text, helper text and error messages.
- **Exclamation marks:** at most one, only for real good news (a confirmed booking). Never in errors.
- **Quotes:** avoid them in UI copy. If you need them, use single curly quotes ‘…’ in both languages.
- **Names with apostrophe-s** stay as entered: *John's Gym*. Dutch genitive for a name: *Anna's training*.

---

## 3. Dates, times and numbers

Timestamps are stored in UTC. Render them in the **workspace timezone** (default `Europe/Amsterdam`), or the viewer's timezone where the feature says so (`AGENTS.md`, ADR-012).

### 3.1 Formatting rules

- **Always format with the platform formatter** (`Intl.DateTimeFormat`/next-intl on web, `FormatStyle`/`DateFormatter` on iOS, `java.time` `DateTimeFormatter` on Android) with an explicit locale and timezone. Never build date strings by hand or hard-code month/weekday names in the catalog.
- **Pass formatted values into placeholders.** Format dates, times and numbers in code (web: `dateTimeFormats` from `@trainer-hub/i18n`) and pass the result as a plain `{date}` / `{time}` argument. ICU `{d, date, …}` skeletons don't survive export to `.xcstrings`/`strings.xml`, so the `icu` check rejects them (E005).
- **Formatting locale for English is `en-GB`**, not `en`/`en-US` (owner decision, 2026-09-22). Our English users are in the Netherlands and expect day-month order and 24-hour time. The catalog locale stays `en`; E005 maps it to `en-GB` for formatting.
- **24-hour time in both languages.** No AM/PM, and no "uur" after the time in UI labels.
- **Weeks start on Monday** in both languages.
- **Avoid numeric-only dates** (`22-9-2026`) in UI. They're ambiguous for English readers.
- Show a timezone label only when the viewer's timezone differs from the session's timezone.

### 3.2 Reference formats

| What | nl-NL | en (en-GB formatting) |
|---|---|---|
| Long date | dinsdag 22 september 2026 | Tuesday 22 September 2026 |
| Date without year (current year) | dinsdag 22 september | Tuesday 22 September |
| Short date | di 22 sep | Tue 22 Sep |
| Time | 18:00 | 18:00 |
| Time range | 18:00–19:00 | 18:00–19:00 |
| Date + time in a sentence | dinsdag 22 september om 18:00 | Tuesday 22 September at 18:00 |
| Relative day | vandaag, morgen, gisteren | today, tomorrow, yesterday |
| Duration (compact) | 60 min, 90 min | 60 min, 90 min |
| Week number (optional, calendar) | week 39 | week 39 |
| Decimal | 62,5 kg | 62.5 kg |
| Thousands | 1.250 | 1,250 |
| Occupancy | 7/8 | 7/8 |
| Set line (logging) | 62,5 kg × 8 | 62.5 kg × 8 |
| Currency (post-MVP only) | € 12,50 | €12.50 |

- **Units:** a space between number and unit (`62,5 kg`, `60 min`). Use `×` (multiplication sign), not the letter `x`, in set lines.
- **Number input:** in nl-NL, weight and decimal fields must accept both `,` and `.` as the decimal separator. Trainers type both.

### 3.3 Plurals and placeholders (ICU)

- Dutch and English both use the plural categories `one` and `other`, and every plural needs both. When zero needs its own wording, use a separate key and choose it in code: Android ignores `=0` in Dutch and English, so the `icu` check rejects exact selectors (E005).
- Always write full sentences with placeholders. **Never concatenate fragments**, because Dutch word order differs (the verb moves to the end in subordinate clauses).

```json
"booking.spotsAvailable": "{count, plural, one {Nog # plek beschikbaar} other {Nog # plekken beschikbaar}}"
"booking.spotsAvailable": "{count, plural, one {# spot left} other {# spots left}}"
"booking.full": "Vol"
"booking.full": "Full"
```

---

## 4. Term table

How to read it:

- **NL term** gives the noun with its article and plural, e.g. *les (de, lessen)*. Use exactly this word.
- **Notes / forbidden** lists alternatives that must not be used for this concept, in either language. Where an alternative is reserved for another concept, the note says which.
- **Internal** means the word appears in code, the database or the API, but never in the UI.
- 🔜 marks a term for a post-MVP release. It's listed now so nobody uses the word for something else in the meantime.

### 4.1 Workspaces, people and roles

| EN term | NL term | Definition | Notes / forbidden alternatives |
|---|---|---|---|
| workspace | werkruimte (de, werkruimtes) ⚠️ | A business on the platform: a gym, studio or independent trainer's business. It owns its clients, sessions, classes, locations and settings (`PRODUCT.md §5`). | Prefer the workspace's own name ("John's Gym") wherever it fits. ❌ NL: *organisatie, bedrijf, omgeving, workspace*. ❌ EN UI: *organization, org, company, account* (for the business). |
| organization | — *(internal)* | Code and database name for a workspace (`organization_id`, `organizations`). | Never shown in the UI. Say *workspace/werkruimte*. |
| personal workspace 🔜 2.2 | persoonlijke werkruimte | A trainer's own independent workspace. | |
| team | team (het, teams) | Everyone with a role in a workspace: owner, admins and trainers. | |
| team member | teamlid (het, teamleden) | One person in the team. Internally `organization_member`. | ❌ *lid, leden, lidmaatschap, member, membership* for this concept. **"lid/lidmaatschap" and "member/membership" are reserved** for gym memberships (`PRODUCT.md §60`, 🔜 Release 4). ❌ *medewerker, personeel, staff, gebruiker*. |
| role | rol (de, rollen) | Owner, Admin or Trainer (`PRODUCT.md §50`). | No custom roles in MVP. |
| Owner | Eigenaar (de, eigenaren) | Manages the whole workspace, including trainers, settings and booking links. Can also be a trainer. | ❌ *baas, beheerder* (that's Admin), *owner* (NL). |
| Admin | Beheerder (de, beheerders) | Manages calendar, classes, bookings, clients and trainers, without full owner rights. | ❌ NL: *admin, administrator, manager*. |
| Trainer | Trainer (de, trainers) | Runs sessions and classes, logs workouts, writes notes and marks attendance. | ❌ *coach, instructeur, docent, PT* (as a role name). "Personal trainer" is fine in marketing copy, not as a role. |
| client | klant (de, klanten) | A person who trains with or books at a workspace. Belongs to the workspace, not to one trainer (`PRODUCT.md §10`). | ❌ NL: *cliënt* (sounds medical), *lid, sporter, deelnemer* (see *participant*), *gebruiker*. ❌ EN: *customer, member, user, athlete*. |
| guest | gast (de, gasten) | A client who booked without an account (verified email only). | Mostly internal. In the UI, prefer describing it: "zonder account" / "without an account". |
| participant | deelnemer (de, deelnemers) | A client on a session's list: booked into a class or Open Gym slot, or the client of a private session. | ❌ EN: *attendee, student*. ❌ NL: *cursist, leerling*. |
| independent trainer | zelfstandig trainer | A trainer who runs their own workspace (onboarding option, `PRODUCT.md §58`). | ❌ *zzp'er, freelancer* in UI. |
| gym | sportschool (de, sportscholen) | A physical fitness business or venue. | "Gym" is fine in names ("John's Gym") and in *Open Gym*, but not as a generic Dutch noun. ❌ *fitnesscentrum, fitnessclub*. |
| studio | studio (de, studio's) | A small training venue. | |
| invitation | uitnodiging (de, uitnodigingen) | An email invite from an owner to join the workspace as a trainer or admin (`PRODUCT.md §49`). | Verbs: *invite* → *uitnodigen*, *accept* → *accepteren*, *decline* → *afwijzen*. Status: *Uitnodiging verstuurd* / *Invitation sent*. |
| profile | profiel (het, profielen) | Trainer profile / client profile. | *trainersprofiel*, *klantprofiel*. |

### 4.2 Scheduling

| EN term | NL term | Definition | Notes / forbidden alternatives |
|---|---|---|---|
| calendar | agenda (de, agenda's) | The day/week view of sessions. | ❌ *kalender, planning, rooster* (see *timetable*). |
| my calendar | mijn agenda | A trainer's combined calendar across **all** their workspaces (`PRODUCT.md §78`). | |
| workspace calendar | agenda (+ workspace name) | All sessions owned by one workspace. | In UI: "Agenda" inside the workspace, or "Agenda van John's Gym" when you need to disambiguate. ❌ *werkruimte-agenda*. |
| Today | Vandaag | Mobile home screen and dashboard section (`PRODUCT.md §45`). | |
| My day | Mijn dag | Trainer dashboard across workspaces (`PRODUCT.md §46`). | |
| timetable | rooster (het, roosters); *lesrooster* | The recurring weekly pattern of classes. | Use *schedule change* → *roosterwijziging* for trainer-facing copy. For clients, describe the change instead: "Je les is verplaatst". ❌ EN: *schedule* as a noun (ambiguous with the verb). |
| schedule (verb) | inplannen | Put a session in the calendar. | ❌ *plannen* (fine in speech, but use *inplannen* in UI), *schedulen*. |
| session | sessie (de, sessies) | **Generic** word for any scheduled item: private session, class or Open Gym slot (`PRODUCT.md §16`). | Use it only when you mean any type ("Waar is deze sessie?", "sessienotities"). Otherwise use the specific word. ❌ *afspraak, event, activiteit, evenement*. ❌ *training* (in NL that means *workout*). |
| private session | privésessie (de, privésessies) ⚠️; type label **Privé** | A trainer-led session for a named client, created by the trainer or admin. | EN type label: **Private**. ❌ *PT-sessie, privéles, privétraining, afspraak, personal training* (in UI). |
| class | les (de, lessen); **groepsles** when you need to contrast with private | A group class: name, description, trainer, location, capacity, duration, timetable. Belongs to the workspace, not to the trainer (`PRODUCT.md §18–19`). | EN: *class*, *group class*. ❌ EN: *lesson, course, workshop, group session*. ❌ NL: *groepstraining, cursus, workshop*. Nav label: *Lessen / Classes*. |
| occurrence | *(internal)* — in UI: **les** + date | One dated instance of a (recurring) class, with its own trainer, capacity, bookings, attendance and status (`PRODUCT.md §20`). | Never show *occurrence, instantie, exemplaar, voorkomen*. Edit-scope choices: *Alleen deze les / Deze en volgende lessen / Alle lessen* — *Only this class / This and following classes / All classes*. Booking-link scope: *Eén lesdatum / One class date*. |
| recurring | terugkerend (adj.) | Repeats on a fixed pattern, e.g. every Tuesday at 18:00. | Field label *Herhalen / Repeat* with options such as *Niet herhalen*, *Elke week op dinsdag*. **Never the noun "herhaling" for recurrence**, because *herhaling* means *rep* (§4.5). ❌ *repeterend, recurrent, periodiek*. |
| reschedule | verplaatsen | Move a session to another date or time. | ❌ *herplannen, verzetten, omboeken*. |
| cancel (a session, class or booking) | annuleren; *cancellation* → **annulering** (de, annuleringen) | Call off a session or class, or withdraw a booking. | See the **Cancel collision** rule in §5.3. ❌ *afzeggen, afmelden, schrappen*. |
| assign | toewijzen; *assigned trainer* → **toegewezen trainer** | Link a trainer to a session, or a workout to a client. | ❌ *koppelen, inroosteren*. |
| substitution | vervanging (de); *substitute* (person) → **vervanger** (de) | Replacing the assigned trainer of one class occurrence. Bookings are not affected (`PRODUCT.md §19`). | UI: *Vervanger kiezen / Choose substitute*; badge *Vervanger: Mike / Substitute: Mike*. ❌ NL: *invaller, invaltrainer, invalkracht*. ❌ EN: *cover, stand-in, replacement*. |
| capacity | capaciteit (de) | Maximum number of participants. Active holds count toward it. | As a field label. In running text, talk about *plekken / spots*: "8 plekken". |
| spot | plek (de, plekken) | One place in a class or Open Gym slot. | ❌ NL: *plaats*. ❌ EN: *place, seat, slot* (*slot* belongs to Open Gym). |
| full | vol | No spots left. | Badge *Vol / Full*. |
| available | beschikbaar | Spots still open. | "Nog 3 plekken beschikbaar" / "3 spots left". |
| waitlist 🔜 1.1 | wachtlijst (de, wachtlijsten) | A queue for a full class. Not in MVP (`PRODUCT.md §54`). | ❌ *reservelijst*. |
| Open Gym | Open Gym (never translated) | A bookable time slot with start, end, location and capacity where clients train on their own (`PRODUCT.md §2.7`, §28). | Always two capitalized words. ❌ *vrij trainen, open training, open sportschool, open gym*. |
| Open Gym slot | Open Gym-moment (het, Open Gym-momenten) | One Open Gym session. | ❌ NL: *tijdslot, Open Gym-sessie*. |
| publish | publiceren | Make a class or Open Gym slot visible on the booking page. | Opposite: *offline halen / unpublish*. ❌ *live zetten, online zetten*. |

### 4.3 Locations

| EN term | NL term | Definition | Notes / forbidden alternatives |
|---|---|---|---|
| location | locatie (de, locaties) | The physical place where a session happens. Separate from the workspace that owns the session (`PRODUCT.md §7`). | ❌ *plek* (that's *spot*), *adres* (only for the address field), *vestiging* (reserved for branches of a multi-location business, 🔜 2.3), *venue*. |
| default training location | standaard trainingslocatie | A client's usual location, used to infer the location of new sessions (`PRODUCT.md §14`). | |
| Location type: `organization_location` | Eigen locatie | The workspace's own premises. | EN: *Own location*. |
| Location type: `external_gym` | Externe sportschool | Another gym where an independent trainer works. | EN: *External gym*. |
| Location type: `client_home` | Bij de klant thuis | | EN: *Client's home*. |
| Location type: `outdoor` | Buiten | | EN: *Outdoors*. |
| Location type: `online` | Online | | EN: *Online*. |
| Location type: `other` | Anders | | EN: *Other*. |

### 4.4 Booking and verification

| EN term | NL term | Definition | Notes / forbidden alternatives |
|---|---|---|---|
| booking | boeking (de, boekingen); *to book* → **boeken**; *booked* → **geboekt** | A client's confirmed place in a class or Open Gym slot. | ❌ NL: *reservering, inschrijving, aanmelding*. ❌ EN: *reservation, registration, sign-up, enrolment*. |
| booking page | boekingspagina (de, boekingspagina's) | The public page where clients book, without an app (`PRODUCT.md §21`). | |
| booking link | boekingslink (de, boekingslinks) | A shareable URL for a booking scope: all, group classes, Open Gym, one class or one class date (`PRODUCT.md §32`). | Nav: *Boekingslinks / Booking links*. |
| QR code | QR-code (de, QR-codes) | A code that opens a booking link. | Actions: *Link kopiëren, QR-code downloaden, Afdrukken, Delen* — *Copy link, Download QR code, Print, Share*. |
| hold | *(noun not used in UI)* — **je plek vasthouden** | A spot reserved temporarily (10–15 min) while the email is being verified. Counts toward capacity (`PRODUCT.md §24`). | UI: "We houden je plek {minutes} minuten voor je vast." / "We're holding your spot for {minutes} minutes." ❌ *reservering, blokkering, hold, claim*. |
| status `pending_verification` | Wacht op bevestiging | A held spot whose email isn't verified yet. | EN: *Awaiting confirmation*. |
| status `confirmed` | Bevestigd | Verified, booking complete. | EN: *Confirmed*. |
| status `expired` | Verlopen | The hold ran out and the spot was released. | EN: *Expired*. |
| verify (email) | bevestigen ("Bevestig je e-mailadres") | Prove ownership of an email address via the link or code. | ❌ NL: *verifiëren, valideren, activeren*. EN: *confirm your email* in UI copy; *verify* is fine in internal docs. |
| magic link | *(internal)* — **inloglink** / **bevestigingslink** | The link in the email. *Inloglink* when it signs someone in; *bevestigingslink* when it confirms a booking. | EN: *sign-in link* / *confirmation link*. ❌ *magic link, magische link* in UI. |
| verification code | verificatiecode (de, verificatiecodes); short: **code** | The 6-digit code in the same email as the link (ADR-007). | "Vul de code uit de e-mail in." / "Enter the code from the email." ❌ *pincode, wachtwoord, token, OTP, sms-code*. |
| sign in / sign out | inloggen / uitloggen | | EN: *Sign in / Sign out*. ❌ EN: *Log in, Login* (as a verb). ❌ NL: *aanmelden* (ambiguous with registering), *afmelden*. |
| account | account (het, accounts) | An optional client login, or a team member's login. | *Account aanmaken / Create account*, *Doorgaan zonder account / Continue without account* (`PRODUCT.md §26`). ❌ *profiel* for the login itself. |
| email | e-mail (de, e-mails); *email address* → **e-mailadres** (het) | | EN writes *email* without a hyphen. ❌ NL: *mail, mailadres, emailadres*. |
| booking confirmation | boekingsbevestiging (de) | The email and screen after a confirmed booking. | |
| my bookings | Mijn boekingen | The client's booking overview (`PRODUCT.md §15`, F033). | Tabs: *Aankomend / Upcoming*, *Afgelopen / Past*. |
| name | naam | The only personal field on the booking form, next to email (`PRODUCT.md §22`). | Label: *Naam / Name*. ❌ No phone number field, ever, in MVP. |

### 4.5 Attendance

| EN term | NL term | Definition | Notes / forbidden alternatives |
|---|---|---|---|
| attendance | aanwezigheid (de) | Whether each participant showed up. | Action: *Aanwezigheid registreren / Mark attendance*. |
| Booked | Geboekt | Has a confirmed booking; attendance not marked yet. | |
| Attended | Aanwezig | Showed up. | ❌ *gekomen, present*. |
| Cancelled | Geannuleerd | The participant cancelled in time, or the session was cancelled. | EN spelling *Cancelled* (en-GB). |
| No-show | Niet verschenen | Booked but didn't show up and didn't cancel. | ❌ NL: *no-show, afwezig* (sounds like an excused absence), *niet gekomen*. |
| Late cancel 🔜 1.1 | Te laat geannuleerd | Cancelled after the cancellation cutoff. Depends on the cutoff feature (`PRODUCT.md §54`). | EN label: *Cancelled late*. ❌ *late annulering* as a status label. |

### 4.6 Training

| EN term | NL term | Definition | Notes / forbidden alternatives |
|---|---|---|---|
| workout | training (de, trainingen) | A planned or logged set of exercises for one client. Nav: *Trainingen / Workouts* (`PRODUCT.md §44`). | **In Dutch, "training" means workout, never the calendar item** (use *sessie/les*). ❌ NL: *workout, oefensessie, trainingssessie*. |
| workout template | trainingsschema (het, trainingsschema's); short: **schema** ⚠️ | A reusable workout, e.g. "Upper A: Bench Press 3 × 8, Cable Row 3 × 10" (`PRODUCT.md §39`). | EN short form: *template*. ❌ NL: *sjabloon, template, programma*. |
| program 🔜 | programma (het, programma's) | A multi-week plan of workouts (later, `PRODUCT.md §40`). | Reserved. Don't use it for a single template. |
| assign a workout | training toewijzen | Give a workout or template to a client. | |
| exercise | oefening (de, oefeningen) | One movement, e.g. Bench Press. | ❌ *beweging, move*. |
| exercise library | oefeningenbibliotheek (de); screen title **Oefeningen** | The shared list of exercises with NL and EN names (`PRODUCT.md §38`). | EN: *Exercise library*; screen title *Exercises*. |
| custom exercise | eigen oefening | An exercise a trainer created. Stored as entered and never translated. | ❌ *aangepaste oefening, custom oefening*. |
| target muscles | spiergroepen | Field in the exercise library. | EN: *Target muscles*. |
| equipment | materiaal (het) | Field in the exercise library. | ❌ *apparatuur, benodigdheden, equipment*. |
| aliases | andere namen | Alternative names used for search. | EN UI: *Also known as*. |
| set | set (de, sets) | One round of reps of an exercise. | ❌ *serie, reeks, ronde*. |
| rep | herhaling (de, herhalingen) | One repetition within a set. | Compact tables: *herh.* / *reps*. Set lines use `62,5 kg × 8` with no word. ❌ NL: *reps, keer*. See the recurrence note in §4.2. |
| weight | gewicht (het) | Load in kg. | Format per §3: `62,5 kg`. |
| difficulty | zwaarte (de) | The trainer's rating of how hard a set or exercise felt. | Values: *Makkelijk / Normaal / Zwaar* — *Easy / Normal / Hard* (`PRODUCT.md §41`). ❌ *moeilijkheid, moeilijkheidsgraad, intensiteit*. |
| previous values | Vorige training | The client's last logged performance for this exercise, shown next to today's sets (`PRODUCT.md §41`). | EN: *Previous*. Column next to it: *Vandaag / Today*. |
| log (verb) | bijhouden | Record sets live during a session. | "Training bijhouden" / "Log workout". ❌ NL: *loggen, registreren, invoeren*. |
| start / finish a workout | training starten / training afronden | | EN: *Start workout / Finish workout*. ❌ *beëindigen, stoppen*. |
| workout history | trainingsgeschiedenis (de); tab **Geschiedenis** | All logged workouts of a client (`PRODUCT.md §42`). | EN: *Workout history*; tab *History*. |
| warm-up set 🔜 1.1 | opwarmset (de, opwarmsets) | | |
| superset 🔜 1.1 | superset (de, supersets) | | |

### 4.7 Notes

| EN term | NL term | Definition | Notes / forbidden alternatives |
|---|---|---|---|
| note | notitie (de, notities) | Free-form text, stored exactly as entered. May contain health data (`PRODUCT.md §35–37`, §79). | ❌ *opmerking, aantekening, memo, commentaar*. |
| client note | klantnotitie (de, klantnotities) | A note about a client. | |
| session note | sessienotitie (de, sessienotities) | A note about one session. | |
| visibility | zichtbaarheid (de) | Who can read a note. | |
| Trainer-only | Alleen voor trainers | Default visibility. The client never sees it. | Visible to the workspace's trainers, admins and owner who have access to the client. ❌ *Privé* (collides with private session), *Intern*. |
| Client-visible | Zichtbaar voor klant | The client can read it. | EN label: *Visible to client*. |

### 4.8 Settings, navigation and communication

| EN term | NL term | Notes |
|---|---|---|
| Dashboard | Dashboard | |
| Settings | Instellingen | |
| Home (client app 🔜 1.2) | Home | `PRODUCT.md §55` |
| language | taal | Options always *Nederlands* / *English*. |
| default communication language | standaardtaal | Workspace setting (`PRODUCT.md §3`). EN: *Default language*. |
| notification | melding (de, meldingen) | ❌ *notificatie*. *E-mailmeldingen / Email notifications*. |
| schedule change (email) | roosterwijziging (trainer-facing); "Je les is gewijzigd" (client-facing) | EN: *Schedule change* / *Your class has changed*. |
| time zone | tijdzone | |

**Trainer web navigation** (`PRODUCT.md §44`, in sentence case):

| EN | NL |
|---|---|
| Dashboard | Dashboard |
| Calendar | Agenda |
| Clients | Klanten |
| Classes | Lessen |
| Open Gym | Open Gym |
| Workouts | Trainingen |
| Trainers | Trainers |
| Booking links | Boekingslinks |
| Settings | Instellingen |

---

## 5. UI verbs, messages and dialogs

### 5.1 Button and action conventions

- **NL buttons use the infinitive, with the object first:** *Opslaan*, *Les annuleren*, *Klant toevoegen*.
- **EN buttons use the imperative, verb first:** *Save*, *Cancel class*, *Add client*.
- **Name the object** whenever the button isn't obviously scoped by its dialog: *Les verwijderen* rather than *Verwijderen*.
- Never *OK/Oké*, *Ja/Nee*, *Yes/No* or *Klik hier* as action labels. Use the verb.

| EN | NL | Use for | Don't use |
|---|---|---|---|
| Save | Opslaan | Storing changes | *Bewaren, Vastleggen* |
| Save changes | Wijzigingen opslaan | Edit forms | |
| Cancel | Annuleren | Dismissing a dialog or form **only when the dialog isn't itself about cancelling** (§5.3) | *Afbreken* |
| Delete | Verwijderen | Permanently removing something | *Wissen, Weggooien* |
| Remove | Verwijderen + object/context: *Uit les verwijderen* | Unlinking without deleting, e.g. a participant from a class | *Weghalen* |
| Edit | Bewerken | Opening an entity to change it | *Aanpassen* |
| Change | Wijzigen | Changing a single value: email, language, time | |
| Add | Toevoegen | Adding to an existing list or entity | |
| Create | Aanmaken | Making a new standalone thing: account, workspace, template | *Creëren, Maken* |
| New … | Nieuwe … / Nieuw … (het-words) | Create entry points: *Nieuwe les*, *Nieuw trainingsschema* | |
| Close | Sluiten | | |
| Back | Terug | | *Vorige* (except in step-by-step flows, where *Vorige* / *Previous* is fine) |
| Next | Volgende | Step-by-step flows | |
| Continue | Doorgaan | Moving on after a message or choice | *Verdergaan* |
| Done | Klaar | Finishing a flow | *Gereed, Voltooien* |
| Confirm | Bevestigen | | |
| Send | Versturen | Emails, invitations | *Verzenden, Sturen* |
| Resend | Opnieuw versturen | *Code opnieuw versturen / Resend code* | |
| Try again | Opnieuw proberen | After an error | |
| Undo | Ongedaan maken | | |
| Search | Zoeken | | |
| Filter | Filteren | | |
| Choose | Kiezen | Picking an option | *Selecteren* |
| View | Bekijken | Opening details | *Tonen, Openen* |
| Show more | Meer tonen | | |
| Invite | Uitnodigen | | |
| Accept / Decline | Accepteren / Afwijzen | Invitations | *Weigeren* |
| Book | Boeken / Plek boeken | Booking CTA | *Reserveren, Inschrijven* |
| Publish / Unpublish | Publiceren / Offline halen | Classes and Open Gym | |
| Share | Delen | | |
| Copy link | Link kopiëren | | |
| Download | Downloaden | | |
| Print | Afdrukken | | *Printen* |
| Sign in / Sign out | Inloggen / Uitloggen | | *Aanmelden, Afmelden, Log in* |
| Start / Finish | Starten / Afronden | Workouts | |

### 5.2 Messages

**Errors and validation: say what's wrong and how to fix it.** No "Fout:" / "Error:" prefix, no codes, no blame, no exclamation marks.

| Situation | nl-NL | en |
|---|---|---|
| Required field | Vul je naam in. | Enter your name. |
| Invalid email | Dit e-mailadres klopt niet. Controleer het en probeer het opnieuw. | This email address doesn't look right. Check it and try again. |
| Class full | Deze les is vol. Kies een ander tijdstip. | This class is full. Choose another time. |
| Hold expired | Je plek is vrijgegeven, omdat je e-mailadres niet op tijd is bevestigd. Boek opnieuw als er nog plek is. | Your spot was released because your email wasn't confirmed in time. Book again if there's still space. |
| Wrong code | Deze code klopt niet. Controleer de code in de e-mail. | That code isn't right. Check the code in the email. |
| Code expired | Deze code is verlopen. Vraag een nieuwe code aan. | This code has expired. Request a new one. |
| No connection | Geen verbinding. Controleer je internet en probeer het opnieuw. | No connection. Check your internet and try again. |
| Unknown error | Er ging iets mis. Probeer het opnieuw. | Something went wrong. Try again. |
| No permission | Je hebt geen toegang tot deze pagina. | You don't have access to this page. |

- Validation messages sit next to the field and use a full sentence with a full stop.
- Don't reveal whether an email address has an account ("no account enumeration", `ROADMAP.md` M2): "Als dit e-mailadres bij ons bekend is, ontvang je een e-mail." / "If this email address is registered, you'll receive an email."

**Success messages and toasts: short past participle, no full stop.**

| nl-NL | en |
|---|---|
| Opgeslagen | Saved |
| Uitnodiging verstuurd | Invitation sent |
| Link gekopieerd | Link copied |
| Les geannuleerd | Class cancelled |
| Je boeking is bevestigd! | Your booking is confirmed! |

**Empty states: what's missing, one line on why it matters, one primary action.**

| nl-NL | en |
|---|---|
| **Nog geen klanten** / Voeg je eerste klant toe om sessies en trainingen in te plannen. / [Klant toevoegen] | **No clients yet** / Add your first client to plan sessions and workouts. / [Add client] |

**Emails:** greeting *Hoi {firstName},* / *Hi {firstName},*. Put the key fact (what, when, where) in the first two lines. Close with the workspace name.

### 5.3 Confirmation dialogs

- **Title:** a question that names the action and the object: *Les annuleren?* / *Cancel class?*. ❌ *Weet je het zeker?* / *Are you sure?*
- **Body:** the consequence, concretely: *De 6 deelnemers krijgen een e-mail in hun eigen taal.* / *The 6 participants will get an email in their own language.* Say so when it can't be undone: *Dit kan niet ongedaan worden gemaakt.* / *This can't be undone.*
- **Primary button:** repeats the verb and object: *Les annuleren* / *Cancel class*. Destructive styling for delete and cancel.
- **Dismiss button:** *Annuleren* / *Cancel* for most dialogs.

**Cancel collision rule.** When the dialog itself is about cancelling (a class, session or booking), the dismiss button must **not** say *Annuleren* / *Cancel*. Use *Terug* / *Go back*, or *Boeking behouden* / *Keep booking*.

| Dialog | Primary | Dismiss |
|---|---|---|
| Delete a template | Trainingsschema verwijderen / Delete template | Annuleren / Cancel |
| Cancel a class | Les annuleren / Cancel class | Terug / Go back |
| Client cancels a booking | Boeking annuleren / Cancel booking | Boeking behouden / Keep booking |

### 5.4 Words that collide (read this before translating)

| Word | Means | Must not be used for |
|---|---|---|
| **training** (NL) | workout | a scheduled session or class → *sessie*, *les*, *privésessie* |
| **herhaling** (NL) | rep | recurrence → *terugkerend*, *Herhalen: elke week* |
| **annuleren / cancel** | cancelling a session, class or booking; also dismissing a dialog | both at once in one dialog → §5.3 |
| **lid / lidmaatschap**, **member / membership** | gym memberships (🔜 Release 4) | team members → *teamlid / team member* |
| **plek** (NL) | a spot in a class | a location → *locatie* |
| **privé / private** | the private session type | note visibility → *Alleen voor trainers / Trainer-only* |
| **schedule** (EN) | the verb *to schedule* (*inplannen*) | the timetable noun → *timetable / rooster* |
| **slot** (EN) | an Open Gym slot | a spot in a class → *spot / plek* |
| **organization** | code and database only | anything in the UI → *workspace / werkruimte* |

---

## 6. How agents use this glossary

Follow this whenever you add or change a key in `packages/i18n/nl-NL.json` or `en.json`, or write an email template.

1. **Look up every domain noun and verb** in §4 and §5 before writing a string. Use the listed NL and EN term exactly. Never use a forbidden alternative, even if it sounds more natural to you.
2. **Write both languages in the same change.** Never add a key to one catalog only (CI checks parity). Dutch is the primary language: it must read like a Dutch product, not like a translation of English. Draft both, then read the Dutch aloud.
3. **Key names use the English glossary term** (`class`, `session`, `booking`, `hold`, `workspace`), never a synonym (`lesson`, `appointment`, `reservation`). Keys are dot paths of lowerCamelCase segments, grouped by screen or feature (`booking.spotsAvailable`); see `packages/i18n/README.md`.
4. **One key per context.** Don't reuse a key because the text happens to match today. *Annuleren* as a dialog dismiss and *Annuleren* as "cancel this booking" are two keys, and they may diverge.
5. **Full sentences with placeholders, ICU plurals, no concatenation** (§3.3). Format dates, times and numbers in code (§3.1).
6. **Add context for ambiguous strings** in `packages/i18n/comments.json`, e.g. "button that dismisses the dialog" vs "button that cancels the booking". Native exporters pass it on as translator comments.
7. **Check length.** Dutch is often 20–35% longer than English. Check tabs, buttons and badges at 375 pt/dp width on iOS and Android. If a Dutch string doesn't fit, shorten both languages, don't truncate.
8. **Missing term?** Add a row to §4 in the **same PR**, mark it ⚠️, and list it under "New glossary terms" in the PR description so the owner can approve it. Don't invent a term silently.
9. **Changing a term** is a PR of its own: update this file, every string that uses the old term (both catalogs and email templates), and the changelog in §9.
10. **Local copy review checklist.** Before pushing a change that touches strings (`ROADMAP.md §10`), the author checks each new or changed string locally. An LLM may help, but no Copilot, Claude or Codex GitHub review is required. Check for:
    - [ ] "je", never "u"; friendly and short; no officialese (§1.1)
    - [ ] glossary terms used, no forbidden alternatives, no collisions (§4, §5.4)
    - [ ] sentence case, Dutch compounds and hyphens, punctuation (§2)
    - [ ] dates/times/numbers passed in via formatters; `22 september 2026`, `18:00`, `62,5 kg` (§3)
    - [ ] button, error, toast and dialog conventions, including the cancel collision rule (§5)
    - [ ] NL and EN say the same thing, and each reads naturally on its own
    - [ ] user content (class names, notes, custom exercises) isn't translated

---

## 7. Deviations from PRODUCT.md example copy

`PRODUCT.md` contains example UI copy. Where this glossary differs, the glossary wins for strings. The owner approved these deviations on 2026-09-22:

| PRODUCT.md | Glossary | Why |
|---|---|---|
| §44 EN nav in Title Case ("Booking Links") | Sentence case ("Booking links") | One capitalization rule for both languages and all platforms (§2.1) |
| §21 "GROEPSLESSEN" / "GROUP CLASSES", §45 "TODAY", §46 "MY DAY" | Stored in sentence case, uppercased by styling | Catalogs hold text, not visual style. Screen readers and native platforms treat all-caps text differently |
| §3 date example "22 september 2026" + "18:00" | Same, plus the EN formatting locale set to `en-GB` | The `en` default formats as "September 22, 2026, 6:00 PM", which doesn't suit English speakers in the Netherlands |

---

## 8. Open questions (validate with the pilot owner)

These terms are the best current choice. Confirm them in the M0 wireframe review (`ROADMAP.md §4.2`) with the pilot owner and at least one other trainer, then remove the ⚠️ markers.

1. **workspace → werkruimte.** Standard in Dutch SaaS, but a gym owner might never say it. The alternative is *bedrijf*. It matters mostly for multi-workspace trainers switching between gyms.
2. **private session → privésessie.** Dutch trainers often say *PT-sessie*. Check which word the pilot gym uses with its clients.
3. **workout template → trainingsschema.** Trainers say *schema*. Confirm it isn't confused with the timetable (*rooster*).
4. **substitution → vervanger.** *Invaller* is also common in Dutch sport. Pick the one the pilot trainers use.

---

## 9. Changelog

| Date | Version | Change |
|---|---|---|
| 2026-09-22 | 0.1 | First version (M0, `ROADMAP.md §4.2`): tone rules (informal "je"), capitalization, date/time/number formats, term table for the MVP domain, UI verb and message conventions, agent workflow. |
| 2026-09-22 | 0.2 | Owner approved: en-GB formatting and spelling for English, sentence case in both languages (§7). ⚠️ terms stay open until the M0 wireframe review. |
| 2026-09-22 | 0.3 | Copy review checklist moved to the local author workflow; no GitHub Claude/Codex reviewer or CI job is required. Terminology is unchanged. |
| 2026-09-23 | 0.4 | E005: §3.3 drops `=0` plural selectors (not portable to Android; use a separate key). §3.1, §6.3 and §6.6 point to the i18n package (date formats, key naming, `comments.json`). Terminology is unchanged. |
