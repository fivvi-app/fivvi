# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase. This repo is **single-context**: one product, one domain language.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root: the domain language (English canonical terms, definitions, words to avoid).
- **`docs/decisions/`**: the ADRs. Read the ones that touch the area you're about to work in (index in `docs/decisions/README.md`).
- **`packages/i18n/GLOSSARY.md`**: only when you write user-facing text. It gives each domain term's Dutch and English UI wording, tone and copy rules.

## Where this repo differs from the skills' defaults

- **ADRs live in `docs/decisions/`, not `docs/adr/`.** Name them `ADR-0xx-<slug>.md` (next free number) and use the template and status rules in `docs/decisions/README.md`. A new ADR starts as **Proposed**; the owner accepts it. Add it to the index there and to `ROADMAP.md §4.3`. Never change the decision of an accepted ADR: supersede it.
- **The glossary has two layers.** The root `GLOSSARY.md` owns what a concept *is* (in English). `packages/i18n/GLOSSARY.md` owns how it is *worded* in nl-NL and en. When `/domain-modeling` adds or renames a term, update the root glossary and check the i18n term table in the same change. Code names and i18n keys follow the English term.
- **Requirements** live in `docs/product/PRODUCT.md`; specs and tickets in GitHub issues (`docs/agents/issue-tracker.md`).

## File structure

```
/
├── GLOSSARY.md                    ← domain language
├── docs/decisions/                ← ADRs (ADR-0xx-<slug>.md)
├── docs/product/PRODUCT.md        ← requirements
└── packages/i18n/GLOSSARY.md      ← NL/EN wording of the domain terms
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-006 (tenant isolation), but worth reopening because…_
