# Subverwerkers / Sub-processors

> **⚠️ CONCEPT — GEEN JURIDISCH ADVIES.** Opgesteld door een AI-agent, niet gecontroleerd door een jurist. De Nederlandse tekst is leidend.
> **⚠️ DRAFT — NOT LEGAL ADVICE.** Written by an AI agent, not reviewed by a lawyer. The Dutch text prevails.

| | |
|---|---|
| **Versie / Version** | 0.2 · 8 november 2026 |
| **Status** | Bijlage 3 bij de [verwerkersovereenkomst](verwerkersovereenkomst.md) / Annex 3 to the [processor agreement](verwerkersovereenkomst.md) |
| **Bron / Source** | ADR-005, 011, 013, 020, 028, 030 and the planned E013 Turnstile choice; `ROADMAP.md` §4.3 and §12. De publieke pagina (`/subverwerkers`, `/en/sub-processors`) volgt deze lijst; `apps/web/site/info/sub-processors-page.test.tsx` vergelijkt ze / The public page (`/subverwerkers`, `/en/sub-processors`) follows this list; `apps/web/site/info/sub-processors-page.test.tsx` compares them. |
| **DPA's gecontroleerd / DPAs checked** | 22 september 2026; Lettermint: 2 november 2026 (ADR-028); Zoho: nog niet / not yet (§2) |

**NL.** Dit is de lijst van derde partijen die persoonsgegevens verwerken voor Fivvi. Een workspace geeft met de verwerkersovereenkomst algemene toestemming voor deze subverwerkers (art. 28(2) AVG). Wijzigingen melden we vooraf (verwerkersovereenkomst art. 7). Voorwaarden van aanbieders veranderen vaak. Controleer de links opnieuw vóór G2 en vóór G4.

**EN.** This is the list of third parties that process personal data for Fivvi. Through the processor agreement, a workspace gives general authorization for these sub-processors (GDPR art. 28(2)). We announce changes in advance (processor agreement art. 7). Provider terms change often. Re-check the links before G2 and before G4.

---

## 1. Subverwerkers van workspace-gegevens / Sub-processors of workspace data

