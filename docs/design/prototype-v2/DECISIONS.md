# UI decisions: prototype v2

| | |
|---|---|
| **Status** | Decided with the owner, 5 November 2026 |
| **Reference** | The clickable prototype in this folder ([README](README.md)), published as the "Fivvi Prototype" artifact. Fictional data only |
| **Scope** | Fivvi Pro and the client app Fivvi (iOS and Android), trainer web, client web; the public website in [§9](#9-public-website) |
| **Replaces** | [`visual-direction.md`](../visual-direction.md) v1 (muted violet), and the parts of the flows and the IA listed in [§8](#8-what-this-changes-in-existing-documents) |

This is the record of what the owner and the agent decided while clicking through the prototype. The prototype shows how each decision looks and behaves; this file says it in words. A spec or ticket with a UI follows this file and names the prototype screen it implements. Where an older document disagrees, [§8](#8-what-this-changes-in-existing-documents) lists the conflict and where it gets resolved. The prototype's assumptions are in [§7](#7-assumptions), which says which ones the owner confirmed; the website's are in [§9](#9-public-website).

## 1. How we decide UI

- **Design first, where design matters.** A new screen or flow, a visible change to one, or a product question a screen makes concrete is talked over in the clickable prototype before a spec is written (owner, 5 November 2026). Work without a screen, and small changes that follow a pattern already here, skip it. The agent builds the proposal in the prototype, the owner clicks through it and comments, and the result is recorded here. Then the spec follows. See [`DESIGN.md`](../../../DESIGN.md).
- The prototype is throwaway code. It shows the look and the flow, not the architecture.

## 2. Platforms and visual direction

Recorded in [ADR-029](../../decisions/ADR-029-design-v2.md), amended by [ADR-031](../../decisions/ADR-031-move-pink-is-the-only-accent.md) and [ADR-032](../../decisions/ADR-032-secondary-text-in-the-native-apps.md).

| Platform | Decision |
|---|---|
| iOS | **iOS 26 minimum** (replaces iOS 17 in ADR-003). Latest Apple design, including **Liquid Glass**: glass navigation buttons, a floating glass tab bar that shrinks while scrolling, glass sheets and alerts |
| Android | Latest Material design: **Material 3 Expressive** (Compose `material3` 1.5), Google Sans Flex, shaped avatars. Single-choice toggles are the **M3 segmented button** (an outlined pill with a check on the selected one). The Expressive connected button group was tried twice and rejected |
| Trainer web | **shadcn/ui** (zinc neutrals), sidebar, top bar with search and **+ Nieuw**, tables, dialogs, side sheets |
| Client web | A mobile website in the **same design language as Fivvi Pro**: large titles, a glass header and tab bar, the week strip, Calendar rows, the gradient "next" card, grouped lists. Not a separate, plainer look (owner, 5 November 2026) |

**One theme on every platform**, with the details of Apple Calendar, Fitness and Health: "Calendar calm, Fitness pops".

- **Canvas:** grouped grey (`#F2F2F7`) with white cards in light, true black with `#1C1C1E` cards in dark. Inset grouped lists, radius 26 for cards and lists, inset separators.
- **Accent:** **Move pink `#E6164A`** (text `#C8103D` in light, `#FF6482` in dark). **It is the only accent** (owner, 6 November 2026; [ADR-031](../../decisions/ADR-031-move-pink-is-the-only-accent.md)): no black-and-white or other option in the product, for now. The prototype's panel keeps its accent switch for comparing colours (owner, 6 November 2026); that's a design tool, not a product option. The accent is a token, so it can change in one place if that's ever needed. Anything on an accent fill uses the on-accent colour.
- **Logo and app icon:** the wordmark **fivvi** whose i dots are pink segments of the day dial (owner, 8 November 2026; it replaces the slapping v's of 7 November), and the **day dial** as the app icon: the dial of a day with five booked hours in pink (owner, 8 November 2026). Fivvi Pro adds **PRO** in the centre of the dial; the client app Fivvi keeps the plain dial (owner, 8 November 2026). The Fivvi Pro sign-in screens show the Pro icon and the client web the plain day dial, instead of the placeholder "F". The trainer web sign-in shows the wordmark on large screens (768 px and wider, where the trainer web puts its sidebar beside the content) and the plain day dial below that (owner, 9 November 2026, [#626](https://github.com/fivvi-app/fivvi/issues/626)). Files and rules: [`brand/`](../brand/README.md).
- **Session-type colours:** private `#0088FF`, group `#CB30E0`, Open Gym `#FF8D28`; success `#34C759`, danger `#FF383C`. Workspaces have their own dot colour.
- **Gradients stay in one hue**, never drifting to another colour (owner: "too much to the purple"). The hero card uses the session type's colour, darker at the bottom.
- **Numbers** use a rounded face (SF Pro Rounded, `ui-rounded`) with tabular digits. Text is SF Pro on iOS, Google Sans Flex on Android, the system stack on the web.
- **Round controls stay round** (the + button). Buttons are pills (50 pt on iOS). Grouped buttons are equal width.
- **Contrast in light and dark:**
  - text at least 4.5:1, icons and graphics at least 3:1, checked on every screen. One exception (owner, 6 November 2026; [ADR-032](../../decisions/ADR-032-secondary-text-in-the-native-apps.md)): secondary text in light mode in the native apps stays the prototype's grey, `#85858B`, at 3.3:1 to 3.7:1. The client web uses `#6C6C70`, so it meets WCAG 2.2 AA, although this prototype shows the lighter grey there;
  - white glyphs sit on the colour mixed with black (85% at the top to 75% at the bottom);
  - coloured glyphs on tints use the colour mixed with the mode's ink (78%).
- **Stacked buttons keep their full height** (48 pt) with 10 pt between them.
- **Errors:**
  - in forms, the field turns red with a warning icon and the message under it;
  - toasts show a warning icon.
- **Every user-facing text exists in Dutch and English.** Dutch is the source.

## 3. Fivvi Pro (iOS and Android)

### Vandaag (TD-01)

- Large title with the date above it, and **a one-line summary under the title**: sessions, first to last, how many done.
- **No activity rings.** Two versions were tried. The space carries useful information instead.
- **Mijn dag | Hele studio** toggle, for an owner with a team only.
- **Mijn dag card:**
  - **Te doen**: attendance still to fill in;
  - the next **free gap** with *Plannen*;
  - **Route vandaag**, only when there are 2 or more places today.
- **Hele studio:** one lane per trainer and the **busiest moment**, because 3–4 trainers can run sessions at the same time.
- **Next up:** a gradient card in the session type's colour, with *Training starten* and an open button.
- **The day's list is Calendar-style:**
  - iOS: a time column and a colour bar;
  - Android: a shaped avatar per type, with the time on the right;
  - group classes show a booked/capacity pill, or *Vol*.
- **The UI never assumes an offering.**
  - No group-class or Open Gym figures, buttons or menu items in a workspace without them.
  - The session-type label ("Privésessie") shows only when there is more than one kind.
  - No studio view without a team. Many users are solo PTs with private sessions only.
- **No search tab on iOS.** It only duplicated *Klanten*.
- **A running workout** shows as a bar above the tab bar.

### Agenda (TD-04)

*Dag | Week | Maand*:
- **Week:** a strip of days, with a dot per session type.
- **Maand:** a month grid.

### Klanten and Klantprofiel (TM-02, TM-03)

- **Header:** avatar, then *Nu training starten* and *Sessie plannen*.
- **Tegoed:**
  - **open payment** (owner only);
  - **abonnement:** classes used this week;
  - **credits per kind:** a used / planned / left bar with the left count;
  - **renewal**, owner only: *Verlengen* and *Aanbod sturen* ([§6](#6-product-decisions)).
- **Vorige keer:**
  - the last workout's exercises, each with its difficulty emoji;
  - what was hard;
  - the trainer's note, trainer-only.
- **Voortgang:** a sparkline per top lift with the change over 8 weeks, and dots for the weeks trained.
- **The rest:** *Gegevens*, *Notities* (trainer-only), history.

### Sessie (TD-02)

- **Banners before the session:**
  - no private credits, or the last credit;
  - an open payment, owner only.
- **Location** with *Route*, the workspace and the trainer.
- **The Training card**, then *Vorige keer*, *Voortgang* and *Notities*.
- **Attendance** as a segmented control.
- **Duo session:** a switch between the two clients ([§6](#6-product-decisions)).

### Les (TD-03)

- **Header:** the level in the eyebrow ("Groepsles · Gevorderd").
- **Description** with *Meer / Minder*.
- **Booked:** n of capacity, with a bar.
- **Attendance** per participant, with *Iedereen aanwezig*: bulk attendance is in the MVP (owner, 6 November 2026), with F025. Offline, *Iedereen aanwezig* joins the offline queue like a single tap, as one queued request, and reverts with the message if the sync rejects it (owner, 9 November 2026).
- **Below:** participants, then attendance.
- **Owner ⋯ menu:** *Boekingslink delen*; *Trainer vervangen* and *Les wijzigen* (both point to the web); *Les annuleren*.

### Workout logger (WL-01 to WL-08)

- **Compact:** one row per set, *Set | Vorige | values | tick*, with a column layout per exercise type.
- **Sets:**
  - swipe left to delete, on iOS **and Android**;
  - the set number opens a menu (remove).
- **Exercises:** a ⋯ menu.
- **Reordering sets and exercises is in the MVP** (owner, 6 November 2026), with F043: the drag handle and the reorder mode, as the prototype shows them.
- **Every removal asks for confirmation** (owner rule, everywhere in the product).
- **Difficulty per exercise:**
  - shown as an **emoji only**: 😌 makkelijk, 🙂 normaal, 🥵 zwaar;
  - with an (i) that explains it;
  - the words stay as accessible names.
- **Finish:** duration, a not-done list, a note for trainers, *Opslaan als schema*, attendance.
- **Share:** a message for the client and a preview.
- **Duo:** a switch between the two clients, one log each.

### Schema's (TM-05 to TM-09, F041)

Trainers manage workout templates on the phone too, not only on the web (owner, 11 November 2026). The owner clicked through it and accepted it.

- **Where:** *Profiel* → *Trainingen* → *Schema's*: the list with each template's number of exercises, **+** on iOS and *Nieuw schema* on Android.
- **A template:** its rows (*Bankdrukken 3 × 8*), *Wijzigen*, and *Schema verwijderen* with the web's confirmation.
- **Nieuw schema / Schema wijzigen:** a name, then per exercise *Sets* and *Doel* (the target in the exercise type's unit, no weight); up and down buttons to reorder, a remove button (nothing is saved until *Opslaan*, so no confirmation), and *Oefening toevoegen* with the exercise picker, without *Recent* and *Nieuwe oefening*. A new template starts empty. The same exercise may be added twice; it shows *In schema*.
- **Footers:** "Alle trainers in je werkruimte kunnen schema's maken, wijzigen en verwijderen." and "Een wijziging verandert geen trainingen die al zijn gelogd."

### + Nieuw (TD-05) and forms

- **Privésessie**, with an optional *Tweede klant* that makes it a duo session.
- **Klant:** email required (`PRODUCT.md §26`).
- **Groepsles** (owner): with level, and a description in Dutch and English. The description is entered in the app too.
- The + sheet's icons are small inside their tiles.

## 4. Trainer web

### Navigation and Dashboard

- **Navigation:**
  - per role: *Mijn dag* and *Mijn agenda* for everyone;
  - workspace pages for the owner;
  - **Aanbod** is a new owner page.
- **+ Nieuw:** *Privésessie*, *Groepsles*, *Klant*, and below a divider *Aanbod* (owner).
- **Dashboard:**
  - KPIs and a lane per trainer;
  - *Aandacht nodig*, with billing flags: open payment, a pack running out, an abonnement ending;
  - *Nog vandaag*.

### Agenda

- **Views:** week, day per trainer (one column per trainer) and list.
- **The side sheet** shows *Vorige keer*, per client in a duo.

### Klanten and Klantprofiel

- **Klanten:**
  - columns *Abonnement en tegoed*, and *Betaling* for the owner;
  - an *Aanmeldverzoeken* tab with approve and decline.
- **Klantprofiel tabs:**
  - *Overzicht*, with the last workout and progress;
  - *Tegoed en betalingen*:
    - balances, and agreements with their history;
    - the renewal line;
    - payments and invoices;
    - refunds, which create a creditfactuur;
  - sessions, workouts, bookings, notes, history.
- **A back link** returns to where you came from.

### Lessen

- **Series** with *Wijzigen* and *Stoppen*. Capacity can't go below the number booked.
- **Les op datum:**
  - attendance;
  - the **waitlist** in order, with remove;
  - description, substitute, edit, cancel.

### Trainingen

- Own exercises: add, change, remove.
- The library is read-only.
- Templates: add, change, remove, with a row editor; also in Fivvi Pro (§3, *Schema's*).

### Aanbod (F052)

- **The offers, by kind:** abonnementen, creditpakketten, creditabonnementen and the single class pass: four kinds. The pass is bought ahead and good for one group class (owner, 9 November 2026, see §6). The prototype still shows it as *losse les*; its UI name is open (`packages/i18n/GLOSSARY.md` §4.9). Its pay-at-booking entries no longer hold: the client screens *Losse sessie kopen* (spot held for 10 minutes while paying), *Losse sessie: geboekt*, *Losse sessie: plek vrijgegeven* and *Losse sessie: geen wachtlijst* (`more-client.js`), and the email EM-33 for a payment that came in too late (`more-email.js`). They are redrawn with the F058 spec.
- **Each card shows:**
  - price with VAT;
  - what you get;
  - how it ends;
  - the renewal window;
  - running agreements;
  - an on/off switch.
- **The three default plans** stay off until they have a price. Switching one on without a price opens the form with the price marked.
- ***Nieuw aanbod*:**
  - pick the kind first, and only that kind's fields show;
  - or start from a default plan.
- **Editing** says the change applies to new agreements only.
- **Removing** asks for confirmation and says running agreements carry on.

### Trainers

- **Change role:** Trainer or Eigenaar. There must always be an owner.
- **Remove:**
  - shows what the trainer has in the next 2 weeks and hands it over to someone else;
  - the chosen trainer takes the next 2 weeks; sessions after that are not cancelled: classes and private sessions get *Trainer nodig* and show in the owner's *Aandacht nodig*, where the owner assigns them later (owner, 9 November 2026, F023);
  - with *Niemand*, the next 2 weeks behave as before (classes get *Trainer nodig*, private sessions are cancelled with an email) and later sessions get *Trainer nodig*;
  - you can't remove yourself or the last owner.
- **Invitations:** pending ones show as *Uitgenodigd*, with *Opnieuw sturen* and *Intrekken*.
- **Name and email** belong to the person's own account.

### Aanmeldlink and Instellingen

- **Aanmeldlink:**
  - link, QR, renew;
  - **a bilingual A4 poster** with the gym's (or PT's) name, the QR and the steps, in colour or black and white.
- **Instellingen:** *Algemeen* (with *Woordkeuze*), *Locatie*, *Boeken en annuleren*, *Betalingen*, *Facturen*, *Privacy*, *Taal*.

### Betalingen (CM-03, #466)

The owner asked to see this process before approving [#466](https://github.com/fivvi-app/fivvi/issues/466), and accepted it (6 November 2026). The panel's entries *Betalingen*, *Betaling* and *Betalen* show it; every status has a *Prototype* button that moves it on, because in real life Mollie takes minutes to days.

- **Owner only**. Connecting is on the web, and Fivvi Pro only says that it needs doing. Trainers never see it.
- **Steps:** *Betalingen koppelen*, a short explanation, Mollie's own pages, then back to Fivvi: *Mollie controleert je gegevens*, *Automatische incasso wordt nog gecontroleerd* (iDEAL already works), *Klaar om betalingen te ontvangen*.
- **Already at Mollie:** *Ik heb al een Mollie-account* signs in and approves what Fivvi may do.
- **Aanbod** stays off until payments work (for a workspace that has never set up payments; a later break or a deliberate *Ontkoppelen* doesn't lock it again, §7 item 13). While direct debit is in review, credit packs can go on, but memberships and credit plans can't.
- **It breaks:** *Koppeling werkt niet meer*, with a banner on the Dashboard and *Opnieuw koppelen*. *Ontkoppelen* asks for confirmation, and a deliberate disconnect is treated like a broken connection: Fivvi keeps working and only what needs Mollie stops (owner, 9 November 2026, [§7](#7-assumptions) item 13).
- **The client** pays on Mollie's page, and returns to *Betaald*, *Nog bezig* or *Niet gelukt*, with *Opnieuw proberen*. If the studio isn't ready, the client reads that online payment isn't available yet.
- Mollie's pages are **sketches, labelled as such**: this prototype doesn't copy them or ask for any details.

**Connecting payments comes first (decided by the owner, 6 November 2026).** Everything a client can see or buy waits until payments work; iDEAL working is enough, or the owner's choice to take payments only at the studio (#606). The owner's own setup stays open during Mollie's checks.

- **Locked until then** (only for a workspace that has never set up payments; a broken connection or a deliberate *Ontkoppelen* doesn't lock it again, §7 item 13): the join link and QR poster, client invitations, booking, switching offers on and recording a payment outside Fivvi. A client who opens the link reads *{studio} start binnenkort*.
- **Open:** classes, trainers, locations, adding clients and preparing offers.
- **How the owner is pushed:** a checklist on the Dashboard with payments first, a banner in Fivvi Pro, a reminder email, and the reason on every locked screen. The moment and number of reminder emails are in §7 item 12.
- A solo PT goes through the same steps. One who only takes cash or card can choose that instead (#606).
- Screens: *Dashboard: eerste stappen*, *Aanmeldlink: nog niet klaar*, *Klanten: nog geen uitnodigingen*, *E-mail aan de eigenaar: koppel je betalingen*, *Link geopend: studio nog niet klaar*, *Meedoen: studio nog niet klaar*, *Vandaag: betalingen nog niet gekoppeld*.

### Betaling buiten Fivvi (#606)

The owner asked for this: some studios and PTs take cash and set up a membership by hand (6 November 2026).

- On the client's profile, on the web and in Fivvi Pro (owner only), the owner records which offer, how it was paid (*Contant*, *Pin bij de studio*, *Overboeking*) and when. No money goes through Fivvi or Mollie, and it starts right away.
- **A monthly payment** shows on the profile with *Betaald*. If the owner hasn't recorded it, *Aandacht nodig* and the client's profile say so, until the owner taps *Betaald*. Booking doesn't stop by itself.
- **No automatic invoice** (owner). The owner can use *Factuur maken* on a payment when someone needs one, such as a business client. The payment stays on record, and the owner handles their own bookkeeping and tax, which the screen says. **Decided without an accountant (owner, 7 November 2026):** a private person needs no invoice. A client with *Factuur op naam van een bedrijf* on gets one automatically when the owner records the payment, as a business must be invoiced.
- **The renewal page** tells these clients they can pay at their studio too (owner).
- **A switch on *Betalingen*, off by default (owner):** *Laat klanten zien dat ze ook bij de studio kunnen betalen*. When it's on, the offers page of a studio with Mollie says *Liever contant of met pin? Dat kan ook bij je studio*. Off, so more clients pay online.
- **Cash-only studios are allowed (owner, 6 November 2026).** On *Betalingen*, below connecting Mollie, an owner can choose *Dan kan het ook zonder Mollie*. **Fivvi says what they lose first, and again on *Betalingen* afterwards (owner):** no online paying, buying or renewing by clients; no direct debit; new clients book only once their payment is recorded; no offers with a payment link; no automatic invoices; no overview of payouts per payment. Clients can then join and book, but can't pay, renew or buy online, so they see *Betalen bij je studio*, and the owner records every payment. *Aanbod sturen* is gone for them. The owner can connect Mollie later at any time, and the studio stays open while Mollie checks. Otherwise, recording a payment works once payments are connected, and keeps working when the Mollie connection breaks: only what goes through Mollie stops (owner, 7 November 2026; replaces the 6 November answer on #606).
- A till or card terminal connected to Fivvi is for later (owner; `PRODUCT.md §53`). A studio's own pin device is just recorded as *Pin bij de studio*.
- **Fivvi isn't anyone's accountant (owner, 7 November 2026).** The payment list downloads a month of payments, refunds and corrections as a CSV for the owner's bookkeeper, saying it isn't a cashbook or a VAT return. A correction can also move a payment to the right client; credits already used stay used. An offer's VAT rate is *21 %* or *9 %* (*0 %* goes), and a workspace on the small-business scheme or an exempt club turns on *Ik reken geen btw*. Fivvi never says which rate applies. Small changes in the accepted screens: a *Klant* field in *Betaling buiten Fivvi corrigeren*, *Downloaden (CSV)* on the payment list, the company-invoice sentence in the record dialog, and the sixth loss reads "automatic invoices only for clients who get them in a company's name". Prototype entries: *Betaling buiten Fivvi: klant met factuur op bedrijfsnaam*, *Factuurgegevens: ik reken geen btw*, *Factuur zonder btw*; the rest shows in the existing *Betalingen* and *Studio zonder Mollie* entries.
- Screens: *Betaling buiten Fivvi vastleggen* (Trainer web and Fivvi Pro), *Klantprofiel: contante betaling nog niet vastgelegd*, *Verlengen: klant die contant betaalt*, *Aanbod: ook bij de studio betalen*, *Betalingen: alleen contant of pin kiezen*, *Betalingen: studio zonder Mollie*, *Klantprofiel: studio zonder Mollie*, *Studio zonder Mollie: aanbod*, *Studio zonder Mollie: verlengen*.

## 5. Client web (ADR-026)

- **Joining:** link → email → 6-digit code → request (name) → waiting → approved.
- **Rooster:**
  - the date, and the gradient **next booking** card;
  - the week strip: **one dot per class you can still book** (not past, not cancelled, not full; owner, 5 November 2026), green when you're booked;
  - a cancelled class never shows in the client timetable;
  - a filter by kind comes with Open Gym, later;
  - rows with the **level** icon;
  - **nothing in a list is cut off with "…"** (owner, 5 November 2026): no description in list rows (the class page shows it whole), and long names wrap to a second line;
  - **book straight from the list** (owner, 5 November 2026): each row has *Boeken*, or *Wachtlijst* on a full class, and keeps *Geboekt ✓* or *Wachtlijst #n* once done. Without a matching credit the button opens the class page, which explains. The free spots lead the small line (accent at 2 or fewer). **Booking and joining the waitlist always ask for confirmation** (owner, 5 November 2026), from the list and from the class page: class, day and time, trainer, which credit it uses and how many are left, and the free-cancellation rule. A booking plans one credit; cancelling in time gives it back. Cancelling stays on the class page, with its confirmation;
  - the cancellation rule as a footnote;
  - the studio switcher in the header ([§5b](#5b-client-app-fivvi)): it switches between a client's studios and is also where they add one.
- **Class page:**
  - description;
  - a spots card with a bar;
  - trainer, level, location;
  - booking says which credit it uses and how many are left;
  - with no credit of that kind, a banner, and *Boeken* is off. Credit kinds never mix;
  - booked: a banner, and *Annuleren* with a confirmation that explains the 12-hour rule;
  - waitlist: join and leave, with the position shown.
- **Mijn agenda:** grouped per day, filtered by *Alles / Lessen / Privé*. A duo shows "samen met Noor".
- **Profiel:**
  - avatar;
  - **Tegoed** tiles: *Deze week n/m* for an abonnement, and left of total with used and planned for credits;
  - *Abonnement en credits*;
  - *Facturen*, with download;
  - *Mijn trainingen*: shared workouts with the trainer's message;
  - *Taal*, *Uitloggen*.
- **NL | EN** in the header on every step.

## 5b. Client app Fivvi

Prototyped on 5 November 2026 from `PRODUCT.md §55`. The panel's **App** switch (*Fivvi Pro | Fivvi (klant)*) shows it on iOS and Android, and the index group *Fivvi (klant-app)* lists its screens. It shares its state with the client web, so a booking made in one shows in the other. The owner reviewed it through comments on 5 November 2026; what is still open is in §7.

- **Tabs as in §55:**
  - *Home*: hello, the next session or class, a **"Deze week" card**, *Tegoed* as a small line, and what's coming up. The card is motivating and uses only facts Fivvi has (owner, 5 November 2026):
    - the days of this week, visited ✓ and booked ○ in the session type's colour;
    - how often so far and what's still planned; with no visit yet, what's planned and when the first one is;
    - weeks in a row;
    - one highlight: a lift from a shared workout (PT, from M7), or the month's count (pilates, yoga, and everyone before M7).
    - It sets no goals Fivvi doesn't have;
    - The *Tegoed* line opens a **Tegoed screen on top of Home, with a back button** (owner, 5 November 2026): balance tiles, agreements, *Aanbod bekijken*. A shortcut never drops the client in another tab without a way back;
  - *Boeken*: the timetable;
  - ***Activiteit*** instead of *Training* (owner, 5 November 2026: not every studio calls it training; a yoga or pilates studio doesn't log workouts):
    - what the client did: classes and sessions attended, newest first;
    - a monthly count and weeks in a row;
    - a workout the trainer shared opens with all its details;
    - it fits every setup: a yoga client sees only classes, and logged workouts appear only where private sessions exist;
    - the tab arrives with M7 (`PRODUCT.md §55`);
  - *Profiel*.
- **Platform look:**
  - iOS uses the glass tab bar and large titles;
  - Android uses the navigation bar and the M3 segmented button;
  - Android rows use the shaped avatar per session type, as in Fivvi Pro.
- **Signing in:** the emailed 6-digit code.
  - Without a studio: "Nog geen studio". The studio's link opens Fivvi, or the app scans their QR code with *QR-code scannen* (#484; owner, 6 November 2026).
  - The link opens the join request, then waiting, then approved.
- **Paying happens on the web** (`§53`, QC16):
  - *Aanbod bekijken* opens the studio's offer page in a browser sheet (Safari view or Custom Tab), with the address shown;
  - an offer for members only can't be chosen without a membership;
  - the client web shows the same offer page.
- ***Profiel*:**
  - *Tegoed*, agreements, invoices, the studio, *Taal*;
  - *Uitloggen*;
  - **Account verwijderen**, with a confirmation that says invoices stay with the studio as long as the law requires (`§79`).
- **Renewal reminders** (owner, 5 and 6 November 2026; `PRODUCT.md §90`; details in §7 item 4): the client gets **two emails** with a one-tap renewal, and a card on *Home* and *Tegoed* (*Rooster* and *Profiel* on the client web): "Je 10 groepscredits stoppen over 24 dagen" with ***Verlengen***.
  - **The first** goes at the start of the offer's renewal window, by default 30 days before the end. **The last** goes 7 days before the end. A credit pack also gets the first at 2 or fewer credits left, and the last when it is used up, whichever comes first.
  - **They also go when the owner sent an offer.** They then point at that offer: *Je studio heeft je een aanbod gestuurd* with ***Bekijk het aanbod***. No reminder goes in the 3 days after the owner's offer or another reminder; it waits until those 3 days are over. The last still goes 7 days before the end at the latest.
  - After the client renews, no more reminders go.
  - One tap opens the renewal page on the web with the same offer already chosen, *Als het huidige stopt* or *Na de betaling*, and *Betalen met iDEAL*. *Ander aanbod bekijken* is there too. After paying, the card is gone.
  - The owner sees *Herinnering verstuurd 1 nov · laatste uiterlijk 24 nov* on the agreement and can still send an offer.
  - Screens: the index entries *Verlengen*.
- **No push notifications:** they come in Release 1.1 (`§54`).
- **Doing a shared workout on your own** (owner, 5 November 2026: "let the client redo the workout the trainer sent, like in their own gym"). **Decided: MVP, with M7** ([#602](https://github.com/fivvi-app/fivvi/issues/602)).
  - A shared workout has ***Deze training zelf doen***. It opens a simple logger in the client app: each exercise with *Vorige keer met Sarah: 60 kg × 8, 8, 7*, one row per set with the trainer's weight and reps filled in, a field to change them and a check per set.
  - *Training afronden* asks for confirmation ("2 van 12 sets gedaan"). *Stoppen zonder opslaan* asks too. Back keeps the progress.
  - The finished workout appears in *Activiteit* as *Zelf gedaan* and ticks the day in *Deze week* (the second part is an assumption, §7 item 11).
  - No booking, no credit, no attendance: it isn't a session.
  - **The client can add and remove exercises** (owner, 5 November 2026): *Oefening toevoegen* opens the exercise library (search in Dutch or English); a trash button per exercise asks *Plank weghalen?* first. *Set toevoegen* copies the last set.
  - **The client can edit or delete a finished one at any time** (owner, 5 November 2026): it opens from *Activiteit*, with *Bewerken* (the logger with what they did) and *Verwijderen*, which asks for confirmation first.
  - **App only** (owner, 5 November 2026): not on the client web.
  - **Private to the client** (owner, 5 November 2026): what the client does on their own is theirs only. Trainers never see it, not in Fivvi Pro and not on the trainer web. The client app says so: *Alleen jij ziet deze training*.
- **The header** (owner, 5 November 2026: "this header can be better"):
  - *Home*, *Activiteit* and *Profiel* show only the large title with the date above it, without a studio badge.
  - *Boeken* shows the **studio switcher**: on iOS a glass button in the navigation bar (the studio's mark, its name, ⌃⌄); on Android a tonal dropdown chip under the app bar.
  - The studio's mark is a rounded square in the studio's colour, like an app icon.
- **More than one studio or PT** (owner, 5 November 2026). One account per person (`PRODUCT.md §2.9`, ADR-026); every studio approves the client separately.
  - **Per studio:** *Boeken*, *Tegoed* and the offers page. Credits never cross studios (`§91`).
  - **Together:** *Home*, *Mijn agenda* and *Activiteit*. With two studios each row names its studio, and Home has one *Tegoed* line per studio.
  - The switcher opens ***Je studio's***: each studio with its balance, a check on the current one, and ***Studio toevoegen***. Adding a studio explains the link or QR code, because there is no search for studios (ADR-026).
  - *Tegoed* has a segmented switch per studio; *Profiel* lists the studios.
  - The client web works the same way: the switcher on *Rooster*.
  - Screens: the index entries *Twee studio's* and *Studio toevoegen*, with the fictional second studio Yoga Loft.

**Decided (owner, 6 November 2026):** the client web moves to the same four tabs as the app, *Home | Boeken | Activiteit | Profiel*, so clients find things in the same place everywhere. The prototype still shows *Rooster | Mijn agenda | Profiel* until it is updated.

## 6. Product decisions

| Decision | Detail | Where it's tracked |
|---|---|---|
| **Billing per client is visible** | Owner, 5 November 2026: the owner must see each client's abonnement, credits used, planned and left, and open payments. Shown in the app and on the web | [§3](#3-fivvi-pro-ios-and-android), [§4](#4-trainer-web); F053–F055 |
| **Duo sessions: build them** | Two clients, one trainer, each with their own workout, credit and attendance | [#586](https://github.com/fivvi-app/fivvi/issues/586) |
| **Class levels: build them** | A level field on the class, not in the name. **In lists, only the three-bar icon after the class name**, with the word as accessible name and tooltip; "Alle niveaus" shows no icon in a list. Pages about one class show icon and word (owner, 5 November 2026) | [#587](https://github.com/fivvi-app/fivvi/issues/587) |
| **The workspace's word for trainers: build it** | Trainer, instructeur, docent or coach, chosen in *Instellingen*, used everywhere in that workspace | [#588](https://github.com/fivvi-app/fivvi/issues/588) |
| **Clients pick a spot: later** | A post-MVP feature, maybe for several kinds of class. Stopping double room bookings is admin and not a priority | [#589](https://github.com/fivvi-app/fivvi/issues/589) |
| **Renew before the end** | The owner sends the renewal before an agreement that stops ends. The **window is set per offer**, default 30 days. A credit pack is also suggested at **2 or fewer** credits left. *Aanbod sturen* is always there. **Fivvi also reminds the client automatically, twice**, also when the owner sent an offer (owner, 5 and 6 November 2026; `PRODUCT.md §90`): at the start of the window and 7 days before the end (§7 item 4), so nobody depends on the owner remembering. The offer's email goes to the client to confirm and pay with iDEAL, and the invoice follows the payment. The new agreement starts when the current one ends (no gap, no overlap) or right after payment | [#468](https://github.com/fivvi-app/fivvi/issues/468) |
| **Offers are made on the Aanbod page** | Web, owner only, also from *+ Nieuw* | [#468](https://github.com/fivvi-app/fivvi/issues/468) |
| **Add, change, remove everything** | Every list (class series, own exercises, templates, offers, trainers) can be added to, changed and removed from; for a trainer, changing means the role. Every removal asks for confirmation | All specs |
| **Trainers see the client's last workout and progress** | In the app and on the web. AI help is post-MVP (`§53`) | F044, F045 |
| **Clients do a shared workout on their own: build it, MVP with M7** | Owner, 5 November 2026. The client logs a workout the trainer shared (F045), for example in their own gym. **Private to the client:** trainers never see it. App only | [#602](https://github.com/fivvi-app/fivvi/issues/602) |
| **Fixed groups: not in the MVP** | A client isn't enrolled in a weekly series (owner, 6 November 2026) | [SCENARIOS.md](SCENARIOS.md) |
| **Unused classes and the weekly limit sit in the membership offer** | Owner, 6 November 2026: the owner always sees them there, and a running agreement keeps its terms. This replaces the two workspace settings of 31 October 2026. The client sees the rule on the offer | [#483](https://github.com/fivvi-app/fivvi/issues/483), `PRODUCT.md §91` |
| **Deleting an account is a danger zone** | Owner, 6 November 2026, like GitHub: a red-outlined *Gevarenzone* at the bottom of the profile. Deleting asks to type your email address, then the emailed code, and only then the button works. The only owner of a workspace is still refused | [#477](https://github.com/fivvi-app/fivvi/issues/477) |
| **An owner doesn't edit a trainer's details** | Owner, 6 November 2026: a trainer's name and email belong to their own account, so the owner changes roles, removes people, and resends or withdraws invitations; a mistyped address is fixed by withdrawing and inviting again. There's no editing an invitation's address and no name per studio | F005 [#173](https://github.com/fivvi-app/fivvi/issues/173) |
| **Offer and class forms name each language** | Owner, 6 November 2026: *Naam (Nederlands)* and *Naam (Engels, optioneel)* on offers, classes and series, and the same for *Omschrijving*, in both UI languages. The default plan you start from stays highlighted, and tapping it again clears the form. These long forms read in titled sections with a line between them: offers have *Naam en omschrijving*, *Prijs*, *Wat de klant krijgt*, *Regels* and *Einde en verlengen*; classes have *Naam en omschrijving*, *De les* and *Wanneer* | [#468](https://github.com/fivvi-app/fivvi/issues/468), [#427](https://github.com/fivvi-app/fivvi/issues/427) |
| **Connecting payments comes first** | Everything clients can see or buy waits until payments work, or until the owner chooses to take payments only at the studio; the owner's own setup stays open (owner, 6 November 2026) | [Betalingen](#betalingen-cm-03-466), [#466](https://github.com/fivvi-app/fivvi/issues/466), [#484](https://github.com/fivvi-app/fivvi/issues/484), [#482](https://github.com/fivvi-app/fivvi/issues/482) |
| **Payments outside Fivvi: build it** | The owner records cash and similar payments on the client's profile, on the web and in Fivvi Pro. Cash-only studios may skip Mollie. No automatic invoice; the accountant check is open | [#606](https://github.com/fivvi-app/fivvi/issues/606) |
| **The single class is a single class pass** | Owner, 9 November 2026 (on #495): an offer kind of its own, so the offers are four kinds (membership, credit pack, credit plan, single class pass). The client **buys it ahead**, like credits, and it is good for **one group class**; nothing is paid at the booking. The owner sets the price. **Guideline only, not enforced:** it should cost more than a class in a membership or pack, because it isn't a membership. F058 is reopened as *Single class pass*. Decided later the same day, see the rows below: never refunded, and credits are used before a pass. Open: cancellation, no-show and how long an unused pass is valid; the UI name (the prototype still says *losse les*, which `packages/i18n/GLOSSARY.md` retired in 2026-10). The prototype's offer and screens are redrawn with the spec, and its pay-at-booking entries (*Losse sessie kopen / geboekt / plek vrijgegeven / geen wachtlijst*, email EM-33) no longer hold | [#495](https://github.com/fivvi-app/fivvi/issues/495), `PRODUCT.md §90`, `§95`, `ROADMAP.md` decision 9 |
| **A broken Mollie connection doesn't stop the studio** | Owner, 9 November 2026: when the connection breaks, Fivvi keeps working. Recording a payment outside Fivvi keeps working (as the 7 November decision on #606 says). Only what needs Mollie itself stops: online checkout (new sales and renewals), direct debits and new mandates | [Betalingen](#betalingen-cm-03-466), [§7](#7-assumptions) item 13, [#466](https://github.com/fivvi-app/fivvi/issues/466), [#606](https://github.com/fivvi-app/fivvi/issues/606) |
| **A single class pass is never refunded; credits come first** | Owner, 9 November 2026: an unused pass is **never refunded**, with no client refund and no automatic refund; the owner's manual refund in F060 is unchanged. **Credits are used before a pass:** a class is covered by the membership first, then group credits, then the single class pass. **Parked for later:** the pass may need an exception to how a client joins a gym, so that someone can try a gym without being approved first; for now only a signed-in, approved client buys one | [#495](https://github.com/fivvi-app/fivvi/issues/495), `PRODUCT.md §25`, `§95`, `ROADMAP.md` decision 9 |
| **Trainer web sign-in: wordmark or day dial** | Owner, 9 November 2026: the wordmark on large screens (768 px and wider, where the trainer web puts its sidebar beside the content), the plain day dial below that | [#626](https://github.com/fivvi-app/fivvi/issues/626), [`brand/README.md`](../brand/README.md) |
| **Removing a trainer: the handover beyond 2 weeks** | Owner, 9 November 2026: the chosen trainer takes the next 2 weeks, and sessions after that are not cancelled: classes and private sessions get *Trainer nodig* and show in the owner's *Aandacht nodig*, where the owner assigns them later. With *Niemand*, the next 2 weeks behave as before (classes *Trainer nodig*, private sessions cancelled with an email) and later sessions get *Trainer nodig* | F023, [§4](#trainers), `PRODUCT.md §19` |
| ***Iedereen aanwezig* works offline** | Owner, 9 November 2026: it joins the offline queue like a single tap, as one queued request, and reverts with the message if the sync rejects it | F025, `PRODUCT.md §43` |
| **A deliberate *Ontkoppelen* is a broken connection** | Owner, 9 November 2026: Fivvi keeps working and only what needs Mollie stops (online checkout, direct debits, new mandates). The payments-first lock is only for a workspace that has never set up payments | [Betalingen](#betalingen-cm-03-466), [§7](#7-assumptions) item 13, [#466](https://github.com/fivvi-app/fivvi/issues/466), `PRODUCT.md §94` |
| **Open Gym: later** | Owner, 6 November 2026: not in the MVP, with Open Gym credits and the Open Gym booking link. The prototype hides it everywhere; the code stays for when it comes. The colour stays reserved | `PRODUCT.md §53`, [#470](https://github.com/fivvi-app/fivvi/issues/470), [#471](https://github.com/fivvi-app/fivvi/issues/471), [#472](https://github.com/fivvi-app/fivvi/issues/472) |
| **Client web tabs** | The same four tabs as the app, *Home · Boeken · Activiteit · Profiel* (owner, 6 November 2026). The prototype still shows the earlier tabs | [#489](https://github.com/fivvi-app/fivvi/issues/489), [#497](https://github.com/fivvi-app/fivvi/issues/497) |

## 7. Assumptions

The prototype had to choose something for these. **The owner confirmed every item here on 6 November 2026, except part of item 15.** A spec builds the confirmed items as written. The others are not decided, so a spec that touches them asks the owner.

1. **Trainers and balances:** trainers see their clients' credit balances, but no money (`QC12`).
2. ***Aanbod sturen*:** it sends the client a link to confirm and pay.
3. **Changing a series' time:** bookings stay, and the clients get an email.
4. **Renewal reminders: the timing** (#468, #481). The owner decided two reminders, that they also go after the owner's offer, the card, and that a pack at 2 or fewer left gets them, and confirmed this timing (6 November 2026):
   - 30 days before the end (the offer's window) and 7 days before it;
   - a credit pack gets the first at 2 or fewer left and the last when it is used up, if that comes earlier;
   - 3 days of quiet after the owner's offer or another reminder, but the last still goes 7 days before the end at the latest;
   - a pack sold with 2 or fewer credits, or an offer a client can buy only once, gets no reminder;
   - a window under 14 days gets one reminder, at its start;
   - a term shorter than its window gets only the one 7 days before the end.
5. **Duo sessions:**
   - each client uses one of their own privécredits;
   - the trainer plans it, and clients don't book a duo themselves;
   - two clients; if one cancels, it continues as a private session (#586).
6. **Levels:**
   - a fixed list of four;
   - information only, with no filter;
   - set on the series and changeable per date (#587).
7. **Wording:** a fixed list of four words, and the internal role stays *trainer* (#588).
8. **Trainers page:**
   - a workspace may have more than one owner;
   - the handover covers the next 2 weeks; sessions after that stay and get *Trainer nodig* (owner, 9 November 2026, §6).
9. **Reordering and bulk attendance:** both move into the MVP (owner, 6 November 2026): reordering sets and exercises with F043, and *Iedereen aanwezig* with F025 ([#460](https://github.com/fivvi-app/fivvi/issues/460)).
10. **More than one studio:** *Home* and *Mijn agenda* combine every studio. QE05 left this to the F033 spec; the owner confirmed it.
11. **Doing a shared workout on your own** (#602):
    - it is stored under the workspace whose trainer shared the workout (`organization_id`); that only the client can read it is decided (§5b);
    - it counts in *Deze week*, *Activiteit* and the weeks in a row;
    - the client starts only from a workout the trainer shared, not from an empty one (`PRODUCT.md §40`: the trainer assigns workouts); within it they add and remove exercises;
    - the client adds exercises from the library only and can't create new ones.
12. **Reminder emails to the owner** (#466): one the day after starting without finishing, and one 3 days later; none once payments work or the owner chooses to take payments only at the studio. Mollie emails the owner itself when it needs something.
13. **A connection that breaks later** (#466): the studio stays open for its clients, who keep booking with what they have, and the join link keeps working. New online sales and renewals stop until the owner reconnects, and so does anything else that needs Mollie itself, such as online checkout and direct debits. Recording a payment outside Fivvi keeps working (#606; owner, 9 November 2026, which replaces the earlier answer that it stopped). A deliberate *Ontkoppelen* is treated the same way (owner, 9 November 2026): Fivvi keeps working and only what needs Mollie stops, which includes new mandates. The payments-first lock (§4, *Betalingen*) is only for a workspace that has never set up payments. Prototype entry: *Klantprofiel: koppeling werkt niet meer*, on the trainer web; switch *Scherm* to iOS or Android for Fivvi Pro.
14. **Weekly limit** (#483): an option on every membership offer, next to *Ongebruikte lessen*, and it shows whether unused classes expire or stay valid, because the pilot uses both a limit of 4 and expiring classes (owner, 6 November 2026). The default plan starts at the pilot's 4 (owner, 6 November 2026, answering #483 question 5). A new offer the owner builds from scratch starts with no limit.
15. **Screens added on 6 November 2026 from the spec text** (`more-*.js`): the screens and states the specs already described but the prototype didn't show. The copy follows the spec, shortened in places, and the spec's wording wins when they differ. The layout isn't the owner's choice until they've clicked through it. *Korte teksten* lists messages with no screen of their own. The owner clicked through and accepted (6 November 2026): *Inloggen (TW-10)*, *Mijn profiel (TW-09)*, the *Locatie* entries, *Mijn profiel: e-mailadres wijzigen*, *Profiel: e-mailadres wijzigen*, *Betalingenlijst: studio zonder Mollie* and *Facturen: studio zonder Mollie*. The rest of this group is still theirs to click through.
16. **A trainer or owner changing their own email address** (owner, 6 November 2026): the same account-level step as a client's (#497, F033, verified by a code), on *Mijn profiel* and in Fivvi Pro's *Profiel*. F005 (#173) built the address as read-only and left changing it out of scope (F001), so this has a spec of its own, [#610](https://github.com/fivvi-app/fivvi/issues/610).
17. **Scanning a QR code in the client app** (owner, 6 November 2026): yes, as #484 has it: *QR-code scannen* on the no-studio screen, in the app only. A Fivvi join link opens the join screen; anything else, or no camera access, shows its own message.
18. **Cancelling one client of a duo** (#586): *Wie annuleer je?* with *Alleen Eva annuleren* and *Hele sessie annuleren*, and to the client who stays "Je sessie gaat door, zonder Eva." Prototype entry: *Duosessie: één klant annuleren*. The owner clicked through it and accepted it (6 November 2026).
19. **Correcting a payment outside Fivvi** (#606): *Corrigeren* on a payment row, with the right offer, method and date and a required reason. The old line stays as *Gecorrigeerd* and points to the new one, and if the offer was wrong, the wrong agreement ends and the right one starts. Prototype entry: *Betaling buiten Fivvi corrigeren*. The owner clicked through it and accepted it (6 November 2026).
20. **Where a session or class takes place** (owner, 7 November 2026): after a PT training in a park came up, the owner looked at letting any session or class say where, and chose to go live with one place per workspace, as decided on 20 October 2026 (`ROADMAP.md` decision 12), and improve it after go-live.
21. **Workout templates** (F041, owner, 11 November 2026): a template row is an exercise with sets × target, no weight; any Owner or Trainer in the workspace creates, changes and deletes any template; a name is unique in the workspace, regardless of capitals; *Opslaan als schema* when a workout finishes belongs to F043, not F041; templates are managed on the web and in Fivvi Pro (§3, *Schema's*).

## 8. What this changes in existing documents

| Document | What changes | Resolved in |
|---|---|---|
| [ADR-003](../../decisions/ADR-003-native-mobile-apps.md) | iOS minimum 17.0 → **26** | [ADR-029](../../decisions/ADR-029-design-v2.md) (this PR) |
| [ADR-015](../../decisions/ADR-015-ui-foundation.md), [`DESIGN.md`](../../../DESIGN.md), [`visual-direction.md`](../visual-direction.md), [`packages/design-tokens`](../../../packages/design-tokens/README.md) | The v1 palette (muted violet) and look are replaced by [§2](#2-platforms-and-visual-direction). The token values change in the package | ADR-029; `DESIGN.md` and `visual-direction.md` (this PR); the token change is the Design v2 foundation spec [#590](https://github.com/fivvi-app/fivvi/issues/590) |
| [Flow 02](../flows/02-trainer-today.md), Vandaag | Summary and layout as in [§3](#3-fivvi-pro-ios-and-android): no rings, the *Mijn dag* card, lanes for the whole studio | F013 [#457](https://github.com/fivvi-app/fivvi/issues/457) |
| [Flow 01](../flows/01-public-booking.md), booking | The client web's look; booking and the waitlist from the list, always with a confirmation ([§5](#5-client-web-adr-026)) | F027 [#489](https://github.com/fivvi-app/fivvi/issues/489), F031 [#491](https://github.com/fivvi-app/fivvi/issues/491) |
| [Flow 03](../flows/03-workspace-calendar.md), the calendar on the web | shadcn/ui as in [§4](#4-trainer-web) | F014 [#458](https://github.com/fivvi-app/fivvi/issues/458) |
| [Flow 04](../flows/04-private-session.md), private session | The session screen and forms as in [§3](#3-fivvi-pro-ios-and-android), including duo sessions | F020 [#425](https://github.com/fivvi-app/fivvi/issues/425), [#586](https://github.com/fivvi-app/fivvi/issues/586) |
| [Flow 06](../flows/06-class-occurrence.md), a class on a date | The class screen as in [§3](#3-fivvi-pro-ios-and-android) | F021 [#427](https://github.com/fivvi-app/fivvi/issues/427), F025 [#460](https://github.com/fivvi-app/fivvi/issues/460) |
| [Flow 05](../flows/05-live-workout-logging.md), WL-02 | Difficulty as an emoji with (i), not "the word is the answer". Compact set rows. Swipe to delete sets. Reordering is in the MVP | F043, F044 specs (to write) |
| [IA §5.2](../information-architecture.md#52-platform-conventions-both-apps) | Android "no swipe actions by default" now has one exception: swipe to delete a set in the logger (with confirmation) | F043 spec (to write) |
| TD-05, class descriptions | Descriptions can be entered in the app's new-class form, not only on the web | F021 [#427](https://github.com/fivvi-app/fivvi/issues/427) |
| [IA §3.2](../information-architecture.md#32-role--navigation) | New owner page *Aanbod*. Trainers page: change role, remove with a handover, withdraw an invitation | F052 [#468](https://github.com/fivvi-app/fivvi/issues/468); F003/F004 follow-up in [#590](https://github.com/fivvi-app/fivvi/issues/590) |
| [`GLOSSARY.md`](../../../GLOSSARY.md), [`packages/i18n/GLOSSARY.md`](../../../packages/i18n/GLOSSARY.md) | "Always *trainer*" becomes the workspace's chosen word | [#588](https://github.com/fivvi-app/fivvi/issues/588) |
| [`PRODUCT.md §55`](../../product/PRODUCT.md#55-client-app-at-go-live), client app navigation | *Home, Boeken, Training, Profiel* becomes *Home, Boeken, Activiteit, Profiel* | `PRODUCT.md` (this PR); [#469](https://github.com/fivvi-app/fivvi/issues/469) and the F033 / F045 specs |
| [`PRODUCT.md §40`](../../product/PRODUCT.md#40-client-workouts) and [`§55`](../../product/PRODUCT.md#55-client-app-at-go-live), [`FEATURES.md`](../../product/FEATURES.md) | Clients do a shared workout on their own, private to them; a new `PLANNED` feature for M7 | `PRODUCT.md §40` and `§55` (this PR); the `FEATURES.md` row with [#602](https://github.com/fivvi-app/fivvi/issues/602) |
| [`packages/ui`](../../../packages/ui/README.md), `font-display` | Bricolage Grotesque goes; v2 uses the system stack on the web | [#590](https://github.com/fivvi-app/fivvi/issues/590) |
| [`PRODUCT.md §51`](../../product/PRODUCT.md#51-notifications) and [`§90`](../../product/PRODUCT.md#90-offers-and-prices), [IA §8](../information-architecture.md#8-emails), emails | The client's renewal reminders | `PRODUCT.md` (this PR); IA with F052 [#468](https://github.com/fivvi-app/fivvi/issues/468); the emails (EM-28) with F057 [#481](https://github.com/fivvi-app/fivvi/issues/481) |
| [IA §7](../information-architecture.md#7-client-web), client web | The client web uses the app's design language ([§5](#5-client-web-adr-026)) | F027 [#489](https://github.com/fivvi-app/fivvi/issues/489), F033 [#497](https://github.com/fivvi-app/fivvi/issues/497) |
| [`PRODUCT.md §53`](../../product/PRODUCT.md#53-explicit-mvp-exclusions), [`§94`](../../product/PRODUCT.md#94-recurring-payments) and [`§96`](../../product/PRODUCT.md#96-invoices), F059 [#474](https://github.com/fivvi-app/fivvi/issues/474) | Payments come first, a studio may take payments only at the desk, and a payment outside Fivvi gets no automatic invoice | `PRODUCT.md` (this PR); the invoice spec with [#606](https://github.com/fivvi-app/fivvi/issues/606) |

## 9. Public website

Designed with the owner on 6 November 2026 in its own artifact, [Fivvi Website](https://claude.ai/artifact/TYm2FXMAATs5cB768MTiPG) (source: [`docs/design/website`](../website/README.md)), because a public page has another layout and story than the app. It uses this prototype's real screens. The spec is [#611](https://github.com/fivvi-app/fivvi/issues/611), the build approach [ADR-030](../../decisions/ADR-030-public-website.md).

- **Idea:** one working day per audience, not a feature list. Each moment is a problem the visitor recognises, and the answer is a real Fivvi screen. Gyms, studios (pilates or yoga), personal trainers and clients each get their own page.
- **Address:** the main site is `https://fivvi.app`, Dutch at `/`, English at `/en` (owner).
- **Timing:** sooner than Release 2.0, because Mollie needs a public website (owner).
- **Main button:** *Plan een demo* on every page, because workspace creation stays closed until 2.0 (owner).
- **Mollie is named** on the site (owner), with iDEAL next to it.
- **Dutch copy says *sportschool*,** as `packages/i18n/GLOSSARY.md` asks, at `/sportscholen`; English says *gyms*.
- **Platforms (owner):** the section shows what owners and trainers use and what clients use, each on iPhone, Android and in the browser: Fivvi Pro and the trainer web, Fivvi and the client web.
- **Images:** real screens first. Next to them an image that stands on its own beside the words, never as a background behind screens or text (owner). No people, so nothing passes for a real customer. The images are **one series of miniature 3D scenes in a light colouring** (owner): warm white and light oak with pink as the accent, one for each audience and for pilates and yoga. On the homepage it follows the *Ik ben* switch. Empty rooms, screens only, objects, number posters and an all-pink version were tried and rejected (owner).
- **Nothing made up:** no figures, testimonials or ratings until they exist.
- **Deleting an account:** the page at `/account-verwijderen` and `/delete-account` is built by [#477](https://github.com/fivvi-app/fivvi/issues/477), as a sign-in page with the danger-zone steps of §6, and the site links to it. The artifact shows its words; the email route is on the help page.

**Assumptions, not yet confirmed by the owner:**

1. **Pricing:** free during the pilot, Mollie charges per payment, 60 days' notice before Fivvi charges (`terms` A4, `open-questions.md` Q15). Mollie asks for a price on the site.
2. **The demo and support:** a demo of 30 minutes online, and a reply within 1 working day to demo requests and questions.
3. **The trade name** K&S Apps, from #151, and the addresses `support@fivvi.app` and `privacy@fivvi.app`.
4. **A signed-in user** who opens `/` goes to their home in the app.
5. **Going live before the product is ready.** The site goes live for Mollie, before M11 (payments and invoices), M7 (workouts, notes, sharing) and the store listings. So every page says Fivvi is being built with its first gym and the demo says what's ready, and each claim is checked before publishing (#611 AC19).

