# Design: information architecture and critical flows

Low-fidelity UX for the MVP (roadmap task **M0 / §4.2**). Everything here is written **Dutch first**, then English.

| | |
|---|---|
| **Status** | Draft for validation with the pilot owner (Gate G0) |
| **Date** | 22 September 2026 |
| **Requirements** | [`PRODUCT.md`](../product/PRODUCT.md) |
| **Sequencing** | [`ROADMAP.md §4.2`](../product/ROADMAP.md#42-ux-design) |
| **Feature IDs** | [`FEATURES.md`](../product/FEATURES.md) |

> **Scope.** This task covers IA, wireframes and copy only. The clickable prototype and the design tokens are separate §4.2 tasks. Nothing here changes a requirement. Where a wireframe had to assume something that `PRODUCT.md` leaves open, the assumption is marked **⚑** and linked to [open-questions.md](open-questions.md).

## Contents

| Document | What it covers |
|---|---|
| [information-architecture.md](information-architecture.md) | Surfaces, roles and permissions, sitemaps for trainer web, trainer iOS/Android, public booking and client web, emails, cross-cutting patterns, screen inventory |
| [flows/01-public-booking.md](flows/01-public-booking.md) | QR → class → name/email → verify → confirmed → optional account (phone) |
| [flows/02-trainer-today.md](flows/02-trainer-today.md) | Trainer "Vandaag" on iOS and Android |
| [flows/03-workspace-calendar.md](flows/03-workspace-calendar.md) | Workspace calendar on web (owner view) |
| [flows/04-private-session.md](flows/04-private-session.md) | Create and reschedule a private session, with location inference |
| [flows/05-live-workout-logging.md](flows/05-live-workout-logging.md) | Live workout logging with previous values |
| [flows/06-class-occurrence.md](flows/06-class-occurrence.md) | Manage a class occurrence: substitution, cancellation, attendance |
| [open-questions.md](open-questions.md) | Questions to validate with the pilot owner, plus spec gaps for the product owner |

## How to read the flow documents

Every flow document uses the same structure:

1. **Goal and actors**: who does this, on which surface, and why it's critical.
2. **Features**: the `F0xx` IDs the flow touches.
3. **Flow diagram**: Mermaid, including the unhappy paths.
4. **Screens**: one section per screen, each with a screen ID, the feature IDs, an ASCII wireframe **in Dutch**, and a copy table (**NL | EN**).
5. **States**: loading, empty, error and offline for each screen.
6. **Edge cases**: timezone/DST, capacity, hold expiry, verification failure, permissions and concurrency, as far as they apply.
7. **Platform notes**: iOS HIG vs Material 3 (or mobile web specifics for browser-only flows).
8. **Open questions**: links into [open-questions.md](open-questions.md).

### Screen IDs

Screen IDs are stable references for spec issues, tests and the prototype. Keep them when you change a screen.

| Prefix | Area | Defined in |
|---|---|---|
| `PB-xx` | Public booking web | flow 01 |
| `CW-xx` | Client web | flow 01 + IA |
| `EM-xx` | Transactional emails | IA §8 (and the flows that trigger them) |
| `TD-xx` | Trainer "Vandaag" and session detail, mobile | flow 02 |
| `WC-xx` | Workspace dashboard and calendar, web | flow 03 |
| `PS-xx` | Private session create/reschedule (web + mobile) | flow 04 |
| `WL-xx` | Workout logging (mobile + web) | flow 05 |
| `CO-xx` | Class occurrence management (web + mobile) | flow 06 |

### Wireframe notation

Wireframes are deliberately rough. They show **content, hierarchy and actions**, not layout details, colours or final spacing.

```text
[ Boeken ]          primary button          ( ) Optie        radio option
[ Terug ]           secondary button        [x] Optie        checkbox / toggle on
‹  ›                back / previous-next    ▾                dropdown / picker
───────             divider / list row      ☰  ⋯             menu / more actions
▓▓▓▓▓               loading skeleton        ● ○              selected / unselected segment
⟳                   refresh / syncing       ✓  ✕             done / no, remove
```

- Mobile frames are about 40 characters wide (a 375 pt / 360 dp phone). Web frames are wider.
- Names and data in wireframes are fictional sample data from `PRODUCT.md` (John's Gym, Sarah, Anna, TrainMore Zuid …).
- **User content is never translated** (`PRODUCT.md §3`). Class names like "Strength" stay as entered in both the NL and the EN copy.

### Copy conventions

- The **Dutch copy is the source**. The English copy is a translation of the same intent, not a separate text.
- Tone: informal **"je"**, friendly and short (`ROADMAP.md §10`). No exclamation marks in errors. Say what happened and what to do next.
- Never show technical words to users: no "magic link", "token", "occurrence", "workspace ID" or "pending_verification".
- Dates and times follow the formats in [information-architecture.md §9.3](information-architecture.md#93-dates-times-and-numbers). The Dutch examples use `22 september 2026` and `18:00`.
- Plurals are written as ICU MessageFormat where they matter, e.g. `{count, plural, one {# plek} other {# plekken}} beschikbaar`.
- Copy in these documents is **proposed copy**. It goes into `packages/i18n/{nl-NL,en}.json` when the feature is built and passes the local copy review against `packages/i18n/GLOSSARY.md`.

### Terminology

[`packages/i18n/GLOSSARY.md`](../../packages/i18n/GLOSSARY.md) is the approved terminology and copy guide. [Information architecture §10](information-architecture.md#10-terminology-used-in-these-documents) maps the terms used here. The glossary's ⚠️ terms remain subject to pilot validation; [open-questions.md](open-questions.md) tracks the related UX decisions.

## What happens next

1. Walk the pilot owner through the six flows and [open-questions.md](open-questions.md) (ideally during the shadow day, `ROADMAP.md §4.1`).
2. Record the answers in `open-questions.md`, update the affected screens, and move the resolved terms into the glossaries: the meaning into the root `GLOSSARY.md`, the NL/EN wording into `packages/i18n/GLOSSARY.md`.
3. The clickable-prototype task builds on these screen IDs and copy.
4. Each spec issue lists the screens it implements under **UX** (`docs/agents/issue-tracker.md`).
