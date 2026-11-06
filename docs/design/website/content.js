/* All copy of the website proposal, Dutch first: [nl, en]. Only what PRODUCT.md and DECISIONS.md promise; no invented numbers, quotes or prices. */
window.COPY = (function () {
  var UI = {
    tagline: ["Jij traint. <em>Fivvi regelt de rest.</em>", "You train. <em>Fivvi handles the rest.</em>"],
    heroLead: ["Agenda, boekingen, credits, betalingen en facturen op één plek. Gemaakt voor personal trainers, studio's en sportscholen, en fijn voor hun klanten.", "Calendar, bookings, credits, payments and invoices in one place. Made for personal trainers, studios and gyms, and a pleasure for their clients."],
    iam: ["Ik ben", "I am"],
    see: ["Bekijk wat Fivvi voor jou doet", "See what Fivvi does for you"],
    onePlaceEye: ["Het probleem", "The problem"],
    onePlaceH: ["Je bedrijf staat nu op vijf plekken.", "Your business lives in five places."],
    onePlaceLead: ["Elke losse tool is een plek waar iets kan misgaan. In Fivvi hangt alles aan elkaar, dus je hoeft niets over te typen.", "Every separate tool is a place where something can go wrong. In Fivvi everything is connected, so there is nothing to retype."],
    scattered: [["Agenda-app", "Calendar app"], ["Word-documenten", "Word documents"], ["Facturen met de hand", "Invoices by hand"], ["Boeken via berichtjes", "Booking by message"], ["Losse boek- en betaalapp", "A separate booking and payment app"]],
    gone: ["in Fivvi", "in Fivvi"],
    oneRow: ["Fivvi", "Fivvi"],
    oneRowD: ["alles op één plek", "everything in one place"],
    chainEye: ["Het verschil", "The difference"],
    chainH: ["Eén boeking. Alles klopt meteen.", "One booking. Everything adds up."],
    chainLead: ["Probeer het maar. Boek de les hiernaast en kijk wat er vanzelf gebeurt.", "Try it. Book the class and watch what happens by itself."],
    steps: [
      [["Creditpakket", "Credit pack"], ["Lisa koopt 10 groepscredits en betaalt met iDEAL.", "Lisa buys 10 group credits and pays with iDEAL."]],
      [["Betaling", "Payment"], ["Het geld gaat rechtstreeks naar de studio, niet via Fivvi.", "The money goes straight to the studio, not through Fivvi."]],
      [["Factuur", "Invoice"], ["De factuur volgt vanzelf op de betaling.", "The invoice follows the payment by itself."]],
      [["Boeking", "Booking"], ["Ze boekt zelf, en één credit staat gepland.", "She books herself, and one credit is planned."]],
      [["Aanwezig", "Attendance"], ["De trainer vinkt haar af in de app.", "The trainer ticks her off in the app."]],
      [["Tegoed", "Balance"], ["Lisa en de eigenaar zien hetzelfde saldo.", "Lisa and the owner see the same balance."]]
    ],
    demoTitle: ["Rooster · Reformer", "Timetable · Reformer"],
    demoClass: ["Reformer", "Reformer"],
    demoWhen: ["vanavond · 4 plekken vrij", "tonight · 4 spots left"],
    left: ["over", "left"], planned: ["gepland", "planned"], used: ["gebruikt", "used"],
    book: ["Boeken", "Book"], confirm: ["Boeking bevestigen", "Confirm booking"], back: ["Terug", "Back"], attend: ["Aanwezig zetten (trainer)", "Mark as attended (trainer)"], again: ["Nog een keer", "Once more"],
    confirmText: ["<b>Reformer, vanavond 18:00.</b> Dit gebruikt 1 groepscredit, daarna heb je er nog 6. Gratis annuleren kan tot 12 uur vooraf.", "<b>Reformer, tonight 18:00.</b> This uses 1 group credit, leaving you 6. You can cancel for free up to 12 hours before."],
    say0: ["Lisa heeft 7 groepscredits over.", "Lisa has 7 group credits left."],
    say1: ["Geboekt. Eén credit staat gepland en komt terug als ze op tijd annuleert.", "Booked. One credit is planned and comes back if she cancels in time."],
    say2: ["Aanwezig. Het credit is gebruikt, zonder dat iemand iets bijhoudt.", "Attended. The credit is used, and nobody had to keep track."],
    forEye: ["Voor wie", "Who it's for"],
    forH: ["Jouw dag ziet er anders uit. Fivvi ook.", "Your day looks different. So does Fivvi."],
    forLead: ["Fivvi laat alleen zien wat jij doet. Een zelfstandig trainer ziet nooit groepslessen. Een yogastudio ziet nooit trainingsschermen.", "Fivvi only shows what you do. An independent trainer never sees group classes. A yoga studio never sees workout screens."],
    readDay: ["Lees hun dag", "Read their day"],
    platEye: ["Overal", "Everywhere"],
    platH: ["Echt thuis op elk scherm.", "At home on every screen."],
    platLead: ["De apps voor iPhone en Android komen eraan, met het glas van iOS en de stijl van Android. In je browser vind je dezelfde rust.", "The apps for iPhone and Android are coming, with iOS glass and the Android style. In your browser you'll find the same calm."],
    plat: {
      pro: { name: ["Eigenaren en trainers", "Owners and trainers"], items: [
        ["pro-today-gym", ["Fivvi Pro op iPhone", "Fivvi Pro on iPhone"], ["Met het glas van iOS.", "With iOS glass."]],
        ["pro-today-android", ["Fivvi Pro op Android", "Fivvi Pro on Android"], ["Op de manier van Android.", "The Android way."]],
        ["web-dashboard", ["Fivvi in je browser", "Fivvi in your browser"], ["Voor de administratie op je laptop.", "For the admin on your laptop."], 1]
      ] },
      client: { name: ["Klanten", "Clients"], items: [
        ["app-home", ["Fivvi op iPhone", "Fivvi on iPhone"], ["Je volgende les, deze week en je tegoed.", "Your next class, this week and your balance."]],
        ["app-android", ["Fivvi op Android", "Fivvi on Android"], ["Dezelfde app, op de manier van Android.", "The same app, the Android way."]],
        ["cw-timetable", ["Fivvi in je browser", "Fivvi in your browser"], ["Boeken zonder iets te installeren.", "Booking without installing anything."]]
      ] }
    },
    promisesEye: ["Waar je op kunt rekenen", "What you can count on"],
    promisesH: ["Simpel, en netjes geregeld.", "Simple, and properly done."],
    promises: [
      [["Het geld gaat rechtstreeks naar jou", "The money goes straight to you"], ["Je koppelt je eigen Mollie-account in één begeleide stap. Fivvi houdt geen geld van klanten vast.", "You connect your own Mollie account in one guided step. Fivvi never holds client money."]],
      [["Contant of pin mag ook", "Cash or card is fine too"], ["Leg een betaling buiten Fivvi vast op het klantprofiel. Geen Mollie willen kan ook; Fivvi vertelt eerst wat je dan mist.", "Record a payment outside Fivvi on the client's profile. Skipping Mollie is possible too; Fivvi first tells you what you'd miss."]],
      [["Notities blijven bij de trainer", "Notes stay with the trainer"], ["Trainersnotities zijn alleen voor trainers. Klanten zien ze niet.", "Trainer notes are for trainers only. Clients don't see them."]],
      [["Trainers zien geen bedragen", "Trainers don't see amounts"], ["Een trainer ziet de tegoeden van klanten, maar geen geld. Eigenaren zien ook de bedragen.", "A trainer sees clients' balances, but no money. Owners see the amounts too."]],
      [["Klanten hebben geen app nodig", "Clients don't need an app"], ["Een link of QR-code, hun e-mailadres en een code van 6 cijfers. Geen wachtwoord.", "A link or QR code, their email address and a 6-digit code. No password."]],
      [["Nederlands en Engels", "Dutch and English"], ["Alles bestaat in beide talen, en iedereen kiest zelf.", "Everything exists in both languages, and everyone chooses their own."]]
    ],
    dayEye: ["Een dag met Fivvi", "A day with Fivvi"],
    recognise: ["Herken je dit?", "Sound familiar?"],
    dayLead: ["Van de eerste sessie tot het einde van de dag. Elk probleem krijgt een antwoord, en dat antwoord is gewoon een scherm uit Fivvi.", "From the first session to the end of the day. Every problem gets an answer, and that answer is simply a screen from Fivvi."],
    foot: ["Alle voorbeelden op deze site zijn fictief.", "All examples on this site are fictional."],
    direction: ["Ontwerpkeuzes", "Design choices"],
    home: ["Fivvi", "Fivvi"],
    proposal: ["Ontwerpvoorstel", "Design proposal"],
    openChoices: ["Keuzes voor jou", "Choices for you"],
    light: ["Licht", "Light"], dark: ["Donker", "Dark"],
    kindLabel: ["Soort studio", "Kind of studio"],
    pilates: ["Pilates", "Pilates"], yoga: ["Yoga", "Yoga"]
  };

  var A = {
    gym: {
      nav: ["Sportscholen", "Gyms"], who: ["Sportschool met team", "Gym with a team"], colour: "priv",
      short: ["Eén agenda voor al je trainers, en altijd zicht op wie er nog moet betalen.", "One calendar for all your trainers, and always a clear view of who still has to pay."],
      cardH: ["Sportscholen met een team", "Gyms with a team"],
      stage: { web: "web-dashboard", phone: "pro-today-gym" },
      h1: ["Je team, je klanten en je geld in één overzicht.", "Your team, your clients and your money in one view."],
      lead: ["Vervang de losse agenda, de boekingsapp en de facturen met de hand door één plek waar je hele sportschool op draait.", "Replace the separate calendar, the booking app and the handmade invoices with one place your whole gym runs on."],
      heroWeb: "web-agenda", heroPhone: "pro-today-gym",
      pains: [["Trainers delen de inlog van een klant, of werken in hun eigen agenda.", "Trainers share a client login, or work from their own calendar."], ["Niemand weet precies hoeveel sessies een klant nog heeft.", "Nobody knows exactly how many sessions a client has left."], ["Facturen en incasso's kosten je de avond.", "Invoices and direct debits eat up your evening."]],
      day: [
        ["07:00", "priv", ["Drie trainers tegelijk aan het werk. Wie staat waar?", "Three trainers at work at once. Who's where?"], ["Hele studio geeft elke trainer een eigen baan, en noemt je drukste moment van de dag.", "Whole studio gives each trainer their own lane, and names the busiest moment of your day."], [["Sessies naast elkaar, zonder puzzelen", "Sessions side by side, no puzzling"], ["Op je telefoon en op je laptop", "On your phone and your laptop"]], "pro-today-gym"],
        ["09:00", "accent", ["Wat vraagt vandaag om aandacht?", "What needs attention today?"], ["Het dashboard zet het voor je klaar: een open betaling, een pakket dat bijna op is, een abonnement dat stopt.", "The dashboard lines it up for you: an open payment, a pack running out, a membership ending."], [["Je hoeft niets te zoeken of bij te houden", "Nothing to search or keep track of"]], "web-dashboard"],
        ["11:00", "group", ["Een nieuwe trainer. Wat mag die zien?", "A new trainer. What can they see?"], ["Trainers krijgen een eigen teamtoegang, nooit een klantaccount. Ze zien hun agenda en de tegoeden, maar geen bedragen.", "Trainers get their own team access, never a client account. They see their calendar and balances, but no amounts."], [["Rol wijzigen: trainer of eigenaar", "Change role: trainer or owner"], ["Vertrekt iemand? Je ziet de komende 2 weken en draagt ze over", "Someone leaving? You see the next 2 weeks and hand them over"]], "web-trainers"],
        ["14:00", "group", ["De les van vanavond heeft geen trainer meer.", "Tonight's class has lost its trainer."], ["Zet een vervanger op de les en je bent klaar. Op dezelfde pagina zie je wie er komt en wie op de wachtlijst staat.", "Put a substitute on the class and you're done. The same page shows who's coming and who's on the waitlist."], [["Aanwezigheid per deelnemer", "Attendance per participant"], ["Wachtlijst op volgorde", "Waitlist in order"]], "web-class"],
        ["16:00", "ok", ["Je prijzen staan in een spreadsheet.", "Your prices live in a spreadsheet."], ["Aanbod houdt al je abonnementen, creditpakketten en creditabonnementen bij elkaar. Je begint met drie kant-en-klare plannen: prijs erbij, aanzetten.", "Offers keeps your memberships, credit packs and credit plans together. You start with three ready-made plans: add a price, switch one on."], [["Een wijziging geldt alleen voor nieuwe abonnementen en pakketten", "A change only applies to new memberships and packs"], ["Klanten zien alleen wat aan staat", "Clients only see what's switched on"]], "web-offers"],
        ["18:00", "priv", ["Klanten betalen te laat, en jij stuurt de herinnering.", "Clients pay late, and you send the reminder."], ["Koppel Mollie in één begeleide stap. Klanten betalen met iDEAL, daarna gaat het maandelijks automatisch, en de factuur volgt vanzelf.", "Connect Mollie in one guided step. Clients pay with iDEAL, after that it runs monthly by itself, and the invoice follows."], [["Het geld gaat rechtstreeks naar jouw rekening", "The money goes straight to your account"], ["Mislukt een betaling? Jij en de klant krijgen bericht", "A payment fails? You and the client hear about it"]], "web-payments"],
        ["21:00", "accent", ["Een abonnement stopt, en niemand merkte het.", "A membership ends, and nobody noticed."], ["Fivvi herinnert de klant zelf, twee keer, met verlengen in één tik. Jij ziet het op het klantprofiel en kunt altijd zelf een aanbod sturen.", "Fivvi reminds the client itself, twice, with one-tap renewal. You see it on the client's profile and can always send an offer yourself."], [["Geen gat en geen overlap als het verlengt", "No gap and no overlap when it renews"]], "web-client"]
      ]
    },
    studio: {
      nav: ["Studio's", "Studios"], who: ["Studio", "Studio"], colour: "group",
      short: ["Volle lessen, een nette wachtlijst en klanten die zelf boeken.", "Full classes, a tidy waitlist and clients who book themselves."],
      cardH: ["Pilates- en yogastudio's", "Pilates and yoga studios"],
      stage: { web: "web-class-pilates", phone: "pro-today-pilates" },
      h1: ["Je lessen zitten vol. Je hoofd niet meer.", "Your classes are full. Your head isn't."],
      lead: ["Een rooster waar klanten zelf in boeken, credits die altijd kloppen en een wachtlijst die vanzelf loopt. In de woorden van jouw studio.", "A timetable clients book themselves, credits that always add up and a waitlist that runs by itself. In your studio's own words."],
      heroWeb: "web-class-kind", heroPhone: "pro-today-pilates",
      pains: [["De les zit vol, en de berichtjes blijven komen.", "The class is full, and the messages keep coming."], ["Tienrittenkaarten op papier of in een spreadsheet.", "Ten-class cards on paper or in a spreadsheet."], ["Software voor sportscholen die jouw studio niet begrijpt.", "Gym software that doesn't understand your studio."]],
      day: [
        ["06:45", "group", ["Zes plekken, en iedereen wil om half zeven.", "Six spots, and everyone wants half past six."], ["Klanten boeken zelf vanuit het rooster. Is de les vol, dan krijgen ze de wachtlijst, met hun plek erbij.", "Clients book themselves from the timetable. When the class is full, they get the waitlist, with their position shown."], [["Boeken altijd met een bevestiging", "Booking always asks for confirmation"], ["Geen berichtjes meer heen en weer", "No more messages back and forth"]], "cw-waitlist-kind"],
        ["09:00", "ok", ["Hoeveel lessen heeft ze nog op haar kaart?", "How many classes are left on her card?"], ["Credits per soort: gebruikt, gepland en over. De klant ziet hetzelfde als jij.", "Credits per kind: used, planned and left. The client sees the same as you."], [["Groeps- en privécredits lopen nooit door elkaar", "Group and private credits never mix"], ["Op tijd annuleren geeft het credit terug", "Cancelling in time gives the credit back"]], "app-credit"],
        ["10:30", "group", ["Je {who} belt zich ziek.", "Your {who} calls in sick."], ["Zet een vervanger op de les. Klanten boeken gewoon door en de les blijft staan.", "Put a substitute on the class. Clients keep booking and the class stays on."], [["Op dezelfde pagina zie je wie er komt", "The same page shows who's coming"]], "web-class-kind"],
        ["12:00", "priv", ["Beginners in een les voor gevorderden.", "Beginners in an advanced class."], ["Geef elke les een niveau en een beschrijving, in het Nederlands en het Engels. Zo kiest iedereen de juiste les.", "Give each class a level and a description, in Dutch and English. So everyone picks the right class."], [["Beginner, gemiddeld, gevorderd of alle niveaus", "Beginner, intermediate, advanced or all levels"], ["Per datum aan te passen", "Changeable per date"]], "pro-class-kind"],
        ["15:00", "accent", ["Wij zeggen geen trainer.", "We don't say trainer."], ["Kies je eigen woord: trainer, instructeur, docent of coach. Heel Fivvi praat daarna zoals jouw studio. En een yogastudio met alleen lessen ziet geen trainingsschermen.", "Choose your own word: trainer, instructor, teacher or coach. All of Fivvi then speaks like your studio. And a yoga studio with only classes sees no workout screens."], [["Fivvi laat alleen zien wat jullie doen", "Fivvi only shows what you do"]], "pro-today-kind"],
        ["19:00", "ok", ["Nieuwe klant aan de balie. En nu?", "A new client at the desk. Now what?"], ["Print de A4-poster met je QR-code, in twee talen. Scannen, aanmeldverzoek sturen, jij keurt goed, klaar.", "Print the A4 poster with your QR code, in two languages. Scan, sign up, you approve, done."], [["Geen app nodig om te boeken", "No app needed to book"], ["In kleur of zwart-wit", "In colour or black and white"]], "web-join-kind"]
      ]
    },
    pt: {
      nav: ["Personal trainers", "Personal trainers"], who: ["Personal trainer", "Personal trainer"], colour: "priv",
      short: ["Je hele dag in je broekzak: wie er komt, wat jullie vorige keer deden en wat er nog over is.", "Your whole day in your pocket: who's coming, what you did last time and what's left."],
      cardH: ["Personal trainers", "Personal trainers"],
      stage: { phones: ["pro-today-solo", "pro-log", "pro-client"] },
      h1: ["Train je klant. Niet je administratie.", "Train your client. Not your admin."],
      lead: ["Alles voor je sessies op je telefoon, ook midden op de vloer. Zonder groepslessen of teamschermen die je toch niet gebruikt.", "Everything for your sessions on your phone, even in the middle of the floor. Without the group classes or team screens you'd never use."],
      heroPhone: "pro-today-solo",
      pains: [["Je agenda, je notities en je facturen staan overal en nergens.", "Your calendar, notes and invoices are all over the place."], ["Je rekent uit hoeveel sessies een klant nog heeft.", "You work out how many sessions a client has left."], ["Na een lange dag begint de administratie nog.", "After a long day, the admin is still waiting."]],
      day: [
        ["07:00", "priv", ["Waar moet je ook alweer zijn?", "Where do you need to be again?"], ["Vandaag laat in één regel je dag zien, en daaronder wie, hoe laat en waar. Werk je op meer plekken, dan zie je de route van vandaag.", "Today shows your day in one line, and below it who, when and where. Working in several places? You'll see today's route."], [["Het volgende gat in je dag staat klaar om te plannen", "Your next free gap is ready to plan"]], "pro-today-solo"],
        ["07:25", "priv", ["Wat deden we vorige keer?", "What did we do last time?"], ["Open de klant en je ziet de laatste training, wat zwaar was, je eigen notitie en de voortgang per oefening.", "Open the client and you see the last workout, what was hard, your own note and progress per exercise."], [["Notities zijn alleen voor jou", "Notes are for you only"]], "pro-client"],
        ["07:30", "ok", ["Je houdt het nog op papier bij, of helemaal niet.", "You log on paper, or not at all."], ["Eén rij per set met de waarde van vorige keer ernaast. Vink af, en geef per oefening aan hoe zwaar het was.", "One row per set with last time's value next to it. Tick it off, and mark how hard each exercise was."], [["Gemaakt om te gebruiken met één hand", "Made to use with one hand"], ["Opslaan als schema voor de volgende keer", "Save it as a template for next time"]], "pro-log"],
        ["08:30", "accent", ["Hoeveel sessies heeft ze nog?", "How many sessions does she have left?"], ["Geen rekenwerk: voor de sessie zie je al of het credit bijna op is, of dat er nog een betaling openstaat.", "No sums: before the session you already see if credits are running out, or if a payment is still open."], [["Gebruikt, gepland en over", "Used, planned and left"], ["Verlengen met één tik", "Renew with one tap"]], "pro-session"],
        ["09:15", "group", ["Twee vriendinnen willen samen trainen.", "Two friends want to train together."], ["Een duosessie: één trainer, twee klanten, ieder met een eigen training, credit en aanwezigheid.", "A duo session: one trainer, two clients, each with their own workout, credit and attendance."], [["Schakel tussen de twee tijdens het bijhouden", "Switch between the two while logging"]], "pro-duo"],
        ["09:20", "ok", ["Je klant wil weten wat ze vandaag gedaan heeft.", "Your client wants to know what she did today."], ["Deel de training met één bericht. Je klant ziet alle oefeningen en kan hem zelf nog eens doen.", "Share the workout with one message. Your client sees every exercise and can redo it on their own."], [["Geen schermafbeeldingen meer in de chat", "No more screenshots in a chat"]], "pro-share"]
      ]
    },
    klanten: {
      nav: ["Klanten", "Clients"], who: ["Klant", "Client"], colour: "accent",
      short: ["Boek je les in een paar tikken en zie altijd wat je nog tegoed hebt.", "Book your class in a few taps and always see what's on your balance."],
      cardH: ["En hun klanten", "And their clients"],
      stage: { phones: ["app-home", "app-book", "app-credit"] },
      h1: ["Sporten is al moeilijk genoeg. Boeken niet.", "Working out is hard enough. Booking isn't."],
      lead: ["Vraag je studio of trainer om Fivvi, en boek voortaan vanaf je telefoon. Altijd duidelijk wat je geboekt hebt en wat je nog over hebt.", "Ask your studio or trainer for Fivvi, and book from your phone from now on. Always clear what you've booked and what you have left."],
      heroPhone: "app-home",
      pains: [["Een berichtje sturen om een les te boeken.", "Sending a message to book a class."], ["Geen idee hoeveel lessen er nog op je kaart staan.", "No idea how many classes are left on your card."], ["Voor elke studio een andere app.", "A different app for every studio."]],
      day: [
        ["08:10", "group", ["Even een les boeken in de trein.", "Quickly book a class on the train."], ["Open het rooster en tik op Boeken. Je hebt niet eens een app nodig: de browser is genoeg, en de app maakt het nog fijner.", "Open the timetable and tap Book. You don't even need an app: the browser is enough, and the app makes it nicer."], [["Inloggen met een code per e-mail, geen wachtwoord", "Sign in with an emailed code, no password"]], "app-book"],
        ["08:11", "accent", ["Kost dit een credit? Hoeveel heb ik er nog?", "Does this use a credit? How many do I have?"], ["Voor je bevestigt, zie je de les, de dag en de trainer, welk credit het kost, hoeveel je er overhoudt en tot wanneer je gratis annuleert.", "Before you confirm, you see the class, the day and the trainer, which credit it uses, how many you'll have left and until when you can cancel for free."], [["Op tijd annuleren geeft je credit terug", "Cancelling in time gives your credit back"]], "app-confirm"],
        ["12:30", "group", ["Vol. Natuurlijk.", "Full. Of course."], ["Zet jezelf op de wachtlijst en zie meteen de hoeveelste je bent.", "Put yourself on the waitlist and see your position right away."], [["Weer weg van de lijst kan ook", "Leaving the list is fine too"]], "cw-waitlist"],
        ["18:30", "ok", ["Ga ik eigenlijk wel vaak genoeg?", "Am I actually going often enough?"], ["Deze week laat zien wanneer je bent geweest en wat er nog gepland staat, plus hoeveel weken op rij je bezig bent.", "This week shows when you went and what's still planned, plus how many weeks in a row you've kept it up."], [["Alleen feiten, geen doelen die iemand anders verzon", "Just facts, no goals someone else made up"]], "app-home"],
        ["20:00", "priv", ["De training van je trainer, maar nu in je eigen sportschool.", "Your trainer's workout, but now in your own gym."], ["Open de gedeelde training en doe hem zelf, met de gewichten van je trainer al ingevuld. Oefeningen toevoegen of weghalen mag.", "Open the shared workout and do it yourself, with your trainer's weights filled in. Adding or removing exercises is fine."], [["Alleen jij ziet deze training", "Only you see this workout"]], "app-self"],
        ["21:00", "group", ["Pilates hier, yoga daar.", "Pilates here, yoga there."], ["Eén account voor al je studio's. Wissel met één tik en zie per studio je eigen tegoed.", "One account for all your studios. Switch with one tap and see your balance per studio."], [["Home en agenda combineren al je studio's", "Home and calendar combine all your studios"]], "app-studios"],
        ["22:00", "accent", ["Je credits zijn bijna op.", "Your credits are almost gone."], ["Je krijgt op tijd een seintje, en verlengt in één tik met iDEAL. Daarna is de melding weg.", "You get a heads-up in time, and renew in one tap with iDEAL. After that, the notice is gone."], [["Je factuur staat in je profiel", "Your invoice is in your profile"]], "app-renew"]
      ]
    }
  };

  var ORDER = ["gym", "studio", "pt", "klanten"];

  var SHOTS = {
    "pro-today-gym": ["Fivvi Pro: de dag van de hele studio, met een baan per trainer", "Fivvi Pro: the whole studio's day, with a lane per trainer"],
    "pro-today-solo": ["Fivvi Pro: de dag van een zelfstandig trainer", "Fivvi Pro: an independent trainer's day"],
    "pro-today-pilates": ["Fivvi Pro: de dag van een pilatesstudio", "Fivvi Pro: a pilates studio's day"],
    "pro-today-yoga": ["Fivvi Pro: de dag van een yogastudio", "Fivvi Pro: a yoga studio's day"],
    "pro-today-android": ["Fivvi Pro op Android: de dag van vandaag", "Fivvi Pro on Android: today's day"],
    "pro-client": ["Fivvi Pro: klantprofiel met tegoed, vorige training en voortgang", "Fivvi Pro: client profile with balance, last workout and progress"],
    "pro-session": ["Fivvi Pro: een privésessie met de tegoeden van de klant", "Fivvi Pro: a private session with the client's balance"],
    "pro-duo": ["Fivvi Pro: een duosessie met twee klanten", "Fivvi Pro: a duo session with two clients"],
    "pro-log": ["Fivvi Pro: een training bijhouden, per set", "Fivvi Pro: logging a workout, set by set"],
    "pro-share": ["Fivvi Pro: een training delen met de klant", "Fivvi Pro: sharing a workout with the client"],
    "app-android": ["Fivvi op Android: Home met de volgende les", "Fivvi on Android: Home with the next class"],
    "cw-timetable": ["Klantweb: het rooster in de browser", "Client web: the timetable in the browser"],
    "app-home": ["Fivvi: Home met de volgende les en deze week", "Fivvi: Home with the next class and this week"],
    "app-book": ["Fivvi: het rooster met Boeken bij elke les", "Fivvi: the timetable with Book on every class"],
    "app-confirm": ["Fivvi: een boeking bevestigen, met het credit dat het kost", "Fivvi: confirming a booking, with the credit it uses"],
    "app-credit": ["Fivvi: profiel met tegoed per soort", "Fivvi: profile with balance per kind"],
    "app-studios": ["Fivvi: wisselen tussen twee studio's", "Fivvi: switching between two studios"],
    "app-renew": ["Fivvi: een melding om te verlengen", "Fivvi: a notice to renew"],
    "app-self": ["Fivvi: een gedeelde training zelf doen", "Fivvi: doing a shared workout yourself"],
    "cw-waitlist": ["Klantweb: op de wachtlijst, met je plek", "Client web: on the waitlist, with your position"],
    "cw-waitlist-pilates": ["Klantweb: op de wachtlijst van een volle reformerles", "Client web: on the waitlist of a full reformer class"],
    "cw-waitlist-yoga": ["Klantweb: op de wachtlijst van een volle yogales", "Client web: on the waitlist of a full yoga class"],
    "pro-class-pilates": ["Fivvi Pro: een reformerles", "Fivvi Pro: a reformer class"],
    "pro-class-yoga": ["Fivvi Pro: een yogales", "Fivvi Pro: a yoga class"],
    "web-class-pilates": ["Trainer web: een les op datum met aanwezigheid en wachtlijst", "Trainer web: a class on a date with attendance and waitlist"],
    "web-class-yoga": ["Trainer web: een yogales op datum", "Trainer web: a yoga class on a date"],
    "web-join-pilates": ["Trainer web: aanmeldlink en QR-code", "Trainer web: join link and QR code"],
    "web-join-yoga": ["Trainer web: aanmeldlink en QR-code", "Trainer web: join link and QR code"],
    "web-dashboard": ["Trainer web: dashboard met Aandacht nodig", "Trainer web: dashboard with what needs attention"],
    "web-agenda": ["Trainer web: de agenda per trainer", "Trainer web: the calendar per trainer"],
    "web-client": ["Trainer web: klantprofiel met verlengen", "Trainer web: client profile with renewal"],
    "web-class": ["Trainer web: een les op datum met aanwezigheid en wachtlijst", "Trainer web: a class on a date with attendance and waitlist"],
    "web-trainers": ["Trainer web: trainers en rollen", "Trainer web: trainers and roles"],
    "web-offers": ["Trainer web: Aanbod", "Trainer web: offers"],
    "web-payments": ["Trainer web: betalingen gekoppeld", "Trainer web: payments connected"]
  };

  var DIRECTION = {
    h1: ["Eén werkdag, geen featurelijst.", "One working day, not a feature list."],
    lead: ["De site verkoopt niet met beloftes, maar laat zien hoe een dag met Fivvi eruitziet. Elk moment is een probleem dat je herkent. Het antwoord is een echt scherm uit het prototype.", "The site doesn't sell with promises; it shows what a day with Fivvi looks like. Every moment is a problem you recognise. The answer is a real screen from the prototype."],
    cards: [
      [["Calendar calm, Fitness pops", "Calendar calm, Fitness pops"], ["Dezelfde taal als de app: grijs canvas, witte kaarten, één accent. De tijden en gekleurde balken komen uit Agenda, en de dag is de rode draad.", "The same language as the app: grey canvas, white cards, one accent. The times and coloured bars come from Calendar, and the day is the thread."]],
      [["Schermen eerst", "Screens first"], ["De echte schermen zijn het bewijs. Ze komen met een script uit het prototype, in NL en EN, licht en donker, dus ze blijven kloppen als het ontwerp verandert.", "The real screens are the proof. A script captures them from the prototype, in Dutch and English, light and dark, so they stay right when the design changes."]],
      [["Beeld staat op zichzelf", "Images stand alone"], ["Nooit als achtergrond achter schermen of tekst. Gemaakt met je ChatGPT-abonnement via Codex, zonder mensen of logo's. Echte foto's van de pilot kunnen later bij.", "Never as a background behind screens or text. Made with your ChatGPT subscription through Codex, without people or logos. Real pilot photos can join later."]],
      [["Vier verhalen, één site", "Four stories, one site"], ["De keuze \"Ik ben\" bepaalt wat je ziet. Sportschool, studio, PT en klant krijgen elk hun eigen dag, hun eigen problemen en hun eigen woorden.", "The \"I am\" choice decides what you see. Gym, studio, PT and client each get their own day, their own problems and their own words."]],
      [["Niets verzonnen", "Nothing made up"], ["Geen getallen of klantverhalen die we niet hebben. De teksten volgen PRODUCT.md en DECISIONS.md. Bewijs van de pilot komt erbij zodra het er is.", "No numbers or testimonials we don't have. The words follow PRODUCT.md and DECISIONS.md. Proof from the pilot goes in once it exists."]],
      [["Eén gewaagd moment", "One bold moment"], ["De kop is groot, de rest is stil. Het enige dat beweegt is de boeking op de homepagina, waar je zelf ziet dat alles klopt.", "The headline is big, the rest is quiet. The only thing that moves is the booking on the homepage, where you see for yourself that it all adds up."]]
    ],
    assumeH: ["Aannames op deze pagina's", "Assumptions on these pages"],
    assume: [
      [["De site beschrijft het product zoals het straks is", "The site describes the product as it will be"], ["De site gaat live voor Mollie, dus voor veel van het product. Betalingen en facturen komen met M11, trainingen, notities en delen met M7, en de apps, duosessies en meer locaties later. Daarom staat er op elke pagina dat Fivvi nu wordt gebouwd. Voor publicatie controleren we elke zin tegen wat er echt staat.", "The site goes live for Mollie, so before much of the product. Payments and invoices arrive with M11, workouts, notes and sharing with M7, and the apps, duo sessions and more locations later. So every page says Fivvi is being built now. Before publishing, we check every sentence against what really exists."]],
      [["Echte merknamen zijn uit de schermen gehaald", "Real brand names are taken out of the screens"], ["Sportscholen uit de voorbeelddata zijn alleen in de schermafbeeldingen vervangen door neutrale namen; het prototype zelf is niet gewijzigd.", "Gyms in the sample data were replaced with neutral names in the screenshots only; the prototype itself hasn't changed."]],
      [["Twee schermen lopen nog niet gelijk", "Two screens aren't in step yet"], ["Iedereen aanwezig op de lespagina is gepland voor Release 1.1. Het klantscherm in de browser toont ook nog de oude tabs. Voor publicatie maken we die schermafbeeldingen opnieuw.", "Mark everyone present on the class page is planned for Release 1.1. The client's browser screen also still shows the old tabs. Before publishing, we retake those screenshots."]],
      [["De voorbeelden zijn fictief", "The examples are fictional"], ["Lisa, Studio Fit en alle bedragen zijn verzonnen, net als in het prototype.", "Lisa, Studio Fit and all amounts are made up, just like in the prototype."]],
      [["De tijden zijn een verhaal", "The times are a story"], ["De klokken op de pagina's zijn een manier om te vertellen, geen functie in het product.", "The clocks on the pages are a storytelling device, not a product feature."]],
      [["De formulieren versturen niets", "The forms send nothing"], ["De demo-aanvraag is alleen een ontwerp en bewaart geen gegevens.", "The demo request is a design only and stores no data."]]
    ]
  };

  return { UI: UI, A: A, ORDER: ORDER, SHOTS: SHOTS, DIRECTION: DIRECTION };
})();
