# ADR-010: Background jobs

| | |
|---|---|
| **Status** | Accepted (2026-09-22); the hold expiry ends with [ADR-026](ADR-026-clients-sign-in-and-are-approved-to-book.md) and the daily-only cron is amended by [ADR-027](ADR-027-a-cron-every-5-minutes.md) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §20, §24, §79; ROADMAP.md M4, M5, M9; ADR-009, ADR-011, ADR-012; E012, E014, F022, F029 |

## Context

Several things happen over time:

- booking holds expire after 10–15 minutes (`PRODUCT.md §24`);
- recurring classes need occurrences materialized ahead of time (ADR-012);
- emails must be sent reliably;
- retention jobs clean up data (E014, §79).

A job runner or queue is another service to host, monitor and pay for. On free tiers, scheduled execution is limited (for example, daily-only cron on some hosts).

## Decision

**Design the system so it doesn't need a job runner in MVP:**

- **Holds expire lazily.** A hold stores `expires_at`. Capacity reads count only holds that haven't expired, so a spot frees up the moment the hold expires, with no timer. A daily cron marks expired holds as `expired` for tidiness.
- **Recurrence** is materialized by a **daily cron** for a rolling horizon, and **on demand** when a class or its rule is edited.
- **Emails are sent inline** in the request, with a short retry. Failures are logged to Sentry (ADR-013).
- **Retention jobs** (E014) run in the same daily cron.
- All cron work is **idempotent** (safe to run twice or late), and runs through an explicitly privileged path (ADR-006).
- Add a queue (e.g. the Inngest free tier) **only when a real need appears**, such as reminders at exact times or email volume that makes inline sending slow.

> **Amended (31 October 2026, both Proposed):** [ADR-026](ADR-026-clients-sign-in-and-are-approved-to-book.md) removes booking holds, so the lazy hold expiry and the hold cleanup no longer apply. [ADR-027](ADR-027-a-cron-every-5-minutes.md) runs the cron job every 5 minutes for the waitlist's closing-time email; the daily work stays daily. The rest of this ADR stands.

## Consequences

- **Positive:** no extra service; works within daily-only cron limits on free hosting.
- **Positive:** correctness doesn't depend on the cron: capacity stays correct even if a cron run is late or missed.
- **Negative:** inline email adds latency to the request, and a provider outage fails the send after retries. Accepted for MVP; the user can always request a new sign-in or verification email.
- **Negative:** time-precise jobs (e.g. 24-hour reminders, a 1.1 candidate) are not possible with daily cron alone; they trigger the queue decision.
- **Follow-ups:** E012 in M4; the cron host is set by ADR-011.

## Alternatives considered

| Option | Why not (now) |
|---|---|
| Job queue from day one (Inngest, Trigger.dev, BullMQ + Redis) | Extra service and cost with no MVP need |
| Postgres-backed queue (pg-boss, Graphile Worker) | Needs an always-running worker process; revisit if the host makes that cheap |
| Per-hold timers | Fragile across deploys and restarts; lazy expiry is simpler and always correct |

## References

- `PRODUCT.md §24` Temporary booking hold, `§20` Recurring classes
