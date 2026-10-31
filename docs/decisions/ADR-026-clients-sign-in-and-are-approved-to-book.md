# ADR-026: Clients sign in and are approved to book

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-31 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | Reverses `PRODUCT.md` §23–§26 as written on 23 September 2026 (anonymous booking with a hold and a magic link; a client account at the first booking); `PRODUCT.md` §2.3, §2.4, §21–§27, §30, §32, §33, §51, §95; `ROADMAP.md` M5, M6, M11, v1.30; ADR-007, ADR-010 (amended by ADR-027), ADR-019, ADR-022; F027–F038, F062, F063; `open-questions.md` QE06 |

## Context

Until now a client booked without an account: they chose a class, gave a name and an email, and the spot was **held** for 10–15 minutes while they confirmed the email with a magic link. Their account was created at that first verified booking (`PRODUCT.md` §23–§26, F027–F032). Anyone with a booking link could book, so the booking page was public.

That design has costs:

- **Holds are a moving part.** A hold counts against capacity, expires lazily (ADR-010), needs its own status and abuse protection (a hold can be spammed to block a class, R5), and makes every booking two steps.
- **Anyone can book anywhere.** A link or QR code is a key to the timetable. The workspace does not know who its clients are until they have booked, and cannot keep a stranger out.
- **The email step repeats the sign-in.** ADR-007 already signs people in by email, with a link or a 6-digit code. Booking verified the same email a second way (open question QE06).
- **Memberships and credits (M11) need to know the client** before the booking, not after it: a booking must check the client's agreement.
- The waitlist (F062) needs a signed-in, known client to join a queue and to be booked automatically when a spot frees up.

On 31 October 2026 the owner decided, in a grilling session with the high tier, how clients get in. This ADR records those decisions.

## Decision

Eight rules (owner, 31 October 2026):

1. **Anyone can create a Fivvi account**: with their email now (sign-in by link or 6-digit code, ADR-007), and with Apple and Google later (F063). An account on its own shows **nothing of any workspace**.
2. **Two ways into a workspace as a client.** (a) The workspace **adds** the client: an invitation email, and the client is in once they sign in. (b) The client **asks to join**: they open the workspace's **join link** or scan its QR code, sign in or sign up, and send a **join request**; they see "waiting for the studio" until the Owner decides. There is **no workspace search**, at least for the beginning: a later candidate, not planned.
3. **Only the Owner approves or declines join requests** (there is no Admin role in the MVP). The Owner gets an email for each new request and handles it on the web (a list of requests on Clients). Fivvi Pro gets this later; there is no native surface now. A declined client gets a short, neutral email, sees nothing of the workspace, and may ask again later through the link.
4. **Sign-up is open for accounts, but creating a workspace stays limited** to the current allowlist (`SIGN_UP_ALLOWED_EMAILS`, F001/F002) until Release 2.0 (public SaaS onboarding). An account with no workspace sees "Ask your studio for its link" (wording to confirm in `packages/i18n`).
5. **Nothing is public.** Only approved clients (added or accepted) see a workspace's timetable. The "public booking page" becomes the **client timetable** (F027).
6. **Booking needs a sign-in** and, from M11, an **active agreement that covers the class**: a membership with weekly allowance left, or credits of the matching kind (group, Open Gym). A trial is just an offer (for example an intro credit pack "once per client") and books like any agreement. Before M11 (M5 and M6 are built first), being an approved client of the workspace is enough. Private sessions stay booked by the trainer or owner. A single class (F058, proposed, decision 9) can be bought only by a signed-in approved client. An approved client without an agreement sees the timetable and the workspace's offers and cannot book until they have one (from M11).
7. **No holds and no email verification step.** A booking is immediate. Capacity is still enforced transactionally (R3).
8. **Booking links and QR codes work only for approved clients.** Each workspace has **one join link** (with its QR code for the desk). Class and date links still exist, but only approved clients can use them. The Owner can **renew** the join link (the old one stops working) and **remove** a client.

The rest follows from these rules:

