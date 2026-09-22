# Subverwerkers / Sub-processors

> **⚠️ CONCEPT — GEEN JURIDISCH ADVIES.** Opgesteld door een AI-agent, niet gecontroleerd door een jurist. De Nederlandse tekst is leidend.
> **⚠️ DRAFT — NOT LEGAL ADVICE.** Written by an AI agent, not reviewed by a lawyer. The Dutch text prevails.

| | |
|---|---|
| **Versie / Version** | 0.1 · 22 september 2026 |
| **Status** | Bijlage 3 bij de [verwerkersovereenkomst](verwerkersovereenkomst.md) / Annex 3 to the [processor agreement](verwerkersovereenkomst.md) |
| **Bron / Source** | ADR-005, 009, 011, 013 and the E013 Turnstile choice, **as listed in `ROADMAP.md` §4.3 and §12**. The ADR write-ups in `docs/decisions/` weren't merged when this was drafted. |
| **DPA's gecontroleerd / DPAs checked** | 22 september 2026 |

**NL.** Dit is de lijst van derde partijen die persoonsgegevens verwerken voor Trainer Hub. Een workspace geeft met de verwerkersovereenkomst algemene toestemming voor deze subverwerkers (art. 28(2) AVG). Wijzigingen melden we vooraf (verwerkersovereenkomst art. 7). Voorwaarden van aanbieders veranderen vaak. Controleer de links opnieuw vóór G2 en vóór G4.

**EN.** This is the list of third parties that process personal data for Trainer Hub. Through the processor agreement, a workspace gives general authorization for these sub-processors (GDPR art. 28(2)). We announce changes in advance (processor agreement art. 7). Provider terms change often. Re-check the links before G2 and before G4.

---

## 1. Subverwerkers van workspace-gegevens / Sub-processors of workspace data

