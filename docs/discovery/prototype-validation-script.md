# Prototype validation script

**Purpose:** test the clickable prototype of the **6 critical flows** (`ROADMAP.md §4.2`), plus flow 7 (adding clients, classes and Open Gym from the app, added in roadmap v1.11), with the gym owner and at least one other trainer, and turn what you see into a ranked findings list. Gate G0 requires "critical flows validated by the pilot owner" (`§4.6`).

**You** = the product owner, as facilitator. **P1** = the gym owner. **P2, P3, …** = other trainers. Optionally, **P-K** = a friendly client, for flow 1 only.

---

## 1. Setup

**Participants and flows**

| Flow | Device | P1 gym owner | P2+ trainer | P-K client (optional) |
|---|---|---|---|---|
| 1. Public booking on a phone | Phone | ✓ | ✓ | ✓ |
| 2. Trainer "Today" on mobile | Phone | ✓ | ✓ | |
| 3. Workspace calendar on web (owner view) | Laptop | ✓ | | |
| 4. Create / reschedule a private session | Laptop (and phone, if prototyped) | ✓ | ✓ | |
| 5. Live workout logging with previous values | Phone | ✓ | ✓ | |
| 6. Manage a class occurrence | Laptop (attendance also on phone) | ✓ | task 6.3 only | |
| 7. Add new in the app (+) | Phone | ✓ (as John, owner) | task 7.4 only (as Sarah) | |

- **One participant at a time**, about 60 minutes each (P-K: 15 minutes). Participants don't watch each other.
- **Phone flows on the participant's own platform.** Use the iOS variant for iPhone users and the Android variant for Android users ([phone inventory](phone-inventory.md)). This checks the platform conventions (iOS HIG / Material 3). If the prototype exists for only one platform, note that in the findings.
- The prototype is in **Dutch**. Task 1.3 checks the English switch.
- **Reset the sample data** between participants.
- **Set "Ik ben" on the prototype start page** before the phone flows: **John (eigenaar)** for P1, **Sarah (trainer)** for P2+. Flows 4 (app), 5 and 6 (app) always run as Sarah.
- **Names in [brackets]** are placeholders. Replace them with the prototype's sample data before printing. All sample data is fictional.

**Checklist before the session**

