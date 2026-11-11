/* Round 9, F045 Workout History (owner, 11 Nov 2026): a logged workout on the trainer web, and what the client sees of it.
   Any owner or trainer of the workspace can correct, delete, share or stop sharing any logged workout; it keeps showing who logged it.
   The logged workouts are D.history (data.js), shared with Fivvi Pro and the client app and web. The English is in i18n.js. */
(function () {
  "use strict";
  var F = window.FV, X = window.FVW.x, D = F.D, esc = F.esc, ic = F.ic, W = X.W, card = X.card, btn = X.btn, badge = X.badge, fld = X.fld, selF = X.selF, av = X.av, PAGES = X.PAGES, DLG = X.DLG, OK = X.DLGOK, A = F.A, R = X.R;
  function p(s, cls) { return "<p" + (cls ? ' class="' + cls + '"' : "") + ">" + s + "</p>"; }
  function fn(cid) { return F.CLIENT[cid].name.split(" ")[0]; }
  function entry(cid, i) { return F.hist(cid)[i]; }
  /* the unit text around each value of a set, per exercise type: [placeholder label, text after] */
  var COLS = { wr: [["gewicht (kg)", "kg"], ["herhalingen", "herh."]], r: [["herhalingen", "herh."]], t: [["minuten", ":"], ["seconden", ""]], dt: [["afstand (m)", "m"], ["minuten", ":"], ["seconden", ""]] };

  PAGES.workout = function () {
    var w = W(), cid = w.wcid, h = entry(cid, w.wi), c = F.CLIENT[cid];
    if (!h) { w.page = "client"; w.cid = cid; return PAGES.client(); }
    var f = fn(cid), ed = w.wedit && w.wedit.cid === cid && w.wedit.i === w.wi, out = "";
    var acts = ed ? btn("Annuleren", "w-wk-cancel", { k: "outline" }) + btn("Opslaan", "w-wk-save", { i: "check" }) :
      (h.shared ? btn("Niet meer delen", "w-wk-unshare", { k: "outline", i: "lock" }) : btn("Delen met " + esc(f), "w-wk-share", { k: "outline", i: "share" })) + btn("Wijzigen", "w-wk-edit", { k: "outline", i: "pencil" }) + btn("Training verwijderen", "w-wk-del", { k: "dng", i: "trash" });
    out += '<div class="w-phead">' + av(c.name, c.c).replace("w-av", "w-av lg") + "<div><h2>" + esc(h.name) + "</h2><p>" + esc(c.name) + " · " + esc(h.d) + ' · Gelogd door <span translate="no">' + esc(h.by) + "</span></p></div>" + '<div class="w-hgroup end">' + acts + "</div></div>";
    out += card("", '<div class="w-wk-status">' + ic(h.shared ? "share" : "lock") + "<div><b>" + (h.shared ? "Gedeeld met " + esc(f) + " · " + esc(h.shared) : "Niet gedeeld met " + esc(f)) + "</b>" + p(h.shared ? esc(f) + " ziet deze training bij Activiteit." : esc(f) + " ziet deze training niet.", "w-muted") + "</div></div>");
    if (ed) {
      var ex = w.wedit.ex, left = D.library.filter(function (l) { return ex.every(function (e) { return e.name !== l.n; }); });
      out += ex.map(function (e, ei) {
        var cols = COLS[e.ty];
        return card(esc(e.name), e.sets.map(function (s, si) {
            return '<div class="w-wk-set"><span class="w-wk-n">' + (si + 1) + '</span><span class="vals">' + cols.map(function (x, vi) { return '<input class="w-input sm" data-wset="' + ei + "," + si + "," + vi + '" inputmode="decimal" value="' + esc(s.v[vi]) + '" aria-label="' + esc(e.name) + ", set " + (si + 1) + ", " + x[0] + '"><span class="w-muted">' + x[1] + "</span>"; }).join("") + "</span>" +
              '<button class="w-icon" data-a="w-wk-setdel" data-e="' + ei + '" data-s="' + si + '" aria-label="Set ' + (si + 1) + " van " + esc(e.name) + ' verwijderen"' + (e.sets.length < 2 ? " disabled" : "") + ">" + ic("x") + "</button></div>";
          }).join("") + '<div class="w-hgroup" style="margin-top:10px">' + btn("Set toevoegen", "w-wk-setadd", { k: "outline sm", i: "plus", d: { e: ei } }) + "</div>",
        { desc: e.sets.length + (e.sets.length === 1 ? " set" : " sets"), act: '<div class="w-hgroup"><div class="w-wk-diff" role="group" aria-label="Hoe ging het?">' + [["e", "😌", "Makkelijk"], ["n", "🙂", "Normaal"], ["h", "🥵", "Zwaar"]].map(function (x) { return '<button class="' + (e.diff === x[0] ? "on" : "") + '" data-a="w-wk-diff" data-e="' + ei + '" data-v="' + x[0] + '" aria-label="' + x[2] + '" aria-pressed="' + (e.diff === x[0]) + '" title="' + x[2] + '"><span aria-hidden="true">' + x[1] + "</span></button>"; }).join("") + "</div>" + btn("Oefening verwijderen", "w-wk-exdel", { k: "ghost sm", d: { e: ei } }) + "</div>" });
      }).join("");
      out += card("", '<div class="w-hgroup">' + (left.length ? '<select class="w-input" data-wf="wkex" aria-label="Oefening">' + left.map(function (l, li) { return '<option value="' + esc(l.n) + '"' + ((w.form.wkex ? w.form.wkex === l.n : li === 0) ? " selected" : "") + ">" + esc(l.n) + "</option>"; }).join("") + "</select>" : "") + btn("Oefening toevoegen", "w-wk-exadd", { k: "outline", i: "plus", dis: !left.length }) + "</div>");
      out += p(h.shared ? esc(f) + " ziet de wijziging meteen bij Activiteit. Er gaat geen nieuwe e-mail uit." : "Alleen jij en je collega-trainers zien deze training.", "w-muted");
    } else {
      var sets = h.sets || [];
      out += card("Oefeningen", sets.length ? '<ul class="w-last">' + sets.map(function (x) { return "<li><b>" + esc(x[0]) + '</b><span class="w-tnum">' + esc(x[1]) + "</span>" + (x[2] ? '<span class="w-diff" role="img" aria-label="' + D.DIFF[x[2]][1] + '" title="' + D.DIFF[x[2]][1] + '">' + D.DIFF[x[2]][0] + "</span>" : "<span></span>") + "</li>"; }).join("") + "</ul>" : '<p class="w-muted">Geen oefeningen gelogd.</p>', { desc: (h.dur ? h.dur + " · " : "") + h.n + " oefeningen" });
      if (h.note) out += card("Notitie", '<p class="w-note" translate="no">' + ic("note") + "<span>" + esc(h.note) + "</span></p>", { desc: "Alleen voor trainers" });
      out += p("Elke eigenaar of trainer in je werkruimte kan deze training wijzigen, verwijderen en delen.", "w-muted");
    }
    return '<div class="w-wk">' + out + "</div>";
  };

  /* ---------- actions ---------- */
  A["w-workout"] = function (d) { var w = W(); w.wcid = d.id; w.wi = +d.i; w.wedit = null; w.dialog = null; w.page = "workout"; R(); };
  A["w-workout-back"] = function () { var w = W(); w.page = "client"; w.cid = w.wcid; w.tab = "workouts"; w.wedit = null; w.dialog = null; R(); };
  A["w-wk-share"] = function () { var w = W(); F.wkShare(entry(w.wcid, w.wi)); F.toast("Gedeeld met " + fn(w.wcid)); };
  function ask(n) { return function (d) { var w = W(); w.err = {}; w.dialog = { n: n, c: w.wcid, i: w.wi, e: d && d.e != null ? +d.e : undefined, s: d && d.s != null ? +d.s : undefined }; R(); }; }
  A["w-wk-unshare"] = ask("wk-unshare");
  A["w-wk-del"] = ask("wk-del");
  A["w-wk-setdel"] = ask("wk-setdel");
  A["w-wk-exdel"] = ask("wk-exdel");
  /* correcting: the draft lives in w.wedit until Opslaan, so Annuleren changes nothing */
  function startEdit(cid, i) { var w = W(); w.wcid = cid; w.wi = i; w.page = "workout"; w.wedit = { cid: cid, i: i, ex: (entry(cid, i).sets || []).map(F.parseHist) }; w.form = {}; }
  A["w-wk-edit"] = function () { var w = W(); startEdit(w.wcid, w.wi); R(); };
  A["w-wk-cancel"] = function () { var w = W(); w.wedit = null; R(); };
  A["w-wk-save"] = function () {
    var w = W(), ed = w.wedit; if (!ed.ex.length) { F.toast("Een training heeft minstens één oefening", "err"); return; }
    var h = entry(ed.cid, ed.i); h.sets = ed.ex.map(F.fmtHist); h.n = ed.ex.length; w.wedit = null; F.toast("Training opgeslagen");
  };
  A["w-wk-diff"] = function (d) { W().wedit.ex[+d.e].diff = d.v; R(); };
  A["w-wk-setadd"] = function (d) { var e = W().wedit.ex[+d.e]; e.sets.push({ v: e.sets[e.sets.length - 1].v.slice(), done: false }); R(); };
  A["w-wk-exadd"] = function () { var w = W(), ex = w.wedit.ex, left = D.library.filter(function (l) { return ex.every(function (e) { return e.name !== l.n; }); }), pick = left.filter(function (l) { return l.n === w.form.wkex; })[0] || left[0]; if (!pick) return; ex.push(F.mkEx(pick)); w.form.wkex = ""; R(); };

  /* ---------- confirmations, as in Fivvi Pro ---------- */
  DLG["wk-unshare"] = function (d) { var f = fn(d.c); return { t: "Niet meer delen met " + f + "?", ok: "Niet meer delen", kind: "dng", cancel: "Terug", b: p(esc(f) + " ziet deze training niet meer bij Activiteit. De e-mail die " + esc(f) + " al kreeg, blijft verstuurd. Deel je de training later opnieuw, dan krijgt " + esc(f) + " weer een e-mail.") }; };
  OK["wk-unshare"] = function (f, d) { F.wkUnshare(entry(d.c, d.i)); return "Niet meer gedeeld met " + fn(d.c); };
  DLG["wk-del"] = function (d) { var h = entry(d.c, d.i), f = fn(d.c); return { t: "Training van " + F.dateOnly(h.d) + " verwijderen?", ok: "Verwijderen", kind: "dng", cancel: "Terug", b: p(h.shared ? "Deze training is voorgoed weg. " + esc(f) + " ziet de training ook niet meer bij Activiteit. De e-mail die " + esc(f) + " al kreeg, blijft verstuurd. Je kunt dit niet ongedaan maken." : "Deze training is voorgoed weg. Je kunt dit niet ongedaan maken.") }; };
  OK["wk-del"] = function (f, d) { var w = W(); F.wkDelete(d.c, entry(d.c, d.i)); w.page = "client"; w.cid = d.c; w.tab = "workouts"; w.wedit = null; return "Training verwijderd"; };
  DLG["wk-setdel"] = function (d) { var e = W().wedit.ex[d.e]; return { t: "Set " + (d.s + 1) + " verwijderen?", ok: "Verwijderen", kind: "dng", cancel: "Terug", b: p(esc(e.name) + " houdt " + (e.sets.length - 1) + (e.sets.length - 1 === 1 ? " set" : " sets") + ".") }; };
  OK["wk-setdel"] = function (f, d) { W().wedit.ex[d.e].sets.splice(d.s, 1); return "Set verwijderd"; };
  DLG["wk-exdel"] = function (d) { var e = W().wedit.ex[d.e]; return { t: e.name + " verwijderen?", ok: "Verwijderen", kind: "dng", cancel: "Terug", b: p(e.sets.length === 1 ? "De enige set van " + esc(e.name) + " gaat uit deze training." : (e.sets.length === 2 ? "Beide" : "Alle " + e.sets.length) + " sets van " + esc(e.name) + " gaan uit deze training.") }; };
  OK["wk-exdel"] = function (f, d) { W().wedit.ex.splice(d.e, 1); return "Oefening verwijderd"; };

  /* ---------- panel ---------- */
  var go = X.goWeb;
  function wk(extra, edit) { var g = go("workout", Object.assign({ wcid: "anna", wi: 0 }, extra || {})); return function () { g(); if (edit) { startEdit("anna", 0); if (edit.dialog) W().dialog = edit.dialog; } }; }
  var web = F.INDEX.filter(function (g) { return g[0] === "Trainer web"; })[0][1], at = web.map(function (x) { return x[0]; }).indexOf("Klantprofiel: schema's") + 1;
  web.splice(at, 0,
    ["Klantprofiel › Trainingen: gedeeld en niet gedeeld", "F045", go("client", { cid: "anna", tab: "workouts" })],
    ["Training: gedeeld", "F045", wk()],
    ["Training: niet gedeeld", "F045", wk({ wi: 2 })],
    ["Training wijzigen", "F045", wk({}, {})],
    ["Training wijzigen: set verwijderen", "F045", wk({}, { dialog: { n: "wk-setdel", c: "anna", i: 0, e: 0, s: 1 } })],
    ["Training wijzigen: oefening verwijderen", "F045", wk({}, { dialog: { n: "wk-exdel", c: "anna", i: 0, e: 1 } })],
    ["Niet meer delen", "F045", wk({ dialog: { n: "wk-unshare", c: "anna", i: 0 }, form: {} })],
    ["Training verwijderen: gedeeld", "F045", wk({ dialog: { n: "wk-del", c: "anna", i: 0 }, form: {} })],
    ["Training verwijderen: niet gedeeld", "F045", wk({ wi: 2, dialog: { n: "wk-del", c: "anna", i: 2 }, form: {} })]);

  /* the client sees the same list: stopped sharing, deleted and corrected (the client app, then the client web) */
  function after(g, what) { return function () { g(); what(); }; }
  var unshare = function () { F.wkUnshare(entry("anna", 0)); }, del = function () { F.wkDelete("anna", entry("anna", 0)); },
    fix = function () { var h = entry("anna", 0); h.sets = h.sets.map(function (s) { return s[0] === "Bankdrukken" ? ["Bankdrukken", "62,5 kg × 8, 8, 8", "n"] : s; }); };
  function addTo(name, list) { var g = F.INDEX.filter(function (x) { return x[0] === name; })[0][1], i = g.map(function (x) { return x[0]; }).indexOf("Gedeelde training") + 1; g.splice.apply(g, [i, 0].concat(list)); }
  addTo("Fivvi (klant-app)", [
    ["Activiteit: training niet meer gedeeld", "F045", after(X.goApp("app", { who: "anna", atab: "training" }), unshare)],
    ["Activiteit: training verwijderd", "F045", after(X.goApp("app", { who: "anna", atab: "training" }), del)],
    ["Gedeelde training: gecorrigeerd", "F045", after(X.goApp("app", { who: "anna", atab: "training", workout: 0 }), fix)]]);
  addTo("Klantweb", [
    ["Mijn trainingen: training niet meer gedeeld", "F045", after(X.goClient("app", { who: "anna", tab: "profiel" }), unshare)],
    ["Gedeelde training: gecorrigeerd", "F045", after(X.goClient("app", { who: "anna", tab: "profiel", workout: 0 }), fix)]]);
})();
