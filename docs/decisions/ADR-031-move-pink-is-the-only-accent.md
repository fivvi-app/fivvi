# ADR-031: Move pink is the only accent

| | |
|---|---|
| **Status** | Accepted (2026-11-06) |
| **Date** | 2026-11-06 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | Amends ADR-029 (the accent only); [`DECISIONS.md`](../design/prototype-v2/DECISIONS.md) §2; E020 ([#590](https://github.com/fivvi-app/fivvi/issues/590)) |

## Context

ADR-029 chose Move pink `#E6164A` as the accent, with a black-and-white accent as the alternative. The prototype also has four other accents to compare. The foundation spec had to know how far the alternative reached: only in the tokens, or as a setting for a workspace.

## Decision

**Move pink is Fivvi's primary colour and only accent.** The product has no black-and-white or other accent, in the tokens or as a setting.

The clickable prototype keeps its accent switch, so the owner can compare colours. It's a design tool and not part of the product: Move pink is what the prototype starts on, and nothing is built from the other colours.

The accent stays one token, so it can change in one place if that's ever needed. Everything else in ADR-029 stands.

## Consequences

- **Positive:** there's one set of values to build, test and check for contrast, and no setting to explain.
- **Negative:** a change of accent later means a new decision and a token change, with its contrast pairs checked again.
- The poster's *Kleur | Zwart-wit* choice isn't affected: that's about printing.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep black-and-white as a second set of token values | Values nobody uses, kept working by tests |
| Let a workspace choose its accent | Not asked for, and each choice would need its own contrast check |
