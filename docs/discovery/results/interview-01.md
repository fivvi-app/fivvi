# Interview 01: the gym owner's tools, money and switching conditions

| | |
|---|---|
| **Date** | 19 October 2026 |
| **With** | The pilot gym owner (T1), who is also a PT and works with other trainers |
| **Source** | The product owner's recollection of the conversation, typed up afterwards. Not a recording or a verbatim transcript; the lines below are paraphrases |
| **Led to** | `ROADMAP.md` v1.19: commerce before go-live (M11); training and notes and location inference after go-live; the identity model in `PRODUCT.md §2.9, §9` |

**Evidence labels:** **R** = reported by T1. **U** = reported, details unclear. **H** = our interpretation. One interview is not a market-wide requirement; a second gym owner is interviewed in M0 (`ROADMAP.md §4.1`, R6).

No client names, bank details, agreements or invoices were shared or recorded.

## 1. What T1 reported

### Tools today
- Two apps, Google Calendar and Word documents, with data typed in by hand (R).
- One app lets group clients book classes, keeps track of their memberships and collects their payments automatically. The app's name is not known yet (U).
- Private training is managed by hand by T1 (R).

### Private training and invoices
- T1 prepares and sends invoices for private training by hand, again and again (R).
- Some clients need an invoice in a company's name; the current app can't do that (R).
- A client may commit to about six months of one private session a week; it is hard to see how many sessions are used and how many are left (R).

### Group classes and memberships
- Clients often choose fixed weekdays (for example Monday and Thursday) and commit for 6 or 12 months, e.g. two classes a week (R).
- A missed class is normally lost. A cancellation made in time, around 12 or 24 hours before (not settled), may give a makeup, but not without limit (U).
- Some clients book and don't come, and don't mind losing the class (R).
- A client with a membership can buy an extra single class in the app (R).
- Whether the group payment is taken per booking, per month or up front is not confirmed (U).

### Calendar and roles
- The calendar is confusing for T1, the trainers and the clients. T1 uses colours to tell private sessions from group classes; not everyone understands them (R).
- A client who only does group classes may see private sessions mixed in with the classes (R).
- Some clients do both private training and group classes and need to see both (R).
- Trainers have to use client access just to see their schedule (R).

### Money, price and switching
- Recurring, automatic payment is important. T1 doesn't want clients to be able to end their membership at any moment (R). Dutch consumer law still applies (H).
- T1 keeps the subscription model mostly because it is the only option in the current app, not because it is the best; T1 is open to a better model (R). Credits came up, suggested by us; T1 didn't rule them out (H).
- The deeper goal is that clients keep coming back regularly (R).
- Price is not the main problem: T1 would pay more if the workflows work well (R). T1 sees Virtuagym as expensive (R, not checked).
- The current app is paid with a subscription plus a fee per client payment (figures in the owner's private notes, not in this repository). Whether the subscription is monthly or yearly, whether VAT is included and whether a provider fee comes on top is not known (U).
- T1 is fine with the money being collected through Trainer Hub and paid out to the gym weekly (R). That doesn't mean Trainer Hub may hold client money (H; ADR-020 proposes the gym as merchant on its own Mollie account, see `PRODUCT.md §94`).
- The current app has a kiosk or pay-at-the-desk option; what it is exactly is not known (U).
- T1 won't replace the current apps with a product that leaves payments behind; a partial product means more work, not less (R).
- T1 is open to the pilot, but moving clients, bookings, memberships and payments is a real burden (R).

## 2. What we concluded (H)

1. The minimum product T1 can switch to includes memberships, private session packs with a trustworthy balance, recurring payments and invoices. A calendar-only pilot isn't a replacement (`PRODUCT.md §2.8`).
2. Team roles and being a client are separate relationships of one account; trainers need team access, never a client account (`PRODUCT.md §2.9, §9`). F001 sign-in doesn't change.
3. A shared scheduling engine isn't enough: each person needs a view filtered to what they may see, with types named in words.
4. A class's recurrence, a membership's term, its payment schedule, attendance and the session balance are separate concepts.
5. The import at go-live must carry active agreements, balances and due dates, and be reconciled with the old app before the cutover, when clients start paying through Trainer Hub. Mandates follow QC09 (default: new mandates), as in `import-checklist.md` §3.4a.

Not shown by this interview: the app names, the real cost, client and trainer counts, the hours spent on invoices, the exact cancellation rules, that credits beat memberships, that Trainer Hub may hold funds, that T1 will move live payments, and that every small gym has the same needs. Workout logging, notes and Open Gym weren't raised as reasons to switch; that doesn't make them unimportant.

## 3. Decisions the product owner took from it (19 October 2026)

| Decision | Where |
|---|---|
| T1 is the pilot owner; the pilot scenario is corrected | `PRODUCT.md §8`, `ROADMAP.md §1` |
| Owner decided: memberships, recurring payments and invoices before go-live, part of G4 (M11); session packs were added on 20 October 2026 (pain point 4). Single classes and payouts stay proposed scope, to confirm when the owner approves the M11 specs | `PRODUCT.md §90–§97`, `ROADMAP.md` M11, decision 9 |
| Recurring payments (the subscription model) and invoices ship together | `ROADMAP.md` decision 10 |
| Training and notes (M7) and automatic location inference (F019) move after go-live | `ROADMAP.md` decision 11 |

## 4. Follow-up

The commerce walkthrough with T1 (`ROADMAP.md §4.1`) answers QC01–QC16 in [`open-questions.md`](../../design/open-questions.md#commerce-interview-01-follow-up). Most valuable first:

- The names of both apps; what the subscription covers; the per-payment fee and any provider fee; the kiosk option (QC11, QC13).
- Counts: trainers, active group clients, private clients, clients doing both; invoices made or edited per month and the time they take; no-show rate.
- A walkthrough, on T1's screen only, of one private invoice and one fixed-weekday membership: booking, no-show, makeup, renewal (QC01–QC08, QC10).
- Whether mandates can move to a new payment provider account (QC09), and what can be exported from the current app (QC14).
- T1's top three dealbreakers for any replacement, and what would make T1 keep using the pilot after 4–6 weeks.

## Owner notes (20 October 2026)

Added by the product owner (a recollection, not a recording):

- **No parallel use.** T1 won't use Trainer Hub next to the old apps. T1 starts using it only when it solves at least the four pain points named in this interview (R):
  1. billing: invoices for private training and recurring payments;
  2. one clear calendar for private sessions and group classes, for the owner, the trainers and the clients;
  3. proper roles: trainers use their own team access, never client access;
  4. tracking prepaid private sessions: used and left.

  These four are the go-live minimum. Session packs follow from the fourth.
- **Start with one location.** The gym starts with its own location only; more locations and the other location types can wait until after go-live.

Decisions taken from these notes: `ROADMAP.md` decisions 6, 9 and 12 (no owner alpha with real data, session packs decided, one location), `PRODUCT.md §2.8`. Decision 13 (no Admin role in the MVP) did not come from the interview notes; the owner took it in his PR review on 2026-10-20.
