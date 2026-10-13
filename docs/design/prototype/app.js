/*
 * Trainer Hub, M0 clickable prototype. Static, no build, no dependencies.
 * All data is fake and lives in memory. Copy comes from strings.js (prototype-only).
 */
(function () {
  "use strict";

  const STR = window.PROTO_STRINGS;
  const TZ = "Europe/Amsterdam";
  const TODAY = "2026-09-22"; // a Tuesday
  const NOW = at(TODAY, "08:40");
  const HOLD_MS = 15 * 60 * 1000;

  // Amsterdam is on CEST (+02:00) for every demo date (DST ends 25 October 2026).
  function at(date, hhmm) {
    return new Date(`${date}T${hhmm}:00+02:00`);
  }

  // ---------------------------------------------------------------- storage (per-viewer prefs only)
  const prefs = {
    get(key) {
      try { return localStorage.getItem("th-proto-" + key); } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem("th-proto-" + key, value); } catch (e) { /* private mode */ }
    },
  };

  // ---------------------------------------------------------------- reference data
  const WS = {
    jg: { name: "John's Gym", kind: "gym", loc: "jg" },
    spt: { name: "Sarah Personal Training", kind: "independent" },
    fs: { name: "Fit Studio", kind: "gym", loc: "fs" },
  };
  const LOCS = {
    jg: { name: "John's Gym" },
    tmz: { name: "TrainMore Zuid" },
    bfo: { name: "Basic-Fit Oost" },
    fs: { name: "Fit Studio" },
    vondelpark: { name: "Vondelpark" },
    "home-lisa": { key: "loc.homeOf", vars: { name: "Lisa" } },
    "home-mark": { key: "loc.homeOf", vars: { name: "Mark" } },
  };
  // Locations an independent workspace uses; a gym workspace always uses its own location.
  const WS_LOCS = { spt: ["tmz", "bfo", "vondelpark"] };
  const TRAINERS = {
    john: { name: "John" },
    sarah: { name: "Sarah" },
    mike: { name: "Mike" },
    nadia: { name: "Nadia" },
  };
  const GYM_TRAINERS = ["john", "sarah", "mike", "nadia"];
  // Who holds the phone. The role per workspace decides what "+" may create (information-architecture.md §3.1).
  const PERSONAS = {
    sarah: { roles: { spt: "owner", jg: "trainer", fs: "trainer" } },
    john: { roles: { jg: "owner" } },
  };
  // Seed clients. Clients added during the demo are marked `created`; "Demo opnieuw beginnen" removes them.
  const CLIENTS = {
    anna: { name: "Anna de Vries", first: "Anna", ws: "spt", pref: "tmz", lang: "nl", email: "anna@example.com" },
    mark: { name: "Mark Peters", first: "Mark", ws: "spt", history: ["bfo", "tmz"], lang: "en", email: "mark@example.com" },
    koen: { name: "Koen Meijer", first: "Koen", ws: "jg", lang: "nl", email: "koen@example.com" },
    lisa: { name: "Lisa Smit", first: "Lisa", ws: "spt", pref: "home-lisa", lang: "nl" },
    priya: { name: "Priya Sharma", first: "Priya", ws: "jg", lang: "en", email: "priya@example.com" },
    sanne: { name: "Sanne de Boer", first: "Sanne", ws: "jg", lang: "nl", email: "sanne@example.com" },
    daan: { name: "Daan Mulder", first: "Daan", ws: "jg", lang: "nl" },
  };
  // Trainer-written content: stored and shown exactly as entered, never translated (PRODUCT.md §3, §35).
  const CLIENT_NOTES = {
    mark: "Houdt van techno.\nLiever geen Bulgarian split squats.\nTraint het liefst 's ochtends.",
    anna: "Knie rechts soms gevoelig bij diepe squats.",
    koen: "Wil in december een 10 km lopen.",
  };
  const LAST_NOTE = {
    mark: { date: "2026-09-15", text: "Laatste set bankdrukken was zwaar.\nVolgende keer zelfde gewicht houden." },
  };
  // Exercise library (PRODUCT.md §38): Dutch and English names, extra search aliases, weight step in kg.
  const EXERCISES = {
    bench: { nl: "Bankdrukken", en: "Bench press", step: 2.5 },
    incline: { nl: "Schuine bankdrukken met dumbbells", en: "Incline dumbbell press", step: 2 },
    row: { nl: "Kabelroeien", en: "Seated cable row", step: 2.5 },
    ohp: { nl: "Schouderdrukken met dumbbells", en: "Dumbbell shoulder press", step: 2 },
    lat: { nl: "Lat pulldown", en: "Lat pulldown", step: 2.5 },
    squat: { nl: "Squat", en: "Back squat", step: 2.5, aliases: ["kniebuiging"] },
    goblet: { nl: "Goblet squat", en: "Goblet squat", step: 2 },
    rdl: { nl: "Roemeense deadlift", en: "Romanian deadlift", step: 2.5, aliases: ["RDL"] },
    legpress: { nl: "Beenpers", en: "Leg press", step: 5 },
    lunge: { nl: "Lunges met dumbbells", en: "Dumbbell lunges", step: 2 },
    kbswing: { nl: "Kettlebell swing", en: "Kettlebell swing", step: 4 },
    facepull: { nl: "Face pull", en: "Face pull", step: 2.5 },
  };
  // Workout templates (PRODUCT.md §39): [exercise, target sets, target reps].
  const TEMPLATE_SEED = {
    "upper-a": { name: "Upper A", items: [["bench", 3, 8], ["row", 3, 10], ["ohp", 3, 10]] },
    "lower-a": { name: "Lower A", items: [["squat", 3, 6], ["rdl", 3, 8], ["legpress", 3, 10]] },
    "full-body": { name: "Full body", items: [["goblet", 3, 10], ["row", 3, 10], ["lunge", 3, 10], ["kbswing", 3, 15]] },
  };
  // Templates used with a client before, most recent first (F042).
  const ASSIGNED_SEED = { mark: ["upper-a", "lower-a"], anna: ["lower-a", "upper-a"], koen: ["full-body"] };
  // Logged workouts per client, newest first (PRODUCT.md §42). `name: null` = logged without a template.
  const HISTORY_SEED = {
    mark: [
      { date: "2026-09-18", trainer: "sarah", name: "Lower A", items: [["squat", [[80, 6], [80, 6], [80, 5]]], ["rdl", [[70, 8], [70, 8], [70, 8]]], ["legpress", [[140, 10], [140, 10], [140, 9]]]] },
      { date: "2026-09-15", trainer: "sarah", name: "Upper A", items: [["bench", [[60, 8], [60, 8], [60, 7]]], ["row", [[45, 10], [45, 10], [45, 10]]], ["ohp", [[16, 10], [16, 10], [16, 9]]]] },
    ],
    anna: [
      { date: "2026-09-15", trainer: "sarah", name: "Lower A", items: [["squat", [[40, 6], [40, 6], [40, 6]]], ["rdl", [[35, 8], [35, 8], [35, 8]]], ["legpress", [[80, 10], [80, 10], [80, 10]]]] },
    ],
    koen: [
      { date: "2026-09-17", trainer: "sarah", name: null, items: [["goblet", [[20, 12], [20, 12], [24, 10]]], ["lat", [[40, 12], [40, 12], [45, 10]]], ["kbswing", [[16, 15], [16, 15], [16, 15]]]] },
    ],
    priya: [
      { date: "2026-09-19", trainer: "john", name: null, items: [["squat", [[50, 8], [50, 8], [55, 6]]], ["bench", [[35, 10], [35, 10], [35, 8]]]] },
    ],
  };
  const PEOPLE = [
    ["Jeroen Bakker", "nl", false], ["Fatima el Amrani", "nl", true], ["Lotte Visser", "nl", false],
    ["Koen Meijer", "nl", false], ["Emma de Jong", "nl", true], ["Tom Jansen", "nl", false],
    ["Priya Sharma", "en", false], ["Daan Mulder", "nl", false], ["Liam O'Brien", "en", true],
    ["Sophie Meijer", "nl", false], ["Noah Smit", "nl", true], ["Julia Bos", "nl", false],
  ];

  function fresh() {
    const priv = (id, client, trainer, ws, loc, date, start, end, extra = {}) =>
      ({ id, kind: "private", client, trainer, ws, loc, date, start, end, status: "booked", workout: "", ...extra });
    const cls = (id, kind, title, ws, date, start, end, cap, trainer, booked, extra = {}) => ({
      id, kind, title, ws, loc: WS[ws].loc, date, start, end, cap, trainer, origTrainer: null, status: "scheduled",
      attendees: Array.from({ length: booked }, (_, i) => PEOPLE[(id.length * 3 + i) % PEOPLE.length]).map((p, i) =>
        ({ id: `${id}-a${i}`, name: p[0], lang: p[1], guest: p[2], status: "booked" })),
      ...extra,
    });
    const s = {
      sessions: [
        priv("p-anna", "anna", "sarah", "spt", "tmz", TODAY, "07:00", "08:00", { status: "attended", workout: "lower-a" }),
        priv("p-mark", "mark", "sarah", "spt", "bfo", TODAY, "09:00", "10:00", { workout: "upper-a" }),
        priv("p-koen", "koen", "sarah", "jg", "jg", TODAY, "15:00", "16:00"),
        priv("p-priya", "priya", "john", "jg", "jg", TODAY, "09:00", "10:00"),
        priv("p-sanne", "sanne", "mike", "jg", "jg", TODAY, "11:00", "12:00"),
        priv("p-daan", "daan", "john", "jg", "jg", TODAY, "18:00", "19:00"),
        priv("p-sanne21", "sanne", "mike", "jg", "jg", "2026-09-21", "11:00", "12:00"),
        priv("p-priya24", "priya", "john", "jg", "jg", "2026-09-24", "09:00", "10:00"),
        priv("p-koen24", "koen", "sarah", "jg", "jg", "2026-09-24", "15:00", "16:00"),
        priv("p-daan25", "daan", "john", "jg", "jg", "2026-09-25", "17:00", "18:00"),
      ],
      classes: [
        cls("o-boot21", "group", "Bootcamp", "jg", "2026-09-21", "07:00", "08:00", 12, "mike", 11),
        cls("o-mob21", "group", "Mobility", "jg", "2026-09-21", "19:15", "20:15", 10, "mike", 6),
        cls("o-og22", "openGym", "Open Gym", "jg", TODAY, "12:00", "13:00", 2, null, 1),
        cls("o-str22", "group", "Strength", "jg", TODAY, "18:00", "19:00", 10, "sarah", 0, {
          attendees: PEOPLE.slice(0, 7).map((p, i) => ({ id: `str-a${i}`, name: p[0], lang: p[1], guest: p[2], status: "booked" })),
        }),
        cls("o-mob22", "group", "Mobility", "jg", TODAY, "19:15", "20:15", 10, "mike", 4),
        cls("o-core22", "group", "Core & Mobility", "fs", TODAY, "19:30", "20:15", 12, "sarah", 9),
        cls("o-boot23", "group", "Bootcamp", "jg", "2026-09-23", "07:00", "08:00", 12, "mike", 12),
        cls("o-kb23", "group", "Kettlebell", "jg", "2026-09-23", "19:00", "20:00", 8, "john", 6),
        cls("o-boot24", "group", "Bootcamp", "jg", "2026-09-24", "07:00", "08:00", 12, null, 5),
        cls("o-str24", "group", "Strength", "jg", "2026-09-24", "19:00", "20:00", 10, "sarah", 5),
        cls("o-str29", "group", "Strength", "jg", "2026-09-29", "18:00", "19:00", 10, "sarah", 4),
        cls("o-str01", "group", "Strength", "jg", "2026-10-01", "19:00", "20:00", 10, "sarah", 5),
        cls("o-og25", "openGym", "Open Gym", "jg", "2026-09-25", "10:00", "11:00", 2, null, 1),
        cls("o-og26", "openGym", "Open Gym", "jg", "2026-09-26", "09:00", "10:30", 2, null, 0),
      ],
      agenda: { date: TODAY, view: "week" },
      templates: JSON.parse(JSON.stringify(TEMPLATE_SEED)),
      assigned: JSON.parse(JSON.stringify(ASSIGNED_SEED)),
      history: JSON.parse(JSON.stringify(HISTORY_SEED)),
      customEx: {},
      booking: { mode: "group", occ: null, name: "", email: "", errors: {}, holdAt: null, attId: null, confirmCancel: false },
      np: null,
      mv: null,
      log: null,
      completedWorkouts: {},
      previewLang: null,
      newOcc: null,
      cn: null,
      web: { view: "day", date: TODAY, ws: "jg", flow: 3, panel: null, panelMode: null, drawer: false, trainer: "", slot: null },
      sheet: null,
    };
    // Four more weeks of the weekly timetable and regular clients, so clients and trainers can look ahead.
    const WEEKLY = [
      [0, "group", "Bootcamp", "jg", "07:00", "08:00", 12, "mike"], [0, "group", "Mobility", "jg", "19:15", "20:15", 10, "mike"],
      [1, "openGym", "Open Gym", "jg", "12:00", "13:00", 2, null], [1, "group", "Strength", "jg", "18:00", "19:00", 10, "sarah"],
      [1, "group", "Mobility", "jg", "19:15", "20:15", 10, "mike"], [1, "group", "Core & Mobility", "fs", "19:30", "20:15", 12, "sarah"],
      [2, "group", "Bootcamp", "jg", "07:00", "08:00", 12, "mike"], [2, "group", "Kettlebell", "jg", "19:00", "20:00", 8, "john"],
      [3, "group", "Bootcamp", "jg", "07:00", "08:00", 12, "mike"], [3, "group", "Strength", "jg", "19:00", "20:00", 10, "sarah"],
      [4, "openGym", "Open Gym", "jg", "10:00", "11:00", 2, null], [5, "openGym", "Open Gym", "jg", "09:00", "10:30", 2, null],
    ];
    const REGULARS = [
      [0, "sanne", "mike", "jg", "jg", "11:00", "12:00"], [1, "mark", "sarah", "spt", "bfo", "09:00", "10:00"],
      [1, "anna", "sarah", "spt", "tmz", "07:00", "08:00"], [1, "priya", "john", "jg", "jg", "09:00", "10:00"],
      [2, "lisa", "sarah", "spt", "home-lisa", "11:00", "12:00"], [3, "koen", "sarah", "jg", "jg", "15:00", "16:00"],
      [3, "priya", "john", "jg", "jg", "09:00", "10:00"], [4, "daan", "john", "jg", "jg", "17:00", "18:00"],
    ];
    for (let w = 0; w < 5; w++) {
      const monday = addDays(mondayOf(TODAY), w * 7);
      WEEKLY.forEach(([wd, kind, title, ws, start, end, cap, trainer]) => {
        const date = addDays(monday, wd);
        if (date < TODAY || s.classes.some((c) => c.ws === ws && c.title === title && c.date === date)) return;
        const booked = Math.max(0, Math.min(cap - 1, cap - 2 - w * 2 - (title.length % 3)));
        s.classes.push(cls(`g-${ws}-${title.replace(/\W+/g, "")}-${date}`, kind, title, ws, date, start, end, cap, trainer, booked));
      });
      REGULARS.forEach(([wd, client, trainer, ws, loc, start, end]) => {
        const date = addDays(monday, wd);
        if (date < TODAY || s.sessions.some((x) => x.client === client && x.date === date)) return;
        s.sessions.push(priv(`g-${client}-${date}`, client, trainer, ws, loc, date, start, end));
      });
    }
    return s;
  }

  const state = Object.assign(fresh(), {
    lang: prefs.get("lang") === "en" ? "en" : "nl",
    me: prefs.get("me") === "john" ? "john" : "sarah",
    platform: prefs.get("platform") || detectPlatform(),
    theme: "light", // Explicit comfort default, independent of OS; never persisted.
    stack: [{ s: "hub" }],
  });

  function detectPlatform() {
    return /Android/i.test(navigator.userAgent || "") ? "android" : "ios";
  }

  // ---------------------------------------------------------------- i18n + formatting
  const activeLang = () => ["l-email", "l-profile"].includes(current().s) ? state.previewLang || state.lang : state.lang;
  function t(key, vars = {}) {
    const table = STR[activeLang()] || STR.nl;
    let k = key;
    if (typeof vars.n === "number") {
      const form = key + (vars.n === 1 ? "_one" : "_other");
      if (form in table) k = form;
    }
    const s = table[k] ?? STR.nl[k] ?? key;
    return s.replace(/\{(\w+)\}/g, (m, v) => (v in vars ? vars[v] : m));
  }
  const locale = () => (activeLang() === "nl" ? "nl-NL" : "en-GB");
  const fmt = (d, o) => new Intl.DateTimeFormat(locale(), { timeZone: TZ, ...o }).format(d);
  const time = (d) => fmt(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dayLong = (d) => fmt(d, { weekday: "long", day: "numeric", month: "long" });
  const dayShort = (d) => fmt(d, { weekday: "short", day: "numeric" });
  const dayMonth = (d) => fmt(d, { day: "numeric", month: "long" });
  const weekRange = (mon) => new Intl.DateTimeFormat(locale(), { timeZone: TZ, day: "numeric", month: "long" })
    .formatRange(at(mon, "12:00"), at(addDays(mon, 6), "12:00"));
  const weekdayName = (d) => fmt(d, { weekday: "long" });
  const ucfirst = (s) => s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1);
  const listFmt = (arr) => new Intl.ListFormat(locale(), { type: "conjunction" }).format(arr);
  const num = (n) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(n);
  const startOf = (item) => at(item.date, item.start);
  const endOf = (item) => at(item.date, item.end);
  const range = (item) => `${time(startOf(item))}–${time(endOf(item))}`;
  // Function declarations: fresh() uses them before this point.
  function addDays(iso, n) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function isoWeek(iso) {
    const d = new Date(`${iso}T12:00:00Z`);
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  }
  function mondayOf(iso) { return addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7)); }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const locName = (id) => {
    const l = LOCS[id];
    if (!l) return esc(id);
    return l.key ? t(l.key, l.vars) : esc(l.name);
  };
  // Custom exercises are trainer content: shown exactly as typed, never translated (F040).
  const exDef = (id) => EXERCISES[id] || state.customEx[id];
  const exName = (id) => { const e = exDef(id); return e.custom ? esc(e.name) : e[activeLang()] || e.nl; };
  const kg = (w) => `${num(w)} kg`;
  const fold = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const initials = (name) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  // ---------------------------------------------------------------- domain stand-ins
  // In the product these live in packages/domain and come back from the API (AGENTS.md).
  function inferLocation(clientId) {
    const c = CLIENTS[clientId];
    if (WS[c.ws].kind === "gym") return { loc: WS[c.ws].loc, reason: t("p.reasonOrg", { ws: esc(WS[c.ws].name) }) };
    if (c.pref) {
      const home = c.pref.startsWith("home");
      return { loc: c.pref, reason: t(home ? "p.reasonHome" : "p.reasonPreferred", { name: esc(c.first) }) };
    }
    return { ambiguous: true, options: c.history || [] };
  }
  // Roles decide what "+" offers and which clients are visible (information-architecture.md §3.1, ⚑ Q03).
  const roleIn = (ws) => PERSONAS[state.me].roles[ws] || null;
  const canManage = (ws) => roleIn(ws) === "owner" || roleIn(ws) === "admin";
  const myWorkspaces = () => Object.keys(PERSONAS[state.me].roles);
  const manageWorkspaces = () => myWorkspaces().filter(canManage);
  function myClients() {
    return Object.keys(CLIENTS).filter((id) => {
      const c = CLIENTS[id];
      const role = roleIn(c.ws);
      if (!role) return false;
      if (role !== "trainer") return true;
      return c.createdBy === state.me || state.sessions.some((x) => x.client === id && x.trainer === state.me);
    });
  }
  // Previous values: the client's last logged performance of this exercise (F044).
  function prevFor(clientId, exId) {
    for (const w of state.history[clientId] || []) {
      const hit = w.items.find(([e]) => e === exId);
      if (hit) return { date: w.date, trainer: w.trainer, sets: hit[1] };
    }
    return null;
  }
  const workoutName = (name) => (name ? esc(name) : t("l.noTemplateName"));
  const lastSeen = (id) => (state.history[id] || [])[0]?.date
    || state.sessions.filter((x) => x.client === id && x.date < TODAY).map((x) => x.date).sort().pop() || null;
  const liveAttendees = (occ) => occ.attendees.filter((a) => a.status !== "pending");
  const bookedCount = (occ) => occ.attendees.filter((a) => a.status !== "pending" && a.status !== "cancelledByClient").length;
  const spotsLeft = (occ) => occ.cap - occ.attendees.filter((a) => a.status !== "cancelledByClient").length;
  const findClass = (id) => state.classes.find((c) => c.id === id);
  const findSession = (id) => state.sessions.find((s) => s.id === id);
  const findItem = (id) => findClass(id) || findSession(id);
  const overlaps = (a, b) => a.date === b.date && startOf(a) < endOf(b) && startOf(b) < endOf(a);
  function busyItem(trainer, occ) {
    return [...state.sessions, ...state.classes].find((x) =>
      x.id !== occ.id && x.ws === occ.ws && x.trainer === trainer && x.status !== "cancelled" && overlaps(x, occ));
  }

  // ---------------------------------------------------------------- icons
  const ICONS = {
    chevL: "M15 18l-6-6 6-6", chevR: "M9 18l6-6-6-6", arrowL: "M19 12H5M12 19l-7-7 7-7",
    plus: "M12 5v14M5 12h14", minus: "M5 12h14", x: "M18 6L6 18M6 6l12 12", check: "M20 6L9 17l-5-5",
    today: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM8 14h3v3H8z",
    calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01",
    users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
    user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    pin: "M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
    clock: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2",
    dumbbell: "M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11",
    note: "M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M8 13h8M8 17h5",
    lock: "M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1zM8 11V7a4 4 0 018 0v4",
    mail: "M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM3 6l9 7 9-7",
    swap: "M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16",
    ban: "M12 22a10 10 0 100-20 10 10 0 000 20zM4.9 4.9l14.2 14.2",
    menu: "M3 6h18M3 12h18M3 18h18",
    search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35",
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    link: "M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.5 1.5M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.5-1.5",
    sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
    layers: "M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5",
    door: "M3 21h18M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17M14 12h.01",
    alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
    cloud: "M17.5 19H7a5 5 0 11.9-9.9A6 6 0 0119 10.5a4.5 4.5 0 01-1.5 8.5zM9 14l2 2 4-4",
    home: "M3 11l9-8 9 8M5 9.5V21h14V9.5",
    repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3",
  };
  const icon = (name, cls = "") =>
    `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICONS[name]}"/></svg>`;

  // ---------------------------------------------------------------- navigation
  const current = () => state.stack[state.stack.length - 1];
  function go(s, params = {}) {
    state.stack.push({ s, ...params });
    state.sheet = null;
    render({ nav: true });
  }
  function back() {
    if (state.stack.length > 1) state.stack.pop();
    state.sheet = null;
    render({ nav: true });
  }
  function reset(stack) {
    state.stack = stack;
    state.sheet = null;
    render({ nav: true });
  }

  // Scripted flows use Sarah's sessions; flow 2 and 7 follow the "Ik ben" choice on the hub.
  const asSarah = () => { state.me = "sarah"; };
  const FLOWS = {
    1: () => { state.booking = fresh().booking; reset([{ s: "hub" }, { s: "b-list" }]); },
    2: () => reset([{ s: "hub" }, { s: "t-today" }]),
    3: () => { state.web = fresh().web; reset([{ s: "hub" }, { s: "w-cal" }]); },
    "4new": () => {
      state.web = { ...fresh().web, ws: "spt", flow: 4, date: "2026-09-30", panelMode: "create" };
      state.np = { client: null, trainer: "sarah", date: "2026-09-30", time: "12:00", dur: 60,
        workout: "", locChoice: null, locOther: "", showLocOptions: false, errors: {} };
      reset([{ s: "hub" }, { s: "w-cal" }]);
    },
    "4move": () => { state.web = { ...fresh().web, ws: "spt", flow: 4, panel: "p-mark" }; state.mv = null; reset([{ s: "hub" }, { s: "w-cal" }]); },
    "4app": () => { asSarah(); state.np = null; reset([{ s: "hub" }, { s: "t-today" }, { s: "p-client" }]); },
    5: () => {
      asSarah();
      if (!state.completedWorkouts["p-mark"]) startLog("p-mark", "template", "upper-a");
      reset([{ s: "hub" }, { s: "t-today" }, { s: "t-session", id: "p-mark" }, { s: "l-overview", id: "p-mark" }]);
    },
    "5free": () => {
      asSarah();
      if (state.log?.id === "p-koen") state.log = null;
      reset([{ s: "hub" }, { s: "t-today" }, { s: "t-session", id: "p-koen" }, { s: "l-start", id: "p-koen" }]);
    },
    6: () => { state.web = { ...fresh().web, flow: 6, panel: "o-str22" }; reset([{ s: "hub" }, { s: "w-cal" }]); },
    "6app": () => { asSarah(); reset([{ s: "hub" }, { s: "t-today" }, { s: "t-occ", id: "o-str22" }]); },
    7: () => { reset([{ s: "hub" }, { s: "t-today" }]); A["app-new-menu"](); },
    "7clients": () => reset([{ s: "hub" }, { s: "t-clients" }]),
  };

  // ---------------------------------------------------------------- shared UI pieces
  function seg(name, options, value, { label = "", small = false } = {}) {
    const md = state.platform === "android" && shellOf(current().s) === "app"
      && !["set-lang", "set-platform", "set-theme"].includes(name);
    return `<div class="seg ${small ? "seg--sm" : ""}" role="radiogroup" aria-label="${esc(label)}">${options
      .map(([v, text]) => `<button type="button" role="radio" aria-checked="${v === value}" class="seg-btn" data-act="${name}" data-v="${v}">${
        md && v === value ? icon("check", "ico--sm") : ""}<span>${text}</span></button>`)
      .join("")}</div>`;
  }
  function choiceList(act, options, value, { name = "" } = {}) {
    const ios = state.platform === "ios" && shellOf(current().s) === "app";
    return `<div class="list choices" role="radiogroup" aria-label="${esc(name)}">${options
      .map(([v, main, sub = "", disabled = false]) => `<button type="button" role="radio" aria-checked="${v === value}" class="row choice${disabled ? " is-muted" : ""}" data-act="${act}" data-v="${v}" ${disabled ? "disabled" : ""}>
          ${ios ? "" : `<span class="radio" aria-hidden="true"></span>`}
          <span class="row-main"><span class="row-title">${main}</span>${sub ? `<span class="row-sub">${sub}</span>` : ""}</span>
          ${ios ? `<span class="tick" aria-hidden="true">${v === value ? icon("check") : ""}</span>` : ""}
        </button>`)
      .join("")}</div>`;
  }
  const typeChip = (kind) => {
    const map = { private: ["private", "type.private"], group: ["group", "type.group"], openGym: ["open-gym", "type.openGym"] };
    const [cls, key] = map[kind];
    return `<span class="chip chip--${cls}">${t(key)}</span>`;
  };
  const typeBadge = (kind) => {
    const map = { private: ["private", "user", "type.private"], group: ["group", "users", "type.group"], openGym: ["open-gym", "door", "type.openGym"] };
    const [tone, glyph, label] = map[kind];
    return `<span class="icon-badge icon-badge--${tone}">${icon(glyph, "ico--sm")}<span class="sr-only">${t(label)}</span></span>`;
  };
  const disclosure = (label, body, cls = "") => `<details class="disclosure ${cls}"><summary>${label}${icon("chevR", "ico--sm")}</summary><div class="disclosure-body">${body}</div></details>`;
  const fact = (glyph, label, value) => `<div class="fact-row">${icon(glyph, "ico--sm")}<span class="sr-only">${label}: </span><span>${value}</span></div>`;
  function createTile(act, value, glyph, tone, label) {
    return `<li><button type="button" class="create-tile" data-act="${act}" data-v="${value}"><span class="icon-badge icon-badge--${tone}">${icon(glyph)}</span><span>${label}</span>${icon("chevR", "row-chev")}</button></li>`;
  }
  const attChip = (status) => {
    const map = { booked: "neutral", attended: "success", noShow: "danger", cancelled: "neutral" };
    return `<span class="chip chip--${map[status] || "neutral"}">${t("att." + status)}</span>`;
  };
  const demoBtn = (act, label, extra = "") =>
    `<button type="button" class="btn btn--demo" data-act="${act}" ${extra}><span class="demo-tag">${t("proto.demo")}</span>${label}</button>`;
  const field = (id, label, input, error) => `<div class="field${error ? " has-error" : ""}">
      <label class="field-label" for="${id}">${label}</label>${input}
      ${error ? `<p class="field-error" id="${id}-err">${icon("alert", "ico--sm")}<span>${error}</span></p>` : ""}
    </div>`;
  const meter = (value, max) =>
    `<div class="meter" role="img" aria-label="${value}/${max}"><span style="width:${Math.min(100, (value / max) * 100)}%"></span></div>`;

  // ---------------------------------------------------------------- screens: hub
  const SCREENS = {};

  SCREENS.hub = {
    shell: "hub",
    render() {
      const flows = [
        [1, "flow1", "link", "private", [["1", "hub.start"]]],
        [2, "flow2", "today", "neutral", [["2", "hub.start"]]],
        [3, "flow3", "calendar", "group", [["3", "hub.start"]]],
        [4, "flow4", "user", "private", [["4new", "flow4.new"], ["4move", "hub.move"], ["4app", "hub.app"]]],
        [5, "flow5", "dumbbell", "neutral", [["5free", "flow5.free"], ["5", "flow5.planned"]]],
        [6, "flow6", "users", "group", [["6", "flow6.web"], ["6app", "hub.app"]]],
        [7, "flow7", "plus", "open-gym", [["7", "flow7.new"], ["7clients", "tab.clients"]]],
      ];
      return `<div class="hub">
        <header class="hub-head">
          <p class="eyebrow">${t("proto.label")} · M0</p>
          <h1 class="t-display" tabindex="-1">Trainer Hub</h1>
          <p class="lede">${t("hub.calmIntro")}</p>
        </header>
        <section class="hub-settings" aria-labelledby="set-h">
          <h2 class="sr-only" id="set-h">${t("hub.settings")}</h2>
          <div class="hub-setting"><span>${t("proto.lang")}</span>${seg("set-lang", [["nl", "NL"], ["en", "EN"]], state.lang, { label: t("proto.lang") })}</div>
          <div class="hub-setting"><span>${t("proto.style")}</span>${seg("set-platform", [["ios", "iOS"], ["android", "Android"]], state.platform, { label: t("proto.style") })}</div>
          <div class="hub-setting"><span>${t("proto.me")}</span>${seg("set-me", [["sarah", "Sarah"], ["john", "John"]], state.me, { label: t("proto.me") })}</div>
          <div class="hub-setting"><span>${t("proto.appearance")}</span>${seg("set-theme", [["light", t("proto.light")], ["dark", t("proto.dark")]], state.theme, { label: t("proto.appearance") })}</div>
        </section>
        <section aria-labelledby="flows-h">
          <h2 class="t-caption section-label" id="flows-h">${t("hub.flows")}</h2>
          <ol class="flow-list">${flows.map(([n, key, glyph, tone, starts]) => `<li class="flow-card">
              <button type="button" class="flow-entry" data-act="flow" data-v="${starts[0][0]}">
                <span class="flow-meta"><span class="icon-badge icon-badge--${tone}">${icon(glyph)}</span><span class="flow-no" aria-label="${t("hub.flow", { n })}">${n}</span></span>
                <span class="flow-title">${t(key + ".short")}</span>
              </button>
              ${starts.length > 1 ? `<div class="flow-actions">${starts.slice(1).map(([id, label]) =>
                `<button type="button" class="btn btn--text" data-act="flow" data-v="${id}">${t(label)}</button>`).join("")}</div>` : ""}
            </li>`).join("")}</ol>
        </section>
        ${disclosure(t("hub.guide"), `<section class="hub-tips">
          <p class="t-subhead muted">${t("hub.subtitle")}</p>
          <p class="t-subhead muted">${t("hub.styleHint")}</p>
          <p class="t-subhead muted">${t("hub.meHint")}</p>
          ${flows.map(([, key]) => `<h3 class="t-headline">${t(key + ".title")}</h3><p class="t-subhead muted">${t(key + ".who")} · ${t(key + ".desc")}</p>`).join("")}
          <ul>
            <li>${t("hub.tip1")}</li>
            <li>${t("hub.tip2")}</li>
            <li>${t("hub.tip3", { date: dayLong(NOW), time: time(NOW) })}</li>
            <li>${t("hub.demoNote")}</li>
          </ul>
          <button type="button" class="btn btn--text" data-act="reset-demo">${t("proto.reset")}</button>
        </section>`, "hub-guide")}
      </div>`;
    },
  };

  // ---------------------------------------------------------------- screens: flow 1, public booking (web)
  function dayLabel(iso) {
    const d = at(iso, "12:00");
    const rel = iso === TODAY ? t("b.today") : iso === addDays(TODAY, 1) ? t("b.tomorrow") : ucfirst(weekdayName(d));
    return `${rel} · ${iso === TODAY || iso === addDays(TODAY, 1) ? dayLong(d) : dayMonth(d)}`;
  }
  function publicHeader() {
    return `<header class="pub-head">
        <div class="pub-brand"><span class="pub-mark" aria-hidden="true">JG</span><div><p class="pub-name">John's Gym</p><p class="t-footnote muted">Amsterdam</p></div></div>
        <div class="pub-lang">${seg("set-lang", [["nl", "NL"], ["en", "EN"]], state.lang, { label: t("common.language"), small: true })}</div>
      </header>`;
  }
  function classSummary(occ) {
    const d = startOf(occ);
    return `<div class="summary">
        <div class="booking-heading">${typeBadge(occ.kind)}<p class="summary-title">${esc(occ.title)}</p></div>
        <p class="booking-time t-num">${range(occ)}</p>
        <p class="summary-line">${icon("calendar", "ico--sm")}<span>${ucfirst(dayLong(d))}</span></p>
        <div class="booking-facts">${occ.trainer ? fact("user", t("o.trainer"), TRAINERS[occ.trainer].name) : ""}${fact("pin", t("s.location"), locName(occ.loc))}</div>
      </div>`;
  }

  // Clients see the coming three weeks as a date strip; the chosen day's classes are listed below (flows/01, PB-01).
  const STRIP_DAYS = 21;
  SCREENS["b-list"] = {
    shell: "public",
    render() {
      const b = state.booking;
      const kind = b.mode === "group" ? "group" : "openGym";
      const items = state.classes.filter((c) => c.ws === "jg" && c.kind === kind && c.date >= TODAY).sort((a, z) => startOf(a) - startOf(z));
      const days = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(TODAY, i));
      const has = (iso) => items.some((i) => i.date === iso);
      const day = b.day && days.includes(b.day) ? b.day : days.find(has) || TODAY;
      const list = items.filter((i) => i.date === day);
      const next = days.find((iso) => iso > day && has(iso));
      return `${publicHeader()}
        <main class="pub-main">
          <h1 class="pub-title" tabindex="-1">${t(b.mode === "group" ? "b.groupClasses" : "b.openGym")}</h1>
          <p class="lede">${t(b.mode === "group" ? "b.introShort" : "b.openGymIntro")}</p>
          <div class="pub-tabs">${seg("b-mode", [["group", t("b.groupClasses")], ["openGym", t("b.openGym")]], b.mode, { label: t("b.groupClasses") })}</div>
          <div class="day-strip" role="group" aria-label="${t("b.pickDay")}">${days.map((iso, i) => {
            const d = at(iso, "12:00");
            const showMonth = i === 0 || iso.endsWith("-01");
            return `<button type="button" class="day-chip${has(iso) ? "" : " is-empty"}" data-act="b-day" data-v="${iso}" aria-pressed="${iso === day}" aria-label="${ucfirst(dayLong(d))}">
                <span class="dc-wd">${fmt(d, { weekday: "short" })}</span><span class="dc-num t-num">${Number(iso.slice(8))}</span>
                <span class="dc-m">${iso === TODAY ? t("b.today").toLocaleLowerCase(locale()) : showMonth ? fmt(d, { month: "short" }) : has(iso) ? "•" : ""}</span></button>`;
          }).join("")}</div>
          <section class="day-group">
            <h2 class="t-caption section-label">${dayLabel(day)}</h2>
            ${list.length ? `<ul class="class-list">${list.map((occ) => {
              const left = spotsLeft(occ);
              const full = left <= 0;
              const cancelled = occ.status === "cancelled";
              const status = cancelled ? `<span class="chip chip--neutral">${t("att.cancelled")}</span>`
                : full ? `<span class="chip chip--neutral">${t("b.full")}</span>`
                : `<span class="spots${left <= 2 ? " spots--low" : ""}">${t("b.spots", { n: left })}</span>`;
              return `<li><button type="button" class="class-card" data-act="b-pick" data-id="${occ.id}" ${full || cancelled ? "disabled" : ""}>
                  <span class="class-time"><span class="t-num">${time(startOf(occ))}</span><span class="class-end">${time(endOf(occ))}</span></span>
                  <span class="class-body">
                    <span class="class-title">${esc(occ.title)}</span>
                    ${occ.trainer ? `<span class="class-meta">${icon("user", "ico--sm")}<span class="sr-only">${t("o.trainer")}: </span>${TRAINERS[occ.trainer].name}</span>` : ""}
                    ${status}
                  </span>
                  ${full || cancelled ? "" : icon("chevR", "class-chev")}
                </button></li>`;
            }).join("")}</ul>`
            : `<p class="t-subhead muted">${t("b.noneThisDay")}</p>`}
            ${next ? `<button type="button" class="btn btn--text btn--next-day" data-act="b-day" data-v="${next}">${t("b.nextDay", { day: ucfirst(dayLong(at(next, "12:00"))) })}${icon("chevR", "ico--sm")}</button>` : ""}
          </section>
        </main>`;
    },
  };

  SCREENS["b-form"] = {
    shell: "public",
    render() {
      const b = state.booking;
      const occ = findClass(b.occ);
      return `${publicHeader()}
        <main class="pub-main">
          <button type="button" class="btn btn--text btn--back" data-act="back">${icon("chevL", "ico--sm")}${t("common.back")}</button>
          <h1 class="pub-title" tabindex="-1">${t("b.formTitle")}</h1>
          ${classSummary(occ)}
          <form class="form" data-form="booking" novalidate>
            ${field("b-name", t("b.name"), `<input id="b-name" name="name" type="text" autocomplete="name" placeholder="${t("b.namePh")}" value="${esc(b.name)}" ${b.errors.name ? `aria-invalid="true" aria-describedby="b-name-err"` : ""}>`, b.errors.name && t("b.nameErr"))}
            ${field("b-email", t("b.email"), `<input id="b-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="${t("b.emailPh")}" value="${esc(b.email)}" ${b.errors.email ? `aria-invalid="true" aria-describedby="b-email-err"` : ""}>`, b.errors.email && t("b.emailErr"))}
            <p class="t-footnote muted privacy">${icon("lock", "ico--sm")}<span>${t("b.privacy")}</span></p>
            <button type="submit" class="btn btn--primary btn--block btn--lg">${t("b.submit")}</button>
          </form>
        </main>`;
    },
  };

  SCREENS["b-check"] = {
    shell: "public",
    render() {
      const b = state.booking;
      const left = Math.max(0, HOLD_MS - (Date.now() - b.holdAt));
      return `${publicHeader()}
        <main class="pub-main pub-main--center">
          <div class="big-icon" aria-hidden="true">${icon("mail")}</div>
          <h1 class="pub-title" tabindex="-1">${t("b.checkTitle")}</h1>
          <p class="lede">${t("b.checkBody", { email: `<strong class="nowrap-ok">${esc(b.email)}</strong>` })}</p>
          <div class="hold" role="timer" aria-live="off">
            <div class="hold-row"><span class="t-label">${t("b.holdLabel")}</span><span class="t-num hold-time" data-countdown>${t("b.holdLeft", { time: mmss(left) })}</span></div>
            <div class="meter meter--hold"><span data-countdown-bar style="width:${(left / HOLD_MS) * 100}%"></span></div>
            <p class="t-footnote muted">${t("b.holdHint")}</p>
          </div>
          <p class="t-footnote muted">${t("b.spam")}</p>
          <div class="stack">
            ${demoBtn("b-open-mail", t("b.openMail"), `data-primary`)}
            <button type="button" class="btn btn--text" data-act="b-resend">${t("b.resend")}</button>
            <button type="button" class="btn btn--text" data-act="b-wrong-email">${t("b.wrongEmail")}</button>
            ${demoBtn("b-expire", t("b.expireDemo"))}
          </div>
        </main>`;
    },
  };
  function mmss(ms) {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  SCREENS["b-mail"] = {
    shell: "public",
    noFooter: true,
    render() {
      const b = state.booking;
      const occ = findClass(b.occ);
      const when = `${dayLong(startOf(occ))}, ${time(startOf(occ))}`;
      return `<div class="mail">
          <header class="mail-bar"><button type="button" class="btn btn--text" data-act="back">${icon("chevL", "ico--sm")}${t("mail.inbox")}</button></header>
          <main class="mail-main">
            <h1 class="mail-subject" tabindex="-1">${t("mail.subject", { class: esc(occ.title) })}</h1>
            <div class="mail-from"><span class="pub-mark pub-mark--sm" aria-hidden="true">JG</span><div><p class="t-label">${t("mail.from", { ws: "John's Gym" })}</p><p class="t-footnote muted">${time(new Date(NOW.getTime() + 60000))}</p></div></div>
            <div class="mail-body">
              <p>${t("mail.hi", { name: esc(b.name.split(" ")[0]) })}</p>
              <p>${t("mail.body", { class: `<strong>${esc(occ.title)}</strong>`, when })}</p>
              <button type="button" class="btn btn--primary btn--lg" data-act="b-mail-link">${t("mail.button")}</button>
              <p class="t-footnote muted">${t("mail.valid")}</p>
            </div>
          </main>
        </div>`;
    },
  };

  SCREENS["b-confirm"] = {
    shell: "public",
    render() {
      const occ = findClass(state.booking.occ);
      return `${publicHeader()}
        <main class="pub-main">
          <h1 class="pub-title" tabindex="-1">${t("b.confirmTitle")}</h1>
          <p class="lede">${t("b.confirmBody")}</p>
          ${classSummary(occ)}
          <button type="button" class="btn btn--primary btn--block btn--lg" data-act="b-confirm">${t("b.confirmBtn")}</button>
        </main>`;
    },
  };

  SCREENS["b-confirmed"] = {
    shell: "public",
    render() {
      const b = state.booking;
      const occ = findClass(b.occ);
      return `${publicHeader()}
        <main class="pub-main">
          <div class="success-mark" aria-hidden="true">${icon("check")}</div>
          <h1 class="pub-title" tabindex="-1">${t("b.confirmedTitle")}</h1>
          <p class="lede">${t("b.confirmedMail")}</p>
          ${classSummary(occ)}
          <section class="account-offer" aria-labelledby="acc-h">
            <h2 class="t-headline" id="acc-h">${t("b.accountQ")}</h2>
            <p class="t-subhead muted">${t("b.accountWhy")}</p>
            <div class="stack">
              <button type="button" class="btn btn--primary btn--block" data-act="b-account">${t("b.createAccount")}</button>
              <button type="button" class="btn btn--tonal btn--block" data-act="b-no-account">${t("b.noAccount")}</button>
            </div>
          </section>
          <p class="t-footnote muted">${t("b.cancelHint")}</p>
        </main>`;
    },
  };

  SCREENS["b-done"] = {
    shell: "public",
    render() {
      const occ = findClass(state.booking.occ);
      return `${publicHeader()}
        <main class="pub-main">
          <h1 class="pub-title" tabindex="-1">${t("b.doneTitle")}</h1>
          ${classSummary(occ)}
          <p class="t-footnote muted">${t("b.cancelHint")}</p>
          <button type="button" class="btn btn--tonal btn--block" data-act="b-restart">${t("b.backToClasses")}</button>
        </main>`;
    },
  };

  SCREENS["b-account"] = {
    shell: "public",
    render() {
      const b = state.booking;
      const occ = findClass(b.occ);
      const att = occ.attendees.find((a) => a.id === b.attId);
      const active = att && att.status !== "cancelledByClient";
      return `${publicHeader()}
        <main class="pub-main">
          <h1 class="pub-title" tabindex="-1">${t("b.accountTitle")}</h1>
          <p class="lede">${t("b.accountBody")}</p>
          <h2 class="t-caption section-label">${t("b.upcoming")}</h2>
          ${active ? `${classSummary(occ)}
            ${b.confirmCancel ? `<div class="confirm-inline" role="group">
                <p class="t-subhead">${t("b.cancelSure")}</p>
                <div class="row-actions"><button type="button" class="btn btn--danger" data-act="b-cancel-yes">${t("b.cancelYes")}</button><button type="button" class="btn btn--tonal" data-act="b-cancel-no">${t("b.cancelNo")}</button></div>
              </div>` : `<button type="button" class="btn btn--text btn--danger-text" data-act="b-cancel-ask">${t("b.cancelBooking")}</button>`}`
          : `<p class="t-subhead muted">${t("b.noPast")}</p>`}
          <h2 class="t-caption section-label">${t("b.past")}</h2>
          <p class="t-subhead muted">${t("b.noPast")}</p>
          <button type="button" class="btn btn--tonal btn--block" data-act="b-restart">${t("b.backToClasses")}</button>
        </main>`;
    },
  };

  SCREENS["b-expired"] = {
    shell: "public",
    render() {
      return `${publicHeader()}
        <main class="pub-main pub-main--center">
          <div class="big-icon big-icon--warn" aria-hidden="true">${icon("clock")}</div>
          <h1 class="pub-title" tabindex="-1">${t("b.expiredTitle")}</h1>
          <p class="lede">${t("b.expiredBody")}</p>
          <div class="stack">
            <button type="button" class="btn btn--primary btn--block btn--lg" data-act="b-retry">${t("b.tryAgain")}</button>
            <button type="button" class="btn btn--text" data-act="b-restart">${t("b.backToClasses")}</button>
          </div>
        </main>`;
    },
  };

  // ---------------------------------------------------------------- screens: trainer app (flows 2, 4, 5, 6)
  function myToday() {
    const me = state.me;
    const privs = state.sessions.filter((x) => x.trainer === me && x.date === TODAY);
    const cls = state.classes.filter((c) => c.date === TODAY && (c.trainer === me || c.origTrainer === me));
    return [...privs, ...cls].sort((a, z) => startOf(a) - startOf(z));
  }
  const itemTitle = (x) => (x.kind === "private" ? esc(CLIENTS[x.client].name) : esc(x.title));
  function itemMeta(x) {
    const ws = esc(WS[x.ws].name);
    const loc = locName(x.loc);
    return loc === ws ? ws : `${ws} · ${loc}`;
  }
  const subbedAway = (x) => x.kind !== "private" && x.origTrainer === state.me;
  function itemState(x) {
    if (x.status === "cancelled") return `<span class="chip chip--neutral">${t("today.cancelled")}</span>`;
    if (subbedAway(x)) return `<span class="chip chip--warning">${t("o.subDone", { name: TRAINERS[x.trainer].name })}</span>`;
    if (x.kind === "private" && x.status !== "booked") return attChip(x.status);
    if (x.kind !== "private") return `<span class="capacity-mini t-num" role="img" aria-label="${t("today.bookedOf", { booked: bookedCount(x), cap: x.cap })}">${icon("users", "ico--sm")}${bookedCount(x)}/${x.cap}</span>`;
    return "";
  }
  function sessionRow(x) {
    const act = x.kind === "private" ? `data-act="open-session" data-id="${x.id}"` : `data-act="open-occ" data-id="${x.id}"`;
    const muted = x.status === "cancelled" || subbedAway(x);
    return `<li><button type="button" class="row session-row${muted ? " is-muted" : ""}" ${act}>
        <span class="row-time"><span class="t-num">${time(startOf(x))}</span><span class="t-num row-time-end">${time(endOf(x))}</span></span>
        ${typeBadge(x.kind)}
        <span class="row-main">
          <span class="row-title">${itemTitle(x)}</span>
          <span class="row-sub">${locName(x.loc)}</span>
          ${itemState(x) ? `<span class="row-state">${itemState(x)}</span>` : ""}
        </span>
        ${state.platform === "ios" ? icon("chevR", "row-chev") : ""}
      </button></li>`;
  }
  // The start button reflects the workout state of a private session.
  function workoutButton(x, cls = "btn--block") {
    const done = state.completedWorkouts[x.id];
    if (done) return `<button type="button" class="btn btn--primary ${cls}" data-act="open-share" data-id="${x.id}">${icon("dumbbell", "ico--sm")}${t(done.shared ? "l.viewShared" : "l.shareLater")}</button>`;
    const going = state.log?.id === x.id;
    return `<button type="button" class="btn btn--primary ${cls}" data-act="start-log" data-id="${x.id}">${icon("dumbbell", "ico--sm")}${t(going ? "s.continue" : "s.start")}</button>`;
  }
  // "+" in the app: iOS toolbar button, Android FAB (flows/02-trainer-today.md, platform table).
  const addNav = (act, label) => (state.platform === "ios" ? [{ icon: "plus", act, label }] : []);
  const addFab = (act, label) => (state.platform === "android" ? { icon: "plus", act, label } : null);

  SCREENS["t-today"] = {
    shell: "app",
    tab: "today",
    render() {
      const items = myToday();
      const upcoming = items.filter((x) => endOf(x) > NOW && x.status !== "cancelled" && !subbedAway(x));
      const next = upcoming[0];
      const later = items.filter((x) => x !== next && endOf(x) > NOW);
      const earlier = items.filter((x) => x !== next && endOf(x) <= NOW);
      const mins = next ? Math.round((startOf(next) - NOW) / 60000) : 0;
      const ios = state.platform === "ios";
      const date = ucfirst(fmt(NOW, { weekday: "short", day: "numeric", month: "short" }));
      const overview = `<div class="day-overview"><p>${date}</p><span class="day-count" role="img" aria-label="${t("today.summary", { n: items.length })}">${icon("calendar", "ico--sm")}<span class="t-num">${items.length}</span></span></div>`;
      return {
        nav: {
          title: t("today.title"), large: true,
          subtitle: ios ? date : "",
          actions: addNav("app-new-menu", t("today.add")),
        },
        fab: addFab("app-new-menu", t("today.add")),
        body: `
          ${ios ? "" : overview}
          ${next ? `<section class="next" aria-labelledby="next-h">
              <p class="next-kicker"><span id="next-h">${t("today.next")}</span><span>${mins > 0 ? t("today.inMinutes", { n: mins }) : ""}</span></p>
              <button type="button" class="next-main" data-act="${next.kind === "private" ? "open-session" : "open-occ"}" data-id="${next.id}">
                ${ios ? `<span class="next-person">${typeBadge(next.kind)}<span class="next-title">${itemTitle(next)}</span></span><span class="next-time t-num">${range(next)}</span>`
                  : `<span class="next-time t-num">${range(next)}</span><span class="next-person">${typeBadge(next.kind)}<span class="next-title">${itemTitle(next)}</span></span>`}
                <span class="next-line">${icon("pin", "ico--sm")}${locName(next.loc)}${next.workout ? `<span class="workout-tag">${icon("dumbbell", "ico--sm")}${esc(state.templates[next.workout].name)}</span>` : ""}</span>
              </button>
              ${next.kind === "private" ? workoutButton(next) : ""}
            </section>` : `<div class="empty">${icon("today", "ico--xl")}<h2 class="t-headline">${t("today.none")}</h2></div>`}
          ${later.length ? `<h2 class="t-caption section-label">${t("today.laterShort")}</h2><ul class="list agenda-list">${later.map(sessionRow).join("")}</ul>` : ""}
          ${earlier.length ? disclosure(t("today.earlier"), `<ul class="list agenda-list">${earlier.map(sessionRow).join("")}</ul>`, "earlier") : ""}
        `,
      };
    },
  };

  const placeholder = (tab, titleKey) => ({
    shell: "app",
    tab,
    render() {
      return {
        nav: { title: t(titleKey), large: true },
        body: `<div class="empty">${icon("layers", "ico--xl")}<h2 class="t-headline">${t("proto.notInScope")}</h2><p class="t-subhead muted">${t("proto.notInScopeBody")}</p>
          <button type="button" class="btn btn--tonal" data-act="tab" data-v="today">${t("tab.today")}</button></div>`,
      };
    },
  });
  // ---- Agenda tab (TD-04): week strip or month grid, then the chosen day's list.
  function myItemsOn(iso) {
    const me = state.me;
    return [...state.sessions.filter((x) => x.trainer === me && x.date === iso),
      ...state.classes.filter((c) => c.date === iso && (c.trainer === me || c.origTrainer === me))].sort((a, z) => startOf(a) - startOf(z));
  }
  function dayCell(iso, outside) {
    const n = myItemsOn(iso).filter((x) => x.status !== "cancelled").length;
    const sel = iso === state.agenda.date;
    return `<button type="button" class="day-cell${sel ? " is-selected" : ""}${iso === TODAY ? " is-today" : ""}${outside ? " is-outside" : ""}" data-act="ag-day" data-v="${iso}" aria-pressed="${sel}" aria-label="${ucfirst(dayLong(at(iso, "12:00")))}: ${t("today.summary", { n })}">
        <span class="day-num t-num">${Number(iso.slice(8))}</span><span class="day-dots" aria-hidden="true">${"<i></i>".repeat(Math.min(3, n))}</span></button>`;
  }
  SCREENS["t-calendar"] = {
    shell: "app",
    tab: "calendar",
    render() {
      const a = state.agenda;
      const week = a.view === "week";
      const mon = mondayOf(a.date);
      const first = a.date.slice(0, 8) + "01";
      const nextFirst = addDays(first, 32).slice(0, 8) + "01";
      let cells = [];
      if (week) cells = Array.from({ length: 7 }, (_, i) => dayCell(addDays(mon, i), false));
      else for (let d = mondayOf(first); d < nextFirst || cells.length % 7; d = addDays(d, 1)) cells.push(dayCell(d, d < first || d >= nextFirst));
      const title = week
        ? `${t("w.weekNo", { n: isoWeek(a.date) })} · ${weekRange(mon)}`
        : ucfirst(fmt(at(first, "12:00"), { month: "long", year: "numeric" }));
      const items = myItemsOn(a.date);
      return {
        nav: { title: t("tab.calendar"), large: true, actions: addNav("app-new-menu", t("today.add")) },
        fab: addFab("app-new-menu", t("today.add")),
        body: `
          <div class="ag-bar">${seg("ag-view", [["week", t("w.week")], ["month", t("ag.month")]], a.view, { label: t("tab.calendar"), small: true })}
            <button type="button" class="btn btn--text" data-act="ag-today">${t("w.today")}</button></div>
          <div class="ag-cal">
            <div class="ag-head">
              <button type="button" class="btn btn--icon btn--ghost" data-act="ag-step" data-v="-1" aria-label="${t(week ? "w.prevWeek" : "ag.prevMonth")}">${icon("chevL")}</button>
              <p class="t-headline" aria-live="polite">${title}</p>
              <button type="button" class="btn btn--icon btn--ghost" data-act="ag-step" data-v="1" aria-label="${t(week ? "w.nextWeek" : "ag.nextMonth")}">${icon("chevR")}</button>
            </div>
            <div class="ag-days">${Array.from({ length: 7 }, (_, i) => `<span class="ag-wd" aria-hidden="true">${fmt(at(addDays("2026-09-21", i), "12:00"), { weekday: "narrow" })}</span>`).join("")}${cells.join("")}</div>
          </div>
          <h2 class="t-caption section-label">${ucfirst(dayLong(at(a.date, "12:00")))}</h2>
          ${items.length ? `<ul class="list">${items.map(sessionRow).join("")}</ul>` : `<p class="t-subhead muted">${t("ag.empty")}</p>`}
        `,
      };
    },
  };
  SCREENS["t-more"] = placeholder("more", "tab.more");

  // ---- clients (TM-02, TM-03, PS-02)
  function clientMeta(id) {
    const c = CLIENTS[id];
    const seen = lastSeen(id);
    return [c.email ? esc(c.email) : t("c.noEmail"), seen ? t("c.lastSession", { date: dayMonth(at(seen, "12:00")) }) : t("c.noSessions")].join(" · ");
  }
  function clientRow(id, act) {
    const c = CLIENTS[id];
    return `<li data-name="${esc(fold(c.name + " " + (c.email || "")))}"><button type="button" class="row" data-act="${act}" data-v="${id}">
        <span class="avatar" aria-hidden="true">${initials(c.name)}</span>
        <span class="row-main"><span class="row-title">${esc(c.name)}${c.created ? ` <span class="chip chip--tonal">${t("o.new")}</span>` : ""}</span><span class="row-sub">${clientMeta(id)}</span></span>
        ${state.platform === "ios" ? icon("chevR", "row-chev") : ""}
      </button></li>`;
  }
  // Grouped per workspace: the same person at two workspaces is two client profiles (PRODUCT.md §10–11).
  function clientGroups(act) {
    const ids = myClients();
    return myWorkspaces().map((ws) => [ws, ids.filter((id) => CLIENTS[id].ws === ws)]).filter(([, list]) => list.length)
      .map(([ws, list]) => `<section class="client-group" data-client-group><h2 class="t-caption section-label">${esc(WS[ws].name)}</h2>
        <ul class="list" data-client-list>${list.map((id) => clientRow(id, act)).join("")}</ul></section>`).join("");
  }
  const clientSearch = () => `<div class="search">${icon("search", "ico--sm")}<input id="client-search" type="search" placeholder="${t("p.search")}" aria-label="${t("p.search")}" autocomplete="off"></div>`;

  SCREENS["t-clients"] = {
    shell: "app",
    tab: "clients",
    render() {
      return {
        nav: { title: t("tab.clients"), large: true, actions: addNav("c-new", t("c.new")) },
        fab: addFab("c-new", t("c.new")),
        body: `${clientSearch()}${clientGroups("open-client")}
          <p class="t-subhead muted" data-no-results hidden>${t("c.noResults")}</p>`,
      };
    },
  };

  SCREENS["t-client"] = {
    shell: "app",
    render() {
      const id = current().id;
      const c = CLIENTS[id];
      const hist = state.history[id] || [];
      return {
        nav: { title: esc(c.name), large: true, back: t("tab.clients") },
        body: `
          <p class="screen-sub"><span class="chip chip--tonal">${esc(WS[c.ws].name)}</span></p>
          <div class="profile-focus"><span class="avatar profile-avatar" aria-hidden="true">${initials(c.name)}</span><div><p class="t-footnote muted">${t("c.lastSeen")}</p><p class="t-headline">${lastSeen(id) ? dayMonth(at(lastSeen(id), "12:00")) : t("c.noWorkouts")}</p></div></div>
          <div class="stack">
            <button type="button" class="btn btn--primary btn--block btn--lg" data-act="c-train" data-v="${id}">${icon("dumbbell", "ico--sm")}${t("c.trainNow")}</button>
            <button type="button" class="btn btn--text btn--block" data-act="c-plan" data-v="${id}">${icon("calendar", "ico--sm")}${t("c.plan")}</button>
          </div>
          ${disclosure(t("c.contactDetails"), `${fact("mail", t("c.email"), c.email ? esc(c.email) : ucfirst(t("c.noEmail")))}${fact("sliders", t("c.lang"), t("lang." + c.lang))}${c.pref ? fact("pin", t("c.loc"), locName(c.pref)) : ""}`, "client-contact")}
          ${CLIENT_NOTES[id] ? disclosure(`${icon("lock", "ico--sm")}<span>${t("s.clientNotes")}<small>${t("s.trainerOnly")}</small></span>`,
            `<div class="note"><p class="note-meta">${icon("lock", "ico--sm")}<span>${t("s.trainerOnly")}</span></p><p class="note-text">${esc(CLIENT_NOTES[id])}</p></div>`, "client-notes") : ""}
          <h2 class="t-caption section-label">${t("c.workouts")}</h2>
          ${hist.length ? `<ul class="list">${hist.map((w) => `<li class="row row--static"><span class="row-main"><span class="row-title">${workoutName(w.name)}</span>
              <span class="row-sub">${ucfirst(dayLong(at(w.date, "12:00")))} · ${t("l.exCount", { n: w.items.length })} · ${TRAINERS[w.trainer].name}</span></span></li>`).join("")}</ul>`
            : `<p class="t-subhead muted">${t("c.noWorkouts")}</p>`}
        `,
      };
    },
  };

  // New client: only a name is required (flows/04-private-session.md, PS-02).
  function newClientModel(from, extra = {}) {
    const wsList = from.startsWith("web") ? [state.web.ws] : myWorkspaces();
    const ws = wsList.find(canManage) || wsList[0];
    return { from, name: "", email: "", lang: "nl", ws, loc: "", errors: {}, dup: null, ...extra };
  }
  function clientForm(inWeb) {
    const m = state.cn;
    const wsList = inWeb ? [m.ws] : myWorkspaces();
    const locs = WS[m.ws].kind === "gym" ? [] : WS_LOCS[m.ws] || [];
    return `<form data-form="new-client" novalidate class="form">
        ${field("cn-name", t("c.name"), `<input id="cn-name" class="input" type="text" autocomplete="off" value="${esc(m.name)}" ${m.errors.name ? `aria-invalid="true" aria-describedby="cn-name-err"` : ""}>`, m.errors.name && t("c.nameErr"))}
        ${field("cn-email", t("c.emailOpt"), `<input id="cn-email" class="input" type="email" inputmode="email" autocapitalize="off" spellcheck="false" value="${esc(m.email)}">`, "")}
        ${m.dup ? `<div class="confirm-inline confirm-inline--info"><p class="t-subhead">${t("c.dup", { name: esc(CLIENTS[m.dup].name) })}</p>
            <div class="row-actions"><button type="button" class="btn btn--tonal" data-act="cn-use" data-v="${m.dup}">${t("c.useThem")}</button></div></div>` : ""}
        <div class="field"><span class="field-label">${t("c.lang")}</span>${seg("cn-lang", [["nl", "Nederlands"], ["en", "English"]], m.lang, { label: t("c.lang") })}</div>
        ${wsList.length > 1 ? `<div class="field"><span class="field-label">${t("s.workspace")}</span>${choiceList("cn-ws", wsList.map((w) => [w, esc(WS[w].name), t("role." + roleIn(w))]), m.ws, { name: t("s.workspace") })}</div>`
          : `<p class="t-footnote muted">${t("c.inWs", { ws: esc(WS[m.ws].name) })}</p>`}
        ${locs.length ? field("cn-loc", t("c.locOpt"), `<select id="cn-loc" class="input"><option value="">${t("p.none")}</option>
            ${locs.map((l) => `<option value="${l}" ${m.loc === l ? "selected" : ""}>${locName(l)}</option>`).join("")}
            <option value="home" ${m.loc === "home" ? "selected" : ""}>${t("c.home")}</option></select>`, "") : ""}
        <button type="submit" class="btn btn--primary btn--block btn--lg">${t("c.add")}</button>
      </form>`;
  }
  SCREENS["c-new"] = {
    shell: "app",
    modal: true,
    render() {
      return { nav: { title: t("c.new"), large: false, cancel: true }, body: clientForm(false) };
    },
  };

  SCREENS["t-session"] = {
    shell: "app",
    render() {
      const x = findSession(current().id);
      const c = CLIENTS[x.client];
      const last = LAST_NOTE[x.client];
      return {
        nav: { title: esc(c.name), large: true, back: t("today.title") },
        body: `
          <section class="detail-focus"><p class="screen-sub">${typeChip("private")}<span class="t-footnote muted">${ucfirst(dayShort(startOf(x)))}</span></p>
            <p class="detail-time t-num">${range(x)}</p>
            ${fact("pin", t("s.location"), locName(x.loc))}
            ${x.workout ? fact("dumbbell", t("s.workout"), esc(state.templates[x.workout].name)) : ""}
          </section>
          <div class="stack">
            ${workoutButton(x, "btn--block btn--lg")}
            <button type="button" class="btn btn--text btn--block" data-act="move-session" data-id="${x.id}">${icon("calendar", "ico--sm")}${t("s.move")}</button>
          </div>
          ${disclosure(t("s.details"), `${fact("grid", t("s.workspace"), esc(WS[x.ws].name))}
            <h2 class="t-caption">${t("s.attendance")}</h2>
            ${seg("session-att", [["attended", t("att.attended")], ["noShow", t("att.noShow")]], x.status, { label: t("s.attendance") })}`, "session-info")}
          ${disclosure(`${icon("lock", "ico--sm")}<span>${t("s.notes")}<small>${t("s.trainerOnly")}</small></span>`, `
          ${last ? `<h2 class="t-caption section-label">${t("s.lastNote")}</h2>
            <div class="note"><p class="note-meta">${icon("lock", "ico--sm")}<span>${t("s.trainerOnly")} · ${dayMonth(at(last.date, "12:00"))}</span></p><p class="note-text">${esc(last.text)}</p></div>` : ""}
          ${state.completedWorkouts[x.id]?.internalNote ? `<h2 class="t-caption section-label">${t("l.internalNote")}</h2>
            <div class="note"><p class="note-meta">${icon("lock", "ico--sm")}<span>${t("s.trainerOnly")}</span></p><p class="note-text">${esc(state.completedWorkouts[x.id].internalNote)}</p></div>` : ""}
          ${CLIENT_NOTES[x.client] ? `<h2 class="t-caption section-label">${t("s.clientNotes")}</h2>
            <div class="note"><p class="note-meta">${icon("lock", "ico--sm")}<span>${t("s.trainerOnly")}</span></p><p class="note-text">${esc(CLIENT_NOTES[x.client])}</p></div>` : ""}
          `, "session-notes")}
          <button type="button" class="btn btn--text" data-act="open-client" data-v="${x.client}">${t("c.openProfile", { name: esc(c.first) })}${icon("chevR", "ico--sm")}</button>
        `,
      };
    },
  };

  // ---- flow 4: new session
  function locationBlock(model, clientId) {
    const inf = inferLocation(clientId);
    const c = CLIENTS[clientId];
    if (!inf.ambiguous && !model.showLocOptions) {
      return `<div class="inferred">
          ${icon("pin", "inferred-ico")}
          <div class="inferred-main"><p class="row-title">${locName(inf.loc)}</p><p class="t-footnote muted"><span class="chip chip--tonal">${t("p.locAuto")}</span> ${inf.reason}</p></div>
          <button type="button" class="btn btn--text" data-act="loc-change">${t("common.change")}</button>
        </div>`;
    }
    const options = inf.ambiguous ? [...inf.options, ...(clientId === "mark" ? ["home-mark"] : [])] : [inf.loc, ...["jg", "tmz", "bfo"].filter((l) => l !== inf.loc)];
    const opts = [...new Set(options)].map((l) => [l, locName(l)]).concat([["other", t("p.other")]]);
    return `<fieldset class="where${model.errors.loc ? " has-error" : ""}">
        <legend class="t-headline">${t("p.whereQ")}</legend>
        ${inf.ambiguous ? `<p class="t-footnote muted">${t("p.whereWhy", { name: esc(c.first) })}</p>` : ""}
        ${choiceList("loc-pick", opts, model.locChoice, { name: t("p.whereQ") })}
        ${model.locChoice === "other" ? `<input id="loc-other" class="input" type="text" placeholder="${t("p.otherPh")}" aria-label="${t("p.other")}" value="${esc(model.locOther)}">` : ""}
        ${model.errors.loc ? `<p class="field-error">${icon("alert", "ico--sm")}<span>${t("p.chooseLoc")}</span></p>` : ""}
      </fieldset>`;
  }

  SCREENS["p-client"] = {
    shell: "app",
    modal: true,
    render() {
      return {
        nav: { title: t("p.newTitle"), large: false, close: true },
        body: `
          <h2 class="t-title2 screen-h" tabindex="-1">${t("p.pickClient")}</h2>
          ${clientSearch()}
          <ul class="list"><li><button type="button" class="row row--add" data-act="np-new-client">
            <span class="avatar avatar--add" aria-hidden="true">${icon("plus", "ico--sm")}</span>
            <span class="row-main"><span class="row-title" data-new-client-label>${t("c.newQuick")}</span><span class="row-sub">${t("c.newQuickHint")}</span></span>
          </button></li></ul>
          ${clientGroups("np-client")}
          <p class="t-subhead muted" data-no-results hidden>${t("c.noResults")}</p>`,
      };
    },
  };

  SCREENS["p-form"] = {
    shell: "app",
    modal: true,
    render() {
      const m = state.np;
      const c = CLIENTS[m.client];
      return {
        nav: { title: t("p.newTitle"), large: false, back: t("common.back") },
        body: `<form data-form="new-session" novalidate class="form">
            <div class="picked"><span class="avatar" aria-hidden="true">${initials(c.name)}</span><div><p class="row-title">${esc(c.name)}</p><p class="t-footnote muted">${esc(WS[c.ws].name)}</p></div>
              <button type="button" class="btn btn--text" data-act="back">${t("common.change")}</button></div>
            <div class="field-row">
              ${field("np-date", t("p.date"), `<input id="np-date" class="input" type="date" value="${m.date}">`)}
              ${field("np-time", t("p.time"), `<input id="np-time" class="input" type="time" step="900" value="${m.time}">`)}
            </div>
            <div class="field"><span class="field-label" id="dur-l">${t("p.duration")}</span>
              ${seg("np-dur", [30, 45, 60, 90].map((n) => [String(n), t("p.min", { n })]), String(m.dur), { label: t("p.duration") })}</div>
            <div class="field"><span class="field-label">${t("s.location")}</span>${locationBlock(m, m.client)}</div>
            ${field("np-workout", t("p.workoutOpt"), `<select id="np-workout" class="input">
                <option value="">${t("p.none")}</option>${Object.entries(state.templates).map(([id, w]) => `<option value="${id}" ${m.workout === id ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select>`)}
            <button type="submit" class="btn btn--primary btn--block btn--lg">${t("p.save")}</button>
          </form>`,
      };
    },
  };

  // ---- flow 4: reschedule
  function moveForm(x, inWeb) {
    const m = state.mv;
    const c = CLIENTS[x.client];
    return `<form data-form="move" novalidate class="form">
        <div class="was"><p class="t-caption section-label">${t("p.current")}</p><p class="was-line"><s>${ucfirst(dayLong(startOf(x)))} · ${range(x)}</s></p></div>
        <p class="t-caption section-label">${t("p.newMoment")}</p>
        <div class="field-row">
          ${field("mv-date", t("p.date"), `<input id="mv-date" class="input" type="date" value="${m.date}">`)}
          ${field("mv-time", t("p.time"), `<input id="mv-time" class="input" type="time" step="900" value="${m.time}">`)}
        </div>
        <div class="field"><span class="field-label">${t("s.location")}</span>${locationBlock(m, x.client)}</div>
        <p class="notice">${icon("mail", "ico--sm")}<span>${t("p.notify", { name: esc(c.first), lang: t("lang." + c.lang) })}</span></p>
        <div class="stack">
          <button type="submit" class="btn btn--primary btn--block btn--lg">${t("p.moveSave")}</button>
          ${inWeb ? `<button type="button" class="btn btn--text" data-act="panel-details">${t("common.cancel")}</button>` : ""}
        </div>
      </form>`;
  }
  function ensureMove(x) {
    if (!state.mv || state.mv.id !== x.id) {
      const inf = inferLocation(x.client);
      state.mv = { id: x.id, date: addDays(x.date, 2), time: x.start, locChoice: inf.ambiguous ? x.loc : null, locOther: "", showLocOptions: false, errors: {} };
    }
  }
  SCREENS["p-move"] = {
    shell: "app",
    modal: true,
    render() {
      const x = findSession(current().id);
      ensureMove(x);
      return { nav: { title: t("p.moveTitle"), large: false, back: esc(CLIENTS[x.client].first) }, body: moveForm(x, false) };
    },
  };

  // ---- flow 5: live logging (flows/05-live-workout-logging.md, WL-01 … WL-05)
  // Each set row is prefilled: today's set just logged, else last time's same set, else the target reps (WL-03).
  function logItem(clientId, exId, targetSets = null, targetReps = null) {
    const prev = prevFor(clientId, exId);
    const n = targetSets || (prev ? prev.sets.length : 1);
    const rows = Array.from({ length: n }, (_, i) => {
      const p = prev ? prev.sets[Math.min(i, prev.sets.length - 1)] : null;
      return { w: p ? p[0] : 0, r: p ? p[1] : targetReps || 10, done: false, touched: false };
    });
    return { ex: exId, target: targetSets ? [targetSets, targetReps] : null, rows, diff: "normal" };
  }
  // source: "template" (a schema), "repeat" (the client's previous workout) or "empty" (on the fly).
  function startLog(id, source, tplId) {
    const x = findSession(id);
    let name = null;
    let items = [];
    if (source === "template") {
      const tpl = state.templates[tplId];
      name = tpl.name;
      items = tpl.items.map(([e, sets, reps]) => logItem(x.client, e, sets, reps));
    } else if (source === "repeat") {
      const w = state.history[x.client][0];
      name = w.name;
      items = w.items.map(([e, sets]) => logItem(x.client, e, sets.length));
    }
    state.log = { id, source, name, items, i: 0, sel: null, internalNote: "", saveTpl: false, tplName: "", tplErr: false, changed: false, confirmEmpty: false };
    return state.log;
  }
  const activeRow = (it, L) => (L.sel != null ? L.sel : it.rows.findIndex((r) => !r.done));
  const doneCount = (it) => it.rows.filter((r) => r.done).length;
  function nextPending(L) {
    for (let i = 0; i < L.items.length; i++) {
      const j = L.items[i].rows.findIndex((r) => !r.done);
      if (j >= 0) return { i, set: j + 1 };
    }
    return null;
  }
  function prevLine(prev) {
    if (!prev) return t("l.noPrevShort");
    const w = prev.sets.map((x) => x[0]);
    const sets = w.every((v) => v === w[0])
      ? `${kg(w[0])} × ${prev.sets.map((x) => x[1]).join(", ")}`
      : prev.sets.map((x) => `${kg(x[0])} × ${x[1]}`).join(", ");
    return t("l.prevLine", { sets });
  }
  // Later sets that the trainer hasn't touched follow the set just logged or changed (WL-03).
  function carry(it, i, keys = ["w", "r"]) {
    for (let j = i + 1; j < it.rows.length; j++) {
      const r = it.rows[j];
      if (!r.done && !r.touched) keys.forEach((k) => { r[k] = it.rows[i][k]; });
    }
  }
  const recordItems = (L) => L.items.filter((it) => doneCount(it))
    .map((it) => ({ ex: it.ex, sets: it.rows.filter((r) => r.done).map((r) => [r.w, r.r]), diff: it.diff }));
  function addExercise(exId) {
    const L = state.log;
    L.items.push(logItem(findSession(L.id).client, exId));
    Object.assign(L, { changed: true, i: L.items.length - 1, sel: null });
    state.stack.pop();
    go("l-log", { id: L.id });
  }
  const chev = () => (state.platform === "ios" ? icon("chevR", "row-chev") : "");

  SCREENS["l-start"] = {
    shell: "app",
    modal: true,
    render() {
      const x = findSession(current().id);
      const c = CLIENTS[x.client];
      const last = (state.history[x.client] || [])[0];
      const mine = (state.assigned[x.client] || []).filter((id) => state.templates[id]);
      const others = Object.keys(state.templates).filter((id) => !mine.includes(id));
      const tplRow = (id) => `<li><button type="button" class="row" data-act="log-begin" data-v="template" data-id="${id}">
          <span class="row-main"><span class="row-title">${esc(state.templates[id].name)}</span>
          <span class="row-sub">${t("l.exCount", { n: state.templates[id].items.length })}</span></span>${chev()}</button></li>`;
      return {
        nav: { title: t("s.start"), large: false, close: true },
        body: `
          <p class="t-subhead muted screen-h">${esc(c.name)} · ${ucfirst(dayShort(startOf(x)))} ${time(startOf(x))}</p>
          <ul class="list">
            <li><button type="button" class="row row--add" data-act="log-begin" data-v="empty">
              <span class="avatar avatar--add" aria-hidden="true">${icon("plus", "ico--sm")}</span>
              <span class="row-main"><span class="row-title">${t("l.empty")}</span><span class="row-sub">${t("l.emptyHint")}</span></span>${chev()}</button></li>
            ${last ? `<li><button type="button" class="row row--add" data-act="log-begin" data-v="repeat">
              <span class="avatar avatar--add" aria-hidden="true">${icon("repeat", "ico--sm")}</span>
              <span class="row-main"><span class="row-title">${t("l.repeat")}</span>
              <span class="row-sub">${workoutName(last.name)} · ${dayMonth(at(last.date, "12:00"))} · ${t("l.exCount", { n: last.items.length })}</span></span>${chev()}</button></li>` : ""}
          </ul>
          ${mine.length ? `<h2 class="t-caption section-label">${t("l.clientTemplates", { name: esc(c.first) })}</h2><ul class="list">${mine.map(tplRow).join("")}</ul>` : ""}
          ${others.length ? `<h2 class="t-caption section-label">${t(mine.length ? "l.otherTemplates" : "l.allTemplates")}</h2><ul class="list">${others.map(tplRow).join("")}</ul>` : ""}
        `,
      };
    },
  };

  SCREENS["l-overview"] = {
    shell: "app",
    modal: true,
    dock: true,
    render() {
      const L = state.log;
      const x = findSession(L.id);
      const c = CLIENTS[x.client];
      const np = nextPending(L);
      return {
        nav: { title: `${esc(c.first)} · ${L.name ? esc(L.name) : t("s.workout")}`, large: false, close: true, closeLabel: t("common.close"),
          text: [{ act: "log-finish", label: t("l.finish") }] },
        body: `
          <div class="log-top"><span class="t-footnote muted">${L.items.length ? t("l.exCount", { n: L.items.length }) : ""}</span><span class="sync">${icon("cloud", "ico--sm")}${t("l.savedLocal")}</span></div>
          ${L.items.length ? `<ol class="list ex-list">${L.items.map((it, i) => {
              const d = doneCount(it);
              const all = d > 0 && d === it.rows.length;
              return `<li><button type="button" class="row" data-act="log-open" data-v="${i}">
                  <span class="ex-no t-num" aria-hidden="true">${i + 1}</span>
                  <span class="row-main"><span class="row-title">${exName(it.ex)}</span><span class="row-sub t-num">${prevLine(prevFor(x.client, it.ex))}</span></span>
                  <span class="ex-count t-num${all ? " is-done" : ""}">${all ? icon("check", "ico--sm") : ""}${d}/${it.rows.length}</span>
                </button></li>`;
            }).join("")}</ol>`
            : `<div class="empty empty--tight">${icon("dumbbell", "ico--xl")}<h2 class="t-headline">${t("l.noExercises")}</h2><p class="t-subhead">${t("l.noExercisesHint", { name: esc(c.first) })}</p></div>`}
          <button type="button" class="btn btn--tonal btn--block" data-act="log-add">${icon("plus", "ico--sm")}${t("l.addExercise")}</button>
        `,
        dock: np
          ? `<button type="button" class="btn btn--primary btn--xl btn--block" data-act="log-open" data-v="${np.i}">${t("l.continue", { ex: exName(L.items[np.i].ex), n: np.set })}${icon("chevR", "ico--sm")}</button>`
          : L.items.length ? `<button type="button" class="btn btn--primary btn--xl btn--block" data-act="log-finish">${icon("check", "ico--sm")}${t("l.finishTitle")}</button>` : "",
      };
    },
  };

  SCREENS["l-log"] = {
    shell: "app",
    modal: true,
    dock: true,
    render() {
      const L = state.log;
      const x = findSession(L.id);
      const it = L.items[L.i];
      const prev = prevFor(x.client, it.ex);
      const a = activeRow(it, L);
      const row = a >= 0 ? it.rows[a] : null;
      const last = L.i === L.items.length - 1;
      const prevHead = prev
        ? t("l.prevHead", { date: dayMonth(at(prev.date, "12:00")) }) + (prev.trainer !== state.me ? ` · ${TRAINERS[prev.trainer].name}` : "")
        : t("l.noPrev");
      return {
        nav: { title: t("l.position", { i: L.i + 1, n: L.items.length }), large: false, back: t("l.overview") },
        body: `
          <h2 class="t-title1 log-ex" tabindex="-1">${exName(it.ex)}</h2>
          <p class="t-subhead muted">${it.target ? `${t("l.target", { sets: it.target[0], reps: it.target[1] })} · ` : ""}${prevHead}</p>
          <table class="sets">
            <caption class="sr-only">${exName(it.ex)}</caption>
            <thead><tr><th scope="col">${t("l.setCol")}</th><th scope="col">${t("l.previous")}</th><th scope="col">${t("l.today")}</th><th scope="col"><span class="sr-only">${t("l.doneCol")}</span></th></tr></thead>
            <tbody>${it.rows.map((r, i) => {
              const p = prev?.sets[i];
              return `<tr class="${i === a ? "is-current" : ""}${r.done ? " is-done" : ""}">
                  <th scope="row">${i + 1}</th>
                  <td class="prev t-num">${p ? `${kg(p[0])} × ${p[1]}` : "–"}</td>
                  <td class="now t-num"><button type="button" class="set-cell" data-act="log-sel" data-v="${i}" aria-label="${t("l.editSet", { n: i + 1 })}: ${kg(r.w)} × ${r.r}">${kg(r.w)} × ${r.r}</button></td>
                  <td class="tick"><button type="button" class="set-check" data-act="log-check" data-v="${i}" aria-pressed="${r.done}" aria-label="${t(r.done ? "l.undoSet" : "l.setDone", { n: i + 1 })}">${icon("check")}</button></td>
                </tr>`;
            }).join("")}</tbody>
          </table>
          <button type="button" class="btn btn--text btn--add-set" data-act="log-add-set">${icon("plus", "ico--sm")}${t("l.addSet")}</button>
          ${doneCount(it) ? `<h3 class="t-caption section-label">${t("l.difficulty")}</h3>
            ${seg("log-diff", [["easy", t("l.easy")], ["normal", t("l.normal")], ["hard", t("l.hard")]], it.diff, { label: t("l.difficulty") })}` : ""}
        `,
        dock: `
          ${row ? `<div class="steppers">${stepper("w", t("l.weightKg"), num(row.w), row.w)}${stepper("r", t("l.reps"), String(row.r), row.r)}</div>` : ""}
          <div class="dock-row">
            <button type="button" class="btn btn--icon btn--tonal btn--xl" data-act="log-ex" data-v="-1" ${L.i === 0 ? "disabled" : ""} aria-label="${t("l.prevExercise")}">${icon("chevL")}</button>
            ${row
              ? `<button type="button" class="btn btn--primary btn--xl btn--grow" data-act="log-save">${icon("check", "ico--sm")}${t(row.done ? "l.updateSet" : "l.setDone", { n: a + 1 })}</button>
                 <button type="button" class="btn btn--icon btn--tonal btn--xl" data-act="log-ex" data-v="1" aria-label="${last ? t("l.toOverview") : t("l.nextExercise")}">${icon("chevR")}</button>`
              : `<button type="button" class="btn btn--primary btn--xl btn--grow" data-act="log-ex" data-v="1">${last ? t("l.toOverview") : t("l.next", { ex: exName(L.items[L.i + 1].ex) })}${icon("chevR", "ico--sm")}</button>`}
          </div>`,
      };
    },
  };
  // The number is editable too, for big jumps (WL-03: tapping the number opens the keyboard).
  function stepper(key, label, value, raw) {
    return `<div class="stepper" role="group" aria-labelledby="st-${key}">
        <span class="stepper-label" id="st-${key}">${label}</span>
        <div class="stepper-row">
          <button type="button" class="btn btn--icon btn--tonal btn--xl" data-act="log-step" data-k="${key}" data-v="-1" aria-label="${t("l.less", { what: label.toLowerCase() })}" ${raw <= 0 ? "disabled" : ""}>${icon("minus")}</button>
          <input class="stepper-value t-num" id="step-${key}" type="text" inputmode="${key === "w" ? "decimal" : "numeric"}" value="${value}" aria-labelledby="st-${key}" autocomplete="off">
          <button type="button" class="btn btn--icon btn--tonal btn--xl" data-act="log-step" data-k="${key}" data-v="1" aria-label="${t("l.more", { what: label.toLowerCase() })}">${icon("plus")}</button>
        </div>
      </div>`;
  }

  SCREENS["l-add"] = {
    shell: "app",
    modal: true,
    render() {
      const L = state.log;
      const x = findSession(L.id);
      const c = CLIENTS[x.client];
      const inLog = new Set(L.items.map((it) => it.ex));
      const recent = [...new Set((state.history[x.client] || []).flatMap((w) => w.items.map(([e]) => e)))].filter(exDef);
      const rest = [...Object.keys(state.customEx), ...Object.keys(EXERCISES)].filter((e) => !recent.includes(e));
      const row = (e) => {
        const d = exDef(e);
        const other = d.custom ? "" : activeLang() === "nl" ? d.en : d.nl;
        const keys = fold([d.nl, d.en, d.name, ...(d.aliases || [])].filter(Boolean).join(" "));
        const prev = prevFor(x.client, e);
        const sub = [other && other !== exName(e) ? t("l.alias", { name: esc(other) }) : "", d.custom ? t("l.customEx") : "",
          inLog.has(e) ? t("l.inWorkout") : prev ? prevLine(prev) : ""].filter(Boolean).join(" · ");
        return `<li data-name="${esc(keys)}"><button type="button" class="row" data-act="log-add-ex" data-v="${e}" ${inLog.has(e) ? "disabled" : ""}>
            <span class="row-main"><span class="row-title">${exName(e)}</span>${sub ? `<span class="row-sub">${sub}</span>` : ""}</span>
            ${icon(inLog.has(e) ? "check" : "plus", "row-chev")}</button></li>`;
      };
      return {
        nav: { title: t("l.addExercise"), large: false, cancel: true },
        body: `
          <div class="search">${icon("search", "ico--sm")}<input id="ex-search" type="search" placeholder="${t("l.searchEx")}" aria-label="${t("l.searchEx")}" autocomplete="off"></div>
          ${recent.length ? `<section data-filter-group><h2 class="t-caption section-label">${t("l.recentFor", { name: esc(c.first) })}</h2><ul class="list">${recent.map(row).join("")}</ul></section>` : ""}
          <section data-filter-group><h2 class="t-caption section-label">${t("l.library")}</h2><ul class="list">${rest.map(row).join("")}</ul></section>
          <p class="t-subhead muted" data-no-results hidden>${t("l.noExFound")}</p>
          <button type="button" class="btn btn--tonal btn--block" data-act="log-new-ex" data-new-ex hidden></button>
        `,
      };
    },
  };

  SCREENS["l-finish"] = {
    shell: "app",
    modal: true,
    render() {
      const L = state.log;
      const x = findSession(L.id);
      const c = CLIENTS[x.client];
      const items = recordItems(L);
      const skipped = L.items.filter((it) => !doneCount(it));
      const sets = items.reduce((n, it) => n + it.sets.length, 0);
      const offerTpl = items.length && (L.source !== "template" || L.changed);
      return {
        nav: { title: t("l.finishTitle"), large: false, back: t("common.back") },
        body: `
          <h2 class="t-title2 screen-h" tabindex="-1">${esc(c.name)} · ${L.name ? esc(L.name) : t("s.workout")}</h2>
          <div class="workout-metrics">
            <div class="result-stat"><span class="icon-badge icon-badge--neutral">${icon("dumbbell", "ico--sm")}</span><strong class="metric-value t-num">${items.length}/${L.items.length}</strong><span>${t("l.exercisesDone")}</span></div>
            <div class="result-stat"><span class="icon-badge icon-badge--private">${icon("check", "ico--sm")}</span><strong class="metric-value t-num">${sets}</strong><span>${t("l.setsLabel")}</span></div>
          </div>
          ${disclosure(t("l.resultsDetails"), `${skipped.length ? `<p class="t-subhead muted">${t("l.skipped", { list: skipped.map((it) => exName(it.ex)).join(", ") })}</p>` : ""}
            ${items.length ? workoutRows(items) : ""}`, "workout-breakdown")}
          <div class="field">
            <label class="field-label" for="internal-note">${t("l.internalNote")}</label>
            <textarea id="internal-note" class="input" rows="3" placeholder="${t("l.internalNotePh")}">${esc(L.internalNote)}</textarea>
            <p class="t-footnote muted privacy">${icon("lock", "ico--sm")}<span>${t("l.internalHintShort")}</span></p>
          </div>
          ${offerTpl ? `<label class="switch-row"><span class="row-main"><span class="row-title">${t("l.saveTpl")}</span><span class="row-sub">${t("l.saveTplHint", { name: esc(c.first) })}</span></span>
              <input type="checkbox" class="switch" data-act="log-save-tpl" ${L.saveTpl ? "checked" : ""}></label>
            ${L.saveTpl ? field("tpl-name", t("l.tplName"), `<input id="tpl-name" class="input" type="text" value="${esc(L.tplName)}">`, L.tplErr ? t("l.tplNameErr") : "") : ""}` : ""}
          <p class="t-footnote muted">${icon("check", "ico--sm")} ${t("l.attendanceSet")}</p>
          ${L.confirmEmpty
            ? `<div class="confirm-inline" role="group"><p class="t-subhead">${t("l.zeroSets")}</p>
                <div class="row-actions"><button type="button" class="btn btn--primary" data-act="log-done" data-force="1">${t("l.finish")}</button><button type="button" class="btn btn--tonal" data-act="log-empty-back">${t("common.back")}</button></div></div>`
            : `<button type="button" class="btn btn--primary btn--block btn--lg" data-act="log-done">${t("l.save")}</button>`}
        `,
      };
    },
  };
  function workoutRows(items) {
    return `<ul class="list">${items.map((it) => `<li class="row row--static"><span class="row-main">
      <span class="row-title">${exName(it.ex)}</span>
      <span class="row-sub t-num">${it.sets.map((x) => `${kg(x[0])} × ${x[1]}`).join(" · ")}</span>
    </span>${it.diff && it.diff !== "normal" ? `<span class="chip chip--${it.diff === "hard" ? "warning" : "neutral"}">${t("l." + it.diff)}</span>` : ""}</li>`).join("")}</ul>`;
  }
  function sharedWorkoutBody(record) {
    const x = findSession(record.id);
    const total = record.items.reduce((n, it) => n + it.sets.length, 0);
    return `<h2 class="t-title2 screen-h" tabindex="-1">${workoutName(record.name)}</h2>
      <p class="t-subhead muted">${ucfirst(dayLong(startOf(x)))} · ${t("l.summary", { sets: total, ex: record.items.length })}</p>
      ${workoutRows(record.items)}
      ${record.clientNote.trim() ? `<h3 class="t-caption section-label">${t("l.clientNoteFrom", { name: esc(TRAINERS[x.trainer].name) })}</h3><div class="note"><p class="note-text">${esc(record.clientNote)}</p></div>` : ""}`;
  }
  SCREENS["l-complete"] = {
    shell: "app",
    render() {
      const record = state.completedWorkouts[current().id];
      const x = findSession(record.id);
      const c = CLIENTS[x.client];
      return { nav: { title: t("l.savedTitle"), large: false, back: esc(c.first) }, body: `
        <p class="banner banner--success">${icon("check", "ico--sm")}<span>${t("l.saved")}</span></p>
        <h2 class="t-title2 screen-h" tabindex="-1">${t("l.shareQuestion", { name: esc(c.first) })}</h2>
        <p class="t-subhead muted">${t("l.shareExplainer", { name: esc(c.first) })}</p>
        <div class="field"><label class="field-label" for="client-note">${t("l.clientNote")}</label>
          <textarea id="client-note" class="input" rows="4" placeholder="${t("l.clientNotePh")}">${esc(record.clientNote)}</textarea>
          <p class="t-footnote muted">${t("l.clientNoteHint")}</p></div>
        <div class="stack"><button type="button" class="btn btn--primary btn--block btn--lg" data-act="share-review">${t("l.reviewShare")}</button>
          <button type="button" class="btn btn--text btn--block" data-act="share-later">${t("l.notNow")}</button></div>` };
    },
  };
  SCREENS["l-review"] = {
    shell: "app",
    render() {
      const record = state.completedWorkouts[current().id];
      const x = findSession(record.id);
      return { nav: { title: t("l.reviewTitle"), large: false, back: t("common.back") }, body: `
        <p class="t-subhead muted">${t("l.reviewExplainer")}</p>
        <div class="note"><p class="note-meta">${t("l.emailTo")}: ${esc(CLIENTS[x.client].first.toLowerCase())}@example.com</p></div>
        ${sharedWorkoutBody(record)}
        <button type="button" class="btn btn--primary btn--block btn--lg" data-act="share-confirm">${t(record.clientNote.trim() ? "l.sendWithNote" : "l.sendWorkout")}</button>` };
    },
  };
  SCREENS["l-sent"] = {
    shell: "app",
    render() {
      const record = state.completedWorkouts[current().id];
      const c = CLIENTS[findSession(record.id).client];
      return { nav: { title: t("l.sentTitle"), large: false, back: esc(c.first) }, body: `
        <h2 class="t-title2 screen-h" tabindex="-1">${t("l.sentTo", { name: esc(c.first) })}</h2>
        <p class="t-subhead muted">${t("l.sentExplainer", { name: esc(c.first) })}</p>
        <div class="stack"><button type="button" class="btn btn--tonal btn--block" data-act="view-email">${t("l.viewEmail")}</button>
          <button type="button" class="btn btn--tonal btn--block" data-act="view-profile">${t("l.viewProfile", { name: esc(c.first) })}</button></div>` };
    },
  };
  SCREENS["l-email"] = {
    shell: "public",
    render() {
      const record = state.completedWorkouts[current().id];
      const x = findSession(record.id);
      const c = CLIENTS[x.client];
      return `<div class="pub-lang">${seg("set-preview-lang", [["nl", "NL"], ["en", "EN"]], activeLang(), { label: t("common.language"), small: true })}</div>
        <div class="mail-card"><p class="t-footnote muted">${t("l.emailTo")}: ${esc(c.first.toLowerCase())}@example.com</p>
        <p class="t-footnote muted">${t("mail.from", { ws: esc(WS[x.ws].name) })}</p>
        <h1 class="t-title2">${t("l.emailSubject", { name: esc(c.first) })}</h1>
        <p>${t("l.emailGreeting", { name: esc(c.first) })}</p>
        <p>${t("l.emailIntro", { name: esc(TRAINERS[x.trainer].name) })}</p>
        ${sharedWorkoutBody(record)}
        <button type="button" class="btn btn--primary btn--block" data-act="view-profile">${t("l.openProfile")}</button>
        <p class="t-footnote muted">${t("l.emailAccess")}</p></div>`;
    },
  };
  SCREENS["l-profile"] = {
    shell: "public",
    render() {
      const record = state.completedWorkouts[current().id];
      const x = findSession(record.id);
      const c = CLIENTS[x.client];
      return `<div class="pub-lang">${seg("set-preview-lang", [["nl", "NL"], ["en", "EN"]], activeLang(), { label: t("common.language"), small: true })}</div>
        <h1 class="t-title1">${t("l.profileTitle", { name: esc(c.first) })}</h1>
        <p class="t-subhead muted">${t("l.profileDemo")}</p>
        <h2 class="t-title2">${t("l.myWorkouts")}</h2>
        ${sharedWorkoutBody(record)}`;
    },
  };

  // ---- flow 6: class occurrence
  function occManager(occ, inWeb) {
    const people = liveAttendees(occ).filter((a) => a.status !== "cancelledByClient");
    const attended = people.filter((a) => a.status === "attended").length;
    const cancelled = occ.status === "cancelled";
    return `
      ${cancelled ? `<p class="banner banner--danger">${icon("ban", "ico--sm")}<span>${t("o.cancelledBanner")}</span></p>` : ""}
      <p class="screen-sub">${typeChip(occ.kind)} <span class="t-subhead muted">${ucfirst(dayLong(startOf(occ)))} · <span class="t-num">${range(occ)}</span></span></p>
      <ul class="list">
        <li class="row row--static">${icon("pin", "row-ico")}<span class="row-main"><span class="row-sub">${t("s.location")}</span><span class="row-title">${locName(occ.loc)}${occ.loc === WS[occ.ws].loc ? "" : ` · ${esc(WS[occ.ws].name)}`}</span></span></li>
        ${occ.kind === "openGym" ? "" : `<li class="row row--static">${icon("user", "row-ico")}<span class="row-main"><span class="row-sub">${t("o.trainer")}</span>
          <span class="row-title">${occ.trainer ? TRAINERS[occ.trainer].name : `<span class="chip chip--warning">${icon("alert", "ico--sm")}${t("o.trainerNeeded")}</span>`}</span>
          ${occ.origTrainer ? `<span class="row-sub">${t("o.subBadge", { name: TRAINERS[occ.origTrainer].name })}</span>` : ""}</span></li>`}
        <li class="row row--static">${icon("users", "row-ico")}<span class="row-main"><span class="row-sub">${t("o.bookedOf", { booked: bookedCount(occ), cap: occ.cap })}</span>${meter(bookedCount(occ), occ.cap)}</span></li>
      </ul>
      ${cancelled || occ.kind === "openGym" || !canManage(occ.ws) && shellOf(current().s) === "app" ? "" : `<div class="action-row">
          ${WS[occ.ws].kind === "gym" ? `<button type="button" class="btn btn--tonal" data-act="open-sub" data-id="${occ.id}">${icon("swap", "ico--sm")}${t("o.substitute")}</button>` : ""}
          <button type="button" class="btn btn--tonal btn--danger-text" data-act="open-cancel" data-id="${occ.id}">${icon("ban", "ico--sm")}${t("o.cancelClass")}</button>
        </div>`}
      <div class="list-head"><h2 class="t-caption section-label">${t("o.participants")}</h2><span class="t-footnote muted">${t("o.attendedCount", { n: attended })}</span></div>
      ${people.length ? `<ul class="list">${people.map((a) => `<li class="row row--static att-row">
          <span class="avatar" aria-hidden="true">${initials(a.name)}</span>
          <span class="row-main"><span class="row-title">${esc(a.name)}${a.isNew ? ` <span class="chip chip--tonal">${t("o.new")}</span>` : ""}</span>
            <span class="row-sub">${attChip(cancelled ? "cancelled" : a.status)}${a.guest ? ` <span>${t("o.guest")}</span>` : ""}${a.lang === "en" ? ` <span class="lang-tag" title="${t("lang.en")}">EN</span>` : ""}</span></span>
          ${cancelled ? "" : `<span class="att-btns">
            <button type="button" class="att-btn att-btn--yes" aria-pressed="${a.status === "attended"}" data-act="att" data-occ="${occ.id}" data-id="${a.id}" data-v="attended" aria-label="${t("o.markAttended", { name: esc(a.name) })}">${icon("check")}<span>${t("att.attended")}</span></button>
            <button type="button" class="att-btn att-btn--no" aria-pressed="${a.status === "noShow"}" data-act="att" data-occ="${occ.id}" data-id="${a.id}" data-v="noShow" aria-label="${t("o.markNoShow", { name: esc(a.name) })}">${icon("x")}<span>${t("att.noShow")}</span></button>
          </span>`}
        </li>`).join("")}</ul>` : `<p class="t-subhead muted">${t("o.noParticipants")}</p>`}
`;
  }
  SCREENS["t-occ"] = {
    shell: "app",
    render() {
      const occ = findClass(current().id);
      return { nav: { title: esc(occ.title), large: true, back: t("today.title") }, body: occManager(occ, false) };
    },
  };

  // Bottom sheets (app) / dialogs (web) for substitution and cancellation
  function sheetContent() {
    const sh = state.sheet;
    if (sh.kind === "new") return newMenu();
    const occ = findClass(sh.occ);
    const when = `${esc(occ.title)} · ${ucfirst(dayLong(startOf(occ)))} · ${time(startOf(occ))}`;
    const scopeOpts = [["this", t("o.scopeThis")], ["following", t("o.scopeFollowing")]];
    if (sh.kind === "sub") {
      const candidates = GYM_TRAINERS.filter((id) => id !== occ.trainer);
      const opts = candidates.map((id) => {
        const busy = busyItem(id, occ);
        return [id, TRAINERS[id].name, busy ? `<span class="warn-text">${icon("alert", "ico--sm")}${t("o.busy", { time: time(startOf(busy)) })}</span>` : t("o.available"), !!busy];
      });
      return {
        title: t("o.subTitle"),
        body: `<p class="t-subhead muted">${when}</p>
          ${choiceList("sub-pick", opts, sh.pick, { name: t("o.subTitle") })}
          <h3 class="t-caption section-label">${t("o.scope")}</h3>
          ${seg("sheet-scope", scopeOpts, sh.scope, { label: t("o.scope") })}
          <label class="switch-row"><span class="row-title">${t("o.emailSub", { name: sh.pick ? TRAINERS[sh.pick].name : t("o.substituteName") })}</span><input type="checkbox" class="switch" data-act="sub-email" ${sh.email ? "checked" : ""}></label>
          <label class="switch-row"><span class="row-title">${t("o.notifyParticipants", { n: bookedCount(occ) })}</span><input type="checkbox" class="switch" data-act="sub-notify" ${sh.notify ? "checked" : ""}></label>
          <p class="notice">${icon("check", "ico--sm")}<span>${t("o.subKeep")}</span></p>`,
        actions: `<button type="button" class="btn btn--primary btn--block btn--lg" data-act="sub-confirm" ${sh.pick ? "" : "disabled"}>${sh.pick ? t("o.subConfirm", { name: TRAINERS[sh.pick].name }) : t("o.subPick")}</button>`,
      };
    }
    const n = bookedCount(occ);
    return {
      title: t("o.cancelTitle"),
      body: `<p class="t-subhead muted">${when}</p>
        <h3 class="t-caption section-label">${t("o.scope")}</h3>
        ${seg("sheet-scope", scopeOpts, sh.scope, { label: t("o.scope") })}
        <p class="notice">${icon("mail", "ico--sm")}<span>${t("o.cancelNotify", { n })}</span></p>
        <div class="field"><label class="field-label" for="cancel-message">${t("o.cancelMessage")}</label>
          <textarea id="cancel-message" class="input" rows="3">${esc(sh.message || "")}</textarea>
          <p class="t-footnote muted">${t("o.messageNotTranslated")}</p></div>`,
      actions: `<div class="stack">
          <button type="button" class="btn btn--danger btn--block btn--lg" data-act="cancel-confirm">${t("o.cancelClass")}</button>
          <button type="button" class="btn btn--tonal btn--block" data-act="sheet-close">${t("o.cancelKeep")}</button>
        </div>`,
    };
  }

  // "+" in the app offers only what the role may create (information-architecture.md §3.1).
  function newMenu() {
    const manage = manageWorkspaces();
    const notMine = myWorkspaces().filter((w) => !canManage(w));
    const where = esc(manage.map((w) => WS[w].name).join(", "));
    return {
      title: t("new.title"),
      body: `<ul class="create-grid">
          ${createTile("app-new", "private", "user", "private", t("new.private"))}
          ${createTile("app-new", "client", "plus", "neutral", t("c.client"))}
          ${manage.length ? createTile("app-new", "group", "users", "group", t("type.group")) : ""}
          ${manage.length ? createTile("app-new", "openGym", "door", "open-gym", t("type.openGym")) : ""}
        </ul>
        ${manage.length ? `<p class="t-footnote muted creation-scope">${t("new.managedScope", { ws: where })}</p>` : ""}
        ${notMine.length ? `<p class="notice">${icon("lock", "ico--sm")}<span>${t("new.ownerOnly", { ws: esc(listFmt(notMine.map((w) => WS[w].name))) })}</span></p>` : ""}`,
      actions: "",
    };
  }

  // ---------------------------------------------------------------- screens: flow 3, web calendar
  const NAV_ITEMS = [
    ["dashboard", "grid"], ["calendar", "calendar"], ["clients", "users"], ["classes", "layers"], ["openGym", "door"],
    ["workouts", "dumbbell"], ["trainers", "user"], ["links", "link"], ["settings", "sliders"],
  ];
  // 06:00–22:00 at 48px per hour: a whole working day fits a laptop screen; the grid snaps to 15 minutes.
  const H0 = 6, H1 = 22, HOUR_PX = 48;
  const hhmm = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const plusMinutes = (t0, n) => { const [h, m] = t0.split(":").map(Number); return hhmm(h * 60 + m + n); };

  function gymItems(date) {
    const f = state.web.trainer;
    return [...state.sessions.filter((s) => s.ws === state.web.ws), ...state.classes.filter((c) => c.ws === state.web.ws)]
      .filter((x) => x.date === date && (!f || x.trainer === f || x.origTrainer === f)).sort((a, z) => startOf(a) - startOf(z));
  }
  function eventLabel(x) {
    return x.kind === "private" ? t("w.privateWith", { name: esc(CLIENTS[x.client].first) }) : esc(x.title);
  }
  function eventCls(x) {
    const k = x.kind === "private" ? "private" : x.kind === "openGym" ? "open-gym" : "group";
    return `ev ev--${k}${x.status === "cancelled" ? " is-cancelled" : ""}${x.kind === "group" && !x.trainer ? " needs-trainer" : ""}${state.web.panel === x.id ? " is-selected" : ""}`;
  }
  // Side-by-side columns for overlapping items within one lane or day.
  function columns(items) {
    const out = new Map();
    let cluster = [];
    let clusterEnd = 0;
    const flush = () => {
      const ends = [];
      cluster.forEach((x) => {
        let c = ends.findIndex((end) => end <= +startOf(x));
        if (c < 0) { c = ends.length; ends.push(0); }
        ends[c] = +endOf(x);
        out.set(x.id, { col: c });
      });
      cluster.forEach((x) => { out.get(x.id).n = ends.length; });
      cluster = [];
      clusterEnd = 0;
    };
    items.forEach((x) => {
      if (cluster.length && +startOf(x) >= clusterEnd) flush();
      cluster.push(x);
      clusterEnd = Math.max(clusterEnd, +endOf(x));
    });
    flush();
    return out;
  }
  function eventButton(x, date, pos, withTrainer) {
    const top = ((startOf(x) - at(date, hhmm(H0 * 60))) / 3600000) * HOUR_PX;
    const mins = (endOf(x) - startOf(x)) / 60000;
    const meta = [
      withTrainer && x.kind !== "openGym" ? (x.trainer ? TRAINERS[x.trainer].name : `<span class="chip chip--warning">${t("o.trainerNeeded")}</span>`) : "",
      x.kind === "private" ? "" : `<span class="t-num">${bookedCount(x)}/${x.cap}</span>`,
    ].filter(Boolean).join(" · ");
    return `<button type="button" class="${eventCls(x)}${mins <= 45 ? " ev--short" : ""}" style="top:${top}px;height:${(mins / 60) * HOUR_PX - 2}px;left:calc(${pos.col} * 100% / ${pos.n} + 2px);width:calc(100% / ${pos.n} - 4px)" data-act="w-open" data-id="${x.id}">
        <span class="ev-time t-num">${time(startOf(x))}</span><span class="ev-title">${eventLabel(x)}</span>${meta ? `<span class="ev-meta">${meta}</span>` : ""}
      </button>`;
  }
  function timeAxis(date) {
    const hours = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
    return `<div class="cal-times">${hours.map((h) => `<span style="top:${(h - H0) * HOUR_PX}px">${time(at(date, hhmm(h * 60)))}</span>`).join("")}</div>`;
  }
  const nowLine = (show) => (show ? `<div class="cal-now" style="top:${((NOW - at(TODAY, hhmm(H0 * 60))) / 3600000) * HOUR_PX}px" aria-hidden="true"><span>${time(NOW)}</span></div>` : "");
  const calStyle = (lanes) => `--lanes:${lanes};--hour:${HOUR_PX}px;--hours:${H1 - H0}`;

  function dayView(date) {
    const items = gymItems(date);
    const f = state.web.trainer;
    const lanes = f ? [f] : state.web.ws === "jg" ? ["john", "sarah", "mike"] : ["sarah"];
    items.forEach((x) => { if (x.trainer && !lanes.includes(x.trainer)) lanes.push(x.trainer); });
    if (items.some((x) => x.kind === "openGym")) lanes.push("og");
    if (items.some((x) => x.kind === "group" && !x.trainer)) lanes.push("none");
    const laneOf = (x) => (x.kind === "openGym" ? "og" : f && x.origTrainer === f ? f : x.trainer || "none");
    const laneName = (l) => (l === "og" ? t("type.openGym") : l === "none" ? t("o.trainerNeeded") : TRAINERS[l].name);
    return `<div class="cal-scroll" data-scroll>
        <div class="cal" style="${calStyle(lanes.length)}">
          <div class="cal-corner"></div>
          ${lanes.map((l) => `<div class="cal-lane-head">${l === "og" || l === "none" ? "" : `<span class="avatar avatar--sm" aria-hidden="true">${initials(TRAINERS[l].name)}</span>`}<span>${laneName(l)}</span></div>`).join("")}
          ${timeAxis(date)}
          ${lanes.map((l) => {
            const mine = items.filter((x) => laneOf(x) === l);
            const cols = columns(mine);
            return `<div class="cal-lane" data-act="w-slot" data-date="${date}" data-lane="${l}" title="${t("w.slotHint")}">${mine.map((x) => eventButton(x, date, cols.get(x.id), false)).join("")}</div>`;
          }).join("")}
          ${nowLine(date === TODAY)}
        </div>
      </div>`;
  }
  // A real week grid: seven day columns on one time axis (flows/03, WC-02).
  function weekView(date) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i));
    return `<div class="cal-scroll" data-scroll>
        <div class="cal cal--week" style="${calStyle(7)}">
          <div class="cal-corner"></div>
          ${days.map((iso) => `<div class="cal-lane-head${iso === TODAY ? " is-today" : ""}"><button type="button" class="day-link" data-act="w-goto-day" data-v="${iso}">${ucfirst(dayShort(at(iso, "12:00")))}</button></div>`).join("")}
          ${timeAxis(date)}
          ${days.map((iso) => {
            const items = gymItems(iso);
            const cols = columns(items);
            return `<div class="cal-lane${iso === TODAY ? " is-today" : ""}" data-act="w-slot" data-date="${iso}" data-lane="" title="${t("w.slotHint")}">${items.map((x) => eventButton(x, iso, cols.get(x.id), true)).join("")}</div>`;
          }).join("")}
          ${nowLine(days.includes(TODAY))}
        </div>
      </div>`;
  }
  function newWebSessionForm() {
    const m = state.np;
    const clients = Object.entries(CLIENTS).filter(([, c]) => c.ws === state.web.ws);
    return `<form data-form="new-session" novalidate class="form">
        ${field("web-client", t("p.client"), `<select id="web-client" class="input" aria-describedby="${m.errors.client ? "web-client-err" : ""}">
          <option value="">${t("p.pickClient")}</option>
          ${clients.map(([id, c]) => `<option value="${id}" ${m.client === id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select>`, m.errors.client ? t("p.chooseClient") : "")}
        <button type="button" class="btn btn--text btn--inline" data-act="w-new-client">${icon("plus", "ico--sm")}${t("c.new")}</button>
        <div class="field-row">
          ${field("np-date", t("p.date"), `<input id="np-date" class="input" type="date" value="${m.date}">`)}
          ${field("np-time", t("p.time"), `<input id="np-time" class="input" type="time" step="900" value="${m.time}">`)}
        </div>
        <div class="field"><span class="field-label" id="dur-l">${t("p.duration")}</span>
          ${seg("np-dur", [30, 45, 60, 90].map((n) => [String(n), t("p.min", { n })]), String(m.dur), { label: t("p.duration") })}</div>
        ${m.client ? `<div class="field"><span class="field-label">${t("s.location")}</span>${locationBlock(m, m.client)}</div>` : ""}
        ${field("np-workout", t("p.workoutOpt"), `<select id="np-workout" class="input">
          <option value="">${t("p.none")}</option>${Object.entries(state.templates).map(([id, workout]) => `<option value="${id}" ${m.workout === id ? "selected" : ""}>${esc(workout.name)}</option>`).join("")}
        </select>`)}
        <button type="submit" class="btn btn--primary btn--block btn--lg">${t("p.save")}</button>
      </form>`;
  }
  // Group class and Open Gym: web panel and app modal share this form. A weekly series repeats on the same weekday (PRODUCT.md §20).
  function newOccModel(kind, ws) {
    return { kind, ws, title: "", date: shellOf(current().s) === "web" ? state.web.date : TODAY, start: kind === "group" ? "18:00" : "12:00",
      end: kind === "group" ? "19:00" : "13:00", cap: kind === "group" ? 8 : 2, trainer: kind === "group" && WS[ws].kind !== "gym" ? state.me : "",
      loc: WS[ws].loc || (WS_LOCS[ws] || [])[0], repeat: "none", errors: {} };
  }
  function newOccurrenceForm() {
    const m = state.newOcc;
    const group = m.kind === "group";
    const gym = WS[m.ws].kind === "gym";
    const trainers = gym ? GYM_TRAINERS : [state.me];
    return `<form data-form="new-occurrence" novalidate class="form">
        ${manageWorkspaces().length > 1 && shellOf(current().s) === "app" ? `<p class="t-footnote muted">${esc(WS[m.ws].name)}</p>` : ""}
        ${group ? field("occ-title", t("w.className"), `<input id="occ-title" class="input" value="${esc(m.title)}" required>`, m.errors.title ? t("w.classNameRequired") : "") : ""}
        <div class="field-row">
          ${field("occ-date", t("p.date"), `<input id="occ-date" class="input" type="date" value="${m.date}" required>`)}
          ${field("occ-start", t("w.start"), `<input id="occ-start" class="input" type="time" value="${m.start}" required>`)}
        </div>
        <div class="field-row">
          ${field("occ-end", t("w.end"), `<input id="occ-end" class="input" type="time" value="${m.end}" required>`, m.errors.end ? t("w.endError") : "")}
          ${field("occ-cap", t("w.capacity"), `<input id="occ-cap" class="input" type="number" inputmode="numeric" min="1" max="99" value="${m.cap}" required>`, m.errors.cap ? t("w.capacityError") : "")}
        </div>
        ${group ? field("occ-trainer", t("o.trainer"), `<select id="occ-trainer" class="input">${gym ? `<option value="">${t("o.trainerNeeded")}</option>` : ""}${trainers.map((id) => `<option value="${id}" ${m.trainer === id ? "selected" : ""}>${esc(TRAINERS[id].name)}</option>`).join("")}</select>`) : ""}
        ${gym ? `<p class="t-footnote muted">${t("w.locationFixed", { name: esc(WS[m.ws].name) })}</p>`
          : field("occ-loc", t("s.location"), `<select id="occ-loc" class="input">${(WS_LOCS[m.ws] || []).map((l) => `<option value="${l}" ${m.loc === l ? "selected" : ""}>${locName(l)}</option>`).join("")}</select>`)}
        ${field("occ-repeat", t("w.repeat"), `<select id="occ-repeat" class="input">
            <option value="none" ${m.repeat === "none" ? "selected" : ""}>${t("w.repeatNone")}</option>
            <option value="weekly" ${m.repeat === "weekly" ? "selected" : ""}>${t("w.repeatWeekly", { day: weekdayName(at(m.date || TODAY, "12:00")) })}</option>
          </select>`)}
        ${m.repeat === "weekly" ? `<p class="t-footnote muted">${t("w.repeatHint", { n: 8 })}</p>` : ""}
        <button type="submit" class="btn btn--primary btn--block btn--lg">${t(group ? "w.createClass" : "w.publishGym")}</button>
      </form>`;
  }
  function captureOcc() {
    const m = state.newOcc;
    const v = (id) => root.querySelector("#" + id)?.value;
    if (v("occ-title") != null) m.title = v("occ-title").trim();
    ["date", "start", "end", "loc", "repeat"].forEach((k) => { if (v("occ-" + k) != null) m[k] = v("occ-" + k); });
    if (v("occ-cap") != null) m.cap = Number(v("occ-cap"));
    if (v("occ-trainer") != null) m.trainer = v("occ-trainer") || null;
  }
  SCREENS["o-new"] = {
    shell: "app",
    modal: true,
    render() {
      return { nav: { title: t(state.newOcc.kind === "group" ? "w.newClass" : "w.newGym"), large: false, close: true }, body: newOccurrenceForm() };
    },
  };
  const PANEL_MODES = ["pick", "create", "create-client", "create-group", "create-openGym"];
  function webPanel() {
    const w = state.web;
    if (!w.panel && !PANEL_MODES.includes(w.panelMode)) return "";
    const x = w.panel ? findItem(w.panel) : null;
    let body;
    if (w.panelMode === "pick") {
      body = `${w.slot ? `<p class="t-subhead muted">${ucfirst(dayLong(at(w.slot.date, "12:00")))} · <span class="t-num">${w.slot.time}</span></p>` : ""}<ul class="create-grid">
        ${createTile("w-pick", "private", "user", "private", t("new.private"))}
        ${createTile("w-pick", "client", "plus", "neutral", t("c.client"))}
        ${createTile("w-pick", "group", "users", "group", t("type.group"))}
        ${createTile("w-pick", "openGym", "door", "open-gym", t("type.openGym"))}
      </ul>`;
    } else if (w.panelMode === "create") {
      body = newWebSessionForm();
    } else if (w.panelMode === "create-client") {
      body = clientForm(true);
    } else if (w.panelMode === "create-group" || w.panelMode === "create-openGym") {
      body = newOccurrenceForm();
    } else if (x.kind === "private") {
      if (w.panelMode === "move") {
        ensureMove(x);
        body = moveForm(x, true);
      } else {
        body = `<p class="screen-sub">${typeChip("private")}<span class="t-subhead muted">${ucfirst(dayLong(startOf(x)))}</span></p>
          <p class="detail-time t-num">${range(x)}</p>
          <div class="panel-facts">${fact("user", t("w.client"), esc(CLIENTS[x.client].name))}
            ${fact("dumbbell", t("o.trainer"), TRAINERS[x.trainer].name)}${fact("pin", t("s.location"), locName(x.loc))}</div>
          <button type="button" class="btn btn--tonal btn--block" data-act="panel-move">${icon("calendar", "ico--sm")}${t("s.move")}</button>`;
      }
    } else {
      body = occManager(x, true);
    }
    return `<div class="panel-scrim" data-act="w-close"></div>
      <aside class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-h">
        <header class="panel-head"><h2 class="t-title2" id="panel-h" tabindex="-1">${w.panelMode === "pick" ? t("w.new") : w.panelMode === "create" ? t("p.newTitle") : w.panelMode === "create-client" ? t("c.new") : w.panelMode === "create-group" ? t("w.newClass") : w.panelMode === "create-openGym" ? t("w.newGym") : x.kind === "private" ? esc(CLIENTS[x.client].name) : esc(x.title)}</h2>
          <button type="button" class="btn btn--icon btn--ghost" data-act="w-close" aria-label="${t("common.close")}">${icon("x")}</button></header>
        <div class="panel-body">${body}</div>
      </aside>`;
  }

  SCREENS["w-cal"] = {
    shell: "web",
    render() {
      const w = state.web;
      const d = at(w.date, "12:00");
      const title = w.view === "day" ? ucfirst(dayLong(d)) : `${t("w.weekNo", { n: isoWeek(w.date) })} · ${weekRange(mondayOf(w.date))}`;
      return `<div class="web${w.drawer ? " drawer-open" : ""}">
          <aside class="web-side" aria-label="${t("w.menu")}">
            <div class="web-brand"><span class="pub-mark pub-mark--sm" aria-hidden="true">${w.ws === "jg" ? "JG" : "SP"}</span><div><p class="t-label">${esc(WS[w.ws].name)}</p><p class="t-footnote muted">${t(w.ws === "jg" ? "w.ownerJohn" : "w.ownerSarah")}</p></div></div>
            <nav><ul>${NAV_ITEMS.map(([k, ic]) => `<li><a href="#" class="web-nav${k === "calendar" ? " is-active" : ""}" ${k === "calendar" ? `aria-current="page"` : ""} data-act="w-nav" data-v="${k}">${icon(ic, "ico--sm")}<span>${t("w.nav." + k)}</span></a></li>`).join("")}</ul></nav>
          </aside>
          <div class="web-scrim" data-act="w-drawer"></div>
          <div class="web-main">
            <header class="web-top">
              <button type="button" class="btn btn--icon btn--ghost web-menu" data-act="w-drawer" aria-label="${t("w.menu")}">${icon("menu")}</button>
              <h1 class="t-title1" tabindex="-1">${t("w.nav.calendar")}</h1>
              <button type="button" class="btn btn--primary web-new" data-act="w-new" aria-label="${t("w.new")}">${icon("plus", "ico--sm")}<span>${t("new.title")}</span></button>
            </header>
            <div class="web-toolbar">
              <div class="date-nav">
                <button type="button" class="btn btn--icon btn--outline" data-act="w-step" data-v="-1" aria-label="${t(w.view === "day" ? "w.prevDay" : "w.prevWeek")}">${icon("chevL", "ico--sm")}</button>
                <button type="button" class="btn btn--outline" data-act="w-today">${t("w.today")}</button>
                <button type="button" class="btn btn--icon btn--outline" data-act="w-step" data-v="1" aria-label="${t(w.view === "day" ? "w.nextDay" : "w.nextWeek")}">${icon("chevR", "ico--sm")}</button>
              </div>
              <p class="date-title t-headline" aria-live="polite">${title}</p>
              ${w.ws === "jg" ? `<select id="w-trainer" class="input input--sm" aria-label="${t("w.trainerFilter")}"><option value="">${t("w.allTrainers")}</option>${GYM_TRAINERS.map((id) => `<option value="${id}" ${w.trainer === id ? "selected" : ""}>${TRAINERS[id].name}</option>`).join("")}</select>` : ""}
              ${seg("w-view", [["day", t("w.day")], ["week", t("w.week")]], w.view, { label: t("w.week"), small: true })}
            </div>
            <p class="t-footnote muted web-scope">${t("w.onlyWs", { ws: esc(WS[w.ws].name) })}</p>
            <div class="legend">${typeChip("private")}${typeChip("group")}${typeChip("openGym")}<span class="t-footnote muted legend-hint">${t("w.slotHint")}</span></div>
            ${w.view === "day" ? dayView(w.date) : weekView(w.date)}
          </div>
          ${webPanel()}
        </div>`;
    },
  };

  // ---------------------------------------------------------------- shells
  function shellOf(s) {
    return SCREENS[s].shell;
  }
  function protobar(kind) {
    const flowTitle = {
      public: current().s.startsWith("l-") ? t("flow5.title") : t("flow1.title"), web: t(`flow${state.web.flow}.title`), app: "",
    }[kind];
    return `<div class="protobar" role="region" aria-label="${t("proto.label")}">
        <button type="button" class="pb-home" data-act="home" aria-label="${t("proto.home")}">${icon("home", "ico--sm")}<span>${t("proto.home")}</span></button>
        <span class="pb-title">${t("proto.label")}${flowTitle ? ` · ${flowTitle}` : ""}</span>
        <div class="pb-controls">
          ${kind === "public" ? "" : seg("set-lang", [["nl", "NL"], ["en", "EN"]], state.lang, { label: t("proto.lang"), small: true })}
          ${kind === "app" ? seg("set-platform", [["ios", "iOS"], ["android", "Android"]], state.platform, { label: t("proto.style"), small: true }) : ""}
          <details class="appearance">
            <summary aria-label="${t("proto.appearance")}">${icon("sliders", "ico--sm")}<span>${t("proto." + state.theme)}</span></summary>
            <div class="appearance-panel"><p class="t-label">${t("proto.appearance")}</p>${seg("set-theme", [["light", t("proto.light")], ["dark", t("proto.dark")]], state.theme, { label: t("proto.appearance") })}</div>
          </details>
        </div>
      </div>`;
  }
  function navbar(nav) {
    const ios = state.platform === "ios";
    // close: leave the whole modal task; cancel: leave only this screen.
    const lead = nav.close
      ? (ios ? `<button type="button" class="nav-text" data-act="close-modal">${nav.closeLabel || t("common.cancel")}</button>`
        : `<button type="button" class="nav-icon" data-act="close-modal" aria-label="${nav.closeLabel || t("common.close")}">${icon("x")}</button>`)
      : nav.cancel
        ? (ios ? `<button type="button" class="nav-text" data-act="back">${t("common.cancel")}</button>`
          : `<button type="button" class="nav-icon" data-act="back" aria-label="${t("common.cancel")}">${icon("x")}</button>`)
        : nav.back
          ? (ios ? `<button type="button" class="nav-back" data-act="back">${icon("chevL")}<span>${nav.back}</span></button>`
            : `<button type="button" class="nav-icon" data-act="back" aria-label="${t("common.back")}">${icon("arrowL")}</button>`)
          : "";
    const actions = (nav.actions || []).map((a) =>
      `<button type="button" class="nav-icon" data-act="${a.act}" aria-label="${a.label}">${icon(a.icon)}</button>`).join("")
      + (nav.text || []).map((a) => `<button type="button" class="nav-text nav-text--strong" data-act="${a.act}">${a.label}</button>`).join("");
    if (ios) {
      return `<header class="nav nav--ios${nav.large ? " nav--large" : ""}">
          <div class="nav-bar"><div class="nav-lead">${lead}</div>${nav.large ? "<span></span>" : `<p class="nav-title">${nav.title}</p>`}<div class="nav-trail">${actions}</div></div>
          ${nav.large ? `<h1 class="nav-large-title" tabindex="-1">${nav.title}</h1>` : ""}
          ${nav.subtitle ? `<p class="nav-subtitle">${nav.subtitle}</p>` : ""}
        </header>`;
    }
    return `<header class="nav nav--md">
        <div class="nav-bar">${lead}<h1 class="nav-title" tabindex="-1">${nav.title}</h1><div class="nav-trail">${actions}</div></div>
        ${nav.subtitle ? `<p class="nav-subtitle">${nav.subtitle}</p>` : ""}
      </header>`;
  }
  function tabbar(active) {
    const tabs = [["today", "today", "tab.today"], ["calendar", "calendar", "tab.calendar"], ["clients", "users", "tab.clients"], ["more", "more", "tab.more"]];
    return `<nav class="tabbar tabbar--${state.platform}" aria-label="${t("proto.label")}">${tabs.map(([k, ic, key]) =>
      `<button type="button" class="tab${k === active ? " is-active" : ""}" data-act="tab" data-v="${k}" ${k === active ? `aria-current="page"` : ""}>
        <span class="tab-ico">${icon(ic)}</span><span class="tab-label">${t(key)}</span></button>`).join("")}</nav>`;
  }
  function sheetHtml(kind) {
    if (!state.sheet) return "";
    const c = sheetContent();
    const ios = state.platform === "ios" && kind === "app";
    const head = ios
      ? `<header class="sheet-head sheet-head--ios"><button type="button" class="nav-text" data-act="sheet-close">${t("common.cancel")}</button><h2 class="sheet-title" id="sheet-h" tabindex="-1">${c.title}</h2><span></span></header>`
      : `<header class="sheet-head"><h2 class="sheet-title" id="sheet-h" tabindex="-1">${c.title}</h2><button type="button" class="btn btn--icon btn--ghost" data-act="sheet-close" aria-label="${t("common.close")}">${icon("x")}</button></header>`;
    return `<div class="scrim" data-act="sheet-close"></div>
      <section class="sheet sheet--${kind === "app" ? state.platform : "web"}" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
        ${kind === "app" ? `<span class="grabber" aria-hidden="true"></span>` : ""}
        ${head}
        <div class="sheet-body">${c.body}</div>
        ${c.actions ? `<div class="sheet-actions">${c.actions}</div>` : ""}
      </section>`;
  }

  const root = document.getElementById("app");
  function render(opts = {}) {
    const cur = current();
    const def = SCREENS[cur.s];
    const kind = def.shell;
    const key = JSON.stringify(cur);
    const prevScroll = !opts.nav && root.dataset.key === key ? [...root.querySelectorAll("[data-scroll]")].map((el) => el.scrollTop) : null;

    document.documentElement.lang = activeLang() === "nl" ? "nl" : "en";
    document.documentElement.dataset.platform = kind === "app" ? state.platform : "web";
    document.documentElement.dataset.shell = kind;
    document.documentElement.dataset.theme = state.theme;

    const out = def.render();
    let html;
    if (kind === "hub") {
      html = `<div class="stage stage--page" data-scroll>${out}</div>`;
    } else if (kind === "public") {
      const foot = def.noFooter ? "" : `<footer class="pub-foot t-footnote muted">${t("b.footer")}</footer>`;
      html = `${protobar(kind)}<div class="stage stage--page stage--public" data-scroll><div class="pub">${out}${foot}</div></div>`;
    } else if (kind === "web") {
      html = `${protobar(kind)}<div class="stage stage--web">${out}${sheetHtml("web")}</div>`;
    } else {
      html = `${protobar(kind)}<div class="stage stage--app"><div class="device"><div class="app${def.modal ? " app--modal" : ""}">
          ${navbar(out.nav)}
          <main class="scroll" data-scroll><div class="content">${out.body}</div></main>
          ${out.dock ? `<div class="dock">${out.dock}</div>` : ""}
          ${def.tab ? tabbar(def.tab) : ""}
          ${out.fab ? `<button type="button" class="fab" data-act="${out.fab.act}" aria-label="${out.fab.label}">${icon(out.fab.icon)}</button>` : ""}
          ${sheetHtml("app")}
        </div></div></div>`;
    }
    root.innerHTML = html;
    root.dataset.key = key;

    if (prevScroll) {
      root.querySelectorAll("[data-scroll]").forEach((el, i) => { el.scrollTop = prevScroll[i] || 0; });
    }
    const cal = root.querySelector(".cal-scroll");
    const calKey = cal ? `${state.web.view}|${state.web.date}|${state.web.ws}` : "";
    if (cal && render.calKey !== calKey) cal.scrollTop = (7 - H0) * HOUR_PX - 12;
    render.calKey = calKey;
    if (opts.nav) {
      const target = root.querySelector(state.sheet ? "#sheet-h" : ".web-panel-focus, h1[tabindex], .screen-h[tabindex], .log-ex[tabindex]");
      if (target) target.focus({ preventScroll: true });
    } else if (opts.focusSheet) {
      root.querySelector("#sheet-h")?.focus({ preventScroll: true });
    }
  }

  // ---------------------------------------------------------------- toast
  const toastEl = document.getElementById("toast");
  let toastTimer;
  function toast(text) {
    toastEl.innerHTML = `<span>${text}</span>`;
    toastEl.dataset.platform = document.documentElement.dataset.platform;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2800);
  }

  // ---------------------------------------------------------------- booking helpers
  function releaseHold() {
    const b = state.booking;
    const occ = findClass(b.occ);
    if (occ && b.attId) occ.attendees = occ.attendees.filter((a) => !(a.id === b.attId && a.status === "pending"));
    b.holdAt = null;
  }
  function expireHold() {
    releaseHold();
    state.stack = state.stack.filter((f) => !["b-check", "b-mail", "b-confirm"].includes(f.s));
    go("b-expired");
  }
  setInterval(() => {
    const b = state.booking;
    if (!b.holdAt) return;
    const left = HOLD_MS - (Date.now() - b.holdAt);
    if (left <= 0) {
      if (current().s.startsWith("b-")) expireHold();
      else releaseHold();
      return;
    }
    const el = root.querySelector("[data-countdown]");
    if (el) el.textContent = t("b.holdLeft", { time: mmss(left) });
    const bar = root.querySelector("[data-countdown-bar]");
    if (bar) bar.style.width = `${(left / HOLD_MS) * 100}%`;
  }, 1000);

  // ---------------------------------------------------------------- actions
  const A = {
    home: () => reset([{ s: "hub" }]),
    back,
    flow: (el) => FLOWS[el.dataset.v](),
    "reset-demo": () => {
      Object.keys(CLIENTS).forEach((id) => { if (CLIENTS[id].created) delete CLIENTS[id]; });
      Object.assign(state, fresh());
      reset([{ s: "hub" }]);
      toast(t("proto.resetDone"));
    },
    "set-lang": (el) => { state.lang = el.dataset.v; prefs.set("lang", state.lang); render(); },
    "set-preview-lang": (el) => { state.previewLang = el.dataset.v; render(); },
    "set-platform": (el) => { state.platform = el.dataset.v; prefs.set("platform", state.platform); render(); },
    "set-theme": (el) => {
      // Appearance is presentation only: retain even unsubmitted native form values.
      const fields = [...root.querySelectorAll("input, select, textarea")].filter((node) => node.id)
        .map((node) => ({ id: node.id, value: node.value, checked: node.checked }));
      const open = [...root.querySelectorAll("details[open]")].map((node) => node.className);
      state.theme = el.dataset.v;
      render();
      fields.forEach(({ id, value, checked }) => {
        const node = document.getElementById(id);
        if (node) { node.value = value; if ("checked" in node) node.checked = checked; }
      });
      root.querySelectorAll("details").forEach((node) => { node.open = open.includes(node.className); });
      root.querySelector(`[data-act="set-theme"][data-v="${state.theme}"]`)?.focus({ preventScroll: true });
    },
    "set-me": (el) => { state.me = el.dataset.v; state.log = null; prefs.set("me", state.me); render(); },

    // flow 1
    "b-mode": (el) => { state.booking.mode = el.dataset.v; state.booking.day = null; render(); },
    "b-day": (el) => { state.booking.day = el.dataset.v; render(); },
    "b-pick": (el) => {
      const b = state.booking;
      if (b.occ !== el.dataset.id) Object.assign(b, { occ: el.dataset.id, errors: {} });
      go("b-form");
    },
    "b-resend": () => toast(t("b.resent")),
    "b-wrong-email": () => { releaseHold(); state.stack = state.stack.filter((f) => f.s !== "b-check"); render({ nav: true }); },
    "b-expire": () => expireHold(),
    "b-open-mail": () => go("b-mail"),
    "b-mail-link": () => go("b-confirm"),
    "b-confirm": () => {
      const b = state.booking;
      const occ = findClass(b.occ);
      const att = occ.attendees.find((a) => a.id === b.attId);
      if (!att) return expireHold();
      Object.assign(att, { status: "booked", isNew: true });
      b.holdAt = null;
      reset([{ s: "hub" }, { s: "b-list" }, { s: "b-confirmed" }]);
    },
    "b-account": () => { state.booking.confirmCancel = false; reset([{ s: "hub" }, { s: "b-list" }, { s: "b-account" }]); },
    "b-no-account": () => reset([{ s: "hub" }, { s: "b-list" }, { s: "b-done" }]),
    "b-restart": () => { const mode = state.booking.mode; state.booking = { ...fresh().booking, mode, name: state.booking.name, email: state.booking.email }; reset([{ s: "hub" }, { s: "b-list" }]); },
    "b-retry": () => { state.booking.errors = {}; reset([{ s: "hub" }, { s: "b-list" }, { s: "b-form" }]); },
    "b-cancel-ask": () => { state.booking.confirmCancel = true; render(); },
    "b-cancel-no": () => { state.booking.confirmCancel = false; render(); },
    "b-cancel-yes": () => {
      const b = state.booking;
      const att = findClass(b.occ).attendees.find((a) => a.id === b.attId);
      if (att) att.status = "cancelledByClient";
      b.confirmCancel = false;
      render();
      toast(t("b.cancelledToast"));
    },

    // trainer app navigation
    tab: (el) => reset([{ s: "hub" }, { s: "t-" + el.dataset.v }]),
    "open-session": (el) => go("t-session", { id: el.dataset.id }),
    "open-occ": (el) => go("t-occ", { id: el.dataset.id }),
    "close-modal": () => {
      while (state.stack.length > 1 && SCREENS[current().s].modal) state.stack.pop();
      render({ nav: true });
    },
    "session-att": (el) => {
      const x = findSession(current().id);
      x.status = x.status === el.dataset.v ? "booked" : el.dataset.v;
      render();
    },

    // Agenda tab
    "ag-day": (el) => { state.agenda.date = el.dataset.v; render(); },
    "ag-view": (el) => { state.agenda.view = el.dataset.v; render(); },
    "ag-today": () => { state.agenda.date = TODAY; render(); },
    "ag-step": (el) => {
      const a = state.agenda;
      const dir = Number(el.dataset.v);
      if (a.view === "week") a.date = addDays(a.date, dir * 7);
      else {
        const [y, m] = a.date.split("-").map(Number);
        const d = new Date(Date.UTC(y, m - 1 + dir, 1));
        const iso = d.toISOString().slice(0, 10);
        a.date = iso.slice(0, 7) === TODAY.slice(0, 7) ? TODAY : iso;
      }
      render();
    },

    // "+" menu (app)
    "app-new-menu": () => { state.sheet = { kind: "new" }; render({ focusSheet: true }); },
    "app-new": (el) => {
      const v = el.dataset.v;
      state.sheet = null;
      if (v === "private") { state.np = null; return go("p-client"); }
      if (v === "client") { state.cn = newClientModel("clients"); return go("c-new"); }
      state.newOcc = newOccModel(v, manageWorkspaces()[0]);
      go("o-new");
    },

    // clients
    "open-client": (el) => go("t-client", { id: el.dataset.v }),
    "c-new": () => { state.cn = newClientModel("clients"); go("c-new"); },
    "np-new-client": () => {
      state.cn = newClientModel("picker", { name: root.querySelector("#client-search")?.value.trim() || "" });
      go("c-new");
    },
    "cn-lang": (el) => { captureClient(); state.cn.lang = el.dataset.v; render(); },
    "cn-ws": (el) => { captureClient(); Object.assign(state.cn, { ws: el.dataset.v, loc: "", dup: null }); render(); },
    "cn-use": (el) => finishClient(el.dataset.v),
    "cn-back": () => { state.cn = null; state.web.panelMode = "create"; render(); },
    "c-plan": (el) => { A["np-client"](el); },
    // A workout without a planned session: create a private session that starts now (flows/05 WL-01).
    "c-train": (el) => {
      const id = el.dataset.v;
      const c = CLIENTS[id];
      const inf = inferLocation(id);
      const sid = `p-now-${Date.now()}`;
      const start = time(NOW);
      const endAt = new Date(NOW.getTime() + 3600000);
      state.sessions.push({ id: sid, kind: "private", client: id, trainer: state.me, ws: c.ws,
        loc: inf.loc || inf.options?.[0] || (WS_LOCS[c.ws] || [])[0], date: TODAY, start, end: time(endAt), status: "booked", workout: "" });
      state.log = null;
      state.stack.push({ s: "t-session", id: sid });
      go("l-start", { id: sid });
      toast(t("c.sessionNow", { time: start }));
    },

    // flow 4
    "np-client": (el) => {
      const inf = inferLocation(el.dataset.v);
      state.np = { client: el.dataset.v, trainer: state.me, date: TODAY, time: "12:00", dur: 60, workout: "", locChoice: inf.ambiguous ? null : inf.loc, locOther: "", showLocOptions: false, errors: {} };
      go("p-form");
    },
    "np-dur": (el) => { captureForm(); state.np.dur = Number(el.dataset.v); render(); },
    "loc-change": () => { const m = model(); captureForm(); m.showLocOptions = true; render(); },
    "loc-pick": (el) => { const m = model(); captureForm(); m.locChoice = el.dataset.v; m.errors = {}; render(); if (el.dataset.v === "other") root.querySelector("#loc-other")?.focus(); },
    "move-session": (el) => { state.mv = null; go("p-move", { id: el.dataset.id }); },

    // flow 5
    "start-log": (el) => {
      const x = findSession(el.dataset.id);
      if (state.log?.id !== x.id) {
        if (!x.workout) { state.log = null; return go("l-start", { id: x.id }); }
        startLog(x.id, "template", x.workout);
      }
      go("l-overview", { id: x.id });
    },
    "log-begin": (el) => {
      const id = current().id;
      startLog(id, el.dataset.v, el.dataset.id);
      state.stack.pop();
      if (el.dataset.v === "empty") {
        state.stack.push({ s: "l-overview", id });
        return go("l-add", { id });
      }
      go("l-overview", { id });
    },
    "log-open": (el) => { const L = state.log; L.i = Number(el.dataset.v); L.sel = null; go("l-log", { id: L.id }); },
    "log-add": () => go("l-add", { id: state.log.id }),
    "log-add-ex": (el) => addExercise(el.dataset.v),
    "log-new-ex": () => {
      const q = root.querySelector("#ex-search")?.value.trim();
      if (!q) return;
      const id = `cx-${Date.now()}`;
      state.customEx[id] = { custom: true, name: q, step: 2.5 };
      addExercise(id);
      toast(t("l.exCreated"));
    },
    "log-sel": (el) => { const L = state.log; const i = Number(el.dataset.v); L.sel = L.sel === i ? null : i; render(); },
    "log-check": (el) => {
      const L = state.log;
      const it = L.items[L.i];
      const i = Number(el.dataset.v);
      const r = it.rows[i];
      r.done = !r.done;
      if (r.done) carry(it, i);
      L.sel = null;
      render();
    },
    "log-save": () => {
      const L = state.log;
      const it = L.items[L.i];
      const a = activeRow(it, L);
      if (a < 0) return;
      if (!it.rows[a].done) { it.rows[a].done = true; carry(it, a); }
      L.sel = null;
      render();
    },
    "log-step": (el) => {
      const L = state.log;
      const it = L.items[L.i];
      const a = activeRow(it, L);
      if (a < 0) return;
      const r = it.rows[a];
      const dir = Number(el.dataset.v);
      if (el.dataset.k === "w") {
        r.w = Math.max(0, Math.round((r.w + dir * exDef(it.ex).step) * 100) / 100);
        carry(it, a, ["w"]);
      } else r.r = Math.max(0, r.r + dir);
      r.touched = true;
      render();
    },
    "log-add-set": () => {
      const L = state.log;
      const it = L.items[L.i];
      const last = it.rows[it.rows.length - 1] || { w: 0, r: 10 };
      it.rows.push({ w: last.w, r: last.r, done: false, touched: false });
      Object.assign(L, { changed: true, sel: null });
      render();
    },
    "log-diff": (el) => { state.log.items[state.log.i].diff = el.dataset.v; render(); },
    "log-ex": (el) => {
      const L = state.log;
      const dir = Number(el.dataset.v);
      L.sel = null;
      if (dir > 0 && L.i === L.items.length - 1) return back();
      L.i = Math.min(L.items.length - 1, Math.max(0, L.i + dir));
      render({ nav: true });
    },
    "log-finish": () => { state.log.confirmEmpty = false; go("l-finish", { id: state.log.id }); },
    "log-save-tpl": (el) => {
      const L = state.log;
      captureFinish();
      L.saveTpl = el.checked;
      L.tplErr = false;
      if (L.saveTpl && !L.tplName) {
        const x = findSession(L.id);
        L.tplName = L.name || `${CLIENTS[x.client].first} · ${dayMonth(startOf(x))}`;
      }
      render();
    },
    "log-empty-back": () => { state.log.confirmEmpty = false; render(); },
    "log-done": (el) => {
      const L = state.log;
      captureFinish();
      const x = findSession(L.id);
      const items = recordItems(L);
      if (!items.length && !el.dataset.force) { L.confirmEmpty = true; return render(); }
      if (L.saveTpl && !L.tplName.trim()) { L.tplErr = true; return render(); }
      x.status = "attended";
      state.log = null;
      if (!items.length) {
        reset([{ s: "hub" }, { s: "t-today" }, { s: "t-session", id: x.id }]);
        return toast(t("l.closedEmpty"));
      }
      let name = L.name;
      if (L.saveTpl) {
        const tid = `tpl-${Date.now()}`;
        name = L.tplName.trim();
        state.templates[tid] = { name, items: items.map((it) => [it.ex, it.sets.length, it.sets[0][1]]) };
        (state.assigned[x.client] ||= []).unshift(tid);
      }
      state.completedWorkouts[x.id] = { id: x.id, name, items, internalNote: L.internalNote, clientNote: "", shared: false };
      (state.history[x.client] ||= []).unshift({ date: x.date, trainer: x.trainer, name, items: items.map((it) => [it.ex, it.sets]) });
      reset([{ s: "hub" }, { s: "t-today" }, { s: "t-session", id: x.id }, { s: "l-complete", id: x.id }]);
      toast(L.saveTpl ? t("l.savedTpl", { name: esc(name) }) : t("l.saved"));
    },
    "open-share": (el) => go(state.completedWorkouts[el.dataset.id].shared ? "l-sent" : "l-complete", { id: el.dataset.id }),
    "share-later": () => reset([{ s: "hub" }, { s: "t-today" }, { s: "t-session", id: current().id }]),
    "share-review": () => go("l-review", { id: current().id }),
    "share-confirm": () => {
      const id = current().id;
      state.completedWorkouts[id].shared = true;
      reset([{ s: "hub" }, { s: "t-today" }, { s: "t-session", id }, { s: "l-sent", id }]);
    },
    "view-email": () => { state.previewLang = CLIENTS[findSession(current().id).client].lang; go("l-email", { id: current().id }); },
    "view-profile": () => {
      if (current().s !== "l-email") state.previewLang = CLIENTS[findSession(current().id).client].lang;
      go("l-profile", { id: current().id });
    },

    // flow 6 + web panel
    att: (el) => {
      const occ = findClass(el.dataset.occ);
      const a = occ.attendees.find((p) => p.id === el.dataset.id);
      a.status = a.status === el.dataset.v ? "booked" : el.dataset.v;
      render();
    },
    "open-sub": (el) => { state.sheet = { kind: "sub", occ: el.dataset.id, pick: null, scope: "this", email: true, notify: false }; render({ focusSheet: true }); },
    "open-cancel": (el) => { state.sheet = { kind: "cancel", occ: el.dataset.id, scope: "this", message: "" }; render({ focusSheet: true }); },
    "sheet-close": () => { state.sheet = null; render(); },
    "sub-pick": (el) => { state.sheet.pick = el.dataset.v; render(); },
    "sub-email": (el) => { state.sheet.email = el.checked; },
    "sub-notify": (el) => { state.sheet.notify = el.checked; },
    "sheet-scope": (el) => { state.sheet.scope = el.dataset.v; render(); },
    "sub-confirm": () => {
      const sh = state.sheet;
      const occ = findClass(sh.occ);
      const targets = sh.scope === "following"
        ? state.classes.filter((c) => c.title === occ.title && c.ws === occ.ws && c.start === occ.start && c.date >= occ.date)
        : [occ];
      targets.forEach((c) => { if (!c.origTrainer && c.trainer) c.origTrainer = c.trainer; c.trainer = sh.pick; if (c.origTrainer === c.trainer) c.origTrainer = null; });
      const name = TRAINERS[sh.pick].name;
      state.sheet = null;
      render();
      toast(t("o.subDone", { name }));
    },
    "cancel-confirm": () => {
      const sh = state.sheet;
      const occ = findClass(sh.occ);
      const targets = sh.scope === "following"
        ? state.classes.filter((c) => c.title === occ.title && c.ws === occ.ws && c.start === occ.start && c.date >= occ.date)
        : [occ];
      targets.forEach((c) => { c.status = "cancelled"; });
      state.sheet = null;
      render();
      toast(t("o.cancelled"));
    },

    // flow 3
    "w-open": (el) => { state.web.panel = el.dataset.id; state.web.panelMode = null; state.mv = null; render(); root.querySelector("#panel-h")?.focus({ preventScroll: true }); },
    "w-close": () => { state.web.panel = null; state.web.panelMode = null; state.np = null; state.cn = null; render(); },
    "w-view": (el) => { state.web.view = el.dataset.v; render(); },
    "w-step": (el) => { const w = state.web; w.date = addDays(w.date, Number(el.dataset.v) * (w.view === "day" ? 1 : 7)); w.panel = null; render(); },
    "w-today": () => { state.web.date = TODAY; render(); },
    "w-goto-day": (el) => { Object.assign(state.web, { date: el.dataset.v, view: "day" }); render(); },
    "w-drawer": () => { state.web.drawer = !state.web.drawer; render(); },
    "w-nav": (el) => { state.web.drawer = false; render(); if (el.dataset.v !== "calendar") toast(t("proto.notInScope")); },
    // Clicking an empty moment opens "+ Nieuw" at that time, snapped to 15 minutes.
    "w-slot": (el, e) => {
      const y = e.clientY - el.getBoundingClientRect().top;
      const mins = Math.min((H1 * 60) - 60, H0 * 60 + Math.max(0, Math.floor((y / HOUR_PX) * 4)) * 15);
      const lane = el.dataset.lane;
      Object.assign(state.web, { slot: { date: el.dataset.date, time: hhmm(mins), trainer: TRAINERS[lane] ? lane : "" }, panel: null, panelMode: "pick" });
      render();
      root.querySelector("#panel-h")?.focus({ preventScroll: true });
    },
    "w-new": () => {
      state.web.slot = null;
      state.web.panel = null;
      state.web.panelMode = "pick";
      render();
      root.querySelector("#panel-h")?.focus({ preventScroll: true });
    },
    "w-pick": (el) => {
      const kind = el.dataset.v;
      if (kind === "client") {
        state.cn = newClientModel("web");
        state.web.panelMode = "create-client";
        render();
        root.querySelector("#panel-h")?.focus({ preventScroll: true });
        return;
      }
      const slot = state.web.slot;
      if (kind !== "private") {
        state.newOcc = newOccModel(kind, state.web.ws);
        if (slot) Object.assign(state.newOcc, { date: slot.date, start: slot.time, end: plusMinutes(slot.time, 60), trainer: kind === "group" ? slot.trainer : "" });
        state.web.panelMode = `create-${kind}`;
        render();
        root.querySelector("#panel-h")?.focus({ preventScroll: true });
        return;
      }
      state.np = { client: null, trainer: slot?.trainer || (state.web.ws === "jg" ? "john" : "sarah"), date: slot?.date || state.web.date,
        time: slot?.time || "12:00", dur: 60, workout: "", locChoice: null, locOther: "", showLocOptions: false, errors: {} };
      state.web.panelMode = "create";
      render();
      root.querySelector("#panel-h")?.focus({ preventScroll: true });
    },
    "w-new-client": () => { captureForm(); state.cn = newClientModel("web-session"); state.web.panelMode = "create-client"; render(); },
    "panel-move": () => { state.web.panelMode = "move"; render(); },
    "panel-details": () => { state.web.panelMode = null; state.mv = null; render(); },
  };

  // The location block is shared by new-session and reschedule forms.
  function model() {
    return current().s === "p-form" || state.web.panelMode === "create" ? state.np : state.mv;
  }
  function captureForm() {
    const m = model();
    if (!m) return;
    const pre = current().s === "p-form" || state.web.panelMode === "create" ? "np" : "mv";
    const v = (id) => root.querySelector("#" + id)?.value;
    if (v(pre + "-date")) m.date = v(pre + "-date");
    if (v(pre + "-time")) m.time = v(pre + "-time");
    if (pre === "np" && v("np-workout") != null) m.workout = v("np-workout");
    if (v("loc-other") != null) m.locOther = v("loc-other");
  }

  function captureClient() {
    const m = state.cn;
    const v = (id) => root.querySelector("#" + id)?.value;
    if (v("cn-name") != null) m.name = v("cn-name");
    if (v("cn-email") != null) m.email = v("cn-email");
    if (v("cn-loc") != null) m.loc = v("cn-loc");
  }
  function selectWebClient(id) {
    const inf = inferLocation(id);
    Object.assign(state.np, { client: id || null, locChoice: inf && !inf.ambiguous ? inf.loc : null, locOther: "", showLocOptions: false, errors: {} });
  }
  // After adding (or reusing) a client, continue where the trainer came from.
  function finishClient(id) {
    const from = state.cn.from;
    state.cn = null;
    if (from === "clients") { state.stack.pop(); go("t-client", { id }); }
    else if (from === "picker") { state.stack.pop(); A["np-client"]({ dataset: { v: id } }); }
    else if (from === "web-session") { selectWebClient(id); state.web.panelMode = "create"; render(); }
    else { state.web.panelMode = null; render(); }
  }
  function captureFinish() {
    const L = state.log;
    const v = (id) => root.querySelector("#" + id)?.value;
    if (v("internal-note") != null) L.internalNote = v("internal-note");
    if (v("tpl-name") != null) L.tplName = v("tpl-name");
  }
  // Search ignores case and accents and matches Dutch and English names (PS-02, WL-04).
  function filterList(input) {
    const q = fold(input.value.trim());
    let shown = 0;
    root.querySelectorAll(".content li[data-name]").forEach((li) => {
      li.hidden = !!q && !li.dataset.name.includes(q);
      if (!li.hidden) shown++;
    });
    root.querySelectorAll("[data-client-group], [data-filter-group]").forEach((g) => { g.hidden = !g.querySelector("li[data-name]:not([hidden])"); });
    const none = root.querySelector("[data-no-results]");
    if (none) none.hidden = shown > 0;
    const raw = esc(input.value.trim());
    const newClient = root.querySelector("[data-new-client-label]");
    if (newClient) newClient.innerHTML = raw ? t("c.newNamed", { name: raw }) : t("c.newQuick");
    const newEx = root.querySelector("[data-new-ex]");
    if (newEx) { newEx.hidden = !raw; newEx.innerHTML = `${icon("plus", "ico--sm")}${t("l.newEx", { name: raw })}`; }
  }

  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    if (el.tagName === "A") e.preventDefault();
    const fn = A[el.dataset.act];
    if (fn) fn(el, e);
  });
  root.addEventListener("input", (e) => {
    if (e.target.id === "client-search" || e.target.id === "ex-search") filterList(e.target);
    if (e.target.id === "tpl-name" && state.log) state.log.tplName = e.target.value;
    if (e.target.id === "internal-note" && state.log) state.log.internalNote = e.target.value;
    if (e.target.id === "client-note" && state.completedWorkouts[current().id]) state.completedWorkouts[current().id].clientNote = e.target.value;
    if (e.target.id === "cancel-message" && state.sheet?.kind === "cancel") state.sheet.message = e.target.value;
  });
  root.addEventListener("change", (e) => {
    const id = e.target.id;
    if (id === "w-trainer") { state.web.trainer = e.target.value; state.web.panel = null; render(); }
    if (id === "web-client") {
      captureForm();
      if (e.target.value) selectWebClient(e.target.value);
      else Object.assign(state.np, { client: null, locChoice: null, errors: {} });
      render();
    }
    if ((id === "occ-date" || id === "occ-repeat") && state.newOcc) { captureOcc(); render(); }
    if (id === "cn-loc" && state.cn) state.cn.loc = e.target.value;
    if ((id === "step-w" || id === "step-r") && state.log) {
      const L = state.log;
      const it = L.items[L.i];
      const a = activeRow(it, L);
      const n = Number(e.target.value.replace(",", "."));
      if (a >= 0 && Number.isFinite(n) && n >= 0) {
        const k = id === "step-w" ? "w" : "r";
        it.rows[a][k] = k === "r" ? Math.round(n) : Math.round(n * 100) / 100;
        it.rows[a].touched = true;
        if (k === "w") carry(it, a, ["w"]);
      }
      render();
    }
  });
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target.dataset.form;
    if (form === "booking") {
      const b = state.booking;
      b.name = e.target.elements.namedItem("name").value.trim();
      b.email = e.target.elements.namedItem("email").value.trim();
      b.errors = { name: !b.name, email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.email) };
      if (b.errors.name || b.errors.email) {
        render();
        root.querySelector(b.errors.name ? "#b-name" : "#b-email")?.focus();
        return;
      }
      const occ = findClass(b.occ);
      releaseHold();
      if (spotsLeft(occ) <= 0) return reset([{ s: "hub" }, { s: "b-list" }]);
      b.attId = `hold-${Date.now()}`;
      occ.attendees.push({ id: b.attId, name: b.name, lang: state.lang === "en" ? "en" : "nl", guest: true, status: "pending" });
      b.holdAt = Date.now();
      go("b-check");
    }
    if (form === "new-session" || form === "move") {
      captureForm();
      const m = model();
      const clientId = form === "new-session" ? m.client : findSession(m.id).client;
      if (!clientId) { m.errors = { client: true }; render(); root.querySelector("#web-client")?.focus(); return; }
      const inf = inferLocation(clientId);
      const loc = m.locChoice === "other" ? (m.locOther.trim() || null) : m.locChoice || (!m.showLocOptions && !inf.ambiguous ? inf.loc : null);
      if (!loc) { m.errors = { loc: true }; render(); return; }
      if (m.locChoice === "other") LOCS[loc] = LOCS[loc] || { name: loc };
      const [h, min] = m.time.split(":").map(Number);
      if (form === "new-session") {
        const endMin = h * 60 + min + m.dur;
        const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
        const id = `p-new-${Date.now()}`;
        state.sessions.push({ id, kind: "private", client: clientId, trainer: m.trainer || state.me, ws: CLIENTS[clientId].ws, loc, date: m.date, start: m.time, end, status: "booked", workout: m.workout });
        state.np = null;
        if (shellOf(current().s) === "web") {
          state.web.date = m.date;
          state.web.panel = id;
          state.web.panelMode = null;
          render();
        } else reset([{ s: "hub" }, { s: "t-today" }]);
        toast(t("p.saved"));
      } else {
        const x = findSession(m.id);
        const dur = (endOf(x) - startOf(x)) / 60000;
        const endMin = h * 60 + min + dur;
        Object.assign(x, { date: m.date, start: m.time, end: `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`, loc });
        state.mv = null;
        if (shellOf(current().s) === "web") {
          state.web.panelMode = null;
          state.web.date = x.date;
          render();
        } else {
          back();
        }
        toast(t("p.moved"));
      }
    }
    if (form === "new-occurrence") {
      const m = state.newOcc;
      captureOcc();
      m.errors = { title: m.kind === "group" && !m.title, end: !m.date || !m.start || !m.end || m.end <= m.start, cap: !Number.isInteger(m.cap) || m.cap < 1 || m.cap > 99 };
      if (Object.values(m.errors).some(Boolean)) { render(); return; }
      const base = `o-new-${Date.now()}`;
      const dates = m.repeat === "weekly" ? Array.from({ length: 8 }, (_, i) => addDays(m.date, i * 7)) : [m.date];
      dates.forEach((date, i) => state.classes.push({ id: i ? `${base}-${i}` : base, kind: m.kind, title: m.kind === "openGym" ? "Open Gym" : m.title,
        ws: m.ws, loc: WS[m.ws].loc || m.loc, date, start: m.start, end: m.end,
        cap: m.cap, trainer: m.kind === "group" ? m.trainer || null : null, origTrainer: null, status: "scheduled", attendees: [] }));
      const createdKind = m.kind;
      state.newOcc = null;
      if (shellOf(current().s) === "web") {
        state.web.date = m.date;
        state.web.panel = base;
        state.web.panelMode = null;
        render();
      } else {
        state.stack.pop();
        go("t-occ", { id: base });
      }
      toast(t(createdKind === "group" ? (dates.length > 1 ? "w.seriesCreated" : "w.classCreated") : "w.gymPublished", { n: dates.length }));
    }
    if (form === "new-client") {
      captureClient();
      const m = state.cn;
      m.errors = { name: !m.name.trim() };
      if (m.errors.name) { render(); root.querySelector("#cn-name")?.focus(); return; }
      const email = m.email.trim().toLowerCase();
      const dup = email && Object.keys(CLIENTS).find((id) => CLIENTS[id].ws === m.ws && (CLIENTS[id].email || "").toLowerCase() === email);
      if (dup) { m.dup = dup; render(); return; }
      const id = `c-${Date.now()}`;
      const name = m.name.trim();
      const first = name.split(/\s+/)[0];
      let pref = m.loc || undefined;
      if (m.loc === "home") { pref = `home-${id}`; LOCS[pref] = { key: "loc.homeOf", vars: { name: esc(first) } }; }
      CLIENTS[id] = { name, first, ws: m.ws, lang: m.lang, email: m.email.trim() || undefined, pref, created: true, createdBy: state.me };
      toast(t("c.added", { name: esc(first) }));
      finishClient(id);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (state.sheet) A["sheet-close"]();
    else if ((state.web.panel || PANEL_MODES.includes(state.web.panelMode)) && shellOf(current().s) === "web") A["w-close"]();
  });

  // Deep link: #flow1 … #flow7, also when the hash changes on an open page.
  function openFromHash() {
    const m = /^#flow([1-7])/.exec(location.hash || "");
    if (!m) return false;
    FLOWS[m[1] === "4" ? "4new" : m[1] === "5" ? "5free" : m[1]]();
    return true;
  }
  window.addEventListener("hashchange", openFromHash);
  if (!openFromHash()) render({ nav: true });
})();
