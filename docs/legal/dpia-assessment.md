# DPIA-toets / DPIA assessment

> **⚠️ CONCEPT — GEEN JURIDISCH ADVIES.** Opgesteld door een AI-agent, niet gecontroleerd door een jurist. De Nederlandse tekst is leidend.
> **⚠️ DRAFT — NOT LEGAL ADVICE.** Written by an AI agent, not reviewed by a lawyer. The Dutch text prevails.

| | |
|---|---|
| **Versie / Version** | 0.2 · 20 oktober 2026 |
| **Vraag / Question** | Is een gegevensbeschermingseffectbeoordeling (DPIA, art. 35 AVG) verplicht voor Fivvi, gezien de gezondheidsgegevens die in vrije notities kunnen staan? / Is a data protection impact assessment (DPIA, GDPR art. 35) required for Fivvi, given the health data that free-text notes may contain? |
| **Toetsingskader / Criteria** | Art. 35(1) and (3) AVG/GDPR · Autoriteit Persoonsgegevens, *Lijst van verwerkingen waarvoor een DPIA verplicht is* (Staatscourant 2019, 64418; 17 categories) · WP29/EDPB *Guidelines on DPIA* (WP248 rev.01, 9 criteria) · recital 91 |
| **Risico / Risk** | `ROADMAP.md §13` R11 |

---

## 1. Conclusie / Conclusion

**NL.**

- **Voor de MVP en de pilot is een DPIA waarschijnlijk niet wettelijk verplicht, maar wel sterk aanbevolen.** Voorstel: voer vóór G4 een beknopte DPIA uit, met de opzet in §7.
  - De verwerking raakt één duidelijk hoog-risicocriterium: gevoelige gegevens, want gezondheidsinformatie in notities.
  - Ze is niet grootschalig. De pilotgym heeft tientallen tot enkele honderden klanten; dat lijkt meer op de "individuele zorgverlener" uit overweging 91 dan op een zorginstelling.
  - Andere criteria spelen niet of nauwelijks.
  - Daarmee valt ze niet onder de categorie *gezondheidsgegevens* van de AP-lijst. Die gaat over **grootschalige** verwerking.
- **De DPIA-plicht ligt bij de verwerkingsverantwoordelijke**, dus bij de workspace (art. 35). Wij zijn verwerker en moeten helpen (art. 28(3)(f)). Omdat bijna geen kleine gym dit zelf kan, levert Fivvi een ingevulde DPIA die de pilotgym kan overnemen en aanvullen.
- **Een DPIA kan wel verplicht worden** bij de veranderingen in §6. Beoordeel die vóór de betreffende release. De belangrijkste zijn:
  - **betalingen (MVP, M11)**: betalingen komen in de MVP (`ROADMAP.md` v1.19). De betaalprovider verwerkt de betaalgegevens; Fivvi bewaart alleen verwijzingen, bedragen en statussen. Deze DPIA-toets wordt vóór G4 opnieuw beoordeeld, zodra ADR-020 (voorstel: Mollie) is goedgekeurd en de provider gekozen is;
  - **AI-notities (1.3) en AI-briefing (1.4)**: nieuwe technologie + gezondheidsgegevens + evaluatie;
  - **publieke SaaS (2.0)**: beoordeel vóór die release opnieuw per verwerkingsverantwoordelijke of aard en schaal van de verwerking een DPIA vereisen;
  - **HealthKit/Health Connect (6.0)**: stelselmatige gezondheidsgegevens;
  - **structurele verwerking van gegevens van minderjarigen**.

**EN.**

- **For the MVP and the pilot, a DPIA is probably not legally required, but it is strongly recommended.** Proposal: carry out a concise DPIA before G4, using the outline in §7.
  - The processing meets one clear high-risk criterion: sensitive data, because notes may contain health information.
  - It is not large scale. The pilot gym has tens to a few hundred clients; that resembles the "individual health professional" of recital 91 more than a healthcare institution.
  - Other criteria apply barely or not at all.
  - It therefore doesn't fall under the *health data* category of the AP list, which covers **large-scale** processing.
