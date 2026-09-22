# ADR-003: Native mobile apps (iOS + Android)

| | |
|---|---|
| **Status** | Accepted (2026-09-22), **deviates from `PRODUCT.md §72`** |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §15, §55, §72; ROADMAP.md §3.1, §4.1, M8, §13 (R9, R15); ADR-004, ADR-008, ADR-014, ADR-015; E008, E017 |

## Context

`PRODUCT.md §72` recommends React Native + Expo + TypeScript: one codebase for iOS and Android. The trainer app is used during sessions, often one-handed between sets and on weak gym Wi-Fi, so it has to feel fast and native. Later releases add HealthKit / Health Connect (6.0) and native client apps (1.2).

The owner decided to build **native apps** instead. The roadmap records that choice here, as `ROADMAP.md` requires for every deviation from the spec.

## Decision

- **iOS:** Swift + SwiftUI, in `apps/ios`.
- **Android:** Kotlin + Jetpack Compose (Material 3), in `apps/android`.
- **Minimum OS versions** are set in M0 from the pilot trainers' actual phones (`ROADMAP.md §4.1`), and recorded in this ADR when known.
- To stop two UI codebases from drifting apart, the apps share everything **except UI code**:
  - the API contract and generated clients (ADR-004);
  - string catalogs generated from `packages/i18n` (ADR-008);
  - design tokens (ADR-015);
  - business rules, which stay server-side in `packages/domain` and are never re-implemented in the apps;
  - acceptance tests: the same Maestro flows run on both platforms (ADR-014).
- Every mobile feature needs **iOS and Android parity**, in both languages, before it counts as done (`AGENTS.md`, `WORKFLOW.md §6`).

## Consequences

- **Positive:** best platform fit, performance and native feel. Direct access to platform APIs (HealthKit, Health Connect, on-device speech for 1.3) without bridges. Each app follows HIG / Material 3 conventions.
- **Negative:** two UI codebases, so roughly twice the mobile UI work (R9). Offset by parallel iOS and Android tracks (`ROADMAP.md §3.1`) and by sharing contract, strings and tokens.
- **Negative:** no over-the-air updates, so pilot fixes ship as new TestFlight / internal-testing builds (R15). Mitigated by keeping business rules server-side and by feature flags from the API.
- **Negative:** this deviation forces other changes: the API must be language-neutral (ADR-004 replaces tRPC), and the i18n catalogs need exporters (ADR-008).
- **Follow-ups:** record min OS versions after the M0 phone inventory; E008 builds the app shells in M1; E017 handles distribution at M8.

## Alternatives considered

| Option | Why not |
|---|---|
| React Native + Expo (spec §72) | One codebase and OTA updates, but the owner prefers native feel and performance for a trainer app used mid-session, and direct platform APIs for later releases |
| Kotlin Multiplatform with shared logic | Business logic already lives on the server; little client logic left to share, and it adds tooling complexity |
| Flutter | Non-native widgets, and a third language next to TS, Swift and Kotlin skills |
| Mobile web / PWA only | Weaker offline logging, notifications and device integration; the spec requires iOS and Android apps |

## References

- `PRODUCT.md §15` MVP platforms, `§72` Mobile stack
- `ROADMAP.md §16` changelog v1.1 (owner decision), M8
