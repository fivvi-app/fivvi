# Subverwerkers / Sub-processors

> **⚠️ CONCEPT — GEEN JURIDISCH ADVIES.** Opgesteld door een AI-agent, niet gecontroleerd door een jurist. De Nederlandse tekst is leidend.
> **⚠️ DRAFT — NOT LEGAL ADVICE.** Written by an AI agent, not reviewed by a lawyer. The Dutch text prevails.

| | |
|---|---|
| **Versie / Version** | 0.1 · 22 september 2026 |
| **Status** | Bijlage 3 bij de [verwerkersovereenkomst](verwerkersovereenkomst.md) / Annex 3 to the [processor agreement](verwerkersovereenkomst.md) |
| **Bron / Source** | ADR-005, 009, 011, 013 and the E013 Turnstile choice; `ROADMAP.md` §4.3 and §12. |
| **DPA's gecontroleerd / DPAs checked** | 22 september 2026; Brevo: 29 september 2026 |

**NL.** Dit is de lijst van derde partijen die persoonsgegevens verwerken voor Fivvi. Een workspace geeft met de verwerkersovereenkomst algemene toestemming voor deze subverwerkers (art. 28(2) AVG). Wijzigingen melden we vooraf (verwerkersovereenkomst art. 7). Voorwaarden van aanbieders veranderen vaak. Controleer de links opnieuw vóór G2 en vóór G4.

**EN.** This is the list of third parties that process personal data for Fivvi. Through the processor agreement, a workspace gives general authorization for these sub-processors (GDPR art. 28(2)). We announce changes in advance (processor agreement art. 7). Provider terms change often. Re-check the links before G2 and before G4.

---

## 1. Subverwerkers van workspace-gegevens / Sub-processors of workspace data

