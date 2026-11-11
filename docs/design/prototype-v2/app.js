/* Fivvi prototype v2: the Fivvi Pro app (iOS + Android) as one state machine with two native skins.
   Throwaway code that answers a design question; no tests, no build step. */
(function () {
  "use strict";
  var D = window.FIVVI_DATA;
  var NOW = new Date(2026, 10, 5, 10, 5);
  var NOWT = "10:05";
  var TODAY = key(NOW);

  /* ---------- Dates ---------- */
  var DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  var DS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  var MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  var MS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  function pad2(n) { return String(n).padStart(2, "0"); }
  function key(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function parse(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function add(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function monday(d) { var x = new Date(d); var w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return x; }
  function longDate(d) { return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()]; }
  function shortDate(d) { return DS[d.getDay()] + " " + d.getDate() + " " + MS[d.getMonth()]; }
  function isoWeek(d) { var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); var y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); }
  function mins(t) { var p = t.split(":"); return +p[0] * 60 + +p[1]; }
  function hm(m) { return pad2(Math.floor(m / 60)) + ":" + pad2(m % 60); }

  /* ---------- Data access ---------- */
  var CLIENT = {}; D.clients.forEach(function (c) { CLIENT[c.id] = c; });
  var DAYCACHE = {}; DAYCACHE[TODAY] = D.today;
  var ORIG_EXTRA, EXTRA_WS = [
    { id: "x6", ws: "sf", type: "priv", s: "08:00", e: "09:00", client: "thomas", loc: "Studio Fit, Kerkstraat 12", trainer: "Noah Bakker", att: "yes" },
    { id: "x3", ws: "sf", type: "priv", s: "10:30", e: "11:30", client: "bram", loc: "Studio Fit, Kerkstraat 12", trainer: "Noah Bakker" },
    { id: "x1", ws: "sf", type: "priv", s: "11:00", e: "12:00", client: "daan", loc: "Studio Fit, Kerkstraat 12", trainer: "Mike de Boer" },
    { id: "x2", ws: "sf", type: "priv", s: "11:00", e: "12:00", client: "sophie", loc: "Studio Fit, Kerkstraat 12", trainer: "Yara Koster" },
    { id: "x4", ws: "sf", type: "priv", s: "13:00", e: "14:00", client: "fleur", loc: "Studio Fit, Kerkstraat 12", trainer: "Mike de Boer" },
    { id: "x5", ws: "sf", type: "priv", s: "16:30", e: "17:30", client: "eva", loc: "Studio Fit, Kerkstraat 12", trainer: "Yara Koster" }
  ];
  /* The independent-trainer setup has one workspace with private sessions only: no group classes, no Open Gym, no team. */
  /* The business on screen: the gym (team), a solo PT, or one of the scenarios in data.js (pilates, yoga, small groups). */
  var SETUPS = D.setups, ORIG = { today: D.today, pattern: D.pattern, trainers: D.trainers.sf.slice() }, LOADED = "team";
  function CFG() { return SETUPS[PREF.setup] || (PREF.setup === "solo" ? { team: false, multiWs: false, types: ["priv"] } : { team: true, multiWs: true, types: ["priv", "group"] }); }
  function SOLO() { return !CFG().team; }
  function OWNER() { return SOLO() || PREF.role === "owner"; }
  function HAS(t) { return CFG().types.indexOf(t) >= 0; }
  /* The one set of rules for the payments state (#466, #606), used by the app and the web. */
  function PAYW() { return S.w || {}; }
  function PAYST() { return PAYW().pay || (S.proPay ? "none" : "ready"); }
  function PAYONLINE() { var p = PAYST(); return p === "ready" || p === "debit"; }
  function PAYSTUDIO() { var p = PAYST(); return p === "cashonly" || (!!PAYW().cashFirst && !PAYONLINE() && p !== "broken"); }
  /* a studio that was live stays open while it reconnects: only new online sales stop */
  function PAYOPEN() { var p = PAYST(); return PAYONLINE() || p === "broken" || !!PAYW().wasLive || PAYSTUDIO(); }
  function PAYLOCK() { return !PAYOPEN(); }
  function OFFEROPEN(o) { return PAYST() === "ready" || PAYSTUDIO() || (PAYST() === "debit" && o.kind !== "abo" && o.kind !== "plan"); }
  function AGROPEN(a) { var o = D.offerOf(a); return !o || OFFEROPEN(o); }
  /* what the viewer reads of an offer or agreement. A saved offer has its own nameEn, also when left empty: in English
     that name or else the Dutch one, between marks that keep the English layer off it (i18n.js). The samples have none and go through the dictionary. */
  function agrName(a) { return PREF.lang === "en" && a.nameEn !== undefined ? "\uE000" + (a.nameEn || a.name) + "\uE001" : a.name; }
  function offerOpts(list) { return list.map(function (o) { return [o.id, agrName(o)]; }); }
  function OPENOFFERS() { return D.onOffers().filter(OFFEROPEN); }
  /* what a form's offer list opens on: the renewed agreement's offer, or else the second one, as the sample's most usual choice */
  function offerStart(list, a) { var o = a && D.offerOf(a); return (o || list[1] || list[0] || {}).id; }
  /* a class is known by its Dutch name, as its description is. A new class with a known name adds to what's there; editing the series can also clear it */
  function saveClassText(n, f, edit) { var old = D.descriptions[n] || {}, en = (f.nameEn || "").trim(); D.descriptions[n] = edit ? { nl: f.desc || "", en: f.descEn || "", nameEn: en } : { nl: f.desc || old.nl || "", en: f.descEn || old.en || "", nameEn: en || old.nameEn || "" }; if (edit || en) window.FIVVI_I18N.nameClass(n, en); }
  /* The session type is only worth a label when there is more than one kind; a trainer with private sessions only
     never sees "Privésessie" on every row. */
  function MIXED() { return CFG().types.length > 1; }
  function WSS() { return CFG().multiWs ? ["sf", "jg"] : ["sf"]; }
  ORIG_EXTRA = EXTRA_WS;
  function dayItems(k) {
    var all = dayItemsAll(k);
    if (PREF.setup === "solo") return all.filter(function (i) { return i.ws === "sf" && i.type === "priv"; });
    if (PREF.setup === "team") return all.filter(function (i) { return !i.soloOnly; });
    return all;
  }
  function dayItemsAll(k) {
    if (!DAYCACHE[k]) {
      var d = parse(k), w = (d.getDay() + 6) % 7, pat = D.pattern[w] || D.pattern[0], sf = D.clients.filter(function (c) { return c.ws === "sf"; });
      DAYCACHE[k] = pat.map(function (p, i) {
        var it = { id: k + "-" + i, ws: "sf", type: p[0], s: p[1], e: p[2], att: null };
        if (p[0] === "priv") { it.client = p[3]; it.loc = p[4]; }
        else { it.title = p[3]; it.cap = p[4]; it.people = sf.slice(0, Math.min(p[5], sf.length)).map(function (c) { return c.id; }); while (it.people.length < p[5]) it.people.push("guest" + it.people.length); it.loc = D.workspaces.sf.location; }
        return it;
      });
    }
    return DAYCACHE[k].slice().sort(function (a, b) { return mins(a.s) - mins(b.s); });
  }
  function loadSetup() {
    if (LOADED === PREF.setup) return;
    LOADED = PREF.setup;
    var c = SETUPS[PREF.setup];
    D.today = c ? JSON.parse(JSON.stringify(c.today)) : ORIG.today;
    D.pattern = c ? c.pattern : ORIG.pattern;
    EXTRA_WS = c ? JSON.parse(JSON.stringify(c.extra)) : ORIG_EXTRA;
    D.trainers.sf = c ? c.trainers.slice() : ORIG.trainers.slice();
    if (c) for (var k in c.descriptions) D.descriptions[k] = c.descriptions[k];
    if (c && c.levels) for (var l in c.levels) D.levels[l] = c.levels[l];
    D.workspaces.sf.term = c && c.term ? c.term : "trainer";
    DAYCACHE = {}; DAYCACHE[TODAY] = D.today; S.logs = {}; S.sess = {}; S.scope = "me";
  }
  function findItem(id) {
    for (var k in DAYCACHE) { for (var i = 0; i < DAYCACHE[k].length; i++) if (DAYCACHE[k][i].id === id) return { it: DAYCACHE[k][i], day: k }; }
    for (var j = 0; j < EXTRA_WS.length; j++) if (EXTRA_WS[j].id === id) return { it: EXTRA_WS[j], day: TODAY };
    return null;
  }
  var CV = { priv: "var(--priv)", group: "var(--group)", gym: "var(--gym)" };
  var TYPE = { priv: "Privésessie", group: "Groepsles", gym: "Open Gym" };
  function title(it) { return it.type === "priv" ? (it.duo ? CLIENT[it.client].name.split(" ")[0] + " & " + CLIENT[it.duo].name.split(" ")[0] : CLIENT[it.client].name) : it.title; }
  /* a class's level: its own field, else the level the class (by name) usually has */
  function level(it) { return it.type !== "group" ? "" : it.level != null ? it.level : D.levels[it.title] || ""; }
  /* compact (lists): the three bars only, after the class name, with the word as accessible name and tooltip;
     "Alle niveaus" shows nothing in a list (anyone can join). Full (one class): bars and the word. Owner, 5 Nov 2026. */
  function lvlTag(it, compact) { var l = level(it), n = D.LEVELS.indexOf(l); if (!l || (compact && n === 0)) return ""; return '<span class="lvl l' + n + (compact ? " c" : "") + '" role="img" aria-label="Niveau: ' + l + '" title="' + l + '"><i></i><i></i><i></i>' + (compact ? "" : "<span>" + l + "</span>") + "</span>"; }
  function pair(it) { return it.duo ? [it.client, it.duo] : [it.client]; }
  function person(id) { return CLIENT[id] ? CLIENT[id].name : ["Ruben Vos", "Kim de Graaf", "Jasper Kok", "Mila Bos", "Sem Dekker", "Lotte Prins", "Finn Smits", "Zoë Meijer"][(+String(id).replace(/\D/g, "") || 0) % 8]; }
  function isPast(it, k) { return k < TODAY || (k === TODAY && mins(it.e) <= mins(NOWT)); }
  function isLive(it, k) { return k === TODAY && mins(it.s) <= mins(NOWT) && mins(it.e) > mins(NOWT); }
  function started(it, k) { return k < TODAY || (k === TODAY && mins(it.s) <= mins(NOWT)); }
  function initials(n) { return n.split(" ").filter(function (w) { return w[0] === w[0].toUpperCase(); }).map(function (w) { return w[0]; }).slice(0, 2).join(""); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function norm(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

  /* ---------- Icons ---------- */
  var P = {
    sun: '<circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    people: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M17.5 14.6c2.2.3 3.6 1.9 4 4.4"/>',
    me: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3.2"/><path d="M6.3 18.5c1.2-2.3 3.2-3.5 5.7-3.5s4.5 1.2 5.7 3.5"/>',
    plus: '<path d="M12 5v14M5 12h14" stroke-width="2.2"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/>',
    chevL: '<path d="M15 5l-7 7 7 7" stroke-width="2.3"/>',
    chevR: '<path d="M9 5l7 7-7 7" stroke-width="2.3"/>',
    chevD: '<path d="M6 9.5l6 6 6-6" stroke-width="2.3"/>',
    updown: '<path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4" stroke-width="2.2"/>',
    more: '<circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
    moreV: '<circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.8" fill="currentColor" stroke="none"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    route: '<path d="M7 17L17 7M9 7h8v8"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7" stroke-width="2.4"/>',
    x: '<path d="M6 6l12 12M18 6L6 18" stroke-width="2.2"/>',
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
    repeat: '<path d="M4 12a7 7 0 0 1 12-5l3 3M20 12a7 7 0 0 1-12 5l-3-3"/><path d="M19 4v6h-6M5 20v-6h6"/>',
    note: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9S9.5 5.7 12 3z"/>',
    out: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h10"/>',
    share: '<path d="M12 3.5v11M7.5 8L12 3.5 16.5 8M5 13v6.5h14V13"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    back: '<path d="M20 12H4M10 6l-6 6 6 6" stroke-width="2.1"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5H10"/>',
    chat: '<path d="M4 5.5h16v11H9l-5 4z"/>',
    door: '<path d="M6 20.5V4.5h12v16M3.5 20.5h17M14.5 12.5h.01" stroke-width="2"/>',
    group: '<circle cx="12" cy="8" r="3"/><circle cx="5.5" cy="10" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M7 19c.6-3 2.5-4.5 5-4.5s4.4 1.5 5 4.5M2.5 18c.3-1.8 1.4-2.9 3-3.2M21.5 18c-.3-1.8-1.4-2.9-3-3.2"/>',
    personPlus: '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 20c.8-3.6 3.3-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.4M18 13v6M15 16h6"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01" stroke-width="2.2"/>',
    swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    pencil: '<path d="M4 20l1-4.5L16 4.5l3.5 3.5-11 11z"/>',
    dumb: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5" stroke-width="2.2"/><circle cx="12" cy="7.8" r="1.2" fill="currentColor" stroke="none"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    grip: '<path d="M5 8h14M5 12h14M5 16h14"/>',
    pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
    home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z"/>',
    today: '<rect x="3.5" y="5" width="17" height="15" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><rect x="8" y="13" width="4" height="4" rx="1" fill="currentColor" stroke="none"/>'
  };
  function ic(n, cls) { return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + "</svg>"; }

  /* ---------- State ---------- */
  var ACC = [
    { k: "pink", n: "Move pink", fill: "#E6164A", on: "#FFFFFF", tl: "#C8103D", td: "#FF6482" },
    { k: "mono", n: "Zwart-wit", fill: "#18181B", on: "#FFFFFF", tl: "#18181B", td: "#FAFAFA", fillD: "#FAFAFA", onD: "#18181B" },
    { k: "indigo", n: "Indigo", fill: "#6155F5", on: "#FFFFFF", tl: "#5146E0", td: "#9D97FF" },
    { k: "blue", n: "Calendar blue", fill: "#0071E3", on: "#FFFFFF", tl: "#0066CC", td: "#4AA3FF" },
    { k: "green", n: "Exercise green", fill: "#30D158", on: "#000000", tl: "#1A7F37", td: "#4CD964" },
    { k: "orange", n: "Health orange", fill: "#FF8D28", on: "#000000", tl: "#B35400", td: "#FFA654" }
  ];
  var PREF = { setup: "team", lang: "nl", plat: "ios", mode: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light", accent: "pink", glass: "regular", role: "owner", app: "pro" };
  try { var saved = JSON.parse(localStorage.getItem("fivvi-proto-v2") || "{}"); for (var pk in saved) if (pk in PREF) PREF[pk] = saved[pk]; } catch (e) { /* storage unavailable */ }
  var S, TPL0 = JSON.stringify(D.tpl), TPLS0 = JSON.stringify(D.templates), HIST0 = JSON.stringify(D.history), WST0 = {};
  [D.today].concat(Object.keys(SETUPS).map(function (k) { return SETUPS[k].today || []; })).forEach(function (l) { l.forEach(function (it) { if (it.wstate) WST0[it.id] = it.wstate; }); });
  function fresh() {
    /* the workspace's templates go back to the fictional start, in place: the trainer web reads the same object */
    Object.keys(D.tpl).forEach(function (k) { delete D.tpl[k]; }); var t0 = JSON.parse(TPL0); Object.keys(t0).forEach(function (k) { D.tpl[k] = t0[k]; });
    /* a workout the trainer started or finished while clicking around is not there after a reset; the sample's own states stay */
    Object.keys(DAYCACHE).forEach(function (k) { DAYCACHE[k].forEach(function (it) { if (it.wstate && WST0[it.id] !== it.wstate) delete it.wstate; }); });
    /* and so do the clients' own lists (F042) */
    Object.keys(D.templates).forEach(function (k) { delete D.templates[k]; }); var tl0 = JSON.parse(TPLS0); Object.keys(tl0).forEach(function (k) { D.templates[k] = tl0[k]; });
    /* the logged workouts too (F045): corrected, shared, unshared and deleted ones come back as they were, and so does the state of their sessions */
    Object.keys(D.history).forEach(function (k) { delete D.history[k]; }); var h0 = JSON.parse(HIST0); Object.keys(h0).forEach(function (k) { D.history[k] = h0[k]; });
    Object.keys(DAYCACHE).forEach(function (k) { DAYCACHE[k].forEach(function (it) { if (WST0[it.id]) it.wstate = WST0[it.id]; }); });
    var duoIt = findItem("s6"); if (duoIt) { duoIt.it.client = "lisa"; duoIt.it.duo = "eva"; duoIt.it.cancelled = false; }
    D.resetBilling();
    S = { signedIn: true, signStep: "email", email: "", code: "", tab: "today", stacks: { today: [], agenda: [], clients: [], profile: [] },
      sheet: null, alert: null, menu: null, toast: null, anim: null, scope: "me", aview: "week", aday: TODAY, q: "", exq: "",
      log: null, logs: {}, sess: {}, form: {}, err: {}, tabMin: false, showAll: {}, showDesc: {}, duoSel: {}, preview: false, scrollBottom: false };
  }
  fresh();
  function top() { var st = S.stacks[S.tab]; return st[st.length - 1] || { n: S.tab }; }
  function isOwner(ws) { return PREF.role === "owner" && (ws || "sf") === "sf"; }

  /* ---------- Small components ---------- */
  function dattrs(d) { var s = ""; for (var k in d || {}) s += " data-" + k + '="' + esc(d[k]) + '"'; return s; }
  function row(o) {
    var act = o.a ? ' data-a="' + o.a + '"' + dattrs(o.d) + ' role="button" tabindex="0"' : "";
    return '<div class="row ' + (o.cls || "") + '"' + act + (o.style ? ' style="' + o.style + '"' : "") + ">" + (o.lead || "") +
      '<div class="m"><b>' + o.title + "</b>" + (o.sub ? "<span>" + o.sub + "</span>" : "") + (o.small ? "<small>" + o.small + "</small>" : "") + (o.extra || "") + "</div>" +
      (o.tr ? '<div class="tr">' + o.tr + "</div>" : "") + (o.chev !== false && o.a && PREF.plat === "ios" ? ic("chevR", "chev") : "") + "</div>";
  }
  function grp(rows, style) { return '<div class="grp"' + (style ? ' style="' + style + '"' : "") + ">" + rows.join("") + "</div>"; }
  function sh(t, link, cls) { return '<div class="sh ' + (cls || "") + '"><h2>' + t + "</h2>" + (link || "") + "</div>"; }
  function btn(label, o) { o = o || {}; return '<button class="btn ' + (o.k || "pri") + (o.blk ? " blk" : "") + (o.sm ? " sm" : "") + '"' + (o.a ? ' data-a="' + o.a + '"' : "") + dattrs(o.d) + (o.dis ? " disabled" : "") + ">" + (o.i ? ic(o.i) : "") + label + "</button>"; }
  function seg(opts, val, a, extra) { return '<div class="seg" role="group">' + opts.map(function (o) { return '<button data-a="' + a + '" data-v="' + o[0] + '"' + dattrs(extra) + (o[2] ? " disabled" : "") + ' class="' + (o[0] === val ? "on" : "") + '" aria-pressed="' + (o[0] === val) + '">' + o[1] + "</button>"; }).join("") + "</div>"; }
  function lt(eb, h, sub) { return '<div class="lt">' + (eb ? '<p class="eb">' + eb + "</p>" : "") + "<h1>" + h + "</h1>" + (sub ? '<div class="sub">' + sub + "</div>" : "") + "</div>"; }
  function foot(t) { return '<div class="foot">' + t + "</div>"; }
  function fld(label, input, cls) {
    var m = /data-(?:f|in)="([^"]+)"/.exec(input), e = m && S.err && S.err[m[1]];
    return '<label class="fld ' + (cls || "") + (e ? " invalid" : "") + '"><span class="fl">' + label + "</span>" + input + (e ? '<small class="err" role="alert">' + ic("warn") + esc(e) + "</small>" : "") + "</label>";
  }
  function inp(f, type, ph, extra) { return '<input data-f="' + f + '" type="' + (type || "text") + '" value="' + esc(S.form[f] || "") + '" placeholder="' + esc(ph || "") + '"' + (extra || "") + ">"; }
  function sel(f, opts) { return '<select data-f="' + f + '">' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(S.form[f]) === String(v) ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select>"; }
  function avatar(name, c, cls) { return '<span class="av ' + (cls || "") + '" style="--c:' + (c || "#8E8E93") + '">' + initials(name) + "</span>"; }
  function wsLine(ws) { var w = D.workspaces[ws]; return '<i class="wsdot" style="--c:' + w.color + '"></i>' + w.name; }

  function shape(kind, color, letter) {
    var n = kind === "cookie" ? 9 : kind === "clover" ? 4 : 12, r = 19, amp = kind === "cookie" ? 1.8 : kind === "clover" ? 4 : 2.4, d = "";
    for (var i = 0; i <= 180; i++) { var a = i / 180 * 2 * Math.PI, rr = r - amp + amp * Math.cos(a * n); d += (i ? "L" : "M") + (22 + rr * Math.cos(a)).toFixed(2) + " " + (22 + rr * Math.sin(a)).toFixed(2); }
    return '<svg class="shape" viewBox="0 0 44 44" aria-hidden="true"><path d="' + d + 'Z" style="fill:color-mix(in srgb,' + color + ' 24%,var(--m-c-low))"/><text x="22" y="27.5" text-anchor="middle" font-size="14" font-weight="700" style="fill:color-mix(in oklab,' + color + ' calc(100% - var(--ev-ink-amt)),var(--ev-ink))">' + esc(letter) + "</text></svg>";
  }
  var SHAPE = { priv: "cookie", group: "clover", gym: "burst" };

  function rings(vals) {
    var uid = Math.random().toString(36).slice(2, 7), R = [49, 35, 21];
    var g = vals.map(function (v, i) { return '<linearGradient id="g' + uid + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:color-mix(in oklab,' + v[1] + ' 68%,#fff)"/><stop offset="1" style="stop-color:' + v[1] + '"/></linearGradient>'; }).join("");
    var c = vals.map(function (v, i) { return '<circle cx="56" cy="56" r="' + R[i] + '" style="stroke:color-mix(in srgb,' + v[1] + ' 22%,transparent)"/><circle cx="56" cy="56" r="' + R[i] + '" stroke="url(#g' + uid + i + ')" pathLength="100" stroke-dasharray="' + Math.max(0.5, Math.min(100, v[0] * 100)).toFixed(1) + ' 100"/>'; }).join("");
    return '<svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true"><defs>' + g + '</defs><g fill="none" stroke-width="12" stroke-linecap="round" transform="rotate(-90 56 56)">' + c + "</g></svg>";
  }
  function wavy(p, color) {
    var cx = 42, cy = 42, r = 32, steps = 200, end = Math.round(steps * p), d = "";
    for (var i = 0; i <= end; i++) { var a = -Math.PI / 2 + i / steps * 2 * Math.PI, rr = r + 2.2 * Math.sin(i / steps * 2 * Math.PI * 10); d += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(2) + " " + (cy + rr * Math.sin(a)).toFixed(2); }
    var ts = -Math.PI / 2 + (p + 0.06) * 2 * Math.PI, te = -Math.PI / 2 + 0.94 * 2 * Math.PI, big = te - ts > Math.PI ? 1 : 0;
    var track = p < 0.9 ? '<path d="M' + (cx + r * Math.cos(ts)).toFixed(2) + " " + (cy + r * Math.sin(ts)).toFixed(2) + " A" + r + " " + r + " 0 " + big + " 1 " + (cx + r * Math.cos(te)).toFixed(2) + " " + (cy + r * Math.sin(te)).toFixed(2) + '" style="stroke:color-mix(in srgb,' + color + ' 24%,transparent)" stroke-width="6" fill="none" stroke-linecap="round"/>' : "";
    return '<svg viewBox="0 0 84 84" width="84" height="84" aria-hidden="true">' + track + (end > 0 ? '<path d="' + d + '" fill="none" style="stroke:' + color + '" stroke-width="6" stroke-linecap="round"/>' : "") + "</svg>";
  }

  /* An agenda item as a row: Calendar-style time + bar on iOS, a shaped avatar on Android. */
  function itemRow(it, k, opt) {
    opt = opt || {};
    var c = CV[it.type], past = isPast(it, k), booked = (it.people || []).length;
    var full = it.cap && booked >= it.cap;
    /* iOS shows the booked count as a pill, so the line stays short; Android has no pill and keeps it in the line. */
    var tl = MIXED() ? TYPE[it.type] : "";
    var sub = it.type === "priv" ? (it.duo ? "Duosessie · " : tl ? tl + " · " : "") + esc(it.loc) : PREF.plat === "ios" || it.cancelled ? (tl || esc(it.loc.split(",")[0])) : (tl ? tl + " · " : "") + (full ? "Vol" : booked + "/" + it.cap + " geboekt");
    var smalls = [];
    if (opt.multi !== false && !opt.hideWs && !SOLO()) smalls.push(wsLine(it.ws));
    if (opt.who) smalls.push(it.trainer ? esc(it.trainer) : "Jij"); else if (it.trainer) smalls.push(esc(it.trainer));
    if (it.sub) smalls.push("Je valt in voor " + esc(it.sub));
    if (it.type === "priv" && past && !it.cancelled && it.att) smalls.push(it.att === "yes" ? "Aanwezig" : "Niet verschenen");
    var extra = "";
    if (it.type === "priv" && past && !it.att && !it.cancelled && !opt.noNudge) {
      extra = '<small class="nudge">' + ic("warn") + "Aanwezigheid nog invullen</small><div class=\"att\">" + btn("Aanwezig", { k: "sec", a: "att", d: { id: it.id, v: "yes" } }) + btn("Niet verschenen", { k: "sec", a: "att", d: { id: it.id, v: "no" } }) + "</div>";
    }
    var pill = it.cancelled ? '<span class="pill">Geannuleerd</span>' : full ? '<span class="pill strong">Vol</span>' : it.cap ? '<span class="pill">' + booked + "/" + it.cap + "</span>" : "";
    var o = { a: it.type === "priv" ? "open-session" : "open-class", d: { id: it.id }, title: esc(title(it)) + lvlTag(it, true), sub: sub, small: smalls.join(" · "), extra: extra,
      cls: (past && !extra ? "past " : "") + (it.cancelled ? "cx" : ""), style: "--c:" + c };
    if (PREF.plat === "ios") {
      o.lead = '<div class="t"><b>' + it.s + "</b><span>" + it.e + '</span></div><i class="bar"></i>';
      o.tr = it.type === "priv" ? "" : pill;
    } else {
      o.lead = shape(SHAPE[it.type], c, it.type === "priv" ? initials(CLIENT[it.client].name) : it.type === "gym" ? "OG" : it.title[0]);
      o.tr = '<div class="tm">' + it.s + "<br>" + it.e + "</div>";
    }
    return row(o);
  }

  function nl(x) { return String(x).replace(".", ","); }
  function diffTag(d) { return d ? '<span class="diff-e" role="img" aria-label="' + D.DIFF[d][1] + '" title="' + D.DIFF[d][1] + '">' + D.DIFF[d][0] + "</span>" : ""; }
  function lastTime(cid) {
    var h = prevHist(cid);
    if (!h || !h.sets) return sh("Vorige keer", "", "small") + '<div class="pad"><div class="grp"><div class="row"><div class="m"><span>Nog geen eerdere training</span></div></div></div></div>';
    var hard = h.sets.filter(function (x) { return x[2] === "h"; }).map(function (x) { return x[0]; });
    var rows = h.sets.map(function (x) { return row({ title: esc(x[0]), sub: esc(x[1]), tr: diffTag(x[2]), cls: "kv" }); });
    if (h.note) rows.push(row({ lead: '<span class="dc-ic" style="--c:#8E8E93">' + ic("note") + "</span>", title: '<span translate="no">' + esc(h.note) + "</span>", small: "Notitie van " + esc(h.by) + " · alleen voor trainers", cls: "wrap dc" }));
    return sh("Vorige keer · " + h.d, '<button data-a="open-workout" data-id="' + cid + '" data-h="' + h.id + '">Details</button>', "small") +
      '<div class="pad"><p class="lastsum">' + esc(h.name) + (h.dur ? " · " + h.dur : "") + " · " + h.n + " oefeningen" + (hard.length ? ' · <span class="hard">' + diffTag("h") + "<span>Zwaar: " + hard.map(esc).join(", ") + "</span></span>" : "") + "</p>" + grp(rows) + "</div>";
  }
  function progressList(cid) {
    var L = D.lifts[cid], wk = D.weeks[cid]; if (!L && !wk) return "";
    var rows = (L || []).map(function (l) { var v = l[1], d = v[v.length - 1] - v[0]; return row({ title: esc(l[0]), sub: (d > 0 ? "+" : "") + nl(d) + " kg in 8 weken", tr: D.spark(v, "var(--accent)") + '<b class="num lift-n">' + nl(v[v.length - 1]) + "<small> kg</small></b>", cls: "kv" }); });
    if (wk) rows.push(row({ title: "Getraind", sub: wk.filter(function (x) { return x; }).length + " van de 8 weken", tr: '<span class="wkdots" aria-hidden="true">' + wk.map(function (x) { return '<i class="' + (x ? "on" : "") + '"></i>'; }).join("") + "</span>", cls: "kv" }));
    return sh("Voortgang", "", "small") + '<div class="pad">' + grp(rows) + "</div>";
  }
  /* ---------- Logged workouts (F045, owner 11 Nov 2026) ----------
     Any owner or trainer of the workspace may correct, delete, share or stop sharing any logged workout; it keeps showing who logged it.
     D.history[client] is the one list, so the client app and the client web read the same state: shared = the day it was shared. */
  var TODAYD = shortDate(NOW), TODAYS = dateOnly(TODAYD), HSEQ = 0;
  function hist(cid) { return D.history[cid] || []; }
  /* a logged workout is found by its id, never by its place in the list: logging a new one puts it at the top */
  function wkOf(cid, id) { return hist(cid).filter(function (h) { return h.id === id; })[0]; }
  function dateOnly(d) { return String(d).replace(/^\S+ /, ""); }
  /* the library exercises a workout does not have yet (adding one while correcting) */
  function exLeft(ex) { return D.library.filter(function (l) { return ex.every(function (e) { return e.name !== l.n; }); }); }
  /* the 😌 / 🙂 / 🥵 buttons of one exercise; act = the action, d = the attributes that tell the action which exercise */
  function diffBtns(e, act, attrs) {
    return [["e", "😌", "Makkelijk"], ["n", "🙂", "Normaal"], ["h", "🥵", "Zwaar"]].map(function (x) { return '<button class="' + (e.diff === x[0] ? "on" : "") + '" data-a="' + act + '"' + attrs + ' data-v="' + x[0] + '" aria-label="' + x[2] + '" aria-pressed="' + (e.diff === x[0]) + '" title="' + x[2] + '"><span aria-hidden="true">' + x[1] + "</span></button>"; }).join("");
  }
  /* "Vorige keer" is the last workout before today's */
  function prevHist(cid) { var l = hist(cid); for (var i = 0; i < l.length; i++) if (l[i].d !== TODAYD) return l[i]; return null; }
  function entryOf(it, cid) { var l = hist(cid || it.client); for (var i = 0; i < l.length; i++) if (l[i].sid === it.id) return l[i]; return null; }
  function itShared(it, cid) { var h = entryOf(it, cid); return h ? !!h.shared : !!it.shared; }
  function wkShare(h) { h.shared = TODAYS; }
  function wkUnshare(h) { delete h.shared; }
  /* deleting it also reopens its session, which has no workout any more */
  function wkDelete(cid, h) { var l = hist(cid), i = l.indexOf(h); if (i >= 0) l.splice(i, 1); var f = h.sid && findItem(h.sid); if (f && f.it.wstate === "done") f.it.wstate = null; }
  function libTy(n) { var l = D.library.filter(function (e) { return e.n === n; })[0]; return l ? l.ty : "wr"; }
  /* "60 kg × 8, 8, 7" → three logger sets; "0:45 × 2, 0:40" → 0:45, 0:45, 0:40; "500 m · 1:52" → one distance and time. The other way round on save. */
  function parseHist(s) {
    var ty = libTy(s[0]), t = s[1], sets = [], m;
    if (ty === "wr") t.split(" · ").forEach(function (seg) { m = /^([\d.,]+)\s*kg\s*×\s*(.+)$/.exec(seg); if (m) m[2].split(/,\s*/).forEach(function (r) { sets.push({ v: [m[1], r], done: false }); }); });
    else if (ty === "r") t.replace(/\s*herh\.$/, "").split(/,\s*/).forEach(function (r) { sets.push({ v: [r], done: false }); });
    else if (ty === "t") { var parts = t.split(/\s*×\s*/), first = (parts[0] || "0:30").split(":"); if (parts[1]) { var ps = parts[1].split(/,\s*/); for (var i = 0; i < (+ps[0] || 1); i++) sets.push({ v: [first[0], first[1] || "0"], done: false }); ps.slice(1).forEach(function (x) { var q = x.split(":"); sets.push({ v: [q[0], q[1] || "0"], done: false }); }); } else sets.push({ v: [first[0], first[1] || "0"], done: false }); }
    else t.split(/,\s*/).forEach(function (seg) { m = /^([\d.,]+)\s*m?\s*·\s*(\d+):(\d+)$/.exec(seg); if (m) sets.push({ v: [m[1], m[2], m[3]], done: false }); });
    if (!sets.length) sets.push({ v: { wr: ["0", "0"], r: ["0"], t: ["0", "30"], dt: ["500", "2", "00"] }[ty].slice(), done: false });
    return { name: s[0], ty: ty, target: "", prev: [], sets: sets, diff: s[2] || "n" };
  }
  function fmtHist(e) {
    var ss = e.sets, t, runs;
    function v(x, d) { return x === "" || x == null ? d || "0" : x; }
    if (e.ty === "wr") { runs = []; ss.forEach(function (x) { var w = v(x.v[0]), l = runs[runs.length - 1]; if (l && l[0] === w) l[1].push(v(x.v[1])); else runs.push([w, [v(x.v[1])]]); }); t = runs.map(function (r) { return r[0] + " kg × " + r[1].join(", "); }).join(" · "); }
    else if (e.ty === "r") t = ss.map(function (x) { return v(x.v[0]); }).join(", ") + " herh.";
    else if (e.ty === "t") { var tm = ss.map(function (x) { return v(x.v[0]) + ":" + pad2(+v(x.v[1])); }), n0 = 1; while (n0 < tm.length && tm[n0] === tm[0]) n0++; t = tm[0] + " × " + n0 + tm.slice(n0).map(function (x) { return ", " + x; }).join(""); }
    else t = ss.map(function (x) { return v(x.v[0]) + " m · " + v(x.v[1]) + ":" + pad2(+v(x.v[2])); }).join(", ");
    return [e.name, t, e.diff || "n"];
  }
  function lastDiff(cid, name) { var h = prevHist(cid), x = h && h.sets && h.sets.filter(function (y) { return y[0] === name; })[0]; return x && x[2] ? " · vorige keer " + D.DIFF[x[2]][0] : ""; }

  /* ---------- Screens (each returns a page description) ---------- */
  var SCREENS = {};

  SCREENS.today = function () {
    var ws = S.scope === "ws" && OWNER() && !SOLO();
    var items = ws ? dayItems(TODAY).filter(function (i) { return i.ws === "sf"; }).concat(EXTRA_WS).sort(function (a, b) { return mins(a.s) - mins(b.s); }) : dayItems(TODAY);
    var live = items.filter(function (i) { return !i.cancelled && mins(i.e) > mins(NOWT); });
    var next = live[0];
    /* The top of Vandaag, in the variant chosen in the panel. Each shows only what exists: no group or Open Gym
       figures for a trainer who has none. */
    var active = items.filter(function (i) { return !i.cancelled; });
    var done = active.filter(function (i) { return isPast(i, TODAY); }).length;
    var span = active.length ? active[0].s + "–" + active.reduce(function (m, i) { return mins(i.e) > mins(m) ? i.e : m; }, active[0].e) : "";
    var summary = active.length ? active.length + (active.length === 1 ? " sessie" : " sessies") + " · " + span + " · " + done + " klaar" : "Geen sessies vandaag";
    var body = "";
    if (OWNER() && !SOLO()) body += '<div class="pad" style="margin-bottom:12px">' + seg([["me", "Mijn dag"], ["ws", "Hele studio"]], S.scope, "scope") +
      '<div class="scope-note">' + (ws ? "Alles bij " + esc(D.workspaces.sf.name) + " vandaag, van alle trainers." : WSS().length > 1 ? "Jouw sessies bij Studio Fit en John's Gym." : "Alleen jouw sessies.") + "</div></div>";
    body += '<div class="pad stack">' + (ws ? teamStrip(items) : dayCard(items));
    if (next) {
      var inMin = mins(next.s) - mins(NOWT), cap = isLive(next, TODAY) ? "Nu bezig" : "Straks · over " + inMin + " min";
      body += '<div class="hero" style="--c:' + CV[next.type] + '"><div class="cap">' + cap + "</div><h3>" + esc(title(next)) + "</h3><p>" + next.s + "–" + next.e + (MIXED() ? " · " + TYPE[next.type] : "") + " · " + esc(next.loc) + "</p>" +
        (ws ? '<p style="margin-top:2px">Trainer: ' + (next.trainer ? esc(next.trainer) : "jij") + "</p>" : "") +
        (next.type === "priv" && pair(next).some(function (x) { return sessTpl(next, x); }) ? '<p style="margin-top:2px">Schema: ' + pair(next).map(function (x) { return sessTpl(next, x); }).filter(function (t, i, a) { return t && a.indexOf(t) === i; }).map(esc).join(", ") + "</p>" : "") +
        '<div class="acts">' + (next.type === "priv" ? '<button class="gl glass" data-a="start-workout" data-id="' + next.id + '">' + ic("play") + (S.logs[next.id] ? "Doorgaan met training" : "Training starten") + "</button>" : "") +
        '<button class="gl glass' + (next.type === "priv" ? " ic" : "") + '" data-a="' + (next.type === "priv" ? "open-session" : "open-class") + '" data-id="' + next.id + '" aria-label="Openen">' + (next.type === "priv" ? ic("chevR") : "Openen") + "</button></div></div>";
    }
    body += "</div>";
    var rest = items.filter(function (i) { return !next || i.id !== next.id; });
    body += sh("Vandaag", '<button data-a="tab" data-v="agenda">Agenda</button>');
    body += '<div class="pad">' + (rest.length ? grp(rest.map(function (i) { return itemRow(i, TODAY, { hideWs: ws, who: ws }); }), "--inset:94px") : '<div class="empty">Geen sessies vandaag.</div>') + "</div>";
    var tom = dayItems(key(add(NOW, 1)));
    body += '<div class="pad" style="margin-top:12px">' + grp([row({ a: "agenda-day", d: { k: key(add(NOW, 1)) }, title: "Morgen", sub: tom.length + " sessies, eerste om " + tom[0].s, lead: PREF.plat === "ios" ? "" : "" })]) + "</div>";
    if (PAYLOCK() && OWNER()) body = '<div class="pad" style="margin-bottom:12px"><div class="banner" style="--c:var(--gym)">' + ic("warn") + "<span><b>Koppel je betalingen op het web.</b> Zonder koppeling kunnen klanten nog niet meedoen of kopen. Dit doe je op fivvi.app, in Instellingen.</span></div></div>" + body;
    return { large: true, eb: longDate(NOW), title: "Vandaag", sub: summary, body: body, add: { a: "new", label: "Nieuw" } };
  };

  SCREENS.agenda = function () {
    var sel = parse(S.aday), body = "";
    body += '<div class="pad" style="margin-bottom:10px">' + seg([["day", "Dag"], ["week", "Week"], ["month", "Maand"]], S.aview, "aview") + "</div>";
    if (S.aview !== "month") {
      var mon = monday(sel), days = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return add(mon, i); });
      body += '<div class="wk"><span></span>' + days.map(function (d) { return '<div class="d">' + DS[d.getDay()] + "</div>"; }).join("") + "<span></span>" +
        '<button class="nav" data-a="week" data-v="-1" aria-label="Vorige week">' + ic("chevL") + "</button>" +
        days.map(function (d) {
          var k = key(d), its = dayItems(k).filter(function (i) { return !i.cancelled; });
          return '<div><button class="n ' + (k === TODAY ? "today " : "") + (k === S.aday ? "sel" : "") + '" data-a="aday" data-k="' + k + '" aria-label="' + longDate(d) + '">' + d.getDate() + '</button><div class="dots">' + its.slice(0, 3).map(function (i) { return '<i style="--c:' + CV[i.type] + '"></i>'; }).join("") + "</div></div>";
        }).join("") + '<button class="nav" data-a="week" data-v="1" aria-label="Volgende week">' + ic("chevR") + "</button></div>";
      body += '<div class="wklabel">Week ' + isoWeek(mon) + " · " + mon.getDate() + " " + MS[mon.getMonth()] + " – " + add(mon, 6).getDate() + " " + MS[add(mon, 6).getMonth()] + " " + add(mon, 6).getFullYear() + "</div>";
    }
    if (S.aview === "day") {
      var its = dayItems(S.aday), hh = 56, start = 7, h = "", hours = 14;
      for (var i = 0; i <= hours; i++) h += '<div class="h" style="top:' + (10 + i * hh) + 'px"><span>' + pad2(start + i) + ":00</span></div>";
      /* side-by-side columns for overlaps */
      var cols = []; its.forEach(function (it) { var c = 0; while (cols[c] && cols[c].some(function (o) { return mins(o.s) < mins(it.e) && mins(it.s) < mins(o.e); })) c++; (cols[c] = cols[c] || []).push(it); it._col = c; });
      its.forEach(function (it) {
        var n = 1; cols.forEach(function (col, ci) { if (col.some(function (o) { return mins(o.s) < mins(it.e) && mins(it.s) < mins(o.e); })) n = Math.max(n, ci + 1); });
        var topp = 10 + (mins(it.s) - start * 60) / 60 * hh, ht = (mins(it.e) - mins(it.s)) / 60 * hh - 3;
        h += '<button class="ev ink' + (it.cancelled ? " cx" : "") + '" data-a="' + (it.type === "priv" ? "open-session" : "open-class") + '" data-id="' + it.id + '" style="--c:' + CV[it.type] + ";top:" + topp + "px;height:" + ht + "px;left:calc(62px + (100% - 76px) * " + it._col / n + ");width:calc((100% - 76px) / " + n + ' - 3px)"><b>' + esc(title(it)) + "</b><span>" + it.s + (it.cap ? " · " + (it.cancelled ? "Geannuleerd" : it.people.length + "/" + it.cap) : " · " + esc(it.loc)) + "</span></button>";
      });
      if (S.aday === TODAY) h += '<div class="nowl" style="top:' + (10 + (mins(NOWT) - start * 60) / 60 * hh) + 'px"></div>';
      body += '<div class="tl" style="height:' + (hours * hh + 30) + 'px">' + h + "</div>";
    } else if (S.aview === "week") {
      var mon2 = monday(sel);
      for (var d = 0; d < 7; d++) {
        var dd = add(mon2, d), k = key(dd), list = dayItems(k);
        body += sh((k === TODAY ? "Vandaag · " : "") + longDate(dd), "", "small" + (k === S.aday ? " selday" : ""));
        body += '<div class="pad">' + (list.length ? grp(list.map(function (it) { return itemRow(it, k, { noNudge: k !== TODAY }); }), "--inset:94px") : '<div class="grp"><div class="row"><div class="m"><span>Geen sessies</span></div></div></div>') + "</div>";
      }
    } else {
      var first = new Date(sel.getFullYear(), sel.getMonth(), 1), gs = monday(first), mh = "";
      body += '<div class="wk" style="grid-template-columns:44px 1fr 44px;margin-bottom:6px"><button class="nav" data-a="month" data-v="-1" aria-label="Vorige maand">' + ic("chevL") + '</button><div style="font-weight:700;font-size:20px;text-transform:capitalize">' + MONTHS[sel.getMonth()] + " " + sel.getFullYear() + '</div><button class="nav" data-a="month" data-v="1" aria-label="Volgende maand">' + ic("chevR") + "</button></div>";
      mh += ["ma", "di", "wo", "do", "vr", "za", "zo"].map(function (x) { return '<div class="d">' + x + "</div>"; }).join("");
      for (var c2 = 0; c2 < 42; c2++) {
        var cd = add(gs, c2), ck = key(cd);
        if (c2 >= 35 && cd.getMonth() !== sel.getMonth()) break;
        var cits = dayItems(ck).filter(function (i) { return !i.cancelled; });
        mh += '<button class="' + (cd.getMonth() !== sel.getMonth() ? "out " : "") + (ck === TODAY ? "today " : "") + (ck === S.aday ? "sel" : "") + '" data-a="aday" data-k="' + ck + '"><b>' + cd.getDate() + '</b><span class="dots">' + cits.slice(0, 3).map(function (i) { return '<i style="--c:' + CV[i.type] + '"></i>'; }).join("") + "</span></button>";
      }
      body += '<div class="mo">' + mh + "</div>";
      var sl = dayItems(S.aday);
      body += sh(longDate(sel), "", "small");
      body += '<div class="pad">' + (sl.length ? grp(sl.map(function (it) { return itemRow(it, S.aday, { noNudge: true }); }), "--inset:94px") : '<div class="empty">Geen sessies.</div>') + "</div>";
    }
    return { large: true, title: "Agenda", body: body, add: { a: "new", label: "Nieuw" }, trailing: [{ t: "Vandaag", a: "agenda-today", i: "today" }] };
  };

  /* Hele studio: one lane per trainer (and one for Open Gym), so sessions at the same time never pile up. The header
     names the busiest moment, which matters when space or equipment is limited. */
  function teamStrip(items) {
    var act = items.filter(function (i) { return !i.cancelled; });
    if (!act.length) return '<div class="card ds"><div class="ds-top"><b>Geen sessies vandaag</b></div></div>';
    function who(i) { return i.type === "gym" ? "Open Gym" : i.trainer || D.me.name; }
    var names = []; act.forEach(function (i) { if (names.indexOf(who(i)) < 0) names.push(who(i)); });
    names.sort(function (a, b) { return a === D.me.name ? -1 : b === D.me.name ? 1 : a === "Open Gym" ? 1 : b === "Open Gym" ? -1 : a.localeCompare(b); });
    var s0 = Math.min.apply(null, act.map(function (i) { return mins(i.s); })), e0 = Math.max.apply(null, act.map(function (i) { return mins(i.e); }));
    var h0 = Math.floor(s0 / 60), h1 = Math.max(h0 + 9, Math.ceil(e0 / 60)), range = (h1 - h0) * 60;
    /* busiest moment: the most sessions at once, and when */
    var ev = []; act.forEach(function (i) { ev.push([mins(i.s), 1], [mins(i.e), -1]); });
    ev.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cur = 0, peak = 0, pS = 0, pE = 0;
    ev.forEach(function (x, k) { cur += x[1]; if (cur > peak) { peak = cur; pS = x[0]; pE = ev[k + 1] ? ev[k + 1][0] : x[0]; } });
    var rowsH = names.map(function (n) {
      var its = act.filter(function (i) { return who(i) === n; }), lanes = [];
      its.forEach(function (it) { var l = 0; while (lanes[l] && lanes[l].some(function (o) { return mins(o.s) < mins(it.e) && mins(it.s) < mins(o.e); })) l++; (lanes[l] = lanes[l] || []).push(it); it._lane = l; });
      var LH = lanes.length > 1 ? 11 : 20;
      var blocks = its.map(function (it) {
        var left = (mins(it.s) - h0 * 60) / range * 100, w = (mins(it.e) - mins(it.s)) / range * 100;
        return '<button class="ds-b' + (isPast(it, TODAY) ? " past" : "") + '" data-a="' + (it.type === "priv" ? "open-session" : "open-class") + '" data-id="' + it.id + '" style="--c:' + CV[it.type] + ";left:" + left.toFixed(2) + "%;width:calc(" + w.toFixed(2) + "% - 2px);top:" + (it._lane * (LH + 1)) + "px;height:" + LH + 'px" aria-label="' + esc(n) + ": " + esc(title(it)) + " " + it.s + '"></button>';
      }).join("");
      var lab = n === "Open Gym" ? '<span class="av" style="--c:var(--gym);width:24px;height:24px;font-size:10px;border-radius:7px">OG</span>' : avatar(n, n === D.me.name ? "var(--accent)" : "#8E8E93").replace('class="av ', 'class="av xs ');
      return '<div class="tr-row"><span class="tr-lab" title="' + esc(n) + '">' + lab + '<span>' + (n === "Open Gym" ? "" : esc(n === D.me.name ? "Jij" : n.split(" ")[0])) + '</span></span><div class="tr-track" style="height:' + (lanes.length * (LH + 1) - 1) + 'px">' + blocks + "</div></div>";
    }).join("");
    var now = (mins(NOWT) - h0 * 60) / range * 100, axis = "";
    for (var h = h0; h <= h1; h += 3) axis += '<span style="left:' + ((h - h0) * 60 / range * 100).toFixed(2) + '%">' + pad2(h) + "</span>";
    var trainers = names.filter(function (n) { return n !== "Open Gym"; }).length;
    return '<div class="card ds team"><div class="ds-top"><b>' + trainers + " trainers</b><span>" + (peak > 1 ? "Drukst " + hm(pS) + "–" + hm(pE) + " · " + peak + " tegelijk" : "Geen overlap") + "</span></div>" +
      '<div class="tr-wrap">' + rowsH + '<i class="ds-now" style="left:calc(var(--lab) + (100% - var(--lab)) * ' + (now / 100).toFixed(4) + ')"></i></div>' +
      '<div class="ds-axis" style="margin-left:var(--lab)">' + axis + "</div>" + offerLine(act) + "</div>";
  }
  /* Group classes and Open Gym figures, only for what the day actually has */
  function offerLine(active) {
    var g = active.filter(function (i) { return i.type === "group"; }), o = active.filter(function (i) { return i.type === "gym"; }), out = [];
    if (g.length) { var gb = 0, gc = 0; g.forEach(function (i) { gb += i.people.length; gc += i.cap; }); out.push('<span class="ink" style="--c:var(--group)">Groepslessen ' + gb + "/" + gc + "</span>"); }
    if (o.length) { var ob = 0, oc = 0; o.forEach(function (i) { ob += i.people.length; oc += i.cap; }); out.push('<span class="ink" style="--c:var(--gym)">Open Gym ' + ob + "/" + oc + "</span>"); }
    return out.length ? '<div class="ds-meta">' + out.join('<span class="dot">·</span>') + "</div>" : "";
  }
  /* Mijn dag: what the list below doesn't tell you. Open tasks, the next free gap (with a button to plan in it) and
     the places still ahead today. */
  function dayCard(items) {
    var act = items.filter(function (i) { return !i.cancelled; }), rows = [];
    var todo = [];
    act.forEach(function (i) {
      if (!isPast(i, TODAY)) return;
      var who_ = i.type === "priv" ? CLIENT[i.client].name.split(" ")[0] : i.title;
      if (i.type === "priv" ? !i.att : !(i.attMap && Object.keys(i.attMap).length)) todo.push('<button class="chip" data-a="' + (i.type === "priv" ? "open-session" : "open-class") + '" data-id="' + i.id + '">Aanwezigheid · ' + esc(who_) + " " + i.s + "</button>");
      if (i.type === "priv" && i.wstate === "done" && !itShared(i)) todo.push('<button class="chip" data-a="open-session" data-id="' + i.id + '">Training delen · ' + esc(who_) + "</button>");
    });
    rows.push(row({ lead: '<span class="dc-ic" style="--c:var(--accent)">' + ic("check") + "</span>", title: todo.length ? "Te doen" : "Alles bijgewerkt", extra: todo.length ? '<div class="chips">' + todo.join("") + "</div>" : "", cls: "dc" }));
    /* free time from now until the last session, gaps of 30 minutes or more; Open Gym doesn't need the trainer */
    var busy = act.filter(function (i) { return i.type !== "gym" && mins(i.e) > mins(NOWT); }).map(function (i) { return [Math.max(mins(i.s), mins(NOWT)), mins(i.e)]; }).sort(function (a, b) { return a[0] - b[0]; });
    var gap = null, t = mins(NOWT);
    busy.forEach(function (b) { if (!gap && b[0] - t >= 30) gap = [t, b[0]]; t = Math.max(t, b[1]); });
    if (gap) {
      var len = (gap[1] - gap[0]) / 60;
      rows.push(row({ lead: '<span class="dc-ic" style="--c:var(--ok)">' + ic("clock") + "</span>", title: "Vrij " + hm(gap[0]) + "–" + hm(gap[1]), sub: String(Math.round(len * 2) / 2).replace(".", ",") + " uur", tr: btn("Plannen", { k: "sec", sm: true, a: "plan-at", d: { s: hm(gap[0]) } }), cls: "dc" }));
    } else rows.push(row({ lead: '<span class="dc-ic" style="--c:var(--ok)">' + ic("clock") + "</span>", title: "Geen vrije tijd meer vandaag", cls: "dc" }));
    /* the places still ahead, in order, each once in a row */
    var locs = []; act.filter(function (i) { return i.type !== "gym" && mins(i.e) > mins(NOWT); }).forEach(function (i) { var l = i.loc.split(",")[0]; if (locs[locs.length - 1] !== l) locs.push(l); });
    /* only worth showing when you still have to move between places today */
    if (locs.length > 1) rows.push(row({ lead: '<span class="dc-ic" style="--c:var(--priv)">' + ic("pin") + "</span>", title: "Route vandaag", sub: locs.map(esc).join(" → "), cls: "dc wrap" }));
    return grp(rows, "--inset:60px");
  }

  function clientList() {
    var q = norm(S.q.trim()), out = "";
    WSS().forEach(function (w) {
      var cs = D.clients.filter(function (c) { return c.ws === w && (!q || norm(c.name).indexOf(q) >= 0 || norm(c.email).indexOf(q) >= 0); });
      if (!cs.length) return;
      if (WSS().length > 1) out += sh(wsLine(w) + ' <span style="font-weight:500;opacity:.7">· ' + cs.length + "</span>", "", "small"); else out += '<div style="height:12px"></div>';
      out += '<div class="pad">' + grp(cs.map(function (c) { return row({ a: "open-client", d: { id: c.id }, lead: avatar(c.name, c.c), title: esc(c.name), sub: (c.email ? esc(c.email) : "Geen e-mailadres") + " · " + esc(c.last) }); }), "--inset:68px") + "</div>";
    });
    return out || '<div class="empty">Geen klant gevonden voor “' + esc(S.q) + "”.</div>";
  }
  SCREENS.clients = function () {
    var body = '<div class="pad"><label class="search">' + ic("search") + '<input data-in="q" type="search" placeholder="Zoek op naam of e-mail" value="' + esc(S.q) + '" aria-label="Zoek klant"></label></div><div id="clist">' + clientList() + "</div>";
    return { large: true, title: "Klanten", body: body, add: { a: "new-client", label: "Klant", i: "personPlus" } };
  };

  SCREENS.client = function (r) {
    var c = CLIENT[r.id], notes = D.notes[c.id] || [], hist = D.history[c.id] || [], prog = D.progress[c.id];
    var body = '<div style="text-align:center;padding:0 20px 18px">' + avatar(c.name, c.c, "lg") + '<h1 style="font-size:28px;margin:12px 0 2px">' + esc(c.name) + '</h1><div style="color:var(--label2);font-size:15px">' + wsLine(c.ws) + "</div></div>";
    body += '<div class="pad stack"><div class="btns">' + btn("Nu training starten", { a: "start-now", d: { id: c.id }, i: "play" }) + btn("Sessie plannen", { k: "sec", a: "plan-for", d: { id: c.id }, i: "cal" }) + "</div>";
    if (prog) {
      var w = 320, hgt = 110, mn = Math.min.apply(null, prog) - 5, mx = Math.max.apply(null, prog) + 2.5;
      var pts = prog.map(function (v, i) { return [i / (prog.length - 1) * (w - 16) + 8, hgt - 8 - (v - mn) / (mx - mn) * (hgt - 24)]; });
      var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
      var lp = pts[pts.length - 1];
      body += '<div class="chart"><div class="stat-l ink" style="--c:var(--accent)">Bankdrukken · zwaarste set</div><div class="num" style="font-size:34px;line-height:38px">' + String(prog[prog.length - 1]).replace(".", ",") + '<small style="font-size:17px;color:var(--label2)"> kg</small></div><div style="font-size:15px;color:var(--label2);margin-bottom:8px"><b style="color:var(--ok)">+' + String(prog[prog.length - 1] - prog[0]).replace(".", ",") + " kg</b> in 8 weken</div>" +
        '<svg viewBox="0 0 ' + w + " " + hgt + '"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>' +
        [0.25, 0.5, 0.75].map(function (f) { return '<line x1="0" x2="' + w + '" y1="' + (hgt * f) + '" y2="' + (hgt * f) + '" style="stroke:var(--sep)" stroke-width=".5"/>'; }).join("") +
        '<path d="' + line + "L" + lp[0] + " " + hgt + "L" + pts[0][0] + " " + hgt + 'Z" fill="url(#cg)"/><path d="' + line + '" fill="none" style="stroke:var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + lp[0] + '" cy="' + lp[1] + '" r="5" style="fill:var(--accent);stroke:var(--card)" stroke-width="2.5"/></svg>' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--label2);margin-top:4px"><span>10 sep</span><span>29 okt</span></div></div>';
    }
    body += "</div>";
    /* what the client has: abonnement, credits used / planned / left; the open amount for the owner only */
    if (c.ws === "sf") {
      var bs = D.bsum(c.id), brows = [];
      if (OWNER()) bs.flags.filter(function (f) { return f[0] === "danger"; }).forEach(function (f) { brows.push(row({ lead: '<span class="dc-ic" style="--c:var(--danger)">' + ic("warn") + "</span>", title: esc(f[1]), sub: esc(f[2]), cls: "dc" })); });
      bs.abos.forEach(function (a) { brows.push(row({ lead: '<span class="dc-ic" style="--c:var(--group)">' + ic("group") + "</span>", title: esc(agrName(a)), sub: "Deze week " + a.usedWeek + " van " + a.perWeek + " gebruikt" + (a.makeups ? " · " + a.makeups + (a.makeups === 1 ? " inhaalles" : " inhaallessen") : "") + (a.status === "ending" ? " · " + esc(a.period) : ""), cls: "dc wrap" })); });
      bs.balances.forEach(function (x) {
        var t = Math.max(1, x.total);
        brows.push(row({ lead: '<span class="dc-ic" style="--c:' + x.label[2] + '">' + ic(x.credit === "gym" ? "door" : x.credit === "groep" ? "group" : "me") + "</span>", title: x.label[1].charAt(0).toUpperCase() + x.label[1].slice(1), sub: x.used + " gebruikt · " + x.planned + " gepland · van " + x.total,
          tr: '<span class="bal-n" style="--c:' + x.label[2] + '"><b class="num">' + x.left + "</b> over</span>", extra: '<div class="abar" style="--c:' + x.label[2] + '"><i style="width:' + (x.used / t * 100) + '%"></i><i class="p" style="width:' + (x.planned / t * 100) + '%"></i></div>', cls: "dc" }));
      });
      var renewing = OWNER() ? bs.renew.map(function (r) { return r[0].name; }) : [];
      bs.flags.filter(function (f) { return f[0] === "warn" && f[1].indexOf("Abonnement") !== 0 && renewing.indexOf(f[2]) < 0; }).forEach(function (f) { brows.push(row({ lead: '<span class="dc-ic" style="--c:var(--gym)">' + ic("warn") + "</span>", title: esc(f[1]), cls: "dc" })); });
      if (!brows.length) brows.push(row({ title: "Geen abonnement of credits" }));
      /* the owner renews in one tap: Fivvi suggests it from a month before an agreement stops, or when a pack runs low */
      if (OWNER()) {
        /* payments outside Fivvi (#606, owner 6 Nov 2026): cash is often taken at the desk, so it can be recorded here too */
        if (!PAYLOCK()) bs.b.agreements.forEach(function (a) { if (a.cash && a.next) brows.push(row({ lead: '<span class="dc-ic" style="--c:' + (a.late ? "var(--danger)" : "var(--accent)") + '">' + ic(a.late ? "warn" : "repeat") + "</span>", title: esc(agrName(a)) + ": <span>" + esc(a.cash) + "</span>", sub: a.late ? "Betaling van " + esc(a.next) + " nog niet vastgelegd" : "Volgende betaling " + esc(a.next), tr: btn("Betaald", { sm: true, a: "cash-paid", d: { id: c.id, ag: a.id } }), cls: "dc wrap" })); });
        /* a broken Mollie connection doesn't stop recording (owner, 7 Nov 2026, #606) */
        if (PAYST() === "broken") brows.push(row({ lead: '<span class="dc-ic" style="--c:var(--danger)">' + ic("warn") + "</span>", title: "Online betalen staat stil", sub: "De koppeling met Mollie werkt niet meer. Opnieuw koppelen doe je op het web. Betalingen buiten Fivvi leg je gewoon vast.", cls: "dc wrap" }));
        if (!PAYLOCK()) brows.push(row({ a: "cash", d: { id: c.id }, lead: '<span class="dc-ic" style="--c:var(--accent)">' + ic("plus") + "</span>", title: "Betaling buiten Fivvi", sub: "Contant, pin of overboeking vastleggen", cls: "dc" }));
        bs.renew.forEach(function (r) { var a = r[0]; brows.push(row({ lead: '<span class="dc-ic" style="--c:var(--accent)">' + ic("repeat") + "</span>", title: "Verlengen: <span>" + esc(agrName(a)) + "</span>", sub: a.offerSent ? "Aanbod verstuurd " + esc(a.offerSent) + " · wacht op betaling" : esc(r[1]), small: esc(D.remindLine(a)), tr: a.offerSent ? '<span class="pill">Verstuurd</span>' : PAYSTUDIO() ? btn("Betaald", { sm: true, a: "cash", d: { id: c.id } }) : !PAYONLINE() || !AGROPEN(a) ? "" : btn("Verlengen", { sm: true, a: "offer", d: { id: c.id, ag: a.id } }), cls: "dc wrap" })); });
        if (PAYONLINE()) brows.push(row({ a: "offer", d: { id: c.id }, lead: '<span class="dc-ic" style="--c:var(--accent)">' + ic("plus") + "</span>", title: '<span style="color:var(--accent-text)">Aanbod sturen</span>', cls: "dc", chev: false }));
      }
      body += sh("Tegoed", "", "small") + '<div class="pad">' + grp(brows, "--inset:60px") + "</div>" + (OWNER() ? foot("Fivvi stelt verlengen voor vanaf " + D.RENEW_DAYS + " dagen voor het einde, of als een creditpakket bijna op is. De klant krijgt dan een herinnering en 7 dagen voor het einde nog een, ook als je zelf een aanbod stuurt. Betalingen en facturen vind je op het web.") : "");
    }
    body += lastTime(c.id) + progressList(c.id);
    body += sh("Gegevens", "", "small") + '<div class="pad">' + grp([row({ title: "E-mail", tr: c.email ? esc(c.email) : "Nog niet ingevuld", cls: "kv" }), row({ title: "Taal voor e-mails", tr: esc(c.lang), cls: "kv" }), row({ title: "Werkruimte", tr: wsLine(c.ws), cls: "kv" })]) + "</div>";
    body += sh("Notities", '<button data-a="note" data-id="' + c.id + '">+ Notitie</button>', "small");
    body += '<div class="pad">' + (notes.length ? grp(notes.map(function (n) { return row({ title: '<span translate="no">' + esc(n.t) + "</span>", small: n.d + " · " + esc(n.by), cls: "wrap" }); })) : '<div class="grp"><div class="row"><div class="m"><span>Nog geen notities.</span></div></div></div>') + "</div>" + foot("Alleen trainers van " + D.workspaces[c.ws].name + " zien notities.");
    /* F042: the trainer's own list of templates for this client; the client sees nothing of it */
    var tl = tplList(c.id), cfn = c.name.split(" ")[0];
    body += '<div data-sec="tpl"></div>' + sh("Schema's van " + esc(cfn), "", "small") + '<div class="pad">' + grp((tl.length ? tl.map(function (t) {
      return row({ title: tplName(t), sub: tplCount(D.tpl[t].length), tr: '<button class="btn ghost sm" data-a="cl-tpl-drop-ask" data-id="' + c.id + '" data-t="' + esc(t) + '" aria-label="' + esc(t) + " weghalen bij " + esc(cfn) + '">Weghalen</button>' });
    }) : ['<div class="row"><div class="m"><span>Nog geen schema\'s voor ' + esc(cfn) + ".</span></div></div>"]).concat([row({ a: "cl-tpl-add", d: { id: c.id }, lead: '<span style="color:var(--accent-text);display:grid">' + ic("plus") + "</span>", title: '<span style="color:var(--accent-text)">Schema toevoegen</span>', chev: false })])) + "</div>" + foot("Alleen jij en je collega-trainers zien dit. " + esc(cfn) + " ziet niets van deze lijst.");
    body += sh("Trainingen", "", "small");
    body += '<div class="pad">' + (hist.length ? grp(hist.map(function (h) { return row({ a: "open-workout", d: { id: c.id, h: h.id }, title: esc(h.name), sub: h.d + " · " + h.n + " oefeningen · " + esc(h.by), tr: h.shared ? '<span class="pill">Gedeeld</span>' : "" }); })) : '<div class="grp"><div class="row"><div class="m"><span>Nog geen trainingen.</span></div></div></div>') + "</div>";
    return { title: c.name, inline: true, body: body, trailing: [{ i: "pencil", a: "web-only", label: "Bewerken" }] };
  };

  /* A logged workout (F045): who logged it, whether the client sees it, and the four things a trainer can do with it */
  SCREENS.workout = function (r) {
    var c = CLIENT[r.id], h = wkOf(r.id, r.h), fn = fname(r.id);
    if (!h) return { title: "", body: "" };
    var sets = h.sets || [["Squat", "60 kg × 8, 8, 8"], ["Bankdrukken", "57,5 kg × 8, 8, 6"], ["Plank", "0:45 × 3"]];
    var body = lt(h.d, esc(h.name), esc(c.name));
    body += '<div class="pad">' + grp([
      row({ lead: '<span class="dc-ic" style="--c:' + (h.shared ? "var(--ok)" : "#8E8E93") + '">' + ic(h.shared ? "share" : "lock") + "</span>", title: h.shared ? "Gedeeld met " + esc(fn) + " · " + h.shared : "Niet gedeeld met " + esc(fn), sub: h.shared ? esc(fn) + " ziet deze training bij Activiteit." : esc(fn) + " ziet deze training niet.", cls: "dc wrap" }),
      row({ title: "Gelogd door", tr: '<span translate="no">' + esc(h.by) + "</span>", cls: "kv" })
    ], "--inset:60px") + "</div>";
    body += sh("Oefeningen", "", "small") + '<div class="pad">' + grp(sets.map(function (x) { return row({ title: esc(x[0]), sub: esc(x[1]), tr: diffTag(x[2]) }); })) + "</div>";
    if (h.note) body += sh("Notitie", "", "small") + '<div class="pad">' + grp([row({ title: '<span translate="no">' + esc(h.note) + "</span>", small: esc(h.by) + " · alleen voor trainers", cls: "wrap" })]) + "</div>";
    body += '<div class="pad stack" style="margin-top:16px">' + (h.shared ? btn("Niet meer delen", { k: "sec", blk: true, a: "wk-unshare-ask", d: { id: r.id, h: r.h }, i: "lock" }) : btn("Delen met " + esc(fn), { k: "sec", blk: true, a: "wk-share", d: { id: r.id, h: r.h }, i: "share" })) +
      btn("Wijzigen", { k: "sec", blk: true, a: "wk-edit", d: { id: r.id, h: r.h }, i: "pencil" }) + btn("Training verwijderen", { k: "dng", blk: true, a: "wk-del-ask", d: { id: r.id, h: r.h }, i: "trash" }) + "</div>";
    body += foot("Elke eigenaar of trainer in je werkruimte kan deze training wijzigen, verwijderen en delen.");
    return { title: h.name, body: body };
  };

  SCREENS.session = function (r) {
    var f = findItem(r.id), it = f.it, k = f.day, d = parse(k), cid = it.duo ? (S.duoSel[it.id] || it.client) : it.client, c = CLIENT[cid];
    var body = "";
    if (it.cancelled) body += '<div class="pad" style="margin-bottom:12px"><div class="banner" style="--c:var(--danger)">' + ic("warn") + "Deze sessie is geannuleerd.</div></div>";
    body += lt(it.duo ? "Duosessie" : "", esc(title(it)), longDate(d) + " · " + it.s + "–" + it.e);
    /* a duo: two clients, one trainer; credits, history, notes and attendance are per client */
    if (it.duo) body += '<div class="pad" style="margin-bottom:12px">' + seg(pair(it).map(function (x) { return [x, CLIENT[x].name.split(" ")[0]]; }), cid, "duo-sel", { id: it.id }) + "</div>";
    /* before the session: is there a private credit for it, and is a payment open (owner only) */
    var sb = D.bsum(cid), pb = sb.balances.filter(function (x) { return x.credit === "prive"; })[0], first = c.name.split(" ")[0], bn = [];
    if (OWNER() && sb.open.length) bn.push(["var(--danger)", "Openstaande betaling " + sb.open[0].open + " · " + sb.open[0].name]);
    if (!it.cancelled && it.ws === "sf" && D.billing[cid]) bn.push(!pb ? ["var(--gym)", first + " heeft geen privécredits"] : pb.left <= 0 ? ["var(--gym)", "Laatste privécredit van " + first + ". Daarna zijn ze op."] : ["var(--priv)", "Nog " + pb.left + " " + (pb.left === 1 ? "privécredit" : "privécredits") + " over na de geplande sessies"]);
    if (bn.length) body += '<div class="pad stack" style="margin-bottom:12px">' + bn.map(function (x) { return '<div class="banner" style="--c:' + x[0] + '">' + ic(x[0] === "var(--priv)" ? "info" : "warn") + esc(x[1]) + "</div>"; }).join("") + "</div>";
    body += '<div class="pad stack">' + grp([
      row({ lead: '<span style="color:var(--priv);display:grid">' + ic("pin") + "</span>", title: esc(it.loc), tr: '<button class="btn ghost sm" data-a="toast" data-m="Opent de route in Kaarten">' + ic("route") + "Route</button>", cls: "kv" }),
      row({ lead: '<span style="color:var(--label2);display:grid">' + ic("people") + "</span>", title: D.workspaces[it.ws].name, sub: it.trainer ? esc(it.trainer) : "Jij", cls: "kv" })
    ]);
    var ws = it.wstate, tpl = sessTpl(it, cid), lock = sessLocked(it), we = ws === "done" ? entryOf(it, cid) : null;
    /* F042: the template of this session, one row per client in a duo; read-only once the workout runs or is done */
    var trow = pair(it).map(function (x) {
      var t = sessTpl(it, x);
      return row({ a: lock ? "" : "sess-tpl-pick", d: { id: it.id, c: x }, lead: '<span style="color:var(--label2);display:grid">' + ic("dumb") + "</span>", title: it.duo ? "Schema voor " + esc(fname(x)) : "Schema", tr: t ? tplName(t) : '<span style="color:var(--label2)">' + (lock ? "Geen schema" : "Nog geen schema") + "</span>", cls: "kv" });
    });
    var tcard = '<div class="card"><div style="display:flex;gap:12px;align-items:center;margin-bottom:14px"><span class="av" style="--c:var(--priv);border-radius:14px">' + ic("dumb") + '</span><div><b style="display:block">' + (tpl ? tplName(tpl) : "Training") + '</b><span style="font-size:15px;color:var(--label2)">' + (ws === "done" ? "Afgerond · " + (we ? we.n + " oefeningen · " + we.dur : "6 oefeningen · 52 min") : ws === "running" ? "Bezig · gestart om " + it.s : tpl ? (D.tpl[tpl] ? tplCount(D.tpl[tpl].length) : "5 oefeningen") : "Kies een schema of begin leeg") + (it.duo ? "<span> · je logt per klant</span>" : "") + "</span></div></div>" +
      (ws === "done" ? '<div class="btns">' + btn("Bekijken", { k: "sec", a: "open-workout", d: { id: cid, h: (we || hist(cid)[0] || {}).id } }) + (itShared(it, cid) ? btn("Gedeeld", { k: "sec", dis: true, i: "check" }) : btn("Delen met " + esc(c.name.split(" ")[0]), { a: "share-item", d: { id: it.id, c: cid }, i: "share" })) + "</div>" : btn(ws === "running" ? "Doorgaan met training" : "Training starten", { blk: true, a: "start-workout", d: { id: it.id }, i: "play", dis: it.cancelled })) + "</div>";
    body += '<div data-sec="sess"></div>' + sh("Training", "", "small") + grp(trow) + (it.cancelled ? "" : foot(lock ? "De training loopt of is klaar, dus het schema staat vast." : "Met een schema opent Training starten meteen.")) + '<div style="height:12px"></div>' + tcard + "</div>";
    body += lastTime(cid) + progressList(cid);
    var notes = D.notes[cid] || [];
    body += sh("Notities", '<button data-a="note" data-id="' + c.id + '">+ Notitie</button>', "small");
    body += '<div class="pad">' + (notes.length ? grp(notes.slice(0, 3).map(function (n) { return row({ title: '<span translate="no">' + esc(n.t) + "</span>", small: n.d + " · " + esc(n.by), cls: "wrap" }); })) : '<div class="grp"><div class="row"><div class="m"><span>Nog geen notities.</span></div></div></div>') + "</div>" + foot("Alleen voor trainers. Notities zie je nooit in meldingen of widgets.");
    var can = started(it, k) && !it.cancelled;
    body += sh("Aanwezigheid", "", "small") + '<div class="pad">' + seg([["", "Geboekt", !can], ["yes", "Aanwezig", !can], ["no", "Niet verschenen", !can]], (it.duo ? (it.attD || {})[cid] : it.att) || "", "satt", { id: it.id, c: cid }) + "</div>" + (can ? "" : foot(it.cancelled ? "Geannuleerd." : "Vanaf " + it.s + "."));
    return { title: title(it), body: body, trailing: [{ i: "more", a: "session-menu", label: "Meer", d: { id: it.id } }] };
  };

  SCREENS.klass = function (r) {
    var f = findItem(r.id), it = f.it, k = f.day, d = parse(k), booked = it.people.length, free = it.cap - booked;
    var body = "";
    if (it.cancelled) body += '<div class="pad" style="margin-bottom:12px"><div class="banner" style="--c:var(--danger)">' + ic("warn") + "Deze les is geannuleerd. Geboekte klanten hebben een e-mail gekregen.</div></div>";
    body += lt(TYPE[it.type] + (level(it) ? " · " + level(it) : ""), esc(it.title), longDate(d) + " · " + it.s + "–" + it.e);
    body += '<div class="pad stack">';
    var ds = D.descriptions[it.title];
    if (ds && ds.nl) {
      var useEn = PREF.lang === "en" && ds.en, open = S.showDesc[it.id];
      body += '<div class="card desc"><p translate="no"' + (PREF.lang === "en" && !ds.en ? ' lang="nl"' : "") + ' class="' + (open ? "" : "clamp") + '">' + esc(useEn ? ds.en : ds.nl) + "</p>" +
        '<button class="btn ghost sm" data-a="desc-toggle" data-id="' + it.id + '">' + (open ? "Minder" : "Meer") + "</button></div>";
    }
    if (it.sub) body += '<div class="banner" style="--c:var(--accent)">' + ic("swap") + "Je valt in voor " + esc(it.sub) + ".</div>";
    body += '<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><div><div class="stat-l ink" style="--c:' + CV[it.type] + '">Geboekt</div><div class="num" style="font-size:34px;line-height:38px">' + booked + '<small style="font-size:17px;color:var(--label2)">/' + it.cap + "</small></div></div>" +
      '<span class="pill ' + (free <= 0 ? "strong" : "") + '">' + (it.cancelled ? "Geannuleerd" : free <= 0 ? "Vol" : free + (free === 1 ? " plek vrij" : " plekken vrij")) + "</span></div>" +
      '<div style="height:10px;border-radius:5px;background:color-mix(in srgb,' + CV[it.type] + ' 18%,transparent);margin-top:12px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, booked / it.cap * 100) + "%;border-radius:5px;background:linear-gradient(90deg,color-mix(in oklab," + CV[it.type] + " 65%,#fff)," + CV[it.type] + ')"></div></div>' +
      '<div style="font-size:15px;color:var(--label2);margin-top:10px">' + (it.loc.indexOf(D.workspaces[it.ws].name) === 0 ? '<i class="wsdot" style="--c:' + D.workspaces[it.ws].color + '"></i>' + esc(it.loc) : wsLine(it.ws) + " · " + esc(it.loc)) + "</div></div>";
    body += btn("Aanwezigheid invullen", { blk: true, a: "open-att", d: { id: it.id }, i: "check", dis: it.cancelled || !booked });
    body += "</div>";
    var showAll = S.showAll[it.id], ppl = showAll ? it.people : it.people.slice(0, 5);
    var am = it.attMap || {};
    body += sh("Deelnemers · " + booked, booked > 5 && !showAll ? '<button data-a="show-all" data-id="' + it.id + '">Toon alle ' + booked + "</button>" : "", "small");
    body += '<div class="pad">' + (booked ? grp(ppl.map(function (p, i) { var nm = person(p); return row({ lead: avatar(nm, CLIENT[p] ? CLIENT[p].c : "#8E8E93"), title: esc(nm), tr: '<span class="pill">' + (am[i] === "yes" ? "Aanwezig" : am[i] === "no" ? "Niet verschenen" : "Geboekt") + "</span>" }); }), "--inset:68px") : '<div class="empty">Nog niemand geboekt.</div>') + "</div>";
    body += '<div class="pad" style="margin-top:14px">' + btn("Boekingslink delen", { k: "sec", blk: true, a: "toast", d: { m: "Boekingslink gekopieerd" }, i: "link" }) + "</div>";
    if (isOwner(it.ws) && !it.cancelled) body += foot("Les wijzigen, een vaste reeks en trainers beheer je op het web.");
    return { title: it.title, body: body, trailing: isOwner(it.ws) || it.sub ? [{ i: "more", a: "class-menu", label: "Meer", d: { id: it.id } }] : [] };
  };

  SCREENS.attendance = function (r) {
    var it = findItem(r.id).it, am = it.attDraft || (it.attDraft = Object.assign({}, it.attMap || {}));
    var y = 0, n = 0; it.people.forEach(function (p, i) { if (am[i] === "yes") y++; else if (am[i] === "no") n++; });
    var body = lt("", "Aanwezigheid", esc(it.title) + " · " + it.s + "–" + it.e);
    body += '<div class="pad stack"><div class="tiles">' +
      '<div class="tile"><span class="ink" style="--c:var(--ok)">Aanwezig</span><b class="num">' + y + "</b></div>" +
      '<div class="tile"><span class="ink" style="--c:var(--danger)">Niet verschenen</span><b class="num">' + n + "</b></div>" +
      '<div class="tile"><span style="color:var(--label2)">Open</span><b class="num">' + (it.people.length - y - n) + "</b></div></div>" +
      btn("Iedereen aanwezig", { k: "sec", blk: true, a: "att-all", d: { id: it.id } }) + "</div>";
    body += sh("Deelnemers", "", "small");
    body += '<div class="pad">' + grp(it.people.map(function (p, i) {
      var nm = person(p);
      return row({ lead: avatar(nm, CLIENT[p] ? CLIENT[p].c : "#8E8E93"), title: esc(nm), tr: '<span class="seg" style="width:auto">' +
        '<button class="' + (am[i] === "yes" ? "on" : "") + '" data-a="att-one" data-id="' + it.id + '" data-i="' + i + '" data-v="yes" aria-label="' + esc(nm) + ' aanwezig">' + ic("check") + "</button>" +
        '<button class="' + (am[i] === "no" ? "on" : "") + '" data-a="att-one" data-id="' + it.id + '" data-i="' + i + '" data-v="no" aria-label="' + esc(nm) + ' niet verschenen">' + ic("x") + "</button></span>" });
    }), "--inset:68px") + "</div>";
    return { title: "Aanwezigheid", body: body, save: { a: "att-save", d: { id: it.id } } };
  };

  SCREENS.profile = function () {
    var body = '<div class="pad stack"><div class="card" style="display:flex;gap:14px;align-items:center">' + avatar(D.me.name, "var(--accent)") + '<div style="flex:1;min-width:0"><b style="display:block;font-size:19px">' + D.me.name + '</b><span style="color:var(--label2);font-size:15px">' + D.me.email + "</span></div>" + btn("Wijzigen", { k: "ghost", sm: true, a: "toast", d: { m: "Naam wijzigen opent een veld" } }) + "</div></div>";
    body += '<div class="pad" style="margin-top:12px">' + grp([row({ a: "pro-me-email", title: "E-mailadres wijzigen" })]) + "</div>";
    body += sh("Trainingen", "", "small") + '<div class="pad">' + grp([row({ a: "push", d: { n: "templates" }, lead: '<span style="color:var(--label2);display:grid">' + ic("dumb") + "</span>", title: "Schema's", tr: String(Object.keys(D.tpl).length) })]) + "</div>";
    body += sh("Instellingen", "", "small") + '<div class="pad">' + grp([row({ a: "push", d: { n: "language" }, lead: '<span style="color:var(--label2);display:grid">' + ic("globe") + "</span>", title: "Taal", tr: '<span translate="no">' + (PREF.lang === "en" ? "English" : "Nederlands") + "</span>" })]) + "</div>";
    body += sh("Werkruimtes", "", "small") + '<div class="pad">' + grp(WSS().map(function (w) { var x = D.workspaces[w]; return row({ lead: '<span class="av" style="--c:' + x.color + ';border-radius:12px;width:36px;height:36px;font-size:13px">' + initials(x.name) + "</span>", title: x.name, tr: w === "sf" ? (OWNER() ? "Eigenaar" : "Trainer") : "Trainer" }); })) + "</div>" + (WSS().length > 1 ? foot("Vandaag en Agenda tonen je sessies van alle werkruimtes samen.") : "");
    body += '<div class="pad" style="margin-top:16px">' + grp([
      row({ a: "toast", d: { m: "Opent Fivvi op het web" }, lead: '<span style="color:var(--label2);display:grid">' + ic("ext") + "</span>", title: "Beheer op het web", chev: false }),
      row({ a: "toast", d: { m: "Opent het feedbackformulier" }, lead: '<span style="color:var(--label2);display:grid">' + ic("chat") + "</span>", title: "Feedback geven", chev: false })
    ]) + "</div>";
    body += '<div class="pad" style="margin-top:16px">' + grp([
      row({ a: "alert", d: { n: "signout" }, title: '<span style="color:var(--accent-text)">Uitloggen</span>', chev: false })
    ]) + "</div>" + '<div class="pad">' + window.FVW.dzZone(btn("Account verwijderen", { k: "dng", a: "pro-acc-del" })) + "</div>" + foot("Fivvi Pro · prototype v2 · fictieve gegevens");
    return { large: true, title: "Profiel", body: body };
  };

  /* Workout templates ("schema's", F041): any Owner or Trainer of the workspace makes, changes and deletes them.
     The same data as the trainer web (D.tpl: name → [exercise, sets, target]). */
  var TPL_UNIT = { wr: "Doel in herhalingen", r: "Doel in herhalingen", t: "Doel in m:ss", dt: "Doel in meters" };
  var TPL_DEF = { wr: "10", r: "10", t: "0:30", dt: "500 m" };
  function tplType(n) { var e = D.library.filter(function (l) { return l.n === n; })[0]; return e ? e.ty : "wr"; }
  function tplCount(n) { return n + (n === 1 ? " oefening" : " oefeningen"); }
  function tplName(n) { return '<span translate="no">' + esc(n) + "</span>"; }

  /* ---------- Assigning workouts (F042, owner 11 Nov 2026) ----------
     Two things, trainer only (the client sees nothing of them):
     A. a client's own list of templates, D.templates[clientId] ("Schema's van Anna"); "Andere schema's" is D.tpl minus that list
     B. a template set on a planned private or duo session, which opens straight in the logger on "Training starten".
     B lives in S.sess[sessionId][clientId] (a name, or null = cleared by the trainer) on top of the sample's own `workout`. */
  function fname(c) { return CLIENT[c].name.split(" ")[0]; }
  function tplList(cid) { return (D.templates[cid] || []).filter(function (t) { return D.tpl[t]; }); }
  function tplOthers(cid) { var l = tplList(cid); return Object.keys(D.tpl).filter(function (t) { return l.indexOf(t) < 0; }); }
  function tplAdd(cid, t) { var l = D.templates[cid] = D.templates[cid] || []; if (l.indexOf(t) < 0) l.push(t); }
  function tplDrop(cid, t) { D.templates[cid] = (D.templates[cid] || []).filter(function (x) { return x !== t; }); }
  /* once a workout is running or done the template can't change; it shows the one that was used */
  function sessLocked(it) { return it.wstate === "running" || it.wstate === "done" || !!S.logs[it.id] || !!it.cancelled; }
  function sessTpl(it, cid) {
    cid = cid || it.client; var o = S.sess[it.id];
    return (o && cid in o ? o[cid] : it.duo ? (it.workoutD || {})[cid] : it.workout) || null;
  }
  function setSessTpl(it, cid, t) { (S.sess[it.id] = S.sess[it.id] || {})[cid] = t || null; }
  /* the planned private sessions (not started, not past, not cancelled) that have this template set, as [session, client] */
  function plannedWith(name) {
    var out = [];
    Object.keys(DAYCACHE).forEach(function (k) {
      DAYCACHE[k].forEach(function (it) {
        if (it.type !== "priv" || sessLocked(it) || isPast(it, k)) return;
        pair(it).forEach(function (c) { if (sessTpl(it, c) === name) out.push([it, c]); });
      });
    });
    return out;
  }
  function tplUse(name) {
    var ids = {}; plannedWith(name).forEach(function (x) { ids[x[0].id] = 1; });
    return { clients: Object.keys(D.templates).filter(function (c) { return D.templates[c].indexOf(name) >= 0; }).length, sessions: Object.keys(ids).length };
  }
  /* "Het staat bij 2 klanten en 1 geplande sessie; daar verdwijnt het." (empty when nothing uses it) */
  function tplUseLine(name) {
    var u = tplUse(name), a = [];
    if (u.clients) a.push(u.clients + (u.clients === 1 ? " klant" : " klanten"));
    if (u.sessions) a.push(u.sessions + (u.sessions === 1 ? " geplande sessie" : " geplande sessies"));
    return a.length ? "Het staat bij " + a.join(" en ") + "; daar verdwijnt het." : "";
  }
  /* deleting a template takes it off every client's list and off planned sessions; logged workouts stay */
  function tplPurge(name) {
    /* every session whose workout hasn't started, past ones included, loses it */
    Object.keys(DAYCACHE).forEach(function (k) { DAYCACHE[k].forEach(function (it) {
      if (it.type !== "priv" || sessLocked(it)) return;
      pair(it).forEach(function (c) { if (sessTpl(it, c) === name) setSessTpl(it, c, null); });
    }); });
    plannedWith(name).forEach(function (x) { setSessTpl(x[0], x[1], null); });
    Object.keys(D.templates).forEach(function (c) { tplDrop(c, name); });
  }
  function tplRename(from, to) {
    Object.keys(D.templates).forEach(function (c) { D.templates[c] = D.templates[c].map(function (t) { return t === from ? to : t; }); });
    Object.keys(DAYCACHE).forEach(function (k) { DAYCACHE[k].forEach(function (it) {
      if (it.type !== "priv" || sessLocked(it)) return;
      pair(it).forEach(function (c) { if (sessTpl(it, c) === from) setSessTpl(it, c, to); });
    }); });
  }
  SCREENS.templates = function () {
    var names = Object.keys(D.tpl);
    var body = lt("", "Schema's") + (names.length ? '<div class="pad">' + grp(names.map(function (n) { return row({ a: "open-tpl", d: { t: n }, title: tplName(n), sub: tplCount(D.tpl[n].length) }); })) + "</div>" : '<div class="empty">Nog geen schema\'s.</div>');
    body += foot("Alle trainers in je werkruimte kunnen schema's maken, wijzigen en verwijderen.");
    return { title: "Schema's", body: body, add: { a: "tpl-new", label: "Nieuw schema", i: "plus" } };
  };
  SCREENS.template = function (r) {
    var rows = D.tpl[r.id];
    if (!rows) return { title: "Schema", body: '<div class="empty">Dit schema bestaat niet meer.</div>' };
    var body = lt("", tplName(r.id), tplCount(rows.length));
    body += '<div class="pad">' + grp(rows.map(function (x) { return row({ title: esc(x[0]), tr: '<b class="num">' + x[1] + " × " + esc(x[2]) + "</b>", cls: "kv" }); })) + "</div>";
    body += foot("Een wijziging verandert geen trainingen die al zijn gelogd.");
    body += '<div class="pad stack" style="margin-top:20px">' + btn("Wijzigen", { k: "sec", blk: true, a: "tpl-edit", d: { t: r.id }, i: "pencil" }) + btn("Schema verwijderen", { k: "dng", blk: true, a: "tpl-del-ask", d: { t: r.id } }) + "</div>";
    return { title: r.id, noTr: true, body: body };
  };

  SCREENS.language = function () {
    var body = lt("", "Taal", "De taal van de app. E-mails volgen dezelfde keuze.");
    var tick = '<span style="color:var(--accent-text);display:grid">' + ic("check") + "</span>";
    /* Language names stay in their own language, as in every language picker. */
    body += '<div class="pad">' + grp([["nl", "Nederlands"], ["en", "English"]].map(function (l) { return row({ a: "lang", d: { v: l[0] }, title: '<span translate="no">' + l[1] + "</span>", tr: PREF.lang === l[0] ? tick : "", chev: false }); })) + "</div>";
    return { title: "Taal", body: body };
  };

  /* ---------- Sign-in ---------- */
  function signIn() {
    var body;
    if (S.signStep === "email") {
      body = '<div style="padding:40px 24px 0;text-align:center"><div class="appicon fv-icon fv-pro" role="img" aria-label="Fivvi Pro"></div><h1 style="font-size:28px;margin:22px 0 6px">Inloggen bij Fivvi Pro</h1><p style="color:var(--label2);margin:0 0 26px;font-size:16px">Vul je e-mailadres in. We sturen je een code van 6 cijfers.</p></div>' +
        '<div class="pad stack">' + btn("Doorgaan met Apple", { k: "sec", blk: true, a: "sign-in" }) + btn("Doorgaan met Google", { k: "sec", blk: true, a: "sign-in" }) + '</div><p class="c-or">of met je e-mailadres</p>' +
        '<div class="pad stack"><div class="fgrp">' + fld("E-mail", '<input data-in="email" type="email" autocomplete="email" placeholder="naam@voorbeeld.nl" value="' + esc(S.email) + '">') + "</div>" + btn("Doorgaan", { blk: true, a: "sign-next" }) + "</div>" + foot("Nog geen account? Je eigenaar nodigt je uit, of je maakt een werkruimte aan op het web.");
    } else {
      var digits = (S.code + "      ").slice(0, 6).split("");
      body = '<div style="padding:40px 24px 0;text-align:center"><div class="appicon fv-icon fv-pro" role="img" aria-label="Fivvi Pro" style="width:64px;height:64px;border-radius:17px"></div><h1 style="font-size:28px;margin:22px 0 6px">Check je e-mail</h1><p style="color:var(--label2);margin:0 0 20px;font-size:16px">We hebben een code gestuurd naar <b style="color:var(--label)">' + esc(S.email || D.me.email) + "</b>.</p></div>" +
        '<label style="display:block;position:relative"><div class="code" id="codebox">' + digits.map(function (x, i) { return '<span class="' + (i === S.code.length ? "cur" : "") + '">' + esc(x.trim()) + "</span>"; }).join("") + '</div><input data-in="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="' + esc(S.code) + '" aria-label="Code van 6 cijfers" style="position:absolute;inset:0;opacity:0;width:100%"></label>' +
        '<div class="pad stack" style="margin-top:20px">' + btn("Inloggen", { blk: true, a: "sign-in", dis: S.code.length < 6 }) + btn("Andere e-mail gebruiken", { k: "ghost", blk: true, a: "sign-back" }) + "</div>" + foot("In dit prototype werkt elke code van 6 cijfers.");
    }
    return '<div class="screen' + (S.anim === "push" ? " anim-push" : "") + '"><div class="content" style="padding-top:var(--top)">' + body + "</div></div>";
  }

  /* ---------- Sheets ---------- */
  var SHEETS = {};
  SHEETS["new"] = function () {
    var items = [["new-session", "priv", "Privésessie", "Een sessie met één klant."]];
    if (OWNER()) { items.push(["new-class", "group", "Groepsles", "Bij " + D.workspaces.sf.name]); if (HAS("gym")) items.push(["new-gym", "gym", "Open Gym", "Bij " + D.workspaces.sf.name]); }
    items.push(["new-client", "", "Klant", PAYLOCK() ? "Naam en e-mailadres. De klant krijgt een uitnodiging zodra de studio klaar is." : "Naam en e-mailadres. De klant krijgt een uitnodiging om in te loggen."]);
    var icons = { priv: "me", group: "group", gym: "door", "": "personPlus" };
    var body = grp(items.map(function (x) { return row({ a: x[0], lead: '<span class="av" style="--c:' + (x[1] ? CV[x[1]] : "var(--accent)") + ';border-radius:14px">' + ic(icons[x[1]]) + "</span>", title: x[2], sub: x[3], cls: "wrap" }); }), "--inset:68px");
    if (!SOLO()) body += foot(OWNER() ? "Groepslessen van John's Gym plant de eigenaar." : "Groepslessen van Studio Fit en John's Gym plant de eigenaar.");
    return { title: "Nieuw", small: true, body: body };
  };
  SHEETS.newSession = function () {
    var cs = D.clients.filter(function (c) { return c.ws === "sf"; });
    var body = '<div class="fgrp">' + fld("Klant", sel("client", cs.map(function (c) { return [c.id, c.name]; }))) + fld("Tweede klant", sel("duo", [["", "Geen"]].concat(cs.filter(function (c) { return c.id !== S.form.client; }).map(function (c) { return [c.id, c.name]; })))) + "</div>";
    body += foot("Met een tweede klant wordt het een duosessie: één trainer, twee klanten, ieder met een eigen training en tegoed.");
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Datum", inp("date", "date")) + fld("Begin", inp("start", "time")) + "</div>";
    body += '<div style="margin:16px 0 6px;font-size:13px;color:var(--label2);padding-left:4px">Duur</div>' + seg([["30", "30 min"], ["45", "45 min"], ["60", "1 uur"], ["90", "1,5 uur"]], String(S.form.dur), "fset", { f: "dur" });
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Locatie", sel("loc", D.locations)) + "</div>";
    body += foot("Fivvi stelt de locatie van de vorige sessie met deze klant voor.");
    return { title: S.form.duo ? "Nieuwe duosessie" : "Nieuwe privésessie", body: body, save: "save-session" };
  };
  /* Send an offer: the client gets an email with a link to confirm and pay; the invoice follows the payment (§94, §96) */
  SHEETS.offer = function () {
    var f = S.form, c = CLIENT[f.client], a = f.ag ? D.billing[f.client].agreements.filter(function (x) { return x.id === f.ag; })[0] : null;
    var body = '<div class="fgrp">' + fld("Aanbod", sel("offer", offerOpts(OPENOFFERS()))) + "</div>";
    var running = a && a.endsIn >= 0 && a.status !== "expired";
    if (running) body += '<div style="margin:16px 0 6px;font-size:13px;color:var(--label2);padding-left:4px">Gaat in</div>' + seg([["after", "Na afloop"], ["now", "Direct"]], f.start, "fset", { f: "start" });
    body += foot(esc(c.name.split(" ")[0]) + " krijgt een e-mail met een link om te bevestigen en te betalen met iDEAL. Na de betaling maakt Fivvi de factuur." + (running ? " Na afloop: het nieuwe begint als " + esc(agrName(a)) + " eindigt, zonder gat en zonder overlap." : ""));
    return { title: a ? "Verlengen" : "Aanbod sturen", body: body, save: "send-offer" };
  };
  /* the record dialog's text; a company client gets the invoice by itself (owner, 7 Nov 2026, #606) */
  function F_CASHTEXT(c) { var n = c.name.split(" ")[0]; return esc(n) + " heeft dit volledig bij jou betaald. Er gaat geen geld via Mollie en het gaat meteen in. Een abonnement staat daarna elke maand op dit profiel, tot je vastlegt dat het is betaald. " + (c.company ? esc(n) + " krijgt facturen op naam van " + esc(c.company) + ", dus Fivvi maakt de factuur." : "Fivvi maakt hiervoor niet vanzelf een factuur.") + " Je administratie en belasting regel je zelf; deze betaling blijft hier staan."; }
  SHEETS.cash = function () {
    var f = S.form, c = CLIENT[f.client];
    var body = '<div class="fgrp">' + fld("Aanbod", sel("offer", offerOpts(D.onOffers()))) + fld("Hoe betaald", sel("how", ["Contant", "Pin bij de studio", "Overboeking"])) + fld("Betaald op", inp("date", "date")) + "</div>";
    body += foot(F_CASHTEXT(c));
    return { title: "Betaling buiten Fivvi", body: body, save: "save-cash" };
  };
  SHEETS.newClient = function () {
    var body = '<div class="fgrp">' + fld("Naam", inp("name", "text", "Voor- en achternaam", " autocomplete=\"off\"")) + fld("E-mail", inp("email", "email", "naam@voorbeeld.nl")) + "</div>";
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Taal voor e-mails", sel("lang", ["Nederlands", "English"])) + (WSS().length > 1 ? fld("Werkruimte", sel("ws", WSS().map(function (w) { return [w, D.workspaces[w].name]; }))) : "") + "</div>";
    body += foot(PAYLOCK() ? "De klant krijgt een uitnodiging zodra de studio klaar is." : "De klant krijgt een e-mail met een uitnodiging om in te loggen.");
    return { title: "Nieuwe klant", body: body, save: "save-client" };
  };
  SHEETS.newClass = function () {
    var body = '<div class="fgrp">' + fld("Naam (Nederlands)", inp("name", "text", "Bijvoorbeeld Strength")) + fld("Naam (Engels, optioneel)", inp("nameEn")) + fld("Niveau", sel("level", [["", "Geen"]].concat(D.LEVELS.map(function (l) { return [l, l]; })))) + "</div>";
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Datum", inp("date", "date")) + fld("Begin", inp("start", "time")) + fld("Eind", inp("end", "time")) + fld("Capaciteit", inp("cap", "number", "", ' inputmode="numeric" min="1"')) + "</div>";
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Trainer", sel("trainer", D.trainers.sf.concat(["Trainer nodig"]))) + fld("Herhalen", sel("rep", ["Niet herhalen", "Elke week op " + DAYS[parse(S.form.date || TODAY).getDay()]])) + "</div>";
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Omschrijving (Nederlands, optioneel)", '<textarea data-f="desc" rows="3" placeholder="Wat doe je in deze les? Dit zien klanten op je boekingspagina.">' + esc(S.form.desc || "") + "</textarea>", "stack") +
      fld("Omschrijving (Engels, optioneel)", '<textarea data-f="descEn" rows="3">' + esc(S.form.descEn || "") + "</textarea>", "stack") + "</div>";
    body += foot("Zonder Engelse tekst zien Engelstalige klanten de Nederlandse. Studio Fit, Kerkstraat 12. Een vaste reeks beheer je op het web.");
    return { title: "Nieuwe groepsles", body: body, save: "save-class" };
  };
  SHEETS.newGym = function () {
    var body = '<div class="fgrp">' + fld("Datum", inp("date", "date")) + fld("Begin", inp("start", "time")) + fld("Eind", inp("end", "time")) + fld("Capaciteit", inp("cap", "number", "", ' inputmode="numeric" min="1"')) + "</div>";
    body += foot("Studio Fit, Kerkstraat 12. Het Open Gym-blok staat meteen op je boekingspagina.");
    return { title: "Nieuw Open Gym-blok", body: body, save: "save-gym" };
  };
  SHEETS.note = function () {
    var c = CLIENT[S.form.client];
    var body = '<div class="fgrp">' + fld("Notitie over " + esc(c.name.split(" ")[0]), '<textarea data-f="text" rows="5" placeholder="Bijvoorbeeld een blessure of een doel">' + esc(S.form.text || "") + "</textarea>", "stack") + "</div>";
    body += foot("Alleen trainers van " + D.workspaces[c.ws].name + " zien dit. De klant niet.");
    return { title: "Notitie", body: body, save: "save-note" };
  };
  SHEETS.reschedule = function () {
    var it = findItem(S.form.id).it;
    var body = '<div class="fgrp">' + fld("Datum", inp("date", "date")) + fld("Begin", inp("start", "time")) + "</div>";
    body += '<div style="margin:16px 0 6px;font-size:13px;color:var(--label2);padding-left:4px">Duur</div>' + seg([["30", "30 min"], ["45", "45 min"], ["60", "1 uur"], ["90", "1,5 uur"]], String(S.form.dur), "fset", { f: "dur" });
    body += foot(esc(CLIENT[it.client].name.split(" ")[0]) + " krijgt een e-mail met de nieuwe tijd.");
    return { title: "Verplaatsen", body: body, save: "save-move" };
  };
  SHEETS.addEx = function () {
    var body = '<label class="search" style="margin-bottom:12px">' + ic("search") + '<input data-in="exq" type="search" placeholder="Zoek oefening (NL of EN)" value="' + esc(S.exq) + '" aria-label="Zoek oefening"></label><div id="exlist">' + exList() + "</div>";
    return { title: "Oefening toevoegen", body: body };
  };
  /* F042: add a template to a client's list; the ones already on it are marked and can't be picked */
  SHEETS.tplAdd = function () {
    var c = CLIENT[S.pick.c], l = tplList(c.id), names = Object.keys(D.tpl);
    var body = names.length ? grp(names.map(function (t) { var on = l.indexOf(t) >= 0; return row({ a: on ? "" : "cl-tpl-add-do", d: { t: t }, title: tplName(t), sub: tplCount(D.tpl[t].length), cls: on ? "past" : "", tr: on ? "Op de lijst" : "" }); })) : '<div class="empty">Nog geen schema\'s.</div>';
    return { title: "Schema toevoegen", body: body + foot("Een nieuw schema maak je onder Profiel › Schema's.") };
  };
  /* F042: the template of one planned session: the client's list first, then the other templates, then none */
  SHEETS.sessTpl = function () {
    var it = findItem(S.pick.id).it, c = S.pick.c, cur = sessTpl(it, c), fn = fname(c), mine = tplList(c), oth = tplOthers(c);
    var tick = ic("check", "tick");
    function r(t) { return row({ a: "sess-tpl-set", d: { t: t }, title: tplName(t), sub: tplCount(D.tpl[t].length), tr: cur === t ? tick : "", chev: cur !== t }); }
    var body = sh("Schema's van " + esc(fn), "", "small") + grp(mine.length ? mine.map(r) : ['<div class="row"><div class="m"><span>Nog geen schema\'s voor ' + esc(fn) + ".</span></div></div>"]);
    if (oth.length) body += sh("Andere schema's", "", "small") + grp(oth.map(r));
    body += '<div style="height:16px"></div>' + grp([row({ a: "sess-tpl-set", d: { t: "" }, title: "Geen schema", tr: cur ? "" : tick, chev: !!cur })]);
    return { title: it.duo ? "Schema voor " + fn : "Schema kiezen", body: body };
  };
  /* New / Edit template: the draft lives in S.form = { name, orig, rows: [{ n, sets, target }] } until Opslaan */
  SHEETS.tplForm = function () {
    var f = S.form, last = f.rows.length - 1;
    var body = '<div class="fgrp">' + fld("Naam", inp("name", "text", "Bijvoorbeeld Upper A")) + "</div>";
    body += sh("Oefeningen", "", "small");
    if (!f.rows.length) body += '<div class="empty tpl-empty">Nog geen oefeningen. Voeg er een toe.</div>';
    body += f.rows.map(function (r, i) {
      function ib(a, icon, label, off, cls) { return '<button class="ib ' + (cls || "") + '" data-a="' + a + '" data-i="' + i + '" aria-label="' + esc(r.n) + " " + label + '"' + (off ? " disabled" : "") + ">" + ic(icon) + "</button>"; }
      return '<div class="tpl-ex"><div class="tpl-h"><div class="m"><b>' + esc(r.n) + "</b><small>" + TPL_UNIT[tplType(r.n)] + "</small></div>" +
        ib("tpl-up", "up", "naar boven", i === 0) + ib("tpl-down", "down", "naar beneden", i === last) + ib("tpl-rm", "x", "weghalen", false, "rm") + "</div>" +
        '<div class="tpl-two"><div class="fgrp">' + fld("Sets", '<input data-tr="' + i + ',sets" inputmode="numeric" value="' + esc(r.sets) + '" aria-label="' + esc(r.n) + ' sets">') + "</div>" +
        '<div class="fgrp">' + fld("Doel", '<input data-tr="' + i + ',target" value="' + esc(r.target) + '" aria-label="' + esc(r.n) + ' doel">') + "</div></div></div>";
    }).join("");
    body += '<div style="margin-top:14px">' + btn("Oefening toevoegen", { k: "sec", blk: true, a: "tpl-pick", i: "plus" }) + "</div>";
    body += foot("Een wijziging verandert geen trainingen die al zijn gelogd.");
    return { title: f.orig ? "Schema wijzigen" : "Nieuw schema", body: body, save: "save-tpl", still: !!S.tplPick };
  };
  function exList() {
    var tp = S.sheet === "tplForm" && S.tplPick, inTpl = tp ? S.form.rows.map(function (r) { return r.n; }) : [];
    var q = norm(S.exq.trim()), inLog = (S.log ? S.log.ex : []).map(function (e) { return e.name; });
    var lib = D.library.filter(function (e) { return !q || norm(e.n).indexOf(q) >= 0 || norm(e.en).indexOf(q) >= 0; });
    var TY = { wr: "", r: "Alleen herhalingen", t: "Tijd", dt: "Afstand + tijd" };
    function exRow(e) { var dis = !tp && inLog.indexOf(e.n) >= 0; return row({ a: dis ? "" : "add-ex", d: { n: e.n }, title: esc(e.n), sub: "ook: " + esc(e.en) + " · " + esc(e.mu) + (TY[e.ty] ? " · " + TY[e.ty] : ""), cls: dis ? "past" : "", tr: dis ? "In training" : tp && inTpl.indexOf(e.n) >= 0 ? "In schema" : "" }); }
    /* picking for a template: no "Recent bij …" and no new exercise (own exercises are F040) */
    var out = tp ? "" : grp([row({ a: "add-ex-new", lead: '<span style="color:var(--accent-text);display:grid">' + ic("plus") + "</span>", title: '<span style="color:var(--accent-text)">Nieuwe oefening' + (q ? " “" + esc(S.exq) + "” aanmaken" : "") + "</span>" })]);
    if (!q && !tp) out += sh("Recent bij " + (S.log ? CLIENT[S.log.client].name.split(" ")[0] : ""), "", "small") + grp(D.library.slice(0, 3).map(exRow));
    out += sh(q ? "Resultaten" : "Bibliotheek", "", "small") + (lib.length ? grp(lib.map(exRow)) : '<div class="empty">Geen oefening gevonden.</div>');
    return out;
  }

  /* ---------- Workout logger ---------- */
  /* [field, text after, inputmode, text before] */
  var FIELDS = { wr: [["a", "kg", "decimal"], ["b", "", "numeric", "×"]], r: [["a", "herh.", "numeric"]], t: [["a", ":", "numeric"], ["b", "", "numeric"]], dt: [["a", "m", "decimal"], ["b", ":", "numeric"], ["c", "", "numeric"]] };
  /* compact logger layout per exercise type: head = [label, width class]; inp = [value index, inputmode, width class, text after, label] */
  var LAYOUT = {
    wr: { head: [["kg", "w"], ["herh.", "n"]], inp: [[0, "decimal", "w", "", "gewicht (kg)"], [1, "numeric", "n", "", "herhalingen"]] },
    r: { head: [["herh.", "n"]], inp: [[0, "numeric", "n", "", "herhalingen"]] },
    t: { head: [["tijd", "ts"]], inp: [[0, "numeric", "s", ":", "minuten"], [1, "numeric", "s", "", "seconden"]] },
    dt: { head: [["m", "w"], ["tijd", "ts"]], inp: [[0, "decimal", "w", "", "afstand (m)"], [1, "numeric", "s", ":", "minuten"], [2, "numeric", "s", "", "seconden"]] }
  };
  function mkEx(e) { var def = { wr: ["20", "10"], r: ["10"], t: ["0", "30"], dt: ["500", "2", "00"] }[e.ty]; return { name: e.n, ty: e.ty, target: "", prev: [], sets: [{ v: def.slice(), done: false }], diff: "n" }; }
  /* a template as the logger opens it: sets × target from D.tpl, so a template made or changed on the phone or the web is what the trainer logs */
  function tplFromRows(rows) {
    return rows.map(function (r) {
      var lib = D.library.filter(function (l) { return l.n === r[0]; })[0]; if (!lib) return null;
      var e = mkEx(lib), v = e.sets[0].v, t = String(r[2]), m = t.match(/^(\d+):(\d+)$/);
      if (lib.ty === "wr" && /^\d+$/.test(t)) v[1] = t; else if (lib.ty === "r" && /^\d+$/.test(t)) v[0] = t; else if (lib.ty === "t" && m) { v[0] = m[1]; v[1] = m[2]; }
      e.sets = []; for (var i = 0; i < r[1]; i++) e.sets.push({ v: v.slice(), done: false });
      e.target = "Doel: " + r[1] + " × " + t; return e;
    }).filter(Boolean);
  }
  function tplEx(name) {
    var orig = JSON.parse(TPL0)[name];
    if (D.tpl[name] && !(name === "Upper A" && JSON.stringify(D.tpl[name]) === JSON.stringify(orig))) return tplFromRows(D.tpl[name]);
    if (name === "Upper A") return D.upperA().map(function (e) { return { name: e.name, ty: e.ty, target: e.target, prev: e.prev, sets: e.sets.map(function (v) { return { v: v.slice(), done: false }; }), diff: "n" }; });
    return ["Squat", "Bankdrukken", "Kabel roeien", "Plank"].map(function (n) { var e = mkEx(D.library.filter(function (l) { return l.n === n; })[0]); e.sets.push({ v: e.sets[0].v.slice(), done: false }, { v: e.sets[0].v.slice(), done: false }); e.target = "Doel: 3 × " + (e.ty === "t" ? "0:30" : "10"); return e; });
  }
  function openLogger(itemId, step, tpl) {
    var it = findItem(itemId).it;
    if (S.logs[itemId]) { S.log = S.logs[itemId]; S.log.step = "log"; }
    else {
      /* tpl is one name for everyone, or [first client's, second client's] when a duo has a template per client (F042) */
      var tl = Array.isArray(tpl) ? tpl : pair(it).map(function () { return tpl || null; }), who = tl[0] || !it.duo || !tl[1] ? it.client : it.duo;
      S.log = { item: itemId, client: it.client, step: step, tpl: tl[0] || tl[1] || null, ex: tl[0] ? tplEx(tl[0]) : [], start: Date.now(), changed: false, note: "", saveTpl: false, tplName: "", msg: "" };
      if (it.type === "priv") pair(it).forEach(function (c, i) { if (tl[i]) setSessTpl(it, c, tl[i]); });
      if (it.duo) { S.log.pair = pair(it); S.log.per = {}; S.log.per[it.client] = S.log.ex; S.log.per[it.duo] = tl[1] ? tplEx(tl[1]) : []; S.log.client = who; S.log.ex = S.log.per[who]; }
    }
    S.anim = "up"; render();
  }
  function fmtSet(e, s) { var v = s.v; return e.ty === "wr" ? v[0] + " kg × " + v[1] : e.ty === "r" ? v[0] + " herh." : e.ty === "t" ? v[0] + ":" + pad2(v[1]) : v[0] + " m · " + v[1] + ":" + pad2(v[2]); }
  function elapsed() { return elapsedOf(S.log); }
  function elapsedOf(L) { var s = Math.floor((Date.now() - L.start) / 1000); return Math.floor(s / 60) + ":" + pad2(s % 60); }

  function loggerHTML() {
    var L = S.log, c = CLIENT[L.client], it = L.edit ? {} : findItem(L.item).it, first = c.name.split(" ")[0], ios = PREF.plat === "ios", ed = !!L.edit;
    var body = "", nav = "";
    if (L.step === "start") {
      nav = barHTML("Training starten", { left: { t: "Annuleren", a: "log-close-cancel" } });
      body += '<div class="pad" style="color:var(--label2);font-size:15px;margin-bottom:12px">' + esc(c.name) + " · " + it.s + "</div>";
      body += '<div class="pad">' + grp([
        row({ a: "log-pick", d: { t: "" }, lead: '<span class="av" style="--c:var(--accent);border-radius:14px">' + ic("plus") + "</span>", title: "Lege training", sub: "Begin zonder schema en voeg oefeningen toe terwijl je traint.", cls: "wrap" }),
        row({ a: "log-pick", d: { t: "Upper A" }, lead: '<span class="av" style="--c:var(--priv);border-radius:14px">' + ic("repeat") + "</span>", title: "Vorige training herhalen", sub: "Upper A · 29 okt · 5 oefeningen", cls: "wrap" })
      ], "--inset:68px") + "</div>";
      var mine = tplList(c.id), oth = tplOthers(c.id);
      body += sh("Schema's van " + first, "", "small") + '<div class="pad">' + grp(mine.length ? mine.map(function (t) { return row({ a: "log-pick", d: { t: t }, title: tplName(t) }); }) : ['<div class="row"><div class="m"><span>Nog geen schema\'s voor ' + esc(first) + ".</span></div></div>"]) + "</div>";
      if (oth.length) body += sh("Andere schema's", "", "small") + '<div class="pad">' + grp(oth.map(function (t) { return row({ a: "log-pick", d: { t: t }, title: tplName(t) }); })) + "</div>";
    } else if ((L.step === "log" || L.step === "add") && L.reorder) {
      nav = barHTML("Volgorde", { right: { t: "Klaar", a: "ex-reorder-done", prom: true } });
      body += '<div class="pad"><p class="ro-hint">Sleep aan ≡ om de volgorde te wijzigen.</p><div class="grp ro">' + L.ex.map(function (e, i) {
        return '<div class="row ro-row"><span class="ro-no">' + (i + 1) + '</span><div class="m"><b>' + esc(e.name) + "</b><span>" + e.sets.length + (e.sets.length === 1 ? " set" : " sets") + '</span></div><button class="grip" data-drag="ex" data-i="' + i + '" aria-label="' + esc(e.name) + ' verplaatsen">' + ic("grip") + "</button></div>";
      }).join("") + "</div></div>";
    } else if (L.step === "log" || L.step === "add") {
      nav = ed ? barHTML("Training wijzigen", { left: { t: "Annuleren", a: "wk-edit-cancel" }, right: { t: "Opslaan", a: "wk-edit-save", prom: true } }) : barHTML(L.per ? (L.tpl || "Training") : first + " · " + (L.tpl || "Training"), { left: { t: "Sluiten", a: "log-close" }, right: { t: "Afronden", a: "log-finish", prom: true }, timer: true });
      if (L.per) body += '<div class="pad" style="margin-bottom:12px">' + seg(L.pair.map(function (x) { return [x, CLIENT[x].name.split(" ")[0]]; }), L.client, "log-who") + "</div>";
      var doneSets = 0; L.ex.forEach(function (e) { e.sets.forEach(function (s) { if (s.done) doneSets++; }); });
      if (ed) { var allSets = 0; L.ex.forEach(function (e) { allSets += e.sets.length; }); body += '<div class="pad" style="font-size:15px;color:var(--label2);margin-bottom:12px"><b style="display:block;font-size:19px;color:var(--label)">' + esc(L.edit.name) + "</b><span>" + esc(first) + " · " + L.edit.d + " · " + L.ex.length + " oefeningen · " + allSets + (allSets === 1 ? " set" : " sets") + "</span></div>"; }
      else body += '<div class="pad" style="display:flex;justify-content:space-between;font-size:15px;color:var(--label2);margin-bottom:12px"><span>' + L.ex.length + " oefeningen · " + doneSets + (doneSets === 1 ? " set" : " sets") + ' klaar</span><span style="color:var(--ok);display:flex;gap:4px;align-items:center">' + ic("check") + "Opgeslagen</span></div>";
      if (!L.ex.length) body += '<div class="pad"><div class="card" style="text-align:center;padding:28px 20px"><b style="display:block;font-size:19px;margin-bottom:6px">Nog geen oefeningen</b><span style="color:var(--label2);font-size:15px">Voeg de eerste oefening toe. Wat ' + esc(first) + " eerder deed, staat bovenaan.</span></div></div>";
      body += '<div class="pad stack">' + L.ex.map(function (e, ei) {
        var d = e.sets.filter(function (s) { return s.done; }).length, all = d === e.sets.length;
        var h = '<div class="lg-ex' + (ed ? " ed" : "") + '"><div class="lg-h"><span class="no ' + (all ? "done" : "") + '">' + (all ? ic("check") : ei + 1) + '</span><div class="m" style="flex:1;min-width:0"><b>' + esc(e.name) + "</b><span>" + (ed ? e.sets.length + (e.sets.length === 1 ? " set" : " sets") : (e.target ? esc(e.target) + " · " : "") + (e.prev.length ? "Vorige: 29 okt" + lastDiff(L.client, e.name) : "Nog geen eerdere training")) + "</span></div>" + (ed ? "" : '<span class="pr">' + d + "/" + e.sets.length + "</span>") + '<button class="x" data-a="ex-menu" data-e="' + ei + '" aria-label="Opties voor ' + esc(e.name) + '">' + ic("more") + "</button></div>";
        /* one compact row per set: Set | Vorige | today's fields | tick; column labels once per exercise */
        var lay = LAYOUT[e.ty];
        h += '<div class="lg-cols" aria-hidden="true"><span>Set</span>' + (ed ? "" : "<span>Vorige</span>") + '<span class="vals">' + lay.head.map(function (x) { return '<span class="' + x[1] + '">' + x[0] + "</span>"; }).join("") + "</span>" + (ed ? "" : "<span></span>") + "</div>";
        h += e.sets.map(function (s, si) {
          var vals = lay.inp.map(function (fd) { return '<input class="' + fd[2] + '" inputmode="' + fd[1] + '" value="' + esc(s.v[fd[0]]) + '" data-ls="' + ei + "," + si + "," + fd[0] + '" aria-label="' + esc(e.name) + ", set " + (si + 1) + ", " + fd[4] + '"' + (s.done ? " readonly" : "") + ">" + (fd[3] ? '<span class="sep">' + fd[3] + "</span>" : ""); }).join("");
          var canRemove = !s.done && e.sets.length > 1;
          return '<div class="sw-row' + (canRemove ? " can" : "") + '" data-e="' + ei + '" data-s="' + si + '">' + (canRemove ? '<button class="sw-del" data-a="set-remove-ask" data-e="' + ei + '" data-s="' + si + '" tabindex="-1">Verwijderen</button>' : "") +
            '<div class="set c ' + (s.done ? "done" : "") + '">' + '<button class="sn" data-a="set-menu" data-drag="set" data-e="' + ei + '" data-s="' + si + '" aria-label="Set ' + (si + 1) + ': verplaatsen of verwijderen">' + (si + 1) + "</button>" +
            (ed ? "" : '<span class="pv">' + (e.prev[si] ? esc(e.prev[si]) : "–") + "</span>") + '<span class="vals">' + vals + "</span>" + (ed ? "" : '<button class="tick ' + (s.done ? "on" : "") + '" data-a="tick" data-e="' + ei + '" data-s="' + si + '" aria-label="' + esc(e.name) + ", set " + (si + 1) + (s.done ? " weer openzetten" : " klaar") + '">' + ic("check") + "</button>") + "</div></div>";
        }).join("");
        h += '<div class="lg-f">' + btn("Set", { k: "ghost", sm: true, a: "set-add", d: { e: ei }, i: "plus" }) + '<div class="diff" role="group" aria-label="Hoe ging het?">' + diffBtns(e, "diff", ' data-e="' + ei + '"') + '<button class="info" data-a="info" data-n="diff" aria-label="Wat betekent dit?">' + ic("info") + "</button></div></div></div>";
        return h;
      }).join("") + btn("Oefening toevoegen", { k: "sec", blk: true, a: "ex-add", i: "plus" }) + "</div>";
      if (ed) { var eh = wkOf(L.client, L.edit.h); body += foot(eh && eh.shared ? esc(first) + " ziet de wijziging meteen bij Activiteit. Er gaat geen nieuwe e-mail uit." : "Alleen jij en je collega-trainers zien deze training."); }
    } else if (L.step === "finish") {
      nav = barHTML("Training afronden", { left: { t: "Terug", a: "log-back", back: true } });
      var exDone = L.ex.filter(function (e) { return e.sets.some(function (s) { return s.done; }); }), sets = 0; L.ex.forEach(function (e) { e.sets.forEach(function (s) { if (s.done) sets++; }); });
      var notDone = L.ex.filter(function (e) { return exDone.indexOf(e) < 0; }).map(function (e) { return e.name; });
      var minsEl = Math.max(1, Math.round((Date.now() - L.start) / 60000));
      body += lt("", esc(first) + " · " + esc(L.tpl || "Training"), longDate(NOW));
      body += '<div class="pad stack"><div class="tiles"><div class="tile"><span class="ink" style="--c:var(--accent)">Duur</span><b class="num">' + minsEl + "<small> min</small></b></div>" +
        '<div class="tile"><span class="ink" style="--c:var(--priv)">Oefeningen</span><b class="num">' + exDone.length + "<small>/" + L.ex.length + '</small></b></div><div class="tile"><span class="ink" style="--c:var(--ok)">Sets</span><b class="num">' + sets + "</b></div></div>";
      if (notDone.length) body += '<div style="font-size:15px;color:var(--label2);padding:0 4px">Niet gedaan: ' + esc(notDone.join(", ")) + "</div>";
      body += '<div class="fgrp">' + fld("Notitie voor trainers", '<textarea data-in="lognote" rows="3" placeholder="Bijvoorbeeld: laatste set zwaar, volgende keer zelfde gewicht.">' + esc(L.note) + "</textarea>", "stack") + "</div>" + '<div style="font-size:13px;color:var(--label2);padding:0 4px;margin-top:-4px">Alleen trainers van Studio Fit zien dit.</div>';
      if (!L.tpl || L.changed) {
        body += grp([row({ title: L.changed ? "Opslaan als nieuw schema" : "Opslaan als schema", sub: L.changed ? esc(L.tpl) + " blijft zoals het was." : "Dan kies je deze training later opnieuw.", cls: "wrap", tr: '<button class="toggle ' + (L.saveTpl ? "on" : "") + '" data-a="tpl-toggle" role="switch" aria-checked="' + L.saveTpl + '" aria-label="Opslaan als schema"></button>' })]);
        if (L.saveTpl) body += '<div class="fgrp">' + fld("Naam van het schema", '<input data-in="tplname" value="' + esc(L.tplName || (L.changed ? L.tpl + " (aangepast)" : first + " · 5 november")) + '">') + "</div>";
      }
      body += grp([row({ title: "Aanwezigheid", tr: "Aanwezig", cls: "kv" })]);
      body += btn("Training afronden", { blk: true, a: "log-done", i: "check" }) + "</div>";
    } else if (L.step === "share") {
      nav = barHTML("", {});
      body += '<div style="text-align:center;padding:10px 24px 20px"><span style="width:84px;height:84px;border-radius:50%;margin:0 auto 16px;display:grid;place-items:center;color:#fff;background:linear-gradient(160deg,color-mix(in oklab,var(--ok) 85%,#000),color-mix(in oklab,var(--ok) 75%,#000))">' + ic("check").replace('class=""', 'style="width:44px;height:44px"') + '</span><h1 style="font-size:28px;margin:0 0 6px">Training opgeslagen</h1><p style="color:var(--label2);margin:0;font-size:16px">Training delen met ' + esc(first) + "? " + esc(first) + " ziet het overzicht in haar profiel en krijgt een e-mail.</p></div>";
      body += '<div class="pad stack"><div class="fgrp">' + fld("Bericht voor " + esc(first) + " (optioneel)", '<textarea data-in="logmsg" rows="3" placeholder="Goed gewerkt vandaag!">' + esc(L.msg) + "</textarea>", "stack") + "</div>";
      if (S.preview) body += '<div class="prevw"><b style="display:block;margin-bottom:6px">Je training staat klaar, ' + esc(first) + '</b><span style="color:var(--label2)">' + (L.msg ? "“" + esc(L.msg) + "” · " : "") + L.ex.filter(function (e) { return e.sets.some(function (s) { return s.done; }); }).map(function (e) { return esc(e.name) + " " + e.sets.filter(function (s) { return s.done; }).map(function (s) { return fmtSet(e, s); }).join(", "); }).join(" · ") + "</span></div>";
      body += btn("Delen met " + esc(first), { blk: true, a: "log-share", i: "share" }) + btn(S.preview ? "Voorbeeld verbergen" : "Voorbeeld bekijken", { k: "sec", blk: true, a: "preview" }) + btn("Nu niet delen", { k: "ghost", blk: true, a: "log-noshare" }) + "</div>";
    }
    var scroller = '<div class="content" style="padding-bottom:40px">' + body + "</div>";
    var add = L.step === "add" ? sheetHTML(SHEETS.addEx(), "close-add") : "";
    return '<div class="full' + (S.anim === "up" ? " anim-up" : "") + '">' + nav + scroller + "</div>" + add;
  }

  /* ---------- Chrome per platform ---------- */
  function barHTML(t, o) {
    var ios = PREF.plat === "ios", L = "", R = "";
    if (ios) {
      if (o.left) L = '<button class="gb glass ' + (o.left.back ? "back" : "txt") + '" data-a="' + o.left.a + '">' + (o.left.back ? ic("chevL") : o.left.t) + "</button>";
      if (o.right) R = '<button class="gb ' + (o.right.prom ? "prom" : "glass") + ' txt" data-a="' + o.right.a + '">' + o.right.t + "</button>";
      var tt = '<div class="t" style="opacity:1;bottom:' + (o.timer ? "18px" : "12px") + '">' + esc(t) + (o.timer ? '<div style="font-size:12px;font-weight:600;color:var(--label2);font-variant-numeric:tabular-nums" data-timer>' + elapsed() + "</div>" : "") + "</div>";
      return '<div class="nb inline">' + L + '<span class="sp"></span>' + R + tt + "</div>";
    }
    L = o.left ? '<button class="ib" data-a="' + o.left.a + '" aria-label="' + esc(o.left.t) + '">' + ic(o.left.back ? "back" : "x") + "</button>" : "";
    if (o.right) R = btn(o.right.t, { k: o.right.prom ? "pri" : "ghost", sm: true, a: o.right.a });
    return '<div class="ab">' + L + '<div class="t" style="font-size:20px;line-height:1.15">' + esc(t) + (o.timer ? '<div style="font-size:13px;color:var(--label2);font-variant-numeric:tabular-nums" data-timer>' + elapsed() + "</div>" : "") + "</div>" + R + "</div>";
  }

  function navHTML(p, depth) {
    var ios = PREF.plat === "ios", prev = depth > 0;
    var trailing = (p.trailing || []).slice();
    if (ios) {
      var L = prev ? '<button class="gb glass back" data-a="back" aria-label="Terug">' + ic("chevL") + "</button>" : "";
      var caps = trailing.map(function (t) { return t.t ? '<button class="gb glass txt" data-a="' + t.a + '"' + dattrs(t.d) + ">" + t.t + "</button>" : '<button class="gb glass" data-a="' + t.a + '"' + dattrs(t.d) + ' aria-label="' + esc(t.label) + '">' + ic(t.i) + "</button>"; }).join("");
      if (p.add) caps += '<button class="gb prom" data-a="' + p.add.a + '" aria-label="' + esc(p.add.label) + '">' + ic("plus") + "</button>";
      if (p.save) caps += '<button class="gb prom" data-a="' + p.save.a + '"' + dattrs(p.save.d) + ' aria-label="Opslaan">' + ic("check") + "</button>";
      return '<div class="nb' + (p.inline ? "" : "") + '">' + L + '<span class="sp"></span>' + caps + '<div class="t"' + (p.noTr ? ' translate="no"' : "") + ">" + esc(p.title) + "</div></div>";
    }
    var A = prev ? '<button class="ib" data-a="back" aria-label="Terug">' + ic("back") + "</button>" : "";
    var acts = trailing.map(function (t) { return '<button class="ib" data-a="' + t.a + '"' + dattrs(t.d) + ' aria-label="' + esc(t.label || t.t) + '">' + ic(t.i === "more" ? "moreV" : t.i) + "</button>"; }).join("");
    if (p.save) acts += btn("Opslaan", { k: "ghost", sm: true, a: p.save.a, d: p.save.d });
    return '<div class="ab ' + (p.large ? "root" : "") + '">' + A + '<div class="t"' + (p.noTr ? ' translate="no"' : "") + ">" + esc(p.title) + "</div>" + acts + "</div>";
  }

  function tabsHTML() {
    var T = [["today", "Vandaag", "sun"], ["agenda", "Agenda", "cal"], ["clients", "Klanten", "people"], ["profile", "Profiel", "me"]];
    if (PREF.plat === "ios") {
      return '<div class="fade-b"></div><nav class="tabbar' + (S.tabMin ? " min" : "") + '" aria-label="Tabs"><div class="tabs glass">' + T.map(function (t) { return '<button class="tab ' + (S.tab === t[0] ? "on" : "") + '" data-a="tab" data-v="' + t[0] + '" aria-current="' + (S.tab === t[0] ? "page" : "false") + '">' + ic(t[2]) + "<span>" + t[1] + "</span></button>"; }).join("") +
        "</div></nav>";
    }
    return '<nav class="navb" aria-label="Navigatie">' + T.map(function (t) { return '<button class="' + (S.tab === t[0] ? "on" : "") + '" data-a="tab" data-v="' + t[0] + '"><i>' + ic(t[2]) + "</i>" + t[1] + "</button>"; }).join("") + "</nav>";
  }

  function sheetHTML(sh_, closeA) {
    var ios = PREF.plat === "ios", large = !sh_.small, bar;
    closeA = closeA || "close-sheet";
    if (ios) bar = '<div class="sbar"><button class="gb glass" data-a="' + closeA + '" aria-label="Sluiten">' + ic("x") + "</button><h3>" + esc(sh_.title) + "</h3>" + (sh_.save ? '<button class="gb prom" data-a="' + sh_.save + '" aria-label="Opslaan">' + ic("check") + "</button>" : '<span style="width:44px"></span>') + "</div>";
    else bar = large ? '<div class="sbar"><button class="ib" data-a="' + closeA + '" aria-label="Sluiten">' + ic("x") + "</button><h3>" + esc(sh_.title) + "</h3>" + (sh_.save ? btn("Opslaan", { k: "ghost", sm: true, a: sh_.save }) : "") + "</div>" : '<div class="sbar"><h3 style="padding-left:12px">' + esc(sh_.title) + "</h3></div>";
    return '<div class="scrim anim-fade" data-a="' + closeA + '"></div><div class="sheet ' + (large ? "large" : "") + (!sh_.still && (S.anim === "up" || S.anim === "sheet") ? " anim-up" : "") + '" role="dialog" aria-label="' + esc(sh_.title) + '"><div class="grab"></div>' + bar + '<div class="sbody">' + sh_.body + "</div></div>";
  }

  var ALERTS = {
    signout: function () { return { t: "Uitloggen?", p: "Je kunt altijd weer inloggen met je e-mailadres.", b: [["Uitloggen", "do-signout", "pri"], ["Annuleren", "close-alert", "sec"]] }; },
    cancelSession: function (d) { var it = findItem(d.id).it; if (it.duo) { var n1 = CLIENT[it.client].name.split(" ")[0], n2 = CLIENT[it.duo].name.split(" ")[0]; return { t: "Wie annuleer je?", p: "Annuleer je één klant, dan gaat de sessie door met de ander. Beiden krijgen een e-mail.", b: [["Alleen " + n1 + " annuleren", "do-cancel-first", "sec"], ["Alleen " + n2 + " annuleren", "do-cancel-second", "sec"], ["Hele sessie annuleren", "do-cancel", "dng"], ["Terug", "close-alert", "sec"]] }; } return { t: "Sessie annuleren?", p: CLIENT[it.client].name.split(" ")[0] + " krijgt een e-mail dat de sessie van " + it.s + " niet doorgaat.", b: [["Sessie annuleren", "do-cancel", "dng"], ["Terug", "close-alert", "sec"]] }; },
    cancelClass: function (d) { var it = findItem(d.id).it; return { t: "Les annuleren?", p: "De " + it.people.length + " geboekte klanten krijgen een e-mail. Je kunt er een bericht bij zetten op het web.", b: [["Les annuleren", "do-cancel", "dng"], ["Terug", "close-alert", "sec"]] }; },
    removeEx: function (d) { var e = S.log.ex[d.e], n = e.sets.filter(function (s) { return s.done; }).length; return { t: e.name + " verwijderen?", p: n ? e.name + " heeft " + n + (n === 1 ? " gelogde set" : " gelogde sets") + ". Toch verwijderen?" : (e.sets.length === 1 ? "De enige set van " + e.name + " gaat uit deze training." : (e.sets.length === 2 ? "Beide" : "Alle " + e.sets.length) + " sets van " + e.name + " gaan uit deze training."), b: [["Verwijderen", "do-remove-ex", "dng"], ["Terug", "close-alert", "sec"]] }; },
    removeSet: function (d) { var e = S.log.ex[d.e]; return { t: "Set " + (+d.s + 1) + " verwijderen?", p: e.name + " houdt " + (e.sets.length - 1) + (e.sets.length - 1 === 1 ? " set" : " sets") + ".", b: [["Verwijderen", "do-remove-set", "dng"], ["Terug", "close-alert", "sec"]] }; },
    tplDel: function (d) { return { t: "Schema verwijderen?", p: d.t + " kun je daarna niet meer kiezen bij een training. Trainingen die al met dit schema zijn gelogd, blijven bewaard." + (tplUseLine(d.t) ? " " + tplUseLine(d.t) : ""), b: [["Verwijderen", "do-tpl-del", "dng"], ["Terug", "close-alert", "sec"]] }; },
    tplDrop: function (d) { return { t: d.t + " weghalen bij " + fname(d.c) + "?", p: "Het schema zelf blijft bestaan.", b: [["Weghalen", "do-tpl-drop", "dng"], ["Terug", "close-alert", "sec"]] }; },
    wkDel: function (d) { var h = wkOf(d.id, d.h), fn = fname(d.id); return { t: "Training van " + dateOnly(h.d) + " verwijderen?", p: h.shared ? "Deze training is voorgoed weg. " + fn + " ziet de training ook niet meer bij Activiteit. De e-mail die " + fn + " al kreeg, blijft verstuurd. Je kunt dit niet ongedaan maken." : "Deze training is voorgoed weg. Je kunt dit niet ongedaan maken.", b: [["Verwijderen", "do-wk-del", "dng"], ["Terug", "close-alert", "sec"]] }; },
    wkUnshare: function (d) { var fn = fname(d.id); return { t: "Niet meer delen met " + fn + "?", p: fn + " ziet deze training niet meer bij Activiteit. De e-mail die " + fn + " al kreeg, blijft verstuurd. Deel je de training later opnieuw, dan krijgt " + fn + " weer een e-mail.", b: [["Niet meer delen", "do-wk-unshare", "dng"], ["Terug", "close-alert", "sec"]] }; },
    zero: function () { return { t: "Nog niets bijgehouden", p: "Je hebt nog geen sets afgevinkt. Toch afronden?", b: [["Afronden", "do-zero", "pri"], ["Terug", "close-alert", "sec"]] }; },
    rings: function () {
      var ws = S.scope === "ws";
      function li(c, t, d) { return '<li><i style="background:' + c + '"></i><span><b>' + t + "</b>" + d + "</span></li>"; }
      return { t: "Je dag in ringen", h: "<p>" + (ws ? "Alles bij Studio Fit vandaag, van alle trainers." : "Jouw sessies van vandaag.") + "</p><ul class=\"legend\">" +
        li("var(--priv)", "Privé", "Privésessies die al voorbij zijn, van het totaal vandaag.") +
        li("var(--group)", "Groepslessen", "Geboekte plekken van alle groepslessen samen.") +
        "</ul>", b: [["Begrepen", "close-alert", "pri"]] };
    },
    diff: function () {
      function li(e, t, d) { return '<li><i class="emo" aria-hidden="true">' + e + "</i><span><b>" + t + "</b>" + d + "</span></li>"; }
      return { t: "Hoe ging het?", h: "<p>Vraag na de laatste set hoe de oefening voelde. Het wordt bewaard bij de training, zodat je het later terugziet in de geschiedenis van de klant.</p><ul class=\"legend\">" +
        li("😌", "Makkelijk", "Ging makkelijk.") + li("🙂", "Normaal", "Zoals verwacht. Dit staat al aan.") + li("🥵", "Zwaar", "Was zwaar.") + "</ul>", b: [["Begrepen", "close-alert", "pri"]] };
    }
  };
  function alertHTML() {
    var a = ALERTS[S.alert.n](S.alert), b = a.b.slice();
    if (PREF.plat === "android") b.reverse();
    return '<div class="scrim anim-fade" data-a="close-alert"></div><div class="alert anim-fade' + (a.h ? " info-alert" : "") + '" role="alertdialog" aria-label="' + esc(a.t) + '"><h3>' + esc(a.t) + "</h3>" + (a.h || "<p>" + esc(a.p) + "</p>") + '<div class="btns">' + b.map(function (x) { return btn(x[0], { k: x[2], a: x[1] }); }).join("") + "</div></div>";
  }
  /* #586: one client of a duo cancels, and it continues as a private session for the other */
  function cancelDuoPart(it, firstGoes) { var gone = firstGoes ? it.client : it.duo, keep = firstGoes ? it.duo : it.client; it.client = keep; it.att = (it.attD || {})[keep] || it.att || null; delete it.duo; return CLIENT[keep].name.split(" ")[0] + " leest: Je sessie gaat door, zonder " + CLIENT[gone].name.split(" ")[0] + "."; }
  function menuHTML() {
    var m = S.menu, items = m.items;
    var pos = m.pos ? "top:" + m.pos.top + "px;" + (m.pos.left != null ? "left:" + m.pos.left + "px" : "right:" + m.pos.right + "px") : "top:calc(var(--top) + 54px);right:12px";
    return '<div class="scrim" style="background:transparent" data-a="close-menu"></div><div class="menu anim-fade" role="menu" style="' + pos + '">' + items.map(function (x) { return x === "-" ? "<hr>" : '<button role="menuitem" class="' + (x.dng ? "d" : "") + '" data-a="' + x.a + '"' + dattrs(x.d) + ">" + x.t + ic(x.i) + "</button>"; }).join("") + "</div>";
  }

  /* ---------- Render ---------- */
  var dev, mk, scrollMem = {};
  function routeKey() { return S.tab + ":" + S.stacks[S.tab].map(function (r) { return r.n + (r.id || "") + (r.i || ""); }).join("/"); }
  function render() {
    if ((PREF.plat === "ios" || PREF.plat === "android") && PREF.app === "client" && window.FVW) {
      var keepA = window.FVW.scrollSave(dev);
      dev.style.zoom = ""; dev.className = "dev " + PREF.plat;
      dev.innerHTML = '<div class="status"><span>9:41</span><i><span style="width:17px;height:11px"></span><span style="width:15px;height:11px;border-radius:3px"></span><span style="width:25px;height:12px;border-radius:4px"></span></i></div>' + window.FVW.capp() + (S.toast ? toastHTML() : "");
      dev.dataset.rk = ""; S.anim = null; syncPanel(); tr(dev); window.FVW.scrollRestore(dev, keepA);
      var ca = dev.querySelector(".screen .content"); if (ca && ca.scrollTop > 30) ca.parentNode.classList.add("scrolled");
      return;
    }
    if ((PREF.plat === "web" || PREF.plat === "client") && window.FVW) {
      var keep = window.FVW.scrollSave(dev);
      dev.className = "dev " + PREF.plat + (PREF.plat === "client" ? " ios" : "");
      dev.innerHTML = (PREF.plat === "client" ? '<div class="status"><span>9:41</span><i><span style="width:17px;height:11px"></span><span style="width:15px;height:11px;border-radius:3px"></span><span style="width:25px;height:12px;border-radius:4px"></span></i></div>' : "") + window.FVW[PREF.plat]() + (S.toast ? toastHTML() : "");
      dev.dataset.rk = "";
      S.anim = null; syncPanel(); tr(dev); window.FVW.scrollRestore(dev, keep); var cc = dev.querySelector(".screen .content"); if (cc && cc.scrollTop > 30) cc.parentNode.classList.add("scrolled"); fitDev();
      return;
    }
    dev.style.zoom = "";
    var c = dev.querySelector(".screen .content"), sb = dev.querySelector(".sbody"), fc = dev.querySelector(".full .content");
    if (c && dev.dataset.rk) scrollMem[dev.dataset.rk] = c.scrollTop;
    var sbTop = sb ? sb.scrollTop : 0, fcTop = fc ? fc.scrollTop : 0;
    var prevSheet = dev.dataset.sheet;
    dev.className = "dev " + PREF.plat;
    var h = '<div class="status"><span>9:41</span><i><span style="width:17px;height:11px"></span><span style="width:15px;height:11px;border-radius:3px"></span><span style="width:25px;height:12px;border-radius:4px"></span></i></div>';
    if (!S.signedIn) { h += signIn(); }
    else {
      var r = top(), st = S.stacks[S.tab], p = SCREENS[r.n](r);
      var body = (p.large ? lt(p.eb, esc(p.title), p.sub) : "") + p.body;
      h += '<div class="screen' + (p.large ? " root" : "") + (S.anim === "push" ? " anim-push" : S.anim === "pop" ? " anim-pop" : "") + '">' + navHTML(p, st.length) + '<div class="content">' + body + "</div></div>";
      if (PREF.plat === "android" && p.add) h += '<button class="fab" data-a="' + p.add.a + '">' + ic(p.add.i || "plus") + p.add.label + "</button>";
      var run = !S.log && Object.keys(S.logs)[0];
      if (run) { var RL = S.logs[run]; h += '<button class="acc glass" data-a="start-workout" data-id="' + run + '"><span class="acc-ic">' + ic("dumb") + '</span><span class="acc-t"><b>' + esc(CLIENT[RL.client].name.split(" ")[0]) + " · " + esc(RL.tpl || "Training") + '</b><small><span>Training bezig</span> · <span data-run="' + run + '">' + elapsedOf(RL) + '</span></small></span><span class="acc-go">Doorgaan</span></button>'; }
      dev.classList.toggle("has-acc", !!run);
      h += tabsHTML();
      if (S.sheet) h += sheetHTML(SHEETS[S.sheet](), "close-sheet");
      if (S.sheet === "tplForm" && S.tplPick) h += sheetHTML(SHEETS.addEx(), "tpl-pick-close");
      if (S.log) h += loggerHTML();
    }
    if (S.menu) h += menuHTML();
    if (S.alert) h += alertHTML();
    if (S.toast) h += toastHTML();
    dev.innerHTML = h;
    dev.dataset.rk = routeKey();
    dev.dataset.sheet = S.sheet || "";
    var nc = dev.querySelector(".screen .content");
    if (nc && S.anim !== "push" && scrollMem[dev.dataset.rk] != null) nc.scrollTop = scrollMem[dev.dataset.rk];
    if (S.scrollTo) { var tg = dev.querySelector('[data-sec="' + S.scrollTo + '"]'); if (tg && nc) nc.scrollTop += tg.getBoundingClientRect().top - nc.getBoundingClientRect().top - 70; S.scrollTo = null; }
    var nsb = dev.querySelector(".sbody"); if (nsb && S.anim !== "up" && prevSheet === (S.sheet || "")) nsb.scrollTop = sbTop;
    if (nsb && S.sheetBottom) { nsb.scrollTop = nsb.scrollHeight; S.sheetBottom = false; }
    var nfc = dev.querySelector(".full .content");
    if (nfc) { if (S.scrollBottom) { nfc.scrollTop = nfc.scrollHeight; S.scrollBottom = false; } else if (S.anim !== "up") nfc.scrollTop = fcTop; }
    if (nc && nc.scrollTop > 30) nc.parentNode.classList.add("scrolled");
    S.anim = null;
    syncPanel();
    tr(dev);
    dev.querySelectorAll(".card.desc p.clamp").forEach(function (p) { if (p.scrollHeight <= p.clientHeight + 1) p.nextElementSibling.hidden = true; });
  }
  function tr(root) { if (window.FIVVI_I18N) window.FIVVI_I18N.apply(root, PREF.lang); if (dev && (root === dev || dev.contains(root))) term(root); }
  /* The workspace's own word for its trainers, after translation. The prototype applies one word to the whole screen;
     the product picks it per workspace. */
  function term(root) {
    var k = D.workspaces.sf.term, t = D.TERMS[k]; if (!t || k === "trainer") return;
    var w = t[PREF.lang === "en" ? "en" : "nl"], re = /\b([Tt])rainer(s)?\b/g;
    function fix(x) { return x.replace(re, function (m, T, pl) { var r = pl ? w[1] : w[0]; return T === "T" ? r[0].toUpperCase() + r.slice(1) : r; }); }
    var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = walk.nextNode())) { if (n.parentElement.closest("[translate=no],script,style,textarea")) continue; if (re.test(n.nodeValue)) { re.lastIndex = 0; n.nodeValue = fix(n.nodeValue); } re.lastIndex = 0; }
    root.querySelectorAll("[placeholder],[aria-label]").forEach(function (el) { ["placeholder", "aria-label"].forEach(function (a) { var v = el.getAttribute(a); if (v && /rainer/.test(v)) el.setAttribute(a, fix(v)); }); });
  }
  function toastHTML() { var err = S.toastKind === "err"; return '<div class="toast glass anim-fade' + (err ? " err" : "") + '" role="' + (err ? "alert" : "status") + '">' + ic(err ? "warn" : "check") + esc(S.toast) + "</div>"; }
  /* a wrong entry: the field gets a red edge and the message under it, and the toast says it too */
  function bad(f, msg) { S.err = {}; S.err[f] = msg; toast(msg, "err"); return true; }
  function toast(m, kind) { S.toast = m; S.toastKind = kind || "ok"; render(); clearTimeout(toast.t); toast.t = setTimeout(function () { S.toast = null; var el = dev.querySelector(".toast"); if (el) el.remove(); }, 2300); }
  function push(r) { S.stacks[S.tab].push(r); S.anim = "push"; S.tabMin = false; render(); }
  function closeAll() { S.sheet = null; S.tplPick = false; S.pick = null; S.alert = null; S.menu = null; }

  /* ---------- Actions ---------- */
  function today5() { return { date: TODAY, start: "11:00", end: "12:00", dur: "60", cap: "10" }; }
  var A = {
    back: function () { S.stacks[S.tab].pop(); S.anim = "pop"; render(); },
    tab: function (d) { closeAll(); if (S.tab === d.v && S.stacks[S.tab].length) { S.stacks[S.tab] = []; } S.tab = d.v; S.tabMin = false; render(); },
    search: function () { closeAll(); S.tab = "clients"; S.stacks.clients = []; S.tabMin = false; render(); var i = dev.querySelector('[data-in="q"]'); if (i) i.focus(); },
    scope: function (d) { S.scope = d.v; render(); },
    "open-session": function (d) { push({ n: "session", id: d.id }); },
    "open-class": function (d) { push({ n: "klass", id: d.id }); },
    "open-client": function (d) { push({ n: "client", id: d.id }); },
    "open-workout": function (d) { push({ n: "workout", id: d.id, h: d.h }); },
    "open-att": function (d) { var it = findItem(d.id).it; it.attDraft = null; push({ n: "attendance", id: d.id }); },
    push: function (d) { push({ n: d.n }); },
    att: function (d) { var it = findItem(d.id).it; it.att = d.v; toast(d.v === "yes" ? CLIENT[it.client].name.split(" ")[0] + " was aanwezig" : "Genoteerd als niet verschenen"); },
    satt: function (d) { var it = findItem(d.id).it; if (it.duo) { it.attD = it.attD || {}; it.attD[d.c] = d.v || null; it.att = it.attD[it.client] && it.attD[it.duo] ? it.attD[it.client] : null; } else it.att = d.v || null; render(); },
    "att-one": function (d) { var it = findItem(d.id).it; it.attDraft[d.i] = it.attDraft[d.i] === d.v ? undefined : d.v; render(); },
    "att-all": function (d) { var it = findItem(d.id).it; it.people.forEach(function (p, i) { if (!it.attDraft[i]) it.attDraft[i] = "yes"; }); render(); },
    "att-save": function (d) { var it = findItem(d.id).it; it.attMap = it.attDraft; S.stacks[S.tab].pop(); S.anim = "pop"; toast("Aanwezigheid opgeslagen"); },
    "desc-toggle": function (d) { S.showDesc[d.id] = !S.showDesc[d.id]; render(); },
    "show-all": function (d) { S.showAll[d.id] = true; render(); },
    "agenda-day": function (d) { S.tab = "agenda"; S.stacks.agenda = []; S.aday = d.k; S.aview = "week"; render(); },
    "agenda-today": function () { S.aday = TODAY; render(); },
    aview: function (d) { S.aview = d.v; render(); },
    aday: function (d) { S.aday = d.k; render(); },
    week: function (d) { S.aday = key(add(parse(S.aday), 7 * d.v)); render(); },
    month: function (d) { var x = parse(S.aday); S.aday = key(new Date(x.getFullYear(), x.getMonth() + +d.v, 1)); render(); },
    "new": function () { S.sheet = "new"; S.anim = "up"; render(); },
    "new-session": function () { S.form = Object.assign(today5(), { client: "anna", loc: D.locations[1] }); S.sheet = "newSession"; S.anim = "up"; render(); },
    "plan-for": function (d) { S.form = Object.assign(today5(), { client: d.id, date: key(add(NOW, 1)), start: "10:30", loc: D.locations[1] }); S.sheet = "newSession"; S.anim = "up"; render(); },
    offer: function (d) { var a = d.ag ? D.billing[d.id].agreements.filter(function (x) { return x.id === d.ag; })[0] : null; S.menu = null; S.form = { client: d.id, ag: d.ag || "", offer: offerStart(OPENOFFERS(), a), start: "after" }; S.sheet = "offer"; S.anim = "up"; render(); },
    cash: function (d) { S.menu = null; S.form = { client: d.id, offer: offerStart(D.onOffers()), how: "Contant", date: TODAY }; S.sheet = "cash"; S.anim = "up"; render(); },
    "save-cash": function () { D.recordOutside(S.form.client, S.form.offer, S.form.how, S.form.date); S.sheet = null; toast("Betaling vastgelegd."); },
    "cash-paid": function (d) { D.recordOutsidePaid(d.id, d.ag); toast("Betaling vastgelegd."); },
    "send-offer": function () { var f = S.form, c = CLIENT[f.client]; if (f.ag) D.billing[f.client].agreements.forEach(function (x) { if (x.id === f.ag) x.offerSent = "vandaag"; }); S.sheet = null; toast("Aanbod verstuurd aan " + c.name.split(" ")[0]); },
    "new-client": function () { S.form = { name: "", email: "", lang: "Nederlands", ws: "sf" }; S.sheet = "newClient"; S.anim = "up"; render(); },
    "new-class": function () { S.form = Object.assign(today5(), { name: "", trainer: D.me.name, rep: "Niet herhalen", cap: "12", start: "19:00", end: "20:00" }); S.sheet = "newClass"; S.anim = "up"; render(); },
    "new-gym": function () { S.form = Object.assign(today5(), { start: "17:00", end: "19:00" }); S.sheet = "newGym"; S.anim = "up"; render(); },
    note: function (d) { S.form = { client: d.id, text: "" }; S.sheet = "note"; S.anim = "up"; render(); },
    "open-tpl": function (d) { push({ n: "template", id: d.t }); },
    "tpl-new": function () { S.form = { name: "", orig: "", rows: [] }; S.err = {}; S.tplPick = false; S.sheet = "tplForm"; S.anim = "up"; render(); },
    "tpl-edit": function (d) { S.form = { name: d.t, orig: d.t, rows: D.tpl[d.t].map(function (r) { return { n: r[0], sets: String(r[1]), target: r[2] }; }) }; S.err = {}; S.tplPick = false; S.sheet = "tplForm"; S.anim = "up"; render(); },
    "tpl-pick": function () { S.exq = ""; S.tplPick = true; S.anim = "sheet"; render(); },
    "tpl-pick-close": function () { S.tplPick = false; render(); },
    "tpl-up": function (d) { tplMove(+d.i, -1); },
    "tpl-down": function (d) { tplMove(+d.i, 1); },
    "tpl-rm": function (d) { S.form.rows.splice(+d.i, 1); render(); },
    "save-tpl": function () {
      var f = S.form, nm = (f.name || "").trim();
      if (!nm) { bad("name", "Vul een naam in"); return; }
      if (Object.keys(D.tpl).some(function (k) { return k !== f.orig && k.trim().toLowerCase() === nm.toLowerCase(); })) { bad("name", "Er is al een schema met deze naam"); return; }
      if (!f.rows.length) { S.err = {}; toast("Een schema heeft minstens één oefening", "err"); return; }
      var rows = f.rows.map(function (r) { return [r.n, Math.max(1, parseInt(r.sets, 10) || 1), (r.target || "").trim() || TPL_DEF[tplType(r.n)]]; });
      if (f.orig && f.orig !== nm) { tplRename(f.orig, nm); var keep = Object.keys(D.tpl).map(function (k) { return [k === f.orig ? nm : k, k === f.orig ? rows : D.tpl[k]]; }); Object.keys(D.tpl).forEach(function (k) { delete D.tpl[k]; }); keep.forEach(function (x) { D.tpl[x[0]] = x[1]; }); }
      else D.tpl[nm] = rows;
      S.sheet = null; S.tplPick = false; S.err = {};
      if (f.orig) { var st = S.stacks[S.tab], tp = st[st.length - 1]; if (tp && tp.n === "template") tp.id = nm; toast("Schema opgeslagen"); }
      else { S.stacks[S.tab].push({ n: "template", id: nm }); S.anim = "push"; toast("Schema gemaakt"); }
    },
    "tpl-del-ask": function (d) { S.alert = { n: "tplDel", t: d.t }; render(); },
    "do-tpl-del": function () { tplPurge(S.alert.t); delete D.tpl[S.alert.t]; S.alert = null; S.stacks[S.tab].pop(); S.anim = "pop"; toast("Schema verwijderd"); },
    "cl-tpl-add": function (d) { S.pick = { c: d.id }; S.sheet = "tplAdd"; S.anim = "up"; render(); },
    "cl-tpl-add-do": function (d) { tplAdd(S.pick.c, d.t); S.sheet = null; S.pick = null; toast("Schema toegevoegd"); },
    "cl-tpl-drop-ask": function (d) { S.alert = { n: "tplDrop", t: d.t, c: d.id }; render(); },
    "do-tpl-drop": function () { tplDrop(S.alert.c, S.alert.t); S.alert = null; toast("Schema weggehaald"); },
    "sess-tpl-pick": function (d) { S.pick = { id: d.id, c: d.c }; S.sheet = "sessTpl"; S.anim = "up"; render(); },
    "sess-tpl-set": function (d) { setSessTpl(findItem(S.pick.id).it, S.pick.c, d.t); S.sheet = null; S.pick = null; toast(d.t ? "Schema ingesteld" : "Schema weggehaald"); },
    "close-sheet": function () { S.sheet = null; S.tplPick = false; S.pick = null; S.err = {}; render(); },
    fset: function (d) { S.form[d.f] = d.v; render(); },
    "save-session": function () {
      var f = S.form, it = { id: "n" + Date.now(), ws: "sf", type: "priv", s: f.start, e: hm(mins(f.start) + +f.dur), client: f.client, duo: f.duo && f.duo !== f.client ? f.duo : undefined, loc: f.loc, att: null };
      dayItems(f.date); DAYCACHE[f.date].push(it); S.sheet = null; S.stacks[S.tab].push({ n: "session", id: it.id }); S.anim = "push"; toast("Sessie gepland");
    },
    "save-client": function () {
      var f = S.form; if (!f.name.trim()) { bad("name", "Vul een naam in"); return; }
      if (!/.+@.+\..+/.test(f.email || "")) { bad("email", "Vul een geldig e-mailadres in"); return; }
      var id = "c" + Date.now(), c = { id: id, ws: f.ws, name: f.name.trim(), email: f.email.trim(), lang: f.lang, last: "Nog geen sessie", c: "#8E8E93" };
      D.clients.push(c); CLIENT[id] = c; S.sheet = null; S.tab = S.tab === "profile" ? "clients" : S.tab; S.stacks[S.tab].push({ n: "client", id: id }); S.anim = "push"; toast("Klant toegevoegd");
    },
    "save-class": function () {
      var f = S.form; if (!f.name.trim()) { bad("name", "Vul een naam in"); return; }
      saveClassText(f.name.trim(), { nameEn: f.nameEn, desc: (f.desc || "").trim(), descEn: (f.descEn || "").trim() }, false);
      var it = { id: "n" + Date.now(), ws: "sf", type: "group", s: f.start, e: f.end, title: f.name.trim(), level: f.level || "", cap: +f.cap || 10, people: [], loc: "Studio Fit, Kerkstraat 12" };
      dayItems(f.date); DAYCACHE[f.date].push(it); S.sheet = null; S.stacks[S.tab].push({ n: "klass", id: it.id }); S.anim = "push"; toast(f.rep === "Niet herhalen" ? "Groepsles gepland" : "Wekelijkse groepsles gepland");
    },
    "save-gym": function () {
      var f = S.form, it = { id: "n" + Date.now(), ws: "sf", type: "gym", s: f.start, e: f.end, title: "Open Gym", cap: +f.cap || 10, people: [], loc: "Studio Fit, Kerkstraat 12" };
      dayItems(f.date); DAYCACHE[f.date].push(it); S.sheet = null; S.stacks[S.tab].push({ n: "klass", id: it.id }); S.anim = "push"; toast("Open Gym gepland en gepubliceerd");
    },
    "save-note": function () { var f = S.form; if (!f.text.trim()) { bad("text", "Schrijf eerst een notitie"); return; } (D.notes[f.client] = D.notes[f.client] || []).unshift({ t: f.text.trim(), d: "5 nov", by: "Sarah" }); S.sheet = null; toast("Notitie opgeslagen"); },
    "save-move": function () {
      var f = S.form, x = findItem(f.id), it = x.it; it.s = f.start; it.e = hm(mins(f.start) + +f.dur);
      if (f.date !== x.day) { DAYCACHE[x.day].splice(DAYCACHE[x.day].indexOf(it), 1); dayItems(f.date); DAYCACHE[f.date].push(it); }
      S.sheet = null; toast("Sessie verplaatst naar " + shortDate(parse(f.date)) + " " + f.start);
    },
    "session-menu": function (d) { S.menu = { items: [{ t: "Verplaatsen", i: "clock", a: "move", d: { id: d.id } }, { t: "Klantprofiel", i: "me", a: "menu-client", d: { id: d.id } }, "-", { t: "Sessie annuleren", i: "x", a: "alert", d: { n: "cancelSession", id: d.id }, dng: true }] }; render(); },
    "class-menu": function (d) { S.menu = { items: [{ t: "Boekingslink delen", i: "link", a: "toast", d: { m: "Boekingslink gekopieerd" } }, { t: "Trainer vervangen", i: "swap", a: "web-only" }, { t: "Les wijzigen", i: "pencil", a: "web-only" }, "-", { t: "Les annuleren", i: "x", a: "alert", d: { n: "cancelClass", id: d.id }, dng: true }] }; render(); },
    "close-menu": function () { S.menu = null; render(); },
    move: function (d) { var x = findItem(d.id); S.menu = null; S.form = { id: d.id, date: x.day, start: x.it.s, dur: String(mins(x.it.e) - mins(x.it.s)) }; S.sheet = "reschedule"; S.anim = "up"; render(); },
    "menu-client": function (d) { S.menu = null; push({ n: "client", id: findItem(d.id).it.client }); },
    alert: function (d) { S.menu = null; S.alert = Object.assign({}, d); render(); },
    info: function (d) { S.alert = { n: d.n }; render(); },
    "plan-at": function (d) { S.form = Object.assign(today5(), { client: "anna", loc: D.locations[1], start: d.s }); S.sheet = "newSession"; S.anim = "up"; render(); },
    "share-item": function (d) { var it = findItem(d.id).it, cid = d.c || it.client, h = entryOf(it, cid); if (h) wkShare(h); else it.shared = true; toast("Gedeeld met " + fname(cid)); },
    lang: function (d) { PREF.lang = d.v; save(); applyPrefs(); toast(d.v === "en" ? "Taal: English" : "Taal: Nederlands"); },
    "close-alert": function () { S.alert = null; render(); },
    "do-cancel-first": function () { var m = cancelDuoPart(findItem(S.alert.id).it, true); S.alert = null; toast(m); },
    "do-cancel-second": function () { var m = cancelDuoPart(findItem(S.alert.id).it, false); S.alert = null; toast(m); },
    "do-cancel": function () { var it = findItem(S.alert.id).it; it.cancelled = true; S.alert = null; toast(it.type === "priv" ? "Sessie geannuleerd" : "Les geannuleerd"); },
    "do-signout": function () { fresh(); S.signedIn = false; S.anim = "push"; render(); },
    "do-delete": function () { S.alert = null; S.sheet = null; toast("Dit prototype verwijdert niets"); },
    "web-only": function () { S.menu = null; toast("Dit beheer je op het web"); },
    toast: function (d) { S.menu = null; toast(d.m); },
    "sign-next": function () { if (!/.+@.+\..+/.test(S.email)) { bad("email", "Vul een geldig e-mailadres in"); return; } S.signStep = "code"; S.code = ""; S.anim = "push"; render(); var i = dev.querySelector('[data-in="code"]'); if (i) i.focus(); },
    "sign-back": function () { S.signStep = "email"; render(); },
    "sign-in": function () { S.signedIn = true; S.signStep = "email"; S.tab = "today"; toast("Ingelogd als " + (S.email || D.me.email)); },
    /* logger */
    "start-workout": function (d) { var it = findItem(d.id).it; if (S.logs[d.id]) { openLogger(d.id); return; } var ts = pair(it).map(function (x) { return sessTpl(it, x); }); if (ts.some(Boolean)) { openLogger(d.id, "log", ts); S.logs[d.id] = S.log; it.wstate = "running"; } else openLogger(d.id, "start"); },
    "start-now": function (d) {
      var c = CLIENT[d.id], it = { id: "n" + Date.now(), ws: c.ws, type: "priv", s: NOWT, e: hm(mins(NOWT) + 60), client: d.id, loc: D.workspaces[c.ws].location, att: null };
      DAYCACHE[TODAY].push(it); openLogger(it.id, "start"); toast("Sessie aangemaakt voor nu, " + NOWT);
    },
    "duo-sel": function (d) { S.duoSel[d.id] = d.v; render(); },
    "log-who": function (d) { var L = S.log; L.client = d.v; L.ex = L.per[d.v]; render(); },
    "log-pick": function (d) { var L = S.log, it = findItem(L.item).it; pair(it).forEach(function (x) { setSessTpl(it, x, d.t); }); L.tpl = d.t || null; L.ex = d.t ? tplEx(d.t) : []; if (L.per) { L.per[L.pair[0]] = L.ex; L.per[L.pair[1]] = d.t ? tplEx(d.t) : []; L.client = L.pair[0]; } L.step = d.t ? "log" : "add"; L.start = Date.now(); S.logs[L.item] = L; it.wstate = "running"; S.exq = ""; render(); },
    /* a logged workout (F045) */
    "wk-share": function (d) { wkShare(wkOf(d.id, d.h)); toast("Gedeeld met " + fname(d.id)); },
    "wk-unshare-ask": function (d) { S.alert = { n: "wkUnshare", id: d.id, h: d.h }; render(); },
    "do-wk-unshare": function () { var a = S.alert; wkUnshare(wkOf(a.id, a.h)); S.alert = null; toast("Niet meer gedeeld met " + fname(a.id)); },
    "wk-del-ask": function (d) { S.alert = { n: "wkDel", id: d.id, h: d.h }; render(); },
    "do-wk-del": function () { var a = S.alert; wkDelete(a.id, wkOf(a.id, a.h)); S.alert = null; S.stacks[S.tab].pop(); S.anim = "pop"; toast("Training verwijderd"); },
    /* correcting: the logger's set rows without timer, ticks or share step; nothing changes until Opslaan */
    "wk-edit": function (d) { var h = wkOf(d.id, d.h); S.log = { edit: { id: d.id, h: d.h, name: h.name, d: h.d }, client: d.id, step: "log", tpl: null, changed: false, start: Date.now(), note: "", msg: "", ex: (h.sets || []).map(parseHist) }; S.anim = "up"; render(); },
    "wk-edit-cancel": function () { S.log = null; render(); },
    "wk-edit-save": function () {
      var L = S.log; if (!L.ex.length) { toast("Een training heeft minstens één oefening", "err"); return; }
      var h = wkOf(L.edit.id, L.edit.h); h.sets = L.ex.map(fmtHist); h.n = L.ex.length; S.log = null; toast("Training opgeslagen");
    },
    "log-close-cancel": function () { S.log = null; render(); },
    "log-close": function () { S.log = null; render(); },
    "log-finish": function () { S.log.step = "finish"; render(); dev.querySelector(".full .content").scrollTop = 0; },
    "log-back": function () { S.log.step = "log"; render(); },
    "log-done": function () {
      var n = 0; S.log.ex.forEach(function (e) { e.sets.forEach(function (s) { if (s.done) n++; }); });
      if (!n) { S.alert = { n: "zero" }; render(); return; }
      finishLog();
    },
    "do-zero": function () { S.alert = null; var it = findItem(S.log.item).it; delete S.logs[S.log.item]; it.wstate = null; S.log = null; toast("Training gesloten zonder geschiedenis"); },
    "log-share": function () { var f = CLIENT[S.log.client].name.split(" ")[0], it = findItem(S.log.item).it, h = entryOf(it, S.log.client); if (h) wkShare(h); else it.shared = true; S.log = null; S.preview = false; toast("Gedeeld met " + f); },
    "log-noshare": function () { S.log = null; S.preview = false; toast("Opgeslagen. Je kunt later nog delen."); },
    preview: function () { S.preview = !S.preview; render(); },
    "tpl-toggle": function () { S.log.saveTpl = !S.log.saveTpl; render(); },
    tick: function (d) {
      var e = S.log.ex[d.e], s = e.sets[d.s]; s.done = !s.done;
      if (s.done) for (var i = +d.s + 1; i < e.sets.length; i++) if (!e.sets[i].done && !e.sets[i].touched) e.sets[i].v = s.v.slice();
      render();
    },
    "set-add": function (d) { var e = S.log.ex[d.e], last = e.sets[e.sets.length - 1]; e.sets.push({ v: last.v.slice(), done: false }); if (S.log.tpl) S.log.changed = true; render(); },
    "set-remove-ask": function (d) { S.menu = null; S.alert = { n: "removeSet", e: d.e, s: d.s }; render(); },
    "do-remove-set-now": function (d) { removeSet(d.e, d.s); },
    "set-menu": function (d, el) {
      var e = S.log.ex[d.e], si = +d.s, set = e.sets[si], items = [];
      if (si > 0) items.push({ t: "Omhoog", i: "up", a: "set-move", d: { e: d.e, s: si, v: -1 } });
      if (si < e.sets.length - 1) items.push({ t: "Omlaag", i: "down", a: "set-move", d: { e: d.e, s: si, v: 1 } });
      if (!set.done && e.sets.length > 1) { if (items.length) items.push("-"); items.push({ t: "Verwijderen", i: "trash", a: "set-remove-ask", d: { e: d.e, s: si }, dng: true }); }
      if (!items.length) { toast(set.done ? "Zet de set eerst weer open" : "Dit is de enige set"); return; }
      S.menu = { items: items, pos: menuAt(el, items.length, true) }; render();
    },
    "set-move": function (d) { moveSet(+d.e, +d.s, +d.s + +d.v); },
    "ex-menu": function (d, el) {
      var i = +d.e, items = [];
      if (i > 0) items.push({ t: "Omhoog", i: "up", a: "ex-move", d: { e: i, v: -1 } });
      if (i < S.log.ex.length - 1) items.push({ t: "Omlaag", i: "down", a: "ex-move", d: { e: i, v: 1 } });
      if (S.log.ex.length > 1) items.push({ t: "Volgorde wijzigen", i: "grip", a: "ex-reorder" });
      items.push("-", { t: "Verwijderen", i: "trash", a: "ex-remove", d: { e: i }, dng: true });
      S.menu = { items: items, pos: menuAt(el, items.length, false) }; render();
    },
    "ex-move": function (d) { moveEx(+d.e, +d.e + +d.v); },
    "ex-reorder": function () { S.menu = null; S.log.reorder = true; render(); },
    "ex-reorder-done": function () { S.log.reorder = false; render(); },
    "do-remove-set": function () { S.log.ex[S.alert.e].sets.splice(+S.alert.s, 1); if (S.log.tpl) S.log.changed = true; S.alert = null; render(); },
    "set-remove": function (d) { S.log.ex[d.e].sets.splice(+d.s, 1); if (S.log.tpl) S.log.changed = true; render(); },
    "ex-remove": function (d) { S.menu = null; S.alert = { n: "removeEx", e: d.e }; render(); },
    "do-remove-ex": function () { S.log.ex.splice(+S.alert.e, 1); if (S.log.tpl) S.log.changed = true; S.alert = null; render(); },
    diff: function (d) { S.log.ex[d.e].diff = d.v; render(); },
    "ex-add": function () { S.exq = ""; S.log.step = "add"; S.anim = "sheet"; render(); },
    "close-add": function () { S.log.step = "log"; render(); },
    "add-ex": function (d) { var e = D.library.filter(function (l) { return l.n === d.n; })[0];
      if (S.tplPick) { S.form.rows.push({ n: e.n, sets: "3", target: TPL_DEF[e.ty] }); S.tplPick = false; S.sheetBottom = true; render(); return; }
      S.log.ex.push(mkEx(e)); if (S.log.tpl) S.log.changed = true; S.log.step = "log"; S.scrollBottom = true; render(); },
    "add-ex-new": function () { var n = S.exq.trim() || "Nieuwe oefening"; S.log.ex.push(mkEx({ n: n.charAt(0).toUpperCase() + n.slice(1), ty: "wr" })); if (S.log.tpl) S.log.changed = true; S.log.step = "log"; S.scrollBottom = true; toast("Oefening aangemaakt. Je vindt hem voortaan onder Jouw oefeningen."); }
  };
  function menuAt(el, n, alignLeft) {
    var d = dev.getBoundingClientRect(), r = el.getBoundingClientRect(), z = parseFloat(getComputedStyle(dev).zoom) || 1, h = n * 46 + 16;
    var top = (r.bottom - d.top) / z + 4; if (top + h > d.height / z - 20) top = (r.top - d.top) / z - h - 4;
    return alignLeft ? { top: top, left: (r.left - d.left) / z } : { top: top, right: (d.right - r.right) / z };
  }
  function tplMove(i, by) { var a = S.form.rows, j = i + by; if (j < 0 || j >= a.length) return; a.splice(j, 0, a.splice(i, 1)[0]); render(); }
  function moveSet(e, from, to) { var a = S.log.ex[e].sets; a.splice(to, 0, a.splice(from, 1)[0]); if (S.log.tpl) S.log.changed = true; S.menu = null; render(); }
  function moveEx(from, to) { var a = S.log.ex; a.splice(to, 0, a.splice(from, 1)[0]); if (S.log.tpl) S.log.changed = true; S.menu = null; render(); }
  function removeSet(e, s) { S.log.ex[e].sets.splice(+s, 1); if (S.log.tpl) S.log.changed = true; render(); }
  /* what was ticked becomes a logged workout in each client's history, not shared yet (F045) */
  function logEntries(L, it) {
    (L.per ? L.pair : [L.client]).forEach(function (cid) {
      var ex = (L.per ? L.per[cid] : L.ex), sets = [];
      ex.forEach(function (e) { var dn = e.sets.filter(function (s) { return s.done; }); if (dn.length) sets.push(fmtHist({ name: e.name, ty: e.ty, sets: dn, diff: e.diff })); });
      var l = hist(cid), old = entryOf(it, cid); if (old) l.splice(l.indexOf(old), 1);
      if (!sets.length) return;
      (D.history[cid] = l).unshift({ id: "h" + (++HSEQ), name: L.tpl || "Training zonder schema", d: TODAYD, n: sets.length, by: D.me.name.split(" ")[0], dur: Math.max(1, Math.round((Date.now() - L.start) / 60000)) + " min", sid: it.id, note: L.note || "", sets: sets });
    });
  }
  function finishLog() { var L = S.log, it = findItem(L.item).it; logEntries(L, it); it.wstate = "done"; it.att = "yes"; delete S.logs[L.item]; L.step = "share"; S.anim = null; render(); if (L.saveTpl) toast("Training opgeslagen. Schema " + (L.tplName || "nieuw") + " staat klaar."); }

  /* ---------- Events ---------- */
  function onClick(e) {
    if (swDragged) { e.preventDefault(); return; }
    var el = e.target.closest("[data-a]");
    if (!el || el.disabled) return;
    if (el.closest(".panel")) return;
    var fn = A[el.dataset.a];
    if (fn) { e.preventDefault(); fn(Object.assign({}, el.dataset), el); if (window.innerWidth <= 640) document.getElementById("panel").classList.remove("open"); }
  }
  function onInput(e) {
    var t = e.target;
    if (window.FVW && window.FVW.onInput(t)) return;
    var ek = t.dataset.f || t.dataset.in;
    if (ek && S.err && S.err[ek]) { delete S.err[ek]; var lb = t.closest(".invalid"); if (lb) { lb.classList.remove("invalid"); var em = lb.querySelector(".err"); if (em) em.remove(); } }
    if (t.dataset.tr) { var tp = t.dataset.tr.split(","); S.form.rows[+tp[0]][tp[1]] = t.value; return; }
    if (t.dataset.f) { S.form[t.dataset.f] = t.value; return; }
    var k = t.dataset.in;
    if (k === "q") { S.q = t.value; dev.querySelector("#clist").innerHTML = clientList(); tr(dev.querySelector("#clist")); }
    else if (k === "exq") { S.exq = t.value; dev.querySelector("#exlist").innerHTML = exList(); tr(dev.querySelector("#exlist")); }
    else if (k === "email") S.email = t.value;
    else if (k === "code") { S.code = t.value.replace(/\D/g, "").slice(0, 6); t.value = S.code; var digits = (S.code + "      ").slice(0, 6).split(""); dev.querySelector("#codebox").innerHTML = digits.map(function (x, i) { return '<span class="' + (i === S.code.length ? "cur" : "") + '">' + esc(x.trim()) + "</span>"; }).join(""); dev.querySelector('[data-a="sign-in"]').disabled = S.code.length < 6; }
    else if (k === "lognote") S.log.note = t.value;
    else if (k === "logmsg") S.log.msg = t.value;
    else if (k === "tplname") S.log.tplName = t.value;
    if (t.dataset.ls) { var p = t.dataset.ls.split(","), ex = S.log.ex[p[0]], s = ex.sets[p[1]]; s.v[p[2]] = t.value; s.touched = true; }
  }
  function onChange(e) {
    var t = e.target;
    if (t.dataset.ls && !S.log.edit) { /* carry the changed value to later sets that were not changed or logged */
      var p = t.dataset.ls.split(","), ex = S.log.ex[p[0]];
      for (var i = +p[1] + 1; i < ex.sets.length; i++) if (!ex.sets[i].done && !ex.sets[i].touched) ex.sets[i].v[p[2]] = t.value;
      render();
    }
    if (t.dataset.f === "date" && S.sheet === "newClass") render();
  }
  var sw = null, swDragged = false, SW_OPEN = 104;
  function swClose(except) { dev.querySelectorAll(".sw-row.open").forEach(function (o) { if (o !== except) { o.classList.remove("open"); o.querySelector(".set").style.transform = ""; } }); }
  function onSwDown(e) {
    var r = e.target.closest(".sw-row"); swClose(r);
    if (!r || !r.classList.contains("can") || e.target.closest(".sw-del,[data-drag]")) return;
    sw = { r: r, x: e.clientX, y: e.clientY, base: r.classList.contains("open") ? -SW_OPEN : 0, dx: 0, on: false, id: e.pointerId };
  }
  function onSwMove(e) {
    if (!sw) return;
    var dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.on) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { sw.on = true; sw.r.classList.add("dragging"); try { sw.r.setPointerCapture(sw.id); } catch (x) { /* not capturable */ } }
      else if (Math.abs(dy) > 8) { sw = null; return; } else return;
    }
    sw.dx = Math.min(0, sw.base + dx);
    sw.r.querySelector(".set").style.transform = "translateX(" + sw.dx + "px)";
    sw.r.classList.toggle("full-swipe", sw.dx < -sw.r.offsetWidth * 0.6);
    e.preventDefault();
  }
  function onSwUp() {
    if (!sw) return;
    var r = sw.r, row = r.querySelector(".set");
    r.classList.remove("dragging", "full-swipe");
    if (sw.on) {
      swDragged = true; setTimeout(function () { swDragged = false; }, 60);
      if (sw.dx < -r.offsetWidth * 0.6) { row.style.transform = ""; r.classList.remove("open"); S.alert = { n: "removeSet", e: r.dataset.e, s: r.dataset.s }; render(); }
      else if (sw.dx < -48) { r.classList.add("open"); row.style.transform = "translateX(" + -SW_OPEN + "px)"; }
      else { r.classList.remove("open"); row.style.transform = ""; }
    }
    sw = null;
  }
  var dg = null;
  function onDgDown(e) {
    var h = e.target.closest("[data-drag]"); if (!h) return;
    var set = h.dataset.drag === "set", row = h.closest(set ? ".sw-row" : ".ro-row");
    var rows = [].slice.call(row.parentNode.children).filter(function (x) { return x.classList.contains(set ? "sw-row" : "ro-row"); });
    dg = { set: set, e: +h.dataset.e, from: rows.indexOf(row), rows: rows, row: row, y: e.clientY, h: row.offsetHeight, on: false, id: e.pointerId, to: null };
  }
  function onDgMove(e) {
    if (!dg) return;
    var dy = e.clientY - dg.y;
    if (!dg.on) { if (Math.abs(dy) < 6) return; dg.on = true; dg.row.classList.add("lifting"); try { dg.row.setPointerCapture(dg.id); } catch (x) { /* not capturable */ } }
    e.preventDefault();
    var to = Math.max(0, Math.min(dg.rows.length - 1, dg.from + Math.round(dy / dg.h))); dg.to = to;
    dg.row.style.transform = "translateY(" + dy + "px)";
    dg.rows.forEach(function (r, i) { if (r === dg.row) return; var sh = dg.from < to && i > dg.from && i <= to ? -dg.h : dg.from > to && i < dg.from && i >= to ? dg.h : 0; r.style.transform = sh ? "translateY(" + sh + "px)" : ""; });
  }
  function onDgUp() {
    if (!dg) return; var d = dg; dg = null;
    if (!d.on) return;
    swDragged = true; setTimeout(function () { swDragged = false; }, 60);
    if (d.to != null && d.to !== d.from) { if (d.set) moveSet(d.e, d.from, d.to); else moveEx(d.from, d.to); } else render();
  }
  var lastY = 0;
  function onScroll(e) {
    var t = e.target; if (!t.classList || !t.classList.contains("content")) return;
    var host = t.parentNode; host.classList.toggle("scrolled", t.scrollTop > 30);
    if (host.classList.contains("screen") && (PREF.plat === "ios" || PREF.plat === "client")) {
      var dy = t.scrollTop - lastY, tb = dev.querySelector(".tabbar");
      if (tb && dy > 8 && t.scrollTop > 120) { tb.classList.add("min"); S.tabMin = true; }
      else if (tb && dy < -8) { tb.classList.remove("min"); S.tabMin = false; }
    }
    lastY = t.scrollTop;
  }

  /* ---------- Board panel ---------- */
  var INDEX = [
    ["Fivvi Pro app", [
      ["Inloggen", "TM-01", function () { fresh(); S.signedIn = false; }],
      ["Vandaag", "TD-01", function () { fresh(); }],
      ["Vandaag · zelfstandige PT", "TD-01", function () { fresh(); PREF.setup = "solo"; }],
      ["Klantprofiel: contante betaling nog niet vastgelegd", "#606", function () { fresh(); PREF.setup = "team"; PREF.role = "owner"; S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "eva" }]; }],
      ["Betaling buiten Fivvi vastleggen", "#606", function () { fresh(); PREF.setup = "team"; PREF.role = "owner"; S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "eva" }]; S.form = { client: "eva", offer: "o2", how: "Contant", date: TODAY }; S.sheet = "cash"; }],
      ["Vandaag: betalingen nog niet gekoppeld", "#466", function () { fresh(); PREF.setup = "team"; PREF.role = "owner"; S.proPay = true; }],
      ["Vandaag · hele studio", "TD-01", function () { fresh(); PREF.setup = "team"; PREF.role = "owner"; S.scope = "ws"; }],
      ["Agenda · Dag", "TD-04", function () { fresh(); S.tab = "agenda"; S.aview = "day"; }],
      ["Agenda · Week", "TD-04", function () { fresh(); S.tab = "agenda"; S.aview = "week"; }],
      ["Agenda · Maand", "TD-04", function () { fresh(); S.tab = "agenda"; S.aview = "month"; }],
      ["Privésessie", "TD-02", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; }, true],
      ["Duosessie", "nieuw", function () { fresh(); S.stacks.today = [{ n: "session", id: "s6" }]; }, true],
      ["Sessie: schema kiezen", "F042", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; S.scrollTo = "sess"; A["sess-tpl-pick"]({ id: "s3", c: "anna" }); }, true],
      ["Sessie: nog geen schema", "F042", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; S.scrollTo = "sess"; setSessTpl(findItem("s3").it, "anna", null); }, true],
      ["Sessie: schema vast (training loopt)", "F042", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; S.scrollTo = "sess"; A["start-workout"]({ id: "s3" }); S.log = null; }, true],
      ["Duosessie: schema per klant", "F042", function () { fresh(); S.stacks.today = [{ n: "session", id: "s6" }]; S.scrollTo = "sess"; setSessTpl(findItem("s6").it, "lisa", "Upper B"); }, true],
      ["Duosessie: schema kiezen", "F042", function () { fresh(); S.stacks.today = [{ n: "session", id: "s6" }]; S.scrollTo = "sess"; A["sess-tpl-pick"]({ id: "s6", c: "eva" }); }, true],
      ["Duosessie: één klant annuleren", "#586", function () { fresh(); S.stacks.today = [{ n: "session", id: "s6" }]; S.alert = { n: "cancelSession", id: "s6" }; }, true],
      ["Duosessie loggen", "nieuw", function () { fresh(); S.stacks.today = [{ n: "session", id: "s6" }]; openLogger("s6", "log", "Full body"); S.logs.s6 = S.log; findItem("s6").it.wstate = "running"; S.anim = null; }, true],
      ["Groepsles (invallen)", "TD-03", function () { fresh(); PREF.setup = "team"; S.stacks.today = [{ n: "klass", id: "s5" }]; }, true],
      ["Aanwezigheid les", "CO-05", function () { fresh(); PREF.setup = "team"; var it = findItem("s2").it; it.attDraft = null; S.stacks.today = [{ n: "klass", id: "s2" }, { n: "attendance", id: "s2" }]; }, true],
      ["Nieuw (+)", "TD-05", function () { fresh(); S.sheet = "new"; }],
      ["Nieuwe privésessie", "PS-04", function () { fresh(); A["new-session"](); }, true],
      ["Nieuwe groepsles", "TD-05", function () { fresh(); PREF.role = "owner"; A["new-class"](); }],
      ["Nieuwe klant", "TD-05", function () { fresh(); S.tab = "clients"; A["new-client"](); }],
      ["Sessie verplaatsen", "PS-05", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; A.move({ id: "s3" }); }, true],
      ["Sessie annuleren", "PS-06", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; S.alert = { n: "cancelSession", id: "s3" }; }, true],
      ["Klanten", "TM-02", function () { fresh(); S.tab = "clients"; }],
      ["Klantprofiel", "TM-03", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }]; }, true],
      ["Klantprofiel: schema's", "F042", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }]; S.scrollTo = "tpl"; }, true],
      ["Klantprofiel: nog geen schema's", "F042", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "daan" }]; S.scrollTo = "tpl"; }, true],
      ["Schema toevoegen aan klant", "F042", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }]; S.scrollTo = "tpl"; A["cl-tpl-add"]({ id: "anna" }); }, true],
      ["Schema weghalen bij klant", "F042", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }]; S.scrollTo = "tpl"; S.alert = { n: "tplDrop", t: "Upper A", c: "anna" }; }, true],
      ["Sessie: gelogde training", "F045", function () { fresh(); S.stacks.today = [{ n: "session", id: "s1" }]; }, true],
      ["Training: gedeeld", "F045", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }, { n: "workout", id: "anna", h: "anna-1" }]; }, true],
      ["Training: niet gedeeld", "F045", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }, { n: "workout", id: "anna", h: "anna-3" }]; }, true],
      ["Training wijzigen", "F045", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }, { n: "workout", id: "anna", h: "anna-1" }]; A["wk-edit"]({ id: "anna", h: "anna-1" }); }, true],
      ["Training wijzigen: set verwijderen", "F045", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }, { n: "workout", id: "anna", h: "anna-1" }]; A["wk-edit"]({ id: "anna", h: "anna-1" }); S.alert = { n: "removeSet", e: 0, s: 1 }; }, true],
      ["Training wijzigen: oefening verwijderen", "F045", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }, { n: "workout", id: "anna", h: "anna-1" }]; A["wk-edit"]({ id: "anna", h: "anna-1" }); S.alert = { n: "removeEx", e: 1 }; }, true],
      ["Niet meer delen", "F045", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }, { n: "workout", id: "anna", h: "anna-1" }]; S.alert = { n: "wkUnshare", id: "anna", h: "anna-1" }; }, true],
      ["Training verwijderen: gedeeld", "F045", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }, { n: "workout", id: "anna", h: "anna-1" }]; S.alert = { n: "wkDel", id: "anna", h: "anna-1" }; }, true],
      ["Training verwijderen: niet gedeeld", "F045", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }, { n: "workout", id: "anna", h: "anna-3" }]; S.alert = { n: "wkDel", id: "anna", h: "anna-3" }; }, true],
      ["Notitie", "F046", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }]; A.note({ id: "anna" }); }, true],
      ["Training starten", "WL-01", function () { fresh(); S.stacks.today = [{ n: "session", id: "s6" }]; openLogger("s6", "start"); }, true],
      ["Training loggen", "WL-02", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; A["start-workout"]({ id: "s3" }); }, true],
      ["Oefening toevoegen", "WL-04", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; A["start-workout"]({ id: "s3" }); S.log.step = "add"; }, true],
      ["Training afronden", "WL-05", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; A["start-workout"]({ id: "s3" }); S.log.ex[0].sets.forEach(function (s) { s.done = true; }); S.log.ex[1].sets[0].done = true; S.log.step = "finish"; }, true],
      ["Training delen", "WL-08", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; A["start-workout"]({ id: "s3" }); S.log.ex[0].sets.forEach(function (s) { s.done = true; }); S.log.step = "share"; }, true],
      ["Profiel", "TM-04", function () { fresh(); S.tab = "profile"; }],
      ["Schema's", "TM-05", function () { fresh(); S.tab = "profile"; S.stacks.profile = [{ n: "templates" }]; }],
      ["Schema's: nog geen", "TM-05", function () { fresh(); S.tab = "profile"; S.stacks.profile = [{ n: "templates" }]; Object.keys(D.tpl).forEach(function (k) { delete D.tpl[k]; }); }],
      ["Schema", "TM-06", function () { fresh(); S.tab = "profile"; S.stacks.profile = [{ n: "templates" }, { n: "template", id: "Upper A" }]; }],
      ["Nieuw schema", "TM-07", function () { fresh(); S.tab = "profile"; S.stacks.profile = [{ n: "templates" }]; A["tpl-new"](); }],
      ["Schema wijzigen", "TM-07", function () { fresh(); S.tab = "profile"; S.stacks.profile = [{ n: "templates" }, { n: "template", id: "Upper A" }]; A["tpl-edit"]({ t: "Upper A" }); }],
      ["Oefening toevoegen aan schema", "TM-08", function () { fresh(); S.tab = "profile"; S.stacks.profile = [{ n: "templates" }, { n: "template", id: "Upper A" }]; A["tpl-edit"]({ t: "Upper A" }); S.tplPick = true; }],
      ["Schema verwijderen", "TM-09", function () { fresh(); S.tab = "profile"; S.stacks.profile = [{ n: "templates" }, { n: "template", id: "Core & conditie" }]; S.alert = { n: "tplDel", t: "Core & conditie" }; }],
      ["Schema verwijderen: in gebruik", "F042", function () { fresh(); S.tab = "profile"; S.stacks.profile = [{ n: "templates" }, { n: "template", id: "Upper A" }]; S.alert = { n: "tplDel", t: "Upper A" }; }],
      ["Taal", "F010", function () { fresh(); S.tab = "profile"; S.stacks.profile = [{ n: "language" }]; }]
    ]]
  ];
  function buildPanel() {
    var sw = document.getElementById("sw");
    sw.innerHTML = ACC.map(function (a) { return '<button data-pref="accent" data-v="' + a.k + '" style="--c:' + a.fill + '" title="' + a.n + '" aria-label="' + a.n + '"></button>'; }).join("");
    document.getElementById("idx").innerHTML = INDEX.map(function (g, gi) {
      return "<h3>" + g[0] + "</h3>" + g[1].map(function (x, i) { return '<button data-go="' + gi + "," + i + '"' + (x[2] ? "" : " disabled style=\"opacity:.45;cursor:default\"") + ">" + x[0] + "<span>" + x[1] + "</span></button>"; }).join("");
    }).join("");
    document.getElementById("panel").addEventListener("click", function (e) {
      var b = e.target.closest("[data-pref],[data-go],[data-reset]"); if (!b) return;
      if (b.dataset.pref) { PREF[b.dataset.pref] = b.dataset.v; save(); applyPrefs(); render(); return; }
      if (b.dataset.reset != null) { fresh(); scrollMem = {}; DAYCACHE = {}; DAYCACHE[TODAY] = D.today; render(); return; }
      var p = b.dataset.go.split(","), x = INDEX[+p[0]][1][+p[1]]; if (!x[2]) return;
      if (x[3]) { PREF.setup = "team"; applyPrefs(); }
      if (+p[0] === 0 && (PREF.plat === "web" || PREF.plat === "client")) PREF.plat = "ios";
      if (+p[0] === 0) PREF.app = "pro";
      if (S.log && S.log.timer) clearInterval(S.log.timer);
      scrollMem = {}; x[2](); save(); applyPrefs(); S.anim = null; render();
      if (window.innerWidth <= 640) document.getElementById("panel").classList.remove("open");
    });
    document.getElementById("mfab").addEventListener("click", function () { document.getElementById("panel").classList.toggle("open"); });
  }
  function save() { try { localStorage.setItem("fivvi-proto-v2", JSON.stringify(PREF)); } catch (e) { /* ignore */ } }
  function applyPrefs() {
    var a = ACC.filter(function (x) { return x.k === PREF.accent; })[0] || ACC[0];
    var sc = SETUPS[PREF.setup];
    D.workspaces.sf.name = sc ? sc.name : PREF.setup === "solo" ? "Sarah Personal Training" : "Studio Fit";
    D.workspaces.sf.location = sc ? sc.loc : PREF.setup === "solo" ? "Fitcentrum Zuid" : "Studio Fit, Kerkstraat 12";
    D.locations = sc ? [sc.loc, "Fitcentrum Zuid", "Sportcentrum Oost", "Vondelpark (buiten)"] : PREF.setup === "solo" ? ["Fitcentrum Zuid", "Sportcentrum Oost", "Vondelpark (buiten)", "Bij de klant thuis"] : ["Studio Fit, Kerkstraat 12", "Fitcentrum Zuid", "Sportcentrum Oost", "Vondelpark (buiten)"];
    loadSetup();
    if (SOLO()) S.scope = "me";
    var dark = PREF.mode === "dark" && a.fillD;
    mk.style.setProperty("--accent", dark ? a.fillD : a.fill); mk.style.setProperty("--on-accent", dark ? a.onD : a.on); mk.style.setProperty("--at-l", a.tl); mk.style.setProperty("--at-d", a.td);
    mk.dataset.mode = PREF.mode;
    mk.style.setProperty("--ga", { clear: PREF.mode === "dark" ? 0.22 : 0.25, regular: PREF.mode === "dark" ? 0.55 : 0.6, tinted: PREF.mode === "dark" ? 0.85 : 0.88 }[PREF.glass]);
    mk.style.setProperty("--gb", { clear: "6px", regular: "14px", tinted: "24px" }[PREF.glass]);
    document.documentElement.style.setProperty("--accent", a.fill);
    document.documentElement.lang = PREF.lang === "en" ? "en" : "nl";
    tr(document.getElementById("panel"));
  }
  function syncPanel() {
    document.querySelectorAll("[data-pref]").forEach(function (b) { b.setAttribute("aria-pressed", PREF[b.dataset.pref] === b.dataset.v); });
  }

  /* the trainer web is a 1280 × 800 page, scaled down to fit the stage */
  function fitDev() {
    if (PREF.plat !== "web") { dev.style.zoom = ""; return; }
    var st = dev.parentNode, z = Math.min(1, (st.clientWidth - 32) / 1280, (st.clientHeight - 32) / 800);
    dev.style.zoom = Math.max(0.42, z).toFixed(3);
  }
  window.addEventListener("resize", function () { if (dev) fitDev(); });
  function addClient(c) { D.clients.push(c); CLIENT[c.id] = c; }
  function addItem(k, it) { dayItems(k); DAYCACHE[k].push(it); }
  window.FV = { hist: hist, wkOf: wkOf, exLeft: exLeft, diffBtns: diffBtns, prevHist: prevHist, parseHist: parseHist, fmtHist: fmtHist, wkShare: wkShare, wkUnshare: wkUnshare, wkDelete: wkDelete, dateOnly: dateOnly, mkEx: mkEx, tplCount: tplCount, tplList: tplList, tplOthers: tplOthers, tplAdd: tplAdd, tplDrop: tplDrop, tplUse: tplUse, tplUseLine: tplUseLine, tplPurge: tplPurge, tplRename: tplRename, sessTpl: sessTpl, setSessTpl: setSessTpl, sessLocked: sessLocked, cashText: F_CASHTEXT, agrName: agrName, offerOpts: offerOpts, offerStart: offerStart, saveClassText: saveClassText, PAYST: PAYST, PAYONLINE: PAYONLINE, PAYSTUDIO: PAYSTUDIO, PAYOPEN: PAYOPEN, OFFEROPEN: OFFEROPEN, AGROPEN: AGROPEN, OPENOFFERS: OPENOFFERS, get S() { return S; }, PREF: PREF, D: D, A: A, CLIENT: CLIENT, dayItems: dayItems, findItem: findItem, extra: function () { return EXTRA_WS; },
    cancelDuoPart: cancelDuoPart, CV: CV, TYPE: TYPE, title: title, level: level, lvlTag: lvlTag, esc: esc, ic: ic, mins: mins, hm: hm, key: key, parse: parse, add: add, monday: monday, longDate: longDate, shortDate: shortDate,
    isoWeek: isoWeek, DAYS: DAYS, DS: DS, MONTHS: MONTHS, MS: MS, TODAY: TODAY, NOW: NOW, NOWT: NOWT, isPast: isPast, initials: initials, toast: toast, render: function () { render(); },
    OWNER: OWNER, SOLO: SOLO, HAS: HAS, MIXED: MIXED, WSS: WSS, avatar: avatar, addClient: addClient, addItem: addItem, INDEX: INDEX, SHEETS: SHEETS, SCREENS: SCREENS, kit: { fld: fld, inp: inp, sel: sel, row: row, grp: grp, sh: sh, lt: lt, btn: btn, seg: seg, foot: foot, avatar: avatar, rings: rings, shape: shape, SHAPE: SHAPE }, fresh: function () { fresh(); }, save: function () { save(); applyPrefs(); } };

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    dev = document.getElementById("dev"); mk = document.getElementById("mk");
    buildPanel(); applyPrefs(); render();
    dev.addEventListener("click", onClick);
    dev.addEventListener("input", onInput);
    dev.addEventListener("change", onChange);
    dev.addEventListener("scroll", onScroll, true);
    dev.addEventListener("pointerdown", onDgDown);
    dev.addEventListener("pointermove", onDgMove);
    dev.addEventListener("pointerup", onDgUp);
    dev.addEventListener("pointercancel", onDgUp);
    dev.addEventListener("pointerdown", onSwDown);
    dev.addEventListener("pointermove", onSwMove);
    dev.addEventListener("pointerup", onSwUp);
    dev.addEventListener("pointercancel", onSwUp);
    dev.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.getAttribute("role") === "button") { e.preventDefault(); e.target.click(); } });
    setInterval(function () {
      if (S.log) dev.querySelectorAll("[data-timer]").forEach(function (t) { t.textContent = elapsed(); });
      dev.querySelectorAll("[data-run]").forEach(function (t) { var L = S.logs[t.dataset.run]; if (L) t.textContent = elapsedOf(L); });
    }, 1000);
  });
})();