| Dienst | Entiteit | Doel | Verwerkte gegevens | Regio (opslag) | Doorgifte buiten EER | DPA | ADR | Status |
|---|---|---|---|---|---|---|---|---|
| **Railway** | Railway Corporation, San Francisco, VS | Hosting web + API, cron en PostgreSQL | Requestgegevens, runtime-logs; **alle databasegegevens**, inclusief notities die gezondheidsgegevens kunnen bevatten | App en database: EU West, Amsterdam (`europe-west4-drams3a`) | Railway noemt primaire verwerking in de VS; DPF waar van toepassing of SCC volgens de DPA | [railway.com/legal/dpa](https://railway.com/legal/dpa). Ondertekening en bijzondere persoonsgegevens: zie §3 | 005, 011 | Gekozen; DPA-controle vóór echte gegevens |
| **Lettermint** | Lettermint B.V., Zwolle, NL | Transactionele e-mail: inloglink, 6-cijferige code, uitnodigingen, bevestigingen, meldingen over wachtlijst en lidmaatschap; ook de e-mail met een demo-aanvraag van de website naar ons eigen supportadres (ADR-028, #398) | E-mailadres ontvanger, naam, taal, inhoud van de mail (zoals lesnaam, tijd, locatie; bij een demo-aanvraag de antwoorden van de bezoeker), bezorg- en gebeurtenisgegevens (zie §4) | EU: infrastructuur in Amsterdam (UpCloud) en Duitsland (OVH, versleutelde back-ups) | Alleen EU volgens de DPA (art. 8); geen doorgifte buiten de EER voor e-mailgegevens | DPA van Lettermint ([lettermint.co/dpa](https://lettermint.co/dpa)); geldt automatisch met de voorwaarden, ondertekening op verzoek. Subverwerkers van Lettermint: [lettermint.co/subprocessors](https://lettermint.co/subprocessors) | 028 | Gekozen; productie-inrichting en overstap volgen met #398. Open punten: §4 |
| **Sentry** | Functional Software, Inc. (h.o.d.n. Sentry), VS | Fout- en crashrapportage voor web, API, iOS en Android | Stacktraces, route, app-/OS-versie, apparaatgegevens zoals het model (zonder apparaatnaam), pseudoniem gebruikers-ID. iOS en Android melden ook elke gebruiksperiode van de app en of die in een crash eindigde, voor het crashvrije percentage. Zolang niemand is ingelogd, sturen de apps als gebruikers-ID een willekeurig ID per installatie dat de Sentry-SDK aanmaakt. Sentry telt er crashvrije gebruikers mee. Het ID is pseudoniem en niet aan een persoon gekoppeld. iOS stuurt ook een hash van apparaat en app (`device_app_hash`). **Geen** request bodies, notitie-inhoud of e-mail; de apps zetten geen IP-adres in wat ze naar Sentry sturen, al ziet Sentry het IP-adres van het toestel wel bij de verbinding (standaard-PII uit: `dataCollection` in web/API/cron en Android, `sendDefaultPii: false` in iOS; plus scrubbing in `beforeSend`/`beforeBreadcrumb`) | **EU-regio, Frankfurt** (`de.sentry.io`). Keuze bij het aanmaken van de organisatie, later niet te wijzigen; beschikbaar op het gratis plan | DPF, met SCC als terugvaloptie | [sentry.io/legal/dpa](https://sentry.io/legal/dpa/). Accepteren in de juridische instellingen van de organisatie | 013 | ✅ Gebruiken; organisatie in de EU-regio aanmaken |

<details>
<summary>English version of the table</summary>

| Service | Entity | Purpose | Data processed | Region (at rest) | Transfer outside the EEA | DPA | ADR | Status |
|---|---|---|---|---|---|---|---|---|
| **Railway** | Railway Corporation, San Francisco, US | Hosting web + API, cron and PostgreSQL | Request data, runtime logs; **all database data**, including notes that may contain health data | App and database: EU West, Amsterdam (`europe-west4-drams3a`) | Railway states that its primary processing takes place in the US; DPF where applicable or SCC under the DPA | [railway.com/legal/dpa](https://railway.com/legal/dpa). Execution and special-category data: see §3 | 005, 011 | Selected; DPA check before real data |
| **Lettermint** | Lettermint B.V., Zwolle, NL | Transactional email: sign-in link, 6-digit code, invitations, confirmations, waitlist and membership notices; also the email with a demo request from the website to our own support address (ADR-028, #398) | Recipient email, name, language, email content (such as class name, time, location; for a demo request the visitor's answers), delivery and event data (see §4) | EU: infrastructure in Amsterdam (UpCloud) and Germany (OVH, encrypted backups) | EU only under the DPA (art. 8); no transfer outside the EEA for email data | Lettermint's DPA ([lettermint.co/dpa](https://lettermint.co/dpa)); applies automatically with the terms, countersigned on request. Lettermint's sub-processors: [lettermint.co/subprocessors](https://lettermint.co/subprocessors) | 028 | Selected; production setup and cutover follow with #398. Open items: §4 |
| **Sentry** | Functional Software, Inc. (d/b/a Sentry), US | Error and crash reporting for web, API, iOS and Android | Stack traces, route, app/OS version, device details such as the model (without the device name), pseudonymous user ID. iOS and Android also report each period of app use and whether it ended in a crash, for the crash-free rate. While nobody is signed in, the apps send, as the user ID, a random per-installation ID that the Sentry SDK creates. Sentry counts crash-free users with it. The ID is pseudonymous and not linked to a person. iOS also sends a hash of device and app (`device_app_hash`). **No** request bodies, note content or email; the apps put no IP address in what they send to Sentry, though Sentry does see the device's IP address on the connection (default PII off: `dataCollection` in web/API/cron and Android, `sendDefaultPii: false` in iOS; plus scrubbing in `beforeSend`/`beforeBreadcrumb`) | **EU region, Frankfurt** (`de.sentry.io`). Chosen when the org is created and can't be changed later; available on the free plan | DPF, with SCC as fallback | [sentry.io/legal/dpa](https://sentry.io/legal/dpa/). Accept it in the org's legal settings | 013 | ✅ Use; create the org in the EU region |

</details>

## 2. Verwerkers voor eigen doelen van de aanbieder / Processors for the provider's own purposes

**NL.** Deze dienst verwerkt geen boekings-, trainings- of notitie-inhoud van klanten. Pseudonieme gebruikers- en workspace-ID's blijven wel persoonsgegevens. Wij zijn voor deze productanalyse verwerkingsverantwoordelijke; daarom staat de dienst apart van de subverwerkers die workspace-gegevens in onze opdracht verwerken.

**EN.** This service receives no client booking, workout or note content. Pseudonymous user and workspace IDs still count as personal data. We are the controller for this product analytics processing, so the service is listed separately from sub-processors that handle workspace data on our behalf.

| Dienst / Service | Entiteit / Entity | Doel / Purpose | Gegevens / Data | Regio / Region | DPA | ADR |
|---|---|---|---|---|---|---|
| **PostHog** | PostHog, Inc., VS / US | Productanalyse, cookieloze modus (P4 in `role-mapping.md`) / Product analytics, cookieless mode | Toegestane gebeurtenistypen en pseudonieme gebruikers- en workspace-ID's. Paginaweergaven van de webapp, cookieloos (geen cookie, niets blijft in de browser bewaard): het URL-pad zonder querystring of fragment, browser en versie, besturingssysteem en versie, apparaattype, de volledige user-agent en de tijdzone. Onze routes zetten ID's van records in het pad, nooit namen. Een pad dat een bezoeker zelf intypt, gaat ongewijzigd mee. PostHog ontvangt daarbij het IP-adres van de browser en maakt er met onder meer de user-agent een dagelijkse hash van om unieke bezoekers te tellen. **Geen** namen, e-mail, boekings-, trainings- of notitie-inhoud, vrije tekst, URL-parameters, paginatitel of referrer / Allowlisted event types and pseudonymous user and workspace IDs. Page views of the web app, cookieless (no cookie, nothing kept in the browser): the URL path without query string or fragment, browser and version, operating system and version, device type, the full user agent and the time zone. Our routes put record IDs in the path, never names. A path a visitor types in is sent as it is. PostHog receives the browser's IP address with them and hashes it daily, together with the user agent among other things, to count unique visitors. **No** names, email, booking, workout or note content, free text, URL parameters, page title or referrer | **EU Cloud, Frankfurt** | [posthog.com/dpa](https://posthog.com/dpa). Op elk plan, ook gratis; zelf te ondertekenen in de PostHog-app / Available on every plan including free; self-serve signature in the app | 013 |
| **Zoho Mail** | Zoho Corporation B.V. (EU-entiteit) en groepsbedrijven / Zoho group | Onze eigen mailbox: `support@fivvi.app` en `privacy@fivvi.app` komen daar binnen (aliassen van één mailbox). Ontvangt de vragen van mensen, verzoeken over privacy en de e-mail met een demo-aanvraag / Our own mailbox: `support@fivvi.app` and `privacy@fivvi.app` arrive there (aliases of one mailbox). Receives people's questions, privacy requests and the email with a demo request | Naam, e-mailadres, de inhoud van het bericht, en bij een demo-aanvraag soort bedrijf, aantal trainers en bericht / Name, email address, the content of the message and, for a demo request, kind of business, number of trainers and message | **EU-datacenter** (MX `*.zoho.eu`). De stad is niet gecontroleerd / EU data centre (MX `*.zoho.eu`). The city is not checked | DPA op aanvraag ([privacyverklaring van Zoho](https://www.zoho.com/privacy.html): ondertekening aanvragen via het DPA-formulier van Zoho). Groepsovereenkomst op basis van SCC. **Nog te doen:** de DPA aanvragen en bewaren (zie hieronder) / DPA on request (see [Zoho's privacy policy](https://www.zoho.com/privacy.html): request signature through Zoho's DPA form). Group agreement based on SCCs. **Still to do:** request and keep the DPA (see below) | — |

**NL.** Zoho Mail is onze eigen mailbox; de mail die daar binnenkomt is van ons (wij zijn verwerkingsverantwoordelijke, zie `role-mapping.md` P2). De eigenaar bevestigde op 8 november 2026 dat beide adressen aliassen zijn van de Zoho-mailbox (#612). **Nog te doen vóór publicatie van de privacyverklaring (Q25, Publish; en in elk geval vóór G2):** de DPA van Zoho aanvragen en bewaren, de datacenterlocatie van het account vastleggen en een eventuele subverwerkerslijst van Zoho nalopen. Werkruimte-gegevens horen niet in deze mailbox: vraagt een studio iets over haar klanten, dan verwijzen we naar de app.

**EN.** Zoho Mail is our own mailbox; mail that arrives there is ours (we are the controller, see `role-mapping.md` P2). The owner confirmed on 8 November 2026 that both addresses are aliases of the Zoho mailbox (#612). **Still to do before the privacy policy is published (Q25, Publish; and in any case before G2):** request and keep Zoho's DPA, record the data centre location of the account and check any sub-processor list Zoho has. Workspace data does not belong in this mailbox: when a studio asks about its clients, we point to the app.

## 3. Railway DPA vóór echte gegevens / Railway DPA before real data

**NL.**

- ADR-011 kiest Railway in Amsterdam voor web, API, cron **en PostgreSQL**. Vercel en Neon maken geen deel uit van de geplande verwerking.
- De [Railway-DPA](https://railway.com/legal/dpa) zegt dat zij pas bindend wordt nadat de klant het DocuSign-formulier indient **en Railway tekent**. Controleer de getekende overeenkomst vóór publicatie van de privacyverklaring (Q6, Publish) en uiterlijk bij G2 (ADR-011); sinds roadmap v1.20 komen echte gegevens pas bij de pilotopzet binnen, vóór G4.
- Bijlage A van de gepubliceerde Railway-DPA vermeldt voor bijzondere persoonsgegevens **“None”**. Notities kunnen gezondheidsgegevens bevatten. Leg vóór M7 schriftelijk vast dat de DPA deze verwerking dekt, of zorg dat er geen gezondheidsgegevens op Railway worden opgeslagen tot dit is opgelost.
- De DPA noemt primaire verwerking in de VS, ook wanneer app en database in Amsterdam staan. Documenteer de toepasselijke doorgiftegrondslag en bevestig de ingestelde regio voor app, database en back-ups.

**EN.**

- ADR-011 selects Railway in Amsterdam for web, API, cron **and PostgreSQL**. Vercel and Neon are not part of the planned processing.
- The [Railway DPA](https://railway.com/legal/dpa) says it becomes binding only after the customer submits the DocuSign form **and Railway signs**. Check the executed agreement before the privacy policy is published (Q6, Publish) and no later than G2 (ADR-011); since roadmap v1.20 real data first enters at pilot setup, before G4.
- Exhibit A of Railway's published DPA lists **“None”** for special-category personal data. Notes may contain health data. Obtain written confirmation that the DPA covers this processing before M7, or keep health data off Railway until resolved.
- The DPA says primary processing takes place in the US, even if the app and database are in Amsterdam. Document the applicable transfer mechanism and confirm the configured region for app, database and backups.

## 4. E-mail: Lettermint / Email: Lettermint

**NL.** De eigenaar koos op 2 november 2026 voor Lettermint voor transactionele e-mail (ADR-028, die ADR-009 op de aanbieder na aanpast). Aanleiding: Brevo herschrijft elke link via een eigen klikdomein (het eenmalige inlogtoken komt dan in Brevo's klikgegevens) en voegt een `List-Unsubscribe`-header toe waarmee één tik op "Afmelden" ook inlogcodes blokkeert. Uitzetten kan alleen op Brevo's duurste plannen. Bronnen: [`ADR-028`](../decisions/ADR-028-transactional-email-through-lettermint.md), [`research/ADR-028-lettermint.md`](../decisions/research/ADR-028-lettermint.md) (onderzoek en proef van 2 november 2026).

- **Onderneming en opslag:** Lettermint B.V., Zwolle (KvK 99337711). Verwerking uitsluitend op infrastructuur in Amsterdam (UpCloud) en Duitsland (OVH, versleutelde back-ups). Subverwerkers van Lettermint (per 2 november 2026): onder meer UpCloud, OVH en Postmastery (bewaking van bezorging en reputatie, ziet e-mails), plus Mistral voor AI-ondersteuning bij support en misbruik, zonder training op onze gegevens (DPA art. 13). Lettermint meldt wijzigingen 30 dagen vooraf; wij geven ze door volgens verwerkersovereenkomst art. 7.
- **DPA:** de DPA van Lettermint (laatst bijgewerkt 9 oktober 2026) geldt automatisch met de voorwaarden; ondertekening op verzoek. Ze dekt onze keten (studio, wij, Lettermint) in art. 1.9. Meldplicht datalek: 24 uur (art. 10.1).
- **Bewaartermijnen:** berichtinhoud, ontvangers, metagegevens en gebeurtenissen 28 dagen, analysegebeurtenissen 90 dagen. Niet in te korten. De 90 dagen zijn langer dan de 30 dagen van `retention-policy.md` R18, en Brevo bewaarde geen inhoud; R18 heeft daarvoor sinds 8 november 2026 een Lettermint-uitzondering. "Verberg e-mailinhoud" staat aan voor de inlogroute (alleen het dashboard); een inlogtoken is na 15 minuten verlopen.
- **Routes:** één project, twee transactionele routes: inloggen en overige mail. Klachten of afmeldingen over een boekingsmail blokkeren zo nooit inlogcodes. Open- en kliktracking staan uit, er komt geen `List-Unsubscribe`, "auto-responders onderdrukken" staat aan.
- **Plan:** Free (300 e-mails per maand voor het hele team, harde stop) voor de interne alpha; vóór de pilotopzet of bij ongeveer 200 e-mails per maand naar Starter (ADR-028). Gebruiksmelding via de dagelijkse cron (R14, Sentry-waarschuwing bij 70%).
- **Afzender:** `Fivvi` (noreply at fivvi.app). DKIM, SPF en DMARC slagen voor `fivvi.app` (proef van 2 november 2026, Zoho en Gmail).

**Open punten voor de eigenaar:**

1. **Productie-inrichting (#398): gedaan.** Productie verstuurt alle transactionele e-mail via Lettermint, en de eigenaar heeft gecontroleerd dat het werkt. Brevo is op 9 november 2026 uit de code gehaald (#692), met `BREVO_API_KEY` in productie en ontwikkeling.
2. **Brevo opruimen:** het transport en de variabelen zijn weg (#692), en de eigenaar heeft op 9 november 2026 de DNS-records (`brevo1/2._domainkey`, `brevo-code`) verwijderd. Nog over: het account. Brevo staat **niet** in de lijst: er gaan geen echte gegevens doorheen (alleen testverzending). Gebruiken we Brevo toch ooit voor echte gegevens, dan komt het eerst terug in §1.
3. **DPA bewaren:** een pdf van Lettermint's voorwaarden en DPA buiten de repo bewaren, en vóór G4 nakijken of er een nieuwe versie is.
4. **Vraag aan Lettermint-support:** het standaardbereik van automatische onderdrukkingen (testadressen maken er geen).
5. **Starter:** overschakelen bij pilotopzet; **nooit** "overages uitzetten" of een lage bestedingslimiet instellen (dat weigert inlogmail bij de grens).

**EN.** The owner chose Lettermint for transactional email on 2 November 2026 (ADR-028, which amends ADR-009 on the provider only). Reason: Brevo rewrites every link through its own click domain (so the one-time sign-in token ends up in Brevo's click data) and adds a `List-Unsubscribe` header, so one tap on "Unsubscribe" also blocks sign-in codes. Switching either off is only possible on Brevo's most expensive plans. Sources: [`ADR-028`](../decisions/ADR-028-transactional-email-through-lettermint.md), [`research/ADR-028-lettermint.md`](../decisions/research/ADR-028-lettermint.md) (research and trial of 2 November 2026).

- **Company and storage:** Lettermint B.V., Zwolle (KvK 99337711). Processing only on infrastructure in Amsterdam (UpCloud) and Germany (OVH, encrypted backups). Lettermint's sub-processors (as of 2 November 2026) include UpCloud, OVH and Postmastery (delivery and reputation monitoring, sees emails), plus Mistral for AI-assisted support and abuse handling, with no training on our data (DPA art. 13). Lettermint announces changes 30 days ahead; we pass them on under processor agreement art. 7.
- **DPA:** Lettermint's DPA (last updated 9 October 2026) applies automatically with the terms; countersigned on request. It covers our chain (studio, us, Lettermint) in art. 1.9. Breach notice: 24 hours (art. 10.1).
- **Retention:** message content, recipients, metadata and events 28 days, analytics events 90 days. It can't be shortened. The 90 days is longer than the 30 days of `retention-policy.md` R18, and Brevo kept no content; R18 has a Lettermint exception for that since 8 November 2026. "Hide email content" is on for the sign-in route (dashboard only); a sign-in token has expired after 15 minutes anyway.
- **Routes:** one project, two transactional routes: sign-in and all other mail. A complaint or unsubscribe about a booking email can never block sign-in codes. Open and click tracking are off, there is no `List-Unsubscribe`, "suppress auto-responders" is on.
- **Plan:** Free (300 emails a month for the whole team, hard stop) for the internal alpha; Starter at pilot setup at the latest, or at about 200 emails in a month (ADR-028). Usage alert through the daily cron (R14, a Sentry warning at 70%).
- **Sender:** `Fivvi` (noreply at fivvi.app). DKIM, SPF and DMARC pass for `fivvi.app` (trial of 2 November 2026, Zoho and Gmail).

**Open items for the owner:**

1. **Production setup (#398): done.** Production sends all transactional email through Lettermint, and the owner checked that it works. Brevo was removed from the code on 9 November 2026 (#692), with `BREVO_API_KEY` in production and development.
2. **Remove Brevo:** the transport and the variables are gone (#692), and the owner deleted the DNS records (`brevo1/2._domainkey`, `brevo-code`) on 9 November 2026. Left: the account. Brevo is **not** on the list: no real data goes through it (test sending only). If Brevo is ever used for real data, it comes back in §1 first.
3. **Keep the DPA:** save a PDF of Lettermint's terms and DPA outside the repo, and check for a newer version before G4.
4. **Question to Lettermint support:** the default scope of automatic suppressions (test addresses create none).
5. **Starter:** switch at pilot setup; **never** "disable overages" or set a low spend cap (either rejects sign-in email at the limit).

## 5. Geen subverwerker (onder voorwaarden) / Not a sub-processor (on conditions)

| Dienst | Waarom niet | Voorwaarde |
|---|---|---|
| Uptime-monitor (UptimeRobot / Better Stack) | Pingt alleen publieke URL's | Health-endpoint geeft geen gegevens terug; meldingen bevatten geen persoonsgegevens |
| GitHub (repo, Actions CI) | Alleen broncode en synthetische testgegevens | Geen productiegegevens, dumps, pilotbestanden of echte namen in de repo, issues, PR's of CI-logs |
| AI-codeeragents (GitHub Copilot, Anthropic Claude Code, OpenAI Codex) | Zij bouwen de software; ze voeren de dienst niet uit | **Nooit** productietoegang, echte exports, Excel-bestanden van de pilot of screenshots met echte gegevens (D8 in `role-mapping.md`). Verandert dat, dan worden ze subverwerker en zijn DPA's nodig |
| Better Auth | Een bibliotheek die in onze eigen backend draait, geen externe dienst | — |
| Apple (TestFlight, App Store), Google (Play Console) | App-distributie. Apple en Google zijn zelf verwerkingsverantwoordelijke voor store- en testeraccounts | Klanten halen de app Fivvi bij livegang ook uit de App Store en Google Play. Opnieuw bekijken bij 1.1 als pushmeldingen (APNs/FCM) komen; pushberichten zonder persoonsgegevens |
| Domeinregistrar / DNS | DNS bevat geen persoonsgegevens | fivvi.app is gekocht (21 oktober 2026); registrar en DNS-host nog invullen (`ROADMAP.md §4.5`) |
| **Mollie** (betaalprovider, vanaf M11) | Mollie B.V., Amsterdam. Mollie ziet zichzelf als **zelfstandig verwerkingsverantwoordelijke** voor de betaalgegevens en biedt voor betalingen geen verwerkersovereenkomst. De studio sluit zelf een overeenkomst met Mollie en is de handelaar; Fivvi verwerkt de betaalgegevens van haar klanten in opdracht van de studio, via OAuth, en houdt nooit klantgeld vast (ADR-020) | Zie hieronder. Bevestiging van deze rolverdeling is nog open (ADR-020, open vraag 7) |

<details>
<summary>English version of the table</summary>

| Service | Why not | Condition |
|---|---|---|
| Uptime monitor (UptimeRobot / Better Stack) | Pings public URLs only / Only pings public URLs | Health endpoint returns no data; alerts contain no personal data |
| GitHub (repo, Actions CI) | Source code and synthetic test data only | No production data, dumps, pilot files or real names in the repo, issues, PRs or CI logs |
| AI coding agents (GitHub Copilot, Anthropic Claude Code, OpenAI Codex) | They build the software; they don't operate the service | **Never** give them production access, real exports, pilot Excel files or screenshots with real data (D8 in `role-mapping.md`). If that ever changes, they become sub-processors and need DPAs |
| Better Auth | A library running inside our own backend, not a third-party service | — |
| Apple (TestFlight, App Store), Google (Play Console) | App distribution. Apple and Google are independent controllers for store and tester accounts | Clients also get the app Fivvi from the App Store and Google Play at go-live. Revisit at 1.1 when push notifications (APNs/FCM) arrive; keep push payloads free of personal data |
| Domain registrar / DNS | DNS contains no personal data | fivvi.app is bought (21 October 2026); fill in the registrar and DNS host (`ROADMAP.md §4.5`) |
| **Mollie** (payment provider, from M11) | Mollie B.V., Amsterdam. Mollie sees itself as an **independent controller** for the payment data and offers no processor agreement for payments. The studio contracts Mollie itself and is the merchant; Fivvi processes its clients' payment data on the studio's behalf, through OAuth, and never holds client money (ADR-020) | See below. Confirmation of this role split is still open (ADR-020, open question 7) |

</details>

### Mollie: een aparte rol / Mollie: a separate role

**NL.**

- Betalen aan een studio loopt via Mollie Connect for Platforms (ADR-020): de studio heeft een eigen Mollie-account en is de handelaar. Het geld gaat van Mollie naar de bankrekening van de studio, nooit via een rekening van Fivvi. Fivvi neemt in de MVP geen commissie op betalingen van klanten.
- **Mollie is geen subverwerker van Fivvi.** Mollie bepaalt zelf doel en middelen voor de betaalgegevens (betaalmethode, rekeninggegevens, machtiging voor automatische incasso, fraude- en witwascontrole) en handelt onder haar eigen voorwaarden en [privacyverklaring](https://www.mollie.com/legal/privacy). Doorgifte buiten de EER door Mollie valt onder haar eigen SCC.
- Fivvi stuurt Mollie alleen wat een betaling nodig heeft: naam, e-mailadres, bedrag, een omschrijving zonder gezondheids- of notitie-informatie en eigen ID's. Fivvi bewaart verwijzingen, bedragen, statussen en een afgeschermd rekeningnummer, geen volledig IBAN. Voor de gegevens die Fivvi voor de studio verwerkt, is Mollie een ontvanger, geen subverwerker: de studio sluit de overeenkomst met haar.
- De refresh token van de studio is een geheim van die workspace: versleuteld, nooit gelogd, nooit naar Sentry.
- **Nog te doen vóór G4:** bevestigen bij Mollie dat deze rolverdeling klopt (ADR-020, open vraag 7), en `role-mapping.md`, `dpia-assessment.md` en `retention-policy.md` (facturen, R21) bijwerken zodra de betaalcode (E019) er is. Betalingen draaien nu alleen in testmodus; er is geen live sleutel (`ENVIRONMENTS.md §7`).

**EN.**

- Paying a studio goes through Mollie Connect for Platforms (ADR-020): the studio has its own Mollie account and is the merchant. The money goes from Mollie to the studio's bank account, never through an account of Fivvi. In the MVP Fivvi takes no commission on client payments.
- **Mollie is not a Fivvi sub-processor.** Mollie decides the purposes and means for the payment data itself (payment method, account details, direct debit mandate, fraud and money laundering checks) and acts under its own terms and [privacy statement](https://www.mollie.com/legal/privacy). Mollie's transfers outside the EEA fall under its own SCCs.
- Fivvi sends Mollie only what a payment needs: name, email address, amount, a description without health or note information, and our own IDs. Fivvi keeps references, amounts, statuses and a masked account number, no full IBAN. For the data Fivvi processes for the studio, Mollie is a recipient, not a sub-processor: the studio contracts it.
- The studio's refresh token is a secret of that workspace: encrypted, never logged, never sent to Sentry.
- **Still to do before G4:** confirm with Mollie that this role split is right (ADR-020, open question 7), and update `role-mapping.md`, `dpia-assessment.md` and `retention-policy.md` (invoices, R21) once the payment code (E019) exists. Payments run in test mode only for now; there is no live key (`ENVIRONMENTS.md §7`).

### Gepland, nog niet in gebruik: Cloudflare Turnstile / Planned, not in use yet: Cloudflare Turnstile

**NL.** E013 (#467, M5) voegt Cloudflare Turnstile toe als botbescherming op de formulieren om een account aan te maken, in te loggen en een studio om toegang te vragen. Het zit **niet** in de code en staat daarom **niet** op de publieke subverwerkerspagina en niet in de privacyverklaring. Zodra E013 live gaat, in dezelfde PR: Turnstile in §1 zetten, op de pagina (`sub-processors.ts`) en in de privacyverklaring (§4, §5, §6: doel, "Cloudflare gebruikt de signalen ook zelf als verwerkingsverantwoordelijke", Amerikaanse aanbieder). Gegevens: IP-adres, TLS-fingerprint, user-agent, sitekey/origin. Regio: wereldwijd edge-netwerk (voor Nederlandse bezoekers meestal EU-locaties; niet gegarandeerd). Doorgifte: SCC; DPF. DPA: [Cloudflare-DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) (v6.4, 3 april 2026). **Let op:** Cloudflare is zelf verwerkingsverantwoordelijke als het deze signalen gebruikt om botdetectie te verbeteren.

**EN.** E013 (#467, M5) adds Cloudflare Turnstile as bot protection on the forms for creating an account, signing in and asking a studio for access. It is **not** in the code, so it is **not** on the public sub-processors page and not in the privacy policy. When E013 goes live, in the same PR: move Turnstile into §1, add it to the page (`sub-processors.ts`) and to the privacy policy (§4, §5, §6: purpose, "Cloudflare also uses the signals itself as a controller", US provider). Data: IP address, TLS fingerprint, user agent, site key/origin. Region: global edge network (for Dutch visitors usually EU edge locations; not guaranteed). Transfer: SCC; DPF. DPA: [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) (v6.4, 3 April 2026). **Note:** Cloudflare acts as an independent controller when it uses these signals to improve bot detection.

## 6. Doorgifte naar de VS / Transfers to the US

**NL.**

- Railway, Sentry en PostHog zijn Amerikaanse aanbieders (Cloudflare komt erbij met Turnstile, E013). Zoho is een internationale groep; de groepsovereenkomst van Zoho steunt op SCC. Lettermint verwerkt e-mailgegevens alleen in de EU. EU-opslag sluit toegang of verwerking buiten de EER niet uit; Railway noemt primaire verwerking in de VS in zijn DPA.
- De doorgifte steunt op het EU-VS Data Privacy Framework (adequaatheidsbesluit juli 2023) en/of de standaardcontractbepalingen (SCC 2021) in de DPA's.
- Het DPF blijft onderwerp van procedures. Houd de SCC's daarom als terugvaloptie en controleer dit bij elke herziening.
- Maatregelen: EU-regio's kiezen waar dat kan, versleuteling in transit en in rust, en dataminimalisatie (geen notities in e-mails, logs, foutrapporten of analytics).

**Per aanbieder (gecontroleerd op de eigen DPA- en privacypagina's van de aanbieders, 8 november 2026) / Per provider (checked on the providers' own DPA and privacy pages, 8 November 2026):**

| Aanbieder / Provider | Doorgifte buiten de EER / Transfer outside the EEA | Bron / Source |
|---|---|---|
| Railway | Standaardcontractbepalingen (modules 1, 2 en 3, naar rol) in de DPA; het EU-VS DPF alleen als de ontvanger daarvoor is gecertificeerd. Of Railway gecertificeerd is, staat er niet; de DPA is nog niet uitgevoerd (Q6) / Standard contractual clauses (modules 1, 2 and 3, by role) in the DPA; the EU-US DPF only if the recipient is certified. Whether Railway is certified is not stated; the DPA is not executed yet (Q6) | [railway.com/legal/dpa](https://railway.com/legal/dpa) §9.2 |
| Sentry | EU-VS DPF; SCC (besluit 2021/914) als terugvaloptie / EU-US DPF; SCCs (decision 2021/914) as the fallback | [sentry.io/legal/dpa](https://sentry.io/legal/dpa/) §1, §2 |
| PostHog | **Niet gedocumenteerd:** de pagina's die we konden lezen noemen alleen de opslag in Frankfurt, geen SCC of DPF. Open vraag Q28. De publieke tekst zegt "de waarborg uit zijn DPA" / **Not documented:** the pages we could read only state the storage in Frankfurt, no SCC or DPF. Open question Q28. The public text says "the safeguard in its DPA" | [posthog.com/docs/privacy/gdpr-compliance](https://posthog.com/docs/privacy/gdpr-compliance) |
| Zoho | Groepsovereenkomst op basis van modelcontractbepalingen (SCC); de eigen DPA is op aanvraag (Q25) / A group agreement based on model contractual clauses (SCCs); its own DPA is on request (Q25) | [zoho.com/privacy.html](https://www.zoho.com/privacy.html) |
| Lettermint | Geen: e-mailgegevens alleen in de EU (DPA art. 8) / None: email data in the EU only (DPA art. 8) | [lettermint.co/dpa](https://lettermint.co/dpa) |
| Mollie (eigen rol) / Mollie (own role) | Mollie's eigen regeling (SCC volgens ADR-020); geen onderdeel van onze keten / Mollie's own arrangement (SCCs per ADR-020); not part of our chain | ADR-020 |


**EN.**

- Railway, Sentry and PostHog are US providers (Cloudflare joins with Turnstile, E013). Zoho is an international group, and Zoho's group agreement relies on SCCs. Lettermint processes email data in the EU only. EU storage does not rule out access or processing outside the EEA; Railway states in its DPA that primary processing takes place in the US.
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
| 2026-10-31 | Apple and Google (§5): clients also get the app Fivvi from the App Store and Google Play at go-live; revisit at 1.1 when push notifications (APNs/FCM) arrive |
| 2026-11-08 | F064 (#642): Brevo is replaced by Lettermint in §1 and §4 (ADR-028, #398); Zoho Mail (our own mailbox, for support, privacy and demo requests) added to §2; Mollie's separate role described in §5; Turnstile marked as not yet in use (E013); the public sub-processors page follows this list |
| 2026-11-08 | F064 (#642): Turnstile moved out of §1 to a "planned, not in use yet" section after §5, because it is not in the code (E013); it joins §1, the page and the privacy policy when E013 ships |
| 2026-11-09 | §4: the Lettermint production setup is done and Brevo is out of the code (#692); Brevo's DNS records are deleted; left is the account (`open-questions.md` Q27) |