| Dienst | Entiteit | Doel | Verwerkte gegevens | Regio (opslag) | Doorgifte buiten EER | DPA | ADR | Status |
|---|---|---|---|---|---|---|---|---|
| **Railway** | Railway Corporation, San Francisco, VS | Hosting web + API, cron en PostgreSQL | Requestgegevens, runtime-logs; **alle databasegegevens**, inclusief notities die gezondheidsgegevens kunnen bevatten | App en database: EU West, Amsterdam (`europe-west4-drams3a`) | Railway noemt primaire verwerking in de VS; DPF waar van toepassing of SCC volgens de DPA | [railway.com/legal/dpa](https://railway.com/legal/dpa). Ondertekening en bijzondere persoonsgegevens: zie §3 | 005, 011 | Gekozen; DPA-controle vóór echte gegevens |
| **Brevo** | Sendinblue SAS (Brevo), Parijs, FR | Transactionele e-mail: magic link, 6-cijferige code, bevestigingen, annuleringen, uitnodigingen | E-mailadres ontvanger, naam, taal, inhoud van de mail (sessienaam, tijd, locatie), bezorglogs en e-mailvoorbeelden, open- en klikgegevens (zie §4) | EU: OVH in Frankrijk en Duitsland, Google Cloud in België (back-ups) | Opslag in de EU. Groepsbedrijven in de VS en India hebben toegang voor support en beheer; enkele optionele functies gebruiken Amerikaanse subverwerkers. SCC in de DPA | Bijlage 3 (Appendix 3) bij de [Brevo-voorwaarden](https://www.brevo.com/legal/termsofuse/), onderdeel van de overeenkomst; geen aparte ondertekening | 009 | Gekozen; ingericht in E006 (alleen testverzending). Open punten: §4 |
| **Sentry** | Functional Software, Inc. (h.o.d.n. Sentry), VS | Fout- en crashrapportage voor web, API, iOS en Android | Stacktraces, route, app-/OS-versie, apparaatgegevens zoals het model (zonder apparaatnaam), pseudoniem gebruikers-ID. iOS en Android melden ook elke gebruiksperiode van de app en of die in een crash eindigde, voor het crashvrije percentage. Zolang niemand is ingelogd, sturen de apps als gebruikers-ID een willekeurig ID per installatie dat de Sentry-SDK aanmaakt. Sentry telt er crashvrije gebruikers mee. Het ID is pseudoniem en niet aan een persoon gekoppeld. iOS stuurt ook een hash van apparaat en app (`device_app_hash`). **Geen** request bodies, notitie-inhoud of e-mail; de apps zetten geen IP-adres in wat ze naar Sentry sturen, al ziet Sentry het IP-adres van het toestel wel bij de verbinding (standaard-PII uit: `dataCollection` in web/API/cron en Android, `sendDefaultPii: false` in iOS; plus scrubbing in `beforeSend`/`beforeBreadcrumb`) | **EU-regio, Frankfurt** (`de.sentry.io`). Keuze bij het aanmaken van de organisatie, later niet te wijzigen; beschikbaar op het gratis plan | DPF, met SCC als terugvaloptie | [sentry.io/legal/dpa](https://sentry.io/legal/dpa/). Accepteren in de juridische instellingen van de organisatie | 013 | ✅ Gebruiken; organisatie in de EU-regio aanmaken |
| **Cloudflare Turnstile** | Cloudflare, Inc., VS | Botbescherming op het publieke boekingsformulier (E013) | IP-adres, TLS-fingerprint, user-agent, sitekey/origin | Wereldwijd edge-netwerk (voor Nederlandse bezoekers meestal EU-locaties; niet gegarandeerd) | SCC; DPF | [Cloudflare-DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) (v6.4, 3 april 2026). **Let op:** Cloudflare is zelf verwerkingsverantwoordelijke als het deze signalen gebruikt om botdetectie te verbeteren. Vermelden in de privacyverklaring | E013 | ✅ Gebruiken (M5) |

<details>
<summary>English version of the table</summary>

| Service | Entity | Purpose | Data processed | Region (at rest) | Transfer outside the EEA | DPA | ADR | Status |
|---|---|---|---|---|---|---|---|---|
| **Railway** | Railway Corporation, San Francisco, US | Hosting web + API, cron and PostgreSQL | Request data, runtime logs; **all database data**, including notes that may contain health data | App and database: EU West, Amsterdam (`europe-west4-drams3a`) | Railway states that its primary processing takes place in the US; DPF where applicable or SCC under the DPA | [railway.com/legal/dpa](https://railway.com/legal/dpa). Execution and special-category data: see §3 | 005, 011 | Selected; DPA check before real data |
| **Brevo** | Sendinblue SAS (Brevo), Paris, FR | Transactional email: magic link, 6-digit code, confirmations, cancellations, invitations | Recipient email, name, language, email content (session name, time, location), delivery logs and email previews, open and click data (see §4) | EU: OVH in France and Germany, Google Cloud in Belgium (backups) | Stored in the EU. Group companies in the US and India have support and operations access; some optional features use US sub-processors. SCCs in the DPA | Appendix 3 to the [Brevo terms](https://www.brevo.com/legal/termsofuse/), part of the agreement; no separate signature | 009 | Selected; set up in E006 (test sending only). Open items: §4 |
| **Sentry** | Functional Software, Inc. (d/b/a Sentry), US | Error and crash reporting for web, API, iOS and Android | Stack traces, route, app/OS version, device details such as the model (without the device name), pseudonymous user ID. iOS and Android also report each period of app use and whether it ended in a crash, for the crash-free rate. While nobody is signed in, the apps send, as the user ID, a random per-installation ID that the Sentry SDK creates. Sentry counts crash-free users with it. The ID is pseudonymous and not linked to a person. iOS also sends a hash of device and app (`device_app_hash`). **No** request bodies, note content or email; the apps put no IP address in what they send to Sentry, though Sentry does see the device's IP address on the connection (default PII off: `dataCollection` in web/API/cron and Android, `sendDefaultPii: false` in iOS; plus scrubbing in `beforeSend`/`beforeBreadcrumb`) | **EU region, Frankfurt** (`de.sentry.io`). Chosen when the org is created and can't be changed later; available on the free plan | DPF, with SCC as fallback | [sentry.io/legal/dpa](https://sentry.io/legal/dpa/). Accept it in the org's legal settings | 013 | ✅ Use; create the org in the EU region |
| **Cloudflare Turnstile** | Cloudflare, Inc., US | Bot protection on the public booking form (E013) | IP address, TLS fingerprint, user agent, site key/origin | Global edge network (for Dutch visitors, usually EU edge locations; not guaranteed) | SCC; DPF | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) (v6.4, 3 April 2026). **Note:** Cloudflare acts as an independent controller when it uses these signals to improve bot detection. Mention this in the privacy policy | E013 | ✅ Use (M5) |

</details>

## 2. Verwerkers voor eigen doelen van de aanbieder / Processors for the provider's own purposes

**NL.** Deze dienst verwerkt geen boekings-, trainings- of notitie-inhoud van klanten. Pseudonieme gebruikers- en workspace-ID's blijven wel persoonsgegevens. Wij zijn voor deze productanalyse verwerkingsverantwoordelijke; daarom staat de dienst apart van de subverwerkers die workspace-gegevens in onze opdracht verwerken.

**EN.** This service receives no client booking, workout or note content. Pseudonymous user and workspace IDs still count as personal data. We are the controller for this product analytics processing, so the service is listed separately from sub-processors that handle workspace data on our behalf.

| Dienst / Service | Entiteit / Entity | Doel / Purpose | Gegevens / Data | Regio / Region | DPA | ADR |
|---|---|---|---|---|---|---|
| **PostHog** | PostHog, Inc., VS / US | Productanalyse, cookieloze modus (P4 in `role-mapping.md`) / Product analytics, cookieless mode | Toegestane gebeurtenistypen en pseudonieme gebruikers- en workspace-ID's. Paginaweergaven van de webapp, cookieloos (geen cookie, niets blijft in de browser bewaard): het URL-pad zonder querystring of fragment, browser en versie, besturingssysteem en versie, apparaattype, de volledige user-agent en de tijdzone. Onze routes zetten ID's van records in het pad, nooit namen. Een pad dat een bezoeker zelf intypt, gaat ongewijzigd mee. PostHog ontvangt daarbij het IP-adres van de browser en maakt er met onder meer de user-agent een dagelijkse hash van om unieke bezoekers te tellen. **Geen** namen, e-mail, boekings-, trainings- of notitie-inhoud, vrije tekst, URL-parameters, paginatitel of referrer / Allowlisted event types and pseudonymous user and workspace IDs. Page views of the web app, cookieless (no cookie, nothing kept in the browser): the URL path without query string or fragment, browser and version, operating system and version, device type, the full user agent and the time zone. Our routes put record IDs in the path, never names. A path a visitor types in is sent as it is. PostHog receives the browser's IP address with them and hashes it daily, together with the user agent among other things, to count unique visitors. **No** names, email, booking, workout or note content, free text, URL parameters, page title or referrer | **EU Cloud, Frankfurt** | [posthog.com/dpa](https://posthog.com/dpa). Op elk plan, ook gratis; zelf te ondertekenen in de PostHog-app / Available on every plan including free; self-serve signature in the app | 013 |

## 3. Railway DPA vóór echte gegevens / Railway DPA before real data

**NL.**

- ADR-011 kiest Railway in Amsterdam voor web, API, cron **en PostgreSQL**. Vercel en Neon maken geen deel uit van de geplande verwerking.
- De [Railway-DPA](https://railway.com/legal/dpa) zegt dat zij pas bindend wordt nadat de klant het DocuSign-formulier indient **en Railway tekent**. Controleer de getekende overeenkomst uiterlijk bij G2 (ADR-011); sinds roadmap v1.20 komen echte gegevens pas bij de pilotopzet binnen, vóór G4.
- Bijlage A van de gepubliceerde Railway-DPA vermeldt voor bijzondere persoonsgegevens **“None”**. Notities kunnen gezondheidsgegevens bevatten. Leg vóór M7 schriftelijk vast dat de DPA deze verwerking dekt, of zorg dat er geen gezondheidsgegevens op Railway worden opgeslagen tot dit is opgelost.
- De DPA noemt primaire verwerking in de VS, ook wanneer app en database in Amsterdam staan. Documenteer de toepasselijke doorgiftegrondslag en bevestig de ingestelde regio voor app, database en back-ups.

**EN.**

- ADR-011 selects Railway in Amsterdam for web, API, cron **and PostgreSQL**. Vercel and Neon are not part of the planned processing.
- The [Railway DPA](https://railway.com/legal/dpa) says it becomes binding only after the customer submits the DocuSign form **and Railway signs**. Check the executed agreement no later than G2 (ADR-011); since roadmap v1.20 real data first enters at pilot setup, before G4.
- Exhibit A of Railway's published DPA lists **“None”** for special-category personal data. Notes may contain health data. Obtain written confirmation that the DPA covers this processing before M7, or keep health data off Railway until resolved.
- The DPA says primary processing takes place in the US, even if the app and database are in Amsterdam. Document the applicable transfer mechanism and confirm the configured region for app, database and backups.

## 4. E-mail: Brevo / Email: Brevo

**NL.** De eigenaar heeft Brevo gekozen voor transactionele e-mail (ADR-009). E006 heeft de voorwaarden gecontroleerd op 29 september 2026 (details en bronnen: [`packages/email/README.md`](../../packages/email/README.md#brevo)):

- **Onderneming en opslag:** een Franse onderneming die in de EU opslaat (OVH in Frankrijk en Duitsland, Google Cloud in België). Dat past bij het roadmap-principe "EU-dataresidentie" (`ROADMAP.md §2`, principe 7).
- **Toegang van buiten de EU:** groepsbedrijven in de VS en India hebben toegang voor support en beheer, en enkele optionele functies (zoals AI) gebruiken Amerikaanse subverwerkers. EU-opslag betekent dus niet dat er geen doorgifte is. Grondslag: SCC in de DPA. We zetten Brevo's AI-functies niet aan.
- **DPA:** bijlage 3 (Appendix 3) bij de Brevo-voorwaarden (versie 1 oktober 2025). Die hoort bij de overeenkomst die je met de voorwaarden accepteert; aparte ondertekening is niet nodig. De DPA bevat de subverwerkerslijst.
- **Gratis plan:** 300 e-mails per dag, voor transactionele e-mail en campagnes samen. Bereiken we die grens, dan komen inloglinks niet meer aan (R14). Vóór G4: gebruikswaarschuwing en een betaald plan klaar.
- **Afzender:** `Fivvi` (noreply at fivvi.app). De eigenaar kocht fivvi.app op 21 oktober 2026. Zolang SPF, DKIM en DMARC niet staan, herschrijft Brevo het afzenderadres van een gratis mailbox naar `@brevosend.com`. Nog te doen: SPF, DKIM en DMARC voor fivvi.app in Brevo en DNS, vóór M5 (ADR-009).

**Open punten vóór echte e-mails (G2), voor de eigenaar:**

1. ~~**Bezorglogs en e-mailvoorbeelden**~~ Gedaan op 3 oktober 2026: Brevo bewaart **geen e-mailvoorbeelden** ("Never store previews"), dus geen inhoud of inloglinks. Bezorglogs worden na 1 maand verwijderd, het minimum dat Brevo toestaat (standaard: onbeperkt). Dat kan een dag langer zijn dan de 30 dagen in de bewaartermijnen; R18 noemt die uitzondering.
2. **Open- en kliktracking:** Brevo voegt een trackingpixel toe en leidt links om via een eigen domein. Op het gratis plan is dat in de instellingen niet uit te zetten. Anoniem tracken staat aan sinds 3 oktober 2026. We hebben het niet nodig, en inlog- en bevestigingslinks horen niet via een omleiding te lopen: met kliktracking komt het eenmalige inlogtoken in Brevo's klikgegevens terecht. Gevraagd aan Brevo-support op 22 oktober 2026; Brevo kan het uitzetten en vroeg om een voorbeeldlink en de bevestiging dat we klikgegevens kwijtraken. Beide gestuurd op 30 oktober 2026. Een eigen trackingsubdomein (dat Brevo aanbood) lost het niet op: links lopen dan nog steeds via de tracker. Nog te doen: Brevo bevestigt dat tracking uit staat.
3. ~~**Toegestane IP-adressen**~~ Gedaan op 3 oktober 2026: IP-blokkering staat uit voor API-sleutels, omdat Railway geen vaste IP-adressen heeft. Gebruik aparte sleutels voor ontwikkeling en productie, en vervang een sleutel direct als die uitlekt.
4. ~~**Pdf van de DPA**~~ Gedaan op 30 oktober 2026: de eigenaar heeft de Brevo-voorwaarden (versie 1 oktober 2025, met de DPA in Appendix 3 en de subverwerkerslijst) als pdf bewaard, buiten de repo. Controleer vóór G4 of Brevo een nieuwe versie heeft en bewaar die dan ook.
5. **List-Unsubscribe-header:** Brevo voegt die toe aan alle e-mail, ook transactionele, en kan hem niet weghalen (antwoord van Brevo-support, 22 oktober 2026). De eigenaar accepteert dat risico (R1, 30 oktober 2026): de header verandert geen links. Open vraag aan Brevo: blokkeert een afmelding via de header het adres ook voor transactionele e-mail? Dan krijgt dat adres geen inlogcode meer, en hebben we een manier nodig om zo'n blokkade te zien en op te heffen.

**EN.** The owner selected Brevo for transactional email (ADR-009). E006 checked the terms on 29 September 2026 (details and sources: [`packages/email/README.md`](../../packages/email/README.md#brevo)):

- **Company and storage:** a French company that stores data in the EU (OVH in France and Germany, Google Cloud in Belgium). This fits the roadmap principle "EU data residency" (`ROADMAP.md §2`, principle 7).
- **Access from outside the EU:** group companies in the US and India have support and operations access, and some optional features (such as AI) use US sub-processors. EU storage doesn't mean there is no transfer. Mechanism: SCCs in the DPA. We don't enable Brevo's AI features.
- **DPA:** Appendix 3 to the Brevo terms (version of 1 October 2025). It is part of the agreement you accept with the terms; no separate signature is needed. It includes the sub-processor list.
- **Free plan:** 300 emails per day, shared by transactional and marketing email. Hitting the cap would stop sign-in links (R14). Before G4: a usage alert and a paid plan ready.
- **Sender:** `Fivvi` (noreply at fivvi.app). The owner bought fivvi.app on 21 October 2026. Until SPF, DKIM and DMARC are in place, Brevo rewrites a free-mailbox From address to `@brevosend.com`. Still to do: SPF, DKIM and DMARC for fivvi.app in Brevo and DNS, before M5 (ADR-009).

**Open items before real emails (G2), for the owner:**

1. ~~**Delivery logs and email previews**~~ Done on 3 October 2026: Brevo stores **no email previews** ("Never store previews"), so no content or sign-in links. Delivery logs are deleted after 1 month, the minimum Brevo allows (default: indefinitely). That can be a day longer than the 30 days in the retention policy; R18 records that exception.
2. **Open and click tracking:** Brevo adds a tracking pixel and redirects links through its own domain. The free plan can't switch this off in the settings. Anonymous tracking is on since 3 October 2026. We don't need it, and sign-in and confirmation links shouldn't go through a redirect: with click tracking, the one-time sign-in token ends up in Brevo's click data. Asked Brevo support on 22 October 2026; Brevo can switch it off and asked for an example link and our confirmation that click data is lost. Both sent on 30 October 2026. A branded tracking subdomain (which Brevo offered) doesn't solve it: links still go through the tracker. Still to do: Brevo confirms tracking is off.
3. ~~**Authorized IPs**~~ Done on 3 October 2026: IP blocking is off for API keys, because Railway has no fixed IP addresses. Use separate keys for development and production, and rotate a key at once if it leaks.
4. ~~**PDF of the DPA**~~ Done on 30 October 2026: the owner saved the Brevo terms (version of 1 October 2025, with the DPA in Appendix 3 and the sub-processor list) as a PDF, outside the repo. Before G4, check whether Brevo has a newer version and save that too.
5. **List-Unsubscribe header:** Brevo adds it to all email, transactional included, and can't remove it (Brevo support's answer, 22 October 2026). The owner accepts that risk (R1, 30 October 2026): the header changes no links. Open question to Brevo: does an unsubscribe through the header also block the address for transactional email? Then that address no longer gets its sign-in code, and we need a way to see and lift such a block.

## 5. Geen subverwerker (onder voorwaarden) / Not a sub-processor (on conditions)

| Dienst | Waarom niet | Voorwaarde |
|---|---|---|
| Uptime-monitor (UptimeRobot / Better Stack) | Pingt alleen publieke URL's | Health-endpoint geeft geen gegevens terug; meldingen bevatten geen persoonsgegevens |
| GitHub (repo, Actions CI) | Alleen broncode en synthetische testgegevens | Geen productiegegevens, dumps, pilotbestanden of echte namen in de repo, issues, PR's of CI-logs |
| AI-codeeragents (GitHub Copilot, Anthropic Claude Code, OpenAI Codex) | Zij bouwen de software; ze voeren de dienst niet uit | **Nooit** productietoegang, echte exports, Excel-bestanden van de pilot of screenshots met echte gegevens (D8 in `role-mapping.md`). Verandert dat, dan worden ze subverwerker en zijn DPA's nodig |
| Better Auth | Een bibliotheek die in onze eigen backend draait, geen externe dienst | — |
| Apple (TestFlight, App Store), Google (Play Console) | App-distributie. Apple en Google zijn zelf verwerkingsverantwoordelijke voor store- en testeraccounts | Opnieuw bekijken bij 1.2 als pushmeldingen (APNs/FCM) komen; pushberichten zonder persoonsgegevens |
| Domeinregistrar / DNS | DNS bevat geen persoonsgegevens | fivvi.app is gekocht (21 oktober 2026); registrar en DNS-host nog invullen (`ROADMAP.md §4.5`) |

<details>
<summary>English version of the table</summary>

| Service | Why not | Condition |
|---|---|---|
| Uptime monitor (UptimeRobot / Better Stack) | Pings public URLs only / Only pings public URLs | Health endpoint returns no data; alerts contain no personal data |
| GitHub (repo, Actions CI) | Source code and synthetic test data only | No production data, dumps, pilot files or real names in the repo, issues, PRs or CI logs |
| AI coding agents (GitHub Copilot, Anthropic Claude Code, OpenAI Codex) | They build the software; they don't operate the service | **Never** give them production access, real exports, pilot Excel files or screenshots with real data (D8 in `role-mapping.md`). If that ever changes, they become sub-processors and need DPAs |
| Better Auth | A library running inside our own backend, not a third-party service | — |
| Apple (TestFlight, App Store), Google (Play Console) | App distribution. Apple and Google are independent controllers for store and tester accounts | Revisit at 1.2 when push notifications (APNs/FCM) arrive; keep push payloads free of personal data |
| Domain registrar / DNS | DNS contains no personal data | fivvi.app is bought (21 October 2026); fill in the registrar and DNS host (`ROADMAP.md §4.5`) |

</details>

## 6. Doorgifte naar de VS / Transfers to the US

**NL.**

- Railway, Sentry, Cloudflare en PostHog zijn Amerikaanse aanbieders. EU-opslag sluit toegang of verwerking buiten de EER niet uit; Railway noemt primaire verwerking in de VS in zijn DPA.
- De doorgifte steunt op het EU-VS Data Privacy Framework (adequaatheidsbesluit juli 2023) en/of de standaardcontractbepalingen (SCC 2021) in de DPA's.
- Het DPF blijft onderwerp van procedures. Houd de SCC's daarom als terugvaloptie en controleer dit bij elke herziening.
- Maatregelen: EU-regio's kiezen waar dat kan, versleuteling in transit en in rust, en dataminimalisatie (geen notities in e-mails, logs, foutrapporten of analytics).

**EN.**

- Railway, Sentry, Cloudflare and PostHog are US providers. EU storage does not rule out access or processing outside the EEA; Railway states in its DPA that primary processing takes place in the US.
- Transfers rely on the EU-US Data Privacy Framework (adequacy decision of July 2023) and/or the standard contractual clauses (SCC 2021) in the DPAs.
- The DPF is still being litigated, so keep the SCCs as the fallback and re-check this at every review.
- Measures: EU regions wherever possible, encryption in transit and at rest, and data minimization (no notes in emails, logs, error reports or analytics).

## 7. Wijzigingslog / Change log

| Datum / Date | Wijziging / Change |
|---|---|
| 2026-09-22 | First draft from the ROADMAP ADR table; DPA links checked |
| 2026-09-22 | Railway hosting and Postgres; Brevo email selected; Railway DPA checks recorded |
| 2026-09-29 | E006: Brevo terms checked (storage, access from the US and India, DPA, free plan, tracking, log retention); open items in §4 |
| 2026-10-13 | GitHub Copilot added to the AI coding agents in §5: not a sub-processor, on the same conditions (no production data, real exports or pilot files) |
| 2026-10-30 | Brevo (§4): the DPA is Appendix 3 of the terms (version of 1 October 2025) and the owner saved its PDF; R18 has the Brevo log-retention exception; the tracking request waits on Brevo; the List-Unsubscribe risk is accepted (R1) |
