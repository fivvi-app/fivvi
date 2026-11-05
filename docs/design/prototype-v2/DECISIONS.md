# UI decisions: prototype v2

| | |
|---|---|
| **Status** | Decided with the owner, 5 November 2026 |
| **Reference** | The clickable prototype in this folder ([README](README.md)), published as the "Fivvi Prototype" artifact. Fictional data only |
| **Scope** | Fivvi Pro (iOS and Android), trainer web, client web |
| **Replaces** | [`visual-direction.md`](../visual-direction.md) v1 (muted violet), and the parts of the flows and the IA listed in [§8](#8-what-this-changes-in-existing-documents) |

This is the record of what the owner and the agent decided while clicking through the prototype. The prototype shows how each decision looks and behaves; this file says it in words. A spec or ticket with a UI follows this file and names the prototype screen it implements. Where an older document disagrees, [§8](#8-what-this-changes-in-existing-documents) lists the conflict and where it gets resolved. Open points are in [§7](#7-assumptions-still-to-confirm): they are **not** decided.

## 1. How we decide UI

- **Design first, where design matters.** A new screen or flow, a visible change to one, or a product question a screen makes concrete is talked over in the clickable prototype before a spec is written (owner, 5 November 2026). Work without a screen, and small changes that follow a pattern already here, skip it. The agent builds the proposal in the prototype, the owner clicks through it and comments, and the result is recorded here. Then the spec follows. See [`docs/agents/design.md`](../../agents/design.md).
- The prototype is throwaway code. It shows the look and the flow, not the architecture.

## 2. Platforms and visual direction

Recorded in [ADR-029](../../decisions/ADR-029-design-v2.md).

| Platform | Decision |
|---|---|
| iOS | **iOS 26 minimum** (replaces iOS 17 in ADR-003). Latest Apple design, including **Liquid Glass**: glass navigation buttons, a floating glass tab bar that shrinks while scrolling, glass sheets and alerts |
| Android | Latest Material design: **Material 3 Expressive** (Compose `material3` 1.5), Google Sans Flex, shaped avatars. Single-choice toggles are the **M3 segmented button** (an outlined pill with a check on the selected one). The Expressive connected button group was tried twice and rejected |
| Trainer web | **shadcn/ui** (zinc neutrals), sidebar, top bar with search and **+ Nieuw**, tables, dialogs, side sheets |
| Client web | A mobile website in the **same design language as Fivvi Pro**: large titles, a glass header and tab bar, the week strip, Calendar rows, the gradient "next" card, grouped lists. Not a separate, plainer look (owner, 5 November 2026) |

**One theme on every platform**, with the details of Apple Calendar, Fitness and Health: "Calendar calm, Fitness pops".

- **Canvas:** grouped grey (`#F2F2F7`) with white cards in light, true black with `#1C1C1E` cards in dark. Inset grouped lists, radius 26 for cards and lists, inset separators.
- **Accent:** **Move pink `#E6164A`** (text `#C8103D` in light, `#FF6482` in dark). A **black-and-white** accent is the second option. The accent is a token, so it can change in one place. Anything on an accent fill uses the on-accent colour (it flips to near-black on the white accent in dark mode).
- **Session-type colours:** private `#0088FF`, group `#CB30E0`, Open Gym `#FF8D28`; success `#34C759`, danger `#FF383C`. Workspaces have their own dot colour.
- **Gradients stay in one hue**, never drifting to another colour (owner: "too much to the purple"). The hero card uses the session type's colour, darker at the bottom.
- **Numbers** use a rounded face (SF Pro Rounded, `ui-rounded`) with tabular digits. Text is SF Pro on iOS, Google Sans Flex on Android, the system stack on the web.
- **Round controls stay round** (the + button). Buttons are pills (50 pt on iOS). Grouped buttons are equal width.
- **Contrast in light and dark:**
  - text at least 4.5:1, icons and graphics at least 3:1, checked on every screen;
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

### Les and Open Gym (TD-03)

- **Header:** the level in the eyebrow ("Groepsles · Gevorderd").
- **Description** with *Meer / Minder*.
- **Booked:** n of capacity, with a bar.
- **Below:** participants, then attendance.
- **Owner ⋯ menu:** *Boekingslink delen*; *Trainer vervangen* and *Les wijzigen* (both point to the web); *Les annuleren*.

### Workout logger (WL-01 to WL-08)

- **Compact:** one row per set, *Set | Vorige | values | tick*, with a column layout per exercise type.
- **Sets:**
  - swipe left to delete, on iOS **and Android**;
  - the set number is the drag handle and opens a menu (up, down, remove).
- **Exercises:** a ⋯ menu and a reorder mode.
- **Every removal asks for confirmation** (owner rule, everywhere in the product).
- **Difficulty per exercise:**
  - shown as an **emoji only**: 😌 makkelijk, 🙂 normaal, 🥵 zwaar;
  - with an (i) that explains it;
  - the words stay as accessible names.
- **Finish:** duration, a not-done list, a note for trainers, *Opslaan als schema*, attendance.
- **Share:** a message for the client and a preview.
- **Duo:** a switch between the two clients, one log each.

### + Nieuw (TD-05) and forms

- **Privésessie**, with an optional *Tweede klant* that makes it a duo session.
- **Klant:** email required (`PRODUCT.md §26`).
- **Groepsles** (owner): with level, and a description in Dutch and English. The description is entered in the app too.
- **Open Gym** (owner).
- The + sheet's icons are small inside their tiles.

## 4. Trainer web

### Navigation and Dashboard

- **Navigation:**
  - per role: *Mijn dag* and *Mijn agenda* for everyone;
  - workspace pages for the owner;
  - **Aanbod** is a new owner page.
- **+ Nieuw:** *Privésessie*, *Groepsles*, *Open Gym*, *Klant*, and below a divider *Aanbod* (owner).
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
- Templates: add, change, remove, with a row editor.

### Aanbod (F052)

- **The offers, by kind:** abonnementen, creditpakketten, creditabonnementen, losse les.
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
  - with nobody, classes get *Trainer nodig* and private sessions are cancelled with an email;
  - you can't remove yourself or the last owner.
- **Invitations:** pending ones show as *Uitgenodigd*, with *Opnieuw sturen* and *Intrekken*.
- **Name and email** belong to the person's own account.

### Aanmeldlink and Instellingen

- **Aanmeldlink:**
  - link, QR, renew;
  - **a bilingual A4 poster** with the gym's (or PT's) name, the QR and the steps, in colour or black and white.
- **Instellingen:** *Algemeen* (with *Woordkeuze*), *Locatie*, *Boeken*, *Taal*.

## 5. Client web (ADR-026)

- **Joining:** link → email → 6-digit code → request (name) → waiting → approved.
- **Rooster:**
  - the date, and the gradient **next booking** card;
  - the week strip, where a booked day shows a green dot;
  - a filter, only when both groups and Open Gym exist;
  - rows with the **level**;
  - state pills: *Geboekt ✓*, *Wachtlijst #n*, *Vol*, *Nog n plekken* (accent at 2 or fewer);
  - the cancellation rule as a footnote.
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

## 6. Product decisions

| Decision | Detail | Where it's tracked |
|---|---|---|
| **Billing per client is visible** | Owner, 5 November 2026: the owner must see each client's abonnement, credits used, planned and left, and open payments. Shown in the app and on the web | [§3](#3-fivvi-pro-ios-and-android), [§4](#4-trainer-web); F053–F055 |
| **Duo sessions: build them** | Two clients, one trainer, each with their own workout, credit and attendance | [#586](https://github.com/fivvi-app/fivvi/issues/586) |
| **Class levels: build them** | A level field on the class, not in the name | [#587](https://github.com/fivvi-app/fivvi/issues/587) |
| **The workspace's word for trainers: build it** | Trainer, instructeur, docent or coach, chosen in *Instellingen*, used everywhere in that workspace | [#588](https://github.com/fivvi-app/fivvi/issues/588) |
| **Clients pick a spot: later** | A post-MVP feature, maybe for several kinds of class. Stopping double room bookings is admin and not a priority | [#589](https://github.com/fivvi-app/fivvi/issues/589) |
| **Renew before the end** | The owner sends the renewal before an agreement that stops ends. The **window is set per offer**, default 30 days. A credit pack is also suggested at **2 or fewer** credits left. *Aanbod sturen* is always there. The client gets an email to confirm and pay with iDEAL, and the invoice follows the payment. The new agreement starts when the current one ends (no gap, no overlap) or right after payment | [#468](https://github.com/fivvi-app/fivvi/issues/468) |
| **Offers are made on the Aanbod page** | Web, owner only, also from *+ Nieuw* | [#468](https://github.com/fivvi-app/fivvi/issues/468) |
| **Add, change, remove everything** | Every list (class series, own exercises, templates, offers, trainers) can be added to, changed and removed from. Every removal asks for confirmation | All specs |
| **Trainers see the client's last workout and progress** | In the app and on the web. AI help is post-MVP (`§53`) | F044, F045 |
| **Fixed groups** | Still open: should a client be enrolled in a weekly series? | [SCENARIOS.md](SCENARIOS.md) |

## 7. Assumptions still to confirm

The prototype had to choose something for these. They are **not decided**; each spec asks the owner.

1. **Trainers and balances:** trainers see their clients' credit balances, but no money (`QC12`).
2. ***Aanbod sturen*:** it sends the client a link to confirm and pay.
3. **Changing a series' time:** bookings stay, and the clients get an email.
4. **Renewal reminder:** does Fivvi also email the client itself when the renewal window opens, or only when the owner sends the offer? (#468, question 2)
5. **Duo sessions:**
   - each client uses one of their own privécredits;
   - the trainer plans it, and clients don't book a duo themselves;
   - two clients, or up to three (#586).
6. **Levels:**
   - a fixed list of four;
   - information only;
   - set on the series and changeable per date (#587).
7. **Wording:** a fixed list of four words, and the internal role stays *trainer* (#588).
8. **Trainers page:**
   - a workspace may have more than one owner;
   - the handover covers the next 2 weeks.
9. **Exercise reordering in the logger:** flow 05 planned it for 1.1, and the prototype has it now. In the MVP or not?

## 8. What this changes in existing documents

| Document | What changes | Resolved in |
|---|---|---|
| [ADR-003](../../decisions/ADR-003-native-mobile-apps.md) | iOS minimum 17.0 → **26** | [ADR-029](../../decisions/ADR-029-design-v2.md) (this PR) |
| [ADR-015](../../decisions/ADR-015-ui-foundation.md), [`visual-direction.md`](../visual-direction.md), [`packages/design-tokens`](../../../packages/design-tokens/README.md) | The v1 palette (muted violet) and look are replaced by [§2](#2-platforms-and-visual-direction). The token values change in the package | ADR-029; `visual-direction.md` (this PR); the token change is the Design v2 foundation spec [#590](https://github.com/fivvi-app/fivvi/issues/590) |
| [Flow 02](../flows/02-trainer-today.md), Vandaag | Summary and layout as in [§3](#3-fivvi-pro-ios-and-android): no rings, the *Mijn dag* card, lanes for the whole studio | F013 [#457](https://github.com/fivvi-app/fivvi/issues/457) |
| [Flow 05](../flows/05-live-workout-logging.md), WL-02 | Difficulty as an emoji with (i), not "the word is the answer". Compact set rows. Swipe to delete sets. Exercise reordering (see [§7](#7-assumptions-still-to-confirm) 9) | F043, F044 specs (to write) |
| [IA §5.2](../information-architecture.md#52-platform-conventions-both-apps) | Android "no swipe actions by default" now has one exception: swipe to delete a set in the logger (with confirmation) | F043 spec (to write) |
| TD-05, class descriptions | Descriptions can be entered in the app's new-class form, not only on the web | F021 [#427](https://github.com/fivvi-app/fivvi/issues/427) |
| [IA §3.2](../information-architecture.md#32-role--navigation) | New owner page *Aanbod*. Trainers page: change role, remove with a handover, withdraw an invitation | F052 [#468](https://github.com/fivvi-app/fivvi/issues/468); F003/F004 follow-up in [#590](https://github.com/fivvi-app/fivvi/issues/590) |
| [`GLOSSARY.md`](../../../GLOSSARY.md), [`packages/i18n/GLOSSARY.md`](../../../packages/i18n/GLOSSARY.md) | "Always *trainer*" becomes the workspace's chosen word | [#588](https://github.com/fivvi-app/fivvi/issues/588) |
| [IA §7](../information-architecture.md#7-client-web), client web | The client web uses the app's design language ([§5](#5-client-web-adr-026)) | F027 [#489](https://github.com/fivvi-app/fivvi/issues/489), F033 [#497](https://github.com/fivvi-app/fivvi/issues/497) |
