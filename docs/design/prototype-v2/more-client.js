/* Client screens from the specs (Fivvi and the client web): each state a client can land in, with the spec's copy. */
(function () {
  "use strict";
  var F = window.FV, X = window.FVW.x, I = window.FIVVI_I18N, esc = F.esc, ic = F.ic, K = X.K, cbtn = X.cbtn, CWEB = X.CWEB, A = F.A, C = X.C, R = X.R;
  function L(p) { I.add(p[0], p[1]); return p[0]; }
  /* name, ref, tone (ok | warn | bad | info), url, title, [lines], [buttons], extra html */
  var ST = [
    /* ---- #480 sign-up, #498 Apple and Google ---- */
    ["Inloggen: nieuw bij Fivvi", "#480", "info", "fivvi.app/inloggen", ["Inloggen", "Sign in"], [["Nieuw bij Fivvi? Dan maken we meteen een account voor je aan.", "New to Fivvi? We'll create an account for you right away."], ["Lees hoe we met je gegevens omgaan in onze privacyverklaring.", "Read how we handle your data in our privacy statement."]], [["Doorgaan met Apple", "Continue with Apple"], ["Doorgaan met Google", "Continue with Google"], ["Stuur me een code", "Send me a code"]], [["of met je e-mailadres", "or with your email"]]],
    ["Inloggen met Apple lukte niet", "#498", "bad", "fivvi.app/inloggen", ["Inloggen lukte niet", "Couldn't sign in"], [["Inloggen met Apple lukte niet. Probeer het opnieuw of log in met je e-mailadres.", "Signing in with Apple didn't work. Try again or sign in with your email."]], [["Stuur me een code", "Send me a code"]]],
    ["Uitnodiging voor een ander adres (Apple)", "#498", "warn", "fivvi.app/i/…", ["Ander e-mailadres", "Different email address"], [["Je bent ingelogd als a•••@example.com. Deze uitnodiging is voor k•••@example.com.", "You're signed in as a•••@example.com. This invitation is for k•••@example.com."], ["Gebruik hetzelfde e-mailadres als in de uitnodiging.", "Use the same email address as in the invitation."]], [["Uitloggen en verder", "Sign out and continue"]]],
    ["Je naam invullen", "#480", "info", "fivvi.app/welkom", ["Hoe mogen we je noemen?", "What should we call you?"], [["Je studio ziet deze naam.", "Your studio sees this name."]], [["Verder", "Continue"]], null, [["Naam", "Name"]]],
    ["Geen studio: wat nu", "#480", "info", "fivvi.app", ["Mijn studio's", "My studios"], [["Vraag je studio om de aanmeldlink.", "Ask your studio for its link."], ["Heb je de link al? Open hem en vraag daar om lid te worden.", "Got the link? Open it and ask to join there."], ["Ben je trainer of eigenaar? Gebruik de app Fivvi Pro.", "Are you a trainer or owner? Use the Fivvi Pro app."]], [["QR-code scannen", "Scan QR code"]]],
    /* ---- #484 joining ---- */
    ["Meedoen: verzoek sturen", "#484", "info", "fivvi.app/j/studio-fit", ["Klant worden bij Studio Fit?", "Become a client of Studio Fit?"], [["Log in met je e-mailadres en vraag of je klant mag worden. Studio Fit keurt je verzoek goed.", "Sign in with your email and ask to join. Studio Fit approves your request."], ["Je naam: Kim de Graaf", "Your name: Kim de Graaf"]], [["Verzoek sturen", "Send request"]], null, [["Bericht aan Studio Fit (optioneel)", "Message to Studio Fit (optional)"]]],
    ["Meedoen: wachten, verzoek intrekken", "#484", "info", "fivvi.app/j/studio-fit", ["Wachten op Studio Fit", "Waiting for Studio Fit"], [["We hebben je verzoek gestuurd. Je krijgt een e-mail zodra Studio Fit heeft gereageerd.", "We've sent your request. You'll get an email as soon as Studio Fit replies."]], [["Verzoek intrekken", "Withdraw request"]]],
    ["Meedoen: al klant", "#484", "ok", "fivvi.app/j/studio-fit", ["Je bent al klant", "You're already a client"], [["Je bent al klant bij Studio Fit.", "You're already a client of Studio Fit."]], [["Rooster bekijken", "See the timetable"]]],
    ["Meedoen: eerder afgewezen", "#484", "info", "fivvi.app/j/studio-fit", ["Klant worden bij Studio Fit?", "Become a client of Studio Fit?"], [["Je kunt later opnieuw een verzoek sturen.", "You can send a new request later."]], []],
    ["Meedoen: link werkt niet meer", "#484", "bad", "fivvi.app/j/…", ["Link werkt niet meer", "Link no longer works"], [["Deze aanmeldlink werkt niet meer. Vraag je studio om de nieuwe link.", "This join link no longer works. Ask your studio for the new link."]], []],
    ["QR-code: geen aanmeldlink", "#484", "bad", "", ["QR-code scannen", "Scan QR code"], [["Dit is geen aanmeldlink van Fivvi.", "This isn't a Fivvi join link."]], [["Opnieuw proberen", "Try again"]]],
    ["QR-code: geen cameratoegang", "#484", "warn", "", ["QR-code scannen", "Scan QR code"], [["Fivvi gebruikt de camera om de QR-code van je studio te scannen.", "Fivvi uses the camera to scan your studio's QR code."], ["Geef Fivvi toegang tot de camera in Instellingen, of open de link van je studio.", "Give Fivvi access to the camera in Settings, or open your studio's link."]], [["Naar Instellingen", "Go to Settings"]]],
    /* ---- #482 invitation page ---- */
    ["Uitnodiging: inloggen", "#482", "info", "fivvi.app/i/…", ["Studio Fit heeft je toegevoegd als klant", "Studio Fit added you as a client"], [["Log in als a•••@example.com om lessen te boeken.", "Sign in as a•••@example.com to book classes."], ["Gebruik hetzelfde e-mailadres als in de uitnodiging.", "Use the same email address as in the invitation."]], [["Doorgaan met Apple", "Continue with Apple"], ["Doorgaan met Google", "Continue with Google"], ["Stuur me een code", "Send me a code"]]],
    ["Uitnodiging: code", "#482", "info", "fivvi.app/i/…", ["Check je e-mail", "Check your email"], [["We hebben een code gestuurd naar a•••@example.com.", "We've sent a code to a•••@example.com."]], [["Inloggen", "Sign in"]], null, [["Code", "Code"]]],
    ["Uitnodiging: ander account", "#482", "warn", "fivvi.app/i/…", ["Ander e-mailadres", "Different email address"], [["Deze uitnodiging is voor a•••@example.com. Je bent ingelogd als k•••@example.com.", "This invitation is for a•••@example.com. You're signed in as k•••@example.com."]], [["Uitloggen en verder", "Sign out and continue"]]],
    ["Uitnodiging: werkt niet meer", "#482", "bad", "fivvi.app/i/…", ["Uitnodiging werkt niet meer", "Invitation no longer works"], [["Deze uitnodiging werkt niet meer. Vraag Studio Fit om een nieuwe.", "This invitation no longer works. Ask Studio Fit for a new one."]], []],
    ["Uitnodiging: welkom", "#482", "ok", "fivvi.app", ["Welkom bij Studio Fit!", "Welcome to Studio Fit!"], [["Je ziet nu het rooster en kunt lessen boeken.", "You can now see the timetable and book classes."]], [["Rooster bekijken", "See the timetable"]]],
    /* ---- #489 timetable ---- */
    ["Rooster: niets gepland", "#489", "info", "fivvi.app/book/studio-fit", ["Boek een les", "Book a class"], [["Er staan de komende 14 dagen geen lessen gepland. Kijk later nog eens.", "No classes are planned in the next 14 days. Check back later."]], [["Meer dagen tonen", "Show more days"]]],
    ["Rooster: laden lukt niet", "#489", "bad", "fivvi.app/book/studio-fit", ["Boek een les", "Book a class"], [["De pagina kon niet laden.", "The page couldn't load."]], [["Opnieuw proberen", "Try again"]]],
    ["Rooster: geen klant", "#489", "warn", "fivvi.app/book/studio-fit", ["Alleen voor klanten", "For clients only"], [["Deze pagina is alleen voor klanten van een studio. Ben je nog geen klant? Vraag je studio om de aanmeldlink.", "This page is for a studio's clients only. Not a client yet? Ask your studio for its link."]], []],
    ["Rooster: voorbeeld voor de studio", "#489", "info", "fivvi.app/book/studio-fit", ["Boek een les", "Book a class"], [["Zo zien je klanten het rooster. Je kunt hier niet boeken.", "This is how your clients see the timetable. You can't book here."], ["Tijden in Nederlandse tijd.", "Times in Dutch time."]], []],
    /* ---- #491 booking results ---- */
    ["Geboekt", "#491", "ok", "", ["Je hebt deze les geboekt.", "You've booked this class."], [["Kracht · di 10 nov · 18:00–19:00 · Sarah", "Strength · Tue 10 Nov · 18:00–19:00 · Sarah"], ["Je krijgt ook een bevestiging per e-mail.", "You'll also get a confirmation by email."], ["Ander moment nodig? Annuleer deze boeking en boek daarna een andere les.", "Need another time? Cancel this booking and then book another class."]], [["Zet in je agenda", "Add to your calendar"], ["Nog een les boeken", "Book another class"], ["Naar mijn boekingen", "Go to my bookings"]]],
    ["Net te laat", "#491", "warn", "", ["Net te laat", "Just too late"], [["Net te laat: de laatste plek is zojuist geboekt.", "Just too late: the last spot has just been booked."]], [["Zet me op de wachtlijst", "Put me on the waitlist"], ["Andere momenten bekijken", "See other times"]]],
    ["Al geboekt", "#491", "ok", "", ["Al geboekt", "Already booked"], [["Je had deze les al geboekt.", "You had already booked this class."]], [["Bekijk je boeking", "View your booking"]]],
    ["Les al begonnen", "#491", "info", "", ["Kracht", "Strength"], [["Deze les is al begonnen en kan niet meer geboekt worden.", "This class has already started and can't be booked any more."]], [["Andere momenten bekijken", "See other times"]]],
    ["Les gaat niet door", "#491", "bad", "", ["Kracht", "Strength"], [["Deze les gaat niet door.", "This class is cancelled."]], [["Andere momenten bekijken", "See other times"]]],
    /* ---- #483 memberships, #487 credits, #495 single class ---- */
    ["Boeken met abonnement", "#483", "info", "", ["Kracht", "Strength"], [["Met je abonnement · nog 1 les deze week", "With your membership · 1 class left this week"]], [["Boek deze les", "Book this class"]]],
    ["Geboekt met abonnement", "#483", "ok", "", ["Je hebt deze les geboekt.", "You've booked this class."], [["Geboekt met je abonnement. Nog 1 deze week.", "Booked with your membership. 1 left this week."]], [["Naar mijn boekingen", "Go to my bookings"]]],
    ["Abonnement op deze week", "#483", "warn", "", ["Kracht", "Strength"], [["Je hebt deze week al 2 lessen geboekt met je abonnement.", "You've already booked 2 classes this week with your membership."]], [["Andere momenten bekijken", "See other times"]]],
    ["Weeklimiet bereikt", "#483", "warn", "", ["Kracht", "Strength"], [["Je kunt maximaal 4 keer per week boeken.", "You can book at most 4 times a week."]], [["Andere momenten bekijken", "See other times"]]],
    ["Les niet in abonnement", "#483", "warn", "", ["Workshop Kettlebell", "Workshop Kettlebell"], [["Deze les valt niet onder je abonnement.", "This class isn't covered by your membership."]], [["Aanbod bekijken", "View offers"]]],
    ["Abonnement wacht op betaling", "#483", "warn", "", ["Kracht", "Strength"], [["Je abonnement start zodra je eerste betaling binnen is.", "Your membership starts once your first payment is in."]], [["Betalen", "Pay"]]],
    ["Geen abonnement of tegoed", "#483", "info", "", ["Kracht", "Strength"], [["Kies eerst een abonnement of tegoed om te boeken.", "Choose a membership or credits first to book."]], [["Aanbod bekijken", "View offers"]]],
    ["Wachtlijst: niet boekbaar", "#483", "warn", "", ["Kracht", "Strength"], [["Je kunt deze les niet boeken, dus ook niet op de wachtlijst.", "You can't book this class, so you can't join its waitlist either."]], []],
    ["Abonnement op: met credit", "#487", "info", "", ["Kracht", "Strength"], [["Je abonnement is deze week op. Deze les kost 1 groepscredit · nog 5.", "Your membership is used up this week. This class costs 1 group credit · 5 left."]], [["Boek deze les", "Book this class"]]],
    ["Geboekt met credit", "#487", "ok", "", ["Je hebt deze les geboekt.", "You've booked this class."], [["Geboekt met een groepscredit. Nog 4 over.", "Booked with a group credit. 4 left."]], [["Naar mijn boekingen", "Go to my bookings"]]],
    ["Geen credits meer", "#487", "warn", "", ["Kracht", "Strength"], [["Je hebt geen groepscredits meer.", "You have no group credits left."]], [["Aanbod bekijken", "View offers"]]],
    ["Credits niet voor deze les", "#487", "warn", "", ["Workshop Kettlebell", "Workshop Kettlebell"], [["Je groepscredits gelden niet voor deze les.", "Your group credits don't apply to this class."]], [["Aanbod bekijken", "View offers"]]],
    ["Tegoed verlopen op lesdatum", "#487", "warn", "", ["Kracht", "Strength"], [["Dit tegoed is op 10 jan niet meer geldig.", "These credits are no longer valid on 10 Jan."]], [["Aanbod bekijken", "View offers"]]],
    ["Losse sessie kopen", "#495", "info", "", ["Kracht", "Strength"], [["We houden je plek 10 minuten vast terwijl je betaalt.", "We hold your spot for 10 minutes while you pay."]], [["Losse sessie kopen · € 15,00", "Buy a single class · €15.00"]]],
    ["Losse sessie: geboekt", "#495", "ok", "fivvi.app/pay", ["Betaald", "Paid"], [["Je bent geboekt voor Kracht op di 10 nov.", "You're booked for Strength on Tue 10 Nov."]], [["Naar mijn boekingen", "Go to my bookings"]]],
    ["Losse sessie: plek vrijgegeven", "#495", "bad", "fivvi.app/pay", ["Niet gelukt", "Didn't work"], [["Je plek is vrijgegeven. Er is niets afgeschreven.", "Your spot has been released. Nothing was charged."]], [["Andere momenten bekijken", "See other times"]]],
    ["Losse sessie: geen wachtlijst", "#495", "warn", "", ["Kracht", "Strength"], [["Je kunt alleen met een abonnement of tegoed op de wachtlijst.", "You can only join the waitlist with a membership or credits."]], [["Aanbod bekijken", "View offers"]]],
    ["Openstaand: nog boeken", "#493", "warn", "", ["Kracht", "Strength"], [["Let op: er staat nog € 69,00 open.", "Note: €69.00 is still open."]], [["Boek deze les", "Book this class"], ["Nu betalen", "Pay now"]]],
    ["Openstaand: niet meer boeken", "#493", "bad", "", ["Kracht", "Strength"], [["Je hebt een openstaand bedrag van € 69,00. Betaal het om weer te kunnen boeken.", "You have an open amount of €69.00. Pay it to book again."]], [["Nu betalen", "Pay now"]]],
    /* ---- #494 waitlist ---- */
    ["Op de wachtlijst", "#494", "info", "", ["Op de wachtlijst · nr. 2", "On the waitlist · no. 2"], [["Komt er vóór 17:30 een plek vrij, dan boeken we je automatisch en krijg je een bevestiging.", "If a spot frees up before 17:30, we book you automatically and send you a confirmation."]], [["Van de wachtlijst af", "Leave the waitlist"]]],
    ["Van de wachtlijst af", "#494", "warn", "", ["Van de wachtlijst af?", "Leave the waitlist?"], [["Nummer 2 op de wachtlijst.", "Number 2 on the waitlist."]], [["Van de wachtlijst af", "Leave the waitlist"], ["Terug", "Back"]]],
    ["Niet meer op de wachtlijst", "#494", "ok", "", ["Kracht", "Strength"], [["Je staat niet meer op de wachtlijst.", "You're no longer on the waitlist."]], [["Andere lessen bekijken", "See other classes"]]],
    ["Wachtlijst gesloten", "#494", "info", "", ["Kracht", "Strength"], [["De wachtlijst is gesloten. Je hebt geen plek gekregen.", "The waitlist has closed. You didn't get a spot."]], [["Andere lessen bekijken", "See other classes"]]],
    /* ---- #490 cancelling ---- */
    ["Boeking annuleren", "#491", "warn", "", ["Boeking annuleren", "Cancel booking"], [["Weet je zeker dat je Kracht op dinsdag 10 nov om 18:00 wilt annuleren?", "Are you sure you want to cancel Strength on Tuesday 10 Nov at 18:00?"]], [["Boeking annuleren", "Cancel booking"], ["Boeking behouden", "Keep booking"]]],
    ["Annuleren: op tijd, credit terug", "#490", "info", "", ["Boeking annuleren", "Cancel booking"], [["Je krijgt je groepscredit terug. Je kunt deze maand nog 2 keer op tijd annuleren met teruggave.", "You get your group credit back. You can cancel in time with a refund 2 more times this month."]], [["Boeking annuleren", "Cancel booking"], ["Boeking behouden", "Keep booking"]]],
    ["Annuleren: inhaalles", "#490", "info", "", ["Boeking annuleren", "Cancel booking"], [["Je krijgt een inhaalles, geldig tot 28 feb. Nog 1 deze maand.", "You get a makeup class, valid until 28 Feb. 1 left this month."]], [["Boeking annuleren", "Cancel booking"], ["Boeking behouden", "Keep booking"]]],
    ["Annuleren: te laat", "#490", "warn", "", ["Boeking annuleren", "Cancel booking"], [["Je annuleert minder dan 12 uur voor de start. Deze les telt als gebruikt.", "You're cancelling less than 12 hours before the start. This class counts as used."]], [["Toch annuleren", "Cancel anyway"], ["Boeking behouden", "Keep booking"]]],
    ["Annuleren: limiet bereikt", "#490", "warn", "", ["Boeking annuleren", "Cancel booking"], [["Je hebt deze maand al 3 keer op tijd geannuleerd. Deze les telt als gebruikt.", "You've already cancelled in time 3 times this month. This class counts as used."]], [["Toch annuleren", "Cancel anyway"], ["Boeking behouden", "Keep booking"]]],
    ["Annuleren: plek via wachtlijst", "#490", "info", "", ["Boeking annuleren", "Cancel booking"], [["Je kreeg deze plek via de wachtlijst, dus je kunt nog kosteloos annuleren.", "You got this spot from the waitlist, so you can still cancel for free."]], [["Boeking annuleren", "Cancel booking"], ["Boeking behouden", "Keep booking"]]],
    ["Geannuleerd", "#491", "ok", "", ["Je boeking is geannuleerd.", "Your booking has been cancelled."], [["Je hebt Kracht op di 10 nov om 18:00 geannuleerd.", "You cancelled Strength on Tue 10 Nov at 18:00."]], [["Een andere les boeken", "Book another class"]]],
    ["Geboekt met inhaalles", "#490", "ok", "", ["Je hebt deze les geboekt.", "You've booked this class."], [["Geboekt met een inhaalles.", "Booked with a makeup class."]], [["Naar mijn boekingen", "Go to my bookings"]]],
    /* ---- #497 my bookings ---- */
    ["Annuleren aanvragen", "#497", "info", "", ["Annuleren aanvragen?", "Ask to cancel?"], [["Privésessie met Sarah · di 10 nov · 10:30", "Private session with Sarah · Tue 10 Nov · 10:30"], ["Je trainer krijgt je verzoek. De sessie blijft staan tot je trainer reageert.", "Your trainer gets your request. The session stays planned until your trainer replies."]], [["Annuleren aanvragen", "Ask to cancel"], ["Laten staan", "Leave it"]], null, [["Bericht aan Sarah (optioneel)", "Message to Sarah (optional)"]]],
    ["Annulering aangevraagd", "#497", "warn", "", ["Annulering aangevraagd", "Cancellation requested"], [["Annulering aangevraagd op 5 nov. De sessie blijft staan tot je trainer reageert.", "Cancellation requested on 5 Nov. The session stays planned until your trainer replies."]], [["Verzoek intrekken", "Withdraw request"]]],
    ["Sessie gaat door", "#497", "info", "", ["Je sessie op di 10 nov gaat door", "Your session on Tue 10 Nov is going ahead"], [["Sarah laat de sessie staan: “We kunnen hem korter maken.”", "Sarah is keeping the session: “We kunnen hem korter maken.”"]], [["Bekijk je boeking", "View your booking"]]],
    ["Sessie al begonnen", "#497", "info", "", ["Privésessie met Sarah", "Private session with Sarah"], [["Deze sessie is al begonnen.", "This session has already started."]], []],
    ["Eerdere boekingen: geen", "#497", "info", "", ["Mijn boekingen", "My bookings"], [["Nog geen eerdere boekingen.", "No earlier bookings yet."]], [["Boek een les", "Book a class"]]],
    ["E-mailadres wijzigen", "#497", "info", "", ["Nieuw e-mailadres", "New email address"], [["We sturen een code naar je nieuwe adres.", "We'll send a code to your new address."]], [["Stuur code", "Send code"]], null, [["E-mailadres", "Email address"]]],
    ["E-mailadres: code", "#497", "info", "", ["Nieuw e-mailadres", "New email address"], [["We hebben een code gestuurd naar a•••@example.com.", "We've sent a code to a•••@example.com."]], [["Bevestigen", "Confirm"]], null, [["Code", "Code"]]],
    ["E-mailadres gewijzigd", "#497", "ok", "", ["E-mailadres", "Email address"], [["Je e-mailadres is gewijzigd.", "Your email address has been changed."]], []],
    /* ---- #481 agreements, web only ---- */
    ["Bevestigen en betalen (CP-02)", "#481", "info", "fivvi.app/my/studio-fit/agreements", ["Bevestigen en betalen", "Confirm and pay"], [["Groep 2× per week · € 69 per maand", "Group 2× a week · €69 a month"], ["Vandaag betaal je € 69,00", "Today you pay €69.00"], ["Daarna € 69,00 per maand via automatische incasso, op de 5e", "Then €69.00 a month by direct debit, on the 5th"], ["Looptijd: 6 maanden. Na 5 mei stopt je abonnement. We herinneren je 30 en 7 dagen van tevoren.", "Term: 6 months. Your membership stops after 5 May. We'll remind you 30 and 7 days before."], ["Met je eerste betaling geef je Studio Fit ook een machtiging voor de incasso's.", "Your first payment also gives Studio Fit a mandate for the direct debits."]], [["Betalen met iDEAL", "Pay with iDEAL"], ["Voorwaarden bekijken", "View terms"]], [["Ik ga akkoord met de voorwaarden en geef Studio Fit toestemming om de volgende bedragen automatisch af te schrijven.", "I agree to the terms and authorise Studio Fit to collect the next amounts by direct debit."]]],
    ["Bevestigen: loopt per maand door", "#481", "info", "fivvi.app/my/studio-fit/agreements", ["Bevestigen en betalen", "Confirm and pay"], [["Vandaag betaal je € 69,00", "Today you pay €69.00"], ["Na de looptijd loopt je abonnement per maand door. Je kunt dan op elk moment online opzeggen, met maximaal een maand opzegtermijn.", "After the term your membership continues monthly. You can then give notice online at any time, with at most one month's notice."]], [["Betalen met iDEAL", "Pay with iDEAL"]], [["Ik ga akkoord met de voorwaarden en geef Studio Fit toestemming om de volgende bedragen automatisch af te schrijven.", "I agree to the terms and authorise Studio Fit to collect the next amounts by direct debit."]]],
    ["Bevestigen: creditpakket", "#487", "info", "fivvi.app/my/studio-fit/agreements", ["Bevestigen en betalen", "Confirm and pay"], [["10 groepscredits · € 150,00", "10 group credits · €150.00"], ["Vandaag betaal je € 150,00", "Today you pay €150.00"]], [["Betalen met iDEAL", "Pay with iDEAL"]], [["Ik ga akkoord met de voorwaarden.", "I agree to the terms."]]],
    ["Mijn abonnementen (CP-04)", "#481", "info", "fivvi.app/my/studio-fit/agreements", ["Mijn abonnementen en tegoed", "My memberships and credits"], [["Groep 2× per week · Actief", "Group 2× a week · Active"], ["Deze week: 1 van 2 lessen geboekt", "This week: 1 of 2 classes booked"], ["Volgende incasso: 1 dec · € 69,00", "Next direct debit: 1 Dec · €69.00"], ["10 groepscredits · 3 over · geldig tot 1 jan 2027", "10 group credits · 3 left · valid until 1 Jan 2027"], ["3 credits vervallen op 1 jan", "3 credits expire on 1 Jan"], ["Inhaallessen: 1 · geldig tot 28 feb", "Makeup classes: 1 · valid until 28 Feb"]], [["Voorwaarden bekijken", "View terms"], ["Opzeggen", "Give notice"]]],
    ["Lessen blijven geldig", "#483", "info", "fivvi.app/my/studio-fit/agreements", ["Mijn abonnementen en tegoed", "My memberships and credits"], [["Nog 9 lessen te boeken tot 28 feb", "9 classes left to book until 28 Feb"]], []],
    ["Opzeggen (CP-06)", "#481", "warn", "fivvi.app/my/studio-fit/opzeggen", ["Opzeggen", "Give notice"], [["Je abonnement stopt op 5 dec.", "Your membership ends on 5 Dec."]], [["Opzeggen", "Give notice"], ["Terug", "Back"]]],
    ["Opzeggen: vaste looptijd", "#481", "info", "fivvi.app/my/studio-fit/opzeggen", ["Opzeggen", "Give notice"], [["Je kunt opzeggen vanaf 1 mrt; het stopt dan op 31 mrt.", "You can give notice from 1 Mar; it then ends on 31 Mar."]], [["Terug", "Back"]]],
    ["Opgezegd", "#481", "ok", "fivvi.app/my/studio-fit/agreements", ["Opzegging bevestigd", "Notice confirmed"], [["Opgezegd. Je abonnement stopt op 5 dec.", "Notice given. Your membership ends on 5 Dec."]], []],
    ["Betalingen en facturen (CP-05)", "#474", "info", "fivvi.app/my/studio-fit/facturen", ["Betalingen en facturen", "Payments and invoices"], [["5 nov · Groep 2× per week · € 69,00 · Betaald · F-2026-0431", "5 Nov · Group 2× a week · €69.00 · Paid · F-2026-0431"], ["6 nov · Creditfactuur · − € 69,00 · F-2026-0432", "6 Nov · Credit note · −€69.00 · F-2026-0432"]], []],
    ["Factuurgegevens klant", "#474", "info", "fivvi.app/my/studio-fit/profiel", ["Factuurgegevens", "Billing details"], [["Je volgende facturen komen op deze naam. Eerdere facturen veranderen niet.", "Your next invoices will be in this name. Earlier invoices don't change."]], [["Opslaan", "Save"]], [["Factuur op naam van een bedrijf", "Invoice in a company's name"]], [["Bedrijfsnaam", "Company name"], ["Adres", "Address"], ["Btw-nummer (optioneel)", "VAT number (optional)"]]],
    ["Openstaand bedrag betalen (CP-07)", "#493", "warn", "fivvi.app/my/studio-fit/openstaand", ["Openstaand: € 69,00", "Open: €69.00"], [["Openstaand: € 69,00 voor Groep 2× per week", "Open: €69.00 for Group 2× a week"], ["Je kunt nog boeken tot 15 nov.", "You can still book until 15 Nov."]], [["Betalen met iDEAL", "Pay with iDEAL"]]],
    /* ---- #477 deleting an account, offline ---- */
    ["Account verwijderen: code", "#477", "warn", "fivvi.app/account-verwijderen", ["Account verwijderen", "Delete account"], [["Je inloggegevens, naam, e-mailadres en taal worden meteen verwijderd en je wordt overal uitgelogd.", "Your sign-in, name, email address and language are deleted at once and you're signed out everywhere."], ["Elke studio waar je klant bent krijgt je verzoek om je gegevens te verwijderen, en bewaart wat de wet vraagt, zoals facturen.", "Each studio where you're a client gets your request to delete your data, and keeps what the law requires, such as invoices."]], [["Stuur code", "Send code"], ["Account definitief verwijderen", "Delete account permanently"]]],
    ["Account verwijderen: enige eigenaar", "#477", "bad", "fivvi.app/account-verwijderen", ["Account verwijderen", "Delete account"], [["Je bent de enige eigenaar van Studio Fit. Neem contact met ons op om je account te verwijderen.", "You are the only owner of Studio Fit. Contact us to delete your account."]], []],
    ["Account blijft bestaan", "#477", "info", "", ["Je Fivvi-account wordt over 30 dagen verwijderd", "Your Fivvi account will be deleted in 30 days"], [["Je hebt lang niet ingelogd. Log één keer in om je account te bewaren.", "You haven't signed in for a long time. Sign in once to keep your account."]], [["Ingelogd blijven", "Keep my account"]]],
    ["Boekingslink bestaat niet (PB-09)", "#473", "bad", "fivvi.app/l/…", ["Deze boekingslink bestaat niet.", "This booking link doesn't exist."], [["Controleer de link of vraag de gym om een nieuwe.", "Check the link or ask the gym for a new one."]], []],
    ["Boekingslink niet meer actief (PB-09)", "#473", "warn", "fivvi.app/l/d19x", ["Deze boekingslink is niet meer actief.", "This booking link is no longer active."], [], [["Bekijk het rooster van Studio Fit", "See Studio Fit's timetable"]]],
    ["Trainer-uitnodiging: accepteren", "#422", "info", "fivvi.app/invitations/…", ["Uitnodiging", "Invitation"], [["Sarah nodigt je uit om trainer te worden bij Studio Fit.", "Sarah invited you to become a trainer at Studio Fit."]], [["Accepteren", "Accept"], ["Afwijzen", "Decline"]]],
    ["Trainer-uitnodiging: ander account", "#422", "warn", "fivvi.app/invitations/…", ["Uitnodiging", "Invitation"], [["Deze uitnodiging is voor k•••@example.com. Log uit en log in met dat adres.", "This invitation is for k•••@example.com. Sign out and sign in with that address."]], [["Uitloggen en verder", "Sign out and continue"]]],
    ["Trainer-uitnodiging: niet meer geldig", "#422", "bad", "fivvi.app/invitations/…", ["Uitnodiging", "Invitation"], [["Deze uitnodiging is niet meer geldig. Vraag om een nieuwe uitnodiging.", "This invitation is no longer valid. Ask for a new invitation."]], []],
    ["Trainer-uitnodiging zonder naam", "#431", "info", "fivvi.app/invitations/…", ["Uitnodiging", "Invitation"], [["Je bent uitgenodigd om trainer te worden bij Studio Fit.", "You've been invited to become a trainer at Studio Fit."]], [["Accepteren", "Accept"], ["Afwijzen", "Decline"]]],
    ["Fivvi Pro: klant logt in", "#480", "info", "", ["Inloggen", "Sign in"], [["Ben je klant? Gebruik de app Fivvi.", "Are you a client? Use the Fivvi app."]], []],
    ["Mijn boekingen: geen", "#497", "info", "", ["Mijn boekingen", "My bookings"], [["Je hebt geen aankomende boekingen.", "You have no upcoming bookings."]], [["Boek een les", "Book a class"]]],
    ["Boeken met inhaalles", "#490", "info", "", ["Kracht", "Strength"], [["Boeken met een inhaalles · nog 1", "Book with a makeup class · 1 left"], ["Deze maand nog 2 keer op tijd annuleren met teruggave", "2 more in-time cancellations with a refund this month"]], [["Boek deze les", "Book this class"]]],
    ["Creditabonnement: deze periode", "#487", "info", "fivvi.app/my/studio-fit/agreements", ["Mijn abonnementen en tegoed", "My memberships and credits"], [["Deze periode: 2 van 4 over · tot 30 nov", "This period: 2 of 4 left · until 30 Nov"], ["Meegenomen: 1", "Carried over: 1"], ["Volgende credits: na de betaling van 1 dec", "Next credits: after the payment of 1 Dec"], ["3 privécredits · geldig tot 30 april 2027", "3 private credits · valid until 30 April 2027"], ["1 inhaalles · geldig tot 31 juli 2027", "1 makeup class · valid until 31 July 2027"], ["Nog 6 groepscredits en 3 privécredits tegoed", "6 group credits and 3 private credits left"]], []],
    ["Geen tegoed", "#485", "info", "fivvi.app/my/studio-fit/agreements", ["Mijn abonnementen en tegoed", "My memberships and credits"], [["Geen tegoed", "No credits"]], [["Aanbod bekijken", "View offers"]]],
    ["Les gaat niet door in rooster", "#489", "warn", "", ["Kracht", "Strength"], [["Gaat niet door", "Cancelled"]], [["Naar je overzicht", "To your overview"]]],
    ["Offline", "#469", "warn", "", ["Je bent offline", "You're offline"], [["Je bent offline. Sommige gegevens zijn misschien niet actueel.", "You're offline. Some information may not be up to date."]], []]
  ];
  /* ---------- what follows each state: real next steps, and the prototype's list of other situations ---------- */
  var FAM = {
    signin: ["Inloggen: nieuw bij Fivvi", "Inloggen met Apple lukte niet", "Uitnodiging voor een ander adres (Apple)", "Je naam invullen", "Geen studio: wat nu", "Fivvi Pro: klant logt in"],
    join: ["Meedoen: verzoek sturen", "Meedoen: wachten, verzoek intrekken", "Meedoen: al klant", "Meedoen: eerder afgewezen", "Meedoen: link werkt niet meer", "QR-code: geen aanmeldlink", "QR-code: geen cameratoegang"],
    invite: ["Uitnodiging: inloggen", "Uitnodiging: code", "Uitnodiging: ander account", "Uitnodiging: werkt niet meer", "Uitnodiging: welkom"],
    trainerinv: ["Trainer-uitnodiging: accepteren", "Trainer-uitnodiging: ander account", "Trainer-uitnodiging: niet meer geldig", "Trainer-uitnodiging zonder naam"],
    sched: ["Rooster: niets gepland", "Rooster: laden lukt niet", "Rooster: geen klant", "Rooster: voorbeeld voor de studio", "Les gaat niet door in rooster", "Offline"],
    book: ["Boeken met abonnement", "Abonnement op deze week", "Weeklimiet bereikt", "Les niet in abonnement", "Abonnement wacht op betaling", "Geen abonnement of tegoed", "Abonnement op: met credit", "Geen credits meer", "Credits niet voor deze les", "Tegoed verlopen op lesdatum", "Boeken met inhaalles", "Losse sessie kopen", "Losse sessie: geen wachtlijst", "Openstaand: nog boeken", "Openstaand: niet meer boeken", "Net te laat", "Al geboekt", "Les al begonnen", "Les gaat niet door", "Wachtlijst gesloten", "Wachtlijst: niet boekbaar"],
    done: ["Geboekt", "Geboekt met abonnement", "Geboekt met credit", "Geboekt met inhaalles", "Losse sessie: geboekt", "Losse sessie: plek vrijgegeven"],
    wl: ["Op de wachtlijst", "Van de wachtlijst af", "Niet meer op de wachtlijst"],
    cancel: ["Boeking annuleren", "Annuleren: op tijd, credit terug", "Annuleren: inhaalles", "Annuleren: te laat", "Annuleren: limiet bereikt", "Annuleren: plek via wachtlijst", "Geannuleerd"],
    priv: ["Annuleren aanvragen", "Annulering aangevraagd", "Sessie gaat door", "Sessie al begonnen"],
    mine: ["Mijn boekingen: geen", "Eerdere boekingen: geen"],
    buy: ["Bevestigen en betalen (CP-02)", "Bevestigen: loopt per maand door", "Bevestigen: creditpakket"],
    agr: ["Mijn abonnementen (CP-04)", "Lessen blijven geldig", "Creditabonnement: deze periode", "Geen tegoed", "Betalingen en facturen (CP-05)", "Openstaand bedrag betalen (CP-07)"],
    stop: ["Opzeggen (CP-06)", "Opzeggen: vaste looptijd", "Opgezegd"],
    me: ["E-mailadres wijzigen", "E-mailadres: code", "E-mailadres gewijzigd", "Factuurgegevens klant"],
    del: ["Account verwijderen: code", "Account verwijderen: enige eigenaar", "Account blijft bestaan"],
    link: ["Boekingslink bestaat niet (PB-09)", "Boekingslink niet meer actief (PB-09)"]
  };
  /* what you can open from the signed-out screens: a link or an invitation brings you there */
  var START = ["Inloggen: nieuw bij Fivvi", "Meedoen: verzoek sturen", "Uitnodiging: inloggen", "Trainer-uitnodiging: accepteren", "Boekingslink bestaat niet (PB-09)"];
  var FAMOF = {}; Object.keys(FAM).forEach(function (k) { FAM[k].forEach(function (n) { FAMOF[n] = k; }); });
  [["Inloggen: nieuw bij Fivvi", "Sign in: new to Fivvi"], ["Inloggen met Apple lukte niet", "Signing in with Apple failed"], ["Uitnodiging voor een ander adres (Apple)", "Invitation for another address (Apple)"], ["Je naam invullen", "Fill in your name"], ["Geen studio: wat nu", "No studio: what now"], ["Fivvi Pro: klant logt in", "Fivvi Pro: a client signs in"],
    ["Meedoen: verzoek sturen", "Join: send a request"], ["Meedoen: wachten, verzoek intrekken", "Join: waiting, withdraw request"], ["Meedoen: al klant", "Join: already a client"], ["Meedoen: eerder afgewezen", "Join: declined before"], ["Meedoen: link werkt niet meer", "Join: link no longer works"], ["QR-code: geen aanmeldlink", "QR code: not a join link"], ["QR-code: geen cameratoegang", "QR code: no camera access"],
    ["Uitnodiging: inloggen", "Invitation: sign in"], ["Uitnodiging: code", "Invitation: code"], ["E-mailadres: code", "Email address: code"], ["Uitnodiging: ander account", "Invitation: another account"], ["Uitnodiging: werkt niet meer", "Invitation: no longer works"], ["Uitnodiging: welkom", "Invitation: welcome"],
    ["Trainer-uitnodiging: accepteren", "Trainer invitation: accept"], ["Trainer-uitnodiging: ander account", "Trainer invitation: another account"], ["Trainer-uitnodiging: niet meer geldig", "Trainer invitation: no longer valid"], ["Trainer-uitnodiging zonder naam", "Trainer invitation without a name"],
    ["Rooster: niets gepland", "Timetable: nothing planned"], ["Rooster: laden lukt niet", "Timetable: can't load"], ["Rooster: geen klant", "Timetable: not a client"], ["Rooster: voorbeeld voor de studio", "Timetable: preview for the studio"], ["Les gaat niet door in rooster", "Cancelled class in the timetable"],
    ["Boeken met abonnement", "Book with a membership"], ["Abonnement op deze week", "Membership used up this week"], ["Weeklimiet bereikt", "Weekly limit reached"], ["Les niet in abonnement", "Class not in the membership"], ["Abonnement wacht op betaling", "Membership waiting for payment"], ["Geen abonnement of tegoed", "No membership or credits"], ["Abonnement op: met credit", "Membership used up: with a credit"], ["Geen credits meer", "No credits left"], ["Credits niet voor deze les", "Credits not for this class"], ["Tegoed verlopen op lesdatum", "Credits expired on the class date"], ["Boeken met inhaalles", "Book with a makeup class"], ["Losse sessie kopen", "Buy a single class"], ["Losse sessie: geen wachtlijst", "Single class: no waitlist"], ["Openstaand: nog boeken", "Open amount: can still book"], ["Openstaand: niet meer boeken", "Open amount: can't book"], ["Net te laat", "Just too late"], ["Al geboekt", "Already booked"], ["Les al begonnen", "Class already started"], ["Les gaat niet door", "Class cancelled"], ["Wachtlijst gesloten", "Waitlist closed"], ["Wachtlijst: niet boekbaar", "Waitlist: can't book"],
    ["Geboekt met abonnement", "Booked with a membership"], ["Geboekt met credit", "Booked with a credit"], ["Geboekt met inhaalles", "Booked with a makeup class"], ["Losse sessie: geboekt", "Single class: booked"], ["Losse sessie: plek vrijgegeven", "Single class: spot released"],
    ["Van de wachtlijst af", "Leave the waitlist"], ["Niet meer op de wachtlijst", "No longer on the waitlist"], ["Boeking annuleren", "Cancel booking"], ["Annuleren: op tijd, credit terug", "Cancel: in time, credit back"], ["Annuleren: inhaalles", "Cancel: makeup class"], ["Annuleren: te laat", "Cancel: too late"], ["Annuleren: limiet bereikt", "Cancel: limit reached"], ["Annuleren: plek via wachtlijst", "Cancel: spot goes to the waitlist"],
    ["Annuleren aanvragen", "Request cancellation"], ["Annulering aangevraagd", "Cancellation requested"], ["Sessie gaat door", "Session goes ahead"], ["Sessie al begonnen", "Session already started"], ["Mijn boekingen: geen", "My bookings: none"], ["Eerdere boekingen: geen", "Past bookings: none"],
    ["Bevestigen en betalen (CP-02)", "Confirm and pay (CP-02)"], ["Bevestigen: loopt per maand door", "Confirm: continues monthly"], ["Bevestigen: creditpakket", "Confirm: credit pack"], ["Mijn abonnementen (CP-04)", "My memberships (CP-04)"], ["Lessen blijven geldig", "Classes stay valid"], ["Creditabonnement: deze periode", "Credit plan: this period"], ["Geen tegoed", "No credits"], ["Betalingen en facturen (CP-05)", "Payments and invoices (CP-05)"], ["Openstaand bedrag betalen (CP-07)", "Pay the open amount (CP-07)"],
    ["Opzeggen (CP-06)", "Give notice (CP-06)"], ["Opzeggen: vaste looptijd", "Give notice: fixed term"], ["Opgezegd", "Notice given"], ["E-mailadres gewijzigd", "Email address changed"], ["Factuurgegevens klant", "Client's invoice details"], ["Account verwijderen: code", "Delete account: code"], ["Account verwijderen: enige eigenaar", "Delete account: only owner"], ["Account blijft bestaan", "Account stays"], ["Boekingslink bestaat niet (PB-09)", "Booking link doesn't exist (PB-09)"], ["Boekingslink niet meer actief (PB-09)", "Booking link no longer active (PB-09)"],
    ["Andere situaties", "Other situations"], ["Verzetten? Neem contact op met je trainer.", "Need to move it? Contact your trainer."], ["In je agenda gezet", "Added to your calendar"], ["Voorwaarden geopend", "Terms opened"], ["Opent de instellingen van je telefoon", "Opens your phone's settings"], ["Opgeslagen", "Saved"], ["Code verstuurd", "Code sent"], ["Uitnodiging geaccepteerd", "Invitation accepted"], ["Uitnodiging afgewezen", "Invitation declined"], ["Verzoek ingetrokken", "Request withdrawn"], ["5 groepscredits", "5 group credits"], ["Looptijd", "Term"], ["per maand", "a month"], ["per 4 weken", "every 4 weeks"], ["per les", "per class"], ["Met je eerste betaling geef je", "Your first payment also gives"], ["ook een machtiging voor de incasso's.", "a mandate for the direct debits."], ["of met je e-mailadres", "or with your email"]
  ].forEach(L);
  L(["Geen lessen meer op deze dag.", "No more classes on this day."]);
  I.rule(/^€ (\d+),(\d{2})$/, "€$1.$2");
  I.rule(/^Vandaag betaal je € (.+)$/, function (m, a) { return "Today you pay €" + a.replace(",", "."); });
  function appMode() { return F.PREF.plat !== "client"; }
  function fam(names, self) {
    var l = names.filter(function (n) { return n !== self && (appMode() || !/^QR-code/.test(n)); });
    if (!l.length) return "";
    return '<div class="pad" style="margin-top:14px"><details class="card c-proto"><summary><b>Prototype</b> · <span>Andere situaties</span> (' + l.length + ')</summary><div class="c-chips">' + l.map(function (n) { return '<button class="c-chip" data-a="c-st" data-v="' + esc(n) + '">' + esc(n) + "</button>"; }).join("") + "</div></details></div>";
  }
  window.FVW.cfam = function (k) { return fam(FAM[k]); };
  /* where a button leads: first the state's own next step, then what the label always means */
  var ANY = { "Betalen met iDEAL": "checkout", "Betalen": "checkout", "Nu betalen": "checkout", "Aanbod bekijken": "offers", "Stuur me een code": "code", "Uitloggen en verder": "signout", "Rooster bekijken": "book", "Andere momenten bekijken": "book", "Andere lessen bekijken": "book", "Nog een les boeken": "book", "Een andere les boeken": "book", "Boek een les": "book", "Bekijk het rooster van Studio Fit": "book", "Meer dagen tonen": "book", "Naar mijn boekingen": "bookings", "Bekijk je boeking": "bookings", "Naar je overzicht": "home", "Zet in je agenda": "toast:In je agenda gezet", "Zet me op de wachtlijst": "st:Op de wachtlijst", "Voorwaarden bekijken": "toast:Voorwaarden geopend", "Naar Instellingen": "toast:Opent de instellingen van je telefoon", "Boeking annuleren": "st:Geannuleerd", "Toch annuleren": "st:Geannuleerd", "Stuur code": "toast:Code verstuurd" };
  var GO = {
    "Inloggen: nieuw bij Fivvi": { "Doorgaan met Apple": "apple:st:Geen studio: wat nu", "Doorgaan met Google": "st:Geen studio: wat nu" },
    "Je naam invullen": { "Verder": "aftername" },
    "Geen studio: wat nu": { "QR-code scannen": "st:QR-code: geen aanmeldlink" },
    "Meedoen: verzoek sturen": { "Verzoek sturen": "st:Meedoen: wachten, verzoek intrekken" },
    "Meedoen: wachten, verzoek intrekken": { "Verzoek intrekken": "st:Meedoen: verzoek sturen" },
    "Uitnodiging: inloggen": { "Doorgaan met Apple": "st:Uitnodiging: welkom", "Doorgaan met Google": "st:Uitnodiging: welkom", "Stuur me een code": "st:Uitnodiging: code" },
    "Uitnodiging: code": { "Inloggen": "st:Uitnodiging: welkom" },
    "Boeken met abonnement": { "Boek deze les": "st:Geboekt met abonnement" },
    "Abonnement op: met credit": { "Boek deze les": "st:Geboekt met credit" },
    "Boeken met inhaalles": { "Boek deze les": "st:Geboekt met inhaalles" },
    "Losse sessie kopen": { "Losse sessie kopen · € 15,00": "checkout" },
    "Openstaand: nog boeken": { "Boek deze les": "st:Geboekt", "Nu betalen": "st:Openstaand bedrag betalen (CP-07)" },
    "Openstaand: niet meer boeken": { "Nu betalen": "st:Openstaand bedrag betalen (CP-07)" },
    "Op de wachtlijst": { "Van de wachtlijst af": "st:Van de wachtlijst af" },
    "Van de wachtlijst af": { "Van de wachtlijst af": "st:Niet meer op de wachtlijst" },
    "Annuleren aanvragen": { "Annuleren aanvragen": "st:Annulering aangevraagd" },
    "Annulering aangevraagd": { "Verzoek intrekken": "done:Verzoek ingetrokken" },
    "E-mailadres wijzigen": { "Stuur code": "st:E-mailadres: code" },
    "E-mailadres: code": { "Bevestigen": "st:E-mailadres gewijzigd" },
    "Mijn abonnementen (CP-04)": { "Opzeggen": "st:Opzeggen (CP-06)" },
    "Opzeggen (CP-06)": { "Opzeggen": "st:Opgezegd", "Terug": "st:Mijn abonnementen (CP-04)" },
    "Opzeggen: vaste looptijd": { "Terug": "st:Mijn abonnementen (CP-04)" },
    "Factuurgegevens klant": { "Opslaan": "done:Opgeslagen" },
    "Account verwijderen: code": { "Account definitief verwijderen": "delete" },
    "Trainer-uitnodiging: accepteren": { "Accepteren": "team", "Afwijzen": "done:Uitnodiging afgewezen" },
    "Trainer-uitnodiging zonder naam": { "Accepteren": "team", "Afwijzen": "done:Uitnodiging afgewezen" }
  };
  /* what you pay for when a state names no chosen offer */
  var PAY = { "Bevestigen en betalen (CP-02)": "Groep 2× per week", "Bevestigen: loopt per maand door": "Groep 2× per week", "Bevestigen: creditpakket": "10 groepscredits", "Openstaand bedrag betalen (CP-07)": "Groep 2× per week", "Abonnement wacht op betaling": "Groep 2× per week", "Losse sessie kopen": "Losse les" };
  var AFTERPAY = { "Losse sessie kopen": { paid: "st:Losse sessie: geboekt", failed: "st:Losse sessie: plek vrijgegeven" } };
  var payout = A["c-payout"]; A["c-payout"] = function (d) { var c = C(), a = c.payFor && c.payFor.after; if (a && a[d.v]) { c.web = a[d.v]; return R(); } payout(d); };
  function target(state, label) { return (GO[state] && GO[state][label]) || ANY[label] || "close"; }
  function chosen(c, state) { var o = c.payFor && c.payFor.offer; return o && (state === "Bevestigen: creditpakket" ? o.kind === "pack" : state === "Bevestigen en betalen (CP-02)" && o.kind !== "pack"); }
  A["c-flow"] = function (d) {
    var c = C(), t = d.v;
    if (t === "aftername") t = c.afterName || "st:Geen studio: wat nu";
    if (/^apple:/.test(t)) { c.afterName = t.slice(6); c.web = "st:Je naam invullen"; return R(); }
    if (t === "nolink") { c.web = null; c.astep = "nolink"; if (!c.email) c.email = "kim@example.com"; return R(); }
    if (t === "request") { c.web = null; c.step = "request"; if (!c.name) c.name = "Kim de Graaf"; return R(); }
    if (/^st:/.test(t)) { c.web = t; return R(); }
    if (/^toast:/.test(t)) return F.toast(t.slice(6));
    if (/^done:/.test(t)) { c.web = null; return F.toast(t.slice(5)); }
    if (t === "checkout") { if (PAY[d.f] && !chosen(c, d.f)) c.payFor = { name: PAY[d.f], after: AFTERPAY[d.f] }; c.web = "checkout"; return R(); }
    if (t === "offers") return A["c-offers"]();
    if (t === "delete") return A["a-delete"]();
    if (t === "team") { F.PREF.role = "trainer"; X.goWeb("myday")(); F.save(); F.S.anim = null; return F.toast("Uitnodiging geaccepteerd"); }
    c.web = null; c.detail = null; c.workout = null; c.page = null;
    if (t === "code") { if (!c.email) c.email = "kim@example.com"; c.step = "code"; c.astep = "code"; c.code = ""; }
    else if (t === "signout") { c.step = "link"; c.astep = "welcome"; c.code = ""; }
    else if (t === "book") { c.step = "app"; c.astep = "app"; c.tab = "rooster"; c.atab = "boeken"; }
    else if (t === "bookings") { c.step = "app"; c.astep = "app"; c.tab = "agenda"; c.atab = "home"; }
    else if (t === "home") { c.step = "app"; c.astep = "app"; c.tab = "rooster"; c.atab = "home"; }
    R();
  };
  /* a chosen offer gets its own lines on the confirm page, never the sample's */
  function euro(p) { return "€ " + (/,/.test(p) ? p : p + ",00"); }
  var MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"], MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dot(a) { return a.replace(",", "."); }
  I.rule(/^Daarna € ([\d,]+) per maand via automatische incasso, op de 5e$/, function (m, a) { return "Then €" + dot(a) + " a month by direct debit, on the 5th"; });
  I.rule(/^Daarna € ([\d,]+) per 4 weken via automatische incasso$/, function (m, a) { return "Then €" + dot(a) + " every 4 weeks by direct debit"; });
  I.rule(/^Looptijd: (\d+) maanden\. Na 5 (\w+) stopt je abonnement\. We herinneren je 30 en 7 dagen van tevoren\.$/, function (m, n, mon) { return "Term: " + n + " months. Your membership stops after 5 " + MONTHS_EN[MONTHS.indexOf(mon)] + ". We'll remind you 30 and 7 days before."; });
  I.rule(/^Minimale looptijd: (\d+) maanden\.$/, "Minimum term: $1 months.");
  I.rule(/^Geldig: (\d+) (maanden|week)$/, function (m, n, u) { return "Valid: " + n + (u === "week" ? " week" : " months"); });
  function buyPage(state) {
    var c = C(), pf = c.payFor, o = pf.offer, yl = pf.ws === "yl", ws = yl ? "Yoga Loft" : "Studio Fit", rec = o.kind === "abo" || o.kind === "plan", s = ST.filter(function (x) { return x[0] === state; })[0], price = euro(o.price), term = /^(\d+) maanden$/.exec(o.term || "");
    var b = '<div class="pad stack"><div class="card c-payres" style="--c:var(--accent)"><span>' + ic("info") + "</span><h3>" + esc(s[4][0]) + "</h3><p><b>" + X.offerLabel(o) + "</b> · <span>" + esc(price) + "</span> · <span>" + esc(o.cycle || "Eenmalig") + "</span></p><p>Vandaag betaal je " + esc(price) + "</p>";
    if (rec) b += "<p>Daarna " + esc(price) + (o.cycle === "Elke 4 weken" ? " per 4 weken via automatische incasso" : " per maand via automatische incasso, op de 5e") + "</p>";
    if (term && o.end === "stop") b += "<p>Looptijd: " + term[1] + " maanden. Na 5 " + MONTHS[(F.NOW.getMonth() + +term[1]) % 12] + " stopt je abonnement. We herinneren je 30 en 7 dagen van tevoren.</p>";
    else if (term) b += "<p><span>Looptijd</span>: <span>" + esc(o.term) + "</span></p>";
    if (o.minTerm) b += "<p>Minimale looptijd: " + esc(o.minTerm) + ".</p>";
    if (o.end === "continue") b += "<p>Na de looptijd loopt je abonnement per maand door. Je kunt dan op elk moment online opzeggen, met maximaal een maand opzegtermijn.</p>";
    if (o.valid) b += "<p>Geldig: " + esc(o.valid) + "</p>";
    if (rec) b += '<p><span>Met je eerste betaling geef je</span> <span translate="no">' + esc(ws) + "</span> <span>ook een machtiging voor de incasso's.</span></p>";
    b += "</div>";
    if (rec) b += '<label class="pro-check"><input type="checkbox"> <span>Ik ga akkoord met de voorwaarden en geef <span translate="no">' + esc(ws) + "</span> toestemming om de volgende bedragen automatisch af te schrijven.</span></label>";
    else b += '<label class="pro-check"><input type="checkbox"> <span>Ik ga akkoord met de voorwaarden.</span></label>';
    b += cbtn("Betalen met iDEAL", "c-checkout") + K.btn("Voorwaarden bekijken", { k: "ghost", blk: true, a: "c-flow", d: { v: "toast:Voorwaarden geopend" } });
    return X.payWeb(s[4][0], yl ? "fivvi.app/my/yoga-loft/agreements" : s[3], b + "</div>" + fam(FAM.buy, state));
  }
  L(["Ik ga akkoord met de voorwaarden en geef", "I agree to the terms and authorise"]); L(["toestemming om de volgende bedragen automatisch af te schrijven.", "to collect the next amounts by direct debit."]);
  var TONE = { ok: ["check", "var(--ok)"], warn: ["warn", "var(--gym)"], bad: ["warn", "var(--danger)"], info: ["info", "var(--accent)"] };
  ST.forEach(function (s) {
    L(s[4]); s[5].forEach(L); (s[6] || []).forEach(L); (s[7] || []).forEach(L); (s[8] || []).forEach(L);
    CWEB["st:" + s[0]] = function () {
      var t = TONE[s[2]], b = '<div class="pad stack"><div class="card c-payres" style="--c:' + t[1] + '"><span>' + ic(t[0]) + "</span><h3>" + esc(s[4][0]) + "</h3>" + s[5].map(function (l) { return "<p>" + esc(l[0]) + "</p>"; }).join("") + "</div>";
      if (s[8]) b += '<div class="fgrp">' + s[8].map(function (f) { return '<label class="fld"><span>' + esc(f[0]) + '</span><input type="text"></label>'; }).join("") + "</div>";
      if (s[7]) s[7].filter(function (x) { return x[0] !== "of met je e-mailadres"; }).forEach(function (x) { b += /^Ik /.test(x[0]) ? '<label class="pro-check"><input type="checkbox"> <span>' + esc(x[0]) + "</span></label>" : '<p class="c-st-note">' + esc(x[0]) + "</p>"; });
      (s[6] || []).filter(function (x) { return appMode() || x[0] !== "QR-code scannen"; }).forEach(function (x, i) { var f = { v: target(s[0], x[0]), f: s[0] }, sso = /^Doorgaan met/.test(x[0]), or = x[0] === "Stuur me een code" && i > 0; if (or) b += '<p class="c-or">of met je e-mailadres</p>'; b += sso ? cbtn(x[0], "c-flow", { k: "sec", d: f }) : i === 0 || or ? cbtn(x[0], "c-flow", { d: f }) : K.btn(x[0], { k: "ghost", blk: true, a: "c-flow", d: f }); });
      return X.payWeb(s[4][0], s[3] || "Fivvi", b + "</div>" + fam(FAM[FAMOF[s[0]]], s[0]));
    };
  });
  ["Bevestigen en betalen (CP-02)", "Bevestigen: creditpakket"].forEach(function (n) { var o = CWEB["st:" + n]; CWEB["st:" + n] = function () { return chosen(C(), n) ? buyPage(n) : o(); }; });
  /* the screens these states start from */
  /* Apple may hide the name, Google gives it, so only Apple asks for it (#498) */
  function withSso(html, next) { var at = '<div class="pad stack"><div class="fgrp">', i = html.indexOf(at); if (i < 0) return html; return html.slice(0, i) + '<div class="pad stack">' + cbtn("Doorgaan met Apple", "c-flow", { k: "sec", d: { v: "apple:" + next } }) + cbtn("Doorgaan met Google", "c-flow", { k: "sec", d: { v: next } }) + '</div><p class="c-or">of met je e-mailadres</p>' + html.slice(i); }
  var CS = X.CSTEP, AS = X.ASTEP;
  /* the join page carries on with the request to join, as signing in by email does */
  (function () { var o = CS.link; CS.link = function () { return withSso(o(), "request") + (X.payOpen() ? fam(START) : ""); }; })();
  (function () { var o = AS.welcome; AS.welcome = function () { return withSso(o(), "nolink") + fam(START); }; var n = AS.nolink; AS.nolink = function () { return n() + fam(FAM.join); }; })();
  (function () { var o = CS.app; CS.app = function () { var r = o(), c = C(); if (!c.detail && c.workout == null) r.body += fam(c.tab === "agenda" ? FAM.mine : c.tab === "rooster" ? FAM.sched : []); return r; }; var h = X.ATAB.home; X.ATAB.home = function () { var r = h(); r.body += fam(FAM.mine); return r; }; })();
  /* the real buttons lead to these states too */
  [["c-bookok", "Geboekt"], ["c-wlok", "Op de wachtlijst"], ["c-cancel-ok", "Geannuleerd"], ["c-wl-leave", "Niet meer op de wachtlijst"]].forEach(function (x) { var o = A[x[0]]; if (!o) return; A[x[0]] = function (d) { o(d); C().web = "st:" + x[1]; F.S.toast = null; R(); }; });
  var ap = F.INDEX.filter(function (g) { return g[0] === "Fivvi (klant-app)"; })[0][1];
  ST.forEach(function (s) { ap.push([s[0], s[1], X.goApp("app", { who: "anna", atab: "home", web: "st:" + s[0] })]); });
  /* the same states on the client web; scanning a QR code only exists in the app */
  var wb = F.INDEX.filter(function (g) { return g[0] === "Klantweb"; })[0][1];
  ST.filter(function (s) { return !/^QR-code/.test(s[0]); }).forEach(function (s) { wb.push([s[0], s[1], X.goClient("app", { who: "anna", web: "st:" + s[0] })]); });
})();
