# ADR-032: Secondary text in the native apps

| | |
|---|---|
| **Status** | Accepted (2026-11-06) |
| **Date** | 2026-11-06 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | Amends ADR-029 (the contrast rule, for one colour); [`DECISIONS.md`](../design/prototype-v2/DECISIONS.md) §2; `ROADMAP.md` M9; E020 ([#590](https://github.com/fivvi-app/fivvi/issues/590)) |

## Context

ADR-029 sets a contrast rule of 4.5:1 for text. The prototype's grey for smaller text, `rgba(60,60,67,.6)`, comes out at about 3.4:1 on white and 3.3:1 on the grey canvas in light mode. Dark mode passes.

The owner compared it with a darker grey and chose to keep the prototype's look. `ROADMAP.md` M9 requires WCAG 2.2 AA on the client web, and its automated tests enforce that. For the native apps M9 asks for sufficient contrast, and the trainer web has its own zinc grey, which passes.

## Decision

**In light mode, secondary text is:**

| Where | Value | Contrast |
|---|---|---|
| Fivvi Pro and Fivvi, iOS and Android | `#85858B`, the prototype's grey | 3.3:1 on the canvas, 3.7:1 on cards |
| Client web | `#6C6C70` | 4.7:1 on the canvas, 5.2:1 on cards |
| Trainer web | zinc `#71717A`, unchanged | 4.8:1 on white |

Dark mode is `#98989F` in the apps and on the client web. **This is the only exception to the 4.5:1 rule.** It is declared in the tokens' contrast pairs with a minimum of 3:1 and a reason, so it can't drop further and no other colour can use it.

## Consequences

- **Positive:** the apps keep the look the owner approved, and the client web still meets the launch checklist without changing a test.
- **Negative:** smaller text in the apps is harder to read in a bright gym and for people with low vision. The native accessibility audits' contrast check has to allow this one colour.
- **Negative:** the prototype's client web shows the lighter grey, while the real one uses `#6C6C70`.

## Alternatives considered

| Option | Why not |
|---|---|
| `#6C6C70` everywhere | The owner preferred the prototype's look in the apps |
| The prototype's grey on the client web too | It would need a change to M9's WCAG 2.2 AA check and an exception in the automated contrast test |
