# Fivvi prototype v2

A throwaway, clickable prototype of the new look (November 2026): Calendar-style base with Fitness and Health details, Liquid Glass on iOS, Material 3 on Android, shadcn/ui on the web. It answers "what should Fivvi look like, and does the flow work?" before the native and web builds. Fictional data only.

| Round | What | Panel |
|---|---|---|
| 1 | Fivvi Pro on iOS and Android: Vandaag, Agenda, Klanten, Profiel, sessions, classes, the workout logger | Scherm → iOS / Android |
| 2 | Trainer web: dashboard, agenda (week, day per trainer, list), clients and join requests, client profile, classes with waitlist, workouts, trainers, join link and QR, settings | Scherm → Trainer web |
| 3 | Client web (ADR-026), in the same design language as Fivvi Pro: join through the link, wait for approval, timetable, booking, waitlist, my schedule, profile and balance, a shared workout | Scherm → Klantweb |
| 4 | Owner decisions of 5 November 2026: duo sessions (#586), class levels (#587), the workspace's own word for trainers (#588) | Index → Duosessie; Opzet → Pilatesstudio; Trainer web → Instellingen |
| 4b | Renewing before the end: the owner gets "Verlengen" on an agreement that stops within its offer's renewal window (default 30 days, set per offer), a credit pack with 2 or fewer left, or one that ended; "Aanbod sturen" is always there (owner input for F052, #468) | Klantprofiel (Lisa, Bram, Mark), app and trainer web |
| 4c | Aanbod (F052, §90): the workspace's offers by kind with an on/off switch, the three default plans (off until priced), and "Nieuw aanbod" with the fields of each kind, including the renewal window | Trainer web → Aanbod |
| 4d | Connecting payments (#466): the owner's steps, what stays locked for clients, the client's payment; recording a payment outside Fivvi and studios without Mollie (#606) | Index → *Betalingen*, *Betaling*, *Betalen*, *Studio zonder Mollie* |
| 5 | The client app Fivvi (§55): Home, Boeken, Activiteit, Profiel on iOS and Android, the studio switcher for a client of more than one studio, and doing a shared workout on your own (#602); joining by link, offers on the web in a browser sheet, account deletion | App → Fivvi (klant); index → Fivvi (klant-app) |
| 6 | Everything the specs describe: agreements, payments, payouts, invoices, membership rules, invitations, joining, privacy, import, booking links and QR, class and trainer dialogs, every client booking and cancelling state, all emails (`more-web.js`, `more-client.js`, `more-pro.js`, `more-email.js`) | Scherm → all; E-mails |
| 7 | Workout templates on the phone (F041): Profiel → Schema's, a template, Nieuw schema / Schema wijzigen with the exercise picker, delete | App → Profiel |
| 8 | Assigning workouts (F042): a client's own templates on the client profile, a template per private or duo session that opens directly, trainer only | App → Klantprofiel, Sessie; Trainer web → Klantprofiel → Trainingen, Agenda |

**What was decided:** [DECISIONS.md](DECISIONS.md) (ADR-029). It is the record specs follow.

Screens have a dashed **Prototype · Andere situaties** list: what can also happen on that screen, one click away. It is not part of the product. Emails live in the panel; their buttons lead where the real link leads.

The ⚙ panel also switches language (NL/EN), accent, light/dark, glass, role, and the business setup (gym, solo PT, PT with small groups, pilates, yoga). [SCENARIOS.md](SCENARIOS.md) checks those setups against the spec.

**Run it:** open `index.html`, or `python3 -m http.server` in this folder. No build step.

| File | What |
|---|---|
| `index.html` | The board: panel and device |
| `styles.css` | App styles (iOS and Android) |
| `web.css` | Trainer web and client web styles |
| `data.js` | Fictional data and the scenario setups |
| `app.js` | The app: state, screens, logger, panel |
| `web.js` | Trainer web and client web |
| `i18n.js` | English on top of the Dutch screens (the real apps use `packages/i18n`) |

Decisions the owner made while reviewing it are listed in the commit history of this branch; they move into the design tokens, the flow docs and the specs once the prototype is final.
