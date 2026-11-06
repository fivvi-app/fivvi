# Scenarios: which businesses does Fivvi cover?

The prototype's panel has five setups (⚙ → **Opzet**). Each is a fictional business with its own day. This page checks what each needs against `docs/product/PRODUCT.md` and the ADRs as of 5 November 2026. Fictional data only.

| Setup | Business | What it runs |
|---|---|---|
| Gym met team | Studio Fit, 4 trainers | Private sessions, group classes, Open Gym; the owner also trains at John's Gym |
| Zelfstandige PT | Sarah Personal Training | Private sessions only, at several gyms, outdoors and at clients' homes |
| PT met small groups | Fit met Sarah | Private sessions plus groups of 3–4 in the park and at a gym |
| Pilatesstudio | Studio Kern, 3 instructors | Reformer classes of 6 (6 reformers), mat classes of 12, private reformer sessions |
| Yogastudio | Yoga Huis, 3 teachers | Classes only (16–20 mats), an occasional workshop |

**Legend:** ✅ covered by the spec · 🟡 partly, with a workaround · ❌ not covered · 📌 the owner decided to build it (5 November 2026), spec to write

## What each needs

| Need | Who needs it | Status | Where, or the gap |
|---|---|---|---|
| Private sessions with one client | Gym, PT, small groups, pilates | ✅ | §15, flow 04 |
| Classes with a capacity | All but the solo PT | ✅ | §21–§23 |
| Waitlist on a full class | Pilates (6 reformers fill fast), yoga | ✅ | F062, §23 (web only for staff; nothing in Fivvi Pro) |
| Several sessions at the same time | Gym (4 trainers), pilates | ✅ | Calendar shows them side by side (prototype: lanes and day columns per trainer) |
| Class description, Dutch and English | All with classes | ✅ | §18 |
| Substitute a trainer | Gym, pilates, yoga | ✅ | F024, CO-02 |
| Memberships, credit packs, single classes | Yoga drop-ins, pilates packs, gym | ✅ | §90–§92, F058 (from M11) |
| Cancellation window | All with classes | ✅ | §93 |
| Clients join by link and are approved | All | ✅ | ADR-026 |
| Workout logging | Gym, PT, small groups | ✅ | §41 (private sessions; unused by yoga, which is fine) |
| Sessions outside one location | Solo PT, small groups | 🟡 | One location at go-live; external gyms, client's home and outdoors come after go-live, still in the MVP (§12) |
| **Duo session** (2 clients, one trainer, logged per person) | PT, pilates | 📌 | Owner: build it. Prototype: a private session with a second client ("Tweede klant"), a Lisa / Eva switch on the session for credits, last time, notes and attendance, and one log per client in the logger |
| **A fixed small group** (the same 3–4 people every week) | Small groups | 🟡 | A weekly class series exists, but clients are not enrolled in the series automatically: each date is booked separately, or added by the trainer (CO-07) |
| **Class level** (beginner, advanced) | Pilates, yoga | 📌 | Owner: build it. Prototype: a level field on the class (Alle niveaus, Beginner, Gemiddeld, Gevorderd), shown as three bars and the word in every list and on the class page |
| **Choosing a spot or a machine** (reformer 3, mat by the window) | Pilates, spinning, yoga | ❌ | Rooms and resources are MVP exclusions (§53). Owner: the client picking their own spot is a feature to keep for after the MVP; stopping double room bookings is admin, not a priority |
| **Two classes needing the same room** | Pilates, yoga, gym | ❌ | Rooms are excluded (§53); nothing stops two reformer classes at the same time. Today the owner avoids it by hand |
| **Workshop with its own price** | Yoga | 🟡 | A single class (F058) with its own offer may cover it; a different price per class is not described |
| **Instructor or teacher instead of trainer** | Pilates, yoga | 📌 | Owner: build it. Prototype: Instellingen → Algemeen → Woordkeuze (trainer, instructeur, docent, coach); the whole workspace then uses that word. Pilates opens as *instructeur*, yoga as *docent* |
| **Mat or equipment rental** | Yoga | ❌ | Not in the MVP; usually free or paid at the desk |

## What the prototype now shows

- **The UI never assumes an offering.** No Open Gym figures, button or nav item without Open Gym, no session-type label when there is only one kind, no studio view without a team.
- **Parallel sessions.** The studio view in the app has a lane per trainer and names the busiest moment; trainer web's day view has a column per trainer.
- **Waitlist.** Trainer web shows it on the class (in order, with remove); the client web lets a client join it and shows their number.

## Owner decisions (5 November 2026)

1. **Duo sessions: build them.** Two clients, one trainer, each with their own workout, credit and attendance. Spec: [#586](https://github.com/fivvi-app/fivvi/issues/586).
2. **Class levels: build them.** A level field on the class instead of the level in the name. Spec: [#587](https://github.com/fivvi-app/fivvi/issues/587).
3. **The client picks a spot (a reformer, a mat, a bike): later.** A feature for after the MVP, possibly for several kinds of class. Stopping two classes from booking one room is admin and not a priority. Idea: [#589](https://github.com/fivvi-app/fivvi/issues/589).
4. **The workspace's own word for trainers: build it.** Trainer, instructeur, docent or coach, chosen per workspace. Spec: [#588](https://github.com/fivvi-app/fivvi/issues/588).

Still open: **fixed groups** (should a client be enrolled in a weekly series, booked every week until they stop?).

## Assumptions in the prototype, to settle in the specs

- **Duo:** each client uses one of their own privécredits; the trainer plans it (clients don't book duos themselves); the client sees "Duosessie, samen met Noor" and only their own workout.
- **Levels:** a fixed list of four, information only (a level doesn't stop anyone from booking), set on the class and changeable per date.
- **Wording:** a fixed list of four words, so Dutch and English plurals stay right; the internal role stays *trainer*.
