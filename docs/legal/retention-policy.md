# Bewaarbeleid / Retention policy

> **⚠️ CONCEPT — GEEN JURIDISCH ADVIES.** Opgesteld door een AI-agent, niet gecontroleerd door een jurist. De Nederlandse tekst is leidend.
> **⚠️ DRAFT — NOT LEGAL ADVICE.** Written by an AI agent, not reviewed by a lawyer. The Dutch text prevails.

| | |
|---|---|
| **Versie / Version** | 0.1 · 22 september 2026 |
| **Geïmplementeerd door / Implemented by** | E012 (daily cron), E014 (privacy tooling: export, deletion, retention jobs), E016 (backups) |
| **Bronnen / Sources** | `PRODUCT.md` §24–25, §35–37, §79 · `ROADMAP.md` §4.4, M5, M9, ADR-010 |

## 1. Uitgangspunten / Principles

**NL.**

1. **Niet langer dan nodig** (art. 5(1)(e) AVG). Elke termijn hieronder heeft een reden.
2. **De workspace beslist over haar eigen gegevens.** De termijnen voor workspace-gegevens (§2) zijn **standaardinstellingen** die wij als verwerker uitvoeren. De workspace kan eerder verwijderen. Langer bewaren kan alleen op schriftelijke instructie en met een reden.
3. **Verwijderen = echt verwijderen of anonimiseren.** Anonimiseren betekent dat naam, e-mail, vrije tekst en koppelingen naar de persoon weg zijn. Alleen een telling blijft over, bijv. "1 deelnemer, aanwezig". Pseudonimiseren alleen is geen anonimiseren.
4. **Één opschoonmoment per dag.** De dagelijkse cron (ADR-010, E012) voert de termijnen uit. "Binnen X" betekent daarom: bij de eerste dagelijkse run na X.
5. **Back-ups volgen vanzelf.** Verwijderde gegevens verdwijnen uit back-ups doordat die na hun bewaartermijn vervallen (R16, §3.5). We passen geen oude back-ups aan.
6. **Verzoeken van betrokkenen** (inzage, verwijdering) handelen we binnen **één maand** af (art. 12(3)). Voor workspace-gegevens doen we dat via of met de workspace.

**EN.**

1. **No longer than necessary** (GDPR art. 5(1)(e)). Every period below has a reason.
2. **The workspace decides about its own data.** The periods for workspace data (§2) are **defaults** that we carry out as processor. The workspace may delete earlier. Keeping data longer only happens on written instruction, with a reason.
3. **Delete means truly delete or anonymize.** Anonymize means the name, email, free text and links to the person are gone. Only a count remains, e.g. "1 participant, attended". Pseudonymization alone is not anonymization.
4. **One cleanup moment per day.** The daily cron (ADR-010, E012) enforces the periods. "Within X" therefore means: at the first daily run after X.
5. **Backups follow on their own.** Deleted data disappears from backups as they expire after their retention period (R16, §3.5). We don't edit old backups.
6. **Data subject requests** (access, erasure) are handled within **one month** (art. 12(3)). For workspace data, we do this through or together with the workspace.

## 2. Overzicht / Overview

