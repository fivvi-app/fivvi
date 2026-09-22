# ADR-015: UI foundation

| | |
|---|---|
| **Status** | Accepted (2026-09-22) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | ROADMAP.md §4.2, M1, M8, §10; ADR-002, ADR-003, ADR-008; E007 |

## Context

Three UI codebases exist: web (Next.js), iOS (SwiftUI) and Android (Compose) (ADR-003). The apps should look like one product, but each mobile app should follow its platform conventions (iOS HIG, Material 3; `ROADMAP.md §4.2`). Sharing actual components across these runtimes isn't practical. What can be shared is the visual language: colour, type, spacing, radius.

## Decision

- **Shared design tokens** in `packages/design-tokens`, built with **Style Dictionary** into:
  - **web:** CSS variables / Tailwind theme;
  - **iOS:** Swift constants for SwiftUI;
  - **Android:** Kotlin constants / Compose + Material 3 theme.
- **Web UI:** Tailwind CSS + **shadcn/ui** components, in `packages/ui`.
- **iOS:** SwiftUI with native controls. **Android:** Jetpack Compose with Material 3.
- **Share tokens, contract and strings, not components.** Flows and content are the same on every platform; the look is native on each.
- Generated token files are committed and never edited by hand; CI checks they are up to date.

## Consequences

- **Positive:** one change to a colour or spacing value reaches all three platforms.
- **Positive:** native controls give accessibility (Dynamic Type, VoiceOver, TalkBack) and platform feel for free.
- **Negative:** components are built three times; parity is enforced by checklists and Maestro flows, not shared code.
- **Negative:** tokens must map onto Material 3's colour roles and iOS semantic colours, including dark mode; the token structure is designed with that in mind in M0/M1.
- **Follow-ups:** visual direction and tokens in M0 (`ROADMAP.md §4.2`); E007 in M1.

## Alternatives considered

| Option | Why not |
|---|---|
| Shared cross-platform components (React Native Web, Compose Multiplatform UI) | Conflicts with native UI per platform (ADR-003) |
| Separate design values per platform | Visual drift; one brand change becomes three manual edits |
| Hand-written token exports | Error-prone; Style Dictionary is the standard tool for multi-platform tokens |
| Another web component kit (MUI, Chakra) | shadcn/ui copies components into the repo (no runtime dependency) and styles with Tailwind tokens directly |

## References

- `ROADMAP.md §4.2` UX design
- Style Dictionary documentation
