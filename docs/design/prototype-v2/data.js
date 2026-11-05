/* Fictional data only (AGENTS.md: no real data). "Now" is Thursday 5 November 2026, 10:05, Europe/Amsterdam. */
window.FIVVI_DATA = (function () {
  var me = { name: "Sarah Jansen", first: "Sarah", email: "sarah@example.com", lang: "nl" };
  var workspaces = {
    sf: { id: "sf", name: "Studio Fit", role: "owner", color: "var(--ws-sf)", location: "Studio Fit, Kerkstraat 12" },
    jg: { id: "jg", name: "John's Gym", role: "trainer", color: "var(--ws-jg)", location: "John's Gym, Havenweg 3" }
  };
  var locations = ["Studio Fit, Kerkstraat 12", "TrainMore Zuid", "Basic-Fit Oost", "Vondelpark (buiten)"];
  var trainers = { sf: ["Sarah Jansen", "Mike de Boer", "Yara Koster"], jg: ["John Peters", "Mike de Boer", "Sarah Jansen"] };

  var clients = [
    { id: "anna", ws: "sf", name: "Anna de Vries", email: "anna@example.com", lang: "Nederlands", last: "29 okt", c: "var(--priv)" },
    { id: "mark", ws: "sf", name: "Mark Visser", email: "mark@example.com", lang: "Nederlands", last: "vandaag", c: "#34C759" },
    { id: "lisa", ws: "sf", name: "Lisa Bakker", email: "", lang: "English", last: "3 nov", c: "#FF8D28" },
    { id: "daan", ws: "sf", name: "Daan Smit", email: "daan@example.com", lang: "Nederlands", last: "2 nov", c: "#6155F5" },
    { id: "noor", ws: "sf", name: "Noor el Amrani", email: "noor@example.com", lang: "Nederlands", last: "30 okt", c: "#CB30E0" },
    { id: "sophie", ws: "sf", name: "Sophie Mulder", email: "sophie@example.com", lang: "English", last: "28 okt", c: "#00C3D0" },
    { id: "bram", ws: "sf", name: "Bram Hendriks", email: "bram@example.com", lang: "Nederlands", last: "27 okt", c: "#AC7F5E" },
    { id: "fleur", ws: "sf", name: "Fleur de Jong", email: "fleur@example.com", lang: "Nederlands", last: "21 okt", c: "#FF2D55" },
    { id: "thomas", ws: "sf", name: "Thomas Peters", email: "", lang: "Nederlands", last: "Nog geen sessie", c: "#8E8E93" },
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
  var history = {
    anna: [
      { name: "Upper A", d: "do 29 okt", n: 5, by: "Sarah", sets: [["Bankdrukken", "60 kg × 8, 8, 7"], ["Kabel roeien", "45 kg × 10, 10, 10"], ["Dumbbell schouderdrukken", "14 kg × 10, 10"]] },
      { name: "Lower A", d: "do 22 okt", n: 4, by: "Sarah" },
      { name: "Training zonder schema", d: "do 15 okt", n: 3, by: "Sarah" },
      { name: "Upper A", d: "do 8 okt", n: 5, by: "Mike" }
    ],
    mark: [{ name: "Full body", d: "ma 2 nov", n: 6, by: "Sarah" }, { name: "Full body", d: "do 29 okt", n: 6, by: "Sarah" }]
  };
  /* Bench press heaviest set per week for Anna, for the Health-style chart. */
  var progress = { anna: [52.5, 52.5, 55, 55, 57.5, 57.5, 60, 60] };

  /* Today, explicit. Times are local. */
  var today = [
    { id: "s1", ws: "sf", type: "priv", s: "07:00", e: "08:00", client: "mark", loc: "Basic-Fit Oost", att: null, workout: "Full body", wstate: "done", shared: true },
    { id: "s2", ws: "sf", type: "group", s: "08:30", e: "09:30", title: "Strength", loc: "Studio Fit, Kerkstraat 12", cap: 8, people: ["daan", "noor", "sophie", "bram", "fleur", "eva", "thomas", "lisa"], att: null, attMap: { 0: "yes", 1: "yes", 2: "yes", 3: "no", 4: "yes", 5: "yes", 6: "yes", 7: "yes" } },
    { id: "s3", ws: "sf", type: "priv", s: "10:30", e: "11:30", client: "anna", loc: "TrainMore Zuid", att: null, workout: "Upper A" },
    { id: "s4", ws: "sf", type: "gym", s: "12:00", e: "14:00", title: "Open Gym", loc: "Studio Fit, Kerkstraat 12", cap: 10, people: ["daan", "eva", "bram"] },
    { id: "s5", ws: "jg", type: "group", s: "15:00", e: "16:00", title: "Strength", loc: "John's Gym, Havenweg 3", cap: 8, people: ["chris", "iris", "jesse", "chris", "iris", "jesse", "chris"].map(function (x, i) { return i < 3 ? x : "guest" + i; }), sub: "Mike" },
    { id: "s6", ws: "sf", type: "priv", s: "16:30", e: "17:30", client: "lisa", loc: "Vondelpark (buiten)", att: null },
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
    { n: "Roeien", en: "Rowing", ty: "dt", mu: "conditie" }
  ];

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

  return { me: me, workspaces: workspaces, locations: locations, trainers: trainers, clients: clients, notes: notes, history: history,
    progress: progress, descriptions: descriptions, today: today, pattern: pattern, templates: templates, library: library, upperA: upperA };
})();
