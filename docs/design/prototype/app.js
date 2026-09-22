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
    "home-lisa": { key: "loc.homeOf", vars: { name: "Lisa" } },
    "home-mark": { key: "loc.homeOf", vars: { name: "Mark" } },
  };
  const TRAINERS = {
    john: { name: "John" },
    sarah: { name: "Sarah" },
    mike: { name: "Mike" },
    nadia: { name: "Nadia" },
  };
  const GYM_TRAINERS = ["john", "sarah", "mike", "nadia"];
  const CLIENTS = {
    anna: { name: "Anna de Vries", first: "Anna", ws: "spt", pref: "tmz", lang: "nl" },
    mark: { name: "Mark Peters", first: "Mark", ws: "spt", history: ["bfo", "tmz"], lang: "en" },
    koen: { name: "Koen Meijer", first: "Koen", ws: "jg", lang: "nl" },
    lisa: { name: "Lisa Smit", first: "Lisa", ws: "spt", pref: "home-lisa", lang: "nl" },
    priya: { name: "Priya Sharma", first: "Priya", ws: "jg", lang: "en" },
    sanne: { name: "Sanne de Boer", first: "Sanne", ws: "jg", lang: "nl" },
    daan: { name: "Daan Mulder", first: "Daan", ws: "jg", lang: "nl" },
  };
  const SARAH_CLIENTS = ["anna", "mark", "koen", "lisa"];
  // Trainer-written content: stored and shown exactly as entered, never translated (PRODUCT.md §3, §35).
  const CLIENT_NOTES = {
    mark: "Houdt van techno.\nLiever geen Bulgarian split squats.\nTraint het liefst 's ochtends.",
    anna: "Knie rechts soms gevoelig bij diepe squats.",
    koen: "Wil in december een 10 km lopen.",
  };
  const LAST_NOTE = {
    mark: { date: "2026-09-15", text: "Laatste set bankdrukken was zwaar.\nVolgende keer zelfde gewicht houden." },
  };
  const WORKOUTS = {
    "upper-a": { name: "Upper A", ex: ["bench", "row", "ohp"] },
    "lower-a": { name: "Lower A", ex: [] },
    "full-body": { name: "Full body", ex: [] },
  };
  // Exercise library: localized names (PRODUCT.md §38).
  const EXERCISES = {
    bench: { nl: "Bankdrukken", en: "Bench press", target: "3 × 8", step: 2.5, prev: { date: "2026-09-15", sets: [[60, 8], [60, 8], [60, 7]] } },
    row: { nl: "Kabelroeien", en: "Seated cable row", target: "3 × 10", step: 2.5, prev: { date: "2026-09-15", sets: [[45, 10], [45, 10], [45, 10]] } },
    ohp: { nl: "Schouderdrukken met dumbbells", en: "Dumbbell shoulder press", target: "3 × 10", step: 2, prev: { date: "2026-09-15", sets: [[16, 10], [16, 10], [16, 9]] } },
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
        priv("p-koen", "koen", "sarah", "jg", "jg", TODAY, "15:00", "16:00", { workout: "full-body" }),
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
      booking: { mode: "group", occ: null, name: "", email: "", errors: {}, holdAt: null, attId: null, confirmCancel: false },
      np: null,
      mv: null,
      log: null,
      web: { view: "day", date: TODAY, ws: "jg", flow: 3, panel: null, panelMode: null, drawer: false },
      sheet: null,
    };
    return s;
  }

  const state = Object.assign(fresh(), {
    lang: prefs.get("lang") === "en" ? "en" : "nl",
    platform: prefs.get("platform") || detectPlatform(),
    stack: [{ s: "hub" }],
  });

  function detectPlatform() {
    return /Android/i.test(navigator.userAgent || "") ? "android" : "ios";
  }

  // ---------------------------------------------------------------- i18n + formatting
  function t(key, vars = {}) {
    const table = STR[state.lang] || STR.nl;
    let k = key;
    if (typeof vars.n === "number") {
      const form = key + (vars.n === 1 ? "_one" : "_other");
      if (form in table) k = form;
    }
    const s = table[k] ?? STR.nl[k] ?? key;
    return s.replace(/\{(\w+)\}/g, (m, v) => (v in vars ? vars[v] : m));
  }
  const locale = () => (state.lang === "nl" ? "nl-NL" : "en-GB");
  const fmt = (d, o) => new Intl.DateTimeFormat(locale(), { timeZone: TZ, ...o }).format(d);
  const time = (d) => fmt(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dayLong = (d) => fmt(d, { weekday: "long", day: "numeric", month: "long" });
  const dayShort = (d) => fmt(d, { weekday: "short", day: "numeric" });
  const dayMonth = (d) => fmt(d, { day: "numeric", month: "long" });
  const weekdayName = (d) => fmt(d, { weekday: "long" });
  const ucfirst = (s) => s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1);
  const num = (n) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(n);
  const startOf = (item) => at(item.date, item.start);
  const endOf = (item) => at(item.date, item.end);
  const range = (item) => `${time(startOf(item))}–${time(endOf(item))}`;
  const addDays = (iso, n) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  function isoWeek(iso) {
    const d = new Date(`${iso}T12:00:00Z`);
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  }
  const mondayOf = (iso) => addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const locName = (id) => {
    const l = LOCS[id];
    if (!l) return esc(id);
    return l.key ? t(l.key, l.vars) : esc(l.name);
  };
  const exName = (id) => EXERCISES[id][state.lang] || EXERCISES[id].nl;
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
    "4app": () => { state.np = null; reset([{ s: "hub" }, { s: "t-today" }, { s: "p-client" }]); },
    5: () => { state.log = null; reset([{ s: "hub" }, { s: "t-today" }, { s: "t-session", id: "p-mark" }, { s: "l-log", id: "p-mark" }]); },
    6: () => { state.web = { ...fresh().web, flow: 6, panel: "o-str22" }; reset([{ s: "hub" }, { s: "w-cal" }]); },
    "6app": () => reset([{ s: "hub" }, { s: "t-today" }, { s: "t-occ", id: "o-str22" }]),
  };

  // ---------------------------------------------------------------- shared UI pieces
  function seg(name, options, value, { label = "", small = false } = {}) {
    const md = state.platform === "android" && shellOf(current().s) === "app";
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
        [1, "flow1", [["1", "hub.start"]]],
        [2, "flow2", [["2", "hub.start"]]],
        [3, "flow3", [["3", "hub.start"]]],
        [4, "flow4", [["4new", "flow4.new"], ["4move", "flow4.move"], ["4app", "flow4.app"]]],
        [5, "flow5", [["5", "hub.start"]]],
        [6, "flow6", [["6", "flow6.web"], ["6app", "flow6.app"]]],
      ];
      return `<div class="hub">
        <header class="hub-head">
          <p class="eyebrow">${t("proto.label")} · M0</p>
          <h1 class="t-display" tabindex="-1">Trainer Hub</h1>
          <p class="lede">${t("hub.subtitle")}</p>
        </header>
        <section class="hub-settings" aria-labelledby="set-h">
          <h2 class="t-caption section-label" id="set-h">${t("hub.settings")}</h2>
          <div class="hub-setting"><span>${t("proto.lang")}</span>${seg("set-lang", [["nl", "Nederlands"], ["en", "English"]], state.lang, { label: t("proto.lang") })}</div>
          <div class="hub-setting"><span>${t("proto.style")}</span>${seg("set-platform", [["ios", "iOS"], ["android", "Android"]], state.platform, { label: t("proto.style") })}</div>
          <p class="t-footnote muted">${t("hub.styleHint")}</p>
        </section>
        <section aria-labelledby="flows-h">
          <h2 class="t-caption section-label" id="flows-h">${t("hub.flows")}</h2>
          <ol class="flow-list">${flows.map(([n, key, starts]) => `<li class="flow-card">
              <div class="flow-meta"><span class="flow-no">${t("hub.flow", { n })}</span><span class="flow-who">${t(key + ".who")}</span></div>
              <h3 class="t-headline">${t(key + ".title")}</h3>
              <p class="t-subhead muted">${t(key + ".desc")}</p>
              <div class="flow-actions">${starts.map(([id, label], i) =>
                `<button type="button" class="btn ${i === 0 ? "btn--primary" : "btn--tonal"}" data-act="flow" data-v="${id}">${t(label)}${icon("chevR", "ico--sm")}</button>`).join("")}</div>
            </li>`).join("")}</ol>
        </section>
        <section class="hub-tips" aria-labelledby="tips-h">
          <h2 class="t-caption section-label" id="tips-h">${t("hub.tips")}</h2>
          <ul>
            <li>${t("hub.tip1")}</li>
            <li>${t("hub.tip2")}</li>
            <li>${t("hub.tip3", { date: dayLong(NOW), time: time(NOW) })}</li>
            <li>${t("hub.demoNote")}</li>
          </ul>
          <button type="button" class="btn btn--text" data-act="reset-demo">${t("proto.reset")}</button>
        </section>
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
        <p class="summary-kicker">${occ.kind === "openGym" ? typeChip("openGym") : typeChip("group")}</p>
        <p class="summary-title">${esc(occ.title)}</p>
        <p class="summary-line">${icon("calendar", "ico--sm")}<span>${ucfirst(dayLong(d))} · ${range(occ)}</span></p>
        ${occ.trainer ? `<p class="summary-line">${icon("user", "ico--sm")}<span>${t("b.trainer", { name: TRAINERS[occ.trainer].name })}</span></p>` : ""}
        <p class="summary-line">${icon("pin", "ico--sm")}<span>${locName(occ.loc)}</span></p>
      </div>`;
  }

  SCREENS["b-list"] = {
    shell: "public",
    render() {
      const b = state.booking;
      const kind = b.mode === "group" ? "group" : "openGym";
      const items = state.classes.filter((c) => c.ws === "jg" && c.kind === kind && c.date >= TODAY).sort((a, z) => startOf(a) - startOf(z));
      const days = [...new Set(items.map((i) => i.date))];
      return `${publicHeader()}
        <main class="pub-main">
          <h1 class="pub-title" tabindex="-1">${t(b.mode === "group" ? "b.groupClasses" : "b.openGym")}</h1>
          <p class="lede">${t(b.mode === "group" ? "b.intro" : "b.openGymIntro")}</p>
          <div class="pub-tabs">${seg("b-mode", [["group", t("b.groupClasses")], ["openGym", t("b.openGym")]], b.mode, { label: t("b.groupClasses") })}</div>
          ${days.map((iso) => `<section class="day-group">
              <h2 class="t-caption section-label">${dayLabel(iso)}</h2>
              <ul class="class-list">${items.filter((i) => i.date === iso).map((occ) => {
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
                      ${occ.trainer ? `<span class="class-meta">${t("b.trainer", { name: TRAINERS[occ.trainer].name })}</span>` : ""}
                      ${status}
                    </span>
                    ${full || cancelled ? "" : icon("chevR", "class-chev")}
                  </button></li>`;
              }).join("")}</ul>
            </section>`).join("")}
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
  function sarahToday() {
    const privs = state.sessions.filter((s) => s.trainer === "sarah" && s.date === TODAY);
    const cls = state.classes.filter((c) => c.date === TODAY && (c.trainer === "sarah" || c.origTrainer === "sarah"));
    return [...privs, ...cls].sort((a, z) => startOf(a) - startOf(z));
  }
  const itemTitle = (x) => (x.kind === "private" ? esc(CLIENTS[x.client].name) : esc(x.title));
  function itemMeta(x) {
    return `${esc(WS[x.ws].name)} · ${locName(x.loc)}`;
  }
  function itemState(x) {
    if (x.status === "cancelled") return `<span class="chip chip--neutral">${t("today.cancelled")}</span>`;
    if (x.kind !== "private" && x.origTrainer === "sarah") return `<span class="chip chip--warning">${t("o.subDone", { name: TRAINERS[x.trainer].name })}</span>`;
    if (x.kind === "private" && x.status !== "booked") return attChip(x.status);
    if (x.kind !== "private") return `<span class="t-footnote muted t-num">${t("today.bookedOf", { booked: bookedCount(x), cap: x.cap })}</span>`;
    return "";
  }
  function sessionRow(x) {
    const act = x.kind === "private" ? `data-act="open-session" data-id="${x.id}"` : `data-act="open-occ" data-id="${x.id}"`;
    const muted = x.status === "cancelled" || (x.kind !== "private" && x.origTrainer === "sarah");
    return `<li><button type="button" class="row session-row${muted ? " is-muted" : ""}" ${act}>
        <span class="row-time"><span class="t-num">${time(startOf(x))}</span><span class="t-num row-time-end">${time(endOf(x))}</span></span>
        <span class="type-bar type-bar--${x.kind === "private" ? "private" : x.kind === "openGym" ? "open-gym" : "group"}" aria-hidden="true"></span>
        <span class="row-main">
          <span class="row-title">${itemTitle(x)}</span>
          <span class="row-sub">${typeChip(x.kind)} <span>${itemMeta(x)}</span></span>
          ${itemState(x) ? `<span class="row-state">${itemState(x)}</span>` : ""}
        </span>
        ${state.platform === "ios" ? icon("chevR", "row-chev") : ""}
      </button></li>`;
  }

  SCREENS["t-today"] = {
    shell: "app",
    tab: "today",
    render() {
      const items = sarahToday();
      const upcoming = items.filter((x) => endOf(x) > NOW && x.status !== "cancelled" && !(x.origTrainer === "sarah"));
      const next = upcoming[0];
      const later = items.filter((x) => x !== next && endOf(x) > NOW);
      const earlier = items.filter((x) => x !== next && endOf(x) <= NOW);
      const mins = next ? Math.round((startOf(next) - NOW) / 60000) : 0;
      const wsCount = new Set(items.map((x) => x.ws)).size;
      return {
        nav: {
          title: t("today.title"), large: true,
          subtitle: `${ucfirst(dayLong(NOW))} · ${t("today.summary", { n: items.length })} · ${t("today.workspaces", { n: wsCount })}`,
          actions: state.platform === "ios" ? [{ icon: "plus", act: "new-session", label: t("today.add") }] : [],
        },
        fab: state.platform === "android" ? { icon: "plus", act: "new-session", label: t("today.add") } : null,
        body: `
          ${next ? `<section class="next" aria-labelledby="next-h">
              <p class="next-kicker"><span id="next-h">${t("today.next")}</span><span>${mins > 0 ? t("today.startsIn", { n: mins }) : ""}</span></p>
              <button type="button" class="next-main" data-act="${next.kind === "private" ? "open-session" : "open-occ"}" data-id="${next.id}">
                <span class="next-time t-num">${range(next)}</span>
                <span class="next-title">${itemTitle(next)}</span>
                <span class="row-sub">${typeChip(next.kind)} <span>${esc(WS[next.ws].name)}</span></span>
                <span class="next-line">${icon("pin", "ico--sm")}${locName(next.loc)}</span>
                ${next.workout ? `<span class="next-line">${icon("dumbbell", "ico--sm")}${esc(WORKOUTS[next.workout].name)}</span>` : ""}
              </button>
              ${next.kind === "private" && next.workout === "upper-a" ? `<button type="button" class="btn btn--primary btn--block" data-act="start-log" data-id="${next.id}">${t("s.start")}</button>` : ""}
            </section>` : ""}
          ${later.length ? `<h2 class="t-caption section-label">${t("today.later")}</h2><ul class="list">${later.map(sessionRow).join("")}</ul>` : ""}
          ${earlier.length ? `<h2 class="t-caption section-label">${t("today.earlier")}</h2><ul class="list">${earlier.map(sessionRow).join("")}</ul>` : ""}
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
  SCREENS["t-calendar"] = placeholder("calendar", "tab.calendar");
  SCREENS["t-clients"] = placeholder("clients", "tab.clients");
  SCREENS["t-more"] = placeholder("more", "tab.more");

  SCREENS["t-session"] = {
    shell: "app",
    render() {
      const x = findSession(current().id);
      const c = CLIENTS[x.client];
      const last = LAST_NOTE[x.client];
      return {
        nav: { title: esc(c.name), large: true, back: t("today.title") },
        body: `
          <p class="screen-sub">${typeChip("private")} <span class="t-subhead muted">${ucfirst(dayLong(startOf(x)))} · <span class="t-num">${range(x)}</span></span></p>
          <ul class="list">
            <li class="row row--static">${icon("pin", "row-ico")}<span class="row-main"><span class="row-sub">${t("s.location")}</span><span class="row-title">${locName(x.loc)}</span></span></li>
            <li class="row row--static">${icon("grid", "row-ico")}<span class="row-main"><span class="row-sub">${t("s.workspace")}</span><span class="row-title">${esc(WS[x.ws].name)}</span></span></li>
            ${x.workout ? `<li class="row row--static">${icon("dumbbell", "row-ico")}<span class="row-main"><span class="row-sub">${t("s.workout")}</span><span class="row-title">${esc(WORKOUTS[x.workout].name)}</span></span></li>` : ""}
          </ul>
          <div class="stack">
            ${x.workout === "upper-a" ? `<button type="button" class="btn btn--primary btn--block btn--lg" data-act="start-log" data-id="${x.id}">${icon("dumbbell", "ico--sm")}${t("s.start")}</button>` : ""}
            <button type="button" class="btn btn--tonal btn--block" data-act="move-session" data-id="${x.id}">${icon("calendar", "ico--sm")}${t("s.move")}</button>
          </div>
          <h2 class="t-caption section-label">${t("s.attendance")}</h2>
          ${seg("session-att", [["attended", t("att.attended")], ["noShow", t("att.noShow")]], x.status, { label: t("s.attendance") })}
          ${last ? `<h2 class="t-caption section-label">${t("s.lastNote")}</h2>
            <div class="note"><p class="note-meta">${icon("lock", "ico--sm")}<span>${t("s.trainerOnly")} · ${dayMonth(at(last.date, "12:00"))}</span></p><p class="note-text">${esc(last.text)}</p></div>` : ""}
          ${CLIENT_NOTES[x.client] ? `<h2 class="t-caption section-label">${t("s.clientNotes")}</h2>
            <div class="note"><p class="note-meta">${icon("lock", "ico--sm")}<span>${t("s.trainerOnly")}</span></p><p class="note-text">${esc(CLIENT_NOTES[x.client])}</p></div>` : ""}
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
          <div class="search">${icon("search", "ico--sm")}<input id="client-search" type="search" placeholder="${t("p.search")}" aria-label="${t("p.search")}" autocomplete="off"></div>
          <ul class="list" data-client-list>${SARAH_CLIENTS.map((id) => {
            const c = CLIENTS[id];
            const inf = inferLocation(id);
            return `<li data-name="${esc(c.name.toLowerCase())}"><button type="button" class="row" data-act="np-client" data-v="${id}">
                <span class="avatar" aria-hidden="true">${initials(c.name)}</span>
                <span class="row-main"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${esc(WS[c.ws].name)}${inf.loc ? ` · ${locName(inf.loc)}` : ""}</span></span>
                ${state.platform === "ios" ? icon("chevR", "row-chev") : ""}
              </button></li>`;
          }).join("")}</ul>`,
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
                <option value="">${t("p.none")}</option>${Object.entries(WORKOUTS).map(([id, w]) => `<option value="${id}" ${m.workout === id ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select>`)}
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

  // ---- flow 5: live logging
  function ensureLog(id) {
    if (!state.log || state.log.id !== id) {
      const ex = WORKOUTS[findSession(id).workout].ex;
      state.log = {
        id, i: 0, ex, editing: null, note: "", visible: false,
        sets: Object.fromEntries(ex.map((e) => [e, []])),
        draft: Object.fromEntries(ex.map((e) => [e, { w: EXERCISES[e].prev.sets[0][0], r: EXERCISES[e].prev.sets[0][1] }])),
        diff: {},
      };
    }
    return state.log;
  }
  SCREENS["l-log"] = {
    shell: "app",
    dock: true,
    render() {
      const L = ensureLog(current().id);
      const x = findSession(L.id);
      const exId = L.ex[L.i];
      const ex = EXERCISES[exId];
      const done = L.sets[exId];
      const setNo = L.editing != null ? L.editing + 1 : done.length + 1;
      const rows = Math.max(ex.prev.sets.length, done.length + (L.editing == null ? 1 : 0));
      const d = L.draft[exId];
      const last = L.i === L.ex.length - 1;
      const targetMet = done.length >= ex.prev.sets.length;
      const kg = (w) => `${num(w)} kg`;
      return {
        nav: { title: `${esc(CLIENTS[x.client].first)} · ${esc(WORKOUTS[x.workout].name)}`, large: false, back: esc(CLIENTS[x.client].first) },
        body: `
          <div class="log-top">
            <span class="t-footnote muted">${t("l.exerciseOf", { i: L.i + 1, n: L.ex.length })}</span>
            <span class="sync">${icon("cloud", "ico--sm")}${t("l.savedLocal")}</span>
          </div>
          <div class="progress" aria-hidden="true">${L.ex.map((e, i) => `<span class="${i < L.i ? "is-done" : i === L.i ? "is-now" : ""}"></span>`).join("")}</div>
          <h2 class="t-title1 log-ex" tabindex="-1">${exName(exId)}</h2>
          <p class="t-subhead muted">${ex.target}</p>
          <table class="sets">
            <caption class="sr-only">${exName(exId)}</caption>
            <thead><tr><th scope="col"></th><th scope="col">${t("l.previous")}<span class="sets-date">${dayMonth(at(ex.prev.date, "12:00"))}</span></th><th scope="col">${t("l.today")}</th></tr></thead>
            <tbody>${Array.from({ length: rows }, (_, i) => {
              const p = ex.prev.sets[i];
              const s = done[i];
              const isCurrent = (L.editing == null && i === done.length) || L.editing === i;
              return `<tr class="${isCurrent ? "is-current" : ""}">
                  <th scope="row">${i + 1}</th>
                  <td class="prev t-num">${p ? `${kg(p[0])} × ${p[1]}` : "–"}</td>
                  <td class="now t-num">${s && !isCurrent ? `<button type="button" class="set-chip" data-act="log-edit" data-v="${i}" aria-label="${t("l.set", { n: i + 1 })}: ${kg(s[0])} × ${s[1]}">${kg(s[0])} × ${s[1]} ${icon("check", "ico--sm")}</button>`
                    : isCurrent ? `<span class="set-pending">${kg(d.w)} × ${d.r}</span>` : ""}</td>
                </tr>`;
            }).join("")}</tbody>
          </table>
          ${done.length ? `<p class="t-footnote muted">${t("l.tapToEdit")}</p>` : ""}
          ${done.length ? `<h3 class="t-caption section-label">${t("l.difficultySet", { n: done.length })}</h3>
            ${seg("log-diff", [["easy", t("l.easy")], ["normal", t("l.normal")], ["hard", t("l.hard")]], L.diff[exId]?.[done.length - 1] || "", { label: t("l.difficultySet", { n: done.length }) })}` : ""}
        `,
        dock: `
          <div class="steppers">
            ${stepper("w", t("l.weight"), kg(d.w))}
            ${stepper("r", t("l.reps"), String(d.r))}
          </div>
          <div class="dock-row">
            <button type="button" class="btn btn--icon btn--tonal btn--xl" data-act="log-ex" data-v="-1" ${L.i === 0 ? "disabled" : ""} aria-label="${t("l.prevExercise")}">${icon("chevL")}</button>
            <button type="button" class="btn ${targetMet && L.editing == null ? "btn--tonal" : "btn--primary"} btn--xl btn--grow" data-act="log-save">${icon("check", "ico--sm")}${t(L.editing != null ? "l.updateSet" : "l.saveSet", { n: setNo })}</button>
            <button type="button" class="btn btn--icon ${targetMet ? "btn--primary" : "btn--tonal"} btn--xl" data-act="log-ex" data-v="1" aria-label="${last ? t("l.finish") : t("l.nextExercise")}">${icon(last ? "check" : "chevR")}</button>
          </div>`,
      };
    },
  };
  function stepper(key, label, value) {
    return `<div class="stepper" role="group" aria-label="${label}">
        <span class="stepper-label">${label}</span>
        <div class="stepper-row">
          <button type="button" class="btn btn--icon btn--tonal btn--xl" data-act="log-step" data-k="${key}" data-v="-1" aria-label="${t("l.less", { what: label.toLowerCase() })}">${icon("minus")}</button>
          <output class="stepper-value t-num" aria-live="polite">${value}</output>
          <button type="button" class="btn btn--icon btn--tonal btn--xl" data-act="log-step" data-k="${key}" data-v="1" aria-label="${t("l.more", { what: label.toLowerCase() })}">${icon("plus")}</button>
        </div>
      </div>`;
  }

  SCREENS["l-finish"] = {
    shell: "app",
    render() {
      const L = state.log;
      const x = findSession(L.id);
      const c = CLIENTS[x.client];
      const total = L.ex.reduce((n, e) => n + L.sets[e].length, 0);
      return {
        nav: { title: t("l.finishTitle"), large: false, back: t("common.back") },
        body: `
          <h2 class="t-title2 screen-h" tabindex="-1">${esc(c.name)} · ${esc(WORKOUTS[x.workout].name)}</h2>
          <p class="t-subhead muted">${t("l.summary", { sets: total, ex: L.ex.length })}</p>
          <ul class="list">${L.ex.map((e) => `<li class="row row--static"><span class="row-main">
              <span class="row-title">${exName(e)}</span>
              <span class="row-sub t-num">${L.sets[e].map((s) => `${num(s[0])} × ${s[1]}`).join(" · ") || "–"}</span>
            </span>${Object.entries(L.diff[e] || {}).map(([i, difficulty]) => `<span class="chip chip--${difficulty === "hard" ? "warning" : "neutral"}">${t("l.set", { n: Number(i) + 1 })} · ${t("l." + difficulty)}</span>`).join("")}</li>`).join("")}</ul>
          <div class="field">
            <label class="field-label" for="log-note">${t("l.noteLabel")}</label>
            <textarea id="log-note" class="input" rows="4" placeholder="${t("l.notePh")}">${esc(L.note)}</textarea>
          </div>
          <div class="switch-row">
            <label for="log-visible" class="row-main"><span class="row-title">${t("l.visible", { name: esc(c.first) })}</span>
              <span class="row-sub">${t(L.visible ? "l.visibleOn" : "l.visibleOff", { name: esc(c.first) })}</span></label>
            <input id="log-visible" type="checkbox" role="switch" class="switch" data-act="log-visible" ${L.visible ? "checked" : ""}>
          </div>
          <button type="button" class="btn btn--primary btn--block btn--lg" data-act="log-done">${t("l.save")}</button>
        `,
      };
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
        <li class="row row--static">${icon("user", "row-ico")}<span class="row-main"><span class="row-sub">${t("o.trainer")}</span>
          <span class="row-title">${occ.trainer ? TRAINERS[occ.trainer].name : `<span class="chip chip--warning">${icon("alert", "ico--sm")}${t("o.trainerNeeded")}</span>`}</span>
          ${occ.origTrainer ? `<span class="row-sub">${t("o.subBadge", { name: TRAINERS[occ.origTrainer].name })}</span>` : ""}</span></li>
        <li class="row row--static">${icon("users", "row-ico")}<span class="row-main"><span class="row-sub">${t("o.bookedOf", { booked: bookedCount(occ), cap: occ.cap })}</span>${meter(bookedCount(occ), occ.cap)}</span></li>
      </ul>
      ${cancelled ? "" : `<div class="action-row">
          <button type="button" class="btn btn--tonal" data-act="open-sub" data-id="${occ.id}">${icon("swap", "ico--sm")}${t("o.substitute")}</button>
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

  // ---------------------------------------------------------------- screens: flow 3, web calendar
  const NAV_ITEMS = [
    ["dashboard", "grid"], ["calendar", "calendar"], ["clients", "users"], ["classes", "layers"], ["openGym", "door"],
    ["workouts", "dumbbell"], ["trainers", "user"], ["links", "link"], ["settings", "sliders"],
  ];
  const H0 = 7, H1 = 21, HOUR_PX = 60;

  function gymItems(date) {
    return [...state.sessions.filter((s) => s.ws === state.web.ws), ...state.classes.filter((c) => c.ws === state.web.ws)]
      .filter((x) => x.date === date).sort((a, z) => startOf(a) - startOf(z));
  }
  function eventLabel(x) {
    return x.kind === "private" ? t("w.privateWith", { name: esc(CLIENTS[x.client].first) }) : esc(x.title);
  }
  function eventMeta(x) {
    if (x.kind === "private") return "";
    return `<span class="t-num">${bookedCount(x)}/${x.cap}</span>`;
  }
  function eventCls(x) {
    const k = x.kind === "private" ? "private" : x.kind === "openGym" ? "open-gym" : "group";
    return `ev ev--${k}${x.status === "cancelled" ? " is-cancelled" : ""}${x.kind === "group" && !x.trainer ? " needs-trainer" : ""}${state.web.panel === x.id ? " is-selected" : ""}`;
  }
  function dayView(date) {
    const items = gymItems(date);
    const lanes = state.web.ws === "jg" ? ["john", "sarah", "mike"] : ["sarah"];
    items.forEach((x) => { if (x.trainer && !lanes.includes(x.trainer)) lanes.push(x.trainer); });
    if (items.some((x) => x.kind === "openGym")) lanes.push("og");
    if (items.some((x) => x.kind === "group" && !x.trainer)) lanes.push("none");
    const laneOf = (x) => (x.kind === "openGym" ? "og" : x.trainer || "none");
    const laneName = (l) => (l === "og" ? t("type.openGym") : l === "none" ? t("o.trainerNeeded") : TRAINERS[l].name);
    const hours = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
    const nowTop = date === TODAY ? ((NOW - at(date, "07:00")) / 3600000) * HOUR_PX : null;
    return `<div class="cal-scroll">
        <div class="cal" style="--lanes:${lanes.length};--hour:${HOUR_PX}px;--hours:${H1 - H0}">
          <div class="cal-corner"></div>
          ${lanes.map((l) => `<div class="cal-lane-head">${l === "og" || l === "none" ? "" : `<span class="avatar avatar--sm" aria-hidden="true">${initials(TRAINERS[l].name)}</span>`}<span>${laneName(l)}</span></div>`).join("")}
          <div class="cal-times">${hours.map((h) => `<span style="top:${(h - H0) * HOUR_PX}px">${time(at(date, String(h).padStart(2, "0") + ":00"))}</span>`).join("")}</div>
          ${lanes.map((l) => `<div class="cal-lane">${items.filter((x) => laneOf(x) === l).map((x) => {
            const top = ((startOf(x) - at(date, "07:00")) / 3600000) * HOUR_PX;
            const h = ((endOf(x) - startOf(x)) / 3600000) * HOUR_PX;
            return `<button type="button" class="${eventCls(x)}" style="top:${top}px;height:${h - 2}px" data-act="w-open" data-id="${x.id}">
                <span class="ev-time t-num">${time(startOf(x))}</span><span class="ev-title">${eventLabel(x)}</span>${eventMeta(x) ? `<span class="ev-meta">${eventMeta(x)}</span>` : ""}
              </button>`;
          }).join("")}</div>`).join("")}
          ${nowTop != null ? `<div class="cal-now" style="top:${nowTop}px" aria-hidden="true"><span>${time(NOW)}</span></div>` : ""}
        </div>
      </div>`;
  }
  function weekView(date) {
    const mon = mondayOf(date);
    const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    return `<div class="week">${days.map((iso) => {
      const items = gymItems(iso);
      return `<section class="week-day${iso === TODAY ? " is-today" : ""}">
          <h3 class="week-day-head"><button type="button" class="btn btn--text" data-act="w-goto-day" data-v="${iso}">${ucfirst(dayShort(at(iso, "12:00")))}</button></h3>
          ${items.length ? `<ul>${items.map((x) => `<li><button type="button" class="${eventCls(x)} ev--compact" data-act="w-open" data-id="${x.id}">
              <span class="ev-time t-num">${time(startOf(x))}</span>
              <span class="ev-title">${eventLabel(x)}</span>
              <span class="ev-meta">${[
                x.kind === "openGym" ? "" : x.trainer ? TRAINERS[x.trainer].name : `<span class="chip chip--warning">${t("o.trainerNeeded")}</span>`,
                eventMeta(x),
              ].filter(Boolean).join(" · ")}</span>
            </button></li>`).join("")}</ul>` : `<p class="t-footnote muted">${t("w.empty")}</p>`}
        </section>`;
    }).join("")}</div>`;
  }
  function newWebSessionForm() {
    const m = state.np;
    const clients = Object.entries(CLIENTS).filter(([, c]) => c.ws === state.web.ws);
    return `<form data-form="new-session" novalidate class="form">
        ${field("web-client", t("p.client"), `<select id="web-client" class="input" aria-describedby="${m.errors.client ? "web-client-err" : ""}">
          <option value="">${t("p.pickClient")}</option>
          ${clients.map(([id, c]) => `<option value="${id}" ${m.client === id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select>`, m.errors.client ? t("p.chooseClient") : "")}
        <div class="field-row">
          ${field("np-date", t("p.date"), `<input id="np-date" class="input" type="date" value="${m.date}">`)}
          ${field("np-time", t("p.time"), `<input id="np-time" class="input" type="time" step="900" value="${m.time}">`)}
        </div>
        <div class="field"><span class="field-label" id="dur-l">${t("p.duration")}</span>
          ${seg("np-dur", [30, 45, 60, 90].map((n) => [String(n), t("p.min", { n })]), String(m.dur), { label: t("p.duration") })}</div>
        ${m.client ? `<div class="field"><span class="field-label">${t("s.location")}</span>${locationBlock(m, m.client)}</div>` : ""}
        ${field("np-workout", t("p.workoutOpt"), `<select id="np-workout" class="input">
          <option value="">${t("p.none")}</option>${Object.entries(WORKOUTS).map(([id, workout]) => `<option value="${id}" ${m.workout === id ? "selected" : ""}>${esc(workout.name)}</option>`).join("")}
        </select>`)}
        <button type="submit" class="btn btn--primary btn--block btn--lg">${t("p.save")}</button>
      </form>`;
  }
  function webPanel() {
    const w = state.web;
    if (!w.panel && w.panelMode !== "create") return "";
    const x = w.panel ? findItem(w.panel) : null;
    let body;
    if (w.panelMode === "create") {
      body = newWebSessionForm();
    } else if (x.kind === "private") {
      if (w.panelMode === "move") {
        ensureMove(x);
        body = moveForm(x, true);
      } else {
        body = `<p class="screen-sub">${typeChip("private")} <span class="t-subhead muted">${ucfirst(dayLong(startOf(x)))} · <span class="t-num">${range(x)}</span></span></p>
          <ul class="list">
            <li class="row row--static">${icon("user", "row-ico")}<span class="row-main"><span class="row-sub">${t("w.client")}</span><span class="row-title">${esc(CLIENTS[x.client].name)}</span></span></li>
            <li class="row row--static">${icon("dumbbell", "row-ico")}<span class="row-main"><span class="row-sub">${t("o.trainer")}</span><span class="row-title">${TRAINERS[x.trainer].name}</span></span></li>
            <li class="row row--static">${icon("pin", "row-ico")}<span class="row-main"><span class="row-sub">${t("s.location")}</span><span class="row-title">${locName(x.loc)}</span></span></li>
          </ul>
          <button type="button" class="btn btn--tonal btn--block" data-act="panel-move">${icon("calendar", "ico--sm")}${t("s.move")}</button>`;
      }
    } else {
      body = occManager(x, true);
    }
    return `<div class="panel-scrim" data-act="w-close"></div>
      <aside class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-h">
        <header class="panel-head"><h2 class="t-title2" id="panel-h" tabindex="-1">${w.panelMode === "create" ? t("p.newTitle") : x.kind === "private" ? esc(CLIENTS[x.client].name) : esc(x.title)}</h2>
          <button type="button" class="btn btn--icon btn--ghost" data-act="w-close" aria-label="${t("common.close")}">${icon("x")}</button></header>
        <div class="panel-body">${body}</div>
      </aside>`;
  }

  SCREENS["w-cal"] = {
    shell: "web",
    render() {
      const w = state.web;
      const d = at(w.date, "12:00");
      const title = w.view === "day" ? ucfirst(dayLong(d)) : `${t("w.weekNo", { n: isoWeek(w.date) })} · ${dayMonth(at(mondayOf(w.date), "12:00"))} – ${dayMonth(at(addDays(mondayOf(w.date), 6), "12:00"))}`;
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
              <button type="button" class="btn btn--primary web-new" data-act="w-new">${icon("plus", "ico--sm")}<span>${t("w.newSession")}</span></button>
            </header>
            <div class="web-toolbar">
              <div class="date-nav">
                <button type="button" class="btn btn--icon btn--outline" data-act="w-step" data-v="-1" aria-label="${t(w.view === "day" ? "w.prevDay" : "w.prevWeek")}">${icon("chevL", "ico--sm")}</button>
                <button type="button" class="btn btn--outline" data-act="w-today">${t("w.today")}</button>
                <button type="button" class="btn btn--icon btn--outline" data-act="w-step" data-v="1" aria-label="${t(w.view === "day" ? "w.nextDay" : "w.nextWeek")}">${icon("chevR", "ico--sm")}</button>
              </div>
              <p class="date-title t-headline" aria-live="polite">${title}</p>
              ${seg("w-view", [["day", t("w.day")], ["week", t("w.week")]], w.view, { label: t("w.week"), small: true })}
            </div>
            <p class="t-footnote muted web-scope">${t("w.onlyWs", { ws: esc(WS[w.ws].name) })}</p>
            <div class="legend">${typeChip("private")}${typeChip("group")}${typeChip("openGym")}</div>
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
      public: t("flow1.title"), web: t(`flow${state.web.flow}.title`), app: "",
    }[kind];
    return `<div class="protobar" role="region" aria-label="${t("proto.label")}">
        <button type="button" class="pb-home" data-act="home">${icon("home", "ico--sm")}<span>${t("proto.home")}</span></button>
        <span class="pb-title">${t("proto.label")}${flowTitle ? ` · ${flowTitle}` : ""}</span>
        <div class="pb-controls">
          ${kind === "public" ? "" : seg("set-lang", [["nl", "NL"], ["en", "EN"]], state.lang, { label: t("proto.lang"), small: true })}
          ${kind === "app" ? seg("set-platform", [["ios", "iOS"], ["android", "Android"]], state.platform, { label: t("proto.style"), small: true }) : ""}
        </div>
      </div>`;
  }
  function navbar(nav) {
    const ios = state.platform === "ios";
    const lead = nav.close
      ? (ios ? `<button type="button" class="nav-text" data-act="close-modal">${t("common.cancel")}</button>`
        : `<button type="button" class="nav-icon" data-act="close-modal" aria-label="${t("common.close")}">${icon("x")}</button>`)
      : nav.back
        ? (ios ? `<button type="button" class="nav-back" data-act="back">${icon("chevL")}<span>${nav.back}</span></button>`
          : `<button type="button" class="nav-icon" data-act="back" aria-label="${t("common.back")}">${icon("arrowL")}</button>`)
        : "";
    const actions = (nav.actions || []).map((a) =>
      `<button type="button" class="nav-icon" data-act="${a.act}" aria-label="${a.label}">${icon(a.icon)}</button>`).join("");
    if (ios) {
      return `<header class="nav nav--ios${nav.large ? " nav--large" : ""}">
          <div class="nav-bar"><div class="nav-lead">${lead}</div>${nav.large ? "" : `<p class="nav-title">${nav.title}</p>`}<div class="nav-trail">${actions}</div></div>
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
        <div class="sheet-actions">${c.actions}</div>
      </section>`;
  }

  const root = document.getElementById("app");
  function render(opts = {}) {
    const cur = current();
    const def = SCREENS[cur.s];
    const kind = def.shell;
    const key = JSON.stringify(cur);
    const prevScroll = !opts.nav && root.dataset.key === key ? [...root.querySelectorAll("[data-scroll]")].map((el) => el.scrollTop) : null;

    document.documentElement.lang = state.lang === "nl" ? "nl" : "en";
    document.documentElement.dataset.platform = kind === "app" ? state.platform : "web";
    document.documentElement.dataset.shell = kind;

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
      Object.assign(state, fresh());
      reset([{ s: "hub" }]);
      toast(t("proto.resetDone"));
    },
    "set-lang": (el) => { state.lang = el.dataset.v; prefs.set("lang", state.lang); render(); },
    "set-platform": (el) => { state.platform = el.dataset.v; prefs.set("platform", state.platform); render(); },

    // flow 1
    "b-mode": (el) => { state.booking.mode = el.dataset.v; render(); },
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

    // flow 4
    "new-session": () => { state.np = null; go("p-client"); },
    "np-client": (el) => {
      const inf = inferLocation(el.dataset.v);
      state.np = { client: el.dataset.v, date: TODAY, time: "12:00", dur: 60, workout: "", locChoice: inf.ambiguous ? null : inf.loc, locOther: "", showLocOptions: false, errors: {} };
      go("p-form");
    },
    "np-dur": (el) => { captureForm(); state.np.dur = Number(el.dataset.v); render(); },
    "loc-change": () => { const m = model(); captureForm(); m.showLocOptions = true; render(); },
    "loc-pick": (el) => { const m = model(); captureForm(); m.locChoice = el.dataset.v; m.errors = {}; render(); if (el.dataset.v === "other") root.querySelector("#loc-other")?.focus(); },
    "move-session": (el) => { state.mv = null; go("p-move", { id: el.dataset.id }); },

    // flow 5
    "start-log": (el) => { state.log = null; go("l-log", { id: el.dataset.id }); },
    "log-step": (el) => {
      const L = state.log;
      const exId = L.ex[L.i];
      const d = L.draft[exId];
      const dir = Number(el.dataset.v);
      if (el.dataset.k === "w") d.w = Math.max(0, Math.round((d.w + dir * EXERCISES[exId].step) * 100) / 100);
      else d.r = Math.max(0, d.r + dir);
      render();
    },
    "log-save": () => {
      const L = state.log;
      const exId = L.ex[L.i];
      const d = L.draft[exId];
      const sets = L.sets[exId];
      if (L.editing != null) { sets[L.editing] = [d.w, d.r]; L.editing = null; }
      else sets.push([d.w, d.r]);
      // Next set starts from what you just did, not from last time's numbers.
      render();
    },
    "log-edit": (el) => {
      const L = state.log;
      const exId = L.ex[L.i];
      const i = Number(el.dataset.v);
      const s = L.sets[exId][i];
      L.editing = i;
      L.draft[exId] = { w: s[0], r: s[1] };
      render();
    },
    "log-diff": (el) => {
      const L = state.log;
      const exId = L.ex[L.i];
      L.diff[exId] ||= {};
      L.diff[exId][L.sets[exId].length - 1] = el.dataset.v;
      render();
    },
    "log-ex": (el) => {
      const L = state.log;
      const dir = Number(el.dataset.v);
      L.editing = null;
      if (dir > 0 && L.i === L.ex.length - 1) return go("l-finish");
      L.i = Math.min(L.ex.length - 1, Math.max(0, L.i + dir));
      render({ nav: true });
    },
    "log-visible": (el) => { state.log.note = root.querySelector("#log-note")?.value ?? state.log.note; state.log.visible = el.checked; render(); },
    "log-done": () => {
      const L = state.log;
      findSession(L.id).status = "attended";
      state.log = null;
      reset([{ s: "hub" }, { s: "t-today" }]);
      toast(t("l.saved"));
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
    "w-close": () => { state.web.panel = null; state.web.panelMode = null; state.np = null; render(); },
    "w-view": (el) => { state.web.view = el.dataset.v; render(); },
    "w-step": (el) => { const w = state.web; w.date = addDays(w.date, Number(el.dataset.v) * (w.view === "day" ? 1 : 7)); w.panel = null; render(); },
    "w-today": () => { state.web.date = TODAY; render(); },
    "w-goto-day": (el) => { Object.assign(state.web, { date: el.dataset.v, view: "day" }); render(); },
    "w-drawer": () => { state.web.drawer = !state.web.drawer; render(); },
    "w-nav": (el) => { state.web.drawer = false; render(); if (el.dataset.v !== "calendar") toast(t("proto.notInScope")); },
    "w-new": () => {
      state.np = { client: null, trainer: state.web.ws === "jg" ? "john" : "sarah", date: state.web.date,
        time: "12:00", dur: 60, workout: "", locChoice: null, locOther: "", showLocOptions: false, errors: {} };
      state.web.panel = null;
      state.web.panelMode = "create";
      render();
      root.querySelector("#panel-h")?.focus({ preventScroll: true });
    },
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

  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    if (el.tagName === "A") e.preventDefault();
    const fn = A[el.dataset.act];
    if (fn) fn(el);
  });
  root.addEventListener("input", (e) => {
    if (e.target.id === "client-search") {
      const q = e.target.value.trim().toLowerCase();
      root.querySelectorAll("[data-client-list] li").forEach((li) => { li.hidden = !!q && !li.dataset.name.includes(q); });
    }
    if (e.target.id === "log-note" && state.log) state.log.note = e.target.value;
    if (e.target.id === "cancel-message" && state.sheet?.kind === "cancel") state.sheet.message = e.target.value;
  });
  root.addEventListener("change", (e) => {
    if (e.target.id !== "web-client") return;
    captureForm();
    const id = e.target.value;
    const inf = id ? inferLocation(id) : null;
    Object.assign(state.np, { client: id || null, locChoice: inf && !inf.ambiguous ? inf.loc : null,
      locOther: "", showLocOptions: false, errors: {} });
    render();
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
        state.sessions.push({ id, kind: "private", client: clientId, trainer: m.trainer || "sarah", ws: CLIENTS[clientId].ws, loc, date: m.date, start: m.time, end, status: "booked", workout: m.workout });
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
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (state.sheet) A["sheet-close"]();
    else if ((state.web.panel || state.web.panelMode === "create") && shellOf(current().s) === "web") A["w-close"]();
  });

  // Deep link: #flow1 … #flow6 (bare tokens survive the artifact viewer).
  const m = /^#flow([1-6])/.exec(location.hash || "");
  if (m) FLOWS[m[1] === "4" ? "4new" : m[1]]();
  else render({ nav: true });
})();
