# Juridisch & privacy / Legal & privacy

> **⚠️ CONCEPT — GEEN JURIDISCH ADVIES.** Alle documenten in deze map zijn concepten, opgesteld door een AI-agent op basis van de productdocumentatie. Een jurist heeft ze niet gecontroleerd. Laat ze toetsen voordat er echte persoonsgegevens in het platform komen (`ROADMAP.md §4.4`). De Nederlandse tekst is leidend.
>
> **⚠️ DRAFT — NOT LEGAL ADVICE.** Every document in this folder is a draft written by an AI agent from the product documentation. No lawyer has checked it. Have it reviewed before real personal data enters the platform (`ROADMAP.md §4.4`). The Dutch text prevails.

| | |
|---|---|
| **Versie / Version** | 0.1 (concept / draft) |
| **Datum / Date** | 22 september 2026 |
| **Eigenaar / Owner** | Keyvan Mahmoudi |
| **Roadmap** | M0, §4.4 Legal and privacy preparation |
| **Status** | Drafts complete; signatures, provider checks and publication remain open / Concepten afgerond; ondertekening, controles bij aanbieders en publicatie staan nog open |
| **Pull request** | [#5 — Legal and privacy drafts](https://github.com/thekeyvan/trainer-hub/pull/5) |

## Documenten / Documents

| Document | Wat / What | Voor wie / Audience |
|---|---|---|
| [`role-mapping.md`](role-mapping.md) | Rollen (verwerkingsverantwoordelijke vs. verwerker), gegevenscategorieën, gegevensstromen / Roles, data categories, data flows | Intern / internal |
| [`verwerkersovereenkomst.md`](verwerkersovereenkomst.md) | Template verwerkersovereenkomst (AVG art. 28) voor de pilotgym / Processor agreement template for the pilot gym | Pilotgym, later elke workspace / pilot gym, later every workspace |
| [`sub-processors.md`](sub-processors.md) | Subverwerkers: doel, regio, DPA, gegevens / Sub-processors: purpose, region, DPA, data | Bijlage 3 bij de verwerkersovereenkomst; publiek / Annex 3 to the DPA; public |
| [`dpia-assessment.md`](dpia-assessment.md) | Is een DPIA verplicht? Toets + DPIA-opzet / Is a DPIA required? Assessment + outline | Intern + pilotgym / internal + pilot gym |
| [`retention-policy.md`](retention-policy.md) | Bewaartermijnen / Retention periods | Intern; bron voor E012/E014 / internal; source for E012/E014 |
| [`privacy-policy.nl.md`](privacy-policy.nl.md) · [`privacy-policy.en.md`](privacy-policy.en.md) | Privacyverklaring / Privacy policy | Publiek / public |
| [`terms.nl.md`](terms.nl.md) · [`terms.en.md`](terms.en.md) | Algemene voorwaarden / Terms of service | Publiek / public |
| [`open-questions.md`](open-questions.md) | Open vragen voor de eigenaar / Open questions for the owner | Eigenaar / owner |

## Taal / Language

- Nederlands is de leidende tekst. De Engelse tekst is een vertaling; bij verschil gaat het Nederlands voor.
- Dutch is the governing text. The English text is a translation; if they differ, the Dutch text prevails.
- Interne documenten staan tweetalig in één bestand (eerst NL, dan EN). Publieke teksten (privacyverklaring, voorwaarden) hebben één bestand per taal, zodat ze los op de website kunnen.
- Internal documents are bilingual in one file (NL first, then EN). Public texts (privacy policy, terms) have one file per language so they can be published separately.

## Placeholders

Waarden die nog niet bekend zijn staan als `{{…}}`, bijvoorbeeld `{{Naam aanbieder}}`, `{{KvK-nummer}}`, `{{domein}}`. Zie [`open-questions.md`](open-questions.md).

Values that aren't known yet appear as `{{…}}`, for example `{{Provider name}}`, `{{KvK number}}`, `{{domain}}`. See [`open-questions.md`](open-questions.md).

## Bronnen / Sources

- `docs/product/PRODUCT.md` §2.4, §2.5, §25, §35–37, §53, §79
- `docs/product/ROADMAP.md` §2 (principle 7), §4.3 (ADR table), §4.4, §10 (Privacy track), §11, §12, §13 (R11)
- ADR-005, 009, 011 and 013 in `docs/decisions/`; Railway and Brevo decisions are reflected in `sub-processors.md`.
- AVG/GDPR art. 4, 6, 9, 12–22, 26, 28, 32–36, 44–49; Autoriteit Persoonsgegevens, *Lijst van verwerkingen waarvoor een DPIA verplicht is* (2019); EDPB-endorsed WP29 *Guidelines on DPIA* (WP248 rev.01).
- Provider DPAs as linked in `sub-processors.md` (checked 22 September 2026).

## Onderhoud / Maintenance

- Een nieuwe dienst die persoonsgegevens verwerkt → eerst `sub-processors.md` bijwerken en de workspaces informeren (verwerkersovereenkomst art. 7), daarna pas in gebruik nemen.
- A new service that processes personal data → update `sub-processors.md` and notify workspaces first (processor agreement art. 7), then start using it.
- Een feature die nieuwe persoonsgegevens verzamelt of bewaartermijnen raakt → `role-mapping.md` en `retention-policy.md` in dezelfde PR bijwerken (Definition of Done, `ROADMAP.md §10` Privacy).
- A feature that collects new personal data or affects retention → update `role-mapping.md` and `retention-policy.md` in the same PR (Definition of Done, `ROADMAP.md §10` Privacy).