- **The DPIA obligation lies with the controller**, i.e. the workspace (art. 35). We are the processor and must assist (art. 28(3)(f)). Since almost no small gym can do this alone, Fivvi provides a pre-filled DPIA that the pilot gym can adopt and complete.
- **A DPIA may become required** with the changes in §6. Assess them before the relevant release. The main ones are:
  - **payments (MVP, M11)**: payments come into the MVP (`ROADMAP.md` v1.19). The payment provider processes the payment data; Fivvi stores only references, amounts and statuses. This assessment is reassessed before G4, once ADR-020 (which proposes Mollie) is approved and the provider is chosen;
  - **AI notes (1.3) and AI briefing (1.4)**: new technology + health data + evaluation;
  - **public SaaS (2.0)**: reassess before that release whether the nature and scale of processing require a DPIA for each relevant controller;
  - **HealthKit/Health Connect (6.0)**: systematic health data;
  - **structural processing of minors' data**.

---

## 2. Zijn notities gezondheidsgegevens? / Are notes health data?

**NL.**

- Gezondheidsgegevens zijn gegevens over de fysieke of mentale gezondheid die informatie geven over iemands gezondheidstoestand (art. 4(15)). Het Hof van Justitie legt dit ruim uit: ook gegevens waaruit de gezondheid **indirect** is af te leiden vallen eronder (o.a. HvJ EU 1 augustus 2022, C-184/20, *OT*; HvJ EU 4 oktober 2024, C-21/23, *Lindenapotheke*).
- Een personal trainer noteert heel waarschijnlijk dingen als "knieblessure links, geen diepe squats", "zwanger, 20 weken", "hoge bloeddruk, medicatie" of "herstel na hernia".
- **Conclusie:** we gaan ervan uit dat notities gezondheidsgegevens bevatten. Dan gelden art. 9 en een hoger beveiligingsniveau.
- Losse trainingsdata (sets, herhalingen, gewicht, "zwaar") zijn op zichzelf meestal **geen** gezondheidsgegevens. Over langere tijd kunnen ze wel iets zeggen over iemands fysieke conditie. We behandelen ze daarom als gevoelig, maar niet als art. 9-gegevens.
- Aanwezigheid en no-shows zijn geen gezondheidsgegevens. Een notitie als "afgezegd wegens ziekte" is dat wel.

**EN.**

- Health data is data about physical or mental health that reveals information about a person's health status (art. 4(15)). The Court of Justice reads this broadly: data from which health can be inferred **indirectly** is included too (e.g. CJEU 1 August 2022, C-184/20, *OT*; CJEU 4 October 2024, C-21/23, *Lindenapotheke*).
- A personal trainer will very likely record things like "left knee injury, no deep squats", "pregnant, 20 weeks", "high blood pressure, on medication" or "recovering from a herniated disc".
- **Conclusion:** we assume notes contain health data. Art. 9 applies, along with a higher security level.
- Workout data on its own (sets, reps, weight, "hard") is usually **not** health data. Over time it can say something about a person's physical condition. We therefore treat it as sensitive, but not as art. 9 data.
- Attendance and no-shows are not health data. A note such as "cancelled because of illness" is.

---

## 3. Toets / Assessment

### 3.1 AP-lijst verplichte DPIA (17 categorieën) / AP mandatory DPIA list (17 categories)

