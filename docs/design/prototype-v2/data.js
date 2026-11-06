/* Fictional data only (AGENTS.md: no real data). "Now" is Thursday 5 November 2026, 10:05, Europe/Amsterdam. */
window.FIVVI_DATA = (function () {
  var me = { name: "Sarah Jansen", first: "Sarah", email: "sarah@example.com", lang: "nl" };
  var workspaces = {
    sf: { id: "sf", name: "Studio Fit", role: "owner", color: "var(--ws-sf)", location: "Studio Fit, Kerkstraat 12" },
    jg: { id: "jg", name: "John's Gym", role: "trainer", color: "var(--ws-jg)", location: "John's Gym, Havenweg 3" }
  };
  var locations = ["Studio Fit, Kerkstraat 12", "TrainMore Zuid", "Basic-Fit Oost", "Vondelpark (buiten)"];
  var trainers = { sf: ["Sarah Jansen", "Mike de Boer", "Yara Koster", "Noah Bakker"], jg: ["John Peters", "Mike de Boer", "Sarah Jansen"] };

  var clients = [
    { id: "anna", ws: "sf", name: "Anna de Vries", email: "anna@example.com", lang: "Nederlands", last: "29 okt", c: "var(--priv)" },
    { id: "mark", ws: "sf", name: "Mark Visser", email: "mark@example.com", lang: "Nederlands", last: "vandaag", c: "#34C759" },
    { id: "lisa", ws: "sf", name: "Lisa Bakker", email: "lisa@example.com", lang: "English", last: "3 nov", c: "#FF8D28" },
    { id: "daan", ws: "sf", name: "Daan Smit", email: "daan@example.com", lang: "Nederlands", last: "2 nov", c: "#6155F5" },
    { id: "noor", ws: "sf", name: "Noor el Amrani", email: "noor@example.com", lang: "Nederlands", last: "30 okt", c: "#CB30E0" },
    { id: "sophie", ws: "sf", name: "Sophie Mulder", email: "sophie@example.com", lang: "English", last: "28 okt", c: "#00C3D0" },
    { id: "bram", ws: "sf", name: "Bram Hendriks", email: "bram@example.com", lang: "Nederlands", last: "27 okt", c: "#AC7F5E" },
    { id: "fleur", ws: "sf", name: "Fleur de Jong", email: "fleur@example.com", lang: "Nederlands", last: "21 okt", c: "#FF2D55" },
    { id: "thomas", ws: "sf", name: "Thomas Peters", email: "thomas@example.com", lang: "Nederlands", last: "Nog geen sessie", c: "#8E8E93" },
    { id: "eva", ws: "sf", name: "Eva Kok", email: "eva@example.com", lang: "Nederlands", last: "19 okt", c: "#34C759" },
    { id: "chris", ws: "jg", name: "Chris Bakker", email: "chris@example.com", lang: "Nederlands", last: "4 nov", c: "#0088FF" },
    { id: "iris", ws: "jg", name: "Iris Vos", email: "iris@example.com", lang: "English", last: "1 nov", c: "#FF8D28" },
    { id: "jesse", ws: "jg", name: "Jesse van Dam", email: "jesse@example.com", lang: "Nederlands", last: "31 okt", c: "#6155F5" }
  ];

  var notes = {
    anna: [
      { t: "Linkerschouder gevoelig bij drukken boven het hoofd. Geen schouderdrukken met stang.", d: "29 okt", by: "Sarah" },
      { t: "Traint het liefst 's ochtends. Wil in maart een 10 km lopen.", d: "15 okt", by: "Sarah" }
    ],
    mark: [{ t: "Knie rechts: geen diepe lunges. Squat tot parallel is prima.", d: "22 okt", by: "Mike" }]
  };

  /* Workout history per client, newest first. */
  /* Workouts a client did on their own from a workout the trainer shared (owner, 5 Nov 2026: MVP, with M7, #602).
     Private to the client: trainers never see them. Each set: exercise, what the client did, what the trainer's workout said. */
  var selfLog = {
    anna: [{ name: "Upper A", d: "di 3 nov", n: 5, from: "29 okt", by: "Sarah",
      sets: [["Bankdrukken", "62,5 kg × 8, 8, 6", "60 kg × 8, 8, 7"], ["Kabel roeien", "45 kg × 10, 10, 10", "45 kg × 10, 10, 10"], ["Dumbbell schouderdrukken", "14 kg × 10, 8", "14 kg × 10, 10"], ["Roeien", "500 m · 1:58", "500 m · 1:52"], ["Hip thrust", "40 kg × 12, 12, 10"]] }]
  };
  var history = {
    anna: [
      { name: "Upper A", d: "do 29 okt", n: 5, by: "Sarah", dur: "52 min", note: "Bankdrukken laatste set zwaar. Volgende keer zelfde gewicht, eerst 8 × 3 halen.",
        sets: [["Bankdrukken", "60 kg × 8, 8, 7", "h"], ["Kabel roeien", "45 kg × 10, 10, 10", "n"], ["Dumbbell schouderdrukken", "14 kg × 10, 10", "e"], ["Plank", "0:45 × 2, 0:40", "n"], ["Roeien", "500 m · 1:52", "n"]] },
      { name: "Lower A", d: "do 22 okt", n: 4, by: "Sarah", dur: "48 min", note: "Deadlift goed, rug stabiel.",
        sets: [["Squat", "70 kg × 8, 8, 8", "n"], ["Deadlift", "80 kg × 5, 5, 5", "h"], ["Lunges", "12 kg × 10, 10, 10", "n"], ["Plank", "0:45 × 2", "e"]] },
      { name: "Training zonder schema", d: "do 15 okt", n: 3, by: "Sarah" },
      { name: "Upper A", d: "do 8 okt", n: 5, by: "Mike" }
    ],
    mark: [{ name: "Full body", d: "ma 2 nov", n: 4, by: "Sarah", dur: "55 min", note: "Knie hield zich goed bij squat tot parallel.",
      sets: [["Squat", "90 kg × 10, 10, 9", "h"], ["Bankdrukken", "70 kg × 10, 10, 10", "n"], ["Kabel roeien", "55 kg × 10, 10, 10", "e"], ["Plank", "0:30 × 3", "e"]] }, { name: "Full body", d: "do 29 okt", n: 4, by: "Sarah" }]
  };
  /* Bench press heaviest set per week for Anna, for the Health-style chart. */
  var progress = { anna: [52.5, 52.5, 55, 55, 57.5, 57.5, 60, 60] };
  /* progress per main exercise: heaviest set each week for the last 8 weeks; and whether they trained each week */
  var lifts = {
    anna: [["Bankdrukken", [52.5, 52.5, 55, 55, 57.5, 57.5, 60, 60]], ["Kabel roeien", [37.5, 40, 40, 42.5, 42.5, 45, 45, 45]], ["Squat", [55, 57.5, 60, 62.5, 62.5, 65, 67.5, 70]]],
    mark: [["Squat", [75, 77.5, 80, 82.5, 85, 85, 87.5, 90]], ["Bankdrukken", [60, 62.5, 62.5, 65, 65, 67.5, 70, 70]]]
  };
  var weeks = { anna: [1, 1, 1, 0, 1, 1, 1, 1], mark: [1, 1, 1, 1, 1, 1, 1, 1] };
  var DIFF = { e: ["😌", "Makkelijk"], n: ["🙂", "Normaal"], h: ["🥵", "Zwaar"] };
  /* a tiny line for a list row */
  function spark(v, color, w, h) {
    w = w || 64; h = h || 22; var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), r = mx - mn || 1;
    var pts = v.map(function (x, i) { return [(i / (v.length - 1) * (w - 4) + 2).toFixed(1), (h - 3 - (x - mn) / r * (h - 6)).toFixed(1)]; });
    return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><path d="M' + pts.map(function (p) { return p.join(" "); }).join("L") + '" fill="none" style="stroke:' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="2.6" style="fill:' + color + '"/></svg>';
  }

  /* Today, explicit. Times are local. */
  var today = [
    { id: "s1", ws: "sf", type: "priv", s: "07:00", e: "08:00", client: "mark", loc: "Basic-Fit Oost", att: null, workout: "Full body", wstate: "done", shared: true },
    { id: "s2", ws: "sf", type: "group", s: "08:30", e: "09:30", title: "Strength", loc: "Studio Fit, Kerkstraat 12", cap: 8, people: ["daan", "noor", "sophie", "bram", "fleur", "eva", "thomas", "lisa"], att: null, attMap: { 0: "yes", 1: "yes", 2: "yes", 3: "no", 4: "yes", 5: "yes", 6: "yes", 7: "yes" } },
    { id: "s3", ws: "sf", type: "priv", s: "10:30", e: "11:30", client: "anna", loc: "TrainMore Zuid", att: null, workout: "Upper A" },
    { id: "s4", ws: "sf", type: "gym", s: "12:00", e: "14:00", title: "Open Gym", loc: "Studio Fit, Kerkstraat 12", cap: 10, people: ["daan", "eva", "bram"] },
    { id: "s5", ws: "jg", type: "group", s: "15:00", e: "16:00", title: "Strength", loc: "John's Gym, Havenweg 3", cap: 8, people: ["chris", "iris", "jesse", "chris", "iris", "jesse", "chris"].map(function (x, i) { return i < 3 ? x : "guest" + i; }), sub: "Mike" },
    /* a duo session: two clients, one trainer, each logged on their own (owner decision, 5 Nov 2026) */
    { id: "s6", ws: "sf", type: "priv", s: "16:30", e: "17:30", client: "lisa", duo: "eva", loc: "Vondelpark (buiten)", att: null },
    /* only in the independent-trainer setup: a session at the client's home */
    { id: "s8", ws: "sf", type: "priv", s: "12:30", e: "13:30", client: "daan", loc: "Bij Daan thuis", att: null, soloOnly: true },
    { id: "s7", ws: "sf", type: "group", s: "18:00", e: "19:00", title: "HIIT", loc: "Studio Fit, Kerkstraat 12", cap: 12, people: [], cancelled: true }
  ];

  /* A repeating weekly pattern for the other days (0 = Monday). */
  var pattern = [
    [["priv", "07:00", "08:00", "daan", "Basic-Fit Oost"], ["group", "09:30", "10:30", "Kracht", 12, 9], ["priv", "16:00", "17:00", "noor", "TrainMore Zuid"]],
    [["priv", "07:30", "08:15", "sophie", "Studio Fit, Kerkstraat 12"], ["gym", "11:00", "13:00", "Open Gym", 10, 4], ["priv", "14:00", "15:00", "bram", "Studio Fit, Kerkstraat 12"], ["group", "19:00", "20:00", "Spinning", 14, 11]],
    [["group", "09:30", "10:30", "Kracht", 12, 12], ["priv", "12:00", "13:00", "fleur", "TrainMore Zuid"]],
    null,
    [["group", "10:00", "11:00", "HIIT", 12, 10], ["gym", "13:00", "15:00", "Open Gym", 10, 7], ["priv", "15:30", "16:30", "eva", "Studio Fit, Kerkstraat 12"]],
    [["group", "09:00", "10:00", "Bootcamp", 16, 14], ["gym", "10:30", "12:30", "Open Gym", 10, 9]],
    [["group", "10:00", "11:00", "Mobility", 14, 6]]
  ];

  /* Class descriptions, typed by the owner in Dutch with an optional English version (PRODUCT.md §18). */
  var descriptions = {
    Strength: { nl: "Krachttraining in een kleine groep. We werken aan squat, deadlift en drukken, met aandacht voor techniek. Voor elk niveau: je kiest zelf je gewicht.", en: "Strength training in a small group. We work on squat, deadlift and pressing, with attention to technique. For every level: you choose your own weight." },
    HIIT: { nl: "Korte, intensieve intervallen met je eigen lichaamsgewicht en kettlebells. Pittig, maar je bepaalt zelf het tempo.", en: "Short, intense intervals with bodyweight and kettlebells. Tough, but you set your own pace." },
    Kracht: { nl: "Kracht opbouwen met vrije gewichten. Rustig tempo, veel aandacht voor houding.", en: "" },
    Spinning: { nl: "45 minuten fietsen op muziek, met heuvels en sprints.", en: "45 minutes of cycling to music, with hills and sprints." },
    Bootcamp: { nl: "Buiten trainen in het park als het droog is, binnen als het regent. Neem water mee.", en: "Outdoor training in the park when it's dry, indoors when it rains. Bring water." },
    Mobility: { nl: "Rustige les voor soepele heupen, schouders en rug. Fijn naast krachttraining.", en: "A calm class for supple hips, shoulders and back. A good match for strength training." }
  };

  /* Class level, a field on the class (owner decision, 5 Nov 2026): no longer part of the name. Empty = no level shown. */
  var LEVELS = ["Alle niveaus", "Beginner", "Gemiddeld", "Gevorderd"];
  var levels = { Strength: "Alle niveaus", HIIT: "Gevorderd", Kracht: "Beginner", Spinning: "Alle niveaus", Bootcamp: "Gemiddeld", Mobility: "Beginner",
    "Reformer Classic": "Beginner", "Reformer Power": "Gevorderd", "Reformer Flow": "Gemiddeld", "Mat Pilates": "Alle niveaus",
    "Vinyasa Flow": "Gemiddeld", "Yin Yoga": "Alle niveaus", Hatha: "Beginner", "Power Yoga": "Gevorderd", "Workshop Ademwerk": "Alle niveaus",
    "Small group kracht": "Gemiddeld", "Small group conditie": "Alle niveaus" };

  var templates = { anna: ["Upper A", "Lower A"], other: ["Full body", "Upper B", "Lower B", "Core & conditie"] };

  /* Library: n = Dutch, en = English alias, ty = wr (weight × reps), r (reps), t (time), dt (distance + time). */
  var library = [
    { n: "Bankdrukken", en: "Bench press", ty: "wr", mu: "borst, triceps" },
    { n: "Schuine bankdrukken", en: "Incline bench press", ty: "wr", mu: "borst, schouders" },
    { n: "Kabel roeien", en: "Cable row", ty: "wr", mu: "rug" },
    { n: "Dumbbell schouderdrukken", en: "Dumbbell shoulder press", ty: "wr", mu: "schouders" },
    { n: "Squat", en: "Squat", ty: "wr", mu: "benen" },
    { n: "Deadlift", en: "Deadlift", ty: "wr", mu: "rug, benen" },
    { n: "Lunges", en: "Lunges", ty: "wr", mu: "benen" },
    { n: "Hip thrust", en: "Hip thrust", ty: "wr", mu: "billen" },
    { n: "Biceps curl", en: "Biceps curl", ty: "wr", mu: "armen" },
    { n: "Face pull", en: "Face pull", ty: "wr", mu: "schouders" },
    { n: "Opdrukken", en: "Push-up", ty: "r", mu: "borst" },
    { n: "Pull-up", en: "Pull-up", ty: "r", mu: "rug" },
    { n: "Plank", en: "Plank", ty: "t", mu: "core" },
    { n: "Roeien", en: "Rowing", ty: "dt", mu: "conditie" },
    /* the workspace's own exercises (F040): made by its trainers, never translated */
    { n: "Sled push", en: "", ty: "dt", mu: "benen, conditie", own: true, by: "Sarah" },
    { n: "Battle ropes", en: "", ty: "t", mu: "schouders, conditie", own: true, by: "Mike" }
  ];
  /* templates: exercise, sets, target */
  var tpl = {
    "Upper A": [["Bankdrukken", 3, "8"], ["Kabel roeien", 3, "10"], ["Dumbbell schouderdrukken", 2, "10"], ["Plank", 3, "0:45"], ["Roeien", 1, "500 m"]],
    "Lower A": [["Squat", 3, "8"], ["Deadlift", 3, "5"], ["Lunges", 3, "10"], ["Plank", 2, "0:45"]],
    "Full body": [["Squat", 3, "10"], ["Bankdrukken", 3, "10"], ["Kabel roeien", 3, "10"], ["Plank", 3, "0:30"]],
    "Upper B": [["Schuine bankdrukken", 3, "8"], ["Pull-up", 3, "6"], ["Face pull", 3, "12"]],
    "Lower B": [["Deadlift", 4, "5"], ["Hip thrust", 3, "10"], ["Lunges", 2, "12"]],
    "Core & conditie": [["Plank", 3, "0:45"], ["Battle ropes", 4, "0:30"], ["Sled push", 4, "20 m"]]
  };

  /* Upper A for Anna, as the logger opens it: prefilled from last time and the target. */
  function upperA() {
    return [
      { name: "Bankdrukken", ty: "wr", target: "Doel: 3 × 8", prev: ["60 × 8", "60 × 8", "60 × 7"], sets: [["62,5", "8"], ["62,5", "8"], ["62,5", "8"]] },
      { name: "Kabel roeien", ty: "wr", target: "Doel: 3 × 10", prev: ["45 × 10", "45 × 10", "45 × 10"], sets: [["47,5", "10"], ["47,5", "10"], ["47,5", "10"]] },
      { name: "Dumbbell schouderdrukken", ty: "wr", target: "Doel: 2 × 10", prev: ["14 × 10", "14 × 10"], sets: [["14", "10"], ["14", "10"]] },
      { name: "Plank", ty: "t", target: "Doel: 3 × 0:45", prev: ["0:45", "0:45", "0:40"], sets: [["0", "45"], ["0", "45"], ["0", "45"]] },
      { name: "Roeien", ty: "dt", target: "Doel: 1 × 500 m", prev: ["500 · 1:52"], sets: [["500", "1", "50"]] }
    ];
  }

  /* Scenarios beyond the gym: each replaces the day's data. team = other trainers work here (studio view);
     types = the kinds of sessions this business has. All names and places are fictional. */
  function G(id, s, e, title, cap, n, extra) { var ppl = ["anna", "mark", "lisa", "daan", "noor", "sophie", "bram", "fleur", "thomas", "eva"]; var people = []; for (var i = 0; i < n; i++) people.push(i < ppl.length ? ppl[i] : "guest" + i); var it = { id: id, ws: "sf", type: "group", s: s, e: e, title: title, cap: cap, people: people, att: null }; for (var k in extra || {}) it[k] = extra[k]; return it; }
  function Pv(id, s, e, client, loc, extra) { var it = { id: id, ws: "sf", type: "priv", s: s, e: e, client: client, loc: loc, att: null }; for (var k in extra || {}) it[k] = extra[k]; return it; }
  var setups = {
    pilates: {
      name: "Studio Kern", term: "instructeur", loc: "Studio Kern, Lindengracht 40", team: true, multiWs: false, types: ["group", "priv"],
      trainers: ["Sarah Jansen", "Lotte Visser", "Emma de Wit"],
      today: [
        G("p1", "08:00", "08:50", "Reformer Classic", 6, 6, { loc: "Studio Kern, Lindengracht 40", waitlist: 2, attMap: { 0: "yes", 1: "yes", 2: "yes", 3: "yes", 4: "no", 5: "yes" } }),
        Pv("p2", "09:30", "10:25", "anna", "Studio Kern, Lindengracht 40", { workout: "Reformer privé" }),
        G("p3", "12:15", "13:00", "Mat Pilates", 12, 7, { loc: "Studio Kern, Lindengracht 40" }),
        G("p4", "17:30", "18:20", "Reformer Power", 6, 5, { loc: "Studio Kern, Lindengracht 40" }),
        Pv("p5", "18:45", "19:40", "lisa", "Studio Kern, Lindengracht 40")
      ],
      extra: [
        G("pe1", "09:00", "09:50", "Reformer Classic", 6, 6, { loc: "Studio Kern, Lindengracht 40", trainer: "Lotte Visser", waitlist: 1 }),
        Pv("pe2", "10:00", "10:55", "noor", "Studio Kern, Lindengracht 40", { trainer: "Emma de Wit" }),
        G("pe3", "12:00", "12:50", "Reformer Flow", 6, 4, { loc: "Studio Kern, Lindengracht 40", trainer: "Lotte Visser" }),
        G("pe4", "19:00", "19:50", "Mat Pilates", 12, 10, { loc: "Studio Kern, Lindengracht 40", trainer: "Emma de Wit" })
      ],
      pattern: [[["group", "08:00", "08:50", "Reformer Classic", 6, 6], ["priv", "10:00", "10:55", "sophie", "Studio Kern, Lindengracht 40"], ["group", "18:00", "18:50", "Mat Pilates", 12, 9]], [["group", "09:00", "09:50", "Reformer Flow", 6, 5]], [["group", "08:00", "08:50", "Reformer Classic", 6, 6], ["group", "19:00", "19:50", "Reformer Power", 6, 4]], null, [["group", "12:15", "13:00", "Mat Pilates", 12, 8]], [["group", "09:30", "10:20", "Reformer Classic", 6, 6], ["group", "10:30", "11:20", "Reformer Flow", 6, 6]], []],
      descriptions: {
        "Reformer Classic": { nl: "Pilates op de reformer voor beginners. We leren de basis: ademhaling, core en controle. Maximaal 6 personen, er zijn 6 reformers.", en: "Reformer Pilates for beginners. We learn the basics: breathing, core and control. Up to 6 people, there are 6 reformers." },
        "Reformer Power": { nl: "Voor wie de basis beheerst. Meer tempo, meer veren, meer uitdaging.", en: "For those who know the basics. More tempo, more springs, more challenge." },
        "Reformer Flow": { nl: "Vloeiende reeksen op de reformer, rustig opgebouwd.", en: "Flowing sequences on the reformer, built up calmly." },
        "Mat Pilates": { nl: "Pilates op de mat met kleine materialen. Geen reformer nodig.", en: "Pilates on the mat with small equipment. No reformer needed." }
      }
    },
    yoga: {
      name: "Yoga Huis", term: "docent", loc: "Yoga Huis, Prinsengracht 210", team: true, multiWs: false, types: ["group"],
      trainers: ["Sarah Jansen", "Mila Bos", "Jasper Kok"],
      today: [
        G("y1", "07:00", "08:15", "Vinyasa Flow", 18, 12, { loc: "Yoga Huis, Prinsengracht 210" }),
        G("y2", "12:30", "13:30", "Yin Yoga", 16, 9, { loc: "Yoga Huis, Prinsengracht 210" }),
        G("y3", "18:00", "19:15", "Hatha", 18, 18, { loc: "Yoga Huis, Prinsengracht 210", waitlist: 3 })
      ],
      extra: [
        G("ye1", "09:30", "10:45", "Vinyasa Flow", 18, 15, { loc: "Yoga Huis, Prinsengracht 210", trainer: "Mila Bos" }),
        G("ye2", "19:30", "20:30", "Power Yoga", 16, 10, { loc: "Yoga Huis, Prinsengracht 210", trainer: "Jasper Kok" }),
        G("ye3", "20:45", "21:45", "Yin Yoga", 16, 6, { loc: "Yoga Huis, Prinsengracht 210", trainer: "Mila Bos" })
      ],
      pattern: [[["group", "07:00", "08:15", "Vinyasa Flow", 18, 14], ["group", "18:00", "19:15", "Hatha", 18, 16]], [["group", "12:30", "13:30", "Yin Yoga", 16, 8]], [["group", "07:00", "08:15", "Vinyasa Flow", 18, 18], ["group", "19:30", "20:30", "Power Yoga", 16, 12]], null, [["group", "18:00", "19:15", "Hatha", 18, 13]], [["group", "09:30", "10:45", "Vinyasa Flow", 18, 18]], [["group", "10:00", "11:30", "Workshop Ademwerk", 20, 11]]],
      descriptions: {
        "Vinyasa Flow": { nl: "Dynamische yoga waarin beweging en adem samengaan. Neem je eigen mat mee of huur er een.", en: "Dynamic yoga where movement and breath go together. Bring your own mat or rent one." },
        "Yin Yoga": { nl: "Lang aangehouden houdingen, voor ontspanning en soepelheid.", en: "Long-held poses, for relaxation and flexibility." },
        Hatha: { nl: "Klassieke yoga in een rustig tempo, voor elk niveau.", en: "Classic yoga at a calm pace, for every level." },
        "Power Yoga": { nl: "Stevige, krachtige les. Je gaat zweten.", en: "A strong, powerful class. You will sweat." },
        "Workshop Ademwerk": { nl: "Eenmalige workshop van anderhalf uur over ademhaling.", en: "" }
      }
    },
    small: {
      name: "Fit met Sarah", loc: "Vondelpark (buiten)", team: false, multiWs: false, types: ["group", "priv"],
      trainers: ["Sarah Jansen"],
      today: [
        G("g1", "07:00", "08:00", "Small group kracht", 4, 4, { loc: "Vondelpark (buiten)", attMap: { 0: "yes", 1: "yes", 2: "yes", 3: "yes" } }),
        Pv("g2", "09:00", "10:00", "mark", "Basic-Fit Oost", { workout: "Full body", wstate: "done" }),
        G("g3", "12:00", "13:00", "Small group conditie", 3, 2, { loc: "TrainMore Zuid" }),
        Pv("g4", "17:00", "18:00", "anna", "TrainMore Zuid", { workout: "Upper A" })
      ],
      extra: [],
      pattern: [[["group", "07:00", "08:00", "Small group kracht", 4, 4], ["priv", "18:00", "19:00", "noor", "TrainMore Zuid"]], [["priv", "07:30", "08:30", "daan", "Basic-Fit Oost"]], [["group", "07:00", "08:00", "Small group kracht", 4, 3]], null, [["group", "12:00", "13:00", "Small group conditie", 3, 3]], [["group", "09:00", "10:00", "Bootcamp", 8, 6]], []],
      descriptions: {
        "Small group kracht": { nl: "Krachttraining met maximaal 4 personen, buiten in het park.", en: "Strength training with up to 4 people, outdoors in the park." },
        "Small group conditie": { nl: "Conditietraining met maximaal 3 personen.", en: "" },
        Bootcamp: { nl: "Bootcamp in het park, voor elk niveau.", en: "Park bootcamp, for every level." }
      }
    }
  };

  /* Billing per client (PRODUCT.md §90–§96, terms from packages/i18n/GLOSSARY.md). kind: abo = abonnement (weekly
     allowance of group classes), pack = creditpakket (once, valid until), plan = creditabonnement (credits every cycle).
     credit: groep, prive, gym. For credits: total granted this period, used (sessions given), planned (booked, still to
     come), left = total - used - planned. hist = the balance's history lines. All amounts and dates are fictional. */
  var billing = {
    anna: {
      agreements: [{ id: "a1", end: "continue", kind: "plan", credit: "prive", name: "Privé 4 per 4 weken", price: "€ 240", cycle: "Elke 4 weken", since: "27 aug 2026", period: "22 okt – 18 nov", next: "19 nov", status: "active", total: 5, used: 1, planned: 1,
        hist: [["22 okt", "4 privécredits toegekend", "+4", "Nieuwe periode"], ["22 okt", "1 privécredit meegenomen", "+1", "Uit vorige periode (max. 2)"], ["29 okt", "Gebruikt voor Upper A", "−1", "Sarah"], ["5 nov", "Gepland: privésessie 10:30", "1", "Sarah"]] },
        { id: "a12", end: "stop", endsIn: 57, kind: "pack", credit: "groep", name: "10 groepscredits", price: "€ 150", cycle: "Eenmalig", since: "1 okt 2026", period: "geldig tot 1 jan 2027", status: "active", total: 10, used: 5, planned: 2,
          hist: [["1 okt", "10 groepscredits toegekend", "+10", "Creditpakket gekocht"], ["do 29 okt", "Gebruikt voor Strength", "−1", "Anna boekte"], ["do 22 okt", "Teruggegeven: op tijd afgezegd", "+1", "Annuleringsbeleid"]] }],
      payments: [["22 okt 2026", "Privé 4 per 4 weken", "€ 240,00", "Incasso", "paid", "F-2026-0412"], ["1 okt 2026", "10 groepscredits", "€ 150,00", "iDEAL", "paid", "F-2026-0389"], ["24 sep 2026", "Privé 4 per 4 weken", "€ 240,00", "Incasso", "paid", "F-2026-0377"], ["27 aug 2026", "Privé 4 per 4 weken, eerste betaling", "€ 240,00", "iDEAL", "paid", "F-2026-0311"]]
    },
    mark: {
      agreements: [{ id: "a2", end: "stop", endsIn: 26, remindSent: "1 nov", kind: "pack", credit: "prive", name: "10 privésessies", price: "€ 550", cycle: "Eenmalig", since: "1 sep 2026", period: "geldig tot 1 dec 2026", status: "active", total: 10, used: 6, planned: 1,
        hist: [["1 sep", "10 privécredits toegekend", "+10", "Creditpakket gekocht"], ["5 nov", "Gebruikt voor Full body", "−1", "Sarah"], ["ma 9 nov", "Gepland: privésessie 07:00", "1", "Sarah"]] }],
      payments: [["1 sep 2026", "10 privésessies", "€ 550,00", "iDEAL", "paid", "F-2026-0318"]]
    },
    lisa: {
      agreements: [
        { id: "a3", end: "stop", endsIn: 115, kind: "abo", name: "Groep 2× per week", price: "€ 69", cycle: "Elke maand", since: "1 mrt 2026", period: "tot 28 feb 2027", next: "1 dec", status: "open", open: "€ 69,00", perWeek: 2, usedWeek: 1, makeups: 1,
          hist: [["ma 2 nov", "Week begonnen: 2 lessen", "+2", "Abonnement"], ["di 3 nov", "Gebruikt voor Kracht", "−1", "Lisa boekte"], ["okt", "Inhaalles na tijdig afzeggen", "+1", "Annuleringsbeleid"]] },
        { id: "a4", end: "stop", endsIn: 40, remindSent: "4 nov", kind: "pack", credit: "prive", name: "5 privésessies", price: "€ 300", cycle: "Eenmalig", since: "15 sep 2026", period: "geldig tot 15 dec 2026", status: "active", total: 5, used: 4, planned: 1,
          hist: [["15 sep", "5 privécredits toegekend", "+5", "Creditpakket gekocht"], ["5 nov", "Gepland: privésessie 16:30", "1", "Sarah"]] }
      ],
      payments: [["1 nov 2026", "Groep 2× per week", "€ 69,00", "Incasso", "failed", ""], ["1 okt 2026", "Groep 2× per week", "€ 69,00", "Incasso", "paid", "F-2026-0398"], ["15 sep 2026", "5 privésessies", "€ 300,00", "iDEAL", "paid", "F-2026-0352"]]
    },
    daan: { agreements: [{ id: "a5", end: "continue", kind: "abo", name: "Groep 3× per week", price: "€ 89", cycle: "Elke maand", since: "1 jun 2026", period: "loopt door", next: "1 dec", status: "active", perWeek: 3, usedWeek: 2, makeups: 0, hist: [["ma 2 nov", "Week begonnen: 3 lessen", "+3", "Abonnement"], ["ma 2 nov", "Gebruikt voor Kracht", "−1", "Daan boekte"], ["do 5 nov", "Gebruikt voor Strength", "−1", "Daan boekte"]] }],
      payments: [["1 nov 2026", "Groep 3× per week", "€ 89,00", "Incasso", "paid", "F-2026-0421"], ["1 okt 2026", "Groep 3× per week", "€ 89,00", "Incasso", "paid", "F-2026-0399"]] },
    noor: { agreements: [{ id: "a6", end: "stop", endsIn: 40, remindSent: "3 nov", kind: "pack", credit: "groep", name: "10 groepscredits", price: "€ 150", cycle: "Eenmalig", since: "15 sep 2026", period: "geldig tot 15 dec 2026", status: "active", total: 10, used: 8, planned: 0, hist: [["15 sep", "10 groepscredits toegekend", "+10", "Creditpakket gekocht"], ["do 5 nov", "Gebruikt voor Strength", "−1", "Noor boekte"]] }],
      payments: [["15 sep 2026", "10 groepscredits", "€ 150,00", "iDEAL", "paid", "F-2026-0350"]] },
    bram: { agreements: [{ id: "a7", end: "stop", endsIn: 25, remindSent: "31 okt", kind: "abo", name: "Groep 1× per week", price: "€ 39", cycle: "Elke maand", since: "1 mei 2026", period: "stopt 30 nov 2026", next: "—", status: "ending", perWeek: 1, usedWeek: 1, makeups: 0, hist: [["ma 2 nov", "Week begonnen: 1 les", "+1", "Abonnement"], ["do 5 nov", "Gebruikt voor Strength", "−1", "Bram boekte"]] }],
      payments: [["1 nov 2026", "Groep 1× per week", "€ 39,00", "Incasso", "paid", "F-2026-0420"]] },
    fleur: { agreements: [{ id: "a8", end: "stop", endsIn: 57, kind: "pack", credit: "groep", name: "5 groepscredits", price: "€ 40", cycle: "Eenmalig", since: "1 okt 2026", period: "geldig tot 1 jan 2027", status: "active", total: 5, used: 2, planned: 0, hist: [["1 okt", "5 groepscredits toegekend", "+5", "Creditpakket gekocht"]] }],
      payments: [["1 okt 2026", "5 groepscredits", "€ 40,00", "iDEAL", "refund", "F-2026-0391 · creditfactuur F-2026-0402"]] },
    thomas: { agreements: [{ id: "a9", end: "stop", endsIn: -1, kind: "pack", credit: "groep", name: "Proefles", price: "€ 0", cycle: "Eenmalig", since: "28 okt 2026", period: "verlopen 4 nov 2026", status: "expired", total: 1, used: 1, planned: 0, hist: [["28 okt", "1 groepscredit toegekend", "+1", "Proefaanbod, 1× per klant"], ["30 okt", "Gebruikt voor Strength", "−1", "Thomas boekte"]] }], payments: [] },
    eva: { agreements: [
      { id: "a10", end: "continue", kind: "abo", name: "Groep 2× per week", price: "€ 69", cycle: "Elke maand", since: "1 feb 2026", period: "loopt door", next: "1 dec", status: "active", perWeek: 2, usedWeek: 0, makeups: 0, hist: [["ma 2 nov", "Week begonnen: 2 lessen", "+2", "Abonnement"]] },
      { id: "a11", end: "continue", kind: "plan", credit: "prive", name: "Privé 2 per maand", price: "€ 125", cycle: "Elke maand", since: "1 feb 2026", period: "1 nov – 30 nov", next: "1 dec", status: "active", total: 2, used: 0, planned: 0, hist: [["1 nov", "2 privécredits toegekend", "+2", "Nieuwe periode"]] }],
      payments: [["1 nov 2026", "Groep 2× per week + Privé 2 per maand", "€ 194,00", "Incasso", "paid", "F-2026-0419"]] },
    sophie: { agreements: [], payments: [] }
  };

  var CREDIT = { groep: ["groepscredit", "groepscredits", "var(--group)"], prive: ["privécredit", "privécredits", "var(--priv)"], gym: ["Open Gym-credit", "Open Gym-credits", "var(--gym)"] };
  var KIND = { abo: "Abonnement", pack: "Creditpakket", plan: "Creditabonnement" };
  /* Renewal: Fivvi suggests sending a new offer from this many days before an agreement that stops ends
     (owner, 5 Nov 2026: "from 1 month before ending"; proposed as a workspace setting), or when a credit pack runs low. */
  var RENEW_DAYS = 30;
  /* what the owner sees about the client's two reminders: the first at the start of the window, the last by 7 days before the end. The sample's today is 5 Nov 2026 */
  var LAST_REMIND = 7, MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  function remindLine(a) {
    if (!a.remindSent) return "";
    var usedUp = a.kind === "pack" && a.total != null && a.total - a.used - a.planned <= 0;
    if (a.endsIn <= LAST_REMIND || usedUp) return "Laatste herinnering verstuurd";
    var d = new Date(2026, 10, 5 + a.endsIn - LAST_REMIND);
    return "Herinnering verstuurd " + a.remindSent + " · laatste uiterlijk " + d.getDate() + " " + MONTHS[d.getMonth()];
  }
  /* What the workspace sells (PRODUCT §90): four kinds, each with its own fields. "on" = clients can buy it. The three
     default plans a new workspace starts with stay off until the owner adds a price. renew = days before the end that
     Fivvi suggests renewing (per offer, owner 5 Nov 2026); packs are also suggested at 2 or fewer credits left. */
  var offerList = [
    { id: "o1", kind: "abo", name: "Groep 1× per week", price: "39", vat: "9", cycle: "Elke maand", perWeek: 1, term: "6 maanden", end: "stop", renew: 30, on: true, active: 9 },
    { id: "o2", kind: "abo", name: "Groep 2× per week", price: "69", vat: "9", cycle: "Elke maand", perWeek: 2, term: "6 maanden", end: "stop", renew: 30, on: true, active: 21 },
    { id: "o3", kind: "abo", name: "Groep 3× per week", price: "89", vat: "9", cycle: "Elke maand", perWeek: 3, term: "12 maanden", end: "continue", renew: 30, on: true, active: 7 },
    { id: "o4", kind: "pack", credit: "groep", name: "10 groepscredits", price: "150", vat: "9", cycle: "Eenmalig", credits: 10, valid: "3 maanden", end: "stop", renew: 30, on: true, active: 6 },
    { id: "o5", kind: "pack", credit: "groep", name: "Proefles", price: "0", vat: "9", cycle: "Eenmalig", credits: 1, valid: "1 week", end: "stop", renew: 0, intro: true, on: true, active: 1 },
    { id: "o6", kind: "pack", credit: "prive", name: "5 privésessies", price: "300", vat: "21", cycle: "Eenmalig", credits: 5, valid: "3 maanden", end: "stop", renew: 30, on: true, active: 3 },
    { id: "o7", kind: "pack", credit: "prive", name: "10 privésessies", price: "550", vat: "21", cycle: "Eenmalig", credits: 10, valid: "6 maanden", end: "stop", renew: 30, on: true, active: 4 },
    { id: "o8", kind: "plan", credit: "prive", name: "Privé 4 per 4 weken", price: "240", vat: "21", cycle: "Elke 4 weken", credits: 4, carry: 2, minTerm: "3 maanden", end: "continue", renew: 30, on: true, active: 2 },
    { id: "o9", kind: "plan", credit: "prive", name: "Privé 2 per maand", price: "125", vat: "21", cycle: "Elke maand", credits: 2, carry: 0, minTerm: "3 maanden", end: "continue", renew: 30, on: true, active: 1 },
    { id: "o10", kind: "pack", credit: "groep", name: "5 groepscredits", price: "40", vat: "9", cycle: "Eenmalig", credits: 5, valid: "3 maanden", end: "stop", renew: 30, memberOnly: true, on: true, active: 2 },
    { id: "o11", kind: "single", credit: "groep", name: "Losse les", price: "17,50", vat: "9", cycle: "Bij het boeken", on: false, active: 0 },
    { id: "d1", kind: "abo", name: "Abonnement", price: "", vat: "9", cycle: "Elke maand", perWeek: 2, term: "6 maanden", end: "stop", renew: 30, makeups: 2, on: false, def: true, active: 0 },
    { id: "d2", kind: "pack", credit: "groep", name: "Groepscreditpakket", price: "", vat: "9", cycle: "Eenmalig", credits: 10, valid: "3 maanden", end: "stop", renew: 30, on: false, def: true, active: 0 },
    { id: "d3", kind: "plan", credit: "prive", name: "Privé creditabonnement", price: "", vat: "21", cycle: "Elke maand", credits: 4, carry: 0, minTerm: "3 maanden", end: "continue", renew: 30, on: false, def: true, active: 0 }
  ];
  function offerNames() { return offerList.filter(function (o) { return o.on; }).map(function (o) { return o.name; }); }
  /* One summary per client: balances per credit kind, abonnementen, the open amount and what needs attention. */
  function bsum(id) {
    var b = billing[id] || { agreements: [], payments: [] }, bal = {}, abos = [], flags = [], active = 0;
    b.agreements.forEach(function (a) {
      if (a.status !== "expired") active++;
      if (a.kind === "abo") { if (a.status !== "expired") abos.push(a); }
      else if (a.status !== "expired") { var x = bal[a.credit] || (bal[a.credit] = { credit: a.credit, total: 0, used: 0, planned: 0 }); x.total += a.total; x.used += a.used; x.planned += a.planned; }
      if (a.status === "open") flags.push(["danger", "Openstaande betaling " + a.open, a.name]);
      if (a.status === "ending") flags.push(["warn", "Abonnement stopt " + a.period.replace("stopt ", ""), a.name]);
    });
    var balances = Object.keys(bal).map(function (k) { var x = bal[k]; x.left = x.total - x.used - x.planned; x.label = CREDIT[k]; return x; });
    /* running out: per agreement, since a creditabonnement refills each period and a creditpakket does not */
    b.agreements.forEach(function (a) {
      if (a.kind === "abo" || a.status === "expired") return;
      var lab = CREDIT[a.credit], left = a.total - a.used - a.planned;
      if (left <= 0 && a.planned > 0) flags.push(["warn", "Na de geplande sessie geen " + lab[1] + " meer", a.name]);
      else if (left <= 0) flags.push(["warn", "Geen " + lab[1] + " meer", a.name]);
      else if (a.kind === "pack" && left <= 2) flags.push(["warn", "Nog " + left + " " + (left === 1 ? lab[0] : lab[1]), a.name]);
    });
    if (!active) flags.push(["none", b.agreements.length ? "Geen actief aanbod" : "Geen abonnement of credits", ""]);
    /* what to renew: an agreement that stops within the window, a credit pack running low, or one that has ended.
       An agreement that continues per cycle, and a credit plan that refills, need nothing. */
    var renew = [];
    b.agreements.forEach(function (a) {
      if (a.end === "continue") return;
      var left = a.kind === "abo" ? null : a.total - a.used - a.planned;
      if (a.status === "expired" || a.endsIn < 0) renew.push([a, "Afgelopen"]);
      else if (a.kind === "pack" && left <= 0) renew.push([a, a.planned ? "Op na de geplande sessie" : "Op"]);
      else if (a.endsIn <= RENEW_DAYS) renew.push([a, (a.kind === "abo" ? "Stopt over " : "Nog " + left + " over, geldig nog ") + a.endsIn + " dagen"]);
      else if (a.kind === "pack" && left <= 2) renew.push([a, "Nog " + left + " over"]);
    });
    var short = abos.map(function (a) { return a.name; }).concat(balances.map(function (x) { return x.left + " " + (x.left === 1 ? x.label[0] : x.label[1]); }));
    return { b: b, balances: balances, abos: abos, flags: flags, renew: renew, short: short, open: b.agreements.filter(function (a) { return a.status === "open"; }) };
  }

  /* What a workspace calls its trainers (owner decision, 5 Nov 2026): one word, used everywhere in that workspace */
  var TERMS = { trainer: { nl: ["trainer", "trainers"], en: ["trainer", "trainers"] }, instructeur: { nl: ["instructeur", "instructeurs"], en: ["instructor", "instructors"] },
    docent: { nl: ["docent", "docenten"], en: ["teacher", "teachers"] }, coach: { nl: ["coach", "coaches"], en: ["coach", "coaches"] } };
  /* Open Gym comes later (owner, 6 Nov 2026; PRODUCT §53): the sample has none, and the code stays for when it comes */
  function noGym(l) { return l.filter(function (x) { return (x.type || x[0]) !== "gym"; }); }
  today = noGym(today); pattern = pattern.map(function (d) { return d && noGym(d); });
  return { RENEW_DAYS: RENEW_DAYS, remindLine: remindLine, offerList: offerList, offerNames: offerNames, TERMS: TERMS, LEVELS: LEVELS, levels: levels, lifts: lifts, weeks: weeks, DIFF: DIFF, spark: spark, bsum: bsum, CREDIT: CREDIT, KIND: KIND, billing: billing, setups: setups, me: me, workspaces: workspaces, locations: locations, trainers: trainers, clients: clients, notes: notes, history: history, selfLog: selfLog,
    progress: progress, tpl: tpl, descriptions: descriptions, today: today, pattern: pattern, templates: templates, library: library, upperA: upperA };
})();