| # | Gegevens | Termijn | Daarna | Reden | Rol |
|---|---|---|---|---|---|
| R1 | **Verlopen hold** (`pending_verification` → `expired`) | Hold is 10–15 min geldig; persoonsgegevens blijven **24 uur na verlopen** | Hold-rij verwijderd (naam, e-mail, taal). Een telling van verlopen holds zonder persoonsgegevens mag blijven voor misbruikcijfers | De boeking is nooit tot stand gekomen. 24 uur geeft ruimte voor "ik heb de mail niet gekregen" en misbruikanalyse | Verwerker |
| R2 | Magic links, 6-cijferige codes | 15 min geldig, eenmalig, **gehasht** opgeslagen | Verwijderd 24 uur na verlopen of gebruik | Alleen nodig om in te loggen | Verantwoordelijke (P1) |
| R3 | Trainer-uitnodigingen | 7 dagen geldig | Verwijderd 30 dagen na verlopen of acceptatie | Genoeg om opnieuw te sturen of een mislukte uitnodiging uit te leggen | Verwerker |
| R4 | **Gastboeking + gastprofiel** (bevestigd, zonder account) | Zolang de klantrelatie actief is; **geanonimiseerd 24 maanden na de laatste activiteit** (boeking, sessie of aanwezigheid) | Naam, e-mail en taal verwijderd; boekings-/aanwezigheidsrijen blijven anoniem voor bezettingscijfers | Dekt een klant die na een pauze terugkomt; 24 maanden is lang genoeg voor seizoenspatronen | Verwerker (standaard; workspace mag korter kiezen) |
| R5 | Klantprofiel met trainingen en notities | Zolang de klantrelatie actief is; **reviewmelding aan de workspace 24 maanden na de laatste activiteit** | Workspace kiest "bewaren" (met reden, gelogd) of "verwijderen" (→ R6). **Geen reactie binnen 30 dagen → verwijderen** | Trainingshistorie heeft waarde voor een terugkerende klant, maar gezondheidsnotities horen niet eeuwig te blijven | Verwerker |
| R6 | **Verwijderde klant** (door workspace of op verzoek) | **30 dagen** in de prullenbak (herstelbaar) | Definitief verwijderd: profiel, notities, trainingen, setlogs, voorkeurslocatie. Boekingen/aanwezigheid geanonimiseerd | Hersteltermijn voor vergissingen; daarna weg | Verwerker |
| R7 | **Notities** (klant- en sessienotities) | Volgen de klant (R4–R6). Een los verwijderde notitie staat **30 dagen** in de prullenbak en wordt daarna definitief verwijderd | Weg. Geen versiegeschiedenis in de MVP | Kan gezondheidsgegevens bevatten: minimaliseren, niet opsparen | Verwerker |
| R8 | Trainingslogs en -historie | Volgen de klant (R5–R6) | Als R6 | Onderdeel van het klantdossier | Verwerker |
| R9 | Lidmaatschap van een trainer beëindigd | Lidmaatschap direct gedeactiveerd; de naam van de trainer blijft bij eerdere sessies staan als administratie van de workspace, zolang de sessie bestaat | Gepseudonimiseerd ("Voormalig trainer") 24 maanden na het einde van het lidmaatschap | De workspace moet weten wie een sessie gaf, maar niet voor altijd | Verwerker |
| R10 | Gebruikersaccount (owner, trainer, klant) | Tot de gebruiker het verwijdert; **24 maanden inactief** (niet ingelogd, geen boekingen, geen lidmaatschappen) → waarschuwingsmail, 30 dagen later verwijderd | Account verwijderd; workspace-gegevens blijven bij de workspace | Accountgegevens zijn van ons (P1); geen reden om slapende accounts te houden | Verantwoordelijke (P1) |
| R11 | **Beëindigde workspace** | Export beschikbaar tot **30 dagen** na het einde van de overeenkomst | Uit productie verwijderd **binnen 30 dagen daarna** (max. 60 dagen na het einde); back-ups vervallen volgens R16 | Verwerkersovereenkomst art. 11 | Verwerker |
| R12 | Audit log (notitie-toegang, admin-acties) | **12 maanden** | Verwijderd | Lang genoeg om een klacht of datalek te onderzoeken | Verwerker (W10) |
| R13 | Applicatie- en hostinglogs | **Max. 30 dagen** (of korter als het plan van de provider korter is) | Verwijderd door de provider | Debuggen. Logs bevatten geen notitie-inhoud, geen tokens en gemaskeerde e-mailadressen | Verwerker / verantwoordelijke (P3) |
| R14 | Beveiliging / misbruik (IP, gehasht e-mailadres, rate-limit-tellers) | **24 uur** rollend; blokkadelijst **30 dagen** | Verwijderd | Hold-spam tegengaan (risico R5 in de roadmap) zonder mensen lang te volgen | Verantwoordelijke (P3) |
| R15 | Foutrapporten (Sentry) | Termijn van de provider, **max. 90 dagen**; zo kort mogelijk ingesteld | Verwijderd door Sentry | Bugs oplossen. Ontdaan van persoonsgegevens | Verwerker |
| R16 | **Back-ups** | Neon point-in-time restore (venster hangt af van het plan) + eigen dagelijkse versleutelde logische back-ups, **30 dagen** bewaard in de EU (E016) | Vervallen automatisch | Herstel na fouten en incidenten (restore-drill in M9) | Verwerker |
| R17 | Productanalyse (PostHog) | **12 maanden** | Verwijderd | Pilot observeren en jaar-op-jaar vergelijken | Verantwoordelijke (P4) |
| R18 | E-mailbezorglogs (e-maildienst) | Zo kort als de provider toestaat, **max. 30 dagen** | Verwijderd door de provider | "Ik heb de mail niet gekregen" kunnen beantwoorden | Verwerker |
| R19 | Supportcorrespondentie | **24 maanden** na sluiten van het ticket | Verwijderd | Context bij terugkerende problemen | Verantwoordelijke (P2) / verwerker als er workspace-gegevens in staan |
| R20 | Contracten, getekende verwerkersovereenkomsten | Looptijd van de overeenkomst + **5 jaar** | Verwijderd | Verantwoording en de verjaringstermijn van 5 jaar (art. 3:310 BW) | Verantwoordelijke (P5) |
| R21 | Facturen (zodra er betaalde plannen zijn) | **7 jaar** | Verwijderd | Fiscale bewaarplicht (art. 52 AWR) | Verantwoordelijke (P5) |

