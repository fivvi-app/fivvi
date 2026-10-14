# Clickable prototype

Open [index.html](index.html) directly in a browser. No build, account, backend, or installation is needed. The published link is placed in the PR description. The landing page links all seven flows; `#flow1` through `#flow7` open a flow directly (also when the hash changes on an open page). *Ik ben* on the landing page switches the app between Sarah (trainer in three workspaces, owner of her own business) and John (owner of John's Gym).

| Flow | Starting surface | Key interaction |
|---|---|---|
| 1. Public booking | Phone web | Pick a day in the 3-week date strip, choose Strength or Open Gym, enter name/email, optionally change the email during the hold, open simulated email, confirm, manage or cancel the booking, optionally create an account |
| 2. Trainer Today | iOS or Android style | Sarah's or John's day across their workspaces, session detail, notes and capacity; the Klanten tab with client profiles; the Agenda tab with week and month views |
| 3. Workspace calendar | Owner web | John's Gym day and week time grids (06:00–22:00, compact density), trainer filter, click an empty moment to add; create a private session, group class (optionally weekly), Open Gym or client from + Nieuw; add a client inline while creating a session |
| 4. Private session | Sarah Personal Training web; optional app variant | Plan Mark for 30 September at 07:30, then move his session to 1 October at 07:30 and choose “Bij Mark thuis” |
| 5. Workout logging | iOS or Android style | *Zonder schema*: Koen with nothing planned; start empty, repeat his previous workout or pick a template, add library or custom exercises, tick prefilled sets, save as template. *Met schema*: Mark's Upper A with previous values, internal note, then optional review and sharing of a separate client message; inspect the simulated email and client profile |
| 6. Class occurrence | Owner web; optional app attendance variant | Substitute Sarah on the Tuesday Strength class, cancel only the Thursday 19:00 class, and mark attendance |
| 7. Add new in the app | iOS or Android style | **+** by role: private session and client for everyone; group class (optionally weekly) and Open Gym for owners/admins; the Klanten tab, a client profile and *Nu training starten* without a planned session |

The demo date is 22 September 2026, 08:40 Amsterdam time. The weekly timetable and regular clients repeat for four more weeks, so trainers and clients can look ahead. All data is fictional and held in browser memory. “Demo opnieuw beginnen” resets it between participants. Verification email, workout sharing, links, notifications, and local sync are simulated; nothing is sent. The email and client-profile screens are previews; production access requires client authentication. A choice of iOS or Android changes the app shell for flow testing. The NL/EN toggle keeps the current step. Group classes and Open Gym can be created in the owner calendar and, for owners/admins, from **+** in the app; trainers in another owner's workspace can create only their own private sessions and clients under the current permission model. Flows 4 (app), 5 and 6 (app) switch the app to Sarah because their sample sessions are hers.

Copy in [strings.js](strings.js) is **prototype-only**. It must not be copied into `packages/i18n/{nl-NL,en}.json`; feature implementation creates and reviews production strings against [`GLOSSARY.md`](../../../packages/i18n/GLOSSARY.md).

## Owner-feedback refinement (13 October 2026)

Light is the default, including on a dark OS. **Weergave / Appearance** offers explicit Light/Dark choices; appearance is held only in memory and resets on reload. Switching it keeps the flow, scroll position, open disclosures, form drafts and logged sets. The existing iOS/Android control remains the only platform switch.

The hub uses icon-led flow tiles with direct alternate entry points; instructions and persona explanations live under the flow guide. Today puts the next client, time, location and workout action first. Session types use visible localized plain-text chips: **Privé / Private**, **Groepsles / Group class**, and **Open Gym**, including agenda rows, booking, details and creation menus. Compact capacity numbers retain full programmatic labels. Workspace context, attendance, contact information and trainer-only notes remain reachable in named disclosures. Notes keep their visibility label when opened. Booking keeps its privacy and verification warnings; workout sharing still requires a separate client-message review.

iOS uses a large title, inset grouped rows, a restrained pill action and a rounded tab bar. Android moves the day overview into the content under its app bar, uses tonal/elevated cards, an active-icon navigation indicator and an anchored FAB. In short landscape logging, large controls sit beside the scrollable set table instead of obscuring it.

The latest owner follow-up adds warmth without another redesign: mostly neutral surfaces and navigation, soft blue/lavender/amber text chips, and one muted violet primary-action accent. Optional dark keeps low-glare neutral layers and subdued chip fills. Body, names, time labels and controls use 400/500; genuine headings and numeric results use 600. Logger sizes and touch targets are unchanged. Two sparse decorative emoji accents greet Today and accompany the workout action; they come from both prototype catalogs and are hidden from assistive technology. The redundant countdown and workout-template line leave room for essential visible type labels without relaxing the Today word budget. The semantic source is regenerated into CSS, not hand-edited. This local refinement does not update the shared deployment.

Measured locally at **390 × 844**, Dutch, Sarah, fresh flow, dark OS, excluding the prototype toolbar:

| Screen | Before: viewport words | After: viewport words | Before / after whole `innerText` words |
|---|---:|---:|---:|
| Hub | 142 | 51 | 331 / 62 |
| Today, iOS | 59 | 42 | 74 / 48 |
| Today, Android | — | 35 | — / 49 |

The table records the earlier hierarchy refinement, before the latest warmth pass. The baseline is commit `31ff918`; the current smoke checks still enforce at most 44 viewport words on Today in both platforms/locales. Viewport counts use word-range rectangles and hit testing, excluding closed disclosures, clipped/covered text and offscreen content. Whole `innerText` counts are supplementary, **not** viewport measurements (they can include accessible-only labels). The reduction comes from less repeated copy and deliberate disclosure, not removing flow capability. Both appearances use the same hierarchy.

## Owner phone-test findings (14 October 2026)

- **Session types:** every Private / Group class / Open Gym marker shows a decorative emoji beside its label (👤 Privé, 👥 Groepsles, 🏋️ Open Gym), everywhere, including owner calendar blocks. The emoji is hidden from assistive technology; the label stays the name. In narrow blocks the label truncates first. This replaces the earlier rule that emoji never identify session types.
- **+ menu:** every row has the same marker pill and chevron; Client uses a neutral pill. Hover fills apply only to fine hover pointers, so a tap no longer leaves a grey row.
- **Booking list:** the date strip shows one dot per class on every day, today included, and names today *Vandaag*. Rows show start time and duration (*07:00 · 1 uur*); detail headers and the booking summary keep the full range. Each class shows its Dutch description as one line (in full on the form, never translated). A class without a trainer says *Trainer volgt nog*.
- **Hold and manage:** *Ander e-mailadres gebruiken* keeps the same hold and countdown, sends the link to the new address and invalidates the earlier one. Demo-only buttons sit in their own group. The confirmation offers *Beheer je boeking*: cancel with a confirm step until the class starts; the spot is freed everywhere.
- **Workouts:** the logger header shows a running timer; the finish screen adds a *Duur* tile. *Add exercise* starts with a *Nieuwe oefening* row; created exercises appear under *Jouw oefeningen*.
- Packages stay outside the MVP; no UI change.

## Checks

Run `node docs/design/prototype/gen-tokens.mjs --check` to verify the selected light/dark WCAG contrast pairs. Run `node docs/design/prototype/gen-tokens.mjs` after changing `tokens.draft.json` to regenerate the committed CSS. With Playwright available, `node --test docs/design/prototype/smoke.test.cjs` checks the local file in Chrome; set `PROTO_URL` to check a deployment. Use the [validation script](../../discovery/prototype-validation-script.md) with the owner and another trainer; the prototype itself does not complete that pilot validation.

For this worktree: `NODE_PATH="$PWD/node_modules/.pnpm/playwright@1.63.0/node_modules" node --test docs/design/prototype/smoke.test.cjs`. The 48 smoke checks preserve the previous 37 and add 11 for the phone-test findings. Only the type-marker expectations changed: chips now pair an emoji with their label, and text budgets skip those emoji because they are pictographs, not words. Time-dependent checks (hold countdown, workout timer) use Playwright's fixed clock. Earlier, 34 checks preserved the previous 31 (updating only superseded palette/type-icon expectations) and added localized visible type labels, computed typography priorities, and sparse accessible decoration. They cover light-on-dark-OS defaults, theme/state preservation, native-style composition, unchanged text budgets, disclosures, booking capacity/privacy, numeric workout results, the restrained accent palette, and 340 px, short-phone, landscape and desktop form/logger safety. The token check covers 29 pairs in each appearance, including text on the Material next-session tonal surface.