- The join request, the approval and the client relationship are records of ours in the workspace's tenant scope (ADR-006, ADR-022), not Better Auth's. Better Auth keeps the account, the session and the sign-in tokens.
- A sign-in email still has no workspace, so ADR-019's language rule for it stands. A first sign-in may now be a client's.
- Sign-in responses still do not reveal whether an account exists (ADR-007). With open sign-up, rate limits and bot protection (E013) move from the hold form to sign-up, the sign-in request and the join request.
- **F063, Sign in with Apple and Google** (Should, M5), is added: web first (clients and team members), Fivvi Pro after. On iOS, App Store guideline 4.8 requires Sign in with Apple when an app offers Google sign-in. The owner will need an Apple Services ID and a Google OAuth client. It adds a way to sign in; it does not change ADR-007's email sign-in, which stays.

## Consequences

- **Positive:** a booking is one tap, with no hold, no hold expiry, no second email and no half-booked state.
- **Positive:** the workspace knows its clients before they book, can keep a stranger out, and can remove a client.
- **Positive:** the abuse surface is smaller. A stranger cannot hold spots (R5 changes to account and join-request spam), and an unapproved account sees nothing.
- **Positive:** M11 gets its client before the booking, so the agreement check has a place to run, and the waitlist can book the first in line automatically.
- **Negative:** one more step for a new client before the first booking (sign in, request, wait for the Owner). A client who is added by the Owner has no extra step. The Owner now has a list of requests to handle, and a slow Owner delays a client.
- **Negative:** a QR poster alone no longer books a class: it leads to the join link first. The pilot gym's clients are added at import, so this matters for new clients. Open: does the pilot import send invitations to the imported clients, or are they added silently?
- **Negative:** the Owner's email is exposed to join-request mail, so a flood of requests must be rate-limited and capped per account.
- **Follow-ups:** the features are reshaped (F027 Client Timetable, F029 Join Link and Join Requests, F030 Client Sign-Up, F031 Booking for Approved Clients, F032 Client Invitations, F035 Open Gym Booking; F037 and F038 for approved clients and the join link); F029's hold and lazy hold expiry (ADR-010) are gone; new emails (join request to the Owner; declined, on the waitlist, you're in, you didn't get in and skipped to the client). `PRODUCT.md`, `ROADMAP.md` v1.30, `FEATURES.md`, both glossaries and `open-questions.md` follow in the same PR. The wireframes in `docs/design/flows/01-public-booking.md` and the information architecture still show the old flow and are redrawn with the F027 and F029 specs. Retention and observability docs that mention guest bookings and holds follow with the specs.
- **Follow-ups:** the waitlist closing time needs a timer that no request triggers, so the cron job runs every 5 minutes (ADR-027).

## Alternatives considered

| Option | Why not |
|---|---|
| Keep anonymous booking with a hold and a magic link | Keeps the hold, its expiry, its spam risk and a public timetable. Memberships and credits (M11) would still need the client to be known at booking, so the account would be built anyway |
| Signed-in clients skip the verification email only (QE06) | Removes one step for returning clients but keeps anonymous first bookings, holds and a public timetable. Two booking flows to build, test and explain |
| Open timetable, sign-in only to book | A stranger sees the whole timetable and the capacity. The owner wants the workspace's clients to be its own; approval also gives the owner a place to remove a client |
| Workspace search so clients can find a studio | The owner wants it left out at the beginning: it makes every workspace discoverable. It stays a later candidate, not planned |
| Auto-approve a join request from the join link | Anyone with the link, or the QR on a desk, is in. The owner wants to decide who joins |
| Any trainer can approve | Needs a rule for which trainer, and a request would have no clear owner. The Owner decides; an Admin role is a later role |

## References

- `PRODUCT.md` §2.3–§2.4, §21–§27, §30, §32–§33, §51, §95, §96
- `ROADMAP.md` M5, M6, M11, risk R5, v1.30
- ADR-007 *Authentication*, ADR-010 *Background jobs*, ADR-019 *Sign-in communication language*, ADR-022 *Workspaces on our own tables*, ADR-027 *A cron every 5 minutes*
- Apple, *App Store Review Guidelines* 4.8 (Login Services)
