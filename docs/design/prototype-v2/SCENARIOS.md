# Scenarios: which businesses does Fivvi cover?

The prototype's panel has five setups (⚙ → **Opzet**). Each is a fictional business with its own day. This page checks what each needs against `docs/product/PRODUCT.md` and the ADRs as of 5 November 2026. Fictional data only.

| Setup | Business | What it runs |
|---|---|---|
| Gym met team | Studio Fit, 4 trainers | Private sessions, group classes, Open Gym; the owner also trains at John's Gym |
| Zelfstandige PT | Sarah Personal Training | Private sessions only, at several gyms, outdoors and at clients' homes |
| PT met small groups | Fit met Sarah | Private sessions plus groups of 3–4 in the park and at a gym |
| Pilatesstudio | Studio Kern, 3 instructors | Reformer classes of 6 (6 reformers), mat classes of 12, private reformer sessions |
| Yogastudio | Yoga Loft, 3 teachers | Classes only (16–20 mats), an occasional workshop |

**Legend:** ✅ covered by the spec · 🟡 partly, with a workaround · ❌ not covered

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
| **Duo or semi-private session** (2 clients, one trainer, logged per person) | PT, pilates | ❌ | A private session has one client. Workaround: a group class with capacity 2, but then there is no workout logging and clients must book it themselves |
| **A fixed small group** (the same 3–4 people every week) | Small groups | 🟡 | A weekly class series exists, but clients are not enrolled in the series automatically: each date is booked separately, or added by the trainer (CO-07) |
| **Class level** (beginner, advanced) | Pilates, yoga | 🟡 | No level field; put it in the name or description ("Reformer Basis") |
| **Choosing a spot or a machine** (reformer 3, mat by the window) | Pilates | ❌ | Rooms and resources are MVP exclusions (§53). Capacity = number of reformers covers the common case |
| **Two classes needing the same room** | Pilates, yoga, gym | ❌ | Rooms are excluded (§53); nothing stops two reformer classes at the same time. Today the owner avoids it by hand |
| **Workshop with its own price** | Yoga | 🟡 | A single class (F058) with its own offer may cover it; a different price per class is not described |
| **Instructor or teacher instead of trainer** | Pilates, yoga | 🟡 | The UI always says *trainer* (`packages/i18n/GLOSSARY.md`). Pilates says *instructeur*, yoga *docent* |
| **Mat or equipment rental** | Yoga | ❌ | Not in the MVP; usually free or paid at the desk |

## What the prototype now shows

- **The UI never assumes an offering.** No Open Gym figures, button or nav item without Open Gym, no session-type label when there is only one kind, no studio view without a team.
- **Parallel sessions.** The studio view in the app has a lane per trainer and names the busiest moment; trainer web's day view has a column per trainer.
- **Waitlist.** Trainer web shows it on the class (in order, with remove); the client web lets a client join it and shows their number.

## Decisions for the owner

1. **Duo / semi-private sessions:** in the MVP, or after? This is the biggest gap for PTs and pilates studios.
2. **Fixed groups:** should a client be enrolled in a weekly series (booked every week until they stop)?
3. **Levels:** a level field on a class, or keep it in the name?
4. **Wording:** keep *trainer* everywhere, or let a workspace choose *instructeur* or *docent*?
