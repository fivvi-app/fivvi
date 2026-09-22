# ADR-013: Observability

| | |
|---|---|
| **Status** | Accepted (2026-09-22) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §79, §85 (Phase J), §87; ROADMAP.md §7, §8, §10, §12; ADR-003; E009 |

## Context

The pilot (M10) is judged on evidence: uptime, crash-free sessions, booking funnel conversion, usage vs. the baseline (`ROADMAP.md §7–8`, `PRODUCT.md §85 J`). 3.2 analytics needs product events captured from MVP onward (`ROADMAP.md §10`). Errors must be visible on web, API, iOS and Android. Privacy rules apply: EU residency, minimal data, no unnecessary profiling (§79), and we don't want a cookie banner on the public booking page.

## Decision

All on **free tiers, EU where available**:

- **Errors and crashes: Sentry** (EU data region) for web, API, iOS and Android.
- **Uptime: UptimeRobot or Better Stack** free checks on the public booking page, the API health endpoint and sign-in.
- **Product events: PostHog EU** in **cookieless mode** (no persistent identifiers in the browser), so no consent banner is needed. Events cover bookings, attendance and logging; the event list lives in `docs/engineering/`.
- **No personal data or note content** in events, error messages or breadcrumbs. Sentry scrubbing is configured; IDs only.

## Consequences

- **Positive:** the pilot metrics in `ROADMAP.md §8` can be measured from day one, and 3.2 has history.
- **Positive:** cookieless analytics keeps the booking flow free of consent friction.
- **Negative:** free quotas (Sentry events and 1 user, PostHog events) can run out (R14). Watch usage; upgrade when hit (§12).
- **Negative:** cookieless mode limits cross-session user journeys in analytics. Accepted: the funnel is measured within a session and server-side.
- **Follow-ups:** E009 in M1; add Sentry and PostHog to the sub-processor list (`ROADMAP.md §4.4`).

## Alternatives considered

| Option | Why not |
|---|---|
| Self-hosted (GlitchTip, Plausible, Umami) | Another service to run and secure; not free in effort |
| Google Analytics | US processing, cookies/consent, profiling concerns |
| Datadog / New Relic | Cost; overkill for the pilot |
| Only host-provided logs | No crash reporting for native apps, no product funnel |

## References

- `PRODUCT.md §85` Phase J (observe usage), `§87` Success criteria
