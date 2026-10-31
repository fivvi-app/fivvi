# ADR-027: A cron every 5 minutes

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-31 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | Amends ADR-010 (daily-only cron); `PRODUCT.md` §23 (waitlist), §51; `ROADMAP.md` M4, M5; ADR-006, ADR-011, ADR-026; E012, F062 |

## Context

ADR-010 designed the system to need no job runner: holds expired lazily, and one **daily** cron did the tidying, the recurrence horizon and the retention jobs. ADR-026 removes holds, so the lazy expiry goes with them.

The waitlist (F062) brings a time-driven need that no request triggers. At the **waitlist closing time** (minutes before the class starts; default 30, `PRODUCT.md` §23) nobody moves up any more, and every client still waiting gets a "you didn't get in" email. Nothing a person does happens at that moment, so the email needs a timer. A daily cron cannot do it: classes start at any time of the day.

ADR-010 named this case: "Add a queue (e.g. the Inngest free tier) only when a real need appears, such as reminders at exact times." This is a small version of it. A job that runs every few minutes is enough, and the cron service already exists (ADR-011).

Railway's cron jobs run a service's start command on a UTC schedule. Its documentation says "Scheduled runs must be at least 5 minutes apart in UTC", and that "if a previous execution is still running when the next scheduled execution is due, Railway will skip the new cron job" (checked on 31 October 2026 at [docs.railway.com/reference/cron-jobs](https://docs.railway.com/reference/cron-jobs); ADR-011 recorded the same limit). So the shortest interval is **5 minutes**.

## Decision

- **The cron job runs every 5 minutes** on Railway (`*/5 * * * *`, UTC). It replaces the single daily run (`0 3 * * *`). Railway's 5-minute minimum is the shortest interval it allows.
- **Every run is idempotent** (safe to run twice, late or overlapping: Railway skips a run while the previous one is still going, and a skipped run is picked up by the next) and goes through the explicitly privileged path of ADR-010 and ADR-006. Failures go to Sentry (ADR-013).
- **The frequent work** is what depends on the clock: today the waitlist's closing time (for each class whose closing time has passed, close its waitlist and send the "you didn't get in" email to everyone still waiting, once). The work looks for what is due, so a late or missed run only delays it.
- **The daily work stays daily**: the recurrence horizon, the retention jobs and the other ADR-010 jobs. The same job runs them at most once a day: each daily task records its last successful run and starts only when that run is more than a day old (and, by default, after 03:00 UTC). A separate daily cron service is the alternative if this ever gets awkward; it costs a second service for no gain today.
- **Capacity and the waitlist's order stay correct without the cron.** Moving a client up happens in the request that frees the spot (a cancellation, a removal, a capacity change), in the same transaction. The cron only does what no request can: the closing-time email.
- Emails are still sent inline with a short retry (ADR-010); the cron sends them the same way.
- No queue service for now. If reminders at exact times (a 1.1 candidate) or email volume need more than a 5-minute grain, ADR-010's queue decision comes back.

## Consequences

- **Positive:** the "you didn't get in" email arrives **within 5 minutes** of the waitlist closing time, with no new service.
- **Positive:** the same job can serve other near-time needs later (session reminders to within 5 minutes).
- **Negative:** the cron service runs 288 times a day instead of once. A run that finds nothing due exits in seconds, and Railway bills a cron service only while it runs, so the cost on the free tier and on Hobby is small. Check the usage in the first weeks (ENVIRONMENTS.md, §12 of the roadmap).
- **Negative:** the daily tasks need their own last-run record, so a missed day is not silently skipped and a double run is harmless.
- **Negative:** a long run delays the next one (Railway skips it). Keep a run short; the daily work is the longest part.
- **Follow-ups:** E012 builds the job and its schedule in M4/M5 (`.railway/railway.ts` and `ENVIRONMENTS.md` change with it); F062 adds the closing-time task. ADR-010 gets a note that points here.

## Alternatives considered

| Option | Why not |
|---|---|
| A queue service (Inngest free tier) with a delayed job per class | A new service to host, monitor and keep in step with the database for one email. ADR-010 reserves it for a need a 5-minute cron cannot meet |
| No timer: no "you didn't get in" email, the client only sees it in Fivvi | The owner's pilot gym wants the message; a client who waits for an email that never comes shows up for nothing |
| A second, daily cron service next to a 5-minute one | Two services for jobs that can share a run with a last-run check |
| Send it at the next request that touches the class | There may be none: the class is full and nobody opens it |

## References

- [Railway cron jobs](https://docs.railway.com/reference/cron-jobs): minimum interval 5 minutes, UTC, a run is skipped while the previous one is still running
- ADR-010 *Background jobs*, ADR-011 *Hosting and environments*, ADR-026 *Clients sign in and are approved to book*
- `PRODUCT.md` §23 *Waitlist*