<details>
<summary>English version of the table</summary>

| # | Data | Period | Then | Reason | Role |
|---|---|---|---|---|---|
| R1 | **Verlopen hold** (`pending_verification` → `expired`) / **Expired hold** | Hold is valid 10–15 min; personal data is kept **24 h after expiry** | Hold row deleted (name, email, language). A count of expired holds without personal data may be kept for abuse metrics | The booking never happened. 24 h leaves room for "I didn't get the email" support and abuse analysis | Processor |
| R2 | Magic links, 6-digit codes / Magic links, 6-digit codes | Valid 15 min, single use, stored **hashed** | Deleted 24 h after expiry or use | Only needed to sign in | Controller (P1) |
| R3 | Trainer-uitnodigingen / Trainer invitations | Valid 7 days | Deleted 30 days after expiry or acceptance | Enough to resend or explain a failed invitation | Processor |
| R4 | **Gastboeking + gastprofiel** (bevestigd, zonder account) / **Guest booking + guest profile** (confirmed, no account) | While the client relationship is active; **anonymized 24 months after the last activity** (booking, session or attendance) | Name, email and language removed; booking/attendance rows kept anonymously for occupancy counts | Covers a returning client after a break; 24 months is long enough for seasonal patterns | Processor (default; workspace may choose shorter) |
| R5 | Klantprofiel met trainingen en notities / Client profile with workouts and notes | While the client relationship is active; **review prompt to the workspace 24 months after the last activity** | Workspace chooses "keep" (with a reason, logged) or "delete" (→ R6). **No response in 30 days → delete** | Workout history has value for a returning client, but health notes should not stay forever | Processor |
| R6 | **Verwijderde klant** (door workspace of op verzoek) / **Deleted client** (by the workspace or on request) | **30 days** in the trash (restorable) | Hard delete: profile, notes, workouts, set logs, preferred location. Bookings/attendance anonymized | Undo window for mistakes; after that, gone | Processor |
| R7 | **Notities** (klant- en sessienotities) / **Notes** (client and session notes) | Follow the client (R4–R6). A single deleted note goes to the trash for **30 days**, then is hard deleted | Gone. No version history in the MVP | May contain health data: minimize, don't hoard | Processor |
| R8 | Trainingslogs en -historie / Workout logs and history | Follow the client (R5–R6) | As R6 | Part of the client record | Processor |
| R9 | Lidmaatschap van een trainer beëindigd / Trainer membership ended | Membership deactivated immediately; the trainer's name stays on past sessions as the workspace's record for as long as the session exists | Pseudonymized ("Former trainer") 24 months after the membership ends | The workspace needs to know who gave a session; not forever | Processor |
| R10 | Gebruikersaccount (owner, trainer, klant) / User account (owner, trainer, client) | Until the user deletes it; **inactive 24 months** (no sign-in, no bookings, no memberships) → email warning, deleted 30 days later | Account deleted; workspace data stays with the workspace | Account data is ours (P1); no reason to keep dormant accounts | Controller (P1) |
| R11 | **Beëindigde workspace** / **Terminated workspace** | Export available **30 days** after the end of the agreement | Deleted from production **within 30 days after that** (max. 60 days after the end); backups expire per R16 | Processor agreement art. 11 | Processor |
| R12 | Audit log (notitie-toegang, admin-acties) / Audit log (note access, admin actions) | **12 months** | Deleted | Long enough to investigate a complaint or a breach | Processor (W10) |
| R13 | Applicatie- en hostinglogs / Application and hosting logs | **Max 30 days** (or shorter if the provider's plan is shorter) | Deleted by the provider | Debugging. Logs contain no note content, no tokens and masked emails | Processor / controller (P3) |
| R14 | Beveiliging / misbruik (IP, gehasht e-mailadres, rate-limit tellers) / Security and abuse (IP, hashed email, rate-limit counters) | **24 h** rolling; block-list entries **30 days** | Deleted | Stop hold spam (R5 in the roadmap risk register) without long-term tracking | Controller (P3) |
| R15 | Foutrapporten (Sentry) / Error reports (Sentry) | Provider retention, **max 90 days**; set to the shortest available | Deleted by Sentry | Fix bugs. Scrubbed of personal data | Processor |
| R16 | **Back-ups** / **Backups** | Neon point-in-time restore (window depends on plan) + own daily encrypted logical backups kept **30 days** in the EU (E016) | Expire automatically | Recover from mistakes and incidents (restore drill at M9) | Processor |
| R17 | Productanalyse (PostHog) / Product analytics (PostHog) | **12 months** | Deleted | Pilot observation and year-on-year comparison | Controller (P4) |
| R18 | E-mailbezorglogs (e-maildienst) / Email delivery logs (email provider) | Shortest the provider allows, **max 30 days** | Deleted by the provider | Answer "I didn't get the email" | Processor |
| R19 | Supportcorrespondentie / Support correspondence | **24 months** after the ticket closes | Deleted | Context for recurring issues | Controller (P2) / processor if it contains workspace data |
| R20 | Contracten, getekende verwerkersovereenkomsten / Contracts, signed processor agreements | Duration of the agreement + **5 years** | Deleted | Accountability and the 5-year limitation period for claims (art. 3:310 BW) | Controller (P5) |
| R21 | Facturen (vanaf betaalde plannen) / Invoices (once plans are paid) | **7 years** | Deleted | Dutch fiscal retention obligation (art. 52 AWR) | Controller (P5) |

</details>

## 3. Toelichting per onderwerp / Notes per topic

### 3.1 Gastboekingen en verlopen holds / Guest bookings and expired holds

**NL.**

- Een hold die niet binnen 10–15 minuten via de magic link wordt bevestigd, krijgt direct de status `expired`. Dat gebeurt lazily, bij het lezen van de capaciteit (ADR-010), zodat de plek vrijkomt.
- De dagelijkse cron verwijdert de persoonsgegevens van holds die langer dan 24 uur verlopen zijn. Een verlopen hold staat dus hoogstens ongeveer 48 uur in de database.
- Een bevestigde gastboeking is een gewone boeking van de workspace (R4).

**EN.**

- A hold that isn't confirmed through the magic link within 10–15 minutes immediately gets the status `expired`. This happens lazily, when capacity is read (ADR-010), so the spot is freed.
- The daily cron removes the personal data of holds that expired more than 24 hours ago. An expired hold therefore stays in the database for about 48 hours at most.
- A confirmed guest booking is an ordinary workspace booking (R4).

### 3.2 Verwijderde klanten / Deleted clients

**NL.**

- "Klant verwijderen" in de app zet de klant 30 dagen in de prullenbak. Daarna verwijdert de cron alles wat naar de persoon herleidbaar is (R6).
- Een verwijderverzoek van de klant zelf gaat via de workspace. Als het bij ons binnenkomt, sturen we het binnen 5 werkdagen door (verwerkersovereenkomst art. 8).
- Bij een verwijderverzoek kan de workspace de prullenbak overslaan: direct definitief verwijderen.

**EN.**

- "Delete client" in the app puts the client in the trash for 30 days. After that, the cron deletes everything that can be traced to the person (R6).
- A deletion request from the client goes through the workspace. If it reaches us, we forward it within 5 working days (processor agreement art. 8).
- For a deletion request, the workspace can skip the trash and delete permanently straight away.

### 3.3 Notities / Notes

**NL.**

- Notities kunnen gezondheidsgegevens bevatten.
- We bewaren geen versiegeschiedenis: een bewerking overschrijft de vorige tekst.
- De review na 24 maanden inactiviteit (R5) zorgt dat oude gezondheidsinformatie niet ongemerkt blijft staan.
- De app moedigt trainers aan alleen vast te leggen wat nodig is voor de training (zie `dpia-assessment.md` §5).

**EN.**

- Notes may contain health data.
- We keep no version history: an edit overwrites the previous text.
- The review after 24 months of inactivity (R5) makes sure old health information doesn't linger unnoticed.
- The app encourages trainers to record only what the training needs (see `dpia-assessment.md` §5).

### 3.4 Logs

**NL.**

- Logs zijn er om fouten te vinden, niet om mensen te volgen.
- Regels: geen notitie-inhoud, geen tokens of magic links, e-mailadressen gemaskeerd (`a***@example.nl`) en geen request bodies.
- De audit log (R12) is de enige log die bewust vastlegt wie welke notitie bekeek. Die is alleen zichtbaar voor de owner van de workspace.

**EN.**

- Logs exist to find bugs, not to track people.
- Rules: no note content, no tokens or magic links, masked email addresses (`a***@example.nl`) and no request bodies.
- The audit log (R12) is the only log that deliberately records who viewed which note. Only the workspace owner can see it.

### 3.5 Back-ups / Backups

**NL.**

- Na verwijdering kan een persoon nog tot 30 dagen in een back-up staan (R16).
- Moeten we een back-up terugzetten, dan voeren we direct daarna alle verwijderingen uit die sinds die back-up zijn gedaan. Daarvoor bewaren we een **verwijderlog**: alleen de ID's van verwijderde records, geen inhoud, 30 dagen lang (E016).
- Zo komt verwijderde informatie niet terug.

**EN.**

- After deletion, a person can remain in a backup for up to 30 days (R16).
- If we ever need to restore a backup, we immediately re-apply every deletion made since that backup. For this we keep a **deletion log**: only the IDs of deleted records, no content, for 30 days (E016).
- That way deleted information doesn't come back.

## 4. Implementatie-eisen / Implementation requirements

| # | Eis (NL) | Requirement (EN) | Enabler |
|---|---|---|---|
| I1 | Elke termijn in §2 is een benoemde constante in `packages/domain`, met een test | Every period in §2 is a named constant in `packages/domain`, with a test | E014 |
| I2 | De dagelijkse cron voert R1–R10, R12 en R14 uit en logt aantallen (geen inhoud) | The daily cron enforces R1–R10, R12 and R14 and logs counts (no content) | E012 |
| I3 | Integratietests bewijzen dat na verwijdering (R6) geen naam, e-mail of notitie meer te vinden is, ook niet via de audit log | Integration tests prove that after deletion (R6) no name, email or note can be found, including through the audit log | E014, `TESTING.md` |
| I4 | Export per klant en per workspace in een gangbaar formaat (JSON + CSV) | Export per client and per workspace in a common format (JSON + CSV) | E014 |
| I5 | De retentie bij providers (Sentry, PostHog, e-mail, hosting-logs) is ingesteld op de waarden in §2 en vastgelegd in de runbook | Provider retention (Sentry, PostHog, email, hosting logs) is set to the values in §2 and recorded in the runbook | E009, E016 |
| I6 | Restore-drill inclusief het opnieuw toepassen van het verwijderlog | Restore drill including re-applying the deletion log | E016 |
