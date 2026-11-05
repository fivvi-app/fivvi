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
  function CFG() { return SETUPS[PREF.setup] || (PREF.setup === "solo" ? { team: false, multiWs: false, types: ["priv"] } : { team: true, multiWs: true, types: ["priv", "group", "gym"] }); }
  function SOLO() { return !CFG().team; }
  function OWNER() { return SOLO() || PREF.role === "owner"; }
  function HAS(t) { return CFG().types.indexOf(t) >= 0; }
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
    DAYCACHE = {}; DAYCACHE[TODAY] = D.today; S.logs = {}; S.scope = "me";
  }
  function findItem(id) {
    for (var k in DAYCACHE) { for (var i = 0; i < DAYCACHE[k].length; i++) if (DAYCACHE[k][i].id === id) return { it: DAYCACHE[k][i], day: k }; }
    for (var j = 0; j < EXTRA_WS.length; j++) if (EXTRA_WS[j].id === id) return { it: EXTRA_WS[j], day: TODAY };
    return null;
  }
  var CV = { priv: "var(--priv)", group: "var(--group)", gym: "var(--gym)" };
  var TYPE = { priv: "Privésessie", group: "Groepsles", gym: "Open Gym" };
  function title(it) { return it.type === "priv" ? CLIENT[it.client].name : it.title; }
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
  var PREF = { setup: "team", lang: "nl", plat: "ios", mode: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light", accent: "pink", glass: "regular", role: "owner" };
  try { var saved = JSON.parse(localStorage.getItem("fivvi-proto-v2") || "{}"); for (var pk in saved) if (pk in PREF) PREF[pk] = saved[pk]; } catch (e) { /* storage unavailable */ }
  var S;
  function fresh() {
    S = { signedIn: true, signStep: "email", email: "", code: "", tab: "today", stacks: { today: [], agenda: [], clients: [], profile: [] },
      sheet: null, alert: null, menu: null, toast: null, anim: null, scope: "me", aview: "week", aday: TODAY, q: "", exq: "",
      log: null, logs: {}, form: {}, err: {}, tabMin: false, showAll: {}, showDesc: {}, preview: false, scrollBottom: false };
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
    var sub = it.type === "priv" ? (tl ? tl + " · " : "") + esc(it.loc) : PREF.plat === "ios" || it.cancelled ? (tl || esc(it.loc.split(",")[0])) : (tl ? tl + " · " : "") + (full ? "Vol" : booked + "/" + it.cap + " geboekt");
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
    var o = { a: it.type === "priv" ? "open-session" : "open-class", d: { id: it.id }, title: esc(title(it)), sub: sub, small: smalls.join(" · "), extra: extra,
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
    var h = (D.history[cid] || [])[0];
    if (!h || !h.sets) return sh("Vorige keer", "", "small") + '<div class="pad"><div class="grp"><div class="row"><div class="m"><span>Nog geen eerdere training</span></div></div></div></div>';
    var hard = h.sets.filter(function (x) { return x[2] === "h"; }).map(function (x) { return x[0]; });
    var rows = h.sets.map(function (x) { return row({ title: esc(x[0]), sub: esc(x[1]), tr: diffTag(x[2]), cls: "kv" }); });
    if (h.note) rows.push(row({ lead: '<span class="dc-ic" style="--c:#8E8E93">' + ic("note") + "</span>", title: '<span translate="no">' + esc(h.note) + "</span>", small: "Notitie van " + esc(h.by) + " · alleen voor trainers", cls: "wrap dc" }));
    return sh("Vorige keer · " + h.d, '<button data-a="open-workout" data-id="' + cid + '" data-i="0">Details</button>', "small") +
      '<div class="pad"><p class="lastsum">' + esc(h.name) + (h.dur ? " · " + h.dur : "") + " · " + h.n + " oefeningen" + (hard.length ? ' · <span class="hard">' + diffTag("h") + "<span>Zwaar: " + hard.map(esc).join(", ") + "</span></span>" : "") + "</p>" + grp(rows) + "</div>";
  }
  function progressList(cid) {
    var L = D.lifts[cid], wk = D.weeks[cid]; if (!L && !wk) return "";
    var rows = (L || []).map(function (l) { var v = l[1], d = v[v.length - 1] - v[0]; return row({ title: esc(l[0]), sub: (d > 0 ? "+" : "") + nl(d) + " kg in 8 weken", tr: D.spark(v, "var(--accent)") + '<b class="num lift-n">' + nl(v[v.length - 1]) + "<small> kg</small></b>", cls: "kv" }); });
    if (wk) rows.push(row({ title: "Getraind", sub: wk.filter(function (x) { return x; }).length + " van de 8 weken", tr: '<span class="wkdots" aria-hidden="true">' + wk.map(function (x) { return '<i class="' + (x ? "on" : "") + '"></i>'; }).join("") + "</span>", cls: "kv" }));
    return sh("Voortgang", "", "small") + '<div class="pad">' + grp(rows) + "</div>";
  }
  function lastDiff(cid, name) { var h = (D.history[cid] || [])[0], x = h && h.sets && h.sets.filter(function (y) { return y[0] === name; })[0]; return x && x[2] ? " · vorige keer " + D.DIFF[x[2]][0] : ""; }

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
        (next.workout ? '<p style="margin-top:2px">Schema: ' + esc(next.workout) + "</p>" : "") +
        '<div class="acts">' + (next.type === "priv" ? '<button class="gl glass" data-a="start-workout" data-id="' + next.id + '">' + ic("play") + (S.logs[next.id] ? "Doorgaan met training" : "Training starten") + "</button>" : "") +
        '<button class="gl glass' + (next.type === "priv" ? " ic" : "") + '" data-a="' + (next.type === "priv" ? "open-session" : "open-class") + '" data-id="' + next.id + '" aria-label="Openen">' + (next.type === "priv" ? ic("chevR") : "Openen") + "</button></div></div>";
    }
    body += "</div>";
    var rest = items.filter(function (i) { return !next || i.id !== next.id; });
    body += sh("Vandaag", '<button data-a="tab" data-v="agenda">Agenda</button>');
    body += '<div class="pad">' + (rest.length ? grp(rest.map(function (i) { return itemRow(i, TODAY, { hideWs: ws, who: ws }); }), "--inset:94px") : '<div class="empty">Geen sessies vandaag.</div>') + "</div>";
    var tom = dayItems(key(add(NOW, 1)));
    body += '<div class="pad" style="margin-top:12px">' + grp([row({ a: "agenda-day", d: { k: key(add(NOW, 1)) }, title: "Morgen", sub: tom.length + " sessies, eerste om " + tom[0].s, lead: PREF.plat === "ios" ? "" : "" })]) + "</div>";
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
      if (i.type === "priv" && i.wstate === "done" && !i.shared) todo.push('<button class="chip" data-a="open-session" data-id="' + i.id + '">Training delen · ' + esc(who_) + "</button>");
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
      bs.abos.forEach(function (a) { brows.push(row({ lead: '<span class="dc-ic" style="--c:var(--group)">' + ic("group") + "</span>", title: esc(a.name), sub: "Deze week " + a.usedWeek + " van " + a.perWeek + " gebruikt" + (a.makeups ? " · " + a.makeups + (a.makeups === 1 ? " inhaalles" : " inhaallessen") : "") + (a.status === "ending" ? " · " + esc(a.period) : ""), cls: "dc wrap" })); });
      bs.balances.forEach(function (x) {
        var t = Math.max(1, x.total);
        brows.push(row({ lead: '<span class="dc-ic" style="--c:' + x.label[2] + '">' + ic(x.credit === "gym" ? "door" : x.credit === "groep" ? "group" : "me") + "</span>", title: x.label[1].charAt(0).toUpperCase() + x.label[1].slice(1), sub: x.used + " gebruikt · " + x.planned + " gepland · van " + x.total,
          tr: '<span class="bal-n" style="--c:' + x.label[2] + '"><b class="num">' + x.left + "</b> over</span>", extra: '<div class="abar" style="--c:' + x.label[2] + '"><i style="width:' + (x.used / t * 100) + '%"></i><i class="p" style="width:' + (x.planned / t * 100) + '%"></i></div>', cls: "dc" }));
      });
      bs.flags.filter(function (f) { return f[0] === "warn" && f[1].indexOf("Abonnement") !== 0; }).forEach(function (f) { brows.push(row({ lead: '<span class="dc-ic" style="--c:var(--gym)">' + ic("warn") + "</span>", title: esc(f[1]), cls: "dc" })); });
      if (!brows.length) brows.push(row({ title: "Geen abonnement of credits", sub: OWNER() ? "Stuur een aanbod vanaf het web." : "" }));
      body += sh("Tegoed", "", "small") + '<div class="pad">' + grp(brows, "--inset:60px") + "</div>" + (OWNER() ? foot("Betalingen en facturen vind je op het web.") : "");
    }
    body += lastTime(c.id) + progressList(c.id);
    body += sh("Gegevens", "", "small") + '<div class="pad">' + grp([row({ title: "E-mail", tr: c.email ? esc(c.email) : "Nog niet ingevuld", cls: "kv" }), row({ title: "Taal voor e-mails", tr: esc(c.lang), cls: "kv" }), row({ title: "Werkruimte", tr: wsLine(c.ws), cls: "kv" })]) + "</div>";
    body += sh("Notities", '<button data-a="note" data-id="' + c.id + '">+ Notitie</button>', "small");
    body += '<div class="pad">' + (notes.length ? grp(notes.map(function (n) { return row({ title: '<span translate="no">' + esc(n.t) + "</span>", small: n.d + " · " + esc(n.by), cls: "wrap" }); })) : '<div class="grp"><div class="row"><div class="m"><span>Nog geen notities.</span></div></div></div>') + "</div>" + foot("Alleen trainers van " + D.workspaces[c.ws].name + " zien notities.");
    body += sh("Trainingen", "", "small");
    body += '<div class="pad">' + (hist.length ? grp(hist.map(function (h, i) { return row({ a: "open-workout", d: { id: c.id, i: i }, title: esc(h.name), sub: h.d + " · " + h.n + " oefeningen · " + esc(h.by) }); })) : '<div class="grp"><div class="row"><div class="m"><span>Nog geen trainingen.</span></div></div></div>') + "</div>";
    return { title: c.name, inline: true, body: body, trailing: [{ i: "pencil", a: "web-only", label: "Bewerken" }] };
  };

  SCREENS.workout = function (r) {
    var c = CLIENT[r.id], h = D.history[r.id][r.i];
    var sets = h.sets || [["Squat", "60 kg × 8, 8, 8"], ["Bankdrukken", "57,5 kg × 8, 8, 6"], ["Plank", "0:45 × 3"]];
    var body = lt(h.d + " · " + esc(h.by), esc(h.name), esc(c.name));
    body += '<div class="pad">' + grp(sets.map(function (s) { return row({ title: esc(s[0]), sub: esc(s[1]), tr: diffTag(s[2]) }); })) + "</div>";
    if (h.note) body += sh("Notitie", "", "small") + '<div class="pad">' + grp([row({ title: '<span translate="no">' + esc(h.note) + "</span>", small: esc(h.by) + " · alleen voor trainers", cls: "wrap" })]) + "</div>";
    body += '<div class="pad" style="margin-top:16px">' + btn("Delen met " + c.name.split(" ")[0], { k: "sec", blk: true, a: "toast", d: { m: "Gedeeld met " + c.name.split(" ")[0] }, i: "share" }) + "</div>";
    return { title: h.name, body: body };
  };

  SCREENS.session = function (r) {
    var f = findItem(r.id), it = f.it, k = f.day, c = CLIENT[it.client], d = parse(k);
    var body = "";
    if (it.cancelled) body += '<div class="pad" style="margin-bottom:12px"><div class="banner" style="--c:var(--danger)">' + ic("warn") + "Deze sessie is geannuleerd.</div></div>";
    body += lt("", esc(c.name), longDate(d) + " · " + it.s + "–" + it.e);
    /* before the session: is there a private credit for it, and is a payment open (owner only) */
    var sb = D.bsum(it.client), pb = sb.balances.filter(function (x) { return x.credit === "prive"; })[0], first = c.name.split(" ")[0], bn = [];
    if (OWNER() && sb.open.length) bn.push(["var(--danger)", "Openstaande betaling " + sb.open[0].open + " · " + sb.open[0].name]);
    if (!it.cancelled && it.ws === "sf" && D.billing[it.client]) bn.push(!pb ? ["var(--gym)", first + " heeft geen privécredits"] : pb.left <= 0 ? ["var(--gym)", "Laatste privécredit van " + first + ". Daarna zijn ze op."] : ["var(--priv)", "Nog " + pb.left + " " + (pb.left === 1 ? "privécredit" : "privécredits") + " over na de geplande sessies"]);
    if (bn.length) body += '<div class="pad stack" style="margin-bottom:12px">' + bn.map(function (x) { return '<div class="banner" style="--c:' + x[0] + '">' + ic(x[0] === "var(--priv)" ? "info" : "warn") + esc(x[1]) + "</div>"; }).join("") + "</div>";
    body += '<div class="pad stack">' + grp([
      row({ lead: '<span style="color:var(--priv);display:grid">' + ic("pin") + "</span>", title: esc(it.loc), tr: '<button class="btn ghost sm" data-a="toast" data-m="Opent de route in Kaarten">' + ic("route") + "Route</button>", cls: "kv" }),
      row({ lead: '<span style="color:var(--label2);display:grid">' + ic("people") + "</span>", title: D.workspaces[it.ws].name, sub: it.trainer ? esc(it.trainer) : "Jij", cls: "kv" })
    ]);
    var ws = it.wstate, tpl = it.workout;
    var tcard = '<div class="card"><div style="display:flex;gap:12px;align-items:center;margin-bottom:14px"><span class="av" style="--c:var(--priv);border-radius:14px">' + ic("dumb") + '</span><div><b style="display:block">' + (tpl ? esc(tpl) : "Nog geen schema") + '</b><span style="font-size:15px;color:var(--label2)">' + (ws === "done" ? "Afgerond · 6 oefeningen · 52 min" : ws === "running" ? "Bezig · gestart om " + it.s : tpl ? "5 oefeningen" : "Kies een schema of begin leeg") + "</span></div></div>" +
      (ws === "done" ? '<div class="btns">' + btn("Bekijken", { k: "sec", a: "open-workout", d: { id: it.client, i: 0 } }) + (it.shared ? btn("Gedeeld", { k: "sec", dis: true, i: "check" }) : btn("Delen met " + esc(c.name.split(" ")[0]), { a: "share-item", d: { id: it.id }, i: "share" })) + "</div>" : btn(ws === "running" ? "Doorgaan met training" : "Training starten", { blk: true, a: "start-workout", d: { id: it.id }, i: "play", dis: it.cancelled })) + "</div>";
    body += sh("Training", "", "small") + tcard + "</div>";
    body += lastTime(it.client) + progressList(it.client);
    var notes = D.notes[it.client] || [];
    body += sh("Notities", '<button data-a="note" data-id="' + c.id + '">+ Notitie</button>', "small");
    body += '<div class="pad">' + (notes.length ? grp(notes.slice(0, 3).map(function (n) { return row({ title: '<span translate="no">' + esc(n.t) + "</span>", small: n.d + " · " + esc(n.by), cls: "wrap" }); })) : '<div class="grp"><div class="row"><div class="m"><span>Nog geen notities.</span></div></div></div>') + "</div>" + foot("Alleen voor trainers. Notities zie je nooit in meldingen of widgets.");
    var can = started(it, k) && !it.cancelled;
    body += sh("Aanwezigheid", "", "small") + '<div class="pad">' + seg([["", "Geboekt", !can], ["yes", "Aanwezig", !can], ["no", "Niet verschenen", !can]], it.att || "", "satt", { id: it.id }) + "</div>" + (can ? "" : foot(it.cancelled ? "Geannuleerd." : "Vanaf " + it.s + "."));
    return { title: c.name, body: body, trailing: [{ i: "more", a: "session-menu", label: "Meer", d: { id: it.id } }] };
  };

  SCREENS.klass = function (r) {
    var f = findItem(r.id), it = f.it, k = f.day, d = parse(k), booked = it.people.length, free = it.cap - booked;
    var body = "";
    if (it.cancelled) body += '<div class="pad" style="margin-bottom:12px"><div class="banner" style="--c:var(--danger)">' + ic("warn") + "Deze les is geannuleerd. Geboekte klanten hebben een e-mail gekregen.</div></div>";
    body += lt(TYPE[it.type], esc(it.title), longDate(d) + " · " + it.s + "–" + it.e);
    body += '<div class="pad stack">';
    var ds = it.desc || D.descriptions[it.title];
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
    body += sh("Instellingen", "", "small") + '<div class="pad">' + grp([row({ a: "push", d: { n: "language" }, lead: '<span style="color:var(--label2);display:grid">' + ic("globe") + "</span>", title: "Taal", tr: '<span translate="no">' + (PREF.lang === "en" ? "English" : "Nederlands") + "</span>" })]) + "</div>";
    body += sh("Werkruimtes", "", "small") + '<div class="pad">' + grp(WSS().map(function (w) { var x = D.workspaces[w]; return row({ lead: '<span class="av" style="--c:' + x.color + ';border-radius:12px;width:36px;height:36px;font-size:13px">' + initials(x.name) + "</span>", title: x.name, tr: w === "sf" ? (OWNER() ? "Eigenaar" : "Trainer") : "Trainer" }); })) + "</div>" + (WSS().length > 1 ? foot("Vandaag en Agenda tonen je sessies van alle werkruimtes samen.") : "");
    body += '<div class="pad" style="margin-top:16px">' + grp([
      row({ a: "toast", d: { m: "Opent Fivvi op het web" }, lead: '<span style="color:var(--label2);display:grid">' + ic("ext") + "</span>", title: "Beheer op het web", chev: false }),
      row({ a: "toast", d: { m: "Opent het feedbackformulier" }, lead: '<span style="color:var(--label2);display:grid">' + ic("chat") + "</span>", title: "Feedback geven", chev: false })
    ]) + "</div>";
    body += '<div class="pad" style="margin-top:16px">' + grp([
      row({ a: "alert", d: { n: "signout" }, title: '<span style="color:var(--accent-text)">Uitloggen</span>', chev: false }),
      row({ a: "alert", d: { n: "delete" }, title: '<span style="color:var(--danger)">Account verwijderen</span>', chev: false })
    ]) + "</div>" + foot("Fivvi Pro · prototype v2 · fictieve gegevens");
    return { large: true, title: "Profiel", body: body };
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
      body = '<div style="padding:40px 24px 0;text-align:center"><div class="appicon">F</div><h1 style="font-size:28px;margin:22px 0 6px">Inloggen bij Fivvi Pro</h1><p style="color:var(--label2);margin:0 0 26px;font-size:16px">Vul je e-mailadres in. We sturen je een code van 6 cijfers.</p></div>' +
        '<div class="pad stack"><div class="fgrp">' + fld("E-mail", '<input data-in="email" type="email" autocomplete="email" placeholder="naam@voorbeeld.nl" value="' + esc(S.email) + '">') + "</div>" + btn("Doorgaan", { blk: true, a: "sign-next" }) + "</div>" + foot("Nog geen account? Je eigenaar nodigt je uit, of je maakt een werkruimte aan op het web.");
    } else {
      var digits = (S.code + "      ").slice(0, 6).split("");
      body = '<div style="padding:40px 24px 0;text-align:center"><div class="appicon" style="width:64px;height:64px;font-size:30px;border-radius:17px">F</div><h1 style="font-size:28px;margin:22px 0 6px">Check je e-mail</h1><p style="color:var(--label2);margin:0 0 20px;font-size:16px">We hebben een code gestuurd naar <b style="color:var(--label)">' + esc(S.email || D.me.email) + "</b>.</p></div>" +
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
    items.push(["new-client", "", "Klant", "Naam en e-mailadres. De klant krijgt een uitnodiging om in te loggen."]);
    var icons = { priv: "me", group: "group", gym: "door", "": "personPlus" };
    var body = grp(items.map(function (x) { return row({ a: x[0], lead: '<span class="av" style="--c:' + (x[1] ? CV[x[1]] : "var(--accent)") + ';border-radius:14px">' + ic(icons[x[1]]) + "</span>", title: x[2], sub: x[3], cls: "wrap" }); }), "--inset:68px");
    if (!SOLO()) body += foot(OWNER() ? "Groepslessen en Open Gym van John's Gym plant de eigenaar." : "Groepslessen en Open Gym van Studio Fit en John's Gym plant de eigenaar.");
    return { title: "Nieuw", small: true, body: body };
  };
  SHEETS.newSession = function () {
    var cs = D.clients.filter(function (c) { return c.ws === "sf"; });
    var body = '<div class="fgrp">' + fld("Klant", sel("client", cs.map(function (c) { return [c.id, c.name]; }))) + "</div>";
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Datum", inp("date", "date")) + fld("Begin", inp("start", "time")) + "</div>";
    body += '<div style="margin:16px 0 6px;font-size:13px;color:var(--label2);padding-left:4px">Duur</div>' + seg([["30", "30 min"], ["45", "45 min"], ["60", "1 uur"], ["90", "1,5 uur"]], String(S.form.dur), "fset", { f: "dur" });
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Locatie", sel("loc", D.locations)) + "</div>";
    body += foot("Fivvi stelt de locatie van de vorige sessie met deze klant voor.");
    return { title: "Nieuwe privésessie", body: body, save: "save-session" };
  };
  SHEETS.newClient = function () {
    var body = '<div class="fgrp">' + fld("Naam", inp("name", "text", "Voor- en achternaam", " autocomplete=\"off\"")) + fld("E-mail", inp("email", "email", "naam@voorbeeld.nl")) + "</div>";
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Taal voor e-mails", sel("lang", ["Nederlands", "English"])) + (WSS().length > 1 ? fld("Werkruimte", sel("ws", WSS().map(function (w) { return [w, D.workspaces[w].name]; }))) : "") + "</div>";
    body += foot("De klant krijgt een e-mail met een uitnodiging om in te loggen.");
    return { title: "Nieuwe klant", body: body, save: "save-client" };
  };
  SHEETS.newClass = function () {
    var body = '<div class="fgrp">' + fld("Naam", inp("name", "text", "Bijvoorbeeld Strength")) + "</div>";
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Datum", inp("date", "date")) + fld("Begin", inp("start", "time")) + fld("Eind", inp("end", "time")) + fld("Capaciteit", inp("cap", "number", "", ' inputmode="numeric" min="1"')) + "</div>";
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Trainer", sel("trainer", D.trainers.sf.concat(["Trainer nodig"]))) + fld("Herhalen", sel("rep", ["Niet herhalen", "Elke week op " + DAYS[parse(S.form.date || TODAY).getDay()]])) + "</div>";
    body += '<div class="fgrp" style="margin-top:16px">' + fld("Beschrijving", '<textarea data-f="desc" rows="3" placeholder="Wat doe je in deze les? Dit zien klanten op je boekingspagina.">' + esc(S.form.desc || "") + "</textarea>", "stack") +
      fld("Beschrijving in het Engels", '<textarea data-f="descEn" rows="3" placeholder="Optioneel">' + esc(S.form.descEn || "") + "</textarea>", "stack") + "</div>";
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
  function exList() {
    var q = norm(S.exq.trim()), inLog = (S.log ? S.log.ex : []).map(function (e) { return e.name; });
    var lib = D.library.filter(function (e) { return !q || norm(e.n).indexOf(q) >= 0 || norm(e.en).indexOf(q) >= 0; });
    var TY = { wr: "", r: "Alleen herhalingen", t: "Tijd", dt: "Afstand + tijd" };
    function exRow(e) { var dis = inLog.indexOf(e.n) >= 0; return row({ a: dis ? "" : "add-ex", d: { n: e.n }, title: esc(e.n), sub: "ook: " + esc(e.en) + " · " + esc(e.mu) + (TY[e.ty] ? " · " + TY[e.ty] : ""), cls: dis ? "past" : "", tr: dis ? "In training" : "" }); }
    var out = grp([row({ a: "add-ex-new", lead: '<span style="color:var(--accent-text);display:grid">' + ic("plus") + "</span>", title: '<span style="color:var(--accent-text)">Nieuwe oefening' + (q ? " “" + esc(S.exq) + "” aanmaken" : "") + "</span>" })]);
    if (!q) out += sh("Recent bij " + (S.log ? CLIENT[S.log.client].name.split(" ")[0] : ""), "", "small") + grp(D.library.slice(0, 3).map(exRow));
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
  function tplEx(name) {
    if (name === "Upper A") return D.upperA().map(function (e) { return { name: e.name, ty: e.ty, target: e.target, prev: e.prev, sets: e.sets.map(function (v) { return { v: v.slice(), done: false }; }), diff: "n" }; });
    return ["Squat", "Bankdrukken", "Kabel roeien", "Plank"].map(function (n) { var e = mkEx(D.library.filter(function (l) { return l.n === n; })[0]); e.sets.push({ v: e.sets[0].v.slice(), done: false }, { v: e.sets[0].v.slice(), done: false }); e.target = "Doel: 3 × " + (e.ty === "t" ? "0:30" : "10"); return e; });
  }
  function openLogger(itemId, step, tpl) {
    var it = findItem(itemId).it;
    if (S.logs[itemId]) { S.log = S.logs[itemId]; S.log.step = "log"; }
    else {
      S.log = { item: itemId, client: it.client, step: step, tpl: tpl || null, ex: tpl ? tplEx(tpl) : [], start: Date.now(), changed: false, note: "", saveTpl: false, tplName: "", msg: "" };
    }
    S.anim = "up"; render();
  }
  function fmtSet(e, s) { var v = s.v; return e.ty === "wr" ? v[0] + " kg × " + v[1] : e.ty === "r" ? v[0] + " herh." : e.ty === "t" ? v[0] + ":" + pad2(v[1]) : v[0] + " m · " + v[1] + ":" + pad2(v[2]); }
  function elapsed() { return elapsedOf(S.log); }
  function elapsedOf(L) { var s = Math.floor((Date.now() - L.start) / 1000); return Math.floor(s / 60) + ":" + pad2(s % 60); }

  function loggerHTML() {
    var L = S.log, c = CLIENT[L.client], it = findItem(L.item).it, first = c.name.split(" ")[0], ios = PREF.plat === "ios";
    var body = "", nav = "";
    if (L.step === "start") {
      nav = barHTML("Training starten", { left: { t: "Annuleren", a: "log-close-cancel" } });
      body += '<div class="pad" style="color:var(--label2);font-size:15px;margin-bottom:12px">' + esc(c.name) + " · " + it.s + "</div>";
      body += '<div class="pad">' + grp([
        row({ a: "log-pick", d: { t: "" }, lead: '<span class="av" style="--c:var(--accent);border-radius:14px">' + ic("plus") + "</span>", title: "Lege training", sub: "Begin zonder schema en voeg oefeningen toe terwijl je traint.", cls: "wrap" }),
        row({ a: "log-pick", d: { t: "Upper A" }, lead: '<span class="av" style="--c:var(--priv);border-radius:14px">' + ic("repeat") + "</span>", title: "Vorige training herhalen", sub: "Upper A · 29 okt · 5 oefeningen", cls: "wrap" })
      ], "--inset:68px") + "</div>";
      body += sh("Schema's van " + first, "", "small") + '<div class="pad">' + grp((D.templates[c.id] || []).map(function (t) { return row({ a: "log-pick", d: { t: t }, title: t }); })) + "</div>";
      body += sh("Andere schema's", "", "small") + '<div class="pad">' + grp(D.templates.other.map(function (t) { return row({ a: "log-pick", d: { t: t }, title: t }); })) + "</div>";
    } else if ((L.step === "log" || L.step === "add") && L.reorder) {
      nav = barHTML("Volgorde", { right: { t: "Klaar", a: "ex-reorder-done", prom: true } });
      body += '<div class="pad"><p class="ro-hint">Sleep aan ≡ om de volgorde te wijzigen.</p><div class="grp ro">' + L.ex.map(function (e, i) {
        return '<div class="row ro-row"><span class="ro-no">' + (i + 1) + '</span><div class="m"><b>' + esc(e.name) + "</b><span>" + e.sets.length + (e.sets.length === 1 ? " set" : " sets") + '</span></div><button class="grip" data-drag="ex" data-i="' + i + '" aria-label="' + esc(e.name) + ' verplaatsen">' + ic("grip") + "</button></div>";
      }).join("") + "</div></div>";
    } else if (L.step === "log" || L.step === "add") {
      nav = barHTML(first + " · " + (L.tpl || "Training"), { left: { t: "Sluiten", a: "log-close" }, right: { t: "Afronden", a: "log-finish", prom: true }, timer: true });
      var doneSets = 0; L.ex.forEach(function (e) { e.sets.forEach(function (s) { if (s.done) doneSets++; }); });
      body += '<div class="pad" style="display:flex;justify-content:space-between;font-size:15px;color:var(--label2);margin-bottom:12px"><span>' + L.ex.length + " oefeningen · " + doneSets + (doneSets === 1 ? " set" : " sets") + ' klaar</span><span style="color:var(--ok);display:flex;gap:4px;align-items:center">' + ic("check") + "Opgeslagen</span></div>";
      if (!L.ex.length) body += '<div class="pad"><div class="card" style="text-align:center;padding:28px 20px"><b style="display:block;font-size:19px;margin-bottom:6px">Nog geen oefeningen</b><span style="color:var(--label2);font-size:15px">Voeg de eerste oefening toe. Wat ' + esc(first) + " eerder deed, staat bovenaan.</span></div></div>";
      body += '<div class="pad stack">' + L.ex.map(function (e, ei) {
        var d = e.sets.filter(function (s) { return s.done; }).length, all = d === e.sets.length;
        var h = '<div class="lg-ex"><div class="lg-h"><span class="no ' + (all ? "done" : "") + '">' + (all ? ic("check") : ei + 1) + '</span><div class="m" style="flex:1;min-width:0"><b>' + esc(e.name) + "</b><span>" + (e.target ? esc(e.target) + " · " : "") + (e.prev.length ? "Vorige: 29 okt" + lastDiff(L.client, e.name) : "Nog geen eerdere training") + '</span></div><span class="pr">' + d + "/" + e.sets.length + '</span><button class="x" data-a="ex-menu" data-e="' + ei + '" aria-label="Opties voor ' + esc(e.name) + '">' + ic("more") + "</button></div>";
        /* one compact row per set: Set | Vorige | today's fields | tick; column labels once per exercise */
        var lay = LAYOUT[e.ty];
        h += '<div class="lg-cols" aria-hidden="true"><span>Set</span><span>Vorige</span><span class="vals">' + lay.head.map(function (x) { return '<span class="' + x[1] + '">' + x[0] + "</span>"; }).join("") + "</span><span></span></div>";
        h += e.sets.map(function (s, si) {
          var vals = lay.inp.map(function (fd) { return '<input class="' + fd[2] + '" inputmode="' + fd[1] + '" value="' + esc(s.v[fd[0]]) + '" data-ls="' + ei + "," + si + "," + fd[0] + '" aria-label="' + esc(e.name) + ", set " + (si + 1) + ", " + fd[4] + '"' + (s.done ? " readonly" : "") + ">" + (fd[3] ? '<span class="sep">' + fd[3] + "</span>" : ""); }).join("");
          var canRemove = !s.done && e.sets.length > 1;
          return '<div class="sw-row' + (canRemove ? " can" : "") + '" data-e="' + ei + '" data-s="' + si + '">' + (canRemove ? '<button class="sw-del" data-a="set-remove-ask" data-e="' + ei + '" data-s="' + si + '" tabindex="-1">Verwijderen</button>' : "") +
            '<div class="set c ' + (s.done ? "done" : "") + '">' + '<button class="sn" data-a="set-menu" data-drag="set" data-e="' + ei + '" data-s="' + si + '" aria-label="Set ' + (si + 1) + ': verplaatsen of verwijderen">' + (si + 1) + "</button>" +
            '<span class="pv">' + (e.prev[si] ? esc(e.prev[si]) : "–") + '</span><span class="vals">' + vals + '</span><button class="tick ' + (s.done ? "on" : "") + '" data-a="tick" data-e="' + ei + '" data-s="' + si + '" aria-label="' + esc(e.name) + ", set " + (si + 1) + (s.done ? " weer openzetten" : " klaar") + '">' + ic("check") + "</button></div></div>";
        }).join("");
        h += '<div class="lg-f">' + btn("Set", { k: "ghost", sm: true, a: "set-add", d: { e: ei }, i: "plus" }) + '<div class="diff" role="group" aria-label="Hoe ging het?">' + [["e", "😌", "Makkelijk"], ["n", "🙂", "Normaal"], ["h", "🥵", "Zwaar"]].map(function (x) { return '<button class="' + (e.diff === x[0] ? "on" : "") + '" data-a="diff" data-e="' + ei + '" data-v="' + x[0] + '" aria-label="' + x[2] + '" aria-pressed="' + (e.diff === x[0]) + '" title="' + x[2] + '"><span aria-hidden="true">' + x[1] + "</span></button>"; }).join("") + '<button class="info" data-a="info" data-n="diff" aria-label="Wat betekent dit?">' + ic("info") + "</button></div></div></div>";
        return h;
      }).join("") + btn("Oefening toevoegen", { k: "sec", blk: true, a: "ex-add", i: "plus" }) + "</div>";
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
      body += '<div style="text-align:center;padding:10px 24px 20px"><span style="width:84px;height:84px;border-radius:50%;margin:0 auto 16px;display:grid;place-items:center;color:#fff;background:linear-gradient(160deg,color-mix(in oklab,var(--ok) 70%,#fff),var(--ok))">' + ic("check").replace('class=""', 'style="width:44px;height:44px"') + '</span><h1 style="font-size:28px;margin:0 0 6px">Training opgeslagen</h1><p style="color:var(--label2);margin:0;font-size:16px">Training delen met ' + esc(first) + "? " + esc(first) + " ziet het overzicht in haar profiel en krijgt een e-mail.</p></div>";
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
      return '<div class="nb' + (p.inline ? "" : "") + '">' + L + '<span class="sp"></span>' + caps + '<div class="t">' + esc(p.title) + "</div></div>";
    }
    var A = prev ? '<button class="ib" data-a="back" aria-label="Terug">' + ic("back") + "</button>" : "";
    var acts = trailing.map(function (t) { return '<button class="ib" data-a="' + t.a + '"' + dattrs(t.d) + ' aria-label="' + esc(t.label || t.t) + '">' + ic(t.i === "more" ? "moreV" : t.i) + "</button>"; }).join("");
    if (p.save) acts += btn("Opslaan", { k: "ghost", sm: true, a: p.save.a, d: p.save.d });
    return '<div class="ab ' + (p.large ? "root" : "") + '">' + A + '<div class="t">' + esc(p.title) + "</div>" + acts + "</div>";
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
    return '<div class="scrim anim-fade" data-a="' + closeA + '"></div><div class="sheet ' + (large ? "large" : "") + (S.anim === "up" || S.anim === "sheet" ? " anim-up" : "") + '" role="dialog" aria-label="' + esc(sh_.title) + '"><div class="grab"></div>' + bar + '<div class="sbody">' + sh_.body + "</div></div>";
  }

  var ALERTS = {
    signout: function () { return { t: "Uitloggen?", p: "Je kunt altijd weer inloggen met je e-mailadres.", b: [["Uitloggen", "do-signout", "pri"], ["Annuleren", "close-alert", "sec"]] }; },
    "delete": function () { return { t: "Account verwijderen?", p: "Je account en je gegevens worden verwijderd. Werkruimtes waar je eigenaar bent, draag je eerst over op het web.", b: [["Verwijderen", "do-delete", "dng"], ["Annuleren", "close-alert", "sec"]] }; },
    cancelSession: function (d) { var it = findItem(d.id).it; return { t: "Sessie annuleren?", p: CLIENT[it.client].name.split(" ")[0] + " krijgt een e-mail dat de sessie van " + it.s + " niet doorgaat.", b: [["Sessie annuleren", "do-cancel", "dng"], ["Terug", "close-alert", "sec"]] }; },
    cancelClass: function (d) { var it = findItem(d.id).it; return { t: "Les annuleren?", p: "De " + it.people.length + " geboekte klanten krijgen een e-mail. Je kunt er een bericht bij zetten op het web.", b: [["Les annuleren", "do-cancel", "dng"], ["Terug", "close-alert", "sec"]] }; },
    removeEx: function (d) { var e = S.log.ex[d.e], n = e.sets.filter(function (s) { return s.done; }).length; return { t: e.name + " verwijderen?", p: n ? e.name + " heeft " + n + (n === 1 ? " gelogde set" : " gelogde sets") + ". Toch verwijderen?" : (e.sets.length === 1 ? "De enige set van " + e.name + " gaat uit deze training." : (e.sets.length === 2 ? "Beide" : "Alle " + e.sets.length) + " sets van " + e.name + " gaan uit deze training."), b: [["Verwijderen", "do-remove-ex", "dng"], ["Terug", "close-alert", "sec"]] }; },
    removeSet: function (d) { var e = S.log.ex[d.e]; return { t: "Set " + (+d.s + 1) + " verwijderen?", p: e.name + " houdt " + (e.sets.length - 1) + (e.sets.length - 1 === 1 ? " set" : " sets") + ".", b: [["Verwijderen", "do-remove-set", "dng"], ["Terug", "close-alert", "sec"]] }; },
    zero: function () { return { t: "Nog niets bijgehouden", p: "Je hebt nog geen sets afgevinkt. Toch afronden?", b: [["Afronden", "do-zero", "pri"], ["Terug", "close-alert", "sec"]] }; },
    rings: function () {
      var ws = S.scope === "ws";
      function li(c, t, d) { return '<li><i style="background:' + c + '"></i><span><b>' + t + "</b>" + d + "</span></li>"; }
      return { t: "Je dag in ringen", h: "<p>" + (ws ? "Alles bij Studio Fit vandaag, van alle trainers." : "Jouw sessies van vandaag.") + "</p><ul class=\"legend\">" +
        li("var(--priv)", "Privé", "Privésessies die al voorbij zijn, van het totaal vandaag.") +
        li("var(--group)", "Groepslessen", "Geboekte plekken van alle groepslessen samen.") +
        li("var(--gym)", "Open Gym", "Geboekte plekken van alle Open Gym-blokken samen.") + "</ul>", b: [["Begrepen", "close-alert", "pri"]] };
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
  function menuHTML() {
    var m = S.menu, items = m.items;
    var pos = m.pos ? "top:" + m.pos.top + "px;" + (m.pos.left != null ? "left:" + m.pos.left + "px" : "right:" + m.pos.right + "px") : "top:calc(var(--top) + 54px);right:12px";
    return '<div class="scrim" style="background:transparent" data-a="close-menu"></div><div class="menu anim-fade" role="menu" style="' + pos + '">' + items.map(function (x) { return x === "-" ? "<hr>" : '<button role="menuitem" class="' + (x.dng ? "d" : "") + '" data-a="' + x.a + '"' + dattrs(x.d) + ">" + x.t + ic(x.i) + "</button>"; }).join("") + "</div>";
  }

  /* ---------- Render ---------- */
  var dev, mk, scrollMem = {};
  function routeKey() { return S.tab + ":" + S.stacks[S.tab].map(function (r) { return r.n + (r.id || "") + (r.i || ""); }).join("/"); }
  function render() {
    if ((PREF.plat === "web" || PREF.plat === "client") && window.FVW) {
      var keep = window.FVW.scrollSave(dev);
      dev.className = "dev " + PREF.plat;
      dev.innerHTML = window.FVW[PREF.plat]() + (S.toast ? toastHTML() : "");
      dev.dataset.rk = "";
      S.anim = null; syncPanel(); tr(dev); window.FVW.scrollRestore(dev, keep); fitDev();
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
    var nsb = dev.querySelector(".sbody"); if (nsb && S.anim !== "up" && prevSheet === (S.sheet || "")) nsb.scrollTop = sbTop;
    var nfc = dev.querySelector(".full .content");
    if (nfc) { if (S.scrollBottom) { nfc.scrollTop = nfc.scrollHeight; S.scrollBottom = false; } else if (S.anim !== "up") nfc.scrollTop = fcTop; }
    if (nc && nc.scrollTop > 30) nc.parentNode.classList.add("scrolled");
    S.anim = null;
    syncPanel();
    tr(dev);
    dev.querySelectorAll(".card.desc p.clamp").forEach(function (p) { if (p.scrollHeight <= p.clientHeight + 1) p.nextElementSibling.hidden = true; });
  }
  function tr(root) { if (window.FIVVI_I18N) window.FIVVI_I18N.apply(root, PREF.lang); }
  function toastHTML() { var err = S.toastKind === "err"; return '<div class="toast glass anim-fade' + (err ? " err" : "") + '" role="' + (err ? "alert" : "status") + '">' + ic(err ? "warn" : "check") + esc(S.toast) + "</div>"; }
  /* a wrong entry: the field gets a red edge and the message under it, and the toast says it too */
  function bad(f, msg) { S.err = {}; S.err[f] = msg; toast(msg, "err"); return true; }
  function toast(m, kind) { S.toast = m; S.toastKind = kind || "ok"; render(); clearTimeout(toast.t); toast.t = setTimeout(function () { S.toast = null; var el = dev.querySelector(".toast"); if (el) el.remove(); }, 2300); }
  function push(r) { S.stacks[S.tab].push(r); S.anim = "push"; S.tabMin = false; render(); }
  function closeAll() { S.sheet = null; S.alert = null; S.menu = null; }

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
    "open-workout": function (d) { push({ n: "workout", id: d.id, i: +d.i }); },
    "open-att": function (d) { var it = findItem(d.id).it; it.attDraft = null; push({ n: "attendance", id: d.id }); },
    push: function (d) { push({ n: d.n }); },
    att: function (d) { var it = findItem(d.id).it; it.att = d.v; toast(d.v === "yes" ? CLIENT[it.client].name.split(" ")[0] + " was aanwezig" : "Genoteerd als niet verschenen"); },
    satt: function (d) { var it = findItem(d.id).it; it.att = d.v || null; render(); },
    "att-one": function (d) { var it = findItem(d.id).it; it.attDraft[d.i] = it.attDraft[d.i] === d.v ? undefined : d.v; render(); },
    "att-all": function (d) { var it = findItem(d.id).it; it.people.forEach(function (p, i) { it.attDraft[i] = "yes"; }); render(); },
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
    "new-client": function () { S.form = { name: "", email: "", lang: "Nederlands", ws: "sf" }; S.sheet = "newClient"; S.anim = "up"; render(); },
    "new-class": function () { S.form = Object.assign(today5(), { name: "", trainer: D.me.name, rep: "Niet herhalen", cap: "12", start: "19:00", end: "20:00" }); S.sheet = "newClass"; S.anim = "up"; render(); },
    "new-gym": function () { S.form = Object.assign(today5(), { start: "17:00", end: "19:00" }); S.sheet = "newGym"; S.anim = "up"; render(); },
    note: function (d) { S.form = { client: d.id, text: "" }; S.sheet = "note"; S.anim = "up"; render(); },
    "close-sheet": function () { S.sheet = null; S.err = {}; render(); },
    fset: function (d) { S.form[d.f] = d.v; render(); },
    "save-session": function () {
      var f = S.form, it = { id: "n" + Date.now(), ws: "sf", type: "priv", s: f.start, e: hm(mins(f.start) + +f.dur), client: f.client, loc: f.loc, att: null };
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
      var it = { id: "n" + Date.now(), ws: "sf", type: "group", s: f.start, e: f.end, title: f.name.trim(), cap: +f.cap || 10, people: [], loc: "Studio Fit, Kerkstraat 12", desc: { nl: (f.desc || "").trim(), en: (f.descEn || "").trim() } };
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
    "share-item": function (d) { var it = findItem(d.id).it; it.shared = true; toast("Gedeeld met " + CLIENT[it.client].name.split(" ")[0]); },
    lang: function (d) { PREF.lang = d.v; save(); applyPrefs(); toast(d.v === "en" ? "Taal: English" : "Taal: Nederlands"); },
    "close-alert": function () { S.alert = null; render(); },
    "do-cancel": function () { var it = findItem(S.alert.id).it; it.cancelled = true; S.alert = null; toast(it.type === "priv" ? "Sessie geannuleerd" : "Les geannuleerd"); },
    "do-signout": function () { fresh(); S.signedIn = false; S.anim = "push"; render(); },
    "do-delete": function () { S.alert = null; toast("Dit prototype verwijdert niets"); },
    "web-only": function () { S.menu = null; toast("Dit beheer je op het web"); },
    toast: function (d) { S.menu = null; toast(d.m); },
    "sign-next": function () { if (!/.+@.+\..+/.test(S.email)) { bad("email", "Vul een geldig e-mailadres in"); return; } S.signStep = "code"; S.code = ""; S.anim = "push"; render(); var i = dev.querySelector('[data-in="code"]'); if (i) i.focus(); },
    "sign-back": function () { S.signStep = "email"; render(); },
    "sign-in": function () { S.signedIn = true; S.signStep = "email"; S.tab = "today"; toast("Ingelogd als " + (S.email || D.me.email)); },
    /* logger */
    "start-workout": function (d) { var it = findItem(d.id).it; if (S.logs[d.id]) { openLogger(d.id); return; } if (it.workout) { openLogger(d.id, "log", it.workout); S.logs[d.id] = S.log; it.wstate = "running"; } else openLogger(d.id, "start"); },
    "start-now": function (d) {
      var c = CLIENT[d.id], it = { id: "n" + Date.now(), ws: c.ws, type: "priv", s: NOWT, e: hm(mins(NOWT) + 60), client: d.id, loc: D.workspaces[c.ws].location, att: null };
      DAYCACHE[TODAY].push(it); openLogger(it.id, "start"); toast("Sessie aangemaakt voor nu, " + NOWT);
    },
    "log-pick": function (d) { var L = S.log, it = findItem(L.item).it; L.tpl = d.t || null; L.ex = d.t ? tplEx(d.t) : []; L.step = d.t ? "log" : "add"; L.start = Date.now(); S.logs[L.item] = L; it.wstate = "running"; S.exq = ""; render(); },
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
    "log-share": function () { var f = CLIENT[S.log.client].name.split(" ")[0]; findItem(S.log.item).it.shared = true; S.log = null; S.preview = false; toast("Gedeeld met " + f); },
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
    "add-ex": function (d) { var e = D.library.filter(function (l) { return l.n === d.n; })[0]; S.log.ex.push(mkEx(e)); if (S.log.tpl) S.log.changed = true; S.log.step = "log"; S.scrollBottom = true; render(); },
    "add-ex-new": function () { var n = S.exq.trim() || "Nieuwe oefening"; S.log.ex.push(mkEx({ n: n.charAt(0).toUpperCase() + n.slice(1), ty: "wr" })); if (S.log.tpl) S.log.changed = true; S.log.step = "log"; S.scrollBottom = true; toast("Oefening aangemaakt. Je vindt hem voortaan onder Jouw oefeningen."); }
  };
  function menuAt(el, n, alignLeft) {
    var d = dev.getBoundingClientRect(), r = el.getBoundingClientRect(), z = parseFloat(getComputedStyle(dev).zoom) || 1, h = n * 46 + 16;
    var top = (r.bottom - d.top) / z + 4; if (top + h > d.height / z - 20) top = (r.top - d.top) / z - h - 4;
    return alignLeft ? { top: top, left: (r.left - d.left) / z } : { top: top, right: (d.right - r.right) / z };
  }
  function moveSet(e, from, to) { var a = S.log.ex[e].sets; a.splice(to, 0, a.splice(from, 1)[0]); if (S.log.tpl) S.log.changed = true; S.menu = null; render(); }
  function moveEx(from, to) { var a = S.log.ex; a.splice(to, 0, a.splice(from, 1)[0]); if (S.log.tpl) S.log.changed = true; S.menu = null; render(); }
  function removeSet(e, s) { S.log.ex[e].sets.splice(+s, 1); if (S.log.tpl) S.log.changed = true; render(); }
  function finishLog() { var L = S.log, it = findItem(L.item).it; it.wstate = "done"; it.att = "yes"; delete S.logs[L.item]; L.step = "share"; S.anim = null; render(); if (L.saveTpl) toast("Training opgeslagen. Schema " + (L.tplName || "nieuw") + " staat klaar."); }

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
    if (t.dataset.ls) { /* carry the changed value to later sets that were not changed or logged */
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
    if (host.classList.contains("screen") && PREF.plat === "ios") {
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
      ["Vandaag · hele studio", "TD-01", function () { fresh(); PREF.setup = "team"; PREF.role = "owner"; S.scope = "ws"; }],
      ["Agenda · Dag", "TD-04", function () { fresh(); S.tab = "agenda"; S.aview = "day"; }],
      ["Agenda · Week", "TD-04", function () { fresh(); S.tab = "agenda"; S.aview = "week"; }],
      ["Agenda · Maand", "TD-04", function () { fresh(); S.tab = "agenda"; S.aview = "month"; }],
      ["Privésessie", "TD-02", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; }, true],
      ["Groepsles (invallen)", "TD-03", function () { fresh(); PREF.setup = "team"; S.stacks.today = [{ n: "klass", id: "s5" }]; }, true],
      ["Aanwezigheid les", "CO-05", function () { fresh(); PREF.setup = "team"; var it = findItem("s2").it; it.attDraft = null; S.stacks.today = [{ n: "klass", id: "s2" }, { n: "attendance", id: "s2" }]; }, true],
      ["Open Gym", "TD-03", function () { fresh(); PREF.setup = "team"; S.stacks.today = [{ n: "klass", id: "s4" }]; }, true],
      ["Nieuw (+)", "TD-05", function () { fresh(); S.sheet = "new"; }],
      ["Nieuwe privésessie", "PS-04", function () { fresh(); A["new-session"](); }, true],
      ["Nieuwe groepsles", "TD-05", function () { fresh(); PREF.role = "owner"; A["new-class"](); }],
      ["Nieuwe klant", "TD-05", function () { fresh(); S.tab = "clients"; A["new-client"](); }],
      ["Sessie verplaatsen", "PS-05", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; A.move({ id: "s3" }); }, true],
      ["Sessie annuleren", "PS-06", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; S.alert = { n: "cancelSession", id: "s3" }; }, true],
      ["Klanten", "TM-02", function () { fresh(); S.tab = "clients"; }],
      ["Klantprofiel", "TM-03", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }]; }, true],
      ["Notitie", "F046", function () { fresh(); S.tab = "clients"; S.stacks.clients = [{ n: "client", id: "anna" }]; A.note({ id: "anna" }); }, true],
      ["Training starten", "WL-01", function () { fresh(); S.stacks.today = [{ n: "session", id: "s6" }]; openLogger("s6", "start"); }, true],
      ["Training loggen", "WL-02", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; A["start-workout"]({ id: "s3" }); }, true],
      ["Oefening toevoegen", "WL-04", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; A["start-workout"]({ id: "s3" }); S.log.step = "add"; }, true],
      ["Training afronden", "WL-05", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; A["start-workout"]({ id: "s3" }); S.log.ex[0].sets.forEach(function (s) { s.done = true; }); S.log.ex[1].sets[0].done = true; S.log.step = "finish"; }, true],
      ["Training delen", "WL-08", function () { fresh(); S.stacks.today = [{ n: "session", id: "s3" }]; A["start-workout"]({ id: "s3" }); S.log.ex[0].sets.forEach(function (s) { s.done = true; }); S.log.step = "share"; }, true],
      ["Profiel", "TM-04", function () { fresh(); S.tab = "profile"; }],
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
    D.workspaces.sf.location = sc ? sc.loc : PREF.setup === "solo" ? "TrainMore Zuid" : "Studio Fit, Kerkstraat 12";
    D.locations = sc ? [sc.loc, "TrainMore Zuid", "Basic-Fit Oost", "Vondelpark (buiten)"] : PREF.setup === "solo" ? ["TrainMore Zuid", "Basic-Fit Oost", "Vondelpark (buiten)", "Bij de klant thuis"] : ["Studio Fit, Kerkstraat 12", "TrainMore Zuid", "Basic-Fit Oost", "Vondelpark (buiten)"];
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
  window.FV = { get S() { return S; }, PREF: PREF, D: D, A: A, CLIENT: CLIENT, dayItems: dayItems, findItem: findItem, extra: function () { return EXTRA_WS; },
    CV: CV, TYPE: TYPE, title: title, esc: esc, ic: ic, mins: mins, hm: hm, key: key, parse: parse, add: add, monday: monday, longDate: longDate, shortDate: shortDate,
    isoWeek: isoWeek, DAYS: DAYS, DS: DS, MONTHS: MONTHS, MS: MS, TODAY: TODAY, NOW: NOW, NOWT: NOWT, isPast: isPast, initials: initials, toast: toast, render: function () { render(); },
    OWNER: OWNER, SOLO: SOLO, HAS: HAS, MIXED: MIXED, WSS: WSS, avatar: avatar, addClient: addClient, addItem: addItem, INDEX: INDEX, fresh: function () { fresh(); }, save: function () { save(); applyPrefs(); } };

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