| # | Categorie | Van toepassing? | Toelichting |
|---|---|---|---|
| 1 | Heimelijk onderzoek | Nee | — |
| 2 | Zwarte lijsten | Nee | Blokkadelijsten voor rate limits (R14) bevatten 30 dagen gehashte kenmerken om misbruik te stoppen. Ze worden niet gedeeld en hebben geen gevolgen buiten het platform |
| 3 | Fraudebestrijding | Nee | — |
| 4 | Creditscores | Nee | — |
| 5 | Financiële situatie | Nee (voorlopig) | Betalingen komen in de MVP (`ROADMAP.md` v1.19, M11). De betaalprovider verwerkt de betaalgegevens; Fivvi bewaart alleen verwijzingen, bedragen en statussen. Opnieuw toetsen vóór G4, zodra ADR-020 (voorstel: Mollie) is goedgekeurd en de provider gekozen is |
| 6 | Genetische gegevens | Nee | — |
| 7 | **Gezondheidsgegevens** | **Niet grootschalig → nee (nu)** | De categorie gaat over *grootschalige* verwerking van gezondheidsgegevens. De AP-lijst noemt instellingen (zorg, verzekeraars, re-integratie) en zondert individuele zorgverleners uit met een verwijzing naar overweging 91. Eén gym met een beperkt klantenbestand lijkt meer op het laatste. **Opnieuw beoordelen vóór 2.0, per verwerkingsverantwoordelijke** |
| 8 | Samenwerkingsverbanden | Nee | Workspaces delen niets met elkaar (D2 in `role-mapping.md`) |
| 9–10 | (Flexibel) cameratoezicht | Nee | — |
| 11 | Controle werknemers | Nee (licht) | De owner ziet de planning en aanwezigheidsregistratie van trainers. Dat is roosteren, geen stelselmatige controle van prestaties of gedrag. **Ontwerpregel:** geen productiviteitsscores voor trainers in de MVP; opnieuw toetsen bij 3.2 (analytics: "werkdruk trainers") |
| 12 | Locatiegegevens | Nee | Sessielocaties (soms het thuisadres van een klant) zijn geplande adressen, geen tracking. Geen GPS |
| 13 | Communicatiegegevens | Nee | — |
| 14 | Internet of Things | Nee | Opnieuw toetsen bij 6.0 (wearables) |
| 15 | Profilering | Nee | Opnieuw toetsen bij 1.4/5.0 (AI-inzichten, progressie) |
| 16 | Observatie en beïnvloeding van gedrag | Nee | Trainingslogging wordt door de trainer vastgelegd in opdracht van de klant; geen gedragssturing of nudging |
| 17 | Biometrische gegevens | Nee | Opnieuw toetsen bij 6.0 |

<details>
<summary>English version of the table</summary>