| Dienst | Entiteit | Doel | Verwerkte gegevens | Regio (opslag) | Doorgifte buiten EER | DPA | ADR | Status |
|---|---|---|---|---|---|---|---|---|
| **Vercel** (nu Hobby; Pro nodig voor echte gegevens) | Vercel Inc., Delaware, VS | Hosting web + API, serverless functies, CDN, runtime-logs | Alle requestgegevens tijdens transport; runtime-logs (vrij houden van persoonsgegevens, zie D6 in `role-mapping.md`) | Functies vastgezet op `fra1` (Frankfurt); CDN-edge wereldwijd | VS-moeder → SCC 2021 (volgens de DPA) | [vercel.com/legal/dpa](https://vercel.com/legal/dpa). **Geldt alleen voor Pro en Enterprise, niet voor Hobby** | 011 | ⚠️ **Geblokkeerd voor echte gegevens op Hobby**, zie §3 |
| **Railway** (alternatief voor web + API) | Railway Corporation, San Francisco, VS | Hosting web + API (containers) | Als Vercel | EU West Metal, Amsterdam (`europe-west4-drams3a`) | VS-moeder → DPF waar van toepassing + SCC | [railway.com/legal/dpa](https://railway.com/legal/dpa). Geen planbeperking genoemd; subverwerkers op trust.railway.com | 011 (herbeoordeling) | Kandidaat, zie §3 |
| **Neon** | Databricks, Inc. (moeder van Neon, LLC), VS | PostgreSQL-database, branches, point-in-time restore | **Alles in de database**, inclusief notities (mogelijk gezondheidsgegevens) | AWS `eu-central-1`, Frankfurt | VS-moeder → Databricks-DPA met SCC 2021 | [neon.com/dpa](https://neon.com/dpa) (Neon-productschema) + [Databricks-DPA](https://www.databricks.com/legal/databricks-data-processing-addendum); subverwerkers op [databricks.com/legal/databricks-subprocessors](https://www.databricks.com/legal/databricks-subprocessors) (o.a. Grafana Labs, VS, voor infrastructuurmonitoring) | 005, 011 | ✅ Gebruiken; bevestigen dat de DPA het gratis plan dekt (open vraag Q6) |
| **Brevo** (aanbevolen e-mailoptie) | Sendinblue SAS (Brevo), Parijs, FR | Transactionele e-mail: magic link, 6-cijferige code, bevestigingen, annuleringen, uitnodigingen | E-mailadres ontvanger, naam, taal, inhoud van de mail (sessienaam, tijd, locatie), bezorg- en openlogs | EU | Niet nodig voor de kerndienst (EU-onderneming) | DPA als bijlage bij de [Brevo-voorwaarden](https://www.brevo.com/legal/termsofuse/) | 009 | Aanbevolen, zie §4 |
| **Resend** (alternatieve e-mailoptie) | Plus Five Five, Inc., VS | Als Brevo | Als Brevo | Verzenden kan via `eu-west-1` (Ierland), maar **account-, log- en metagegevens staan in de VS** | DPF + SCC | [resend.com/legal/dpa](https://resend.com/legal/dpa) | 009 | Alternatief, zie §4 |
| **Sentry** | Functional Software, Inc. (h.o.d.n. Sentry), VS | Fout- en crashrapportage voor web, API, iOS en Android | Stacktraces, route, app-/OS-versie, pseudoniem gebruikers-ID. **Geen** request bodies, notitie-inhoud of e-mail (`sendDefaultPii: false` + scrubbing) | **EU-regio, Frankfurt** (`de.sentry.io`). Keuze bij het aanmaken van de organisatie, later niet te wijzigen; beschikbaar op het gratis plan | DPF, met SCC als terugvaloptie | [sentry.io/legal/dpa](https://sentry.io/legal/dpa/). Accepteren in de juridische instellingen van de organisatie | 013 | ✅ Gebruiken; organisatie in de EU-regio aanmaken |
| **Cloudflare Turnstile** | Cloudflare, Inc., VS | Botbescherming op het publieke boekingsformulier (E013) | IP-adres, TLS-fingerprint, user-agent, sitekey/origin | Wereldwijd edge-netwerk (voor Nederlandse bezoekers meestal EU-locaties; niet gegarandeerd) | SCC; DPF | [Cloudflare-DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) (v6.4, 3 april 2026). **Let op:** Cloudflare is zelf verwerkingsverantwoordelijke als het deze signalen gebruikt om botdetectie te verbeteren. Vermelden in de privacyverklaring | E013 | ✅ Gebruiken (M5) |

<details>
<summary>English version of the table</summary>

| Service | Entity | Purpose | Data processed | Region (at rest) | Transfer outside the EEA | DPA | ADR | Status |
|---|---|---|---|---|---|---|---|---|
| **Vercel** (Hobby now; Pro needed for real data) | Vercel Inc., Delaware, US | Hosting web + API, serverless functions, CDN, runtime logs | All request data in transit; runtime logs (keep free of personal data, see D6 in `role-mapping.md`) | Functions pinned to `fra1` (Frankfurt); CDN edge is global | US parent → SCC 2021 (per the DPA) | [vercel.com/legal/dpa](https://vercel.com/legal/dpa). **Covers Pro and Enterprise only, not Hobby** | 011 | ⚠️ **Blocked for real data on Hobby**, see §3 |
| **Railway** (alternative for web + API) | Railway Corporation, San Francisco, US | Hosting web + API (containers) | As Vercel | EU West Metal, Amsterdam (`europe-west4-drams3a`) | US parent → DPF where applicable + SCC | [railway.com/legal/dpa](https://railway.com/legal/dpa). No plan restriction stated; sub-processors at trust.railway.com | 011 (re-evaluation) | Candidate, see §3 |
| **Neon** | Databricks, Inc. (parent of Neon, LLC), US | PostgreSQL database, branches, point-in-time restore | **Everything in the database**, including notes (possibly health data) | AWS `eu-central-1`, Frankfurt | US parent → Databricks DPA with SCC 2021 | [neon.com/dpa](https://neon.com/dpa) (Neon product schedule) + [Databricks DPA](https://www.databricks.com/legal/databricks-data-processing-addendum); sub-processors at [databricks.com/legal/databricks-subprocessors](https://www.databricks.com/legal/databricks-subprocessors) (includes Grafana Labs, US, for infrastructure monitoring) | 005, 011 | ✅ Use; confirm the DPA covers the free plan (open question Q6) |
| **Brevo** (recommended email option) | Sendinblue SAS (Brevo), Paris, FR | Transactional email: magic link, 6-digit code, confirmations, cancellations, invitations | Recipient email, name, language, email content (session name, time, location), delivery and open logs | EU | None needed for the core service (EU company) | DPA annex to the [Brevo terms](https://www.brevo.com/legal/termsofuse/) | 009 | Recommended, see §4 |
| **Resend** (alternative email option) | Plus Five Five, Inc., US | As Brevo | As Brevo | Sending can use `eu-west-1` (Ireland), but **account data, logs and metadata are stored in the US** | DPF + SCC | [resend.com/legal/dpa](https://resend.com/legal/dpa) | 009 | Alternative, see §4 |
| **Sentry** | Functional Software, Inc. (d/b/a Sentry), US | Error and crash reporting for web, API, iOS and Android | Stack traces, route, app/OS version, pseudonymous user ID. **No** request bodies, note content or email (`sendDefaultPii: false` + scrubbing) | **EU region, Frankfurt** (`de.sentry.io`). Chosen when the org is created and can't be changed later; available on the free plan | DPF, with SCC as fallback | [sentry.io/legal/dpa](https://sentry.io/legal/dpa/). Accept it in the org's legal settings | 013 | ✅ Use; create the org in the EU region |
| **Cloudflare Turnstile** | Cloudflare, Inc., US | Bot protection on the public booking form (E013) | IP address, TLS fingerprint, user agent, site key/origin | Global edge network (for Dutch visitors, usually EU edge locations; not guaranteed) | SCC; DPF | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) (v6.4, 3 April 2026). **Note:** Cloudflare acts as an independent controller when it uses these signals to improve bot detection. Mention this in the privacy policy | E013 | ✅ Use (M5) |

</details>

## 2. Verwerkers voor eigen doelen van de aanbieder / Processors for the provider's own purposes

**NL.** Deze dienst verwerkt geen klantgegevens van workspaces. Daarom is hij geen subverwerker in de zin van art. 28(4). We vermelden hem voor de transparantie.

**EN.** This service doesn't process workspace client data, so it is not a sub-processor under art. 28(4). We list it for transparency.

| Dienst / Service | Entiteit / Entity | Doel / Purpose | Gegevens / Data | Regio / Region | DPA | ADR |
|---|---|---|---|---|---|---|
| **PostHog** | PostHog, Inc., VS / US | Productanalyse, cookieloze modus (P4 in `role-mapping.md`) / Product analytics, cookieless mode | Type gebeurtenis, pseudonieme gebruikers- en workspace-ID's, pagina. **Geen** namen, e-mail, notitie-inhoud of vrije tekst / Event type, pseudonymous user and workspace IDs, page. **No** names, email, note content or free text | **EU Cloud, Frankfurt** | [posthog.com/dpa](https://posthog.com/dpa). Op elk plan, ook gratis; zelf te ondertekenen in de PostHog-app / Available on every plan including free; self-serve signature in the app | 013 |

## 3. Hosting: de Vercel Hobby-kwestie / Hosting: the Vercel Hobby issue

**NL.**

- De [DPA van Vercel](https://vercel.com/legal/dpa) geldt alleen voor klanten op **Pro- en Enterprise-plannen** (versie 17 maart 2026). Hobby valt erbuiten. Hobby is daarnaast alleen voor niet-commercieel gebruik (`ROADMAP.md §12`).
- Zonder DPA kunnen wij de eisen van art. 28(4) AVG niet doorgeven aan de hostingpartij. Dan mogen er **geen echte persoonsgegevens** op Vercel Hobby staan.
- De roadmap plant de upgrade bij **G4**. Maar echte gegevens komen al eerder binnen:
  - bij **G2 (M4)**, als de eigenaar het echte rooster invoert, inclusief privésessies met klantnamen;
  - en zeker bij **G3 (M6)**, als echte klanten via een QR-code boeken.
- **Opties:**
  - **A.** Web + API naar **Railway** in Amsterdam. De eigenaar betaalt Railway Hobby al. Railway's DPA noemt geen planbeperking. Neon Frankfurt blijft de database. Dit sluit aan bij de geplande herbeoordeling van ADR-011.
  - **B.** Vercel **Pro** vanaf G2 in plaats van G4 (betaald per teamlid per maand).
  - **C.** Vercel Hobby houden tot G4 en tot die tijd alleen synthetische gegevens gebruiken. Dat botst met de owner alpha bij G2.
- **Voorstel:** optie A, vast te leggen in de uitwerking van ADR-011. Tot die beslissing: alleen seed-/testgegevens op Vercel Hobby. Zie open vraag Q1.

**EN.**

- [Vercel's DPA](https://vercel.com/legal/dpa) only applies to customers on **Pro and Enterprise plans** (version of 17 March 2026). Hobby is excluded. Hobby is also for non-commercial use only (`ROADMAP.md §12`).
- Without a DPA we can't pass the art. 28(4) GDPR obligations on to the host. So **no real personal data** may sit on Vercel Hobby.
- The roadmap schedules the upgrade at **G4**. But real data arrives earlier:
  - at **G2 (M4)**, when the owner enters the real timetable, including private sessions with client names;
  - and certainly at **G3 (M6)**, when real clients book through a QR code.
- **Options:**
  - **A.** Move web + API to **Railway** in Amsterdam. The owner already pays for Railway Hobby. Railway's DPA states no plan restriction. Neon Frankfurt stays the database. This fits the planned re-evaluation of ADR-011.
  - **B.** Vercel **Pro** from G2 instead of G4 (paid per team member per month).
  - **C.** Keep Vercel Hobby until G4 and use only synthetic data until then. This conflicts with the owner alpha at G2.
- **Proposal:** option A, recorded in the ADR-011 write-up. Until that decision: only seed/test data on Vercel Hobby. See open question Q1.

## 4. E-mail: Brevo of Resend / Email: Brevo or Resend

**NL.** ADR-009 laat de keuze tussen Resend en Brevo open. Voor privacy heeft **Brevo** de voorkeur:

- Het is een EU-onderneming (Frankrijk) die in de EU opslaat. Er is dus geen doorgifte naar de VS nodig voor de kerndienst.
- Resend kan vanuit Ierland versturen, maar bewaart account- en loggegevens altijd in de VS.
- E-mails bevatten naam, e-mailadres en sessiegegevens, en de magic link is een inlogmiddel. Dat past bij het roadmap-principe "EU-dataresidentie" (`ROADMAP.md §2`, principe 7).
- Leg de keuze vast in de uitwerking van ADR-009 (open vraag Q5).

**EN.** ADR-009 leaves the choice between Resend and Brevo open. For privacy, **Brevo** is preferred:

- It is an EU company (France) that stores data in the EU, so the core service needs no transfer to the US.
- Resend can send from Ireland, but always stores account and log data in the US.
- Emails contain names, email addresses and session details, and the magic link is a sign-in credential. This fits the roadmap principle "EU data residency" (`ROADMAP.md §2`, principle 7).
- Record the choice in the ADR-009 write-up (open question Q5).

## 5. Geen subverwerker (onder voorwaarden) / Not a sub-processor (on conditions)

| Dienst | Waarom niet | Voorwaarde |
|---|---|---|
| Uptime-monitor (UptimeRobot / Better Stack) | Pingt alleen publieke URL's | Health-endpoint geeft geen gegevens terug; meldingen bevatten geen persoonsgegevens |
| GitHub (repo, Actions CI) | Alleen broncode en synthetische testgegevens | Geen productiegegevens, dumps, pilotbestanden of echte namen in de repo, issues, PR's of CI-logs |
| AI-codeeragents (Anthropic Claude Code, OpenAI Codex) | Zij bouwen de software; ze voeren de dienst niet uit | **Nooit** productietoegang, echte exports, Excel-bestanden van de pilot of screenshots met echte gegevens (D8 in `role-mapping.md`). Verandert dat, dan worden ze subverwerker en zijn DPA's nodig |
| Better Auth | Een bibliotheek die in onze eigen backend draait, geen externe dienst | — |
| Apple (TestFlight, App Store), Google (Play Console) | App-distributie. Apple en Google zijn zelf verwerkingsverantwoordelijke voor store- en testeraccounts | Opnieuw bekijken bij 1.2 als pushmeldingen (APNs/FCM) komen; pushberichten zonder persoonsgegevens |
| Domeinregistrar / DNS | DNS bevat geen persoonsgegevens | Registrar nog niet gekozen (`ROADMAP.md §4.5`) |

<details>
<summary>English version of the table</summary>

| Service | Why not | Condition |
|---|---|---|
| Uptime monitor (UptimeRobot / Better Stack) | Pings public URLs only / Only pings public URLs | Health endpoint returns no data; alerts contain no personal data |
| GitHub (repo, Actions CI) | Source code and synthetic test data only | No production data, dumps, pilot files or real names in the repo, issues, PRs or CI logs |
| AI coding agents (Anthropic Claude Code, OpenAI Codex) | They build the software; they don't operate the service | **Never** give them production access, real exports, pilot Excel files or screenshots with real data (D8 in `role-mapping.md`). If that ever changes, they become sub-processors and need DPAs |
| Better Auth | A library running inside our own backend, not a third-party service | — |
| Apple (TestFlight, App Store), Google (Play Console) | App distribution. Apple and Google are independent controllers for store and tester accounts | Revisit at 1.2 when push notifications (APNs/FCM) arrive; keep push payloads free of personal data |
| Domain registrar / DNS | DNS contains no personal data | Registrar not yet chosen (`ROADMAP.md §4.5`) |

</details>

## 6. Doorgifte naar de VS / Transfers to the US

**NL.**

- Alle diensten hierboven behalve Brevo hebben een Amerikaanse moederonderneming. Ook als de opslag in de EU staat, kan die moeder in theorie toegang krijgen, bijvoorbeeld voor support of door Amerikaanse wetgeving.
- De doorgifte steunt op het EU-VS Data Privacy Framework (adequaatheidsbesluit juli 2023) en/of de standaardcontractbepalingen (SCC 2021) in de DPA's.
- Het DPF blijft onderwerp van procedures. Houd de SCC's daarom als terugvaloptie en controleer dit bij elke herziening.
- Maatregelen: EU-regio's kiezen waar dat kan, versleuteling in transit en in rust, en dataminimalisatie (geen notities in e-mails, logs, foutrapporten of analytics).

**EN.**

- Every service above except Brevo has a US parent company. Even when storage is in the EU, that parent could in theory get access, for example for support or under US law.
- Transfers rely on the EU-US Data Privacy Framework (adequacy decision of July 2023) and/or the standard contractual clauses (SCC 2021) in the DPAs.
- The DPF is still being litigated, so keep the SCCs as the fallback and re-check this at every review.
- Measures: EU regions wherever possible, encryption in transit and at rest, and data minimization (no notes in emails, logs, error reports or analytics).

## 7. Wijzigingslog / Change log

| Datum / Date | Wijziging / Change |
|---|---|
| 2026-09-22 | First draft from the ROADMAP ADR table; DPA links checked |
