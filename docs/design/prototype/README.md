# Clickable prototype

Open [index.html](index.html) directly in a browser. No build, account, backend, or installation is needed. The published link is placed in the PR description. The landing page links all six flows; `#flow1` through `#flow6` open a flow directly.

| Flow | Starting surface | Key interaction |
|---|---|---|
| 1. Public booking | Phone web | Choose Strength or Open Gym, enter name/email, open simulated email, confirm, optionally create an account |
| 2. Trainer Today | iOS or Android style | Sarah's work across her workspaces, session detail, notes and capacity |
| 3. Workspace calendar | Owner web | John's Gym day and week views; create a private session, group class, or Open Gym from + Nieuw |
| 4. Private session | Sarah Personal Training web; optional app variant | Plan Mark for 30 September at 07:30, then move his session to 1 October at 07:30 and choose “Bij Mark thuis” |
| 5. Workout logging | iOS or Android style | Mark's Upper A, previous values, sets, internal note, then optional review and sharing of a separate client message; inspect the simulated email and client profile |
| 6. Class occurrence | Owner web; optional app attendance variant | Substitute Sarah on the Tuesday Strength class, cancel only the Thursday 19:00 class, and mark attendance |

The demo date is 22 September 2026, 08:40 Amsterdam time. All data is fictional and held in browser memory. “Demo opnieuw beginnen” resets it between participants. Verification email, workout sharing, links, notifications, and local sync are simulated; nothing is sent. The email and client-profile screens are previews; production access requires client authentication. A choice of iOS or Android changes the app shell for flow testing. The NL/EN toggle keeps the current step. Group class and Open Gym creation are shown in the owner calendar; trainers in another owner's workspace can create only their own private sessions under the current permission model.

Copy in [strings.js](strings.js) is **prototype-only**. It must not be copied into `packages/i18n/{nl-NL,en}.json`; feature implementation creates and reviews production strings against [`GLOSSARY.md`](../../../packages/i18n/GLOSSARY.md).

## Checks

Run `node docs/design/prototype/gen-tokens.mjs --check` to verify the selected light/dark WCAG contrast pairs. Run `node docs/design/prototype/gen-tokens.mjs` after changing `tokens.draft.json` to regenerate the committed CSS. With Playwright available, `node --test docs/design/prototype/smoke.test.cjs` checks the local file in Chrome; set `PROTO_URL` to check a deployment. Use the [validation script](../../discovery/prototype-validation-script.md) with the owner and another trainer; the prototype itself does not complete that pilot validation.
