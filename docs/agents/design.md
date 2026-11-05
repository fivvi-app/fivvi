# Design first: decide UI in the prototype with the owner

The owner decides UI and product questions by **talking them over in the clickable prototype**, not in text (owner, 5 November 2026). This keeps what gets built exactly what was agreed.

## When

Before a spec is written for anything with a screen on any surface: Fivvi Pro on iOS and Android, the trainer web, the client web, or the client app. That includes new features, changes to existing screens and open product questions that a screen would make concrete (a duo session, a renewal, a level). Pure back-end, infrastructure and agent-tooling work skip this.

## How

1. **Build the proposal in [`docs/design/prototype-v2`](../design/prototype-v2/README.md).** It is plain HTML, CSS and JavaScript with no build step.
   - Follow the existing parts: the app components in `app.js`, the web pages in `web.js`, the English layer in `i18n.js`.
   - Use fictional data only. Every screen works in Dutch and English, light and dark, and every business setup it applies to.
   - When a screen should look different for a role or a setup, show each version.
2. **Check it before showing it:**
   - no script errors;
   - no Dutch left in English;
   - no overflow;
   - contrast of 4.5:1 for text and 3:1 for icons;
   - buttons that aren't squashed.

   The sweeps in this session's history are the model; run them in a browser across the panel's screen index.
3. **Publish it** to the "Fivvi Prototype" artifact, and ask the owner to click through it.
4. **Act on every comment.**
   - Change the prototype, republish, and reply in the comment's thread.
   - Leave resolving to the owner.
   - When something can't be decided from the docs, ask, and put the assumption on screen.
5. **Record each decision** in [`DECISIONS.md`](../design/prototype-v2/DECISIONS.md), with the screen and where it lands:
   - an existing spec gets a comment;
   - a new product decision gets a placeholder spec (`spec` + `needs-triage`);
   - a conflict with an older doc goes in its §8 and gets a short note in that doc.
6. **Then write the spec** (`work` → **Shape**). It names the prototype screens it implements under **UX**. Its acceptance criteria match `DECISIONS.md`, including the assumptions the owner has since confirmed.

## Rules

- The prototype shows look and flow, never architecture. Business rules stay in `packages/domain`; strings in the product come from `packages/i18n`.
- `DECISIONS.md` §7 lists assumptions that are **not decided**. A spec asks the owner about each one it touches; it never builds an assumption as if it were decided.
- Platform look: [ADR-029](../decisions/ADR-029-design-v2.md) and [`visual-direction.md`](../design/visual-direction.md).
