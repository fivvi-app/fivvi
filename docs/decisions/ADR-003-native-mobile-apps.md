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
- **Minimum OS versions** were set in M0 from the pilot trainers' phones (`ROADMAP.md §4.1`): **iOS 17.0** and **Android 8.0 (API 26)**. See [Minimum OS versions](#minimum-os-versions).
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
- **Follow-ups:** E008 builds the app shells in M1; E017 handles distribution at M8. Confirm the phone versions of the pilot trainers (see [Minimum OS versions](#minimum-os-versions)).

## Minimum OS versions

Recorded on 29 October 2026 from the M0 quick questions ([`results/phone-inventory.md`](../discovery/results/phone-inventory.md), [#153](https://github.com/fivvi-app/fivvi/issues/153)), with the decision rule of [`phone-inventory.md §4.2`](../discovery/phone-inventory.md#42-decision-rule).

| Platform | Minimum | Rule step |
|---|---|---|
| iOS | **iOS 17.0** | 4: no confirmed iPhone among the pilot trainers, so the default stands. iOS is still built, but gets no real-world pilot testing (R9). Plan at least one physical iPhone for device tests |
| Android | **Android 8.0 (API 26)** | 2: all pilot phones are at or above the default, so it is not raised |

- **Platform split (estimate):** the gym owner (T1) has a Samsung S24. The other four trainers have mostly Android phones, about 3–4 years old. There may be one iPhone; it is not confirmed.
- **Basis is an estimate.** No OS version was read from a phone. Phones of that age launched with Android 12 or 13 (API 31–33), far above API 26. That is an inference from the age, not a check.
- **Trigger to revisit:** a pilot trainer turns out to have an iPhone older than the XS / XR (it can't run iOS 17), or an Android phone below API 26 that can't update. Then the rule's step 3 applies (lower the minimum, change phones, or use trainer web).
- **Already in the code:** `IPHONEOS_DEPLOYMENT_TARGET = 17.0` (`apps/ios`) and `minSdk = 26` (`apps/android`). This decision changes no code.
- **Open:** the exact models and versions of T2–T5, and whether any is an iPhone, are listed in `results/phone-inventory.md`, section "Still open".

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
