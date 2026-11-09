# Juridisch & privacy / Legal & privacy

> **⚠️ GEEN JURIDISCH ADVIES.** Deze documenten zijn opgesteld door een AI-agent op basis van de productdocumentatie. Een jurist heeft ze niet gecontroleerd. De privacyverklaring en de voorwaarden (versie 1.0, 8 november 2026) zijn de teksten voor de website; ze krijgen nu een AI-gestuurde toets en later een privacyjurist (Q13 in [`open-questions.md`](open-questions.md)). De andere documenten zijn nog concepten en moeten getoetst zijn voordat er echte persoonsgegevens in het platform komen (`ROADMAP.md §4.4`). De Nederlandse tekst is leidend.
>
> **⚠️ NOT LEGAL ADVICE.** These documents were written by an AI agent from the product documentation. No lawyer has checked them. The privacy policy and the terms (version 1.0, 8 November 2026) are the texts for the website; they get an AI-assisted review now and a privacy lawyer later (Q13 in [`open-questions.md`](open-questions.md)). The other documents are still drafts and must be reviewed before real personal data enters the platform (`ROADMAP.md §4.4`). The Dutch text prevails.

| | |
|---|---|
| **Versie / Version** | 0.1 (concept / draft) |
| **Datum / Date** | 22 september 2026 |
| **Eigenaar / Owner** | Keyvan Mahmoudi |
| **Roadmap** | M0, §4.4 Legal and privacy preparation |
| **Status** | Privacy policy and terms (version 1.0, 8 November 2026) rewritten for what Fivvi is now (F064, #642): K&S Apps details, Mollie, Lettermint, Zoho, the demo form, client sign-in and approval, minimum age 16, liability cap € 1,000, Rechtbank Amsterdam, 2 working days' reply (Q2, Q7, Q10, Q11, Q13, Q14, Q15); `sub-processors.md`, `retention-policy.md` (R1, R4, R10, R14, R18, R19) and processor agreement art. 14 and 15 follow. Open before publishing: Q6, Q25, Q26, Q28 (`open-questions.md`). Signatures and the other provider checks remain open / Privacyverklaring en voorwaarden (versie 1.0, 8 november 2026) herschreven naar wat Fivvi nu is (F064, #642): gegevens van K&S Apps, Mollie, Lettermint, Zoho, het demoformulier, inloggen en goedkeuring van klanten, minimumleeftijd 16, aansprakelijkheid € 1.000, Rechtbank Amsterdam, antwoord binnen 2 werkdagen (Q2, Q7, Q10, Q11, Q13, Q14, Q15); `sub-processors.md`, `retention-policy.md` (R1, R4, R10, R14, R18, R19) en verwerkersovereenkomst art. 14 en 15 volgen. Open vóór publicatie: Q6, Q25, Q26, Q28 (`open-questions.md`). Ondertekening en de overige controles bij aanbieders staan nog open |
| **Pull request** | [#5 — Legal and privacy drafts](https://github.com/fivvi-app/fivvi/pull/5) |

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

Waarden die nog niet bekend zijn staan als `{{…}}`. In `privacy-policy.*` en `terms.*` staan er geen meer; een `{{…}}` in een gepubliceerde tekst laat de build van de website mislukken (F064, AC10). De verwerkersovereenkomst heeft het bedrag (art. 14) en het arrondissement (art. 15) ingevuld; de partijen en andere velden (`{{Naam aanbieder}}` en dergelijke) worden ingevuld vóór ondertekening. Zie [`open-questions.md`](open-questions.md).

Values that aren't known yet appear as `{{…}}`. `privacy-policy.*` and `terms.*` have none left; a `{{…}}` in a published text fails the website build (F064, AC10). The processor agreement has the amount (art. 14) and the court district (art. 15) filled in; the parties and other fields (`{{Provider name}}` and the like) are filled in before signing. See [`open-questions.md`](open-questions.md).

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
