/* English for the prototype. The screens are written in Dutch (Dutch-first); after each render this layer swaps the
   text nodes, placeholders and accessible names to English. The real apps use packages/i18n instead. Free text that a
   person typed (notes) is marked translate="no" and stays as typed, as in the product (PRODUCT.md §3). */
window.FIVVI_I18N = (function () {
  "use strict";
  var D = window.FIVVI_DATA;

  /* Sentence-level rules first: these change word order or need a captured value. */
  var RULES = [
    [/^Straks · over (\d+) min$/, "Up next · in $1 min"],
    [/^Je valt in voor (.+?)(\.?)$/, "Covering for $1$2"],
    [/^(\d+) sessies, eerste om (\d\d:\d\d)$/, "$1 sessions, first at $2"],
    [/^(.+) krijgt een e-mail dat de sessie van (\d\d:\d\d) niet doorgaat\.$/, "$1 will get an email that the $2 session is off."],
    [/^(.+) krijgt een e-mail met de nieuwe tijd\.$/, "$1 will get an email with the new time."],
    [/^De (\d+) geboekte klanten krijgen een e-mail\. Je kunt er een bericht bij zetten op het web\.$/, "The $1 booked clients will get an email. You can add a message on the web."],
    [/^(.+) heeft (\d+) gelogde sets?\. Toch verwijderen\?$/, function (m, a, n) { return P(a) + " has " + n + (n === "1" ? " logged set" : " logged sets") + ". Remove it anyway?"; }],
    [/^Set (\d+) verwijderen\?$/, "Remove set $1?"],
    [/^Set (\d+): verplaatsen of verwijderen$/, "Set $1: move or remove"],
    [/^Opties voor (.+)$/, function (m, a) { return "Options for " + P(a); }],
    [/^(.+) verplaatsen$/, function (m, a) { return "Move " + P(a); }],
    [/^De enige set van (.+) gaat uit deze training\.$/, function (m, a) { return "The only set of " + P(a) + " leaves this workout."; }],
    [/^Beide sets van (.+) gaan uit deze training\.$/, function (m, a) { return "Both sets of " + P(a) + " leave this workout."; }],
    [/^Alle (\d+) sets van (.+) gaan uit deze training\.$/, function (m, n, a) { return "All " + n + " sets of " + P(a) + " leave this workout."; }],
    [/^(.+) houdt (\d+) sets?\.$/, function (m, a, n) { return P(a) + " keeps " + n + (n === "1" ? " set." : " sets."); }],
    [/^(.+) verwijderen\?$/, function (m, a) { return "Remove " + P(a) + "?"; }],
    [/^(.+) verwijderen$/, function (m, a) { return "Remove " + P(a); }],
    [/^Alleen trainers van (.+) zien dit\. De klant niet\.$/, "Only trainers at $1 see this. The client doesn't."],
    [/^Alleen trainers van (.+) zien notities\.$/, "Only trainers at $1 see notes."],
    [/^Alleen trainers van (.+) zien dit\.$/, "Only trainers at $1 see this."],
    [/^Notitie over (.+)$/, "Note about $1"],
    [/^Bericht voor (.+) \(optioneel\)$/, "Message for $1 (optional)"],
    [/^Delen met (.+)$/, "Share with $1"],
    [/^Gedeeld met (.+)$/, "Shared with $1"],
    [/^Training delen met (.+?)\? (.+?) ziet het overzicht in haar profiel en krijgt een e-mail\.$/, "Share the workout with $1? $2 sees the summary in their profile and gets an email."],
    [/^Je training staat klaar, (.+)$/, "Your workout is ready, $1"],
    [/^Recent bij (.+)$/, "Recent for $1"],
    [/^Schema's van (.+)$/, "$1's templates"],
    [/^ook: (.+?) · (.+)$/, function (m, en, rest) { var hit = D.library.filter(function (l) { return l.en === en; })[0]; return "also: " + (hit ? hit.n : en) + " · " + P(rest); }],
    [/^Nieuwe oefening “(.+)” aanmaken$/, "Create new exercise “$1”"],
    [/^Geen klant gevonden voor “(.+)”\.$/, "No client found for “$1”."],
    [/^Sessie aangemaakt voor nu, (.+)$/, "Session created for now, $1"],
    [/^Sessie verplaatst naar (.+)$/, function (m, a) { return "Session moved to " + P(a); }],
    [/^Ingelogd als (.+)$/, "Signed in as $1"],
    [/^(\S+) was aanwezig$/, "$1 attended"],
    [/^Vanaf (\d\d:\d\d)\.$/, "From $1."],
    [/^Bezig · gestart om (.+)$/, "In progress · started at $1"],
    [/^Elke week op (\S+)$/, function (m, d) { return "Every week on " + P(d); }],
    [/^Training opgeslagen\. Schema (.+) staat klaar\.$/, "Workout saved. Template $1 is ready."],
    [/^(\d+) oefeningen · (\d+) (sets?) klaar$/, "$1 exercises · $2 $3 done"],
    [/^Voeg de eerste oefening toe\. Wat (.+) eerder deed, staat bovenaan\.$/, "Add the first exercise. What $1 did before is at the top."],
    [/^(.+) \(aangepast\)$/, "$1 (edited)"],
    [/^(.+) blijft zoals het was\.$/, "$1 stays as it was."],
    [/^Niet gedaan: (.+)$/, function (m, a) { return "Not done: " + P(a); }],
    [/^Deelnemers · (\d+)$/, "Participants · $1"],
    [/^Toon alle (\d+)$/, "Show all $1"],
    [/^(\d+) plekken vrij$/, "$1 spots left"],
    [/^Bij (.+) thuis$/, "At $1's home"],
    [/^Bij (.+)$/, "At $1"],
    [/^Week (\d+) · (.+)$/, function (m, n, r) { return "Week " + n + " · " + P(r); }],
    [/^We hebben een code gestuurd naar$/, "We sent a code to"]
  ];

  /* Phrases and words, replaced on letter boundaries, longest first. */
  var PH = {
    /* app frame */
    "Opzet": "Setup", "Studio met team": "Studio with a team", "Zelfstandige PT": "Independent PT", "Bovenkant Vandaag": "Top of Today", "Dagstrip": "Day strip", "Tegels": "Tiles", "Regel": "Line",
    "Vandaag · zelfstandige PT": "Today · independent PT", "sessies": "sessions", "sessie": "session", "Uren": "Hours", "uur": "hours",
    "Bij de klant thuis": "At the client's home", "Naam en e-mailadres. De klant krijgt een uitnodiging om in te loggen.": "Name and email address. The client gets an invitation to sign in.",
    "De klant krijgt een e-mail met een uitnodiging om in te loggen.": "The client gets an email inviting them to sign in.", "Geen sessies vandaag": "No sessions today",
    "Zwart-wit": "Black and white",
    "Omhoog": "Move up", "Omlaag": "Move down", "Volgorde wijzigen": "Reorder", "Volgorde": "Order", "Klaar": "Done",
    "Sleep aan ≡ om de volgorde te wijzigen.": "Drag ≡ to change the order.", "Zet de set eerst weer open": "Reopen the set first", "Dit is de enige set": "This is the only set",
    "Beschrijving in het Engels": "Description in English", "Beschrijving": "Description", "Minder": "Less",
    "Wat doe je in deze les? Dit zien klanten op je boekingspagina.": "What happens in this class? Clients see this on your booking page.",
    "Zonder Engelse tekst zien Engelstalige klanten de Nederlandse. Studio Fit, Kerkstraat 12. Een vaste reeks beheer je op het web.": "Without English text, English-speaking clients see the Dutch. Studio Fit, Kerkstraat 12. A series is managed on the web.",
    "Vorige": "Previous", "tijd": "time", "Set": "Set",
    "Je dag in ringen": "Your day in rings", "Jouw sessies van vandaag.": "Your sessions today.",
    "Privésessies die al voorbij zijn, van het totaal vandaag.": "Private sessions that are already over, out of today's total.",
    "klaar": "done", "plekken": "spots",
    /* round 1 feedback */
    "Hele studio": "Whole studio", "Alles bij Studio Fit vandaag, van alle trainers.": "Everything at Studio Fit today, from all trainers.",
    "Jouw sessies bij Studio Fit en John's Gym.": "Your sessions at Studio Fit and John's Gym.",
    "Je dag afronden": "Wrapping up your day", "Drie taken die alleen jij kunt afmaken. Zijn alle drie de ringen rond, dan staat er niets meer open voor vandaag.": "Three jobs only you can finish. When all three rings are closed, nothing is left open for today.",
    "Voorbije sessies waarvan je de aanwezigheid hebt ingevuld.": "Past sessions where you recorded attendance.",
    "Privésessies van vandaag waarvoor je een training hebt gelogd.": "Today's private sessions where you logged a workout.",
    "Gelogde trainingen die je met de klant hebt gedeeld.": "Logged workouts you shared with the client.",
    "Hoe vol is de studio?": "How full is the studio?", "Geboekte plekken van alle groepslessen samen.": "Booked spots across all group classes.",
    "Geboekte plekken van alle Open Gym-blokken samen.": "Booked spots across all Open Gym blocks.",
    "Privésessies vandaag, vergeleken met vorige week donderdag. Rond is evenveel of meer.": "Private sessions today, compared with last Thursday. Closed means as many or more.",
    "Privésessies": "Private sessions", "plekken bezet": "spots filled", "vorige do 4": "last Thu 4", "met klant": "with client", "Gedeeld": "Shared",
    "Training bezig": "Workout in progress", "Bekijken": "View", "jij": "you",
    "Vandaag · hele studio": "Today · whole studio", "Vandaag": "Today", "Agenda": "Calendar", "Klantprofiel": "Client profile", "Klanten": "Clients", "Profiel": "Profile",
    "Nieuw (+)": "New (+)", "Nieuwe privésessie": "New private session", "Nieuwe groepsles": "New group class", "Nieuwe klant": "New client", "Nieuw Open Gym-blok": "New Open Gym block", "Nieuwe oefening": "New exercise", "Nieuw": "New",
    "Zoek klant": "Search client", "Zoek op naam of e-mail": "Search by name or email", "Mijn dag": "My day", "Terug": "Back", "Meer": "More", "Bewerken": "Edit", "Opslaan": "Save", "Sluiten": "Close", "Annuleren": "Cancel",
    /* rings */
    "Je ringen van vandaag": "Your rings for today", "Wat betekenen de ringen?": "What do the rings mean?",
    "Drie taken voor je dag. Zijn alle drie de ringen rond, dan is je dag helemaal bijgewerkt.": "Three jobs for your day. When all three rings are closed, your day is fully up to date.",
    "Hoeveel sessies van vandaag voorbij zijn.": "How many of today's sessions are over.",
    "Voor hoeveel voorbije sessies je de aanwezigheid hebt ingevuld.": "For how many past sessions you recorded attendance.",
    "Voor hoeveel privésessies je een training hebt gelogd.": "For how many private sessions you logged a workout.",
    "Sessies": "Sessions", "Trainingen": "Workouts", "afgerond": "done", "ingevuld": "recorded", "gelogd": "logged", "Begrepen": "Got it",
    /* today */
    "Nu bezig": "In progress", "Training starten": "Start workout", "Openen": "Open", "Schema:": "Template:",
    "Aanwezigheid nog invullen": "Attendance not recorded yet", "Niet verschenen": "No-show", "niet verschenen": "no-show", "Genoteerd als niet verschenen": "Recorded as no-show",
    "Aanwezigheid invullen": "Record attendance", "Aanwezigheid opgeslagen": "Attendance saved", "Aanwezigheid les": "Class attendance", "Aanwezigheid": "Attendance", "Aanwezig": "Attended", "aanwezig": "attended", "Iedereen aanwezig": "Everyone attended",
    "Geannuleerd": "Cancelled", "Vol": "Full", "Morgen": "Tomorrow", "Geen sessies vandaag.": "No sessions today.", "Geen sessies.": "No sessions.", "Geen sessies": "No sessions",
    "Privésessie": "Private session", "privésessies": "private sessions", "Groepslessen": "Group classes", "Groepsles (invallen)": "Group class (covering)", "Groepsles": "Group class", "Privé": "Private", "Groep": "Group",
    /* calendar */
    "Dag": "Day", "Maand": "Month", "Vorige week": "Previous week", "Volgende week": "Next week", "Vorige maand": "Previous month", "Volgende maand": "Next month",
    /* clients */
    "Geen e-mailadres": "No email address", "Nog geen sessie": "No session yet", "vandaag": "today", "Nu training starten": "Start workout now", "Sessie plannen": "Plan session",
    "zwaarste set": "heaviest set", "in 8 weken": "in 8 weeks", "Gegevens": "Details", "Taal voor e-mails": "Language for emails", "E-mail": "Email", "Werkruimtes": "Workspaces", "Werkruimte": "Workspace",
    "Nog niet ingevuld": "Not filled in yet", "Notities": "Notes", "+ Notitie": "+ Note", "Nog geen notities.": "No notes yet.", "Nog geen trainingen.": "No workouts yet.", "Notitie opgeslagen": "Note saved", "Schrijf eerst een notitie": "Write a note first",
    "Notitie voor trainers": "Note for trainers", "Notitie": "Note", "Nederlands": "Dutch",
    /* session and class */
    "Deze sessie is geannuleerd.": "This session is cancelled.", "Jij": "You", "Nog geen schema": "No template yet", "Kies een schema of begin leeg": "Choose a template or start empty",
    "Afgerond": "Finished", "Training bekijken": "View workout", "Doorgaan met training": "Continue workout", "Vorige keer": "Last time", "Alles": "All", "Nog geen eerdere training": "No previous workout",
    "Alleen voor trainers. Notities zie je nooit in meldingen of widgets.": "Trainers only. Notes never show in notifications or widgets.",
    "Deze les is geannuleerd. Geboekte klanten hebben een e-mail gekregen.": "This class is cancelled. Booked clients have received an email.",
    "Geboekt": "Booked", "geboekt": "booked", "1 plek vrij": "1 spot left", "Deelnemers": "Participants", "Nog niemand geboekt.": "No bookings yet.",
    "Boekingslink delen": "Share booking link", "Boekingslink gekopieerd": "Booking link copied", "Les wijzigen, een vaste reeks en trainers beheer je op het web.": "Editing a class, a series and trainers happens on the web.",
    "Verplaatsen": "Reschedule", "Sessie verplaatsen": "Reschedule session", "Sessie annuleren?": "Cancel session?", "Sessie annuleren": "Cancel session", "Sessie geannuleerd": "Session cancelled", "Sessie gepland": "Session planned",
    "Les annuleren?": "Cancel class?", "Les annuleren": "Cancel class", "Les geannuleerd": "Class cancelled", "Les wijzigen": "Edit class", "Trainer vervangen": "Substitute trainer", "Route": "Route",
    "Opent de route in Kaarten": "Opens the route in Maps",
    /* new */
    "Een sessie met één klant.": "A session with one client.", "Bij Studio Fit": "At Studio Fit", "Een naam is genoeg. Het e-mailadres kan later.": "A name is enough. The email address can come later.",
    "Groepslessen en Open Gym van John's Gym plant de eigenaar.": "The owner schedules group classes and Open Gym at John's Gym.",
    "Groepslessen en Open Gym van Studio Fit en John's Gym plant de eigenaar.": "The owner schedules group classes and Open Gym at Studio Fit and John's Gym.",
    "Klant toegevoegd": "Client added", "Klant": "Client", "Datum": "Date", "Begin": "Start", "Eind": "End", "Duur": "Duration", "1,5 uur": "1.5 hours", "1 uur": "1 hour", "Locatie": "Location",
    "Fivvi stelt de locatie van de vorige sessie met deze klant voor.": "Fivvi suggests the location of the last session with this client.",
    "Voor- en achternaam": "First and last name", "Optioneel": "Optional", "Een naam is genoeg. Zonder e-mailadres krijgt de klant geen e-mails.": "A name is enough. Without an email address the client gets no emails.",
    "Bijvoorbeeld Strength": "For example Strength", "Capaciteit": "Capacity", "Herhalen": "Repeat", "Niet herhalen": "Don't repeat", "Trainer nodig": "Trainer needed",
    "Studio Fit, Kerkstraat 12. Een vaste reeks en de beschrijving beheer je op het web.": "Studio Fit, Kerkstraat 12. A series and the description are managed on the web.",
    "Studio Fit, Kerkstraat 12. Het Open Gym-blok staat meteen op je boekingspagina.": "Studio Fit, Kerkstraat 12. The Open Gym block shows on your booking page right away.",
    "Bijvoorbeeld een blessure of een doel": "For example an injury or a goal", "Vul een naam in": "Enter a name",
    "Groepsles gepland": "Group class planned", "Wekelijkse groepsles gepland": "Weekly group class planned", "Open Gym gepland en gepubliceerd": "Open Gym planned and published",
    /* logger */
    "Training afronden": "Finish workout", "Training opgeslagen": "Workout saved", "Training loggen": "Log workout", "Training delen": "Share workout", "Training zonder schema": "Workout without template",
    "Training blijft openstaan": "Workout stays open", "Training gesloten zonder geschiedenis": "Workout closed without history", "Training": "Workout",
    "Lege training": "Empty workout", "Begin zonder schema en voeg oefeningen toe terwijl je traint.": "Start without a template and add exercises as you train.",
    "Vorige training herhalen": "Repeat previous workout", "Andere schema's": "Other templates", "Afronden": "Finish", "Opgeslagen": "Saved", "Nog geen oefeningen": "No exercises yet",
    "Oefening toevoegen": "Add exercise", "Zoek oefening (NL of EN)": "Search exercise (Dutch or English)", "Zoek oefening": "Search exercise", "Resultaten": "Results", "Bibliotheek": "Library",
    "In training": "In workout", "Geen oefening gevonden.": "No exercise found.", "Alleen herhalingen": "Reps only", "Afstand + tijd": "Distance + time", "Tijd": "Time",
    "Oefening aangemaakt. Je vindt hem voortaan onder Jouw oefeningen.": "Exercise created. You'll find it under Your exercises from now on.",
    "Doel:": "Target:", "Vorige:": "Previous:", "vorige": "last", "× verwijderen": "× remove", "herh.": "reps", "oefeningen": "exercises", "Oefeningen": "Exercises", "oefening": "exercise",
    "Hoe ging het?": "How was it?", "Wat betekent dit?": "What does this mean?", "Makkelijk": "Easy", "Normaal": "Normal", "Zwaar": "Hard",
    "Vraag na de laatste set hoe de oefening voelde. Het wordt bewaard bij de training, zodat je het later terugziet in de geschiedenis van de klant.": "After the last set, ask how the exercise felt. It's saved with the workout, so you can see it later in the client's history.",
    "Ging makkelijk.": "It felt easy.", "Zoals verwacht. Dit staat al aan.": "As expected. This is selected already.", "Was zwaar.": "It felt hard.",
    "Bijvoorbeeld: laatste set zwaar, volgende keer zelfde gewicht.": "For example: last set was hard, same weight next time.",
    "Opslaan als nieuw schema": "Save as a new template", "Opslaan als schema": "Save as template", "Dan kies je deze training later opnieuw.": "Then you can choose this workout again later.", "Naam van het schema": "Template name",
    "Goed gewerkt vandaag!": "Great work today!", "Voorbeeld bekijken": "Preview", "Voorbeeld verbergen": "Hide preview", "Nu niet delen": "Not now", "Opgeslagen. Je kunt later nog delen.": "Saved. You can still share it later.",
    "Nog niets bijgehouden": "Nothing logged yet", "Je hebt nog geen sets afgevinkt. Toch afronden?": "You haven't ticked off any sets yet. Finish anyway?", "Duur": "Duration",
    /* profile and sign-in */
    "Instellingen": "Settings", "Taal": "Language", "Eigenaar": "Owner", "Wijzigen": "Change", "Naam wijzigen opent een veld": "Changing your name opens a field",
    "Vandaag en Agenda tonen je sessies van alle werkruimtes samen.": "Today and Calendar show your sessions from all workspaces together.",
    "Beheer op het web": "Manage on the web", "Feedback geven": "Give feedback", "Uitloggen?": "Sign out?", "Uitloggen": "Sign out", "Account verwijderen?": "Delete account?", "Account verwijderen": "Delete account",
    "Fivvi Pro · prototype v2 · fictieve gegevens": "Fivvi Pro · prototype v2 · fictional data", "Opent Fivvi op het web": "Opens Fivvi on the web", "Opent het feedbackformulier": "Opens the feedback form",
    "De taal van de app. E-mails volgen dezelfde keuze.": "The language of the app. Emails follow the same choice.",
    "Je kunt altijd weer inloggen met je e-mailadres.": "You can always sign in again with your email address.",
    "Je account en je gegevens worden verwijderd. Werkruimtes waar je eigenaar bent, draag je eerst over op het web.": "Your account and data will be deleted. Workspaces you own are handed over on the web first.",
    "Verwijderen": "Delete", "Dit prototype verwijdert niets": "This prototype deletes nothing", "Dit beheer je op het web": "You manage this on the web",
    "Inloggen bij Fivvi Pro": "Sign in to Fivvi Pro", "Vul je e-mailadres in. We sturen je een code van 6 cijfers.": "Enter your email address. We'll send you a 6-digit code.",
    "naam@voorbeeld.nl": "name@example.com", "Doorgaan": "Continue", "Nog geen account? Je eigenaar nodigt je uit, of je maakt een werkruimte aan op het web.": "No account yet? Your owner invites you, or you create a workspace on the web.",
    "Check je e-mail": "Check your email", "Code van 6 cijfers": "6-digit code", "Inloggen": "Sign in", "Andere e-mail gebruiken": "Use another email",
    "In dit prototype werkt elke code van 6 cijfers.": "Any 6-digit code works in this prototype.", "Vul een geldig e-mailadres in": "Enter a valid email address",
    /* board panel */
    "Prototype-instellingen": "Prototype settings", "Ronde 1: de Fivvi Pro-app · fictieve gegevens · nu is do 5 nov, 10:05": "Round 1: the Fivvi Pro app · fictional data · it's Thu 5 Nov, 10:05",
    "Weergave": "Appearance", "Licht": "Light", "Donker": "Dark", "Glas (iOS)": "Glass (iOS)", "Helder": "Clear", "Getint": "Tinted", "Rol bij Studio Fit": "Role at Studio Fit", "Opnieuw beginnen": "Start over",
    "Tik door de app zoals op je telefoon. Alles wat je toevoegt of wijzigt, blijft tot je opnieuw begint. Ga direct naar een scherm:": "Tap through the app as on your phone. Anything you add or change stays until you start over. Jump straight to a screen:",
    "Fivvi Pro app": "Fivvi Pro app", "Volgt in de volgende rondes": "Coming in the next rounds", "Boekingspagina": "Booking page", "Klantweb": "Client web",
    /* data */
    "borst": "chest", "schouders": "shoulders", "rug": "back", "benen": "legs", "billen": "glutes", "armen": "arms", "conditie": "conditioning", "(buiten)": "(outdoors)",
    "Upper A · 29 okt": "Upper A · 29 Oct",
    /* dates */
    "maandag": "Monday", "dinsdag": "Tuesday", "woensdag": "Wednesday", "donderdag": "Thursday", "vrijdag": "Friday", "zaterdag": "Saturday", "zondag": "Sunday",
    "januari": "January", "februari": "February", "maart": "March", "april": "April", "mei": "May", "juni": "June", "juli": "July", "augustus": "August", "september": "September", "oktober": "October", "november": "November", "december": "December",
    "ma": "Mon", "di": "Tue", "wo": "Wed", "do": "Thu", "vr": "Fri", "za": "Sat", "zo": "Sun",
    "jan": "Jan", "feb": "Feb", "mrt": "Mar", "apr": "Apr", "jun": "Jun", "jul": "Jul", "aug": "Aug", "sep": "Sep", "okt": "Oct", "nov": "Nov", "dec": "Dec"
  };
  D.library.forEach(function (l) { if (l.n !== l.en) PH[l.n] = l.en; });
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  var PHL = Object.keys(PH).sort(function (a, b) { return b.length - a.length; }).map(function (k) { return [new RegExp("(^|[^\\p{L}])" + reEsc(k) + "(?=$|[^\\p{L}])", "gu"), PH[k]]; });

  function P(s) {
    /* one pass per position: protect replaced text so "Agenda" → "Calendar" isn't touched again */
    var out = s.replace(/Bij (\S+) thuis/g, "At $1's home").replace(/Je valt in voor /g, "Covering for ").replace(/Bezig · gestart om /g, "In progress · started at "), marks = [];
    PHL.forEach(function (p) { out = out.replace(p[0], function (m, pre) { marks.push(p[1]); return pre + "\u0001" + (marks.length - 1) + "\u0002"; }); });
    out = out.replace(/\u0001(\d+)\u0002/g, function (m, i) { return marks[+i]; });
    return out.replace(/(\d),(\d)/g, "$1.$2");
  }
  function T(s) {
    var lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], core = s.trim();
    if (!core) return s;
    if (PH[core]) return lead + PH[core] + trail;
    for (var i = 0; i < RULES.length; i++) { if (RULES[i][0].test(core)) return lead + core.replace(RULES[i][0], RULES[i][1]) + trail; }
    return lead + P(core) + trail;
  }
  var ATTRS = ["placeholder", "aria-label", "title"];
  function apply(root, lang) {
    if (!root) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (t) {
      var p = t.parentElement; if (!p || p.closest("[translate=no],script,style,textarea")) return;
      if (t.__nl == null) t.__nl = t.nodeValue;
      t.nodeValue = lang === "en" ? T(t.__nl) : t.__nl;
    });
    var els = [root].concat([].slice.call(root.querySelectorAll("[placeholder],[aria-label],[title]")));
    els.forEach(function (el) {
      if (!el.getAttribute || el.closest("[translate=no]")) return;
      ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        var k = "data-nl-" + a; if (!el.hasAttribute(k)) el.setAttribute(k, el.getAttribute(a));
        el.setAttribute(a, lang === "en" ? T(el.getAttribute(k)) : el.getAttribute(k));
      });
    });
    root.querySelectorAll && root.querySelectorAll("input").forEach(function (i) { if (lang === "en" && /^\d+,\d+$/.test(i.value) && i.dataset.ls) i.value = i.value.replace(",", "."); });
  }
  return { apply: apply, T: T };
})();