| # | Categorie / Category | Van toepassing? / Applies? | Toelichting / Reasoning |
|---|---|---|---|
| 1 | Heimelijk onderzoek / Covert investigation | Nee / No | — |
| 2 | Zwarte lijsten / Blacklists | Nee / No | Rate-limit block lists (R14) contain hashed identifiers for 30 days to stop abuse. They aren't shared and have no effect outside the platform |
| 3 | Fraudebestrijding / Fraud prevention | Nee / No | — |
| 4 | Creditscores / Credit scores | Nee / No | — |
| 5 | Financiële situatie / Financial situation | Nee (voorlopig) / No (for now) | Payments come into the MVP (`ROADMAP.md` v1.19, M11). The payment provider processes the payment data; Fivvi stores only references, amounts and statuses. Reassess before G4, once ADR-020 (which proposes Mollie) is approved and the provider is chosen |
| 6 | Genetische gegevens / Genetic data | Nee / No | — |
| 7 | **Gezondheidsgegevens** / **Health data** | **Niet grootschalig → nee (nu)** / **Not large scale → no (now)** | The category covers *large-scale* processing of health data. The AP's list names institutions (care, insurers, reintegration) and exempts individual care professionals with a reference to recital 91. A single gym with a limited client base is closer to the latter. **Reassess before 2.0 for each controller** |
| 8 | Samenwerkingsverbanden / Data-sharing partnerships | Nee / No | Workspaces share nothing with each other (D2 in `role-mapping.md`) |
| 9–10 | (Flexibel) cameratoezicht / (Flexible) camera surveillance | Nee / No | — |
| 11 | Controle werknemers / Employee monitoring | Nee / No (licht / slight) | The owner sees trainers' schedules and attendance records. That is scheduling, not systematic monitoring of performance or behaviour. **Design rule:** no trainer productivity scores in the MVP; reassess at 3.2 (analytics: "trainer workload") |
| 12 | Locatiegegevens / Location data | Nee / No | Session locations (sometimes a client's home address) are planned addresses, not tracking. No GPS |
| 13 | Communicatiegegevens / Communication data | Nee / No | — |
| 14 | Internet of Things | Nee / No | Reassess at 6.0 (wearables) |
| 15 | Profilering / Profiling | Nee / No | Reassess at 1.4/5.0 (AI insights, progression) |
| 16 | Observatie en beïnvloeding van gedrag / Observing and influencing behaviour | Nee / No | Workout logging is recorded by the trainer on the client's instruction; no behavioural steering or nudging |
| 17 | Biometrische gegevens / Biometric data | Nee / No | Reassess at 6.0 |

</details>

### 3.2 WP248-criteria (twee of meer = DPIA meestal nodig) / WP248 criteria (two or more = DPIA usually needed)

| # | Criterium / Criterion | MVP / pilot | Release 2.0 reassessment | With AI (1.3/1.4) |
|---|---|---|---|---|
| 1 | Evaluatie of scoren / Evaluation or scoring | ✗ | ✗ | **✓** (summaries, "insights") |
| 2 | Geautomatiseerde besluitvorming met rechtsgevolg / Automated decisions with legal effect | ✗ | ✗ | ✗ (the trainer confirms, `PRODUCT.md §56`) |
| 3 | Stelselmatige monitoring / Systematic monitoring | ✗ | ✗ | ✗ |
| 4 | **Gevoelige gegevens** / **Sensitive data** | **✓** | **✓** | **✓** |
| 5 | Grootschalig / Large scale | ✗ | **?** (assess each controller's processing) | depends |
| 6 | Koppelen van datasets / Matching datasets | ✗ (no cross-workspace client profile) | ✗ | ✗ |
| 7 | Kwetsbare betrokkenen / Vulnerable data subjects | **?** (minors? clients in rehabilitation? trainers in an employment relationship) | **?** | **?** |
| 8 | Innovatieve technologie / Innovative technology | ✗ | ✗ | **✓** (LLM on health notes) |
| 9 | Blokkeert een recht of dienst / Prevents exercising a right or using a service | ✗ | ✗ | ✗ |
| | **Totaal / Total** | **1 (+ possibly 7)** | **Reassess before 2.0** | **3 → DPIA** |

**NL.**

- Criterium 7 is de onzekere factor. Traint de pilotgym **minderjarigen** of mensen in revalidatie, en legt ze daarover gezondheidsinformatie vast, dan zijn er twee criteria. De AP verwacht dan een DPIA.
- Zie open vraag Q9.

**EN.**

- Criterion 7 is the uncertain one. If the pilot gym trains **minors** or people in rehabilitation, and records health information about them, two criteria are met. The AP then expects a DPIA.
- See open question Q9.

---

## 4. Rechtsgrond voor gezondheidsgegevens (voor de workspace) / Legal basis for health data (for the workspace)

**NL.**

- Voor gezondheidsgegevens is naast art. 6 ook een uitzondering uit art. 9(2) nodig.
- Personal trainers zijn doorgaans geen BIG-geregistreerde zorgverleners. De uitzondering voor zorg (art. 9(2)(h)) past daarom waarschijnlijk niet. Voor zover wij kunnen zien biedt de UAVG geen specifieke uitzondering voor sportbegeleiders.
- **Praktische route: uitdrukkelijke toestemming** van de klant (art. 9(2)(a)):
  - vrij gegeven;
  - specifiek ("mijn trainer mag blessures en gezondheidsklachten vastleggen die relevant zijn voor mijn training");
  - aantoonbaar;
  - altijd in te trekken.
- **Gevolg voor het product (voorstel, niet in de huidige scope):**
  - een optioneel veld "toestemming gezondheidsgegevens: ja/nee + datum" op het klantprofiel;
  - een waarschuwing bij het schrijven van een notitie als die toestemming ontbreekt.
- Een andere optie: de pilotgym regelt toestemming op papier of in het intakeformulier. Beslissing: open vraag Q8.

**EN.**

- Health data needs an art. 9(2) exception in addition to an art. 6 basis.
- Personal trainers are usually not BIG-registered healthcare professionals, so the healthcare exception (art. 9(2)(h)) probably doesn't fit. As far as we can see, the Dutch implementation act (UAVG) has no specific exception for fitness professionals.
- **Practical route: explicit consent** from the client (art. 9(2)(a)):
  - freely given;
  - specific ("my trainer may record injuries and health complaints relevant to my training");
  - demonstrable;
  - revocable at any time.
- **Product consequence (proposal, not in current scope):**
  - an optional "consent to health data: yes/no + date" field on the client profile;
  - a warning when writing a note if that consent is missing.
- Another option: the pilot gym arranges consent on paper or in its intake form. Decision: open question Q8.

---

## 5. Maatregelen die het risico nu al beperken / Measures that already limit the risk

| Risico | Maatregel | Waar |
|---|---|---|
| Onbevoegde toegang tot notities door andere trainers of workspaces | Standaard alleen voor trainers; toegang op basis van rollen; tenant-isolatie met RLS; isolatietests in CI | F048, ADR-006, E011 |
| Onopgemerkt meekijken | Audit log op notitie-toegang, zichtbaar voor de owner | E014 |
| Lek via bijkanalen | Geen notities in e-mails, logs, Sentry, PostHog of pushberichten | D4–D6 in `role-mapping.md` |
| Lek via een verloren telefoon | Tokens in Keychain/EncryptedSharedPreferences; inloggen zonder wachtwoord; op afstand uitloggen (voorstel) | M8 |
| Te veel gegevens | Minimale boekingsgegevens (naam + e-mail); hulptekst in het notitieveld ("Schrijf alleen op wat nodig is voor de training") | `PRODUCT.md §2.4`, M7 |
| Te lang bewaren | Bewaarreview na 24 maanden inactiviteit; 30 dagen prullenbak, daarna definitief weg | `retention-policy.md` R5–R7 |
| Doorgifte naar de VS | EU-regio's; DPF/SCC; minimalisatie | `sub-processors.md` |
| Toegang door de bouwers (AI-agents) | Geen productietoegang voor agents | D8, verwerkersovereenkomst art. 4.4 |
| Verkeerde ontvanger van een magic link | Eenmalig, 15 minuten, gehasht; 6-cijferige code als alternatief | ADR-007 |

<details>
<summary>English version of the table</summary>

| Risico / Risk | Maatregel / Measure | Waar / Where |
|---|---|---|
| Unauthorized access to notes by other trainers or workspaces | Trainer-only by default; role-based access; tenant isolation with RLS; isolation tests in CI | F048, ADR-006, E011 |
| Undetected snooping | Note access audit log, visible to the owner | E014 |
| Leak through side channels | No notes in emails, logs, Sentry, PostHog or push messages | D4–D6 in `role-mapping.md` |
| Leak through a lost phone | Tokens in Keychain/EncryptedSharedPreferences; sign-in without a password; remote sign-out (proposal) | M8 |
| Too much data | Minimal booking data (name + email); guidance in the note field (placeholder text: "Write down only what matters for the training") | `PRODUCT.md §2.4`, M7 |
| Keeping data too long | Retention review after 24 months of inactivity; 30-day trash, then permanent deletion | `retention-policy.md` R5–R7 |
| Transfer to the US | EU regions; DPF/SCC; minimization | `sub-processors.md` |
| Access by builders (AI agents) | No production access for agents | D8, verwerkersovereenkomst art. 4.4 |
| Wrong recipient of a magic link | Single use, 15 minutes, hashed; 6-digit code as an alternative | ADR-007 |

</details>

---

## 6. DPIA-triggers en herbeoordelingen / DPIA triggers and reassessments

| Trigger | Waarom | Wanneer |
|---|---|---|
| AI-notities (1.3) / AI-briefing (1.4) | Nieuwe technologie + gezondheidsgegevens + evaluatie (3 criteria); plus een nieuwe subverwerker, mogelijk buiten de EU | **Vóór** de entry gate van 1.3 (staat al in `ROADMAP.md §3.3`: "AI processor DPA signed") |
| Publieke SaaS (2.0) | Herbeoordeel per verwerkingsverantwoordelijke de aard, schaal en risico's; de totale omvang van de verwerker maakt een DPIA niet automatisch verplicht voor elke workspace | Vóór de entry gate van 2.0 |
| Structureel gezondheidsinformatie van minderjarigen vastleggen | Kwetsbare betrokkenen + gevoelige gegevens | Zodra dat bekend is (Q9) |
| Analytics over trainers (3.2) | Controle werknemers (AP-lijst) | Vóór 3.2 |
| Betalingen (MVP, M11) | Financiële gegevens; de betaalprovider verwerkt de betaalgegevens, Fivvi bewaart verwijzingen, bedragen en statussen | Vóór G4, zodra ADR-020 (voorstel: Mollie) is goedgekeurd en de provider gekozen is |
| Geavanceerde commerce (4.0) | Financiële gegevens, bijv. herinneringen, boekhoudkoppelingen | Vóór 4.0 |
| HealthKit / Health Connect / wearables (6.0) | Stelselmatige gezondheidsgegevens, IoT | Vóór 6.0 |
| Wezenlijke verandering in het soort notities (bijv. gestructureerde gezondheidsvelden, uploads zoals medische brieven) | Meer en specifiekere gezondheidsgegevens | Vóór de wijziging |

<details>
<summary>English version of the table</summary>

| Trigger | Waarom / Why | Wanneer / When |
|---|---|---|
| AI note capture (1.3) / AI briefing (1.4) | New technology + health data + evaluation (3 criteria); plus a new sub-processor, possibly outside the EU | **Before** the 1.3 entry gate (already in `ROADMAP.md §3.3`: "AI processor DPA signed") |
| Public SaaS (2.0) | Reassess nature, scale and risks for each controller; the processor's aggregate scale does not automatically require every workspace to perform a DPIA | Before the 2.0 entry gate |
| Structurally recording minors' health information | Vulnerable data subjects + sensitive data | As soon as it's known (Q9) |
| Analytics about trainers (3.2) | Employee monitoring (AP list) | Before 3.2 |
| Payments (MVP, M11) | Financial data; the payment provider processes the payment data, Fivvi stores references, amounts and statuses | Before G4, once ADR-020 (which proposes Mollie) is approved and the provider is chosen |
| Advanced commerce (4.0) | Financial data, e.g. reminders, accounting links | Before 4.0 |
| HealthKit / Health Connect / wearables (6.0) | Systematic health data, IoT | Before 6.0 |
| Significant change in the nature of notes (e.g. structured health fields, file uploads such as medical letters) | More and more specific health data | Before the change |

</details>

---

## 7. DPIA-opzet (aanbevolen, vóór G4) / DPIA outline (recommended, before G4)

**NL.** Deze opzet volgt art. 35(7) AVG en de onderdelen van het *Model DPIA Rijksdienst*. De vetgedrukte onderdelen kan Fivvi vooraf invullen. De rest vult de pilotgym aan.

**EN.** This outline follows GDPR art. 35(7) and the structure of the Dutch government's *Model DPIA Rijksdienst*. Fivvi can pre-fill the parts in bold. The pilot gym completes the rest.

### A. Beschrijving / Description

1. **Voorstel en doel / Proposal and purpose:** replace the pilot's current tools (its booking and payment app, Google Calendar and Word documents) and its by-hand invoices, notes and booking with one platform → `PRODUCT.md §1`.
2. **Persoonsgegevens en betrokkenen / Personal data and data subjects** → `role-mapping.md` §4.
3. **Verwerkingen en gegevensstromen / Processing activities and data flows** → `role-mapping.md` §3 and §5.
4. **Betrokken partijen en rollen / Parties and roles** → `role-mapping.md` §2; `sub-processors.md`.
5. **Techniek en locatie / Technology and location** → `ROADMAP.md §11`; `sub-processors.md`.
6. **Bewaartermijnen / Retention** → `retention-policy.md`.
7. Wettelijke kaders en interne regels van de gym / Legal framework and the gym's own rules *(gym)*.

### B. Rechtmatigheid / Lawfulness

8. **Rechtsgronden per verwerking / Legal basis per processing activity** → `role-mapping.md` §3.2 (proposal); the gym confirms them.
9. Uitzondering art. 9 voor gezondheidsgegevens / Art. 9 exception for health data: how is explicit consent obtained and recorded? *(gym, Q8)*
10. **Noodzaak en proportionaliteit / Necessity and proportionality:** why free-text notes? (`PRODUCT.md §2.5`). Is there a less intrusive alternative, e.g. no health information, or only "watch out: see intake form"?
11. **Subsidiariteit en minimalisatie / Subsidiarity and minimization** → §5 of this document.
12. **Rechten van betrokkenen / Data subject rights:** how does the gym handle access, erasure and export requests? → E014; verwerkersovereenkomst art. 8.
13. Informeren van klanten / Informing clients: the gym's own privacy notice *(gym)*; Fivvi's privacy policy as a supplement.

### C. Risico's / Risks

Per risico: bron, kans (K: laag/middel/hoog), impact (I: laag/middel/hoog), maatregel, restrisico.
For each risk: source, likelihood (low/medium/high), impact (low/medium/high), measure, residual risk.

| # | Risico | Voorzet |
|---|---|---|
| 14 | Gezondheidsnotities gezien door onbevoegden (andere trainer, andere gym) | K: laag (RLS + tests), I: hoog → maatregelen T1–T3 |
| 15 | Datalek bij het platform of een subverwerker | K: laag–middel, I: hoog → T5, T6, T10, T14 |
| 16 | Notities langer bewaard dan nodig | K: middel, I: middel → R5–R7 |
| 17 | Klant weet niet dat gezondheidsinformatie wordt vastgelegd | K: middel, I: middel → toestemming + transparantie *(gym)* |
| 18 | Onjuiste of verouderde gezondheidsinformatie leidt tot een verkeerde trainingskeuze | K: laag, I: middel → de klant kan inzien en laten corrigeren (voor de klant zichtbare notities, inzageverzoek) |
| 19 | Toegang door Amerikaanse moederbedrijven van subverwerkers | K: laag, I: middel → EU-regio's, DPF/SCC, minimalisatie |
| 20 | Verloren of gestolen telefoon van een trainer | K: middel, I: middel → T5, op afstand uitloggen |

<details>
<summary>English version of the table</summary>

| # | Risico / Risk | Voorzet / Initial assessment |
|---|---|---|
| 14 | Health notes seen by unauthorized people (other trainers, another gym) | L: low (RLS + tests), I: high → measures T1–T3 |
| 15 | Data breach at the platform or a sub-processor | L: low–medium, I: high → T5, T6, T10, T14 |
| 16 | Notes kept longer than needed | L: medium, I: medium → R5–R7 |
| 17 | Client doesn't know health information is being recorded | L: medium, I: medium → consent + transparency *(gym)* |
| 18 | Incorrect or stale health information leads to a wrong training choice | L: low, I: medium → the client can view and correct it (client-visible notes, access requests) |
| 19 | Access by the US parent companies of sub-processors | L: low, I: medium → EU regions, DPF/SCC, minimization |
| 20 | Lost or stolen trainer phone | L: medium, I: medium → T5, remote sign-out |

</details>

### D. Maatregelen en besluit / Measures and decision

21. Aanvullende maatregelen met eigenaar en datum / Additional measures with owner and date.
22. Restrisico acceptabel? Anders: voorafgaande raadpleging AP (art. 36) / Residual risk acceptable? If not: prior consultation with the AP (art. 36).
23. Advies FG (niet verplicht voor de pilotgym of Fivvi, zie Q12) / DPO advice (not required for the pilot gym or Fivvi, see Q12).
24. Besluit en ondertekening door de gym / Decision and sign-off by the gym; review date: **every 12 months or at a trigger in §6**.
