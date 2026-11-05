# Fivvi prototype v2

A throwaway, clickable prototype of the new look (November 2026): Calendar-style base with Fitness and Health details, Liquid Glass on iOS, Material 3 on Android, shadcn/ui on the web. It answers "what should Fivvi look like, and does the flow work?" before the native and web builds. Fictional data only.

| Round | What | Panel |
|---|---|---|
| 1 | Fivvi Pro on iOS and Android: Vandaag, Agenda, Klanten, Profiel, sessions, classes, the workout logger | Scherm → iOS / Android |
| 2 | Trainer web: dashboard, agenda (week, day per trainer, list), clients and join requests, client profile, classes with waitlist, Open Gym, workouts, trainers, join link and QR, settings | Scherm → Trainer web |
| 3 | Client web (ADR-026), in the same design language as Fivvi Pro: join through the link, wait for approval, timetable, booking, waitlist, my schedule, profile and balance, a shared workout | Scherm → Klantweb |
| 4 | Owner decisions of 5 November 2026: duo sessions (#586), class levels (#587), the workspace's own word for trainers (#588) | Index → Duosessie; Opzet → Pilatesstudio; Trainer web → Instellingen |
| 4b | Renewing before the end: the owner gets "Verlengen" on an agreement that stops within its offer's renewal window (default 30 days, set per offer), a credit pack with 2 or fewer left, or one that ended; "Aanbod sturen" is always there (owner input for F052, #468) | Klantprofiel (Lisa, Bram, Mark), app and trainer web |
| 4c | Aanbod (F052, §90): the workspace's offers by kind with an on/off switch, the three default plans (off until priced), and "Nieuw aanbod" with the fields of each kind, including the renewal window | Trainer web → Aanbod |

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
