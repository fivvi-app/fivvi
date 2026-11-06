/* Copy of the pricing, demo, support, legal and search pages, Dutch first: [nl, en].
   {{…}} is a value only the owner can give; it shows as a mark until then. */
window.PAGES = (function () {
  var biz = {
    name: ["K&S Apps, handelend onder de naam Fivvi", "K&S Apps, trading as Fivvi"],
    lines: [
      [["KvK-nummer", "Chamber of Commerce (KvK)"], "{{KvK-nummer}}"],
      [["Btw-nummer", "VAT number"], "{{btw-nummer}}"],
      [["Adres", "Address"], "{{adres}}"],
      [["E-mail", "Email"], "support@fivvi.app"],
      [["Privacy", "Privacy"], "privacy@fivvi.app"],
      [["Telefoon of WhatsApp", "Phone or WhatsApp"], "{{nummer}}"]
    ]
  };

  return {
    nav: { pricing: ["Prijzen", "Pricing"], login: ["Inloggen", "Sign in"], demo: ["Plan een demo", "Book a demo"] },
    foot: {
      product: ["Product", "Product"], help: ["Hulp", "Help"], legal: ["Juridisch", "Legal"],
      support: ["Hulp en contact", "Help and contact"], del: ["Account verwijderen", "Delete account"],
      privacy: ["Privacyverklaring", "Privacy policy"], terms: ["Algemene voorwaarden", "Terms of service"], cookies: ["Cookies", "Cookies"], sub: ["Subverwerkers", "Sub-processors"]
    },
    biz: biz,
    cta: {
      h: ["Hoe ziet jouw dag eruit in Fivvi?", "What does your day look like in Fivvi?"],
      p: ["Plan een demo. We laten Fivvi zien met jouw soort bedrijf, en je weet meteen of het past.", "Book a demo. We'll show Fivvi with your kind of business, and you'll know right away if it fits."],
      b: ["Plan een demo", "Book a demo"], price: ["Bekijk de prijzen", "See pricing"]
    },
    pricing: {
      eye: ["Prijzen", "Pricing"],
      h1: ["Gratis tijdens de pilot.", "Free during the pilot."],
      lead: ["Fivvi kost nu niets: geen abonnement en geen kosten per klant. Neem je betalingen aan via Mollie, dan betaal je alleen Mollie.", "Fivvi costs nothing right now: no subscription and no fee per client. If you take payments through Mollie, you only pay Mollie."],
      cards: [
        { big: "€ 0", name: ["Fivvi", "Fivvi"], sub: ["tijdens de pilot", "during the pilot"], items: [["Agenda, boekingen en wachtlijst", "Calendar, bookings and waitlist"], ["Abonnementen, credits en facturen", "Memberships, credits and invoices"], ["Fivvi Pro op iPhone en Android, en Fivvi op je laptop", "Fivvi Pro on iPhone and Android, and Fivvi on your laptop"], ["Trainingen loggen en delen", "Logging and sharing workouts"]] },
        { big: ["Per betaling", "Per payment"], name: ["Betalingen via Mollie", "Payments through Mollie"], sub: ["aan Mollie, volgens hun tarieven", "to Mollie, at their rates"], items: [["Je eigen Mollie-account, in één begeleide stap", "Your own Mollie account, in one guided step"], ["iDEAL, en daarna automatische incasso", "iDEAL, then automatic direct debit"], ["Het geld gaat rechtstreeks naar jouw rekening", "The money goes straight to your account"]] },
        { big: "€ 0", name: ["Voor je klanten", "For your clients"], sub: ["de app en de website", "the app and the website"], items: [["Klanten betalen alleen jou", "Clients only pay you"], ["Boeken kan in de app of in de browser", "Booking works in the app or the browser"], ["Contant of pin kan ook", "Cash or card is fine too"]] }
      ],
      laterH: ["En straks?", "And later?"],
      later: ["Als Fivvi later geld gaat kosten, hoor je dat minstens 60 dagen vooraf. Je kunt dan gratis stoppen en je gegevens meenemen. Je betaalt nooit iets waar je niet eerst mee hebt ingestemd.", "If Fivvi starts charging later, you'll hear at least 60 days in advance. You can then stop for free and take your data with you. You never pay for anything you didn't agree to first."],
      terms: ["Alle bedragen zijn in euro. Er zijn nu geen betaalvoorwaarden, omdat je Fivvi niets betaalt.", "All amounts are in euros. There are no payment terms for now, because you don't pay Fivvi anything."]
    },
    demo: {
      eye: ["Demo", "Demo"],
      h1: ["Zie Fivvi met jouw dag erin.", "See Fivvi with your day in it."],
      lead: ["In 30 minuten, online. Geen verkooppraatje, gewoon je eigen werkweek in Fivvi.", "30 minutes, online. No sales pitch, just your own working week in Fivvi."],
      steps: [
        [["Je vertelt hoe het nu gaat", "You tell us how it works now"], ["Welke apps, lijstjes en berichtjes gebruik je vandaag?", "Which apps, lists and messages do you use today?"]],
        [["We laten jouw soort bedrijf zien", "We show your kind of business"], ["Gym, studio of personal trainer: je ziet alleen wat bij jou hoort.", "Gym, studio or personal trainer: you only see what fits you."]],
        [["Je weet meteen of het past", "You know right away if it fits"], ["En zo ja, wat er nodig is om over te stappen.", "And if so, what it takes to switch."]]
      ],
      name: ["Je naam", "Your name"], email: ["Je e-mailadres", "Your email address"], who: ["Ik heb", "I run"],
      whoOpts: [["Een gym met een team", "A gym with a team"], ["Een pilates- of yogastudio", "A pilates or yoga studio"], ["Een eigen PT-bedrijf", "My own PT business"]],
      size: ["Hoeveel trainers?", "How many trainers?"], sizeOpts: [["Alleen ik", "Just me"], ["2 tot 4", "2 to 4"], ["5 of meer", "5 or more"]],
      msg: ["Wat wil je vooral zien? (mag leeg)", "What would you most like to see? (optional)"],
      send: ["Demo aanvragen", "Request a demo"],
      note: ["We gebruiken dit alleen om je te antwoorden. Lees de privacyverklaring.", "We only use this to reply to you. Read the privacy policy."],
      sent: ["Dit is een ontwerp, dus er is niets verstuurd. Op de echte site staat hier: je hoort binnen 1 werkdag van ons.", "This is a design, so nothing was sent. On the real site this says: you'll hear from us within 1 working day."],
      client: ["Ben je klant van een studio? Vraag je studio of trainer om Fivvi.", "A client of a studio? Ask your studio or trainer for Fivvi."]
    },
    support: {
      eye: ["Hulp", "Help"],
      h1: ["Hulp en contact", "Help and contact"],
      lead: ["Mail ons gerust. We antwoorden binnen 1 werkdag.", "Feel free to email us. We reply within 1 working day."],
      bizH: ["Zo bereik je ons", "How to reach us"],
      clients: ["Voor klanten", "For clients"], owners: ["Voor eigenaren en trainers", "For owners and trainers"],
      qClients: [
        [["Hoe meld ik me aan bij mijn studio?", "How do I join my studio?"], ["Open de link of scan de QR-code van je studio of trainer. Vul je e-mailadres in, en daarna de code van 6 cijfers die je krijgt. Je studio keurt je aanmelding goed en daarna kun je boeken.", "Open your studio's or trainer's link, or scan their QR code. Enter your email address, then the 6-digit code you receive. Your studio approves your request and then you can book."]],
        [["Ik krijg geen code. Wat nu?", "I don't get a code. What now?"], ["Kijk in je spam en controleer je e-mailadres. Een code is 15 minuten geldig. Daarna vraag je gewoon een nieuwe aan.", "Check your spam and your email address. A code is valid for 15 minutes. After that, just ask for a new one."]],
        [["Hoe annuleer ik een les?", "How do I cancel a class?"], ["Open de les en kies Annuleren. Doe je dat op tijd, dan krijg je je credit terug. Je studio bepaalt tot wanneer dat kan.", "Open the class and choose Cancel. If you're in time, you get your credit back. Your studio decides how long that's possible."]],
        [["Waar vind ik mijn facturen?", "Where do I find my invoices?"], ["In Profiel, onder Facturen. Je kunt ze daar ook downloaden.", "In Profile, under Invoices. You can download them there too."]]
      ],
      qOwners: [
        [["Hoe koppel ik betalingen?", "How do I connect payments?"], ["Ga op je laptop naar Instellingen, Betalingen, Betalingen koppelen. Mollie controleert je gegevens. iDEAL werkt daarna als eerste, automatische incasso duurt tot ongeveer 3 werkdagen langer.", "On your laptop, go to Settings, Payments, Connect payments. Mollie checks your details. iDEAL works first; automatic direct debit takes up to about 3 working days longer."]],
        [["Moet ik Mollie gebruiken?", "Do I have to use Mollie?"], ["Nee. Neem je alleen contant of met pin aan, dan kan dat ook. Fivvi vertelt eerst wat je dan mist, en je kunt Mollie later altijd nog koppelen.", "No. If you only take cash or card, that's fine. Fivvi first tells you what you'd miss, and you can always connect Mollie later."]],
        [["Op welke apparaten werkt Fivvi?", "Which devices does Fivvi work on?"], ["Fivvi Pro is er voor iPhone en Android. De administratie doe je in de browser op je laptop. Klanten gebruiken de app of hun browser.", "Fivvi Pro is available for iPhone and Android. You do the admin in the browser on your laptop. Clients use the app or their browser."]],
        [["Waar staan mijn gegevens?", "Where is my data stored?"], ["Op servers in Amsterdam. Notities zijn alleen voor trainers. Welke diensten we gebruiken, staat bij Subverwerkers.", "On servers in Amsterdam. Notes are for trainers only. The services we use are listed under Sub-processors."]]
      ]
    },
    del: {
      eye: ["Account", "Account"],
      h1: ["Je account verwijderen", "Delete your account"],
      lead: ["Dat kan altijd, voor de apps Fivvi en Fivvi Pro. Het liefst doe je het zelf in de app.", "You can do this at any time, for the Fivvi and Fivvi Pro apps. It's easiest to do it yourself in the app."],
      appH: ["In de app", "In the app"],
      app: [["Open Fivvi of Fivvi Pro en ga naar Profiel.", "Open Fivvi or Fivvi Pro and go to Profile."], ["Kies Account verwijderen.", "Choose Delete account."], ["Bevestig. Fivvi laat eerst zien wat er blijft bewaard.", "Confirm. Fivvi first shows what will be kept."]],
      mailH: ["Zonder app", "Without the app"],
      mail: ["Mail vanaf het adres van je account naar privacy@fivvi.app met als onderwerp Account verwijderen. We doen dat binnen één maand en laten het je weten.", "Email privacy@fivvi.app from your account's address with the subject Delete account. We'll do it within one month and let you know."],
      goneH: ["Wat er wordt verwijderd", "What gets deleted"],
      gone: [["Je naam, e-mailadres en voorkeuren", "Your name, email address and preferences"], ["Je inloggegevens", "Your sign-in details"], ["Trainingen die je zelf hebt gedaan", "Workouts you did on your own"]],
      keepH: ["Wat er blijft bewaard", "What is kept"],
      keep: [["Facturen blijven bij je studio, zo lang als de wet dat vraagt.", "Invoices stay with your studio for as long as the law requires."], ["Je studio beslist over de gegevens die zij over jou bewaart, zoals je klantprofiel. Vraag het je studio, of mail ons.", "Your studio decides about the data it keeps on you, such as your client profile. Ask your studio, or email us."], ["Back-ups vervallen vanzelf binnen 30 dagen.", "Backups expire by themselves within 30 days."]],
      owner: ["Ben je eigenaar van een studio of gym? Mail ons eerst, zodat je klanten en facturen goed geregeld blijven.", "Do you own a studio or gym? Email us first, so your clients and invoices stay properly handled."]
    },
    legal: {
      draft: ["Concept. Deze tekst is nog niet nagekeken en moet nog worden bijgewerkt voor betalingen, de klant-app, de nieuwe e-maildienst en het demoformulier. Roze waarden vul jij nog in.", "Draft. This text hasn't been reviewed yet and still needs updating for payments, the client app, the new email service and the demo form. You still fill in the pink values."],
      privacy: ["Privacyverklaring", "Privacy policy"], terms: ["Algemene voorwaarden", "Terms of service"],
      subH: ["Subverwerkers", "Sub-processors"],
      subLead: ["Deze diensten verwerken gegevens voor Fivvi. Komt er een nieuwe bij, dan laten we dat eerst weten aan elke studio.", "These services process data for Fivvi. When a new one is added, we tell every studio first."],
      subCols: [["Dienst", "Service"], ["Waarvoor", "What for"], ["Waar", "Where"]],
      subs: [
        ["Railway", ["Hosting van de website, de apps en de database", "Hosting the website, apps and database"], ["Amsterdam", "Amsterdam"]],
        ["Lettermint", ["E-mails, zoals je inlogcode en bevestigingen", "Emails, such as your sign-in code and confirmations"], ["Nederland", "Netherlands"]],
        ["Sentry", ["Foutmeldingen, zonder persoonsgegevens", "Error reports, without personal data"], ["EU", "EU"]],
        ["PostHog", ["Statistieken zonder cookies", "Statistics without cookies"], ["EU", "EU"]],
        ["Cloudflare Turnstile", ["Bescherming van formulieren tegen bots", "Protecting forms against bots"], ["Wereldwijd", "Worldwide"]]
      ],
      subNote: ["Mollie verwerkt betalingen als zelfstandige verantwoordelijke, onder een eigen overeenkomst met je studio.", "Mollie processes payments as an independent controller, under its own agreement with your studio."]
    },
    direction: {
      decidedH: ["Wat je hebt besloten", "What you decided"],
      decided: [
        [["De knop wordt een demo", "The button becomes a demo"], ["Elke pagina leidt naar Plan een demo.", "Every page leads to Book a demo."]],
        [["De site staat op https://fivvi.app", "The site lives at https://fivvi.app"], ["De hoofdpagina wordt de website. De app blijft op dezelfde plek achter Inloggen.", "The main page becomes the website. The app stays in place behind Sign in."]],
        [["De site gaat eerder live", "The site goes live sooner"], ["Mollie vraagt om een openbare website, dus dit wacht niet op Release 2.0.", "Mollie asks for a public website, so this doesn't wait for Release 2.0."]],
        [["Mollie staat er met naam op", "Mollie is named"], ["Net als iDEAL, omdat het vertrouwen geeft.", "Like iDEAL, because it builds trust."]]
      ],
      needsH: ["Wat elke partij eist, en waar het staat", "What each party requires, and where it is"],
      needsLead: ["Dit is gecontroleerd op de pagina's van Mollie, Apple, Google en de Nederlandse overheid. Roze betekent: wacht op jouw gegevens.", "Checked against the pages of Mollie, Apple, Google and the Dutch government. Pink means: waiting for your details."],
      needsCols: [["Wie", "Who"], ["Wat", "What"], ["Pagina", "Page"]],
      needs: [
        ["Mollie", ["Prijs en omschrijving van wat je aanbiedt", "Price and description of what you offer"], ["Prijzen, en de vier verhalen", "Pricing, and the four stories"], "prijzen", 0],
        ["Mollie", ["Voorwaarden", "Terms and conditions"], ["Algemene voorwaarden", "Terms of service"], "voorwaarden", 1],
        ["Mollie", ["Handelsnaam, en KvK- of btw-nummer", "Trade name, and KvK or VAT number"], ["Onderaan elke pagina", "At the bottom of every page"], "support", 1],
        ["Mollie", ["Adres, telefoon of live contact, e-mail", "Address, phone or live contact, email"], ["Hulp en contact", "Help and contact"], "support", 1],
        ["Mollie", ["Privacybeleid, valuta en betaalvoorwaarden", "Privacy policy, currency and payment terms"], ["Privacyverklaring en Prijzen", "Privacy policy and Pricing"], "privacy", 1],
        ["Apple", ["Support-URL met echte contactgegevens (verplicht)", "Support URL with real contact details (required)"], ["Hulp en contact", "Help and contact"], "support", 1],
        ["Apple", ["Privacy-URL (verplicht), marketing-URL (mag)", "Privacy URL (required), marketing URL (optional)"], ["Privacyverklaring, en de hoofdpagina", "Privacy policy, and the main page"], "privacy", 1],
        ["Google Play", ["Privacy-URL, en een openbare link om je account te verwijderen", "Privacy URL, and a public link to delete your account"], ["Privacyverklaring en Account verwijderen", "Privacy policy and Delete account"], "account-verwijderen", 0],
        ["Nederland", ["Wie je bent, adres, KvK en btw, privacyverklaring", "Who you are, address, KvK and VAT, privacy statement"], ["Hulp en contact, en Privacyverklaring", "Help and contact, and Privacy policy"], "support", 1],
        ["AVG / GDPR", ["Openbare lijst van subverwerkers", "Public list of sub-processors"], ["Subverwerkers", "Sub-processors"], "subverwerkers", 0]
      ],
      seoH: ["Zo vindt Google ons", "How Google finds us"],
      seoLead: ["Dit ontwerp is de voorstelling. De echte site krijgt voor elke pagina een eigen adres, in twee talen, met dit als titel en omschrijving. Hieronder zie je hoe dat er in Google uitziet.", "This design is the preview. The real site gives each page its own address, in two languages, with this title and description. Below you see how that looks in Google."],
      seo: [
        ["/", "/en", ["Fivvi: software voor personal trainers, studio's en gyms", "Fivvi: software for personal trainers, studios and gyms"], ["Agenda, boekingen, credits, betalingen en facturen op één plek. Zo houd je tijd over om te trainen. Plan een demo.", "Calendar, bookings, credits, payments and invoices in one place, so you have time left to train. Book a demo."]],
        ["/gyms", "/en/gyms", ["Software voor sportscholen en gyms met een team | Fivvi", "Software for gyms with a team | Fivvi"], ["Eén agenda voor al je trainers, rollen die kloppen en betalingen die vanzelf gaan. Bekijk een werkdag in Fivvi.", "One calendar for all your trainers, proper roles and payments that run by themselves. See a working day in Fivvi."]],
        ["/studios", "/en/studios", ["Boekingssysteem voor pilates- en yogastudio's | Fivvi", "Booking system for pilates and yoga studios | Fivvi"], ["Klanten boeken zelf, de wachtlijst loopt vanzelf en credits kloppen altijd. In de woorden van jouw studio.", "Clients book themselves, the waitlist runs by itself and credits always add up. In your studio's own words."]],
        ["/personal-trainers", "/en/personal-trainers", ["Software voor personal trainers: agenda en logboek | Fivvi", "Software for personal trainers: calendar and log | Fivvi"], ["Je dag, je klanten, je logboek en je credits op je telefoon. Zonder schermen die je niet gebruikt.", "Your day, clients, log and credits on your phone. Without screens you don't use."]],
        ["/klanten", "/en/clients", ["Boek je les in een paar tikken | Fivvi voor klanten", "Book your class in a few taps | Fivvi for clients"], ["Boek, zet jezelf op de wachtlijst en zie altijd wat je nog tegoed hebt. Met de app of gewoon in je browser.", "Book, join the waitlist and always see your balance. With the app or just in your browser."]],
        ["/prijzen", "/en/pricing", ["Prijzen | Fivvi", "Pricing | Fivvi"], ["Fivvi is gratis tijdens de pilot. Geen abonnement en geen kosten per klant.", "Fivvi is free during the pilot. No subscription and no fee per client."]],
        ["/demo", "/en/demo", ["Plan een demo | Fivvi", "Book a demo | Fivvi"], ["Zie in 30 minuten hoe jouw werkweek eruitziet in Fivvi.", "See your working week in Fivvi in 30 minutes."]],
        ["/support", "/en/support", ["Hulp en contact | Fivvi", "Help and contact | Fivvi"], ["Veelgestelde vragen en hoe je ons bereikt.", "Frequently asked questions and how to reach us."]]
      ],
      seoMoreH: ["Wat erachter zit", "What's behind it"],
      seoMore: [
        [["Echte pagina's, vooraf opgebouwd", "Real pages, built in advance"], ["Google krijgt meteen de volledige tekst, zonder JavaScript.", "Google gets the full text right away, without JavaScript."]],
        [["Twee talen met eigen adressen", "Two languages with their own addresses"], ["Nederlands op /, Engels op /en, met hreflang en canonical op elke pagina.", "Dutch at /, English at /en, with hreflang and canonical on every page."]],
        [["Sitemap en robots", "Sitemap and robots"], ["sitemap.xml met beide talen. De app, inlogpagina's, boekingspagina's en previews blijven buiten Google.", "sitemap.xml with both languages. The app, sign-in pages, booking pages and previews stay out of Google."]],
        [["Gestructureerde gegevens", "Structured data"], ["Organization, SoftwareApplication en broodkruimels. Geen verzonnen beoordelingen.", "Organization, SoftwareApplication and breadcrumbs. No made-up ratings."]],
        [["Snel, ook op je telefoon", "Fast, on your phone too"], ["Moderne beeldformaten per schermgrootte en bijna geen JavaScript, met een harde norm voor Core Web Vitals.", "Modern image formats per screen size and almost no JavaScript, with a hard limit for Core Web Vitals."]],
        [["Delen ziet er goed uit", "Sharing looks good"], ["Een eigen afbeelding en titel voor elke pagina als je hem deelt.", "Its own image and title for each page when you share it."]],
        [["Geen cookiebanner nodig", "No cookie banner needed"], ["Alleen functionele cookies en statistieken zonder cookies. De jurist kijkt daar nog naar.", "Only functional cookies and statistics without cookies. The lawyer still checks this."]],
        [["Search Console", "Search Console"], ["Jij bevestigt het domein bij Google en Bing met één DNS-regel, daarna volgen we de resultaten.", "You confirm the domain with Google and Bing with one DNS record, then we track the results."]]
      ],
      youH: ["Wat ik nog van jou nodig heb", "What I still need from you"],
      you: [
        [["Je bedrijfsgegevens", "Your business details"], ["KvK-nummer, btw-nummer, adres, en een telefoon- of WhatsApp-nummer. Let op: dit adres staat straks openbaar op de site.", "KvK number, VAT number, address, and a phone or WhatsApp number. Note: this address will be public on the site."]],
        [["Kloppen de prijzen zo?", "Is the pricing right?"], ["Mollie wil een prijs zien. De pagina volgt nu je voorwaarden: gratis tijdens de pilot, en 60 dagen vooraf bericht als dat verandert.", "Mollie wants to see a price. The page now follows your terms: free during the pilot, and 60 days' notice if that changes."]],
        [["Juridische vragen uit #158", "Legal questions from #158"], ["Voor publicatie: Q2 (je bedrijf), Q11 (minimumleeftijd) en Q15 (prijswijzigingen). Elke vraag heeft een aanbeveling, dus \"akkoord\" is genoeg.", "Before publishing: Q2 (your company), Q11 (minimum age) and Q15 (price changes). Each has a recommendation, so \"agree\" is enough."]],
        [["De demo zelf", "The demo itself"], ["Ik ga uit van 30 minuten online, door jou, en antwoord binnen 1 werkdag. Klopt dat?", "I'm assuming 30 minutes online, by you, and a reply within 1 working day. Is that right?"]]
      ]
    }
  };
})();
