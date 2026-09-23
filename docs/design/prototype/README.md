# Clickable prototype

Open [index.html](index.html) directly in a browser. No build, account, backend, or installation is needed. The published link is placed in the PR description. The landing page links all seven flows; `#flow1` through `#flow7` open a flow directly (also when the hash changes on an open page). *Ik ben* on the landing page switches the app between Sarah (trainer in three workspaces, owner of her own business) and John (owner of John's Gym).

| Flow | Starting surface | Key interaction |
|---|---|---|
| 1. Public booking | Phone web | Choose Strength or Open Gym, enter name/email, open simulated email, confirm, optionally create an account |
| 2. Trainer Today | iOS or Android style | Sarah's or John's day across their workspaces, session detail, notes and capacity; the Klanten tab with client profiles |
| 3. Workspace calendar | Owner web | John's Gym day and week views; create a private session, group class (optionally weekly), Open Gym or client from + Nieuw; add a client inline while creating a session |
| 4. Private session | Sarah Personal Training web; optional app variant | Plan Mark for 30 September at 07:30, then move his session to 1 October at 07:30 and choose “Bij Mark thuis” |
| 5. Workout logging | iOS or Android style | *Zonder schema*: Koen with nothing planned; start empty, repeat his previous workout or pick a template, add library or custom exercises, tick prefilled sets, save as template. *Met schema*: Mark's Upper A with previous values, internal note, then optional review and sharing of a separate client message; inspect the simulated email and client profile |
| 6. Class occurrence | Owner web; optional app attendance variant | Substitute Sarah on the Tuesday Strength class, cancel only the Thursday 19:00 class, and mark attendance |
| 7. Add new in the app | iOS or Android style | **+** by role: private session and client for everyone; group class (optionally weekly) and Open Gym for owners/admins; the Klanten tab, a client profile and *Nu training starten* without a planned session |

The demo date is 22 September 2026, 08:40 Amsterdam time. All data is fictional and held in browser memory. “Demo opnieuw beginnen” resets it between participants. Verification email, workout sharing, links, notifications, and local sync are simulated; nothing is sent. The email and client-profile screens are previews; production access requires client authentication. A choice of iOS or Android changes the app shell for flow testing. The NL/EN toggle keeps the current step. Group classes and Open Gym can be created in the owner calendar and, for owners/admins, from **+** in the app; trainers in another owner's workspace can create only their own private sessions and clients under the current permission model. Flows 4 (app), 5 and 6 (app) switch the app to Sarah because their sample sessions are hers.

Copy in [strings.js](strings.js) is **prototype-only**. It must not be copied into `packages/i18n/{nl-NL,en}.json`; feature implementation creates and reviews production strings against [`GLOSSARY.md`](../../../packages/i18n/GLOSSARY.md).

## Checks

Run `node docs/design/prototype/gen-tokens.mjs --check` to verify the selected light/dark WCAG contrast pairs. Run `node docs/design/prototype/gen-tokens.mjs` after changing `tokens.draft.json` to regenerate the committed CSS. With Playwright available, `node --test docs/design/prototype/smoke.test.cjs` checks the local file in Chrome; set `PROTO_URL` to check a deployment. Use the [validation script](../../discovery/prototype-validation-script.md) with the owner and another trainer; the prototype itself does not complete that pilot validation.
