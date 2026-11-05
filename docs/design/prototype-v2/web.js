/* Fivvi prototype v2, rounds 2 and 3: trainer web (shadcn/ui structure) and client web (ADR-026: approved clients
   sign in, join through the join link and book from the client timetable). Same data and state as the app. */
(function () {
  "use strict";
  var F = window.FV, D = F.D, esc = F.esc, ic = F.ic;
  function S() { return F.S; }
  function W() { var s = S(); return s.w || (s.w = { page: "dashboard", view: "week", tab: "overview", scope: "ws", day: F.TODAY, q: "", form: {}, ctab: "list" }); }
  function C() { var s = S(); return s.c || (s.c = { step: "link", tab: "rooster", day: F.TODAY, filter: "all", detail: null, booked: {}, wl: {}, email: "", code: "", name: "", who: "new", workout: null, typeFilter: "all" }); }
  function ME() { return D.me.name; }
  function wsName() { return D.workspaces.sf.name; }
  function slug() { return wsName().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function who(i) { return i.type === "gym" ? "" : i.trainer || ME(); }
  function studioItems(k) {
    var its = F.dayItems(k).filter(function (i) { return i.ws === "sf"; });
    if (k === F.TODAY && !F.SOLO()) its = its.concat(F.extra());
    return its.sort(function (a, b) { return F.mins(a.s) - F.mins(b.s); });
  }
  function shortLoc(l) { return String(l || "").split(",")[0]; }
  function badge(t, c, cls) { return '<span class="w-badge ' + (cls || "") + '"' + (c ? ' style="--c:' + c + '"' : "") + ">" + t + "</span>"; }
  function btn(t, a, o) { o = o || {}; return '<button class="w-btn ' + (o.k || "") + '" data-a="' + a + '"' + dat(o.d) + (o.dis ? " disabled" : "") + ">" + (o.i ? ic(o.i) : "") + t + "</button>"; }
  function dat(d) { var s = ""; for (var k in d || {}) s += " data-" + k + '="' + esc(d[k]) + '"'; return s; }
  function card(title, body, o) { o = o || {}; return '<section class="w-card ' + (o.cls || "") + '">' + (title ? '<div class="w-card-h"><div><h3>' + title + "</h3>" + (o.desc ? "<p>" + o.desc + "</p>" : "") + "</div>" + (o.act || "") + "</div>" : "") + '<div class="w-card-b">' + body + "</div></section>"; }
  function tabs(opts, val, a) { return '<div class="w-tabs" role="tablist">' + opts.map(function (o) { return '<button role="tab" class="' + (o[0] === val ? "on" : "") + '" data-a="' + a + '" data-v="' + o[0] + '">' + o[1] + "</button>"; }).join("") + "</div>"; }
  function av(n, c) { return '<span class="w-av" style="--c:' + (c || "#8E8E93") + '">' + F.initials(n) + "</span>"; }
  function bar(v, of, c) { return '<span class="w-bar" style="--c:' + c + '"><i style="width:' + (of ? Math.min(100, Math.round(v / of * 100)) : 0) + '%"></i></span>'; }
  function personName(id) { var c = F.CLIENT[id]; return c ? c.name : ["Ruben Vos", "Kim de Graaf", "Jasper Kok", "Mila Bos", "Sem Dekker", "Lotte Prins", "Finn Smits", "Zoë Meijer", "Daan Bos", "Iris Prins"][(+String(id).replace(/\D/g, "") || 0) % 10]; }
  function desc(title) { var d = D.descriptions[title]; if (!d) return null; return D && window.FV.PREF.lang === "en" && d.en ? { t: d.en, nl: false } : { t: d.nl, nl: window.FV.PREF.lang === "en" }; }
  function itemTitle(i) { return F.title(i); }
  function openA(i) { return i.type === "priv" ? "w-open-priv" : "w-open-class"; }
  /* ---------- billing (PRODUCT.md §90–§96) ---------- */
  function money(c) { return F.OWNER() && c.ws === "sf"; }
  function cap1(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  var STATUS = { active: ["Actief", "var(--ok)"], open: ["Openstaande betaling", "var(--danger)"], ending: ["Stopt binnenkort", "var(--gym)"], expired: ["Verlopen", ""] };
  var PAY = { paid: ["Betaald", "var(--ok)"], failed: ["Mislukt", "var(--danger)"], refund: ["Terugbetaald", ""] };
  function balBlock(x) {
    var t = Math.max(1, x.total);
    return '<div class="w-bal"><div class="w-bal-h"><b>' + cap1(x.label[1]) + '</b><span class="w-num"><b>' + x.left + "</b> over</span></div>" +
      '<div class="w-seg3" style="--c:' + x.label[2] + '"><i class="u" style="width:' + (x.used / t * 100) + '%"></i><i class="p" style="width:' + (x.planned / t * 100) + '%"></i></div>' +
      '<div class="w-bal-l" style="--c:' + x.label[2] + '"><span><i class="u"></i>' + x.used + ' gebruikt</span><span><i class="p"></i>' + x.planned + ' gepland</span><span><i class="l"></i>' + x.left + ' over</span><span class="w-muted">van ' + x.total + " deze periode</span></div></div>";
  }
  /* renewal: suggested from a month before an agreement that stops ends, or when a credit pack runs low (owner only) */
  function renewLine(sum, a, c) {
    var r = sum.renew.filter(function (x) { return x[0] === a; })[0]; if (!r || !money(c)) return "";
    return '<div class="w-renew">' + ic("repeat") + "<span><b>" + (a.offerSent ? "Aanbod verstuurd " + esc(a.offerSent) : "Verlengen voorgesteld") + "</b> · <span>" + (a.offerSent ? "wacht op betaling" : esc(r[1])) + "</span></span>" + (a.offerSent ? btn("Opnieuw sturen", "w-dlg", { k: "ghost sm", d: { n: "offer", ag: a.id } }) : btn("Verlengen", "w-dlg", { k: "sm", d: { n: "offer", ag: a.id } })) + "</div>";
  }
  function aboLine(a) { return "Deze week " + a.usedWeek + " van " + a.perWeek + " gebruikt" + (a.makeups ? " · " + a.makeups + (a.makeups === 1 ? " inhaalles" : " inhaallessen") : ""); }
  function statusBadge(a) { var st = STATUS[a.status]; return badge(a.status === "ending" ? cap1(a.period) : st[0], st[1], st[1] ? "" : "outline"); }
  function flagList(sum, c) { return sum.flags.filter(function (f) { return f[0] !== "danger" || money(c); }).map(function (f) { return '<p class="w-flag ' + f[0] + '">' + ic(f[0] === "none" ? "info" : "warn") + esc(f[1]) + "</p>"; }).join(""); }
  /* ---------- last time and progress ---------- */
  function nl(x) { return String(x).replace(".", ","); }
  function dtag(d) { return d ? '<span class="w-diff" role="img" aria-label="' + D.DIFF[d][1] + '" title="' + D.DIFF[d][1] + '">' + D.DIFF[d][0] + "</span>" : ""; }
  function lastCard(cid, compact) {
    var h = (D.history[cid] || [])[0];
    if (!h || !h.sets) return compact ? '<p class="w-muted">Nog geen eerdere training.</p>' : card("Laatste training", '<p class="w-muted">Nog geen eerdere training.</p>');
    var hard = h.sets.filter(function (x) { return x[2] === "h"; }).map(function (x) { return x[0]; });
    var body = '<p class="w-muted">' + esc(h.d) + " · " + esc(h.name) + (h.dur ? " · " + h.dur : "") + " · " + esc(h.by) + "</p>" +
      (hard.length ? '<p class="w-hard">' + dtag("h") + "<span>Zwaar: " + hard.map(esc).join(", ") + "</span></p>" : "") +
      '<ul class="w-last">' + h.sets.map(function (x) { return "<li><b>" + esc(x[0]) + '</b><span class="w-tnum">' + esc(x[1]) + "</span>" + dtag(x[2]) + "</li>"; }).join("") + "</ul>" +
      (h.note ? '<p class="w-note" translate="no">' + ic("note") + "<span>" + esc(h.note) + "</span></p>" : "");
    return compact ? body : card("Laatste training", body, { desc: "Hoe het ging, per oefening" });
  }
  function progressCard(cid) {
    var L = D.lifts[cid], wk = D.weeks[cid]; if (!L && !wk) return "";
    var body = (L || []).map(function (l) { var v = l[1], d = v[v.length - 1] - v[0]; return '<div class="w-lift"><b>' + esc(l[0]) + "</b>" + D.spark(v, "var(--accent)", 120, 30) + '<span class="w-liftv">' + nl(v[v.length - 1]) + ' kg</span><span class="w-up">' + (d > 0 ? "+" : "") + nl(d) + " kg</span></div>"; }).join("") +
      (wk ? '<div class="w-lift"><b>Getraind</b><span class="w-wk">' + wk.map(function (x) { return '<i class="' + (x ? "on" : "") + '"></i>'; }).join("") + '</span><span class="w-liftv">' + wk.filter(function (x) { return x; }).length + "/8</span><span class=\"w-muted\">weken</span></div>" : "");
    return card("Voortgang", body, { desc: "Zwaarste set per week, laatste 8 weken" });
  }
  if (!D.requests) D.requests = [{ id: "rq1", name: "Kim de Graaf", email: "kim@example.com", when: "vandaag 09:12" }, { id: "rq2", name: "Ruben Vos", email: "ruben@example.com", when: "gisteren 21:40" }];

  /* ================= Trainer web ================= */
  var NAV = function () {
    var own = F.OWNER(), team = !F.SOLO();
    return [
      ["h", "Persoonlijk"],
      ["myday", "Mijn dag", "sun", true],
      ["mycal", "Mijn agenda", "cal", true],
      ["h", wsName()],
      ["dashboard", "Dashboard", "today", own],
      ["agenda", "Agenda", "cal", true],
      ["clients", "Klanten", "people", true, own ? D.requests.length : 0],
      ["classes", "Lessen", "group", own && F.HAS("group")],
      ["gym", "Open Gym", "door", own && F.HAS("gym")],
      ["workouts", "Trainingen", "dumb", true],
      ["offers", "Aanbod", "repeat", own],
      ["trainers", "Trainers", "personPlus", own && team],
      ["link", "Aanmeldlink", "link", own],
      ["settings", "Instellingen", "pencil", own]
    ];
  };
  var TITLES = { myday: "Mijn dag", mycal: "Mijn agenda", dashboard: "Dashboard", agenda: "Agenda", clients: "Klanten", client: "Klantprofiel", classes: "Lessen", klass: "Les", gym: "Open Gym", offers: "Aanbod", workouts: "Trainingen", trainers: "Trainers", link: "Aanmeldlink", settings: "Instellingen" };

  function web() {
    var w = W();
    if (!F.OWNER() && ["dashboard", "classes", "gym", "trainers", "link", "settings"].indexOf(w.page) >= 0) w.page = "myday";
    var nav = NAV().map(function (n) {
      if (n[0] === "h") return '<div class="w-navh">' + esc(n[1]) + "</div>";
      if (!n[3]) return "";
      var on = w.page === n[0] || (n[0] === "clients" && w.page === "client") || (n[0] === "classes" && w.page === "klass");
      return '<button class="w-nav' + (on ? " on" : "") + '" data-a="w-page" data-v="' + n[0] + '">' + ic(n[2]) + "<span>" + n[1] + "</span>" + (n[4] ? '<b class="w-count">' + n[4] + "</b>" : "") + "</button>";
    }).join("");
    var page = (PAGES[w.page] || PAGES.dashboard)();
    if (w.page === "client" || w.page === "klass") { var to = w.back ? w.back.page : w.page === "client" ? "clients" : "classes"; page = '<button class="w-back" data-a="w-back">' + ic("chevL") + "<span>" + esc(TITLES[to] || "Terug") + "</span></button>" + page; }
    var h = '<div class="w-chrome"><i></i><i></i><i></i><span class="w-url">fivvi.app/w/' + slug() + "/" + w.page + "</span></div>";
    h += '<div class="w-app"><aside class="w-side"><button class="w-wsb" data-a="w-toast" data-m="Wissel van werkruimte">' + '<span class="w-logo">' + F.initials(wsName()) + '</span><span class="w-wsn"><b>' + esc(wsName()) + "</b><span>" + (F.OWNER() ? "Eigenaar" : "Trainer") + "</span></span>" + ic("chevR") + "</button>" + nav +
      '<div class="w-sidef"><button class="w-nav" data-a="w-toast" data-m="Opent het feedbackformulier">' + ic("chat") + "<span>Feedback geven</span></button>" +
      '<div class="w-user">' + av(ME(), "var(--accent)") + "<span><b>" + esc(ME()) + "</b><span>" + esc(D.me.email) + "</span></span></div></div></aside>";
    h += '<main class="w-main"><header class="w-top"><h1>' + esc(TITLES[w.page] || "") + '</h1><div class="w-search">' + ic("search") + '<input data-win="q" placeholder="Zoek klant…" value="' + esc(w.q) + '" aria-label="Zoek klant"><div id="w-sr" class="w-sr">' + searchResults() + "</div></div>" +
      btn("Nieuw", "w-new", { i: "plus" }) + '</header><div class="w-scroll"><div class="w-page">' + page + "</div></div></main></div>";
    if (w.menu) h += menu();
    if (w.sheet) h += sheet();
    if (w.dialog) h += dialog();
    if (w.poster) h += poster();
    return h;
  }
  function searchResults() {
    var q = W().q.trim().toLowerCase(); if (!q) return "";
    var hits = D.clients.filter(function (c) { return F.WSS().indexOf(c.ws) >= 0 && (c.name.toLowerCase().indexOf(q) >= 0 || c.email.toLowerCase().indexOf(q) >= 0); }).slice(0, 6);
    return '<div class="w-sr-box">' + (hits.length ? hits.map(function (c) { return '<button data-a="w-client" data-id="' + c.id + '">' + av(c.name, c.c) + "<span><b>" + esc(c.name) + "</b><span>" + esc(c.email) + "</span></span></button>"; }).join("") : '<p class="w-muted">Geen klant gevonden.</p>') + "</div>";
  }

  /* ---------- pages ---------- */
  var PAGES = {};
  PAGES.myday = function () { W().scope = "me"; return dayPage(); };
  PAGES.dashboard = function () { W().scope = "ws"; return dayPage(); };
  function dayPage() {
    var w = W(), mine = w.scope === "me";
    var items = mine ? F.dayItems(F.TODAY) : studioItems(F.TODAY), act = items.filter(function (i) { return !i.cancelled; });
    var done = act.filter(function (i) { return F.isPast(i, F.TODAY); }).length, h = "";
    var openAtt = act.filter(function (i) { return F.isPast(i, F.TODAY) && (i.type === "priv" ? !i.att : !(i.attMap && Object.keys(i.attMap).length)); });
    var k = [kpi("Sessies vandaag", done + "<small>/" + act.length + "</small>", "klaar", "var(--priv)", done, act.length)];
    var g = act.filter(function (i) { return i.type === "group"; }), o = act.filter(function (i) { return i.type === "gym"; });
    if (g.length) { var gb = 0, gc = 0; g.forEach(function (i) { gb += i.people.length; gc += i.cap; }); k.push(kpi("Groepsplekken", gb + "<small>/" + gc + "</small>", "geboekt", "var(--group)", gb, gc)); }
    if (o.length) { var ob = 0, oc = 0; o.forEach(function (i) { ob += i.people.length; oc += i.cap; }); k.push(kpi("Open Gym", ob + "<small>/" + oc + "</small>", "geboekt", "var(--gym)", ob, oc)); }
    k.push(kpi("Aanwezigheid open", String(openAtt.length), openAtt.length ? "nog invullen" : "alles ingevuld", openAtt.length ? "var(--gym)" : "var(--ok)"));
    if (!mine && F.OWNER()) k.push(kpi("Aanmeldverzoeken", String(D.requests.length), "wachten op jou", "var(--accent)"));
    h += (F.OWNER() && !F.SOLO() ? '<div class="w-row-between">' + tabs([["me", "Mijn dag"], ["ws", wsName()]], w.scope, "w-scope") + "</div>" : "");
    h += '<div class="w-kpis" style="--n:' + Math.min(5, k.length) + '">' + k.join("") + "</div>";
    /* lanes: one per trainer, wide enough on the web to name every session */
    h += '<div class="w-grid2">' + card(mine ? "Je dag" : "Vandaag bij " + esc(wsName()), lanes(items, mine), { desc: mine ? "Al je sessies, ook bij andere werkruimtes." : "Eén rij per trainer. Sessies tegelijk staan naast elkaar." , cls: "span2" }) + "</div>";
    var attn = [];
    openAtt.forEach(function (i) { attn.push(['<b>Aanwezigheid invullen</b> · ' + esc(itemTitle(i)) + " " + i.s, openA(i), i.id]); });
    act.forEach(function (i) { if (i.type === "group" && i.people.length >= i.cap && i.waitlist) attn.push(["<b>Vol</b> · " + esc(i.title) + " " + i.s + " · " + i.waitlist + " op de wachtlijst", "w-open-class", i.id]); });
    if (!mine && F.OWNER()) D.clients.forEach(function (c) { if (c.ws !== "sf") return; D.bsum(c.id).flags.forEach(function (f) { if (f[0] === "danger" || f[0] === "warn") attn.push(["<b>" + esc(c.name) + "</b> · <span>" + esc(f[1]) + "</span>", "w-client-bill", c.id]); }); });
    if (!mine && F.OWNER() && D.requests.length) attn.push(["<b>" + D.requests.length + " aanmeldverzoeken</b> wachten op goedkeuring", "w-requests", ""]);
    var up = act.filter(function (i) { return !F.isPast(i, F.TODAY); });
    h += '<div class="w-grid2">' + card("Aandacht nodig", attn.length ? '<ul class="w-list">' + attn.map(function (x) { return '<li><button data-a="' + x[1] + '" data-id="' + x[2] + '">' + ic("warn") + "<span>" + x[0] + "</span>" + ic("chevR") + "</button></li>"; }).join("") + "</ul>" : '<p class="w-muted">Niets open. Alles is bijgewerkt.</p>') +
      card("Nog vandaag", up.length ? table(["Tijd", "Sessie", "Trainer", "Bezetting"], up.map(function (i) {
        return ['<span class="w-tnum">' + i.s + "–" + i.e + "</span>", '<button class="w-link" data-a="' + openA(i) + '" data-id="' + i.id + '"><i class="w-dot" style="--c:' + F.CV[i.type] + '"></i>' + esc(itemTitle(i)) + "</button>" + (F.MIXED() ? ' <span class="w-muted">' + F.TYPE[i.type] + "</span>" : ""), esc(who(i) === ME() ? "Jij" : who(i) || "—"), i.cap ? bar(i.people.length, i.cap, F.CV[i.type]) + ' <span class="w-tnum">' + i.people.length + "/" + i.cap + "</span>" : '<span class="w-muted">' + esc(shortLoc(i.loc)) + "</span>"];
      })) : '<p class="w-muted">Geen sessies meer vandaag.</p>') + "</div>";
    return h;
  }
  function kpi(label, val, sub, c, v, of) { return '<div class="w-kpi"><span>' + label + "</span><b>" + val + "</b><small>" + sub + "</small>" + (of != null ? bar(v, of, c) : '<i class="w-kpi-dot" style="--c:' + c + '"></i>') + "</div>"; }
  function lanes(items, mine) {
    var act = items.filter(function (i) { return !i.cancelled; });
    if (!act.length) return '<p class="w-muted">Geen sessies vandaag.</p>';
    var key_ = mine ? function (i) { return i.ws === "jg" ? D.workspaces.jg.name : wsName(); } : function (i) { return i.type === "gym" ? "Open Gym" : who(i); };
    var names = []; act.forEach(function (i) { if (names.indexOf(key_(i)) < 0) names.push(key_(i)); });
    names.sort(function (a, b) { return a === ME() || a === wsName() ? -1 : b === ME() || b === wsName() ? 1 : a === "Open Gym" ? 1 : b === "Open Gym" ? -1 : a.localeCompare(b); });
    var s0 = Math.min.apply(null, act.map(function (i) { return F.mins(i.s); })), e0 = Math.max.apply(null, act.map(function (i) { return F.mins(i.e); }));
    var h0 = Math.floor(s0 / 60), h1 = Math.max(h0 + 10, Math.ceil(e0 / 60)), range = (h1 - h0) * 60;
    var rows = names.map(function (n) {
      var its = act.filter(function (i) { return key_(i) === n; }), lanesA = [];
      its.forEach(function (it) { var l = 0; while (lanesA[l] && lanesA[l].some(function (o) { return F.mins(o.s) < F.mins(it.e) && F.mins(it.s) < F.mins(o.e); })) l++; (lanesA[l] = lanesA[l] || []).push(it); it._wl = l; });
      var LH = 30;
      var blocks = its.map(function (it) {
        var left = (F.mins(it.s) - h0 * 60) / range * 100, wd = (F.mins(it.e) - F.mins(it.s)) / range * 100;
        return '<button class="w-blk' + (F.isPast(it, F.TODAY) ? " past" : "") + '" data-a="' + openA(it) + '" data-id="' + it.id + '" style="--c:' + F.CV[it.type] + ";left:" + left.toFixed(2) + "%;width:calc(" + wd.toFixed(2) + "% - 3px);top:" + it._wl * (LH + 3) + 'px"><b>' + esc(itemTitle(it)) + "</b><span>" + it.s + (it.cap ? " · " + it.people.length + "/" + it.cap : "") + "</span></button>";
      }).join("");
      var lab = n === "Open Gym" ? '<span class="w-av" style="--c:var(--gym);border-radius:8px">OG</span><span>Open Gym</span>' : av(n, n === ME() || n === wsName() ? "var(--accent)" : "#8E8E93") + "<span>" + esc(n === ME() ? "Jij" : n) + "</span>";
      return '<div class="w-lane"><div class="w-lane-l">' + lab + '</div><div class="w-lane-t" style="height:' + (lanesA.length * (LH + 3) - 3) + 'px">' + blocks + "</div></div>";
    }).join("");
    var now = (F.mins(F.NOWT) - h0 * 60) / range * 100, axis = "";
    for (var h = h0; h <= h1; h++) axis += '<span style="left:' + ((h - h0) * 60 / range * 100).toFixed(2) + '%">' + String(h).padStart(2, "0") + ":00</span>";
    return '<div class="w-lanes">' + rows + '<i class="w-now" style="left:calc(150px + (100% - 150px) * ' + (now / 100).toFixed(4) + ')"></i></div><div class="w-axis">' + axis + "</div>";
  }
  function table(head, rows, cls) { return '<div class="w-tablewrap"><table class="w-table ' + (cls || "") + '"><thead><tr>' + head.map(function (x) { return "<th>" + x + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (x) { return "<td>" + x + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>"; }

  /* Agenda: week grid, a day view with one column per trainer (parallel sessions side by side), and a list */
  PAGES.mycal = function () { W().scope = "me"; return agenda(); };
  PAGES.agenda = function () { if (W().scope === "me" && W().page === "agenda") W().scope = F.SOLO() ? "me" : "ws"; return agenda(); };
  function weekItems(k, mine) { return mine ? F.dayItems(k) : studioItems(k); }
  function agenda() {
    var w = W(), mine = w.scope === "me" || F.SOLO(), sel = F.parse(w.day), mon = F.monday(sel), h = "";
    h += '<div class="w-row-between"><div class="w-hgroup">' + btn("Vandaag", "w-day", { k: "outline", d: { v: F.TODAY } }) + '<button class="w-icon" data-a="w-shift" data-v="-1" aria-label="Vorige">' + ic("chevL") + '</button><button class="w-icon" data-a="w-shift" data-v="1" aria-label="Volgende">' + ic("chevR") + "</button><b class=\"w-range\">" +
      (w.view === "day" ? F.longDate(sel) : mon.getDate() + " " + F.MS[mon.getMonth()] + " – " + F.add(mon, 6).getDate() + " " + F.MS[F.add(mon, 6).getMonth()] + " " + mon.getFullYear()) + "</b></div>" +
      tabs([["day", "Dag"], ["week", "Week"], ["list", "Lijst"]], w.view, "w-view") + "</div>";
    if (w.view === "week") {
      var days = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return F.add(mon, i); }), H0 = 7, H1 = 22, HH = 44;
      var cols = days.map(function (d) {
        var k = F.key(d), its = weekItems(k, mine);
        var cl = []; its.forEach(function (it) { var c = 0; while (cl[c] && cl[c].some(function (o) { return F.mins(o.s) < F.mins(it.e) && F.mins(it.s) < F.mins(o.e); })) c++; (cl[c] = cl[c] || []).push(it); it._c = c; });
        var blocks = its.map(function (it) {
          var n = 1; cl.forEach(function (col, ci) { if (col.some(function (o) { return F.mins(o.s) < F.mins(it.e) && F.mins(it.s) < F.mins(o.e); })) n = Math.max(n, ci + 1); });
          return '<button class="w-ev' + (it.cancelled ? " cx" : "") + (F.isPast(it, k) ? " past" : "") + '" data-a="w-ev" data-id="' + it.id + '" style="--c:' + F.CV[it.type] + ";top:" + ((F.mins(it.s) - H0 * 60) / 60 * HH) + "px;height:" + ((F.mins(it.e) - F.mins(it.s)) / 60 * HH - 2) + "px;left:calc(" + (it._c / n * 100) + "% + 2px);width:calc(" + (100 / n) + '% - 4px)"><b>' + esc(itemTitle(it)) + "</b><span>" + it.s + (it.trainer && !mine ? " · " + esc(it.trainer.split(" ")[0]) : "") + "</span></button>";
        }).join("");
        return '<div class="w-wcol' + (k === F.TODAY ? " today" : "") + '">' + blocks + (k === F.TODAY ? '<i class="w-wnow" style="top:' + ((F.mins(F.NOWT) - H0 * 60) / 60 * HH) + 'px"></i>' : "") + "</div>";
      }).join("");
      var hours = ""; for (var hh = H0; hh <= H1; hh++) hours += '<span style="top:' + ((hh - H0) * HH) + 'px">' + String(hh).padStart(2, "0") + ":00</span>";
      h += '<section class="w-card w-cal"><div class="w-whead"><span></span>' + days.map(function (d) { var k = F.key(d); return '<button class="' + (k === F.TODAY ? "today" : "") + '" data-a="w-dayview" data-v="' + k + '">' + F.DS[d.getDay()] + " <b>" + d.getDate() + "</b></button>"; }).join("") + "</div>" +
        '<div class="w-wbody" style="height:' + ((H1 - H0) * HH) + 'px"><div class="w-hours">' + hours + "</div>" + cols + "</div></section>";
    } else if (w.view === "day") {
      var its = weekItems(w.day, mine), H0d = 7, H1d = 22, HHd = 52;
      var res = []; its.forEach(function (i) { var r = mine ? (i.ws === "jg" ? D.workspaces.jg.name : wsName()) : i.type === "gym" ? "Open Gym" : who(i); if (res.indexOf(r) < 0) res.push(r); });
      res.sort(function (a, b) { return a === ME() || a === wsName() ? -1 : b === ME() || b === wsName() ? 1 : a === "Open Gym" ? 1 : b === "Open Gym" ? -1 : a.localeCompare(b); });
      if (!res.length) res = [mine ? wsName() : ME()];
      var hrs = ""; for (var x = H0d; x <= H1d; x++) hrs += '<span style="top:' + ((x - H0d) * HHd) + 'px">' + String(x).padStart(2, "0") + ":00</span>";
      var rcols = res.map(function (r) {
        var mineR = its.filter(function (i) { return (mine ? (i.ws === "jg" ? D.workspaces.jg.name : wsName()) : i.type === "gym" ? "Open Gym" : who(i)) === r; });
        var cl = []; mineR.forEach(function (it) { var c = 0; while (cl[c] && cl[c].some(function (o) { return F.mins(o.s) < F.mins(it.e) && F.mins(it.s) < F.mins(o.e); })) c++; (cl[c] = cl[c] || []).push(it); it._c = c; });
        return '<div class="w-wcol">' + mineR.map(function (it) { var n = cl.length; return '<button class="w-ev' + (it.cancelled ? " cx" : "") + (F.isPast(it, w.day) ? " past" : "") + '" data-a="w-ev" data-id="' + it.id + '" style="--c:' + F.CV[it.type] + ";top:" + ((F.mins(it.s) - H0d * 60) / 60 * HHd) + "px;height:" + ((F.mins(it.e) - F.mins(it.s)) / 60 * HHd - 2) + "px;left:calc(" + (it._c / n * 100) + "% + 3px);width:calc(" + (100 / n) + '% - 6px)"><b>' + esc(itemTitle(it)) + "</b><span>" + it.s + "–" + it.e + (it.cap ? " · " + it.people.length + "/" + it.cap : " · " + esc(shortLoc(it.loc))) + "</span></button>"; }).join("") +
          (w.day === F.TODAY ? '<i class="w-wnow" style="top:' + ((F.mins(F.NOWT) - H0d * 60) / 60 * HHd) + 'px"></i>' : "") + "</div>";
      }).join("");
      h += '<section class="w-card w-cal"><div class="w-whead" style="--cols:' + res.length + '"><span></span>' + res.map(function (r) { return '<div class="w-reshead">' + (r === "Open Gym" ? '<span class="w-av" style="--c:var(--gym);border-radius:8px">OG</span>' : av(r, r === ME() || r === wsName() ? "var(--accent)" : "#8E8E93")) + "<b>" + esc(r === ME() ? "Jij" : r) + "</b></div>"; }).join("") + "</div>" +
        '<div class="w-wbody" style="--cols:' + res.length + ";height:" + ((H1d - H0d) * HHd) + 'px"><div class="w-hours">' + hrs + "</div>" + rcols + "</div></section>";
    } else {
      var rows = [];
      [0, 1, 2, 3, 4, 5, 6].forEach(function (i) { var d = F.add(mon, i), k = F.key(d); weekItems(k, mine).forEach(function (it) { rows.push([F.shortDate(d), '<span class="w-tnum">' + it.s + "–" + it.e + "</span>", '<button class="w-link" data-a="w-ev" data-id="' + it.id + '"><i class="w-dot" style="--c:' + F.CV[it.type] + '"></i>' + esc(itemTitle(it)) + "</button>", F.MIXED() ? F.TYPE[it.type] : esc(shortLoc(it.loc)), esc(who(it) === ME() ? "Jij" : who(it) || "—"), it.cancelled ? badge("Geannuleerd", "", "outline") : it.cap ? '<span class="w-tnum">' + it.people.length + "/" + it.cap + "</span>" : badge(it.att === "yes" ? "Aanwezig" : it.att === "no" ? "Niet verschenen" : "Gepland", "", "secondary")]); }); });
      h += card("", table(["Dag", "Tijd", "Sessie", F.MIXED() ? "Soort" : "Locatie", "Trainer", "Status"], rows));
    }
    return h;
  }

  /* Clients: table, and the join requests to approve (ADR-026) */
  PAGES.clients = function () {
    var w = W(), h = "";
    var own = F.OWNER();
    h += '<div class="w-row-between">' + (own ? tabs([["list", "Klanten"], ["req", "Aanmeldverzoeken" + (D.requests.length ? " · " + D.requests.length : "")]], w.ctab, "w-ctab") : "<span></span>") + btn("Klant toevoegen", "w-new-client", { i: "personPlus" }) + "</div>";
    if (w.ctab === "req" && own) {
      h += card("Aanmeldverzoeken", D.requests.length ? table(["Naam", "E-mail", "Verstuurd", ""], D.requests.map(function (r) { return ['<span class="w-cell">' + av(r.name) + "<b>" + esc(r.name) + "</b></span>", esc(r.email), esc(r.when), '<div class="w-hgroup end">' + btn("Afwijzen", "w-decline", { k: "outline sm", d: { id: r.id } }) + btn("Goedkeuren", "w-approve", { k: "sm", d: { id: r.id } }) + "</div>"]; })) : '<p class="w-muted">Geen open verzoeken.</p>', { desc: "Mensen die via je aanmeldlink willen meedoen. Pas na goedkeuring zien ze je rooster." });
      return h;
    }
    var cs = D.clients.filter(function (c) { return F.WSS().indexOf(c.ws) >= 0; });
    var head = ["Naam", "Abonnement en tegoed"].concat(F.OWNER() ? ["Betaling"] : []).concat(["Laatste sessie", ""]);
    h += card("", table(head, cs.map(function (c) {
      var sum = D.bsum(c.id), last = sum.b.payments[0];
      var bal = c.ws !== "sf" ? '<span class="w-muted">Bij ' + esc(D.workspaces[c.ws].name) + "</span>" : sum.short.length ? sum.short.map(function (t) { return badge(esc(t), "", "secondary"); }).join(" ") + (sum.flags.some(function (f) { return f[0] === "warn"; }) ? ' <span class="w-warn" title="Let op">' + ic("warn") + "</span>" : "") : '<span class="w-muted">Geen</span>';
      var pay = !money(c) ? "—" : sum.open.length ? badge("Open " + sum.open[0].open, "var(--danger)") : last ? badge(PAY[last[4]][0], PAY[last[4]][1], PAY[last[4]][1] ? "" : "outline") : '<span class="w-muted">—</span>';
      return ['<button class="w-link w-cell" data-a="w-client" data-id="' + c.id + '">' + av(c.name, c.c) + "<span><b>" + esc(c.name) + '</b><span class="w-sub">' + esc(c.email) + "</span></span></button>", bal].concat(F.OWNER() ? [pay] : []).concat([esc(c.last), '<button class="w-icon" data-a="w-client" data-id="' + c.id + '" aria-label="Openen">' + ic("chevR") + "</button>"]);
    })), { desc: cs.length + " klanten" });
    return h;
  };
  PAGES.client = function () {
    var w = W(), c = F.CLIENT[w.cid], h = "";
    if (!c) { w.page = "clients"; return PAGES.clients(); }
    h += '<div class="w-phead">' + av(c.name, c.c).replace("w-av", "w-av lg") + '<div><h2>' + esc(c.name) + "</h2><p>" + esc(c.email) + " · " + esc(D.workspaces[c.ws].name) + "</p></div>" + '<div class="w-hgroup end">' + btn("Bewerken", "w-toast", { k: "outline", d: { m: "Opent het bewerkformulier" } }) + btn("Sessie plannen", "w-plan", { i: "cal", d: { id: c.id } }) + "</div></div>";
    h += tabs([["overview", "Overzicht"], ["billing", money(c) ? "Tegoed en betalingen" : "Tegoed"], ["sessions", "Sessies"], ["workouts", "Trainingen"], ["bookings", "Boekingen"], ["notes", "Notities"], ["history", "Geschiedenis"]], w.tab, "w-tab");
    var sum = D.bsum(c.id);
    var notes = D.notes[c.id] || [], hist = D.history[c.id] || [], prog = D.progress[c.id];
    var sess = [], book = [];
    for (var i = -7; i <= 7; i++) { var k = F.key(F.add(F.NOW, i)); studioItems(k).forEach(function (it) { if (it.client === c.id) sess.push([k, it]); if (it.people && it.people.indexOf(c.id) >= 0) book.push([k, it]); }); }
    if (w.tab === "overview") {
      var next = sess.filter(function (x) { return x[0] > F.TODAY || (x[0] === F.TODAY && !F.isPast(x[1], x[0])); })[0];
      h += '<div class="w-grid3">' + card("Volgende sessie", next ? "<b>" + F.longDate(F.parse(next[0])) + "</b><p>" + next[1].s + "–" + next[1].e + " · " + esc(shortLoc(next[1].loc)) + "</p>" : '<p class="w-muted">Niets gepland.</p>') +
        card("Gegevens", '<dl class="w-dl"><dt>E-mail</dt><dd>' + esc(c.email) + "</dd><dt>Taal voor e-mails</dt><dd>" + esc(c.lang) + "</dd><dt>Werkruimte</dt><dd>" + esc(D.workspaces[c.ws].name) + "</dd></dl>") +
        card("Notities", notes.length ? '<p translate="no">' + esc(notes[0].t) + '</p><p class="w-muted">' + esc(notes[0].d) + " · " + esc(notes[0].by) + "</p>" : '<p class="w-muted">Nog geen notities.</p>', { desc: "Alleen voor trainers" }) + "</div>";
      if (c.ws === "sf") h += card("Tegoed", (sum.abos.map(function (a) { return '<div class="w-abo"><b>' + esc(a.name) + "</b> " + statusBadge(a) + "<p>" + aboLine(a) + "</p></div>"; }).join("") + sum.balances.map(balBlock).join("") + flagList(sum, c)) || '<p class="w-muted">Geen abonnement of credits.</p>', { act: btn("Alles bekijken", "w-tab", { k: "outline sm", d: { v: "billing" } }) });
      h += '<div class="w-grid2">' + lastCard(c.id) + progressCard(c.id) + "</div>";
      if (prog && false) {
        var W_ = 600, H_ = 140, mn = Math.min.apply(null, prog) - 5, mx = Math.max.apply(null, prog) + 2.5;
        var pts = prog.map(function (v, j) { return [j / (prog.length - 1) * (W_ - 20) + 10, H_ - 10 - (v - mn) / (mx - mn) * (H_ - 30)]; }), line = pts.map(function (p, j) { return (j ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(""), lp = pts[pts.length - 1];
        h += card("Bankdrukken · zwaarste set", '<div class="w-big">' + String(prog[prog.length - 1]).replace(".", ",") + ' kg <span class="w-up">+' + String(prog[prog.length - 1] - prog[0]).replace(".", ",") + " kg</span></div>" +
          '<svg viewBox="0 0 ' + W_ + " " + H_ + '" class="w-chart"><defs><linearGradient id="wcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.3"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs><path d="' + line + "L" + lp[0] + " " + H_ + "L" + pts[0][0] + " " + H_ + 'Z" fill="url(#wcg)"/><path d="' + line + '" fill="none" style="stroke:var(--accent)" stroke-width="2.5"/><circle cx="' + lp[0] + '" cy="' + lp[1] + '" r="5" style="fill:var(--accent)"/></svg>', { desc: "Laatste 8 weken" });
      }
    } else if (w.tab === "billing") {
      if (c.ws !== "sf") { h += card("", '<p class="w-muted">' + esc(c.name.split(" ")[0]) + " is klant van " + esc(D.workspaces[c.ws].name) + ". Abonnementen, tegoed en betalingen daar ziet alleen de eigenaar van " + esc(D.workspaces[c.ws].name) + ".</p>"); return h; }
      if (sum.flags.length) h += '<div class="w-flags">' + flagList(sum, c) + "</div>";
      if (sum.balances.length) h += '<div class="w-grid' + Math.min(3, Math.max(2, sum.balances.length)) + '">' + sum.balances.map(function (x) { return card("", balBlock(x)); }).join("") + "</div>";
      h += card("Abonnementen en credits", sum.b.agreements.length ? sum.b.agreements.map(function (a) {
        var open = w.hist === a.id;
        return '<div class="w-agr"><div class="w-agr-h"><div><b>' + esc(a.name) + "</b> " + badge(D.KIND[a.kind], "", "secondary") + " " + statusBadge(a) + '<p class="w-muted">' + (money(c) ? esc(a.price) + " · " + esc(a.cycle) + " · " : "") + "sinds " + esc(a.since) + " · " + esc(a.period) + (a.next && a.next !== "—" && money(c) ? " · volgende betaling " + esc(a.next) : "") + "</p>" +
          (a.kind === "abo" ? "<p>" + aboLine(a) + "</p>" : "<p>" + a.used + " gebruikt · " + a.planned + " gepland · <b>" + (a.total - a.used - a.planned) + " over</b> van " + a.total + "</p>") + "</div>" +
          btn(open ? "Verberg geschiedenis" : "Geschiedenis", "w-hist", { k: "outline sm", d: { id: a.id } }) + "</div>" + renewLine(sum, a, c) +
          (open ? table(["Datum", "Wat", "Credits", "Door"], a.hist.map(function (x) { var sg = x[2].charAt(0); return [esc(x[0]), esc(x[1]), '<span class="w-tnum ' + (sg === "+" ? "w-plus" : sg === "−" ? "w-minus" : "w-muted") + '">' + esc(sg === "+" || sg === "−" ? x[2] : "(" + x[2] + ")") + "</span>", esc(x[3])]; })) : "") + "</div>";
      }).join("") : '<p class="w-muted">' + esc(c.name.split(" ")[0]) + " heeft nog geen abonnement of credits.</p>", { desc: "Elke credit telt alleen voor zijn eigen soort: groep, privé of Open Gym.", act: money(c) ? btn("Aanbod sturen", "w-dlg", { k: "outline sm", i: "plus", d: { n: "offer" } }) : "" });
      if (money(c)) h += card("Betalingen en facturen", sum.b.payments.length ? table(["Datum", "Omschrijving", "Bedrag", "Methode", "Status", "Factuur", ""], sum.b.payments.map(function (p, pi) {
        return [esc(p[0]), esc(p[1]), '<span class="w-tnum">' + esc(p[2]) + "</span>", esc(p[3]), badge(PAY[p[4]][0], PAY[p[4]][1], PAY[p[4]][1] ? "" : "outline"), p[5] ? '<button class="w-link" data-a="w-toast" data-m="Factuur gedownload">' + esc(p[5]) + "</button>" : '<span class="w-muted">—</span>', p[4] === "paid" ? btn("Terugbetalen", "w-dlg", { k: "ghost sm", d: { n: "refund", i: pi } }) : ""];
      })) : '<p class="w-muted">Nog geen betalingen.</p>', { desc: "Klanten betalen online. Een mislukte incasso staat hier als open bedrag." });
      else h += '<p class="w-muted">Bedragen en betalingen ziet alleen de eigenaar.</p>';
    } else if (w.tab === "sessions") {
      h += card("", sess.length ? table(["Datum", "Tijd", "Locatie", "Trainer", "Aanwezigheid"], sess.map(function (x) { return [F.shortDate(F.parse(x[0])), '<span class="w-tnum">' + x[1].s + "–" + x[1].e + "</span>", esc(shortLoc(x[1].loc)), esc(who(x[1]) === ME() ? "Jij" : who(x[1])), x[1].att === "yes" ? badge("Aanwezig", "var(--ok)") : x[1].att === "no" ? badge("Niet verschenen", "var(--danger)") : badge(F.isPast(x[1], x[0]) ? "Nog invullen" : "Gepland", "", "secondary")]; })) : '<p class="w-muted">Geen privésessies in deze periode.</p>');
    } else if (w.tab === "workouts") {
      h += card("", hist.length ? '<ul class="w-list plain">' + hist.map(function (x) { return "<li><div><b>" + esc(x.name) + "</b><p>" + esc(x.d) + " · " + x.n + " oefeningen · " + esc(x.by) + "</p>" + (x.sets ? '<p class="w-muted">' + x.sets.map(function (st) { return esc(st[0]) + " " + esc(st[1]) + " " + dtag(st[2]); }).join(" · ") + "</p>" : "") + (x.note ? '<p class="w-note" translate="no">' + ic("note") + "<span>" + esc(x.note) + "</span></p>" : "") + "</div>" + btn("Delen", "w-toast", { k: "outline sm", d: { m: "Gedeeld met " + c.name.split(" ")[0] } }) + "</li>"; }).join("") + "</ul>" : '<p class="w-muted">Nog geen trainingen.</p>');
    } else if (w.tab === "bookings") {
      h += card("", book.length ? table(["Datum", "Tijd", "Les", "Status"], book.map(function (x) { return [F.shortDate(F.parse(x[0])), '<span class="w-tnum">' + x[1].s + "</span>", esc(itemTitle(x[1])), badge(F.isPast(x[1], x[0]) ? "Geweest" : "Geboekt", "", "secondary")]; })) : '<p class="w-muted">Nog geen boekingen van groepslessen of Open Gym.</p>');
    } else if (w.tab === "notes") {
      h += card("Nieuwe notitie", '<textarea class="w-input" data-wf="note" rows="3" placeholder="Bijvoorbeeld een blessure of een doel"></textarea><div class="w-hgroup end" style="margin-top:10px"><span class="w-muted">Alleen trainers van ' + esc(D.workspaces[c.ws].name) + " zien dit.</span>" + btn("Opslaan", "w-note", { d: { id: c.id } }) + "</div>") +
        card("Notities", notes.length ? '<ul class="w-list plain">' + notes.map(function (n) { return '<li><div><p translate="no">' + esc(n.t) + '</p><p class="w-muted">' + esc(n.d) + " · " + esc(n.by) + "</p></div></li>"; }).join("") + "</ul>" : '<p class="w-muted">Nog geen notities.</p>');
    } else {
      h += card("", '<ol class="w-timeline"><li><b>Klant toegevoegd</b><span>12 aug · Sarah</span></li><li><b>Uitnodiging geaccepteerd</b><span>12 aug</span></li><li><b>Eerste privésessie</b><span>19 aug · Sarah</span></li><li><b>Taal voor e-mails gewijzigd naar ' + esc(c.lang) + "</b><span>3 sep</span></li></ol>");
    }
    return h;
  };

  /* Classes: the series, and one class on a date with attendance, the waitlist (F062) and its actions */
  /* a series = the coming dates of one weekly class (next two weeks in the prototype) */
  if (!D.seriesStopped) D.seriesStopped = {};
  function seriesItems(title) { var out = []; for (var i = 0; i <= 13; i++) { var k = F.key(F.add(F.NOW, i)); studioItems(k).forEach(function (it) { if (it.type === "group" && it.title === title && !F.isPast(it, k)) out.push([k, it]); }); } return out; }
  function classSeries() {
    var map = {};
    for (var i = 0; i <= 13; i++) { var k = F.key(F.add(F.NOW, i)); studioItems(k).forEach(function (it) {
      if (it.type !== "group" || F.isPast(it, k)) return;
      var m = map[it.title] || (map[it.title] = { title: it.title, days: [], cap: it.cap, trainer: who(it), next: null, future: 0, booked: 0, stopped: !!D.seriesStopped[it.title] });
      var d = F.DS[F.parse(k).getDay()] + " " + it.s; if (m.days.indexOf(d) < 0) m.days.push(d);
      if (!it.cancelled) { m.future++; m.booked += it.people.length; if (!m.next) m.next = [k, it]; }
    }); }
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  PAGES.classes = function () {
    var ser = classSeries();
    return '<div class="w-row-between"><p class="w-muted">Een reeks herhaalt elke week. Hier wijzig of stop je de hele reeks; één datum wijzig je bij die les.</p>' + btn("Nieuwe les", "w-new-class", { i: "plus" }) + "</div>" +
      card("", table(["Les", "Wanneer", "Trainer", "Plekken", "Volgende", ""], ser.map(function (m) {
        return ["<b>" + esc(m.title) + "</b>" + (m.stopped ? " " + badge("Gestopt", "", "outline") : ""), esc(m.days.slice(0, 3).join(", ")), esc(m.trainer === ME() ? "Jij" : m.trainer), String(m.cap),
          m.next ? '<button class="w-link" data-a="w-open-class" data-id="' + m.next[1].id + '">' + F.shortDate(F.parse(m.next[0])) + " " + m.next[1].s + " · " + m.next[1].people.length + "/" + m.next[1].cap + "</button>" : "—",
          m.stopped ? "" : '<div class="w-hgroup end">' + btn("Wijzigen", "w-dlg", { k: "outline sm", d: { n: "editseries", t: m.title } }) + btn("Stoppen", "w-dlg", { k: "ghost sm", d: { n: "stopseries", t: m.title } }) + "</div>"];
      })));
  };
  function waitNames(it) { var n = it.waitlist || 0, out = []; for (var i = 0; i < n; i++) out.push(["Kim de Graaf", "Ruben Vos", "Lotte Prins", "Sem Dekker"][i % 4]); return out; }
  PAGES.klass = function () {
    var w = W(), f = F.findItem(w.kid); if (!f) { w.page = "classes"; return PAGES.classes(); }
    var it = f.it, k = f.day, am = it.attMap || (it.attMap = {}), h = "", free = it.cap - it.people.length, ds = desc(it.title);
    h += '<div class="w-phead"><span class="w-av lg" style="--c:' + F.CV[it.type] + ';border-radius:14px">' + ic(it.type === "gym" ? "door" : "group") + "</span><div><h2>" + esc(it.title) + (it.cancelled ? " " + badge("Geannuleerd", "var(--danger)") : "") + "</h2><p>" + F.longDate(F.parse(k)) + " · " + it.s + "–" + it.e + " · " + esc(shortLoc(it.loc)) + (it.type !== "gym" ? " · " + esc(who(it) === ME() ? "Jij" : who(it)) : "") + "</p></div>" +
      '<div class="w-hgroup end">' + (it.type !== "gym" ? btn("Trainer vervangen", "w-dlg", { k: "outline", d: { n: "sub" } }) : "") + btn("Wijzigen", "w-dlg", { k: "outline", d: { n: "editclass" } }) + btn("Les annuleren", "w-dlg", { k: "dng", d: { n: "cancelclass" }, dis: it.cancelled }) + "</div></div>";
    h += '<div class="w-kpis" style="--n:3">' + kpi("Geboekt", it.people.length + "<small>/" + it.cap + "</small>", free > 0 ? free + (free === 1 ? " plek vrij" : " plekken vrij") : "vol", F.CV[it.type], it.people.length, it.cap) +
      kpi("Aanwezig", String(Object.keys(am).filter(function (x) { return am[x] === "yes"; }).length), "van " + it.people.length, "var(--ok)") + kpi("Wachtlijst", String(it.waitlist || 0), it.waitlist ? "op volgorde" : "niemand", "var(--accent)") + "</div>";
    h += '<div class="w-grid2">' + card("Deelnemers", it.people.length ? table(["Naam", "Aanwezigheid"], it.people.map(function (p, i) { return ['<span class="w-cell">' + av(personName(p), F.CLIENT[p] ? F.CLIENT[p].c : null) + "<b>" + esc(personName(p)) + "</b></span>", '<div class="w-seg">' + ["yes", "no"].map(function (v) { return '<button class="' + (am[i] === v ? "on " + v : "") + '" data-a="w-att" data-id="' + it.id + '" data-i="' + i + '" data-v="' + v + '">' + (v === "yes" ? "Aanwezig" : "Niet verschenen") + "</button>"; }).join("") + "</div>"]; })) : '<p class="w-muted">Nog niemand geboekt.</p>', { act: it.people.length ? btn("Iedereen aanwezig", "w-att-all", { k: "outline sm", d: { id: it.id } }) : "" }) +
      '<div class="w-stack">' + (it.type === "group" ? card("Wachtlijst", it.waitlist ? '<ol class="w-list plain num">' + waitNames(it).map(function (n, i) { return "<li><div><b>" + (i + 1) + ". " + esc(n) + '</b></div><button class="w-icon" data-a="w-dlg" data-n="wlremove" data-i="' + i + '" aria-label="' + esc(n) + ' van de wachtlijst halen">' + ic("x") + "</button></li>"; }).join("") + "</ol>" : '<p class="w-muted">Niemand op de wachtlijst.</p>', { desc: "Komt er een plek vrij, dan krijgt de eerste die plek en een e-mail." }) : "") +
      (ds ? card("Beschrijving", '<p translate="no"' + (ds.nl ? ' lang="nl"' : "") + ">" + esc(ds.t) + "</p>", { desc: "Zo zien klanten deze les." }) : "") + "</div></div>";
    return h;
  };
  PAGES.gym = function () {
    var rows = [];
    for (var i = 0; i <= 6; i++) { var k = F.key(F.add(F.NOW, i)); studioItems(k).forEach(function (it) { if (it.type === "gym") rows.push([F.shortDate(F.parse(k)), '<span class="w-tnum">' + it.s + "–" + it.e + "</span>", bar(it.people.length, it.cap, "var(--gym)") + ' <span class="w-tnum">' + it.people.length + "/" + it.cap + "</span>", badge("Gepubliceerd", "var(--ok)"), '<button class="w-icon" data-a="w-open-class" data-id="' + it.id + '" aria-label="Openen">' + ic("chevR") + "</button>"]); }); }
    return '<div class="w-row-between"><p class="w-muted">Losse blokken waarin klanten zelf komen trainen.</p>' + btn("Nieuw blok", "w-new-gym", { i: "plus" }) + "</div>" + card("", rows.length ? table(["Dag", "Tijd", "Geboekt", "Status", ""], rows) : '<p class="w-muted">Nog geen blokken.</p>');
  };
  var TY = { wr: "Gewicht × herhalingen", r: "Alleen herhalingen", t: "Tijd", dt: "Afstand + tijd" };
  PAGES.workouts = function () {
    var w = W(), tab = w.wtab || "ex", h = '<div class="w-row-between">' + tabs([["ex", "Oefeningen"], ["tpl", "Schema's"]], tab, "w-wtab") + (tab === "ex" ? btn("Nieuwe oefening", "w-ex-new", { i: "plus" }) : btn("Nieuw schema", "w-tpl-new", { i: "plus" })) + "</div>";
    if (tab === "ex") {
      var own = D.library.filter(function (e) { return e.own; }), lib = D.library.filter(function (e) { return !e.own; });
      h += card("Eigen oefeningen", own.length ? table(["Oefening", "Soort", "Spieren", "Gemaakt door", ""], own.map(function (e) { var i = D.library.indexOf(e); return ["<b>" + esc(e.n) + "</b>", TY[e.ty], esc(e.mu || "—"), esc(e.by || "—"), '<div class="w-hgroup end">' + btn("Wijzigen", "w-ex-edit", { k: "outline sm", d: { i: i } }) + btn("Verwijderen", "w-dlg", { k: "ghost sm", d: { n: "exdel", i: i } }) + "</div>"]; })) : '<p class="w-muted">Nog geen eigen oefeningen.</p>', { desc: "Gemaakt door trainers van " + esc(wsName()) + ". Die wijzig of verwijder je zelf." });
      h += card("Bibliotheek", table(["Oefening", "Ook", "Soort", "Spieren"], lib.map(function (e) { return ["<b>" + esc(e.n) + "</b>", esc(e.en), TY[e.ty], esc(e.mu)]; })), { desc: "De oefeningen van Fivvi, in het Nederlands en Engels. Mist er een, maak dan een eigen oefening." });
    } else {
      h += '<div class="w-grid3">' + Object.keys(D.tpl).map(function (t) {
        var rows = D.tpl[t];
        return card(esc(t), '<ul class="w-tpl">' + rows.map(function (r) { return "<li><span>" + esc(r[0]) + '</span><b class="w-tnum">' + r[1] + " × " + esc(r[2]) + "</b></li>"; }).join("") + "</ul>", { act: '<div class="w-hgroup">' + btn("Wijzigen", "w-tpl-edit", { k: "outline sm", d: { t: t } }) + '<button class="w-icon" data-a="w-dlg" data-n="tpldel" data-t="' + esc(t) + '" aria-label="' + esc(t) + ' verwijderen">' + ic("trash") + "</button></div>" });
      }).join("") + "</div>";
    }
    return h;
  };
  /* The team (PRODUCT §9): Owner or Trainer per person. The owner changes roles and removes people; name and email
     belong to the person's own account. Removing takes only the team rights: their own bookings as a client stay. */
  if (!D.roles) D.roles = {};
  if (!D.invited) D.invited = [];
  function role(t) { return D.roles[t] || (t === ME() ? "owner" : "trainer"); }
  function owners() { return D.trainers.sf.filter(function (t) { return role(t) === "owner"; }); }
  function tmail(t) { return t.split(" ")[0].toLowerCase() + "@example.com"; }
  /* what a trainer has in the coming two weeks, to hand over when they leave */
  function upcomingOf(t) { var out = []; for (var i = 0; i <= 13; i++) { var k = F.key(F.add(F.NOW, i)); studioItems(k).forEach(function (it) { if (it.type !== "gym" && !it.cancelled && who(it) === t && !(k === F.TODAY && F.isPast(it, k))) out.push(it); }); } return out; }
  PAGES.trainers = function () {
    var rows = D.trainers.sf.map(function (t) {
      var me = t === ME(), soleOwner = role(t) === "owner" && owners().length === 1;
      return ['<span class="w-cell">' + av(t, me ? "var(--accent)" : null) + "<b>" + esc(t) + (me ? ' <span class="w-muted">(jij)</span>' : "") + "</b></span>", esc(tmail(t)),
        role(t) === "owner" ? "Eigenaar" : "Trainer", badge("Actief", "var(--ok)"),
        '<div class="w-hgroup end">' + btn("Rol wijzigen", "w-dlg", { k: "outline sm", d: { n: "trole", t: t } }) + (me || soleOwner ? "" : btn("Verwijderen", "w-dlg", { k: "ghost sm", d: { n: "tremove", t: t } })) + "</div>"];
    }).concat(D.invited.map(function (x, i) {
      return ['<span class="w-cell">' + av(x.email, "#8E8E93") + '<b class="w-muted">' + esc(x.email) + "</b></span>", esc(x.email), "Trainer", badge("Uitgenodigd", "", "outline"),
        '<div class="w-hgroup end">' + btn("Opnieuw sturen", "w-toast", { k: "outline sm", d: { m: "Uitnodiging opnieuw verstuurd" } }) + btn("Intrekken", "w-dlg", { k: "ghost sm", d: { n: "tinvdel", i: i } }) + "</div>"];
    }));
    return '<div class="w-row-between"><p class="w-muted">Iedereen die bij ' + esc(wsName()) + " traint. Een eigenaar kan alles, ook betalingen, aanbod en instellingen; een trainer doet zijn eigen sessies, lessen en klanten.</p>" + btn("Trainer uitnodigen", "w-dlg", { i: "personPlus", d: { n: "invite" } }) + "</div>" +
      card("", table(["Naam", "E-mail", "Rol", "Status", ""], rows)) + '<p class="w-muted" style="margin-top:10px">Naam en e-mailadres beheert ieder zelf, in het eigen profiel.</p>';
  };
  function qr(seed) {
    var n = 25, cells = "", r = 7;
    function on(x, y) { var f = function (a, b) { return x >= a && x < a + 7 && y >= b && y < b + 7; }; if (f(0, 0) || f(n - 7, 0) || f(0, n - 7)) { var lx = x < 7 ? x : x - (n - 7), ly = y < 7 ? y : y - (n - 7); return lx === 0 || ly === 0 || lx === 6 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4); } r = (r * 1103515245 + 12345 + seed) % 2147483648; return (r >> 16) % 2 === 0; }
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (on(x, y)) cells += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
    return '<svg class="w-qr" viewBox="-2 -2 ' + (n + 4) + " " + (n + 4) + '" aria-label="QR-code"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><g fill="#111">' + cells + "</g></svg>";
  }
  PAGES.link = function () {
    var w = W(), code = w.linkCode || "7KQ2", url = "fivvi.app/j/" + slug() + "-" + code;
    return '<div class="w-grid2">' + card("Aanmeldlink", '<p>Nieuwe klanten openen deze link of scannen de QR-code, loggen in en vragen om mee te doen. Jij keurt ze goed bij Klanten.</p><div class="w-copy"><code>' + url + "</code>" + btn("Kopiëren", "w-toast", { k: "outline sm", d: { m: "Link gekopieerd" } }) + '</div><div class="w-hgroup" style="margin-top:14px">' + btn("QR-code downloaden", "w-toast", { k: "outline", d: { m: "QR-code gedownload" } }) + btn("Poster afdrukken", "w-poster", { k: "outline", i: "share" }) + btn("Link vernieuwen", "w-dlg", { k: "outline", d: { n: "renew" } }) + "</div>", { desc: "Eén link voor je hele werkruimte" }) +
      card("QR-code voor de balie", '<div class="w-qrbox">' + qr(code.charCodeAt(0)) + "<b>" + esc(wsName()) + "</b><span>Scan om mee te doen</span></div>") + "</div>" +
      (F.HAS("group") || F.HAS("gym") ? card("Links naar een les", '<p class="w-muted">Werken alleen voor goedgekeurde klanten.</p>' + table(["Les", "Link", ""], classSeries().slice(0, 4).map(function (m) { return [esc(m.title), "<code>fivvi.app/w/" + slug() + "/l/" + m.title.toLowerCase().replace(/[^a-z]+/g, "-") + "</code>", btn("Kopiëren", "w-toast", { k: "ghost sm", d: { m: "Link gekopieerd" } })]; }))) : "");
  };
  PAGES.settings = function () {
    var w = W(), t = w.stab || "general", h = tabs([["general", "Algemeen"], ["location", "Locatie"], ["booking", "Boeken en annuleren"], ["language", "Taal"]], t, "w-stab");
    function fl(l, inp, hint) { return '<label class="w-field"><span>' + l + "</span>" + inp + (hint ? "<small>" + hint + "</small>" : "") + "</label>"; }
    if (t === "general") h += card("Algemeen", fl("Naam", '<input class="w-input" value="' + esc(wsName()) + '">') + fl("Tijdzone", '<select class="w-input"><option>Europe/Amsterdam</option></select>'), { act: btn("Opslaan", "w-toast", { d: { m: "Opgeslagen" } }) });
    /* what the workspace calls its trainers; clients and staff see this word everywhere in this workspace */
    if (t === "general") { var tm = D.workspaces.sf.term || "trainer"; h += card("Woordkeuze", '<div class="w-terms" translate="no">' + Object.keys(D.TERMS).map(function (k) { var x = D.TERMS[k][F.PREF.lang === "en" ? "en" : "nl"]; return '<button class="' + (tm === k ? "on" : "") + '" data-a="w-term" data-v="' + k + '" aria-pressed="' + (tm === k) + '"><b>' + x[0][0].toUpperCase() + x[0].slice(1) + "</b><span>" + x[1] + "</span></button>"; }).join("") + "</div>" + '<p class="w-muted">Hoe noem je de mensen die lesgeven? Klanten en je team zien dit woord overal in ' + esc(wsName()) + ": in het rooster, de app, e-mails en op de poster. Pilatesstudio's kiezen vaak instructeur, yogastudio's docent.</p>"); }
    else if (t === "location") h += card("Locatie", fl("Adres", '<input class="w-input" value="' + esc(D.workspaces.sf.location) + '">', "Bij livegang heeft elke werkruimte één locatie."), { act: btn("Opslaan", "w-toast", { d: { m: "Opgeslagen" } }) });
    else if (t === "booking") h += card("Boeken en annuleren", fl("Annuleren zonder kosten tot", '<div class="w-inline"><input class="w-input sm" value="12"> uur voor de start</div>') + (F.HAS("group") ? fl("Wachtlijst sluit", '<div class="w-inline"><input class="w-input sm" value="30"> minuten voor de start</div>', "Daarna schuift niemand meer door.") : "") + fl("Boekingen per week per klant", '<div class="w-inline"><input class="w-input sm" value="4"> of leeg voor geen limiet</div>'), { act: btn("Opslaan", "w-toast", { d: { m: "Opgeslagen" } }) });
    else h += card("Taal", fl("Standaardtaal voor e-mails", '<select class="w-input"><option>Nederlands</option><option>English</option></select>', "Voor klanten zonder eigen voorkeur."), { act: btn("Opslaan", "w-toast", { d: { m: "Opgeslagen" } }) });
    return h;
  };

  /* Aanbod (F052, PRODUCT §90): what the workspace sells. Owner only. */
  var OKIND = { abo: ["Abonnement", "Abonnementen"], pack: ["Creditpakket", "Creditpakketten"], plan: ["Creditabonnement", "Creditabonnementen"], single: ["Losse les", "Losse lessen"] };
  function offerFits(o) { return (o.kind === "abo" || o.credit === "groep" ? F.HAS("group") : true) && (o.credit === "gym" ? F.HAS("gym") : true); }
  function offerColor(o) { return o.kind === "abo" || o.kind === "single" ? "var(--group)" : D.CREDIT[o.credit][2]; }
  function per(cycle) { return { "Elke maand": "per maand", "Elke 4 weken": "per 4 weken", "Eenmalig": "eenmalig", "Bij het boeken": "per les" }[cycle] || ""; }
  function offerFacts(o) {
    var L = o.credit ? D.CREDIT[o.credit] : null, x = [];
    if (o.kind === "abo") { x.push(o.perWeek + (o.perWeek === 1 ? " groepsles" : " groepslessen") + " per week" + (o.makeups ? " · " + o.makeups + " inhaallessen per maand" : "")); x.push(o.term + " · " + (o.end === "stop" ? "stopt aan het einde" : "loopt daarna per maand door")); }
    if (o.kind === "pack") { x.push(o.credits + " " + (o.credits === 1 ? L[0] : L[1]) + " · geldig " + o.valid); if (o.intro) x.push("1× per klant (proefaanbod)"); if (o.memberOnly) x.push("Alleen voor klanten met een abonnement"); }
    if (o.kind === "plan") { x.push(o.credits + " " + (o.credits === 1 ? L[0] : L[1]) + " " + per(o.cycle) + " · meenemen max. " + o.carry); x.push("Minimaal " + o.minTerm + " · loopt door tot de klant opzegt"); }
    if (o.kind === "single") x.push("Eén groepsles, betaald bij het boeken");
    if (o.end === "stop" && o.renew) x.push("Verlengen voorstellen: " + o.renew + " dagen voor het einde" + (o.kind === "pack" ? " of bij 2 over" : ""));
    return x;
  }
  function offerCard(o) {
    var priced = o.price !== "";
    return '<div class="w-offer' + (o.on ? "" : " off") + '" style="--c:' + offerColor(o) + '"><div class="w-offer-h"><span class="w-offer-ic">' + ic(o.kind === "abo" ? "cal" : o.kind === "plan" ? "repeat" : o.credit === "gym" ? "door" : o.credit === "prive" ? "me" : "group") + "</span>" +
      "<div><b>" + esc(o.name) + "</b><span>" + OKIND[o.kind][0] + (o.def ? " · standaardplan" : "") + "</span></div>" +
      '<button class="w-switch' + (o.on ? " on" : "") + '" data-a="w-offer-on" data-id="' + o.id + '" role="switch" aria-checked="' + o.on + '" aria-label="' + (o.on ? "Aan: klanten kunnen het kopen" : "Uit") + '"><i></i></button></div>' +
      '<div class="w-offer-p">' + (priced ? "<b>€ " + esc(o.price) + "</b> <span>" + per(o.cycle) + " · " + o.vat + "% btw</span>" : '<span class="w-need">' + ic("warn") + "Prijs nodig</span>") + "</div>" +
      '<ul class="w-offer-x">' + offerFacts(o).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      '<div class="w-offer-f"><span class="w-muted">' + (o.active ? o.active + (o.active === 1 ? " lopende afspraak" : " lopende afspraken") : o.on ? "Nog niet verkocht" : "Klanten zien het niet") + "</span>" +
      btn("Wijzigen", "w-dlg", { k: "outline sm", d: { n: "offer-edit", id: o.id } }) + '<button class="w-icon" data-a="w-dlg" data-n="offer-del" data-id="' + o.id + '" aria-label="Verwijderen">' + ic("trash") + "</button></div></div>";
  }
  PAGES.offers = function () {
    var all = D.offerList.filter(offerFits), own = all.filter(function (o) { return !o.def; }), defs = all.filter(function (o) { return o.def; });
    var h = '<div class="w-row-between"><p class="w-muted">Wat je verkoopt. Klanten zien alleen aanbod dat aan staat. Een wijziging geldt voor nieuwe afspraken: lopende afspraken houden hun voorwaarden.</p>' + btn("Nieuw aanbod", "w-dlg", { i: "plus", d: { n: "offer-edit" } }) + "</div>";
    ["abo", "pack", "plan", "single"].forEach(function (k) { var os = own.filter(function (o) { return o.kind === k; }); if (os.length) h += '<h3 class="w-sec">' + OKIND[k][1] + '</h3><div class="w-offers">' + os.map(offerCard).join("") + "</div>"; });
    if (defs.length) h += '<h3 class="w-sec">Standaardplannen</h3><p class="w-muted" style="margin:-4px 0 10px">Elke nieuwe werkruimte begint met deze drie. Ze staan uit tot je een prijs invult; Fivvi stelt nooit een prijs voor.</p><div class="w-offers">' + defs.map(offerCard).join("") + "</div>";
    return h;
  };
  function offerById(id) { return D.offerList.filter(function (o) { return o.id === id; })[0]; }
  function offerForm(o) { o = o || {}; return { id: o.id || "", kind: o.kind || "abo", name: o.name || "", nameEn: o.nameEn || "", price: o.price || "", vat: o.vat || "9", cycle: o.cycle || "Elke maand", perWeek: String(o.perWeek || 2), term: o.term || "6 maanden", end: o.end || "stop", renew: String(o.renew != null ? o.renew : 30), credit: o.credit || "groep", credits: String(o.credits || 10), valid: o.valid || "3 maanden", carry: String(o.carry || 0), minTerm: o.minTerm || "3 maanden", intro: o.intro ? "ja" : "nee", memberOnly: o.memberOnly ? "ja" : "nee" }; }
  function offerDialog(d) {
    var f = W().form, o = d.id ? offerById(d.id) : null, k = f.kind, cr = [["groep", "Groepscredits"], ["prive", "Privécredits"]].concat(F.HAS("gym") ? [["gym", "Open Gym-credits"]] : []);
    var b = "";
    if (!o) b += '<div class="w-starts"><span class="w-muted">Begin met een standaardplan:</span>' + D.offerList.filter(function (x) { return x.def && offerFits(x); }).map(function (x) { return btn(x.name, "w-offer-tpl", { k: "outline sm", d: { id: x.id } }); }).join("") + "</div>";
    b += (o ? "" : fld("Soort", selF("kind", [["abo", "Abonnement: lessen per week"], ["pack", "Creditpakket: één keer betalen"], ["plan", "Creditabonnement: credits per periode"], ["single", "Losse les"]].filter(function (x) { return x[0] !== "abo" && x[0] !== "single" || F.HAS("group"); }))));
    b += '<div class="w-inline2">' + fld("Naam", inp("name", "text", "Bijvoorbeeld Groep 2× per week")) + fld("Naam in het Engels", inp("nameEn", "text", "Optioneel")) + "</div>";
    b += '<div class="w-inline2">' + fld("Prijs incl. btw (€)", inp("price", "text", "Bijvoorbeeld 69")) + fld("Btw", selF("vat", [["9", "9%"], ["21", "21%"], ["0", "0%"]])) + "</div>";
    if (k === "abo") b += '<div class="w-inline2">' + fld("Lessen per week", selF("perWeek", ["1", "2", "3"])) + fld("Looptijd", selF("term", ["3 maanden", "6 maanden", "12 maanden"])) + fld("Betalen", selF("cycle", ["Elke maand", "Elke 4 weken"])) + "</div>";
    if (k === "pack" || k === "plan") b += '<div class="w-inline2">' + fld("Soort credits", selF("credit", cr)) + fld(k === "pack" ? "Aantal credits" : "Credits per periode", inp("credits", "number")) + (k === "pack" ? fld("Geldig", selF("valid", ["1 week", "2 weken", "1 maand", "3 maanden", "6 maanden", "12 maanden"])) : fld("Betalen", selF("cycle", ["Elke maand", "Elke 4 weken"]))) + "</div>";
    if (k === "plan") b += '<div class="w-inline2">' + fld("Meenemen naar de volgende periode (max.)", inp("carry", "number")) + fld("Minimale looptijd", selF("minTerm", ["1 maand", "3 maanden", "6 maanden"])) + "</div>";
    if (k === "pack") b += '<div class="w-inline2">' + fld("Eén keer per klant (proefaanbod)", selF("intro", [["nee", "Nee"], ["ja", "Ja"]])) + fld("Alleen voor klanten met een abonnement", selF("memberOnly", [["nee", "Nee"], ["ja", "Ja"]])) + "</div>";
    if (k === "abo" || k === "plan") b += fld("Aan het einde", selF("end", [["stop", "Stopt: de klant kiest een nieuwe looptijd"], ["continue", "Loopt per maand door tot de klant opzegt"]]));
    if (k !== "single" && (k === "pack" || f.end === "stop")) b += fld("Verlengen voorstellen", '<div class="w-inline"><input class="w-input sm" data-wf="renew" type="number" value="' + esc(f.renew) + '"> dagen voor het einde</div>', k === "pack" ? "En als er 2 credits of minder over zijn." : "Fivvi zet dan Verlengen bij de klant, voor jou en in de app.");
    b += '<p class="w-muted">' + (o && o.active ? "Wijzigingen gelden voor nieuwe afspraken. De " + o.active + " lopende afspraken houden hun voorwaarden." : "Zonder prijs blijft het aanbod uit. Credits van verschillende soorten mengen nooit.") + "</p>";
    return b;
  }

  /* The QR poster for the desk or the wall: Dutch and English together, so every visitor can read it */
  function poster() {
    var w = W(), bw = w.posterBw, code = w.linkCode || "7KQ2", url = "fivvi.app/j/" + slug() + "-" + code, classes = F.HAS("group") || F.HAS("gym");
    var steps = [["Scan de code", "Scan the code"], ["Log in met je e-mail", "Sign in with your email"], ["Wacht tot we je goedkeuren", "Wait for our approval"]];
    var p = '<div class="pst' + (bw ? " bw" : "") + '" translate="no"><div class="pst-top"><span class="pst-logo">' + F.initials(wsName()) + "</span><b>" + esc(wsName()) + "</b></div>" +
      '<h2>Doe mee<span>Join us</span></h2><div class="pst-qr">' + qr(code.charCodeAt(0)) + "</div>" +
      '<ol class="pst-steps">' + steps.map(function (x, i) { return "<li><i>" + (i + 1) + "</i><span><b>" + x[0] + "</b>" + x[1] + "</span></li>"; }).join("") + "</ol>" +
      '<p class="pst-then"><b>' + (classes ? "Daarna boek je je lessen in een paar tikken." : "Daarna zie je al je sessies op één plek.") + "</b>" + (classes ? "Then book your classes in a few taps." : "Then see all your sessions in one place.") + "</p>" +
      '<div class="pst-foot"><code>' + url + "</code><span>" + esc(D.workspaces.sf.location) + "</span></div></div>";
    return '<div class="w-scrim dark" data-a="w-poster-close"></div><div class="w-postw" role="dialog" aria-label="Poster"><div class="w-postbar"><b>Poster · A4</b>' + tabs([["c", "Kleur"], ["bw", "Zwart-wit"]], bw ? "bw" : "c", "w-poster-bw") +
      '<span class="w-sp"></span>' + btn("PDF downloaden", "w-toast", { k: "outline", d: { m: "PDF gedownload" } }) + btn("Afdrukken", "w-toast", { d: { m: "Opent het afdrukvenster (dat kan niet in dit prototype)" } }) + '<button class="w-icon" data-a="w-poster-close" aria-label="Sluiten">' + ic("x") + "</button></div>" + '<div class="w-postpage">' + p + "</div></div>";
  }
  F.A["w-poster"] = function () { W().poster = true; R(); };
  F.A["w-poster-close"] = function () { W().poster = false; R(); };
  F.A["w-poster-bw"] = function (d) { W().posterBw = d.v === "bw"; R(); };

  /* ---------- overlays ---------- */
  function menu() {
    var items = [["w-new-priv", "Privésessie", "me"]];
    if (F.OWNER() && (F.HAS("group") || F.SOLO())) items.push(["w-new-class", "Groepsles", "group"]);
    if (F.OWNER() && F.HAS("gym")) items.push(["w-new-gym", "Open Gym", "door"]);
    items.push(["w-new-client", "Klant", "personPlus"]);
    /* less frequent, owner only: below a divider so the daily items stay on top */
    if (F.OWNER()) items.push("-", ["w-new-offer", "Aanbod", "repeat"]);
    return '<div class="w-scrim clear" data-a="w-close"></div><div class="w-menu" role="menu">' + items.map(function (x) { return x === "-" ? '<hr role="separator">' : '<button role="menuitem" data-a="' + x[0] + '">' + ic(x[2]) + x[1] + "</button>"; }).join("") + "</div>";
  }
  function sheet() {
    var f = F.findItem(W().sheet), it = f.it, k = f.day, h = "";
    h += '<div class="w-sheet-h"><div>' + badge(it.duo ? "Duosessie" : F.TYPE[it.type], F.CV[it.type]) + F.lvlTag(it) + "<h3>" + esc(itemTitle(it)) + "</h3><p>" + F.longDate(F.parse(k)) + " · " + it.s + "–" + it.e + "</p></div>" + '<button class="w-icon" data-a="w-close" aria-label="Sluiten">' + ic("x") + "</button></div>";
    h += '<dl class="w-dl">' + "<dt>Locatie</dt><dd>" + esc(it.loc) + "</dd>" + (it.type !== "gym" ? "<dt>Trainer</dt><dd>" + esc(who(it) === ME() ? "Jij" : who(it)) + "</dd>" : "") + (it.cap ? "<dt>Geboekt</dt><dd>" + it.people.length + "/" + it.cap + (it.waitlist ? " · " + it.waitlist + " op de wachtlijst" : "") + "</dd>" : "") + (it.duo ? "<dt>Klanten</dt><dd>" + [it.client, it.duo].map(function (x) { return esc(F.CLIENT[x].name); }).join(", ") + "</dd>" : "") + (it.type === "priv" ? "<dt>Aanwezigheid</dt><dd>" + (it.att === "yes" ? "Aanwezig" : it.att === "no" ? "Niet verschenen" : "Nog niet ingevuld") + "</dd>" : "") + "</dl>";
    var ds = it.type === "group" ? desc(it.title) : null;
    if (ds) h += '<p class="w-desc" translate="no"' + (ds.nl ? ' lang="nl"' : "") + ">" + esc(ds.t) + "</p>";
    if (it.type === "priv") (it.duo ? [it.client, it.duo] : [it.client]).forEach(function (x) { h += '<div class="w-sheet-sec"><h4>Vorige keer' + (it.duo ? " · " + esc(F.CLIENT[x].name.split(" ")[0]) : "") + "</h4>" + lastCard(x, true) + "</div>"; });
    h += '<div class="w-sheet-f">' + (it.type === "priv" ? btn("Klantprofiel", "w-client", { k: "outline", d: { id: it.client } }) + btn("Training bijhouden", "w-toast", { k: "outline", d: { m: "Opent het bijhouden van de training (WL-06)" } }) : btn("Les openen", "w-open-class", { k: "outline", d: { id: it.id } })) +
      (it.cancelled ? "" : btn("Verplaatsen", "w-dlg", { k: "outline", d: { n: "move" } }) + btn(it.type === "priv" ? "Sessie annuleren" : "Les annuleren", "w-dlg", { k: "dng", d: { n: it.type === "priv" ? "cancelpriv" : "cancelclass" } })) + "</div>";
    return '<div class="w-scrim" data-a="w-close"></div><aside class="w-sheet" role="dialog" aria-label="' + esc(itemTitle(it)) + '">' + h + "</aside>";
  }
  function fld(l, inp, hint) {
    var m = /data-wf="([^"]+)"/.exec(inp), e = m && W().err && W().err[m[1]];
    return '<label class="w-field' + (e ? " invalid" : "") + '"><span>' + l + "</span>" + inp + (e ? '<small class="err" role="alert">' + ic("warn") + esc(e) + "</small>" : hint ? "<small>" + hint + "</small>" : "") + "</label>";
  }
  function bad(f, msg) { var w = W(); w.err = {}; w.err[f] = msg; F.toast(msg, "err"); return true; }
  function inp(f, type, ph) { return '<input class="w-input" data-wf="' + f + '" type="' + (type || "text") + '" value="' + esc(W().form[f] || "") + '" placeholder="' + esc(ph || "") + '">'; }
  function selF(f, opts) { return '<select class="w-input" data-wf="' + f + '">' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(W().form[f]) === String(v) ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select>"; }
  function dialog() {
    var w = W(), d = w.dialog, it = w.sheet ? F.findItem(w.sheet).it : w.kid ? (F.findItem(w.kid) || {}).it : null, t, b, ok, kind = "", cancel = "Annuleren";
    if (d.n === "cancelclass") { t = "Les annuleren?"; b = "<p>De " + it.people.length + " geboekte klanten krijgen een e-mail" + (it.waitlist ? ", ook de " + it.waitlist + " op de wachtlijst" : "") + ".</p>" + fld("Bericht voor de klanten (optioneel)", '<textarea class="w-input" data-wf="msg" rows="3" placeholder="Bijvoorbeeld de reden"></textarea>', "Komt letterlijk in de e-mail, niet vertaald."); ok = "Les annuleren"; kind = "dng"; cancel = "Terug"; }
    else if (d.n === "cancelpriv") { t = "Sessie annuleren?"; b = "<p>" + esc(F.CLIENT[it.client].name.split(" ")[0]) + " krijgt een e-mail dat de sessie van " + it.s + " niet doorgaat.</p>"; ok = "Sessie annuleren"; kind = "dng"; cancel = "Terug"; }
    else if (d.n === "move") { t = "Verplaatsen"; b = fld("Datum", inp("date", "date")) + fld("Begin", inp("start", "time")) + '<p class="w-muted">' + (it.type === "priv" ? "De klant krijgt" : "Geboekte klanten krijgen") + " een e-mail met de nieuwe tijd.</p>"; ok = "Opslaan"; }
    else if (d.n === "sub") { t = "Trainer vervangen"; b = fld("Wie valt in?", selF("trainer", D.trainers.sf.filter(function (x) { return x !== who(it); }))) + '<p class="w-muted">De invaller krijgt een e-mail. Klanten zien de nieuwe naam bij de les.</p>'; ok = "Vervangen"; }
    else if (d.n === "editclass") { t = "Les wijzigen"; b = fld("Begin", inp("start", "time")) + fld("Eind", inp("end", "time")) + fld("Plekken", inp("cap", "number")) + fld("Niveau", selF("level", [["", "Geen"]].concat(D.LEVELS.map(function (l) { return [l, l]; })))) + '<p class="w-muted">Alleen deze datum. De reeks verandert niet.</p>'; ok = "Opslaan"; }
    else if (d.n === "wlremove") { t = "Van de wachtlijst halen?"; b = "<p>" + esc(waitNames(it)[d.i]) + " krijgt een e-mail en staat niet meer op de wachtlijst.</p>"; ok = "Verwijderen"; kind = "dng"; cancel = "Terug"; }
    else if (d.n === "renew") { t = "Link vernieuwen?"; b = "<p>De oude link en QR-code werken daarna niet meer. Hangt de QR-code ergens, vervang die dan ook.</p>"; ok = "Vernieuwen"; kind = "dng"; }
    else if (d.n === "decline") { var r = D.requests.filter(function (x) { return x.id === d.id; })[0]; t = "Verzoek afwijzen?"; b = "<p>" + esc(r.name) + " krijgt een korte e-mail en ziet niets van " + esc(wsName()) + ". Later opnieuw vragen kan.</p>"; ok = "Afwijzen"; kind = "dng"; cancel = "Terug"; }
    else if (d.n === "offer-edit") { var oe = d.id ? offerById(d.id) : null; t = oe ? oe.name + " wijzigen" : "Nieuw aanbod"; b = offerDialog(d); ok = oe ? "Opslaan" : "Toevoegen"; }
    else if (d.n === "offer-del") { var od = offerById(d.id); t = od.name + " verwijderen?"; b = "<p>Klanten kunnen het niet meer kopen." + (od.active ? " De " + od.active + " lopende afspraken lopen door tot hun einde." : "") + "</p>"; ok = "Verwijderen"; kind = "dng"; cancel = "Terug"; }
    else if (d.n === "offer") {
      var oc = F.CLIENT[W().cid], oa = d.ag ? D.billing[W().cid].agreements.filter(function (x) { return x.id === d.ag; })[0] : null, run = oa && oa.endsIn >= 0 && oa.status !== "expired";
      t = oa ? "Verlengen" : "Aanbod sturen"; ok = "Versturen";
      b = fld("Aanbod", selF("offer", D.offerNames())) + (run ? fld("Gaat in", selF("start", [["after", "Na afloop van " + oa.name], ["now", "Direct na betaling"]])) : "") +
        '<p class="w-muted">' + esc(oc.name.split(" ")[0]) + " krijgt een e-mail met een link om te bevestigen en te betalen met iDEAL. Na de betaling maakt Fivvi de factuur." + (run ? " Na afloop: geen gat en geen overlap." : "") + "</p>";
    }
    else if (d.n === "refund") { var pay = D.billing[W().cid].payments[d.i]; t = "Terugbetalen"; b = "<p>" + esc(pay[1]) + " · " + esc(pay[0]) + " · " + esc(pay[2]) + "</p>" + fld("Bedrag", inp("amount", "text"), "Een deel kan ook. De klant krijgt een creditfactuur."); ok = "Terugbetalen"; kind = "dng"; cancel = "Terug"; }
    else if (d.n === "editseries") { t = "Reeks wijzigen"; b = fld("Naam", inp("name")) + '<div class="w-inline2">' + fld("Begin", inp("start", "time")) + fld("Eind", inp("end", "time")) + fld("Plekken", inp("cap", "number")) + "</div>" + fld("Trainer", selF("trainer", D.trainers.sf.concat(["Trainer nodig"]))) +
      fld("Beschrijving", '<textarea class="w-input" data-wf="desc" rows="2">' + esc(w.form.desc) + "</textarea>") + fld("Beschrijving in het Engels", '<textarea class="w-input" data-wf="descEn" rows="2" placeholder="Optioneel">' + esc(w.form.descEn) + "</textarea>") +
      '<p class="w-muted">Geldt voor alle komende lessen van deze reeks. Verandert de tijd, dan krijgen klanten met een boeking een e-mail.</p>'; ok = "Opslaan"; }
    else if (d.n === "stopseries") { t = "Reeks stoppen?"; b = "<p>Er komen geen nieuwe lessen meer bij. De " + d.future + " komende lessen gaan niet door." + (d.booked ? " " + d.booked + " boekingen vervallen: die klanten krijgen een e-mail en hun credit terug." : "") + "</p>" + fld("Bericht voor de klanten (optioneel)", '<textarea class="w-input" data-wf="msg" rows="3" placeholder="Bijvoorbeeld de reden"></textarea>', "Komt letterlijk in de e-mail, niet vertaald."); ok = "Reeks stoppen"; kind = "dng"; cancel = "Terug"; }
    else if (d.n === "exform") { t = d.i != null ? "Oefening wijzigen" : "Nieuwe oefening"; b = fld("Naam", inp("name", "text", "Bijvoorbeeld Sled push")) + fld("Soort", selF("ty", [["wr", TY.wr], ["r", TY.r], ["t", TY.t], ["dt", TY.dt]]), "Bepaalt wat je per set invult.") + fld("Spieren", inp("mu", "text", "Optioneel")) + '<p class="w-muted">Je eigen oefening wordt niet vertaald. Trainers zien hem bij het toevoegen van een oefening.</p>'; ok = d.i != null ? "Opslaan" : "Toevoegen"; }
    else if (d.n === "exdel") { var ex = D.library[d.i]; t = "Oefening verwijderen?"; b = "<p>" + esc(ex.n) + " kun je daarna niet meer toevoegen. Trainingen waarin hij al zit, blijven zoals ze zijn.</p>"; ok = "Verwijderen"; kind = "dng"; cancel = "Terug"; }
    else if (d.n === "tplform") { t = d.t ? "Schema wijzigen" : "Nieuw schema"; b = fld("Naam", inp("name", "text", "Bijvoorbeeld Upper A")) + '<div class="w-field"><span>Oefeningen</span><div class="w-rows">' + w.rows.map(function (r, i) {
        var del = r[3] === "del";
        return '<div class="w-rowe' + (del ? " del" : "") + '"><select class="w-input" data-wrow="' + i + ',0"' + (del ? " disabled" : "") + ">" + D.library.map(function (e) { return '<option value="' + esc(e.n) + '"' + (e.n === r[0] ? " selected" : "") + ">" + esc(e.n) + "</option>"; }).join("") + '</select><input class="w-input sm" data-wrow="' + i + ',1" value="' + esc(r[1]) + '" aria-label="Sets"' + (del ? " disabled" : "") + '><span class="w-muted">×</span><input class="w-input sm" data-wrow="' + i + ',2" value="' + esc(r[2]) + '" aria-label="Doel"' + (del ? " disabled" : "") + ">" +
          (del ? btn("Herstellen", "w-row-del", { k: "ghost sm", d: { i: i } }) : '<button class="w-icon" data-a="w-row-del" data-i="' + i + '" aria-label="' + esc(r[0]) + ' verwijderen">' + ic("x") + "</button>") + "</div>";
      }).join("") + "</div>" + btn("Oefening toevoegen", "w-row-add", { k: "outline sm", i: "plus" }) + "</div>" + '<p class="w-muted">Doorgestreepte oefeningen gaan er pas uit als je opslaat. Trainingen die al met dit schema zijn gelogd, veranderen niet.</p>'; ok = "Opslaan"; }
    else if (d.n === "tpldel") { t = "Schema verwijderen?"; b = "<p>" + esc(d.t) + " kun je daarna niet meer kiezen bij een training. Trainingen die al met dit schema zijn gelogd, blijven bewaard.</p>"; ok = "Verwijderen"; kind = "dng"; cancel = "Terug"; }
    else if (d.n === "trole") {
      var sole = role(d.t) === "owner" && owners().length === 1; t = "Rol van " + d.t; ok = "Opslaan";
      b = fld("Rol", selF("role", [["trainer", "Trainer: eigen sessies, lessen en klanten"], ["owner", "Eigenaar: alles, ook betalingen, aanbod en instellingen"]])) +
        (sole ? '<p class="w-muted">' + ic("warn") + " Er moet altijd een eigenaar zijn. Maak eerst iemand anders eigenaar.</p>" : '<p class="w-muted">' + esc(d.t.split(" ")[0]) + " krijgt een e-mail over de nieuwe rol.</p>");
    }
    else if (d.n === "tremove") {
      var up = upcomingOf(d.t), nc = up.filter(function (x) { return x.type === "group"; }).length, np = up.length - nc, fn = d.t.split(" ")[0];
      t = d.t + " verwijderen?"; ok = "Verwijderen"; kind = "dng"; cancel = "Terug";
      b = "<p>" + esc(fn) + " kan niet meer inloggen bij " + esc(wsName()) + ". Eigen boekingen en afspraken als klant blijven.</p>" +
        (up.length ? "<p><b>De komende 2 weken: " + (nc ? nc + (nc === 1 ? " groepsles" : " groepslessen") : "") + (nc && np ? " en " : "") + (np ? np + (np === 1 ? " privésessie" : " privésessies") : "") + ".</b></p>" +
          fld("Overdragen aan", selF("to", D.trainers.sf.filter(function (x) { return x !== d.t; }).map(function (x) { return [x, x === ME() ? x + " (jij)" : x]; }).concat([["", "Niemand"]]))) +
          '<p class="w-muted">Met niemand: lessen krijgen Trainer nodig, privésessies worden geannuleerd en die klanten krijgen een e-mail.</p>' : "");
    }
    else if (d.n === "tinvdel") { t = "Uitnodiging intrekken?"; b = "<p>De link in de e-mail aan " + esc(D.invited[d.i].email) + " werkt dan niet meer.</p>"; ok = "Intrekken"; kind = "dng"; cancel = "Terug"; }
    else if (d.n === "invite") { t = "Trainer uitnodigen"; b = fld("E-mail", inp("email", "email", "naam@voorbeeld.nl")) + fld("Taal van de uitnodiging", selF("lang", ["Nederlands", "English"])); ok = "Uitnodiging versturen"; }
    else if (d.n === "newpriv") { t = "Nieuwe privésessie"; var cl = D.clients.filter(function (c) { return F.WSS().indexOf(c.ws) >= 0; }).map(function (c) { return [c.id, c.name]; });
      b = '<div class="w-inline2">' + fld("Klant", selF("client", cl)) + fld("Tweede klant (duo)", selF("duo", [["", "Geen"]].concat(cl))) + "</div>" + '<div class="w-inline2">' + fld("Datum", inp("date", "date")) + fld("Begin", inp("start", "time")) + fld("Duur", selF("dur", [["60", "1 uur"], ["45", "45 min"], ["30", "30 min"], ["90", "1,5 uur"]])) + "</div>" + fld("Locatie", selF("loc", D.locations)); ok = "Plannen"; }
    else if (d.n === "newclient") { t = "Klant toevoegen"; b = fld("Naam", inp("name", "text", "Voor- en achternaam")) + fld("E-mail", inp("email", "email", "naam@voorbeeld.nl")) + fld("Taal voor e-mails", selF("lang", ["Nederlands", "English"])) + '<p class="w-muted">De klant krijgt een e-mail met een uitnodiging om in te loggen.</p>'; ok = "Toevoegen"; }
    else if (d.n === "newclass") { t = "Nieuwe les"; b = fld("Naam", inp("name", "text", "Bijvoorbeeld Reformer")) + fld("Niveau", selF("level", [["", "Geen"]].concat(D.LEVELS.map(function (l) { return [l, l]; })))) + '<div class="w-inline2">' + fld("Dag", selF("day", ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"])) + fld("Begin", inp("start", "time")) + fld("Plekken", inp("cap", "number")) + "</div>" + fld("Trainer", selF("trainer", D.trainers.sf.concat(["Trainer nodig"]))) + fld("Beschrijving", '<textarea class="w-input" data-wf="desc" rows="2"></textarea>') + fld("Beschrijving in het Engels", '<textarea class="w-input" data-wf="descEn" rows="2" placeholder="Optioneel"></textarea>') + fld("Herhalen", selF("rep", ["Elke week", "Niet herhalen"])); ok = "Les maken"; }
    else if (d.n === "newgym") { t = "Nieuw Open Gym-blok"; b = '<div class="w-inline2">' + fld("Datum", inp("date", "date")) + fld("Begin", inp("start", "time")) + fld("Eind", inp("end", "time")) + "</div>" + fld("Plekken", inp("cap", "number")); ok = "Publiceren"; }
    return '<div class="w-scrim dark" data-a="w-dclose"></div><div class="w-dialog" role="dialog" aria-label="' + esc(t) + '"><h3>' + t + "</h3>" + b + '<div class="w-dialog-f">' + btn(cancel, "w-dclose", { k: "outline" }) + btn(ok, "w-dok", { k: kind }) + "</div></div>";
  }

  /* ---------- actions ---------- */
  var A = F.A;
  function R() { F.render(); }
  function today5() { return { date: F.TODAY, start: "11:00", end: "12:00", dur: "60", cap: "10", lang: "Nederlands", rep: "Elke week", day: "donderdag" }; }
  A["w-page"] = function (d) { var w = W(); w.page = d.v; w.menu = w.sheet = w.dialog = null; w.tab = "overview"; if (d.v === "agenda") w.scope = F.SOLO() ? "me" : "ws"; R(); };
  A["w-scope"] = function (d) { var w = W(); w.scope = d.v; w.page = d.v === "me" ? "myday" : "dashboard"; R(); };
  A["w-view"] = function (d) { W().view = d.v; R(); };
  A["w-day"] = function (d) { W().day = d.v; R(); };
  A["w-dayview"] = function (d) { W().day = d.v; W().view = "day"; R(); };
  A["w-shift"] = function (d) { var w = W(); w.day = F.key(F.add(F.parse(w.day), (w.view === "day" ? 1 : 7) * +d.v)); R(); };
  A["w-ev"] = function (d) { W().sheet = d.id; R(); };
  A["w-open-priv"] = function (d) { W().sheet = d.id; R(); };
  function from(w) { if (w.page !== "client" && w.page !== "klass") w.back = { page: w.page }; }
  A["w-open-class"] = function (d) { var w = W(); from(w); w.kid = d.id; w.page = "klass"; w.sheet = null; R(); };
  A["w-client"] = function (d) { var w = W(); from(w); w.cid = d.id; w.page = "client"; w.tab = "overview"; w.sheet = null; w.q = ""; R(); };
  A["w-new-offer"] = function () { var w = W(); w.page = "offers"; w.menu = null; A["w-dlg"]({ n: "offer-edit" }); };
  A["w-offer-on"] = function (d) { var o = offerById(d.id); if (!o.on && !o.price) { A["w-dlg"]({ n: "offer-edit", id: o.id }); bad("price", "Vul een prijs in om het aan te zetten"); return; } o.on = !o.on; F.toast(o.on ? o.name + " staat aan. Klanten kunnen het kopen." : o.name + " staat uit. Lopende afspraken lopen door."); };
  A["w-offer-tpl"] = function (d) { var w = W(), t = offerById(d.id); w.form = offerForm(t); w.form.id = ""; R(); };
  A["w-term"] = function (d) { D.workspaces.sf.term = d.v; F.toast("Opgeslagen"); };
  A["w-back"] = function () { var w = W(); w.page = w.back ? w.back.page : w.page === "client" ? "clients" : "classes"; w.back = null; R(); };
  A["w-client-bill"] = function (d) { var w = W(); from(w); w.cid = d.id; w.page = "client"; w.tab = "billing"; w.sheet = null; R(); };
  A["w-hist"] = function (d) { var w = W(); w.hist = w.hist === d.id ? null : d.id; R(); };
  A["w-ex-new"] = function () { openDlg("exform", { name: "", ty: "wr", mu: "" }); };
  A["w-ex-edit"] = function (d) { var e = D.library[+d.i]; openDlg("exform", { name: e.n, ty: e.ty, mu: e.mu || "" }, { i: +d.i }); };
  A["w-tpl-new"] = function () { W().rows = [["Squat", 3, "10", ""]]; openDlg("tplform", { name: "" }); };
  A["w-tpl-edit"] = function (d) { W().rows = D.tpl[d.t].map(function (r) { return [r[0], r[1], r[2], ""]; }); openDlg("tplform", { name: d.t }, { t: d.t }); };
  A["w-row-add"] = function () { W().rows.push([D.library[0].n, 3, "10", ""]); R(); };
  A["w-row-del"] = function (d) { var r = W().rows[+d.i]; r[3] = r[3] === "del" ? "" : "del"; R(); };
  A["w-requests"] = function () { var w = W(); w.page = "clients"; w.ctab = "req"; R(); };
  A["w-ctab"] = function (d) { W().ctab = d.v; R(); };
  A["w-tab"] = function (d) { W().tab = d.v; R(); };
  A["w-wtab"] = function (d) { W().wtab = d.v; R(); };
  A["w-stab"] = function (d) { W().stab = d.v; R(); };
  A["w-new"] = function () { W().menu = true; R(); };
  A["w-close"] = function () { var w = W(); w.menu = null; w.sheet = null; R(); };
  A["w-dclose"] = function () { W().dialog = null; W().err = {}; R(); };
  A["w-toast"] = function (d) { F.toast(d.m); };
  function openDlg(n, form, extra) { var w = W(); w.menu = null; w.err = {}; w.form = Object.assign(today5(), form || {}); w.dialog = Object.assign({ n: n }, extra || {}); R(); }
  A["w-dlg"] = function (d) {
    if (d.n === "exdel") { openDlg("exdel", {}, { i: +d.i }); return; }
    if (d.n === "tpldel") { openDlg("tpldel", {}, { t: d.t }); return; }
    if (d.n === "editseries" || d.n === "stopseries") {
      var m = classSeries().filter(function (x) { return x.title === d.t; })[0], ds = D.descriptions[d.t] || {};
      openDlg(d.n, { name: m.title, start: m.next ? m.next[1].s : "", end: m.next ? m.next[1].e : "", cap: String(m.cap), trainer: m.trainer, desc: ds.nl || "", descEn: ds.en || "" }, { t: d.t, future: m.future, booked: m.booked });
      return;
    }
    if (d.n === "trole") { openDlg("trole", { role: role(d.t) }, { t: d.t }); return; }
    if (d.n === "tremove") { openDlg("tremove", { to: D.trainers.sf.filter(function (x) { return x !== d.t; })[0] || "" }, { t: d.t }); return; }
    if (d.n === "tinvdel") { openDlg("tinvdel", {}, { i: +d.i }); return; }
    if (d.n === "offer-edit") { openDlg("offer-edit", offerForm(d.id ? offerById(d.id) : { kind: F.HAS("group") ? "abo" : "pack", credit: F.HAS("group") ? "groep" : "prive" }), { id: d.id || "" }); return; }
    if (d.n === "offer-del") { openDlg("offer-del", {}, { id: d.id }); return; }
    if (d.n === "offer") { var ag = d.ag ? D.billing[W().cid].agreements.filter(function (x) { return x.id === d.ag; })[0] : null; openDlg("offer", { offer: ag ? ag.name : D.offerNames()[1], start: "after" }, { ag: d.ag || "" }); return; }
    if (d.n === "refund") { var pay = D.billing[W().cid].payments[+d.i]; openDlg("refund", { amount: pay[2] }, { i: +d.i }); return; } var w = W(), it = w.sheet ? F.findItem(w.sheet).it : w.kid ? (F.findItem(w.kid) || {}).it : null; openDlg(d.n, it ? { start: it.s, end: it.e, cap: String(it.cap || ""), level: F.level(it), date: w.sheet ? F.findItem(w.sheet).day : F.TODAY, trainer: D.trainers.sf.filter(function (x) { return !it || x !== who(it); })[0] } : {}, { i: d.i }); };
  A["w-decline"] = function (d) { openDlg("decline", {}, { id: d.id }); };
  A["w-new-priv"] = function () { openDlg("newpriv", { client: "anna", loc: D.locations[0] }); };
  A["w-plan"] = function (d) { openDlg("newpriv", { client: d.id, date: F.key(F.add(F.NOW, 1)), start: "10:30", loc: D.locations[0] }); };
  A["w-new-client"] = function () { openDlg("newclient", { name: "", email: "" }); };
  A["w-new-class"] = function () { openDlg("newclass", { name: "", start: "19:00", cap: "8", trainer: ME() }); };
  A["w-new-gym"] = function () { openDlg("newgym", { start: "17:00", end: "19:00" }); };
  A["w-approve"] = function (d) {
    var r = D.requests.filter(function (x) { return x.id === d.id; })[0];
    D.requests = D.requests.filter(function (x) { return x.id !== d.id; });
    F.addClient({ id: "c" + Date.now(), ws: "sf", name: r.name, email: r.email, lang: "Nederlands", last: "Nog geen sessie", c: "#6155F5" });
    F.toast(r.name + " is goedgekeurd en kan nu boeken");
  };
  A["w-att"] = function (d) { var it = F.findItem(d.id).it, am = it.attMap || (it.attMap = {}); am[d.i] = am[d.i] === d.v ? undefined : d.v; R(); };
  A["w-att-all"] = function (d) { var it = F.findItem(d.id).it; it.attMap = {}; it.people.forEach(function (p, i) { it.attMap[i] = "yes"; }); F.toast("Iedereen staat op aanwezig"); };
  A["w-note"] = function (d) { var t = (W().form.note || "").trim(); if (!t) { F.toast("Schrijf eerst een notitie"); return; } (D.notes[d.id] = D.notes[d.id] || []).unshift({ t: t, d: "5 nov", by: "Sarah" }); W().form.note = ""; F.toast("Notitie opgeslagen"); };
  A["w-dok"] = function () {
    var w = W(), d = w.dialog, f = w.form, it = w.sheet ? F.findItem(w.sheet).it : w.kid ? (F.findItem(w.kid) || {}).it : null, msg = "Opgeslagen";
    if (d.n === "cancelclass" || d.n === "cancelpriv") { it.cancelled = true; msg = d.n === "cancelpriv" ? "Sessie geannuleerd" : "Les geannuleerd. Klanten krijgen een e-mail."; }
    else if (d.n === "move") { var dur = F.mins(it.e) - F.mins(it.s); it.s = f.start; it.e = F.hm(F.mins(f.start) + dur); msg = "Verplaatst naar " + f.start; }
    else if (d.n === "sub") { it.trainer = f.trainer; it.subFor = true; msg = f.trainer + " valt in"; }
    else if (d.n === "editclass") { it.s = f.start; it.e = f.end; it.cap = +f.cap || it.cap; it.level = f.level || ""; }
    else if (d.n === "wlremove") { it.waitlist = Math.max(0, (it.waitlist || 0) - 1); msg = "Van de wachtlijst gehaald"; }
    else if (d.n === "offer-edit") {
      if (!(f.name || "").trim()) { bad("name", "Vul een naam in"); return; }
      if (f.price && !/^\d+([.,]\d{1,2})?$/.test(f.price.trim())) { bad("price", "Vul een bedrag in, bijvoorbeeld 69 of 17,50"); return; }
      var oo = d.id ? offerById(d.id) : { id: "o" + Date.now(), active: 0, on: false }, n = function (x) { return +x || 0; };
      oo.kind = f.kind; oo.name = f.name.trim(); oo.nameEn = (f.nameEn || "").trim(); oo.price = (f.price || "").trim(); oo.vat = f.vat; oo.def = false;
      oo.cycle = f.kind === "pack" ? "Eenmalig" : f.kind === "single" ? "Bij het boeken" : f.cycle;
      if (f.kind === "abo") { oo.perWeek = n(f.perWeek); oo.term = f.term; }
      if (f.kind === "pack" || f.kind === "plan" || f.kind === "single") oo.credit = f.kind === "single" ? "groep" : f.credit;
      if (f.kind === "pack" || f.kind === "plan") oo.credits = n(f.credits) || 1;
      if (f.kind === "pack") { oo.valid = f.valid; oo.intro = f.intro === "ja"; oo.memberOnly = f.memberOnly === "ja"; oo.end = "stop"; }
      if (f.kind === "plan") { oo.carry = n(f.carry); oo.minTerm = f.minTerm; }
      if (f.kind === "abo" || f.kind === "plan") oo.end = f.end;
      oo.renew = n(f.renew);
      if (!oo.price) oo.on = false;
      if (!d.id) D.offerList.unshift(oo);
      msg = !oo.price ? "Opgeslagen. Het staat uit tot je een prijs invult." : d.id ? "Opgeslagen" : "Aanbod toegevoegd. Zet het aan als klanten het mogen kopen.";
    }
    else if (d.n === "offer-del") { D.offerList.splice(D.offerList.indexOf(offerById(d.id)), 1); msg = "Aanbod verwijderd"; }
    else if (d.n === "offer") { if (d.ag) D.billing[w.cid].agreements.forEach(function (x) { if (x.id === d.ag) x.offerSent = "vandaag"; }); msg = "Aanbod verstuurd aan " + F.CLIENT[w.cid].name.split(" ")[0]; }
    else if (d.n === "refund") { var pay = D.billing[w.cid].payments[d.i]; pay[4] = "refund"; pay[5] = (pay[5] ? pay[5] + " · " : "") + "creditfactuur F-2026-0430"; msg = "Terugbetaling van " + f.amount + " aangemaakt. De klant krijgt een creditfactuur."; }
    else if (d.n === "editseries") {
      if (!(f.name || "").trim()) { bad("name", "Vul een naam in"); return; }
      var most = Math.max.apply(null, [0].concat(seriesItems(d.t).filter(function (x) { return !x[1].cancelled; }).map(function (x) { return x[1].people.length; })));
      if ((+f.cap || 0) < most) { bad("cap", "Op een komende datum zijn al " + most + " boekingen. Kies minstens " + most + " plekken."); return; }
      seriesItems(d.t).forEach(function (x) { var it = x[1]; it.s = f.start; it.e = f.end; it.cap = +f.cap || it.cap; it.title = f.name.trim(); if (it.trainer || f.trainer !== ME()) it.trainer = f.trainer === "Trainer nodig" ? "" : f.trainer; });
      D.descriptions[f.name.trim()] = { nl: f.desc || "", en: f.descEn || "" }; msg = "Reeks bijgewerkt voor alle komende lessen";
    }
    else if (d.n === "stopseries") { seriesItems(d.t).forEach(function (x) { x[1].cancelled = true; }); D.seriesStopped[d.t] = true; msg = "Reeks gestopt. Klanten met een boeking krijgen een e-mail."; }
    else if (d.n === "exform") {
      if (!(f.name || "").trim()) { bad("name", "Vul een naam in"); return; }
      var dup = D.library.filter(function (e, i) { return e.n.toLowerCase() === f.name.trim().toLowerCase() && i !== d.i; })[0];
      if (dup) { bad("name", "Er is al een oefening met deze naam"); return; }
      if (d.i != null) { var ex = D.library[d.i]; ex.n = f.name.trim(); ex.ty = f.ty; ex.mu = f.mu; msg = "Oefening opgeslagen"; }
      else { D.library.push({ n: f.name.trim(), en: "", ty: f.ty, mu: f.mu, own: true, by: "Sarah" }); msg = "Oefening toegevoegd"; }
    }
    else if (d.n === "exdel") { msg = D.library[d.i].n + " is verwijderd"; D.library.splice(d.i, 1); }
    else if (d.n === "tplform") {
      var nm = (f.name || "").trim(); if (!nm) { bad("name", "Vul een naam in"); return; }
      if (nm !== d.t && D.tpl[nm]) { bad("name", "Er is al een schema met deze naam"); return; }
      var rows = w.rows.filter(function (r) { return r[3] !== "del"; }).map(function (r) { return [r[0], +r[1] || 1, r[2]]; });
      if (!rows.length) { F.toast("Een schema heeft minstens één oefening", "err"); return; }
      if (d.t && d.t !== nm) delete D.tpl[d.t];
      D.tpl[nm] = rows; msg = d.t ? "Schema opgeslagen" : "Schema gemaakt";
    }
    else if (d.n === "tpldel") { delete D.tpl[d.t]; msg = "Schema verwijderd"; }
    else if (d.n === "renew") { w.linkCode = ["9XP4", "3MV8", "6TR1"][Math.floor(Math.random() * 3)]; msg = "Nieuwe link gemaakt. De oude werkt niet meer."; }
    else if (d.n === "decline") { D.requests = D.requests.filter(function (x) { return x.id !== d.id; }); msg = "Verzoek afgewezen"; }
    else if (d.n === "invite") { if (!/.+@.+\..+/.test(f.email || "")) { bad("email", "Vul een geldig e-mailadres in"); return; } D.invited.push({ email: f.email.trim(), lang: f.lang }); msg = "Uitnodiging verstuurd naar " + f.email; }
    else if (d.n === "trole") {
      if (f.role !== "owner" && role(d.t) === "owner" && owners().length === 1) { bad("role", "Er moet altijd een eigenaar zijn"); return; }
      D.roles[d.t] = f.role; msg = d.t.split(" ")[0] + " is nu " + (f.role === "owner" ? "eigenaar" : "trainer");
    }
    else if (d.n === "tremove") {
      upcomingOf(d.t).forEach(function (x) { if (f.to) x.trainer = f.to; else if (x.type === "group") x.trainer = ""; else x.cancelled = true; });
      D.trainers.sf.splice(D.trainers.sf.indexOf(d.t), 1); delete D.roles[d.t];
      msg = d.t.split(" ")[0] + " is verwijderd" + (f.to ? ". Sessies en lessen zijn overgedragen aan " + f.to.split(" ")[0] : "");
    }
    else if (d.n === "tinvdel") { D.invited.splice(d.i, 1); msg = "Uitnodiging ingetrokken"; }
    else if (d.n === "newpriv") { F.addItem(f.date, { id: "n" + Date.now(), ws: "sf", type: "priv", s: f.start, e: F.hm(F.mins(f.start) + +f.dur), client: f.client, duo: f.duo && f.duo !== f.client ? f.duo : undefined, loc: f.loc, att: null }); msg = f.duo && f.duo !== f.client ? "Duosessie gepland" : "Sessie gepland"; }
    else if (d.n === "newclient") { if (!(f.name || "").trim()) { bad("name", "Vul een naam in"); return; } if (!/.+@.+\..+/.test(f.email || "")) { bad("email", "Vul een geldig e-mailadres in"); return; } F.addClient({ id: "c" + Date.now(), ws: "sf", name: f.name.trim(), email: f.email.trim(), lang: f.lang, last: "Nog geen sessie", c: "#8E8E93" }); msg = "Klant toegevoegd. De uitnodiging is verstuurd."; }
    else if (d.n === "newclass") { if (!(f.name || "").trim()) { bad("name", "Vul een naam in"); return; } D.descriptions[f.name.trim()] = { nl: f.desc || "", en: f.descEn || "" }; F.addItem(F.key(F.add(F.NOW, 1)), { id: "n" + Date.now(), ws: "sf", type: "group", s: f.start, e: F.hm(F.mins(f.start) + 60), title: f.name.trim(), level: f.level || "", cap: +f.cap || 8, people: [], loc: D.workspaces.sf.location, trainer: f.trainer === "Trainer nodig" ? "" : f.trainer }); msg = "Les gemaakt"; }
    else if (d.n === "newgym") { F.addItem(f.date, { id: "n" + Date.now(), ws: "sf", type: "gym", s: f.start, e: f.end, title: "Open Gym", cap: +f.cap || 10, people: [], loc: D.workspaces.sf.location }); msg = "Open Gym-blok gepubliceerd"; }
    w.dialog = null; w.err = {}; F.toast(msg);
  };

  /* ================= Client web (round 3) =================
     A mobile website, built from the same parts as Fivvi Pro: large titles, glass bars, grouped lists,
     Calendar-style rows and the gradient "next" card. */
  var K = F.kit;
  function client() {
    var c = C();
    var lang = '<div class="gb glass c-lng" translate="no">' + ["nl", "en"].map(function (l) { return '<button class="' + (F.PREF.lang === l ? "on" : "") + '" data-a="c-lang" data-v="' + l + '" aria-pressed="' + (F.PREF.lang === l) + '">' + l.toUpperCase() + "</button>"; }).join("") + "</div>";
    if (c.step !== "app") return '<div class="screen"><div class="nb"><span class="sp"></span>' + lang + '</div><div class="content c-body" style="padding-top:calc(var(--top) + 20px)">' + (CSTEP[c.step] || CSTEP.link)() + "</div></div>";
    var p = CSTEP.app(), sub = c.detail || c.workout != null;
    var lead = sub ? '<button class="gb glass back" data-a="c-back" aria-label="Terug">' + ic("chevL") + "</button>"
      : '<span class="gb glass c-studio"><span class="c-mark">' + F.initials(wsName()) + "</span><b>" + esc(wsName()) + "</b></span>";
    var h = '<div class="screen root c-web"><div class="nb">' + lead + '<span class="sp"></span>' + lang + '<div class="t">' + esc(p.title) + '</div></div><div class="content c-body">' + p.body + "</div></div>";
    h += '<div class="fade-b"></div><nav class="tabbar" aria-label="Tabs"><div class="tabs glass">' + [["rooster", "Rooster", "cal"], ["agenda", "Mijn agenda", "today"], ["profiel", "Profiel", "me"]].map(function (t) { var on = c.tab === t[0]; return '<button class="tab ' + (on ? "on" : "") + '" data-a="c-tab" data-v="' + t[0] + '" aria-current="' + (on ? "page" : "false") + '">' + ic(t[2]) + "<span>" + t[1] + "</span></button>"; }).join("") + "</div></nav>";
    if (c.web) h += browser();
    if (c.dialog) h += cdialog();
    return h;
  }
  /* the app's form field, with the client web's errors */
  function cfield(l, k, input) { var e = C().err && C().err[k]; return '<label class="fld' + (e ? " invalid" : "") + '"><span class="fl">' + l + "</span>" + input + (e ? '<small class="err" role="alert">' + ic("warn") + esc(e) + "</small>" : "") + "</label>"; }
  function cbtn(t, a, o) { o = o || {}; return K.btn(t, { k: o.k || "pri", blk: true, a: a, d: o.d, dis: o.dis, i: o.i }); }
  function intro(icon, h1, p) { return '<div class="c-intro">' + icon + "<h1>" + h1 + "</h1><p>" + p + "</p></div>"; }
  function mark(lg) { return '<div class="appicon c-appicon' + (lg ? "" : " sm") + '">' + F.initials(wsName()) + "</div>"; }
  var CSTEP = {};
  CSTEP.link = function () {
    return intro(mark(true), "Meedoen met " + esc(wsName()), "Log in of maak een account. Daarna vraag je " + esc(wsName()) + " of je mee mag doen. Zodra de studio je goedkeurt, zie je het rooster en kun je boeken.") +
      '<div class="pad stack"><div class="fgrp">' + cfield("E-mail", "email", '<input data-cin="email" type="email" autocomplete="email" placeholder="naam@voorbeeld.nl" value="' + esc(C().email) + '">') + "</div>" + cbtn("Doorgaan", "c-next") + "</div>" + K.foot("Je krijgt een code van 6 cijfers per e-mail. Geen wachtwoord nodig.");
  };
  CSTEP.code = function () {
    var c = C(), digits = (c.code + "      ").slice(0, 6).split("");
    return intro(mark(false), "Check je e-mail", 'We hebben een code gestuurd naar <b style="color:var(--label)">' + esc(c.email) + "</b>.") +
      '<label style="display:block;position:relative"><div class="code" id="ccode">' + digits.map(function (x, i) { return '<span class="' + (i === c.code.length ? "cur" : "") + '">' + esc(x.trim()) + "</span>"; }).join("") + '</div><input data-cin="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="' + esc(c.code) + '" aria-label="Code van 6 cijfers" style="position:absolute;inset:0;opacity:0;width:100%"></label>' +
      '<div class="pad stack" style="margin-top:20px">' + cbtn("Inloggen", "c-signin", { dis: c.code.length < 6 }) + K.btn("Andere e-mail gebruiken", { k: "ghost", blk: true, a: "c-reset" }) + "</div>" + K.foot("In dit prototype werkt elke code van 6 cijfers.");
  };
  CSTEP.request = function () {
    var c = C();
    return intro(mark(false), "Vraag om mee te doen", esc(wsName()) + " ziet je naam en e-mailadres en beslist of je mee mag doen.") +
      '<div class="pad stack"><div class="fgrp">' + cfield("Naam", "name", '<input data-cin="name" type="text" placeholder="Voor- en achternaam" value="' + esc(c.name) + '">') + "</div>" + cbtn("Verzoek versturen", "c-request") + "</div>";
  };
  CSTEP.waiting = function () {
    return intro('<span class="c-wait">' + ic("clock") + "</span>", "Wachten op " + esc(wsName()), "Je verzoek is verstuurd. Je krijgt een e-mail zodra de studio je heeft goedgekeurd.") +
      '<div class="pad"><div class="card c-proto"><b>Prototype</b><span>Doe alsof de eigenaar je verzoek goedkeurt:</span>' + cbtn("Eigenaar keurt goed", "c-approved", { k: "sec" }) + "</div></div>";
  };
  /* the client timetable: the studio's classes and Open Gym, never a cancelled one */
  function timetable(k) { var its = F.dayItems(k).filter(function (i) { return i.ws === "sf" && i.type !== "priv" && !i.cancelled; }); if (k === F.TODAY && !F.SOLO()) its = its.concat(F.extra().filter(function (i) { return i.type !== "priv"; })); return its.sort(function (a, b) { return F.mins(a.s) - F.mins(b.s); }); }
  function cState(it) { var c = C(); if (!it.people) return "priv"; if (c.booked[it.id]) return "booked"; if (c.wl[it.id]) return "wl"; return it.people.length >= it.cap ? "full" : "open"; }
  function spotsLeft(it) { return it.people ? it.cap - it.people.length - (C().booked[it.id] ? 1 : 0) : 0; }
  function statePill(it) {
    var st = cState(it), left = spotsLeft(it);
    if (st === "booked") return '<span class="pill tint c-pill" style="--c:var(--ok)">' + ic("check") + "Geboekt</span>";
    if (st === "wl") return '<span class="pill tint" style="--c:var(--gym)">Wachtlijst #' + C().wl[it.id] + "</span>";
    if (st === "full") return '<span class="pill strong">Vol</span>';
    return '<span class="pill' + (left <= 2 ? ' tint" style="--c:var(--accent)' : "") + '">' + (left === 1 ? "Nog 1 plek" : "Nog " + left + " plekken") + "</span>";
  }
  /* which credit a booking uses (kinds never mix, §91), and whether the client has one left */
  function creditFor(it) { var c = C(), ck = it.type === "gym" ? "gym" : "groep", bal = c.who === "anna" ? D.bsum("anna").balances.filter(function (x) { return x.credit === ck; })[0] : null; return { ck: ck, bal: bal, no: c.who === "anna" && (!bal || bal.left <= 0) }; }
  function spotsText(it) { var st = cState(it), left = spotsLeft(it); return st === "full" ? "Vol" : st === "booked" || st === "wl" ? "" : left === 1 ? "nog 1 plek" : "nog " + left + " plekken"; }
  /* the row's action: Boeken, Wachtlijst, or what you have; without a matching credit it opens the class page, which explains */
  function rowAction(it) {
    var st = cState(it), c = C();
    if (st === "booked") return '<span class="pill tint c-pill" style="--c:var(--ok)">' + ic("check") + "Geboekt</span>";
    if (st === "wl") return '<span class="pill tint" style="--c:var(--gym)">Wachtlijst #' + c.wl[it.id] + "</span>";
    if (st === "full") return it.type === "group" ? K.btn("Wachtlijst", { k: "sec", sm: true, a: "c-qwl", d: { id: it.id } }) : '<span class="pill strong">Vol</span>';
    return K.btn("Boeken", { sm: true, a: creditFor(it).no ? "c-open" : "c-qbook", d: { id: it.id } });
  }
  function cwho(it) { return it.type === "gym" ? "Zelf trainen" : it.trainer || (it.trainer === "" ? "Trainer volgt nog" : ME()); }
  function crow(it, k, tr, spots) {
    var ds = it.type === "group" ? desc(it.title) : null, sp = spots ? '<span class="c-spots' + (spotsLeft(it) <= 2 || spots === "Vol" ? " low" : "") + '">' + spots + "</span>" : "";
    /* Android: the shaped avatar per session type, as in Fivvi Pro; the time moves into the line */
    if (F.PREF.plat === "android") return K.row({ a: "c-open", d: { id: it.id }, style: "--c:" + F.CV[it.type], lead: K.shape(K.SHAPE[it.type], F.CV[it.type], it.type === "priv" ? F.initials(cwho(it)) : it.type === "gym" ? "OG" : it.title[0]),
      title: esc(it.type === "priv" ? (it.duo ? "Duosessie" : "Privésessie") : it.title), sub: it.s + "–" + it.e + " · " + (it.type === "priv" ? "met " + esc(cwho(it).split(" ")[0]) : esc(cwho(it))), small: sp + (sp && F.level(it) ? " · " : "") + (F.level(it) ? F.lvlTag(it) : ""), tr: tr, cls: "c-row" + (spots != null ? " c-act" : "") });
    return K.row({ a: "c-open", d: { id: it.id }, style: "--c:" + F.CV[it.type], lead: '<div class="t"><b>' + it.s + "</b><span>" + it.e + '</span></div><i class="bar"></i>',
      title: esc(it.type === "priv" ? (it.duo ? "Duosessie" : "Privésessie") : it.title), sub: F.level(it) ? F.lvlTag(it) + '<span class="lvl-sep"> · </span>' + esc(cwho(it)) : it.type === "priv" ? "Met " + esc(cwho(it).split(" ")[0]) + (it.duo ? " · samen met " + esc(F.CLIENT[mate(it)].name.split(" ")[0]) : " · " + esc(shortLoc(it.loc))) : esc(cwho(it)),
      small: sp + (sp && ds ? " · " : "") + (ds ? '<span translate="no"' + (ds.nl ? ' lang="nl"' : "") + ">" + esc(ds.t) + "</span>" : ""), tr: tr, cls: "c-row" + (spots != null ? " c-act" : ""), chev: spots == null });
  }
  function mate(it) { return it.client === C().who ? it.duo : it.client; }
  function dayName(k) { var d = F.parse(k), t = F.key(F.add(F.NOW, 1)); return k === F.TODAY ? "Vandaag" : k === t ? "Morgen" : F.longDate(d); }
  /* the client's next booking: the same gradient card as Volgende on Vandaag in the app */
  function upcoming() {
    var c = C(), rows = [];
    for (var i = 0; i <= 7; i++) { var k = F.key(F.add(F.NOW, i)); timetable(k).forEach(function (it) { if (c.booked[it.id] || c.wl[it.id]) rows.push([k, it]); }); if (c.who === "anna") F.dayItems(k).forEach(function (it) { if (it.type === "priv" && it.client === "anna") rows.push([k, it]); }); }
    return rows.filter(function (r) { return !(r[0] === F.TODAY && F.isPast(r[1], r[0])); }).sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : F.mins(a[1].s) - F.mins(b[1].s); });
  }
  function nextHero(r, cap) {
    var it = r[1];
    return '<div class="pad" style="margin-bottom:6px"><div class="hero" style="--c:' + F.CV[it.type] + '"><div class="cap">' + cap + "</div><h3>" + esc(it.type === "priv" ? "Privésessie met " + cwho(it).split(" ")[0] : it.title) + "</h3><p>" + dayName(r[0]) + " · " + it.s + "–" + it.e + "</p><p>" + esc(it.type === "priv" ? shortLoc(it.loc) : cwho(it) + " · " + shortLoc(it.loc)) + '</p><div class="acts"><button class="gl glass" data-a="c-open" data-id="' + it.id + '">' + ic("chevR") + "Bekijken</button></div></div></div>";
  }
  CSTEP.app = function () {
    var c = C();
    if (c.workout != null) return workoutView();
    if (c.detail) return detailView();
    if (c.tab === "rooster") {
      var types = []; if (F.HAS("group")) types.push(["group", "Groepslessen"]); if (F.HAS("gym")) types.push(["gym", "Open Gym"]);
      var tt = APP ? "Boeken" : "Rooster", b = K.lt(F.longDate(F.NOW), tt, "");
      if (!types.length) return { title: tt, body: b + '<div class="pad"><div class="card empty">' + esc(wsName()) + " heeft geen lessen om te boeken. Je trainer plant je privésessies; die zie je in Mijn agenda.</div></div>" };
      var nx = upcoming().filter(function (r) { return r[1].type !== "priv" && c.booked[r[1].id]; })[0];
      if (nx && !APP) b += nextHero(nx, "Je volgende les");
      /* the week strip from Agenda: one dot per class that day */
      b += '<div class="wk c-wk">' + [0, 1, 2, 3, 4, 5, 6].map(function (i) {
        /* one dot per class you can still book (green: you're booked); not past, not cancelled, not full (owner, 5 Nov 2026) */
        var d = F.add(F.NOW, i), k = F.key(d), its = timetable(k).filter(function (x) { return !(k === F.TODAY && F.isPast(x, k)) && (c.booked[x.id] || x.people.length < x.cap); });
        return '<div><div class="d">' + F.DS[d.getDay()] + '</div><button class="n ' + (k === F.TODAY ? "today " : "") + (k === c.day ? "sel" : "") + '" data-a="c-day" data-v="' + k + '" aria-label="' + F.longDate(d) + (its.length ? ", " + its.length + (its.length === 1 ? " les te boeken" : " lessen te boeken") : "") + '">' + d.getDate() + '</button><div class="dots">' + its.slice(0, 5).map(function (x) { return '<i style="--c:' + (c.booked[x.id] ? "var(--ok)" : F.CV[x.type]) + '"></i>'; }).join("") + "</div></div>";
      }).join("") + "</div>";
      if (types.length > 1) b += '<div class="pad" style="margin-top:10px">' + K.seg([["all", "Alles"]].concat(types), c.filter, "c-filter") + "</div>";
      var its = timetable(c.day).filter(function (i) { return (c.filter === "all" || i.type === c.filter) && !(c.day === F.TODAY && F.isPast(i, c.day)); });
      b += K.sh(dayName(c.day) + (its.length ? " · " + its.length + (its.length === 1 ? " les" : " lessen") : ""), "", "small");
      b += '<div class="pad">' + (its.length ? K.grp(its.map(function (it) { return crow(it, c.day, rowAction(it), spotsText(it)); })) : '<div class="card empty">Geen lessen meer op deze dag.</div>') + "</div>";
      b += K.foot("Gratis annuleren tot 12 uur voor de start.");
      return { title: tt, body: b };
    }
    if (c.tab === "agenda") {
      var tf = c.typeFilter, all = upcoming(), list = all.filter(function (r) { return tf === "all" || (tf === "priv" ? r[1].type === "priv" : r[1].type !== "priv"); });
      var h = K.lt("", "Mijn agenda", all.length ? (all.length === 1 ? "1 afspraak" : all.length + " afspraken") + " de komende week" : "");
      if (all.length && (F.MIXED() || c.who === "anna")) h += '<div class="pad" style="margin-bottom:4px">' + K.seg([["all", "Alles"], ["group", "Lessen"], ["priv", "Privé"]], tf, "c-tfilter") + "</div>";
      if (!list.length) return { title: "Mijn agenda", body: h + '<div class="pad"><div class="card empty">Nog niets geboekt.<div style="margin-top:14px">' + K.btn("Naar het rooster", { k: "sec", a: "c-tab", d: { v: "rooster" } }) + "</div></div></div>" };
      var days = []; list.forEach(function (r) { if (!days.length || days[days.length - 1][0] !== r[0]) days.push([r[0], []]); days[days.length - 1][1].push(r[1]); });
      days.forEach(function (d) { h += K.sh(dayName(d[0]), "", "small") + '<div class="pad">' + K.grp(d[1].map(function (it) { return crow(it, d[0], c.wl[it.id] ? '<span class="pill tint" style="--c:var(--gym)">Wachtlijst #' + c.wl[it.id] + "</span>" : ""); })) + "</div>"; });
      return { title: "Mijn agenda", body: h };
    }
    return { title: "Profiel", body: profile() };
  };
  function profile() {
    var c = C(), anna = c.who === "anna", me = anna ? F.CLIENT.anna : { name: c.name || "Kim de Graaf", email: c.email || "kim@example.com" };
    var h = '<div class="c-me">' + K.avatar(me.name, anna ? me.c : "var(--priv)", "lg") + "<h1>" + esc(me.name) + "</h1><p>" + esc(me.email) + "</p></div>";
    if (anna) {
      var s = D.bsum("anna"), tiles = [];
      /* Fitness-style tiles: the big number is what's left; the bar shows used and planned */
      s.abos.forEach(function (a) { var left = Math.max(0, a.perWeek - a.usedWeek); tiles.push('<div class="tile c-tile" style="--c:var(--group)"><span class="ink">Deze week</span><b class="num">' + left + '<small>/' + a.perWeek + "</small></b><em>" + (left === 1 ? "les over" : "lessen over") + '</em><div class="abar"><i style="width:' + (a.usedWeek / a.perWeek * 100) + '%"></i></div></div>'); });
      s.balances.forEach(function (x) { var t = Math.max(1, x.total); tiles.push('<div class="tile c-tile" style="--c:' + x.label[2] + '"><span class="ink">' + (x.left === 1 ? x.label[0] : x.label[1]) + '</span><b class="num">' + x.left + "<small>/" + x.total + "</small></b><em>over · " + x.planned + " gepland · " + x.used + ' gebruikt</em><div class="abar"><i style="width:' + (x.used / t * 100) + '%"></i><i class="p" style="width:' + (x.planned / t * 100) + '%"></i></div></div>'); });
      h += K.sh("Tegoed", "", "small") + '<div class="pad"><div class="tiles two">' + tiles.join("") + "</div></div>";
      h += K.sh("Abonnement en credits", "", "small") + '<div class="pad">' + K.grp(D.billing.anna.agreements.map(function (a) { return K.row({ lead: '<span class="dc-ic" style="--c:' + (a.kind === "abo" ? "var(--group)" : D.CREDIT[a.credit][2]) + '">' + ic(a.kind === "abo" ? "cal" : "check") + "</span>", title: esc(a.name), sub: esc(a.price) + " · " + esc(a.cycle.toLowerCase()), small: a.kind === "pack" ? esc(a.period) : "Volgende betaling " + esc(a.next) }); }), "--inset:60px") + "</div>";
      h += K.sh("Facturen", "", "small") + '<div class="pad">' + K.grp(D.billing.anna.payments.map(function (p) { return K.row({ a: "w-toast", d: { m: "Factuur gedownload" }, title: esc(p[1]), sub: esc(p[0]) + " · " + esc(p[3]), tr: '<b class="num c-amt">' + esc(p[2]) + "</b>" + ic("down", "c-dl") }); })) + "</div>";
      if (!APP) h += K.sh("Mijn trainingen", "", "small") + '<div class="pad">' + K.grp((D.history.anna || []).slice(0, 3).map(function (x, i) { return K.row({ a: "c-workout", d: { v: i }, lead: '<span class="dc-ic" style="--c:var(--accent)">' + ic("dumb") + "</span>", title: esc(x.name), sub: esc(x.d) + " · met " + esc(x.by) }); }), "--inset:60px") + "</div>";
    } else h += '<div class="pad"><div class="card empty">Nog geen abonnement of credits.<div style="margin-top:14px">' + K.btn("Aanbod bekijken", { k: "sec", a: "c-offers" }) + "</div></div></div>";
    if (APP) h += K.sh("Studio", "", "small") + '<div class="pad">' + K.grp([K.row({ lead: '<span class="c-mark" style="width:36px;height:36px">' + F.initials(wsName()) + "</span>", title: esc(wsName()), sub: esc(shortLoc(D.workspaces.sf.location)) })], "--inset:64px") + "</div>";
    h += K.sh("Taal", "", "small") + '<div class="pad" translate="no">' + K.seg([["nl", "Nederlands"], ["en", "English"]], F.PREF.lang, "c-lang") + "</div>";
    h += '<div class="pad" style="margin-top:22px">' + cbtn("Uitloggen", APP ? "a-signout" : "c-signout", { k: "sec" }) + "</div>";
    if (APP) h += '<div class="pad" style="margin-top:10px">' + K.btn("Account verwijderen", { k: "ghost", blk: true, a: "a-delask" }) + "</div>" + K.foot("Je account en je gegevens worden verwijderd. Facturen bewaart de studio zo lang als de wet vraagt.");
    return h;
  }
  function kv(t, v) { return K.row({ title: t, tr: v, cls: "kv" }); }
  function detailView() {
    var c = C(), f = F.findItem(c.detail), it = f.it, k = f.day, st = cState(it), ds = it.type === "group" ? desc(it.title) : null, left = spotsLeft(it), when = dayName(k) + " · " + it.s + "–" + it.e;
    if (it.type === "priv") return { title: it.duo ? "Duosessie" : "Privésessie", body: K.lt(it.duo ? "Duosessie" : "Privésessie", "Met " + esc(cwho(it).split(" ")[0]), when) + '<div class="pad">' + K.grp([kv("Trainer", esc(cwho(it)))].concat(it.duo ? [kv("Samen met", esc(F.CLIENT[mate(it)].name))] : []).concat([kv("Locatie", esc(it.loc))])) + "</div>" + (it.duo ? K.foot("Je traint samen met " + esc(F.CLIENT[mate(it)].name.split(" ")[0]) + ". Je trainer houdt ieders training apart bij.") : "") + K.foot("Verzetten of afzeggen? Neem contact op met je trainer.") };
    var b = K.lt(F.TYPE[it.type], esc(it.title), when) + '<div class="pad stack">';
    if (ds) b += '<div class="card"><p class="c-desc" translate="no"' + (ds.nl ? ' lang="nl"' : "") + ">" + esc(ds.t) + "</p></div>";
    var booked = it.cap - left, pct = Math.min(100, booked / it.cap * 100);
    b += '<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><div><div class="stat-l ink" style="--c:' + F.CV[it.type] + '">Plekken vrij</div><div class="num" style="font-size:34px;line-height:38px">' + Math.max(0, left) + '<small style="font-size:17px;color:var(--label2)">/' + it.cap + "</small></div></div>" + statePill(it) + "</div>" +
      '<div class="c-cap" style="--c:' + F.CV[it.type] + '"><i style="width:' + pct + '%"></i></div></div>';
    b += K.grp((it.type === "gym" ? [] : [kv("Trainer", esc(cwho(it)))]).concat(F.level(it) ? [kv("Niveau", F.lvlTag(it))] : []).concat([kv("Locatie", esc(shortLoc(it.loc)))]));
    /* credit kinds never mix (PRODUCT §91): a class uses a groepscredit, Open Gym an Open Gym-credit */
    var ck = it.type === "gym" ? "gym" : "groep", bal = c.who === "anna" ? D.bsum("anna").balances.filter(function (x) { return x.credit === ck; })[0] : null, noCredit = c.who === "anna" && (!bal || bal.left <= 0);
    if (st === "booked") b += '<div class="banner" style="--c:var(--ok)">' + ic("check") + "<span><b>Je bent erbij.</b> Gratis annuleren tot 12 uur voor de start. Daarna telt de les als gebruikt.</span></div>" + cbtn("Annuleren", "c-cancel", { k: "dng" });
    else if (st === "wl") b += '<div class="banner" style="--c:var(--gym)">' + ic("clock") + "<span><b>Wachtlijst: nummer " + c.wl[it.id] + ".</b> Komt er een plek vrij, dan word je automatisch geboekt en krijg je een e-mail. De wachtlijst sluit 30 minuten voor de start.</span></div>" + cbtn("Van de wachtlijst af", "c-wl-leave", { k: "sec" });
    else if (st === "full") b += '<div class="banner" style="--c:var(--label2)">' + ic("people") + "<span><b>Deze les is vol.</b> " + (it.waitlist || 0) + " mensen staan op de wachtlijst.</span></div>" + (it.type === "group" ? cbtn("Op de wachtlijst", "c-wl", { i: "clock" }) : "");
    else if (noCredit) b += '<div class="banner" style="--c:var(--gym)">' + ic("warn") + "<span><b>Je hebt geen " + D.CREDIT[ck][1] + ".</b> Kies een aanbod van " + esc(wsName()) + "; daarna kun je hier boeken.</span></div>" + cbtn("Aanbod bekijken", "c-offers", { k: "sec" }) + cbtn("Boeken", "c-book", { i: "check", dis: true });
    else b += cbtn("Boeken", "c-book", { i: "check" });
    b += "</div>";
    if (st === "open" && bal && !noCredit) b += K.foot("Je gebruikt 1 " + D.CREDIT[ck][0] + "; je hebt er nog " + bal.left + ". Gratis annuleren tot 12 uur voor de start.");
    return { title: it.title, body: b };
  }
  function workoutView() {
    var c = C(), x = (D.history.anna || [])[c.workout];
    var sets = x.sets || [["Squat", "60 kg × 8, 8, 8"], ["Bankdrukken", "57,5 kg × 8, 8, 6"]];
    return { title: x.name, body: K.lt("Training", esc(x.name), esc(x.d) + " · met " + esc(x.by)) +
      '<div class="pad stack"><div class="card c-msg">' + K.avatar(x.by, "var(--accent)") + '<div><b>Bericht van ' + esc(x.by) + '</b><p translate="no">Goed gewerkt vandaag! Volgende keer gaan we naar 62,5 kg.</p></div></div></div>' +
      K.sh("Oefeningen · " + sets.length, "", "small") + '<div class="pad">' + K.grp(sets.map(function (s) { return K.row({ title: esc(s[0]), sub: esc(s[1]), tr: s[2] ? '<span class="diff-e" role="img" aria-label="' + D.DIFF[s[2]][1] + '">' + D.DIFF[s[2]][0] + "</span>" : "", cls: "kv" }); })) + "</div>" };
  }
  function cdialog() {
    if (C().dialog === "delete") return '<div class="scrim anim-fade" data-a="c-dclose"></div><div class="alert anim-fade" role="alertdialog" aria-label="Account verwijderen"><h3>Account verwijderen?</h3><p>Je account en je gegevens worden verwijderd en je wordt uitgelogd. Facturen bewaart de studio zo lang als de wet vraagt.</p><div class="btns">' + K.btn("Account verwijderen", { k: "dng", a: "a-delete" }) + K.btn("Annuleren", { k: "sec", a: "c-dclose" }) + "</div></div>";
    var it = F.findItem(C().detail).it;
    return '<div class="scrim anim-fade" data-a="c-dclose"></div><div class="alert anim-fade" role="alertdialog" aria-label="Annuleren"><h3>' + esc(it.title) + " annuleren?</h3><p>Het is meer dan 12 uur voor de start, dus de les telt niet als gebruikt.</p><div class=\"btns\">" + K.btn("Ja, annuleren", { k: "dng", a: "c-cancel-ok" }) + K.btn("Terug", { k: "sec", a: "c-dclose" }) + "</div></div>";
  }
  /* ================= Client app Fivvi (PRODUCT §55) =================
     The client web's scope as a native app: Home, Boeken, Training (from M7), Profiel. Signs in with the emailed
     code; joins through the join link, which opens the app (no QR scanner); paying opens the web page in a browser
     sheet; account deletion in the app (§79). Push notifications come in Release 1.1, so none here. */
  var APP = false;
  function andr() { return F.PREF.plat === "android"; }
  var ATABS = [["home", "Home", "home"], ["boeken", "Boeken", "cal"], ["training", "Activiteit", "pulse"], ["profiel", "Profiel", "me"]];
  function capp() {
    var c = C(); APP = true;
    try {
      if (!c.astep) c.astep = c.step === "app" ? "app" : "welcome";
      var lang = '<div class="gb glass c-lng" translate="no">' + ["nl", "en"].map(function (l) { return '<button class="' + (F.PREF.lang === l ? "on" : "") + '" data-a="c-lang" data-v="' + l + '">' + l.toUpperCase() + "</button>"; }).join("") + "</div>";
      if (c.astep !== "app") {
        var body = ASTEP[c.astep]();
        return '<div class="screen"><div class="content c-body" style="padding-top:calc(var(--top) + 20px)">' + body + "</div></div>" + (c.dialog ? cdialog() : "");
      }
      var sub = c.detail || c.workout != null, p = c.workout != null ? workoutView() : c.detail ? detailView() : ATAB[c.atab || "home"]();
      var h;
      if (andr()) {
        h = '<div class="screen root"><div class="ab ' + (sub ? "" : "root") + '">' + (sub ? '<button class="ib" data-a="c-back" aria-label="Terug">' + ic("back") + "</button>" : "") + '<div class="t">' + esc(p.title) + '</div></div><div class="content c-body">' + p.body + "</div></div>";
        h += '<nav class="navb" aria-label="Navigatie">' + ATABS.map(function (t) { var on = (c.atab || "home") === t[0]; return '<button class="' + (on ? "on" : "") + '" data-a="c-atab" data-v="' + t[0] + '"><i>' + ic(t[2]) + "</i>" + t[1] + "</button>"; }).join("") + "</nav>";
      } else {
        var lead = sub ? '<button class="gb glass back" data-a="c-back" aria-label="Terug">' + ic("chevL") + "</button>" : '<span class="gb glass c-studio"><span class="c-mark">' + F.initials(wsName()) + "</span><b>" + esc(wsName()) + "</b></span>";
        h = '<div class="screen root c-web"><div class="nb">' + lead + '<span class="sp"></span><div class="t">' + esc(p.title) + '</div></div><div class="content c-body">' + p.body + "</div></div>";
        h += '<div class="fade-b"></div><nav class="tabbar" aria-label="Tabs"><div class="tabs glass">' + ATABS.map(function (t) { var on = (c.atab || "home") === t[0]; return '<button class="tab ' + (on ? "on" : "") + '" data-a="c-atab" data-v="' + t[0] + '" aria-current="' + (on ? "page" : "false") + '">' + ic(t[2]) + "<span>" + t[1] + "</span></button>"; }).join("") + "</div></nav>";
      }
      if (c.web) h += browser();
      if (c.dialog) h += cdialog();
      return h;
    } finally { APP = false; }
  }
  function brand(sm) { return '<div class="appicon c-appicon' + (sm ? " sm" : "") + '">F</div>'; }
  var ASTEP = {};
  ASTEP.welcome = function () {
    return intro(brand(), "Welkom bij Fivvi", "Boek lessen en sessies bij je studio of trainer.") +
      '<div class="pad stack"><div class="fgrp">' + cfield("E-mail", "email", '<input data-cin="email" type="email" autocomplete="email" placeholder="naam@voorbeeld.nl" value="' + esc(C().email) + '">') + "</div>" + cbtn("Doorgaan", "a-next") + "</div>" + K.foot("Je krijgt een code van 6 cijfers per e-mail. Geen wachtwoord nodig.");
  };
  ASTEP.code = function () {
    var c = C(), digits = (c.code + "      ").slice(0, 6).split("");
    return intro(brand(true), "Check je e-mail", 'We hebben een code gestuurd naar <b style="color:var(--label)">' + esc(c.email) + "</b>.") +
      '<label style="display:block;position:relative"><div class="code" id="ccode">' + digits.map(function (x, i) { return '<span class="' + (i === c.code.length ? "cur" : "") + '">' + esc(x.trim()) + "</span>"; }).join("") + '</div><input data-cin="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="' + esc(c.code) + '" aria-label="Code van 6 cijfers" style="position:absolute;inset:0;opacity:0;width:100%"></label>' +
      '<div class="pad stack" style="margin-top:20px">' + cbtn("Inloggen", "a-signin", { dis: c.code.length < 6 }) + K.btn("Andere e-mail gebruiken", { k: "ghost", blk: true, a: "a-reset" }) + "</div>" + K.foot("In dit prototype werkt elke code van 6 cijfers.");
  };
  /* signed in, but no studio yet: the studio's link or QR code opens Fivvi; there is no scanner in the app */
  ASTEP.nolink = function () {
    return intro('<span class="c-wait" style="color:var(--accent-text)">' + ic("link") + "</span>", "Nog geen studio", "Open de link van je studio of trainer, of scan hun QR-code met de camera van je telefoon. Fivvi opent dan vanzelf.") +
      '<div class="pad"><div class="card c-proto"><b>Prototype</b><span>Doe alsof je de link van ' + esc(wsName()) + " opent:</span>" + cbtn("Link openen", "a-openlink", { k: "sec" }) + "</div></div>";
  };
  ASTEP.join = function () {
    var c = C();
    return intro(mark(false), "Meedoen met " + esc(wsName()), esc(wsName()) + " ziet je naam en e-mailadres en beslist of je mee mag doen.") +
      '<div class="pad stack"><div class="fgrp">' + cfield("Naam", "name", '<input data-cin="name" type="text" placeholder="Voor- en achternaam" value="' + esc(c.name) + '">') + "</div>" + cbtn("Verzoek versturen", "a-request") + "</div>";
  };
  ASTEP.waiting = function () {
    return intro('<span class="c-wait">' + ic("clock") + "</span>", "Wachten op " + esc(wsName()), "Je verzoek is verstuurd. Je krijgt een e-mail zodra de studio je heeft goedgekeurd.") +
      '<div class="pad"><div class="card c-proto"><b>Prototype</b><span>Doe alsof de eigenaar je verzoek goedkeurt:</span>' + cbtn("Eigenaar keurt goed", "a-approved", { k: "sec" }) + "</div></div>";
  };
  var ATAB = {};
  /* Home: what's next and my schedule (upcoming bookings and private sessions), with the balance at a glance */
  ATAB.home = function () {
    var c = C(), anna = c.who === "anna", first = anna ? "Anna" : (c.name || "Kim de Graaf").split(" ")[0], up = upcoming();
    var b = K.lt(F.longDate(F.NOW), "Hoi " + esc(first), "");
    if (up.length) b += nextHero(up[0], up[0][1].type === "priv" ? "Je volgende sessie" : "Je volgende les");
    if (anna) {
      var s = D.bsum("anna"), parts = s.balances.map(function (x) { return x.left + " " + (x.left === 1 ? x.label[0] : x.label[1]); });
      b += '<div class="pad" style="margin-top:14px">' + weekCard(up) + '<button class="c-balline" data-a="c-atab" data-v="profiel">' + ic("check") + "<span>Tegoed: " + parts.join(" · ") + " over</span>" + ic("chevR") + "</button></div>";
    } else b += '<div class="pad" style="margin-top:14px"><div class="card empty">Nog geen abonnement of credits.<div style="margin-top:14px">' + K.btn("Aanbod bekijken", { k: "sec", a: "c-offers" }) + "</div></div></div>";
    var rest = up.slice(1, 7);
    if (rest.length) {
      var days = []; rest.forEach(function (r) { if (!days.length || days[days.length - 1][0] !== r[0]) days.push([r[0], []]); days[days.length - 1][1].push(r[1]); });
      b += K.sh("Binnenkort", "", "");
      days.forEach(function (d) { b += K.sh(dayName(d[0]), "", "small") + '<div class="pad">' + K.grp(d[1].map(function (it) { return crow(it, d[0], c.wl[it.id] ? '<span class="pill tint" style="--c:var(--gym)">Wachtlijst #' + c.wl[it.id] + "</span>" : ""); })) + "</div>"; });
    } else if (!up.length) b += '<div class="pad" style="margin-top:12px"><div class="card empty">Nog niets gepland.<div style="margin-top:14px">' + K.btn("Les boeken", { k: "sec", a: "c-atab", d: { v: "boeken" } }) + "</div></div></div>";
    return { title: "Home", body: b };
  };
  /* "Deze week" (owner, 5 Nov 2026: make this place motivating): only facts Fivvi has, no invented goals.
     The days of this week (went ✓, booked ○), how often so far and what's still planned, weeks in a row,
     and one highlight: a lift the trainer logged, or the month's count where nothing is logged. */
  function weekCard(up) {
    var mon = F.monday(F.NOW), went = {}, planned = {};
    attended().forEach(function (x) { for (var i = 0; i < 7; i++) { var d = F.add(mon, i); if (x.d.indexOf(d.getDate() + " " + F.MS[d.getMonth()]) >= 0 && F.key(d) < F.TODAY) went[i] = x.type; } });
    up.forEach(function (r) { var d = F.parse(r[0]), i = Math.round((d - mon) / 864e5); if (i >= 0 && i < 7 && went[i] == null) planned[i] = r[1].type; });
    var nw = Object.keys(went).length, np = Object.keys(planned).length;
    var days = [0, 1, 2, 3, 4, 5, 6].map(function (i) { var d = F.add(mon, i), k = F.key(d), st = went[i] != null ? "went" : planned[i] != null ? "planned" : "";
      return '<div class="c-wd' + (k === F.TODAY ? " today" : "") + '"><span>' + F.DS[d.getDay()] + '</span><i class="' + st + '" style="--c:' + F.CV[went[i] || planned[i] || "group"] + '">' + (st === "went" ? ic("check") : "") + "</i></div>"; }).join("");
    var L = F.HAS("priv") && F.PREF.setup !== "pilates" && D.lifts.anna, hl = "";
    if (L) { var l = L[0], v = l[1], dv = v[v.length - 1] - v[0]; hl = '<div class="c-hl">' + D.spark(v, "var(--accent)") + "<span><b>" + esc(l[0]) + " " + String(v[v.length - 1]).replace(".", ",") + " kg</b><small>+" + String(dv).replace(".", ",") + " kg in 8 weken</small></span></div>"; }
    else hl = '<div class="c-hl"><span class="c-hl-n num">' + (attended().length + 3) + "</span><span><b>keer in november</b><small>Zo vaak was je er deze maand</small></span></div>";
    return '<div class="card c-week"><div class="c-week-h"><div><span class="eb">Deze week</span>' + (nw || !np ? '<b class="num">' + nw + '<small>× geweest</small></b><em>' + (np ? (np === 1 ? "nog 1 gepland" : "nog " + np + " gepland") : "niets meer gepland") + "</em>"
      : '<b class="num">' + np + '<small>× gepland</small></b><em>De eerste: ' + dayName(up[0][0]).toLowerCase() + " " + up[0][1].s + "</em>") + '</div><span class="c-streak">🔥 5 weken op rij</span></div><div class="c-days7">' + days + "</div>" + hl + "</div>";
  }
  ATAB.boeken = function () { var c = C(), t = c.tab; c.tab = "rooster"; var p = CSTEP.app(); c.tab = t; return p; };
  /* Training: the workouts the trainer shared (F045, arrives with M7) */
  /* Activiteit (owner, 5 Nov 2026: not every studio calls it training): what the client did, for every kind of studio.
     Classes and sessions attended, a monthly count and weeks in a row; a workout the trainer shared opens with its details. */
  function attended() {
    var c = C(), out = [], hist = c.who === "anna" && F.HAS("priv") ? D.history.anna || [] : [];
    var pn = F.PREF.setup === "pilates" ? "Reformer privé" : null;
    hist.forEach(function (x, i) { out.push({ d: x.d, title: pn || x.name, sub: "met " + x.by, type: "priv", w: i }); });
    if (c.who === "anna" && (F.HAS("group") || F.HAS("gym"))) for (var i = 1, n = 0; i <= 21 && n < 4; i += 2) {
      var k = F.key(F.add(F.NOW, -i)), it = timetable(k).filter(function (x) { return x.type !== "priv" && !x.cancelled; })[n % 2];
      if (it) { out.push({ d: F.DS[F.parse(k).getDay()] + " " + F.parse(k).getDate() + " " + F.MS[F.parse(k).getMonth()], title: it.title, sub: it.type === "gym" ? "Zelf trainen" : cwho(it), type: it.type, k: k }); n++; }
    }
    /* newest first: "do 29 okt" and "29 okt" both sort by month and day */
    function when(x) { var m = /(\d+) (\w+)/.exec(x.d) || [0, 0, ""], mi = F.MS.indexOf(m[2]); return (mi < 0 ? 0 : mi) * 100 + +m[1]; }
    return out.sort(function (a, b) { return when(b) - when(a); });
  }
  ATAB.training = function () {
    var c = C(), xs = attended(), b = K.lt("", "Activiteit", "");
    if (!xs.length) return { title: "Activiteit", body: b + '<div class="pad"><div class="card empty">Hier zie je de lessen en sessies waar je bent geweest.</div></div>' };
    var wk = [1, 1, 0, 1, 1, 1, 1, 1];
    b += '<div class="pad"><div class="tiles two"><div class="tile c-tile" style="--c:var(--accent)"><span class="ink">November</span><b class="num">' + (xs.length + 3) + "</b><em>keer geweest</em></div>" +
      '<div class="tile c-tile" style="--c:var(--ok)"><span class="ink">Op rij</span><b class="num">5</b><em>weken achter elkaar</em><span class="wkdots" aria-hidden="true">' + wk.map(function (x) { return '<i class="' + (x ? "on" : "") + '"></i>'; }).join("") + "</span></div></div></div>";
    b += K.sh("Recent", "", "small") + '<div class="pad">' + K.grp(xs.map(function (x) {
      return K.row({ a: x.w != null ? "c-workout" : null, d: x.w != null ? { v: x.w } : null, lead: '<span class="dc-ic" style="--c:' + F.CV[x.type] + '">' + ic(x.w != null ? "dumb" : x.type === "gym" ? "door" : "group") + "</span>",
        title: esc(x.title), sub: esc(x.d) + " · " + esc(x.sub), tr: x.w != null ? '<span class="pill tint" style="--c:var(--accent)">Details</span>' : "", cls: "dc" });
    }), "--inset:60px") + "</div>" + K.foot("Wat je trainer met je deelt, open je hier met alle details.");
    return { title: "Activiteit", body: b };
  };
  ATAB.profiel = function () { return { title: "Profiel", body: profile() }; };
  /* Paying happens on the web (§53, QC16): the app opens the studio's offer page in a browser sheet */
  function browser() {
    var url = "fivvi.app/" + slug() + "/aanbod", offers = D.offerList.filter(function (o) { return o.on && offerFits(o) && o.kind !== "single" && !o.intro; });
    var bar = andr() ? '<div class="c-brbar"><button class="ib" data-a="c-webclose" aria-label="Sluiten">' + ic("x") + '</button><div><b>Aanbod</b><span translate="no">' + url + "</span></div></div>"
      : '<div class="c-brbar ios"><button class="c-done" data-a="c-webclose">Klaar</button><div class="c-url glass"><i>🔒</i><span translate="no">' + url + "</span></div></div>";
    return '<div class="scrim anim-fade" data-a="c-webclose"></div><div class="sheet large anim-up c-browser" role="dialog" aria-label="Aanbod">' + bar + '<div class="sbody">' +
      K.lt("", "Aanbod van " + esc(wsName()), "Kies wat bij je past. Je betaalt met iDEAL.") + '<div class="pad stack">' + offers.map(function (o) {
        return '<div class="card c-offer"><div><b>' + esc(o.name) + '</b><span class="num">€ ' + esc(o.price) + " <small>" + per(o.cycle) + "</small></span></div><ul>" + offerFacts(o).filter(function (t) { return t.indexOf("Verlengen") !== 0; }).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" + (o.memberOnly && !(C().who === "anna" && D.bsum("anna").abos.length) ? K.btn("Eerst een abonnement nodig", { k: "sec", blk: true, dis: true }) : K.btn("Kiezen", { blk: true, a: "c-buy", d: { v: o.name } })) + "</div>";
      }).join("") + "</div>" + K.foot("Na de betaling krijg je de factuur per e-mail en kun je meteen boeken.") + "</div></div>";
  }

  A["c-qbook"] = function (d) { var c = C(), it = F.findItem(d.id).it; c.booked[d.id] = true; F.toast("Geboekt: " + it.title + " " + it.s); };
  A["c-qwl"] = function (d) { var c = C(), it = F.findItem(d.id).it; it.waitlist = (it.waitlist || 0) + 1; c.wl[d.id] = it.waitlist; F.toast("Je staat op de wachtlijst: nummer " + it.waitlist); };
  A["c-atab"] = function (d) { var c = C(); c.atab = d.v; c.detail = null; c.workout = null; c.web = null; R(); };
  A["c-offers"] = function () { C().web = "offers"; R(); };
  A["c-webclose"] = function () { C().web = null; R(); };
  A["c-buy"] = function (d) { C().web = null; F.toast("Betaalpagina geopend: " + d.v + " met iDEAL"); };
  A["a-next"] = function () { var c = C(); if (!/.+@.+\..+/.test(c.email)) { c.err = { email: "Vul een geldig e-mailadres in" }; F.toast(c.err.email, "err"); return; } c.astep = "code"; c.code = ""; R(); };
  A["a-reset"] = function () { var c = C(); c.astep = "welcome"; c.code = ""; R(); };
  A["a-signin"] = function () { var c = C(); if (c.who === "anna") { c.astep = "app"; c.step = "app"; c.atab = "home"; } else c.astep = "nolink"; R(); };
  A["a-openlink"] = function () { C().astep = "join"; R(); };
  A["a-request"] = function () { var c = C(); if (!c.name.trim()) { c.err = { name: "Vul je naam in" }; F.toast(c.err.name, "err"); return; } c.astep = "waiting"; F.toast("Verzoek verstuurd"); };
  A["a-approved"] = function () { var c = C(); c.astep = "app"; c.step = "app"; c.atab = "home"; F.toast("Je bent goedgekeurd. Welkom!"); };
  A["a-signout"] = function () { var c = C(); c.astep = "welcome"; c.step = "link"; c.code = ""; c.detail = null; c.workout = null; R(); };
  A["a-delask"] = function () { C().dialog = "delete"; R(); };
  A["a-delete"] = function () { var s = S(); s.c = null; var c = C(); c.astep = "welcome"; F.toast("Je account is verwijderd"); };
  A["c-lang"] = function (d) { F.PREF.lang = d.v; F.save(); R(); };
  A["c-next"] = function () { var c = C(); if (!/.+@.+\..+/.test(c.email)) { c.err = { email: "Vul een geldig e-mailadres in" }; F.toast(c.err.email, "err"); return; } c.step = "code"; c.code = ""; R(); };
  A["c-reset"] = function () { var c = C(); c.step = "link"; c.code = ""; R(); };
  A["c-signin"] = function () { var c = C(); c.step = c.who === "anna" ? "app" : "request"; R(); };
  A["c-request"] = function () { var c = C(); if (!c.name.trim()) { c.err = { name: "Vul je naam in" }; F.toast(c.err.name, "err"); return; } c.step = "waiting"; F.toast("Verzoek verstuurd"); };
  A["c-approved"] = function () { var c = C(); c.step = "app"; c.tab = "rooster"; F.toast("Je bent goedgekeurd. Welkom!"); };
  A["c-tab"] = function (d) { var c = C(); c.tab = d.v; c.detail = null; c.workout = null; R(); };
  A["c-day"] = function (d) { C().day = d.v; R(); };
  A["c-filter"] = function (d) { C().filter = d.v; R(); };
  A["c-tfilter"] = function (d) { C().typeFilter = d.v; R(); };
  A["c-open"] = function (d) { C().detail = d.id; R(); };
  A["c-back"] = function () { var c = C(); c.detail = null; c.workout = null; R(); };
  A["c-book"] = function () { var c = C(); c.booked[c.detail] = true; F.toast("Geboekt. Je krijgt een bevestiging per e-mail."); };
  A["c-wl"] = function () { var c = C(), it = F.findItem(c.detail).it; it.waitlist = (it.waitlist || 0) + 1; c.wl[c.detail] = it.waitlist; F.toast("Je staat op de wachtlijst: nummer " + it.waitlist); };
  A["c-wl-leave"] = function () { var c = C(), it = F.findItem(c.detail).it; it.waitlist = Math.max(0, (it.waitlist || 1) - 1); delete c.wl[c.detail]; F.toast("Je staat niet meer op de wachtlijst"); };
  A["c-cancel"] = function () { C().dialog = true; R(); };
  A["c-dclose"] = function () { C().dialog = null; R(); };
  A["c-cancel-ok"] = function () { var c = C(); delete c.booked[c.detail]; c.dialog = null; F.toast("Geannuleerd"); };
  A["c-workout"] = function (d) { C().workout = +d.v; R(); };
  A["c-signout"] = function () { var s = S(); s.c = null; C().step = "link"; R(); };

  /* inputs on the web surfaces; returns true when handled */
  function clearErr(t, map) { var k = t.dataset.wf || t.dataset.cin; if (map && map[k]) { delete map[k]; var l = t.closest(".invalid"); if (l) { l.classList.remove("invalid"); var e = l.querySelector(".err"); if (e) e.remove(); } } }
  function onInput(t) {
    if (t.dataset.wrow) { var p = t.dataset.wrow.split(","); W().rows[+p[0]][+p[1]] = t.value; return true; }
    if (t.dataset.wf) { W().form[t.dataset.wf] = t.value; clearErr(t, W().err); if (t.dataset.wf === "kind" || t.dataset.wf === "end") R(); return true; }
    if (t.dataset.win === "q") { W().q = t.value; var el = document.getElementById("w-sr"); if (el) { el.innerHTML = searchResults(); if (window.FIVVI_I18N) window.FIVVI_I18N.apply(el, F.PREF.lang); } return true; }
    if (t.dataset.cin) {
      var c = C(), k = t.dataset.cin; clearErr(t, c.err);
      if (k === "code") { c.code = t.value.replace(/\D/g, "").slice(0, 6); t.value = c.code; var box = document.getElementById("ccode"); if (box) box.innerHTML = (c.code + "      ").slice(0, 6).split("").map(function (x, i) { return '<span class="' + (i === c.code.length ? "cur" : "") + '">' + esc(x.trim()) + "</span>"; }).join(""); var b = document.querySelector('[data-a="c-signin"],[data-a="a-signin"]'); if (b) b.disabled = c.code.length < 6; }
      else c[k] = t.value;
      return true;
    }
    return false;
  }
  function scrollSave(dev) { var el = dev.querySelector(".w-scroll,.c-body"); return el ? [el.className, el.scrollTop, W().page + (C().tab || "") + (C().detail || "")] : null; }
  function scrollRestore(dev, keep) { if (!keep) return; var el = dev.querySelector(".w-scroll,.c-body"); if (el && el.className === keep[0] && keep[2] === W().page + (C().tab || "") + (C().detail || "")) el.scrollTop = keep[1]; }
  window.FVW = { web: web, client: client, capp: capp, onInput: onInput, scrollSave: scrollSave, scrollRestore: scrollRestore };

  /* panel entries for rounds 2 and 3 */
  function goWeb(page, extra) { return function () { F.fresh(); F.PREF.plat = "web"; var w = W(); w.page = page; for (var k in extra || {}) w[k] = extra[k]; }; }
  function goClient(step, extra) {
    return function () {
      F.fresh(); F.PREF.plat = "client"; var c = C(); c.step = step; for (var k in extra || {}) c[k] = extra[k];
      /* Anna, an approved client, already has two classes booked in the coming days */
      /* and one of her private sessions this week is a duo with Noor */
      if (c.who === "anna") for (var j = 1, dd = false; j <= 7 && !dd; j++) F.dayItems(F.key(F.add(F.NOW, j))).forEach(function (it) { if (!dd && it.type === "priv" && it.client === "anna") { it.duo = "noor"; dd = true; } });
      if (c.who === "anna") { var n = 0; for (var i = 1; i <= 4 && n < 2; i++) timetable(F.key(F.add(F.NOW, i))).forEach(function (it) { if (n < 2 && it.type === "group" && it.people.length < it.cap) { c.booked[it.id] = true; n++; } }); }
    };
  }
  F.INDEX.push(["Trainer web", [
    ["Dashboard", "WC-01", goWeb("dashboard")],
    ["Mijn dag", "WC-01", goWeb("myday")],
    ["Agenda · week", "WC-02", goWeb("agenda", { view: "week" })],
    ["Agenda · dag per trainer", "WC-02", goWeb("agenda", { view: "day" })],
    ["Agenda · lijst", "WC-02", goWeb("agenda", { view: "list" })],
    ["Klanten", "TW-01", goWeb("clients")],
    ["Aanmeldverzoeken", "F029", goWeb("clients", { ctab: "req" })],
    ["Klantprofiel", "TW-02", goWeb("client", { cid: "anna" })],
    ["Lessen", "TW-03", goWeb("classes")],
    ["Les op datum", "CO-01", function () { F.fresh(); F.PREF.plat = "web"; var w = W(); w.page = "klass"; var t = F.dayItems(F.TODAY).filter(function (i) { return i.type === "group"; })[0]; w.kid = t ? t.id : null; }],
    ["Open Gym", "TW-04", goWeb("gym")],
    ["Trainingen", "TW-05", goWeb("workouts")],
    ["Trainers", "TW-06", goWeb("trainers")],
    ["Aanmeldlink en QR", "TW-07", goWeb("link")],
    ["Aanbod", "F052", goWeb("offers")],
    ["Instellingen", "TW-08", goWeb("settings")]
  ]]);
  /* the client app Fivvi: iOS unless the panel is on Android */
  function goApp(astep, extra, setup) {
    return function () {
      F.fresh(); F.PREF.app = "client"; if (F.PREF.plat !== "android") F.PREF.plat = "ios";
      var c = C(); c.astep = astep; for (var k in extra || {}) c[k] = extra[k];
      if (astep === "app") c.step = "app";
      if (c.who === "anna") { var n = 0; for (var i = 1; i <= 4 && n < 2; i++) timetable(F.key(F.add(F.NOW, i))).forEach(function (it) { if (n < 2 && it.type === "group" && it.people.length < it.cap) { c.booked[it.id] = true; n++; } }); }
      if (setup) setup(c);
    };
  }
  F.INDEX.push(["Fivvi (klant-app)", [
    ["Welkom en inloggen", "§55", goApp("welcome")],
    ["Nog geen studio", "§55", goApp("nolink", { email: "kim@example.com" })],
    ["Link geopend: meedoen", "#469", goApp("join", { email: "kim@example.com" })],
    ["Wachten op goedkeuring", "F029", goApp("waiting", { email: "kim@example.com", name: "Kim de Graaf" })],
    ["Home", "F033", goApp("app", { who: "anna", atab: "home" })],
    ["Boeken", "F027", goApp("app", { who: "anna", atab: "boeken" })],
    ["Les boeken", "F031", goApp("app", { who: "anna", atab: "boeken" }, function (c) { var t = F.dayItems(F.key(F.add(F.NOW, 1))).filter(function (i) { return i.type !== "priv" && i.people.length < i.cap && !c.booked[i.id]; })[0]; c.detail = t ? t.id : null; c.day = F.key(F.add(F.NOW, 1)); })],
    ["Geen credits: aanbod op het web", "F052", goApp("app", { who: "anna", atab: "boeken" }, function (c) { var t = timetable(F.key(F.add(F.NOW, 1))).filter(function (i) { return i.type === "gym"; })[0] || timetable(F.TODAY).filter(function (i) { return i.type === "gym"; })[0]; if (t) c.detail = t.id; else c.web = "offers"; })],
    ["Activiteit", "F045", goApp("app", { who: "anna", atab: "training" })],
    ["Gedeelde training", "F045", goApp("app", { who: "anna", atab: "training", workout: 0 })],
    ["Profiel en tegoed", "F033", goApp("app", { who: "anna", atab: "profiel" })],
    ["Account verwijderen", "§79", goApp("app", { who: "anna", atab: "profiel", dialog: "delete" })],
    ["Nieuwe klant zonder tegoed", "F033", goApp("app", { who: "new", name: "Kim de Graaf", email: "kim@example.com", atab: "home" })]
  ]]);
  F.INDEX.push(["Klantweb", [
    ["Meedoen via de link", "F029", goClient("link")],
    ["Wachten op goedkeuring", "F029", goClient("waiting", { name: "Kim de Graaf", email: "kim@example.com" })],
    ["Rooster", "F027", goClient("app", { who: "anna" })],
    ["Les boeken", "F031", function () { goClient("app", { who: "anna" })(); var t = F.dayItems(F.key(F.add(F.NOW, 1))).filter(function (i) { return i.type !== "priv" && i.people.length < i.cap && !C().booked[i.id]; })[0]; C().detail = t ? t.id : null; C().day = F.key(F.add(F.NOW, 1)); }],
    ["Wachtlijst", "F062", function () {
      goClient("app", { who: "anna" })();
      /* the next group class that is full; if none is, fill the next one so the waitlist shows */
      var t = null, day = F.TODAY;
      for (var i = 0; i <= 3 && !t; i++) { day = F.key(F.add(F.NOW, i)); t = timetable(day).filter(function (x) { return x.type === "group" && !F.isPast(x, day) && !C().booked[x.id]; })[0] || null; }
      if (t) { while (t.people.length < t.cap) t.people.push("guest" + t.people.length); t.waitlist = t.waitlist || 2; C().detail = t.id; C().day = day; }
    }],
    ["Mijn agenda", "F033", goClient("app", { who: "anna", tab: "agenda" })],
    ["Profiel en tegoed", "F033", goClient("app", { who: "anna", tab: "profiel" })],
    ["Gedeelde training", "F045", goClient("app", { who: "anna", tab: "profiel", workout: 0 })]
  ]]);
})();
