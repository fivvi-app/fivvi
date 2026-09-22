# ADR-014: Testing

| | |
|---|---|
| **Status** | Accepted (2026-09-22) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §86; ROADMAP.md §10, §13 (R2–R4, R8, R9); TESTING.md; ADR-003, ADR-005, ADR-006; E010, E011 |

## Context

Booking, tenancy and scheduling bugs are the most expensive (R2 DST, R3 overbooking, R4 cross-tenant leaks). The code is written by AI agents, so tests are the main guard against plausible-but-wrong code (R8). Native iOS and Android apps must stay at parity (R9), and every user flow must work in Dutch and English. Correctness depends on real database behaviour (RLS, constraints, locks), which mocks can't prove.

## Decision

| Layer | Tool |
|---|---|
| Domain unit + API integration | **Vitest**, integration tests against **real Postgres** (no DB mocks) |
| Web end-to-end | **Playwright**, every user flow **in NL and EN**, with axe accessibility checks |
| iOS | **XCTest** (unit) and **XCUITest** (UI) |
| Android | **JUnit** (unit) and **Compose UI tests** |
| Cross-platform mobile flows | **Maestro**: the **same flow files** run on iOS and Android, in both locales, as the parity acceptance test |

What to test, where, and what blocks a merge is defined in [`TESTING.md`](../engineering/TESTING.md).

## Consequences

- **Positive:** real Postgres tests prove RLS, capacity locks and migrations, the areas where bugs hurt most.
- **Positive:** one Maestro flow on both platforms turns parity into an executable check.
- **Negative:** real-DB tests need Postgres in CI (a service container) and are slower than mocks; keep most tests at the domain layer.
- **Negative:** mobile UI tests need simulators/emulators; iOS runs on macOS CI minutes, which count 10× (path-filtered, `ROADMAP.md` M1).
- **Follow-ups:** E010 (test infrastructure) in M1; E011 (isolation suite) in M2.

## Alternatives considered

| Option | Why not |
|---|---|
| Jest | Slower and more config for ESM/TS; Vitest fits the Vite-era toolchain |
| Cypress | Weaker multi-browser and mobile-viewport story; Playwright runs parallel locales easily |
| Detox / Appium for mobile e2e | Detox targets React Native; Appium is heavier and flakier. Maestro drives both native apps with one YAML flow |
| Mocked DB in integration tests | Can't prove RLS, constraints or locking |

## References

- `docs/engineering/TESTING.md`
- `PRODUCT.md §86` Definition of Done