- [ ] The prototype links open on the phone(s) and the laptop; the start screen of each task is bookmarked.
- [ ] This script is printed, with one [task-results sheet](#5-task-results-sheet) and one [findings list](#6-findings-list) per participant, plus a timer.
- [ ] A quiet spot, outside class times.
- [ ] Recording: **only with consent**, and only screen + audio. Recordings are stored per the rules for source files ([`import-checklist.md` §6](import-checklist.md#6-privacy-handling-of-source-files)), never committed, and deleted once the findings are typed up.

**While facilitating**

- Read each task aloud exactly as written, then **stay quiet**. Don't point, and don't explain the screen.
- Answer questions with questions. Neutral prompts: *"Wat verwacht je dat er gebeurt?"* (What do you expect to happen?) · *"Waar zou je dat zoeken?"* (Where would you look for that?) · *"Wat denk je nu?"* (What are you thinking now?)
- Note the **first tap or click**, every **wrong turn**, hesitations longer than about 5 seconds, and every **word** that causes doubt.
- If someone is stuck for 2 minutes, or asks to stop: give the smallest hint you can, and mark the task **H** (with help). If they are still stuck, mark it **✗** and move on.

---

## 2. Introduction (read aloud)

Bedankt dat je mee wilt doen. We testen vandaag een eerste, klikbare versie van Trainer Hub. Het is nog geen echte app: niet alles werkt en alle gegevens zijn verzonnen.

We testen het ontwerp, niet jou. Als iets niet lukt, ligt dat aan het ontwerp, en dat is precies wat we willen weten.

Ik geef je steeds een korte opdracht. Probeer hardop te denken: zeg wat je ziet, wat je zoekt en wat je verwacht dat er gebeurt. Ik help je bewust even niet, omdat ik wil zien hoe je het zelf zou doen. Als je vastloopt, mag je dat gewoon zeggen.

Ik maak aantekeningen, zonder namen. Vind je het goed als ik het scherm en het geluid opneem? Dat gebruik ik alleen om mijn aantekeningen uit te werken, daarna verwijder ik het.

*Thank you for taking part. Today we're testing an early, clickable version of Trainer Hub. It isn't a real app yet: not everything works and all the data is made up.*

*We're testing the design, not you. If something doesn't work, that's the design's fault, and that's exactly what we want to find out.*

*I'll give you short tasks, one at a time. Please think aloud: say what you see, what you're looking for and what you expect to happen. I won't help you for now, because I want to see how you would do it yourself. If you get stuck, just say so.*

*I'll take notes, without names. Is it OK if I record the screen and audio? I'll only use it to write up my notes, and delete it afterwards.*

☐ Consent to record: yes / no

---

## 3. Tasks per flow

For every task, record on the [task-results sheet](#5-task-results-sheet): **result** (✓ without help · **H** with help · ✗ not completed), **time**, number of **wrong turns**, and the **ease score**.

**Ease question after every task** (read aloud):

> **Hoe makkelijk of moeilijk was deze opdracht, op een schaal van 1 tot 7? 1 is heel moeilijk, 7 is heel makkelijk.**\
> *How easy or difficult was this task, on a scale of 1 to 7? 1 is very difficult, 7 is very easy.*

### Flow 1 — Public booking on a phone

*Start: the public booking page, as if opened from the QR code. Role: the participant plays a client.*

**Task 1.1** Je staat bij de ingang van de gym en hebt de QR-code op de poster gescand. Boek een plek in de les **[Kracht] op [dinsdag] om [18:00]**. Gebruik je eigen voornaam en een verzonnen e-mailadres.\
*You're at the gym entrance and have scanned the QR code on the poster. Book a spot in the [Strength] class on [Tuesday] at [18:00]. Use your own first name and a made-up email address.*

- Done when: the confirmation screen is reached, including the verification step.
- Observe:
  - [ ] Finds the right class and date without scrolling back and forth.
  - [ ] Understands the number of free spots.
  - [ ] Understands **why** they need to verify, and what to do with the email (link or 6-digit code).
  - [ ] Notices the time limit on the reserved spot (the hold).
  - [ ] Knows what happens next (confirmation email, cancelling).

**Task 1.2** Je wilt je boekingen later makkelijk terug kunnen zien. Wat doe je?\
*You want to be able to see your bookings again later. What do you do?*

- Done when: the participant finds the **optional** account step, or knowingly skips it.
- Observe: [ ] understands that an account is optional · [ ] no confusion with a password.

**Task 1.3** Zet de pagina op **Engels** en boek **Open Gym** op **[vrijdag] van [10:00] tot [11:00]**.\
*Switch the page to English and book Open Gym on [Friday] from [10:00] to [11:00].*

- Done when: the NL | EN switch is used and the Open Gym booking is confirmed.
- Observe: [ ] finds the switch without searching · [ ] understands what Open Gym means · [ ] the booking flow feels the same as for a class.

**Follow-up:** *Zou je dit zo doen als je het nu echt moest boeken? Wat zou je tegenhouden?*\
*Would you book it like this if you really had to now? What would stop you?*

### Flow 2 — Trainer "Today" on mobile

*Start: the trainer app, signed in, on the Today screen. Role: the participant as trainer.*

**Task 2.1** Het is [dinsdag]ochtend. Waar moet je vandaag als eerste zijn, hoe laat, en met wie?\
*It's [Tuesday] morning. Where do you need to be first today, at what time, and with whom?*

- Done when: the participant names the time, the location and the client or class.
- Observe: [ ] answers from the first screen, without navigating · [ ] location is clear (gym / client's home / elsewhere).

**Task 2.2** Je eerste klant is **[Sanne]**. Wat deed ze vorige keer, en is er iets wat je over haar moet onthouden?\
*Your first client is [Sanne]. What did she do last time, and is there anything you need to remember about her?*

- Done when: the participant names at least one previous value and finds the note.
- Observe: [ ] path to previous values and notes · [ ] number of taps · [ ] trusts that the note is trainer-only.

**Task 2.3** Hoeveel mensen hebben zich aangemeld voor je les van vanavond, en zijn er nog plekken vrij?\
*How many people have signed up for your class tonight, and are there spots left?*

- Done when: the participant names both numbers.

### Flow 3 — Workspace calendar on web (owner view) · P1 only

*Start: trainer web, the calendar, signed in as owner.*

**Task 3.1** Wie geeft er [donderdag]avond les, en zijn er nog plekken vrij in de les van **[19:00]**?\
*Who is teaching on [Thursday] evening, and are there spots left in the [19:00] class?*

- Done when: the participant names the trainer and the free spots.
- Observe: [ ] switches between the day and week view · [ ] distinguishes trainers (colour or filter) · [ ] reads capacity.

**Task 3.2** Je wilt volgende week een extra privétraining geven op [woensdag]ochtend. Is er een moment waarop jij en de gym nog vrij zijn?\
*You want to give an extra private session next [Wednesday] morning. Is there a time when both you and the gym are free?*

- Done when: the participant points out a free time slot.
- Observe: [ ] filters on their own schedule · [ ] sees sessions at other locations.

**Task 3.3** Voeg in de agenda een eenmalige groepsles **[Strength Express]** toe en plan daarna **Open Gym** voor een ander vrij uur.\
*Add a one-off [Strength Express] group class in the calendar, then schedule Open Gym for another free hour.*

- Done when: both appear in the owner calendar with the intended time and capacity.
- Observe: [ ] finds both under *+ Nieuw* · [ ] understands a group class needs a trainer while Open Gym does not · [ ] understands that group class and Open Gym publishing is an owner/admin action under the current permission model.

**Follow-up:** *Mis je iets wat je nu wel in je oude app, agenda of Word ziet?*\
*Is anything missing that you do see in your old app, calendar or Word today?*

### Flow 4 — Create / reschedule a private session (with location inference)

*Start: trainer web, the calendar (or the phone, if flow 4 is prototyped on mobile).*

**Task 4.1** Plan een privétraining met **[Mark]** voor volgende week **[woensdag] om [07:30]**, een uur lang.\
*Schedule a one-hour private session with [Mark] for next [Wednesday] at [07:30].*

- Done when: the session is saved with the right client, time and duration.
- Observe:
  - [ ] Notices that the **location is filled in automatically** (the client's default location), and trusts it.
  - [ ] Understands where that location came from.
  - [ ] Checks trainer availability or clashes.

**Task 4.2** [Mark] belt: hij wil liever **[donderdag] om [07:30]**, en deze keer **bij hem thuis**. Pas de afspraak aan.\
*[Mark] calls: he'd rather have [Thursday] at [07:30], and this time at his home. Change the appointment.*

- Done when: the session has moved to Thursday and the location is the client's home; no duplicate session exists.
- Observe: [ ] moving vs creating a new session · [ ] changes the location without retyping it · [ ] expects the client to receive a message (what do they expect?).

### Flow 5 — Live workout logging with previous values

*Start: tasks 5.1–5.4 use "Met schema" (the session with [Mark], workout assigned); task 5.5 uses "Zonder schema" ([Koen], nothing planned). Hold the phone as you would in the gym, ideally standing up.*

**Task 5.1** Je bent met [Mark] in de gym. De eerste oefening is **bankdrukken**. Vorige keer deed hij **60 kg × 8**. Vandaag doet hij **3 sets van 62,5 kg × 8**, en de **laatste set was zwaar**. Houd dat bij.\
*You're in the gym with [Mark]. The first exercise is the bench press. Last time he did 60 kg × 8. Today he does 3 sets of 62.5 kg × 8, and the last set was hard. Log it.*

- Done when: 3 sets are logged at 62.5 kg × 8, and the exercise is marked **Zwaar** (hard); difficulty is asked once per exercise.
- Observe:
  - [ ] Sees the **previous values** without searching ("Vorige training").
  - [ ] Sees all exercises in one list, each with its sets underneath.
  - [ ] Notices that every set is **prefilled** and logs it with one tap on the tick in its row.
  - [ ] Changes the kg in the first row and sees it carry over to the next sets; edits reps in the row the same way.
  - [ ] Types `62,5` in the row without trouble (numeric keypad, decimal comma).
  - [ ] Finds **+ Set** under the exercise if an extra set is needed.
  - [ ] Understands the fields of a non-weight exercise type (reps only, time or distance + time), if one is shown.
  - [ ] Can do it one-handed; the tap targets are big enough.
  - [ ] Finds *Hoe ging het?* under the exercise (Makkelijk / Normaal / Zwaar).
  - [ ] Time per set: ____ s (it should fit between sets).

**Task 5.2** Voeg voor jezelf en de andere trainers een interne notitie toe: **"Volgende keer zelfde gewicht."** Rond de training af.\
*Add an internal note for yourself and the other trainers: "Same weight next time." Finish the workout.*

- Done when: the workout is saved, attendance is set, and the internal note appears only on the trainer's session view.
- Observe: [ ] recognizes the note is for trainers · [ ] does not expect it to be sent to the client on finishing.

**Task 5.3** Stuur [Mark] nu de training met het bericht **"Goed gewerkt vandaag!"**. Bekijk daarna de e-mail en zijn profiel.\
*Now send [Mark] the workout with the message "Great work today!" Check the email and his profile afterwards.*

- Done when: the trainer reviews and shares the workout, the message appears in both previews, and the internal note appears in neither.
- Observe: [ ] finds the separate client message · [ ] notices the review step · [ ] trusts that the internal note is excluded · [ ] understands the email language follows the client preference.

**Task 5.4** Stel dat je de training eerst alleen had opgeslagen. Zoek waar je hem later alsnog met [Mark] kunt delen.\
*Suppose you saved the workout without sharing it. Find where you can share it with [Mark] later.*

*Facilitator: reset flow 5, finish the sample workout again, and choose “Nu niet delen” before reading this task.*

- Done when: the participant finds *Training delen met klant* from the finished session.
- Observe: [ ] understands that saving and sharing are separate actions.

**Task 5.5** [Koen] komt binnen en je hebt niets voorbereid. Begin een training zonder schema. Hij doet **bankdrukken** en een oefening die niet in de lijst staat: **[Sled push]**. Houd van elk één set bij, rond af en **bewaar de training als schema** zodat je hem volgende keer kunt hergebruiken.\
*[Koen] walks in and you haven't prepared anything. Start a workout without a template. He does the bench press and an exercise that isn't in the list: [Sled push]. Log one set of each, finish, and save the workout as a template so you can reuse it next time.*

- Done when: both exercises are logged, the workout is saved, and the new template appears under *Schema's van Koen* when starting again.
- Observe: [ ] chooses *Lege training* without hesitation · [ ] notices *Vorige training herhalen* as an alternative · [ ] finds the Dutch exercise with an English word (or the other way round) · [ ] creates the custom exercise without help · [ ] understands *Opslaan als schema*.

**Follow-up:** *Zou je dit tussen de sets door echt zo doen? Train je vaker met of zonder schema? Wat zou je anders willen?*\
*Would you really do this between sets? What would you want to be different?*

### Flow 6 — Manage a class occurrence

*Start: trainer web, the calendar, signed in as owner (P1). P2+ only do task 6.3, on the phone.*

**Task 6.1** **[Sarah]** is ziek. Laat **[Tom]** de les **[Kracht] van aanstaande [dinsdag] om [18:00]** overnemen. Alleen die ene keer.\
*[Sarah] is ill. Have [Tom] take over the [Strength] class this coming [Tuesday] at [18:00]. Only that one time.*

- Done when: only that occurrence has [Tom] as the trainer; the series and the bookings are unchanged.
- Observe: [ ] understands the difference between **this occurrence** and **the whole series** · [ ] what they expect to happen to booked clients (a message? nothing?).

**Task 6.2** De les van **[donderdag] [19:00]** gaat volgende week niet door. Annuleer alleen die les.\
*The [Thursday] [19:00] class is not happening next week. Cancel only that one.*

- Done when: only that occurrence is cancelled.
- Observe: [ ] doesn't cancel the series by mistake · [ ] understands what happens to the bookings · [ ] the confirmation step is clear.

**Task 6.3** Het is [dinsdag] 19:00 en de les is voorbij. Houd de aanwezigheid bij: iedereen was er, behalve **[Lisa]**.\
*It's [Tuesday] 19:00 and the class is over. Record attendance: everyone was there except [Lisa].*

- Done when: everyone is marked **Aanwezig** (attended) and [Lisa] is marked **Niet verschenen** (no-show).
- Observe: [ ] is there a quick "everyone present" option · [ ] understands the terms Aanwezig / Niet verschenen / Geannuleerd.

### Flow 7 — Add new in the app (+)

*Start: the trainer app on Today ("Nieuw toevoegen in de app"). P1 plays John (owner of John's Gym); P2+ play Sarah (trainer at John's Gym, owner of her own business).*

**Task 7.1** Er staat een nieuwe klant aan de balie: **[Eva Janssen]**. Je weet alleen haar naam. Zet haar in de app.\
*A new client is at the desk: [Eva Janssen]. You only know her name. Add her in the app.*

- Done when: the client exists and her profile opens.
- Observe: [ ] finds *Klant* under **+** or on the *Klanten* tab · [ ] is comfortable leaving the email empty.

**Task 7.2** Plan vanaf je telefoon elke **[dinsdag] om [07:00]** een **[Bootcamp]**-les van een uur, met **[12]** plekken en **[Mike]** als trainer.\
*From your phone, schedule a one-hour [Bootcamp] class every [Tuesday] at [07:00], with [12] spots and [Mike] as the trainer.*

- Done when: the class exists as a weekly series with the right trainer and capacity.
- Observe: [ ] finds *Groepsles* under **+** · [ ] understands *Herhalen: Elke week op dinsdag* · [ ] expects to edit the series on the phone later (note what they expect).

**Task 7.3** Je bent morgen van **[10:00] tot [11:00]** toch in de gym. Zet **Open Gym** open voor **[2]** personen.\
*You're at the gym tomorrow from [10:00] to [11:00] anyway. Open Open Gym for [2] people.*

- Done when: the Open Gym slot is published for the right time and capacity.

**Task 7.4 (P2+, as Sarah)** Plan een privétraining met een klant die nog niet in de app staat: **[Nina Vos]**. Kijk daarna of je ook een groepsles bij John's Gym kunt toevoegen.\
*Schedule a private session with a client who isn't in the app yet: [Nina Vos]. Then check whether you can also add a group class at John's Gym.*

- Done when: the session is saved for the new client, and the participant explains why a group class at John's Gym isn't offered.
- Observe: [ ] uses *+ Nieuwe klant "[Nina Vos]"* from the search · [ ] reads the footnote about who schedules classes · [ ] agrees with that rule (note disagreement as a finding).

---

## 4. Closing questions (read aloud)

**S1** Wat vond je het makkelijkst? En wat het lastigst?\
*What did you find easiest? And what was hardest?*

**S2** Waren er woorden die je niet begreep, of die je anders zou noemen?\
*Were there words you didn't understand, or would call something else?* → glossary

**S3** Voelde de app op je telefoon hetzelfde aan als je andere apps?\
*Did the app on your phone feel like the other apps on your phone?* → platform conventions

**S4** Mis je iets wat je nu wel met je oude app, je agenda, Word of WhatsApp doet?\
*Is anything missing that you do today with your old app, your calendar, Word or WhatsApp?*

**S5** Zie je jezelf dit elke dag gebruiken? Wat zou je tegenhouden?\
*Can you see yourself using this every day? What would stop you?*

---

## 5. Task-results sheet

*One per participant.*

**Participant:** P___ · **Role:** ______ · **Phone platform used:** ☐ iOS ☐ Android · **Date:** ______

| Task | Result (✓ / H / ✗) | Time (mm:ss) | Wrong turns | Ease (1–7) | Words that caused doubt |
|---|---|---|---|---|---|
| 1.1 | | | | | |
| 1.2 | | | | | |
| 1.3 | | | | | |
| 2.1 | | | | | |
| 2.2 | | | | | |
| 2.3 | | | | | |
| 3.1 | | | | | |
| 3.2 | | | | | |
| 3.3 | | | | | |
| 4.1 | | | | | |
| 4.2 | | | | | |
| 5.1 | | | | | |
| 5.2 | | | | | |
| 5.3 | | | | | |
| 5.4 | | | | | |
| 5.5 | | | | | |
| 6.1 | | | | | |
| 6.2 | | | | | |
| 6.3 | | | | | |
| 7.1 | | | | | |
| 7.2 | | | | | |
| 7.3 | | | | | |
| 7.4 | | | | | |

---

## 6. Findings list

*This goes into `results/prototype-validation.md`. No client or trainer names; quotes only without names.*

**Severity**

| Level | Meaning |
|---|---|
| **Blocker** | The task can't be done without help, **or** it produces wrong data (e.g. the whole series cancelled instead of one occurrence) |
| **Major** | The task is done, but with real difficulty, an error that was recovered, or visible distrust. Also: a term misunderstood in a way that leads to the wrong action |
| **Minor** | A short hesitation or small confusion, recovered quickly |
| **Wish** | Not a problem but a request. Tag it **MVP** (fits the MVP scope), **1.1** (backlog, R7) or **§53** (explicitly excluded, not built) |

**Type:** flow · terminology · layout · missing · platform convention · wish

| ID | Flow / task | Participant(s) | What happened | Quote (no names) | Severity | Type | Proposed change | Decision |
|---|---|---|---|---|---|---|---|---|
| PV-01 | | | | | | | | |
| PV-02 | | | | | | | | |
| PV-03 | | | | | | | | |
| PV-04 | | | | | | | | |
| PV-05 | | | | | | | | |
| PV-06 | | | | | | | | |
| PV-07 | | | | | | | | |
| PV-08 | | | | | | | | |
| PV-09 | | | | | | | | |
| PV-10 | | | | | | | | |

**Decision** is one of: *fix in prototype* · *add to the glossaries* · *1.1 backlog* · *won't do (reason)*.

### Summary per flow

| Flow | Participants | Tasks ✓ without help | Median ease (1–7) | Open Blocker / Major | Validated? |
|---|---|---|---|---|---|
| 1. Public booking | | / | | / | ☐ |
| 2. Today | | / | | / | ☐ |
| 3. Workspace calendar | | / | | / | ☐ |
| 4. Private session | | / | | / | ☐ |
| 5. Workout logging | | / | | / | ☐ |
| 6. Class occurrence | | / | | / | ☐ |
| 7. Add new in the app | | / | | / | ☐ |

**Terminology for the glossaries (meaning: root `GLOSSARY.md`; Dutch/English wording: `packages/i18n/GLOSSARY.md`):** words that caused doubt, with the word the participants would use instead:

| Word in prototype | Participant would say | Decision |
|---|---|---|
| | | |
| | | |

---

## 7. When is a flow validated?

A flow counts as **validated** for Gate G0 when **all** of these hold:

1. **P1 (the gym owner) completed every task** in the flow ✓ or **H** in the last round, and no task ended ✗.
2. **No open Blocker or Major finding** in the flow. They are fixed in the prototype and **re-tested with P1**. Only the affected tasks need re-testing.
3. For the phone flows (2, 5 and 7), **at least one other trainer** completed them without a Blocker.
4. **The gym owner confirms** the flow matches how they want to work (sign-off below).

Minor findings and wishes don't block G0. They go into the wireframes, the glossary or the 1.1 backlog.

### Sign-off

| Flow | Validated on | Gym owner (initials) |
|---|---|---|
| 1. Public booking on a phone | | |
| 2. Trainer "Today" on mobile | | |
| 3. Workspace calendar on web | | |
| 4. Create / reschedule a private session | | |
| 5. Live workout logging with previous values | | |
| 6. Manage a class occurrence | | |
| 7. Add new in the app | | |

**Product owner:** ____________ **Date:** ____________
