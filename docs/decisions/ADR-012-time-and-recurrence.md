# ADR-012: Time and recurrence model

| | |
|---|---|
| **Status** | Accepted (2026-09-22) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §3 (Date/time formatting), §18–20, §43; ROADMAP.md M4, §13 (R2); TESTING.md §4.3; ADR-005, ADR-010; F022, F024, F025, E012 |

## Context

"Every Tuesday 18:00" (`PRODUCT.md §20`) must stay 18:00 in Amsterdam across the daylight-saving changes (last Sunday of March and October). Each occurrence of a class needs its **own** trainer (substitution), capacity, bookings, attendance and status (§20). The spec says to store canonical timestamps and render in the workspace/user time zone, never baking a time zone into stored values (§3). DST bugs in recurring classes are a known high-impact risk (R2).

## Decision

- All instants are stored as **UTC `timestamptz`**.
- Workspaces and locations carry an **IANA time zone** (default `Europe/Amsterdam`).
- A recurring class stores its rule as an **RRULE in local wall-clock time**, plus its time zone (e.g. `FREQ=WEEKLY;BYDAY=TU` at 18:00 `Europe/Amsterdam`), not as a UTC time.
- **Occurrences are materialized as rows** for a rolling horizon (e.g. 12 weeks). Each occurrence has its own trainer, capacity, status, bookings and attendance. The horizon is extended by the daily cron and on edit (ADR-010).
- Editing is explicit: **this occurrence only** vs. **this and following**. Occurrences that were changed individually, or that have bookings, are not silently regenerated.
- Recurrence expansion lives in `packages/domain` as a pure function; clients never expand rules.
- Rendering uses the platform's locale APIs with the workspace/user time zone (nl-NL: `22 september 2026`, `18:00`).

## Consequences

- **Positive:** DST-correct: the local wall-clock time is kept, and UTC offsets are computed per occurrence.
- **Positive:** occurrences are ordinary rows, so bookings, capacity locks, substitution and attendance work the same for one-off and recurring sessions (one scheduling engine, `ROADMAP.md` M4).
- **Negative:** materialization needs upkeep (horizon extension, regeneration after rule edits without clobbering edited occurrences). Covered by domain tests.
- **Negative:** bookings further ahead than the horizon aren't possible until it is extended. 12 weeks is ample for the pilot.
- **Follow-ups:** DST fixtures and near-midnight tests (`TESTING.md §4.3`) in M4.

## Alternatives considered

| Option | Why not |
|---|---|
| Expand RRULE on read, no occurrence rows | Nowhere to attach per-occurrence trainer, capacity, bookings and attendance |
| Store the recurring time in UTC | Shifts by one hour at every DST change |
| Materialize all occurrences forever | Unbounded rows; rule edits touch huge sets |
| Local timestamps without time zone | Ambiguous at DST transitions; violates §3 |

## References

- `PRODUCT.md §20` Recurring classes, `§3` Date/time formatting
- RFC 5545 (iCalendar RRULE)
